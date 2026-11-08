//! # Boundora
//!
//! Competitive gesture cycles on NEAR.
//!
//! * Every player must hold one **Boundora Pass** to play (soulbound: one per account,
//!   never transferable or sellable). It costs a fixed USD amount ($5 by default), charged
//!   in NEAR at the current NEAR/USD rate from the price keeper (Pyth). Players can also
//!   lock an NFT from a
//!   whitelisted NEP-171 collection. Max 2 passes per account; each pass or locked
//!   NFT raises how much NEAR you may stake per gesture (up to 3x).
//! * A **gesture** pays native NEAR into the cycle pool and pushes the clock back.
//!   Each gesture also stirs the cycle's seed, so the art at the end is shaped by
//!   everyone who played.
//! * When the clock hits zero anyone can call `finalize` (the next gesture does it
//!   too). Winners are credited NEAR they can `claim` and receive **Boundora Heroes**.
//! * **Boundora Heroes** are a fixed collection of 20,000 NFTs (NEP-171, tradeable):
//!   8,400 Common, 5,600 Rare, 3,400 Epic, 1,800 Legendary, 800 Mythic. Every hero's
//!   rarity and traits are fixed by its number, so the full collection is known in
//!   advance. Heroes come from public mint (`mint_hero`) or from winning rounds.
//! * Heroes do something: `equip_hero` applies the hero's power to every gesture you
//!   make (more clock time, cheaper strikes or a higher stake cap) for as long as you
//!   own it. Resales pay a royalty (NEP-199).
//! * Heroes are **dynamic** and **hold money**. The equipped hero earns XP on every strike
//!   and every award (level L needs 40·(L-1)² XP; every 3 levels add +1 s per strike). It
//!   also keeps its own NEAR vault: 10% of each cash award its owner wins and 40% of the
//!   royalty every time it is resold. The vault travels with the NFT; only the current
//!   owner can `claim_hero_vault`. `nft_token` reports level, XP and vault live.
//! * Heroes **carry inventory**: up to 3 gear items (Frost Cloak, Ember Charm, Snow Owl,
//!   Aurora Gem) that boost the hero and travel with it. Winners' heroes find gear; owners
//!   can `buy_gear` and `move_gear` between their own heroes.
//! * Heroes can **become accounts**: `open_hero_account` creates the sub-account
//!   `hero-N.<contract>` with a tiny contract (`vault/`) that only this contract can move NEAR
//!   out of, for the hero's current owner. The hero's vault NEAR then lives on-chain in its
//!   own account.
//! * The **pass is a soulbound NEP-171 token** (`pass-<account>`): transfers, approvals,
//!   listings and bids are refused. Its metadata is a live membership record.
//! * A built-in **hero market**: `list_hero`, `delist_hero`, `buy_hero`. The royalty on
//!   every sale goes to the treasury. Passes can never be listed.
//! * **Bids and auctions**: anyone can bid on any minted hero (NEAR held in escrow). The
//!   owner accepts whichever bid they like (`accept_bid`), or runs a timed auction
//!   (`start_auction`) that sells automatically to the highest bidder (`settle_auction`).
//!
//! Payout (basis points, configurable):
//! final gesture 35% + Legendary hero (5% chance Mythic) · endurance 20% + Epic hero
//! · top-3 volume 25% split + Rare hero each · rollover 15% · treasury 5%
//! · 2 Common heroes raffled among everyone else who played.

use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenReceiver, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableMap, IterableSet, LookupMap, Vector};
use near_sdk::{
    assert_one_yocto, env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::HashMap;

const MS: u64 = 1_000_000; // nanoseconds per millisecond

/// Collection size and the rarity schedule. Hero index n (0-based) has schedule
/// position p = (A·n + B) mod SUPPLY; p falls in one rarity band. Because the map is a
/// permutation, the counts per rarity are exact and anyone can recompute any hero.
pub const SUPPLY: u64 = 20_000;
const PERM_A: u64 = 7919;
const PERM_A_INV: u64 = 17679;
const PERM_B: u64 = 3571;
/// [start, end) of each rarity band in schedule positions: Common..Mythic.
const BANDS: [(u64, u64); 5] = [(11_600, 20_000), (6_000, 11_600), (2_600, 6_000), (800, 2_600), (0, 800)];
const BPS: u128 = 10_000;
/// Hero XP: earned by the equipped hero on every strike and on every award its owner wins.
const XP_STRIKE: u64 = 10;
const XP_FINAL: u64 = 120;
const XP_ENDURANCE: u64 = 80;
const XP_VOLUME: u64 = 50;
const XP_RAFFLE: u64 = 20;
const XP_PER_LEVEL_STEP: u64 = 40;
const MAX_LEVEL: u32 = 50;
/// Every 3 levels above 1 adds a second to the clock on each strike (up to 10 s).
const LEVEL_BONUS_EVERY: u32 = 3;
const LEVEL_BONUS_MS: u64 = 1_000;
const LEVEL_BONUS_CAP_MS: u64 = 10_000;
/// Share of a winner's cash award that goes into their equipped hero's own vault.
const HERO_POT_BPS: u128 = 1_000;
/// Share of each market royalty that goes into the sold hero's own vault.
const HERO_ROYALTY_SHARE_BPS: u128 = 4_000;

/// Level for an XP total: level L needs 40·(L-1)² XP.
pub fn level_for_xp(xp: u64) -> u32 {
    let steps = xp / XP_PER_LEVEL_STEP;
    // integer square root, capped well past MAX_LEVEL so nothing overflows
    let (mut lo, mut hi) = (0u64, MAX_LEVEL as u64);
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        if mid * mid <= steps { lo = mid } else { hi = mid - 1 }
    }
    ((lo + 1) as u32).min(MAX_LEVEL)
}

pub fn xp_for_level(level: u32) -> u64 {
    let l = (level.max(1) - 1) as u64;
    XP_PER_LEVEL_STEP * l * l
}

fn level_bonus_ms(level: u32) -> u64 {
    (((level.max(1) - 1) / LEVEL_BONUS_EVERY) as u64 * LEVEL_BONUS_MS).min(LEVEL_BONUS_CAP_MS)
}

fn gear_power(gear: &[u8]) -> (u64, u32, u32) {
    gear.iter().fold((0, 0, 0), |(ms, d, c), g| {
        let x = GEAR[*g as usize];
        (ms + x.2, d + x.3, c + x.4)
    })
}

fn gear_xp_bonus(gear: &[u8]) -> u64 {
    gear.iter().map(|g| GEAR[*g as usize].5).sum()
}

fn gear_effect_text(item: u8) -> String {
    ["+2 s per strike", "Strikes cost 5% less", "+50% XP", "+1 chi"][item as usize].into()
}

fn finish_name(best: u8) -> &'static str {
    ["none yet", "raffle", "chi master", "iron stance", "final strike"][best.min(4) as usize]
}

/// `hero-N.<this contract>`: the hero's own NEAR sub-account.
fn hero_account_id(token_id: &str) -> AccountId {
    format!("{}.{}", token_id, env::current_account_id()).parse().unwrap_or_else(|_| env::panic_str("Bad hero account id"))
}

/// Hero gear. Items belong to the hero (its inventory), not to the wallet, so they move
/// with every sale. [name, price in milliNEAR, extra ms per strike, discount bps, extra chi, XP bonus %]
pub const GEAR: [(&str, u128, u64, u32, u32, u64); 4] = [
    ("Frost Cloak", 500, 2_000, 0, 0, 0),
    ("Ember Charm", 800, 0, 500, 0, 0),
    ("Snow Owl", 500, 0, 0, 0, 50),
    ("Aurora Gem", 3_000, 0, 0, 1, 0),
];
pub const GEAR_SLOTS: usize = 3;

/// The soulbound membership pass is a NEP-171 token too: `pass-<account>`.
const PASS_PREFIX: &str = "pass-";

/// The code that runs in every hero account (`hero-N.<this contract>`). CI builds it from
/// `vault/` and copies it here before building this contract; the committed file is a
/// placeholder, and hero accounts stay switched off until the real wasm is in place.
const HERO_ACCOUNT_WASM: &[u8] = include_bytes!("../../vault/res/vault.wasm");
const HERO_ACCOUNT_EXTRA: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR on top of code storage
const GAS_FOR_HERO_ACCOUNT_INIT: Gas = Gas::from_tgas(20);
const GAS_FOR_HERO_ACCOUNT_CALLBACK: Gas = Gas::from_tgas(15);
const GAS_FOR_HERO_WITHDRAW: Gas = Gas::from_tgas(15);

const GAS_FOR_NFT_TRANSFER: Gas = Gas::from_tgas(25);
const GAS_FOR_UNLOCK_CALLBACK: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    ArtOwners,
    ArtMetadata,
    ArtEnumeration,
    ContractMetadata,
    Passes,
    Locks,
    Collections,
    Claimable,
    History,
    ArtApprovals,
    Equipped,
    HeroMints,
    Listings,
    Sales,
    Bids,
    BidTokens,
    Auctions,
    HeroStats,
    PassStats,
}

// ---------------------------------------------------------------- types

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    /// Clock length when a cycle opens.
    pub initial_duration_ms: U64,
    /// Time added by every gesture.
    pub extension_ms: U64,
    /// The clock can never show more than this much time remaining.
    pub max_remaining_ms: U64,
    /// Pause between one cycle ending and the next opening.
    pub cooldown_ms: U64,
    /// Price of the first gesture in a cycle (yoctoNEAR).
    pub base_cost: U128,
    /// Each gesture raises the next one's price by this many basis points of base cost.
    pub cost_step_bps: u32,
    /// Passes count toward the stake multiplier up to this cap.
    pub max_multiplier: u32,
    /// Price of the soulbound Boundora Pass in US cents (500 = $5), charged in NEAR.
    pub pass_price_usd_cents: u32,
    /// The NEAR/USD rate is considered stale after this long; passes can't be minted then.
    pub price_max_age_ms: U64,
    /// How far under the quote a payment may be (bps), to absorb price moves while signing.
    pub price_tolerance_bps: u32,
    pub max_passes_per_account: u32,
    pub max_players_per_cycle: u32,
    pub final_bps: u32,
    pub endurance_bps: u32,
    pub volume_bps: u32,
    pub rollover_bps: u32,
    pub treasury_bps: u32,
    pub volume_winners: u32,
    pub art_final: u32,
    pub art_endurance: u32,
    pub art_volume: u32,
    pub art_raffle: u32,
    /// Chance (bps) that the final-gesture award is Mythic instead of Legendary.
    pub mythic_chance_bps: u32,
    /// Royalty paid to the owner account on every hero resale (bps).
    pub royalty_bps: u32,
    /// Public mint price of one hero (yoctoNEAR).
    pub hero_price: U128,
    pub max_hero_mints_per_account: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            initial_duration_ms: U64(10 * 60 * 1000),
            extension_ms: U64(60 * 1000),
            max_remaining_ms: U64(15 * 60 * 1000),
            cooldown_ms: U64(60 * 1000),
            base_cost: U128(NearToken::from_millinear(100).as_yoctonear()),
            cost_step_bps: 200,
            max_multiplier: 3,
            pass_price_usd_cents: 500,
            price_max_age_ms: U64(6 * 60 * 60 * 1000),
            price_tolerance_bps: 100,
            max_passes_per_account: 1,
            max_players_per_cycle: 150,
            final_bps: 3500,
            endurance_bps: 2000,
            volume_bps: 2500,
            rollover_bps: 1500,
            treasury_bps: 500,
            volume_winners: 3,
            art_final: 1,
            art_endurance: 1,
            art_volume: 1,
            art_raffle: 2,
            mythic_chance_bps: 500,
            royalty_bps: 500,
            hero_price: U128(NearToken::from_near(2).as_yoctonear()),
            max_hero_mints_per_account: 5,
        }
    }
}

impl Config {
    fn assert_valid(&self) {
        let sum = self.final_bps
            + self.endurance_bps
            + self.volume_bps
            + self.rollover_bps
            + self.treasury_bps;
        require!(sum as u128 == BPS, "Payout shares must add up to 10000 bps");
        require!(self.max_multiplier >= 1, "max_multiplier must be at least 1");
        require!(self.volume_winners >= 1, "volume_winners must be at least 1");
        require!(self.mythic_chance_bps as u128 <= BPS, "mythic_chance_bps too high");
        require!(self.royalty_bps <= 2500, "royalty_bps above 25%");
        require!(self.pass_price_usd_cents > 0, "Pass price must be above zero");
        require!(self.price_tolerance_bps <= 1000, "price_tolerance_bps above 10%");
        require!(
            self.max_remaining_ms.0 >= self.extension_ms.0,
            "max_remaining_ms must be at least extension_ms"
        );
    }
}

/// Hero rarity. Rarity sets the hero's power, gear tier and frame.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Rarity {
    Common,
    Rare,
    Epic,
    Legendary,
    Mythic,
}

impl Rarity {
    pub const ALL: [Rarity; 5] = [Rarity::Common, Rarity::Rare, Rarity::Epic, Rarity::Legendary, Rarity::Mythic];
    pub fn idx(&self) -> usize {
        *self as usize
    }
    pub fn name(&self) -> &'static str {
        ["Common", "Rare", "Epic", "Legendary", "Mythic"][self.idx()]
    }
    pub fn supply(&self) -> u64 {
        let (a, b) = BANDS[self.idx()];
        b - a
    }
    /// (extra clock ms per gesture, cost discount bps, extra stake multiplier)
    pub fn power(&self) -> (u64, u32, u32) {
        [(1_000, 0, 0), (3_000, 0, 0), (0, 1_000, 0), (0, 0, 1), (3_000, 1_500, 1)][self.idx()]
    }
    pub fn power_text(&self) -> &'static str {
        [
            "Flare: your strikes add 1s more",
            "Long watch: your strikes add 3s more",
            "Shatter: your strikes cost 10% less",
            "Forgefire: +1 chi, stake one more multiple",
            "Aurora: +1 chi, strikes cost 15% less and add 3s more",
        ][self.idx()]
    }
}

/// Rarity of hero index n (0-based).
pub fn rarity_of_index(n: u64) -> Rarity {
    let p = (PERM_A * n + PERM_B) % SUPPLY;
    for r in Rarity::ALL {
        let (a, b) = BANDS[r.idx()];
        if p >= a && p < b {
            return r;
        }
    }
    unreachable!()
}

/// The k-th hero index (0-based) of a rarity in schedule order.
fn index_for(r: Rarity, k: u64) -> u64 {
    let p = BANDS[r.idx()].0 + k;
    (PERM_A_INV * ((p + SUPPLY - PERM_B) % SUPPLY)) % SUPPLY
}

fn index_of_token(token_id: &str) -> Option<u64> {
    token_id.strip_prefix("hero-")?.parse::<u64>().ok().filter(|n| *n >= 1 && *n <= SUPPLY).map(|n| n - 1)
}

#[near(serializers = [json])]
pub struct PassQuote {
    pub usd_cents: u32,
    /// NEAR price in millionths of a dollar (3_710_000 = $3.71).
    pub near_usd_micro: U64,
    /// What mint_pass charges right now, in yoctoNEAR.
    pub price: U128,
    pub updated_at: U64,
    pub fresh: bool,
    pub keeper: AccountId,
}

#[near(serializers = [json])]
pub struct HeroView {
    pub token_id: TokenId,
    pub number: u64,
    pub rarity: Rarity,
    pub power: String,
    pub level: u32,
    pub vault: U128,
}

/// What a hero has done and holds. Lives with the token, not the owner: it moves with
/// every sale or transfer.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct HeroStats {
    pub xp: u64,
    pub strikes: u32,
    pub wins: u32,
    /// NEAR held by the hero itself (yoctoNEAR). Only the current owner can claim it.
    pub vault: u128,
    /// Everything the hero has ever earned into its vault (yoctoNEAR).
    pub lifetime_earned: u128,
    /// Inventory: gear item ids (see `GEAR`), at most `GEAR_SLOTS`.
    pub gear: Vec<u8>,
    /// The hero has its own NEAR sub-account and its vault NEAR is held there.
    pub account_open: bool,
    pub account_pending: bool,
}

/// Membership record behind the soulbound pass token.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct PassStats {
    pub joined_at_ms: u64,
    pub joined_cycle: u64,
    pub rounds: u32,
    pub strikes: u32,
    pub wins: u32,
    /// Best finish: 0 none, 1 raffle, 2 chi master, 3 iron stance, 4 final strike.
    pub best_finish: u8,
    pub last_cycle: u64,
}

#[near(serializers = [json])]
pub struct PassCardView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub soulbound: bool,
    pub stats: PassStats,
    pub best_finish: String,
}

#[near(serializers = [json])]
pub struct GearView {
    pub id: u8,
    pub name: String,
    pub price: U128,
    pub effect: String,
}

#[near(serializers = [json])]
pub struct HeroStatsView {
    pub token_id: TokenId,
    pub number: u64,
    pub rarity: Rarity,
    pub owner_id: Option<AccountId>,
    pub level: u32,
    pub xp: U64,
    pub level_xp: U64,
    pub next_level_xp: Option<U64>,
    pub strikes: u32,
    pub wins: u32,
    pub vault: U128,
    pub lifetime_earned: U128,
    /// Extra clock time per strike from this hero's level, on top of its rarity power.
    pub level_bonus_ms: U64,
    pub gear: Vec<String>,
    /// The hero's own NEAR account, once opened.
    pub account_id: Option<AccountId>,
    pub account_pending: bool,
}

#[near(serializers = [json])]
pub struct SupplyView {
    pub total: u64,
    pub minted: u64,
    /// Minted per rarity, Common..Mythic.
    pub minted_by_rarity: Vec<u64>,
    pub supply_by_rarity: Vec<u64>,
    pub price: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
    pub listed_at: U64,
}

#[near(serializers = [json])]
pub struct ListingView {
    pub token_id: TokenId,
    pub number: u64,
    pub rarity: Rarity,
    pub seller: AccountId,
    pub price: U128,
    pub listed_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Sale {
    pub token_id: TokenId,
    pub seller: AccountId,
    pub buyer: AccountId,
    pub price: U128,
    pub royalty: U128,
    pub at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bid {
    pub bidder: AccountId,
    pub amount: U128,
    pub at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Auction {
    pub seller: AccountId,
    pub ends_at: U64,
    pub reserve: U128,
}

#[near(serializers = [json])]
pub struct AuctionView {
    pub token_id: TokenId,
    pub number: u64,
    pub rarity: Rarity,
    pub seller: AccountId,
    pub ends_at: U64,
    pub reserve: U128,
    pub highest: Option<Bid>,
    pub bids: u32,
    pub ended: bool,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PlayerStat {
    pub account_id: AccountId,
    pub volume: U128,
    pub gestures: u32,
    /// Nanoseconds this player held the last-gesture position.
    pub held_ns: U64,
}

#[near(serializers = [borsh])]
pub struct Cycle {
    pub id: u64,
    pub opens_at: u64,
    pub ends_at: u64,
    pub pool: u128,
    pub gesture_count: u32,
    pub last_gesturer: Option<AccountId>,
    pub last_gesture_at: u64,
    pub seed: [u8; 32],
    pub players: Vec<PlayerStat>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Award {
    pub account_id: AccountId,
    pub rank: String,
    pub amount: U128,
    pub art_token_ids: Vec<TokenId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CycleSummary {
    pub id: u64,
    pub ended_at: U64,
    pub pool: U128,
    pub gestures: u32,
    pub players: u32,
    pub seed: String,
    pub awards: Vec<Award>,
    pub rolled_over: U128,
}

#[near(serializers = [json])]
pub struct CycleView {
    pub id: u64,
    pub status: String,
    pub now: U64,
    pub opens_at: U64,
    pub ends_at: U64,
    pub pool: U128,
    pub gesture_count: u32,
    pub current_cost: U128,
    pub last_gesturer: Option<AccountId>,
    pub last_gesture_at: U64,
    pub seed: String,
    /// Sorted by volume, highest first. `held_ns` for the current holder includes time up to `now`.
    pub players: Vec<PlayerStat>,
}

#[near(serializers = [json])]
pub struct PassView {
    pub minted: u32,
    pub locked: Vec<LockedNft>,
    pub total: u32,
    pub stake_multiplier: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq)]
pub struct LockedNft {
    pub collection: AccountId,
    pub token_id: TokenId,
}

#[near(serializers = [json])]
pub struct GestureReceipt {
    pub cycle_id: u64,
    pub accepted: bool,
    pub message: String,
    pub ends_at: U64,
    pub pool: U128,
    pub next_cost: U128,
}

// ---------------------------------------------------------------- contract

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Boundora {
    owner_id: AccountId,
    config: Config,
    art: NonFungibleToken,
    art_metadata: LazyOption<NFTContractMetadata>,
    /// Heroes minted so far per rarity, Common..Mythic.
    minted_by_rarity: [u64; 5],
    passes: LookupMap<AccountId, u32>,
    total_passes: u64,
    locks: LookupMap<AccountId, Vec<LockedNft>>,
    collections: IterableSet<AccountId>,
    claimable: LookupMap<AccountId, u128>,
    treasury: u128,
    cycle: Cycle,
    history: Vector<CycleSummary>,
    equipped: LookupMap<AccountId, TokenId>,
    hero_mints: LookupMap<AccountId, u32>,
    listings: IterableMap<TokenId, Listing>,
    bids: LookupMap<TokenId, Vec<Bid>>,
    bid_tokens: IterableSet<TokenId>,
    auctions: IterableMap<TokenId, Auction>,
    hero_stats: LookupMap<TokenId, HeroStats>,
    pass_stats: LookupMap<AccountId, PassStats>,
    sales: Vector<Sale>,
    near_usd_micro: u64,
    price_updated_at: u64,
    price_keeper: AccountId,
}

#[near]
impl Boundora {
    #[init]
    pub fn new(owner_id: AccountId, config: Option<Config>, price_keeper: Option<AccountId>, near_usd_micro: Option<U64>) -> Self {
        let config = config.unwrap_or_default();
        config.assert_valid();
        let now = env::block_timestamp();
        let seed = hash(&[&env::random_seed(), b"boundora-genesis"]);
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Boundora Heroes".to_string(),
            symbol: "BHERO".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        let keeper = price_keeper.unwrap_or_else(|| owner_id.clone());
        Self {
            owner_id: owner_id.clone(),
            art: NonFungibleToken::new(
                StorageKey::ArtOwners,
                owner_id,
                Some(StorageKey::ArtMetadata),
                Some(StorageKey::ArtEnumeration),
                Some(StorageKey::ArtApprovals),
            ),
            art_metadata: LazyOption::new(StorageKey::ContractMetadata, Some(&metadata)),
            minted_by_rarity: [0; 5],
            passes: LookupMap::new(StorageKey::Passes),
            total_passes: 0,
            locks: LookupMap::new(StorageKey::Locks),
            collections: IterableSet::new(StorageKey::Collections),
            claimable: LookupMap::new(StorageKey::Claimable),
            treasury: 0,
            cycle: Cycle {
                id: 1,
                opens_at: now,
                ends_at: now + config.initial_duration_ms.0 * MS,
                pool: 0,
                gesture_count: 0,
                last_gesturer: None,
                last_gesture_at: now,
                seed,
                players: vec![],
            },
            history: Vector::new(StorageKey::History),
            equipped: LookupMap::new(StorageKey::Equipped),
            hero_mints: LookupMap::new(StorageKey::HeroMints),
            listings: IterableMap::new(StorageKey::Listings),
            sales: Vector::new(StorageKey::Sales),
            bids: LookupMap::new(StorageKey::Bids),
            bid_tokens: IterableSet::new(StorageKey::BidTokens),
            auctions: IterableMap::new(StorageKey::Auctions),
            hero_stats: LookupMap::new(StorageKey::HeroStats),
            pass_stats: LookupMap::new(StorageKey::PassStats),
            near_usd_micro: near_usd_micro.map(|p| p.0).unwrap_or(0),
            price_updated_at: if near_usd_micro.is_some() { now } else { 0 },
            price_keeper: keeper,
            config,
        }
    }

    // ------------------------------------------------------------ passes

    /// Mint your soulbound Boundora Pass (required to play). Attach at least `pass_quote().price`;
    /// anything above the quote is refunded.
    #[payable]
    pub fn mint_pass(&mut self) -> PassView {
        let account = env::predecessor_account_id();
        let q = self.pass_quote();
        require!(q.fresh, "The NEAR price feed is stale; try again shortly");
        let quote = q.price.0;
        let deposit = env::attached_deposit().as_yoctonear();
        let min_ok = quote * (BPS - self.config.price_tolerance_bps as u128) / BPS;
        require!(deposit >= min_ok, "Attach the pass price shown by pass_quote");
        let price = deposit.min(quote);
        let held = self.passes.get(&account).copied().unwrap_or(0);
        require!(
            held < self.config.max_passes_per_account,
            "You already hold the maximum number of passes"
        );
        self.passes.insert(account.clone(), held + 1);
        self.total_passes += 1;
        self.treasury += price;
        if deposit > price {
            let _ = Promise::new(account.clone()).transfer(NearToken::from_yoctonear(deposit - price));
        }
        self.pass_stats.insert(
            account.clone(),
            PassStats { joined_at_ms: env::block_timestamp_ms(), joined_cycle: self.cycle.id, ..Default::default() },
        );
        let pass_id = format!("{}{}", PASS_PREFIX, account);
        let meta = TokenMetadata {
            title: Some("Boundora Pass".into()),
            description: Some("Soulbound membership: required to play Boundora. Can never be sold or transferred.".into()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(format!(r#"{{"kind":"pass","soulbound":true,"member":"{}"}}"#, account)),
            reference: None,
            reference_hash: None,
        };
        self.art.internal_mint_with_refund(pass_id.clone(), account.clone(), Some(meta), None);
        emit("pass_minted", &format!(r#"{{"account_id":"{}","passes":{},"token_id":"{}"}}"#, account, held + 1, pass_id));
        self.passes_of(account)
    }

    /// The pass price right now: $5 converted to NEAR at the keeper's NEAR/USD rate.
    pub fn pass_quote(&self) -> PassQuote {
        let now = env::block_timestamp();
        let fresh = self.near_usd_micro > 0
            && now.saturating_sub(self.price_updated_at) <= self.config.price_max_age_ms.0 * MS;
        let price = if self.near_usd_micro > 0 {
            self.config.pass_price_usd_cents as u128 * 10u128.pow(28) / self.near_usd_micro as u128
        } else {
            0
        };
        PassQuote {
            usd_cents: self.config.pass_price_usd_cents,
            near_usd_micro: U64(self.near_usd_micro),
            price: U128(price),
            updated_at: U64(self.price_updated_at),
            fresh,
            keeper: self.price_keeper.clone(),
        }
    }

    /// Price keeper (or owner) posts the NEAR/USD rate in millionths of a dollar.
    pub fn set_near_usd_price(&mut self, price_micro_usd: U64) {
        let caller = env::predecessor_account_id();
        require!(caller == self.price_keeper || caller == self.owner_id, "Only the price keeper can post prices");
        require!(price_micro_usd.0 >= 10_000 && price_micro_usd.0 <= 10_000_000_000, "Price out of range");
        self.near_usd_micro = price_micro_usd.0;
        self.price_updated_at = env::block_timestamp();
        emit("price_updated", &format!(r#"{{"near_usd_micro":"{}"}}"#, price_micro_usd.0));
    }

    pub fn set_price_keeper(&mut self, keeper: AccountId) {
        self.assert_owner();
        self.price_keeper = keeper;
    }

    pub fn passes_of(&self, account_id: AccountId) -> PassView {
        let minted = self.passes.get(&account_id).copied().unwrap_or(0);
        let locked = self.locks.get(&account_id).cloned().unwrap_or_default();
        let total = minted + locked.len() as u32;
        PassView {
            minted,
            // The pass is required: locked NFTs only add chi on top of it.
            stake_multiplier: if minted == 0 { 0 } else { total.min(self.config.max_multiplier) },
            locked,
            total,
        }
    }

    /// Return a locked NFT to its owner. Not allowed while you have gestures in the open cycle.
    pub fn unlock_nft(&mut self, collection: AccountId, token_id: TokenId) -> Promise {
        let account = env::predecessor_account_id();
        require!(
            self.find_player(&account).is_none() || self.cycle_ended(env::block_timestamp()),
            "You can unlock after the current cycle ends"
        );
        let mut locks = self.locks.get(&account).cloned().unwrap_or_default();
        let item = LockedNft { collection: collection.clone(), token_id: token_id.clone() };
        let pos = locks.iter().position(|l| l == &item).unwrap_or_else(|| {
            env::panic_str("That NFT is not locked by your account")
        });
        locks.remove(pos);
        self.locks.insert(account.clone(), locks);
        Promise::new(collection.clone())
            .function_call(
                "nft_transfer".to_string(),
                format!(r#"{{"receiver_id":"{}","token_id":"{}"}}"#, account, token_id).into_bytes(),
                NearToken::from_yoctonear(1),
                GAS_FOR_NFT_TRANSFER,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_UNLOCK_CALLBACK)
                    .on_unlock(account, collection, token_id),
            )
    }

    #[private]
    pub fn on_unlock(&mut self, account_id: AccountId, collection: AccountId, token_id: TokenId) -> bool {
        if !matches!(env::promise_result_checked(0, 0), Err(near_sdk::PromiseError::Failed)) {
            return true;
        }
        // Transfer failed: the NFT is still here, so restore the lock record.
        let mut locks = self.locks.get(&account_id).cloned().unwrap_or_default();
        locks.push(LockedNft { collection, token_id });
        self.locks.insert(account_id, locks);
        false
    }

    // ------------------------------------------------------------ gestures

    /// Make a gesture. Attach between the current cost and cost × your stake multiplier.
    #[payable]
    pub fn gesture(&mut self) -> GestureReceipt {
        let now = env::block_timestamp();
        let player = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let base_multiplier = self.passes_of(player.clone()).stake_multiplier;
        require!(base_multiplier > 0, "Mint your Boundora Pass to play");
        let (bonus_ms, discount_bps, extra_mult) = self.power_of(&player);
        let multiplier = base_multiplier + extra_mult;

        let settled = self.settle_if_ended(now);
        // If this call just closed a cycle, never panic: that would undo the settlement.
        let reject = |this: &Self, msg: &str| -> GestureReceipt {
            if !settled {
                env::panic_str(msg);
            }
            if deposit > 0 {
                let _ = Promise::new(player.clone()).transfer(NearToken::from_yoctonear(deposit));
            }
            log!("Gesture refunded: {}", msg);
            this.receipt(false, msg)
        };

        if now < self.cycle.opens_at {
            return reject(self, "The next cycle has not opened yet");
        }
        let cost = self.current_cost() * (BPS - discount_bps as u128) / BPS;
        if deposit < cost {
            return reject(self, "Attached deposit is below the current gesture cost");
        }
        if deposit > cost * multiplier as u128 {
            return reject(self, "Attached deposit exceeds cost × your stake multiplier");
        }
        let is_new = self.find_player(&player).is_none();
        if is_new && self.cycle.players.len() as u32 >= self.config.max_players_per_cycle {
            return reject(self, "This cycle is full");
        }

        // Endurance: whoever held the last-gesture spot earns the time since it was taken.
        if let Some(prev) = self.cycle.last_gesturer.clone() {
            let elapsed = now.saturating_sub(self.cycle.last_gesture_at);
            let idx = self.find_player(&prev).expect("holder is a player");
            self.cycle.players[idx].held_ns = U64(self.cycle.players[idx].held_ns.0 + elapsed);
        }
        let idx = match self.find_player(&player) {
            Some(i) => i,
            None => {
                self.cycle.players.push(PlayerStat {
                    account_id: player.clone(),
                    volume: U128(0),
                    gestures: 0,
                    held_ns: U64(0),
                });
                self.cycle.players.len() - 1
            }
        };
        let stat = &mut self.cycle.players[idx];
        stat.volume = U128(stat.volume.0 + deposit);
        stat.gestures += 1;

        self.cycle.pool += deposit;
        self.cycle.gesture_count += 1;
        self.cycle.last_gesturer = Some(player.clone());
        self.cycle.last_gesture_at = now;
        let extended = self.cycle.ends_at + (self.config.extension_ms.0 + bonus_ms) * MS;
        let cap = now + self.config.max_remaining_ms.0 * MS;
        self.cycle.ends_at = extended.min(cap);
        self.cycle.seed = hash(&[
            &self.cycle.seed,
            player.as_bytes(),
            &deposit.to_le_bytes(),
            &now.to_le_bytes(),
        ]);

        emit(
            "gesture",
            &format!(
                r#"{{"cycle_id":{},"account_id":"{}","amount":"{}","ends_at":"{}","pool":"{}"}}"#,
                self.cycle.id, player, deposit, self.cycle.ends_at, self.cycle.pool
            ),
        );
        let cycle_id = self.cycle.id;
        let ps = self.pass_stats.entry(player.clone()).or_default();
        ps.strikes += 1;
        if ps.last_cycle != cycle_id {
            ps.rounds += 1;
            ps.last_cycle = cycle_id;
        }
        if let Some(hero) = self.equipped_of(player.clone()) {
            let st = self.hero_stats.entry(hero.token_id.clone()).or_default();
            st.xp += XP_STRIKE * (100 + gear_xp_bonus(&st.gear)) / 100;
            st.strikes += 1;
        }
        self.receipt(true, "Gesture accepted")
    }

    /// Close the cycle once its clock has run out. Anyone can call this.
    pub fn finalize(&mut self) -> Option<CycleSummary> {
        let now = env::block_timestamp();
        require!(self.cycle_ended(now), "The cycle clock is still running");
        if self.settle_if_ended(now) {
            self.history.get(self.history.len() - 1).cloned()
        } else {
            None
        }
    }

    /// Withdraw everything you have won.
    pub fn claim(&mut self) -> U128 {
        let account = env::predecessor_account_id();
        let amount = self.claimable.remove(&account).unwrap_or(0);
        require!(amount > 0, "Nothing to claim");
        let _ = Promise::new(account.clone()).transfer(NearToken::from_yoctonear(amount));
        emit("claim", &format!(r#"{{"account_id":"{}","amount":"{}"}}"#, account, amount));
        U128(amount)
    }

    // ------------------------------------------------------------ heroes

    /// Public mint: one random hero from what's left of the 20,000, weighted by the
    /// remaining supply of each rarity. Proceeds go to the treasury.
    #[payable]
    pub fn mint_hero(&mut self) -> HeroView {
        let account = env::predecessor_account_id();
        let price = self.config.hero_price.0;
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= price, "Attach the hero price to mint");
        let done = self.hero_mints.get(&account).copied().unwrap_or(0);
        require!(done < self.config.max_hero_mints_per_account, "You have reached the hero mint limit");
        let remaining: Vec<u64> = Rarity::ALL.iter().map(|r| r.supply() - self.minted_by_rarity[r.idx()]).collect();
        let left: u64 = remaining.iter().sum();
        require!(left > 0, "All 20,000 heroes have been minted");
        let roll = u64::from_le_bytes(
            hash(&[&env::random_seed(), account.as_bytes(), &left.to_le_bytes()])[..8].try_into().unwrap(),
        ) % left;
        let mut acc = 0;
        let mut pick = Rarity::Common;
        for r in Rarity::ALL {
            acc += remaining[r.idx()];
            if roll < acc {
                pick = r;
                break;
            }
        }
        let token_id = self.take_hero(&account, pick, "public mint").expect("supply checked");
        self.hero_mints.insert(account.clone(), done + 1);
        self.treasury += price;
        if deposit > price {
            let _ = Promise::new(account.clone()).transfer(NearToken::from_yoctonear(deposit - price));
        }
        self.hero_view(&token_id).unwrap()
    }

    /// Equip one of your heroes (or `None` to unequip). Its power applies while you own it.
    pub fn equip_hero(&mut self, token_id: Option<TokenId>) -> Option<HeroView> {
        let account = env::predecessor_account_id();
        match token_id {
            None => {
                self.equipped.remove(&account);
                None
            }
            Some(id) => {
                self.assert_hero(&id);
                let owner = self.art.owner_by_id.get(&id).unwrap_or_else(|| env::panic_str("No such hero"));
                require!(owner == account, "You don't own that hero");
                self.equipped.insert(account.clone(), id.clone());
                emit("hero_equipped", &format!(r#"{{"account_id":"{}","token_id":"{}"}}"#, account, id));
                self.hero_view(&id)
            }
        }
    }

    /// The hero whose power currently applies to this account, if any.
    pub fn equipped_of(&self, account_id: AccountId) -> Option<HeroView> {
        let id = self.equipped.get(&account_id)?;
        if self.art.owner_by_id.get(id).as_ref() != Some(&account_id) {
            return None; // sold or transferred: the power no longer applies
        }
        self.hero_view(id)
    }

    /// Rarity and power of any hero number 1..=20000, minted or not.
    pub fn hero_info(&self, number: u64) -> HeroView {
        require!(number >= 1 && number <= SUPPLY, "Hero numbers run from 1 to 20000");
        self.hero_view(&format!("hero-{}", number)).unwrap()
    }

    pub fn hero_supply(&self) -> SupplyView {
        SupplyView {
            total: SUPPLY,
            minted: self.minted_by_rarity.iter().sum(),
            minted_by_rarity: self.minted_by_rarity.to_vec(),
            supply_by_rarity: Rarity::ALL.iter().map(|r| r.supply()).collect(),
            price: self.config.hero_price,
        }
    }

    /// A hero's level, XP, record and vault. Works for unminted numbers too (all zero).
    pub fn hero_stats(&self, token_id: TokenId) -> HeroStatsView {
        let n = index_of_token(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        let st = self.stats_of(&token_id);
        let level = level_for_xp(st.xp);
        HeroStatsView {
            token_id: token_id.clone(),
            number: n + 1,
            rarity: rarity_of_index(n),
            owner_id: self.art.owner_by_id.get(&token_id),
            level,
            xp: U64(st.xp),
            level_xp: U64(xp_for_level(level)),
            next_level_xp: if level >= MAX_LEVEL { None } else { Some(U64(xp_for_level(level + 1))) },
            strikes: st.strikes,
            wins: st.wins,
            vault: U128(st.vault),
            lifetime_earned: U128(st.lifetime_earned),
            level_bonus_ms: U64(level_bonus_ms(level)),
            gear: st.gear.iter().map(|g| GEAR[*g as usize].0.to_string()).collect(),
            account_id: if st.account_open { Some(hero_account_id(&token_id)) } else { None },
            account_pending: st.account_pending,
        }
    }

    /// Withdraw the NEAR a hero has earned. Only its current owner can, and not while it
    /// is listed or on auction; any open bids are refunded because the hero's value changed.
    pub fn claim_hero_vault(&mut self, token_id: TokenId) -> U128 {
        let account = env::predecessor_account_id();
        let owner = self.art.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        require!(owner == account, "Only the hero's owner can empty its vault");
        require!(self.listings.get(&token_id).is_none(), "Delist the hero before claiming its vault");
        require!(self.auctions.get(&token_id).is_none(), "The hero is on auction");
        let st = self.hero_stats.entry(token_id.clone()).or_default();
        require!(!st.account_pending, "The hero's account is still being opened");
        let amount = st.vault;
        require!(amount > 0, "This hero's vault is empty");
        st.vault = 0;
        let in_account = st.account_open;
        self.refund_all_bids(&token_id);
        if in_account {
            // The NEAR sits in the hero's own account: ask it to pay the owner.
            let _ = Promise::new(hero_account_id(&token_id))
                .function_call(
                    "withdraw".to_string(),
                    format!(r#"{{"receiver_id":"{}","amount":"{}"}}"#, account, amount).into_bytes(),
                    NearToken::from_yoctonear(0),
                    GAS_FOR_HERO_WITHDRAW,
                )
                .then(
                    Promise::new(env::current_account_id()).function_call(
                        "on_hero_withdraw".to_string(),
                        format!(r#"{{"token_id":"{}","amount":"{}"}}"#, token_id, amount).into_bytes(),
                        NearToken::from_yoctonear(0),
                        GAS_FOR_HERO_ACCOUNT_CALLBACK,
                    ),
                );
        } else {
            let _ = Promise::new(account.clone()).transfer(NearToken::from_yoctonear(amount));
        }
        emit(
            "hero_vault_claimed",
            &format!(r#"{{"token_id":"{}","account_id":"{}","amount":"{}"}}"#, token_id, account, amount),
        );
        U128(amount)
    }

    // ------------------------------------------------------------ gear (hero inventory)

    pub fn gear_catalog(&self) -> Vec<GearView> {
        GEAR.iter()
            .enumerate()
            .map(|(i, g)| GearView {
                id: i as u8,
                name: g.0.into(),
                price: U128(g.1 * 10u128.pow(21)),
                effect: gear_effect_text(i as u8),
            })
            .collect()
    }

    /// Buy a gear item straight into one of your heroes' inventory. Proceeds go to the treasury.
    #[payable]
    pub fn buy_gear(&mut self, token_id: TokenId, item: u8) -> HeroStatsView {
        self.assert_hero(&token_id);
        let account = env::predecessor_account_id();
        require!(self.art.owner_by_id.get(&token_id).as_ref() == Some(&account), "You don't own that hero");
        require!((item as usize) < GEAR.len(), "No such gear");
        let price = GEAR[item as usize].1 * 10u128.pow(21);
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= price, "Attach the gear price");
        let st = self.hero_stats.entry(token_id.clone()).or_default();
        require!(!st.gear.contains(&item), "This hero already carries that item");
        require!(st.gear.len() < GEAR_SLOTS, "This hero's inventory is full (3 slots)");
        st.gear.push(item);
        self.treasury += price;
        if deposit > price {
            let _ = Promise::new(account.clone()).transfer(NearToken::from_yoctonear(deposit - price));
        }
        emit("gear_bought", &format!(r#"{{"token_id":"{}","item":"{}"}}"#, token_id, GEAR[item as usize].0));
        self.hero_stats(token_id)
    }

    /// Move an item from one of your heroes to another. Not while the source hero is listed
    /// or on auction; open bids on it are refunded because its value changed.
    pub fn move_gear(&mut self, from_token: TokenId, to_token: TokenId, item: u8) {
        self.assert_hero(&from_token);
        self.assert_hero(&to_token);
        require!(from_token != to_token, "Pick two different heroes");
        let account = env::predecessor_account_id();
        require!(self.art.owner_by_id.get(&from_token).as_ref() == Some(&account), "You don't own that hero");
        require!(self.art.owner_by_id.get(&to_token).as_ref() == Some(&account), "You don't own that hero");
        require!(self.listings.get(&from_token).is_none(), "Delist the hero before moving its gear");
        require!(self.auctions.get(&from_token).is_none(), "The hero is on auction");
        let to = self.stats_of(&to_token);
        require!(!to.gear.contains(&item), "That hero already carries this item");
        require!(to.gear.len() < GEAR_SLOTS, "That hero's inventory is full (3 slots)");
        let from = self.hero_stats.entry(from_token.clone()).or_default();
        let pos = from.gear.iter().position(|g| *g == item).unwrap_or_else(|| env::panic_str("The hero doesn't carry that item"));
        from.gear.remove(pos);
        self.hero_stats.entry(to_token.clone()).or_default().gear.push(item);
        self.refund_all_bids(&from_token);
        emit(
            "gear_moved",
            &format!(r#"{{"from":"{}","to":"{}","item":"{}"}}"#, from_token, to_token, GEAR[item as usize].0),
        );
    }

    // ------------------------------------------------------------ hero accounts (sub-accounts)

    /// What it costs to give a hero its own NEAR account: storage for the account's code plus a
    /// small buffer. The deposit stays in the hero account as its storage stake.
    pub fn hero_account_cost(&self) -> U128 {
        U128(env::storage_byte_cost().as_yoctonear() * (HERO_ACCOUNT_WASM.len() as u128 + 2_000) + HERO_ACCOUNT_EXTRA)
    }

    pub fn hero_accounts_enabled(&self) -> bool {
        HERO_ACCOUNT_WASM.len() > 1_000
    }

    /// Give a hero its own NEAR account, `hero-N.<this contract>`. From then on its vault NEAR is
    /// held there, visible on any explorer, and moves only when the hero's owner claims it.
    #[payable]
    pub fn open_hero_account(&mut self, token_id: TokenId) -> Promise {
        self.assert_hero(&token_id);
        let account = env::predecessor_account_id();
        require!(self.art.owner_by_id.get(&token_id).as_ref() == Some(&account), "You don't own that hero");
        #[cfg(not(test))]
        require!(self.hero_accounts_enabled(), "Hero accounts are not enabled in this build");
        let cost = self.hero_account_cost().0;
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= cost, "Attach hero_account_cost to open a hero account");
        let st = self.hero_stats.entry(token_id.clone()).or_default();
        require!(!st.account_open && !st.account_pending, "This hero already has an account");
        st.account_pending = true;
        Promise::new(hero_account_id(&token_id))
            .create_account()
            .transfer(NearToken::from_yoctonear(deposit))
            .deploy_contract(HERO_ACCOUNT_WASM.to_vec())
            .function_call(
                "new".to_string(),
                format!(r#"{{"token_id":"{}"}}"#, token_id).into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_FOR_HERO_ACCOUNT_INIT,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_hero_account".to_string(),
                format!(r#"{{"token_id":"{}","payer":"{}","deposit":"{}"}}"#, token_id, account, deposit).into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_FOR_HERO_ACCOUNT_CALLBACK,
            ))
    }

    /// Callback after creating a hero account. On success, moves the hero's existing vault
    /// NEAR into it; on failure, refunds the deposit.
    #[private]
    pub fn on_hero_account(&mut self, token_id: TokenId, payer: AccountId, deposit: U128) -> bool {
        let ok = env::promise_result_checked(0, 256).is_ok();
        let st = self.hero_stats.entry(token_id.clone()).or_default();
        st.account_pending = false;
        if ok {
            st.account_open = true;
            let held = st.vault;
            if held > 0 {
                let _ = Promise::new(hero_account_id(&token_id)).transfer(NearToken::from_yoctonear(held));
            }
            emit(
                "hero_account_opened",
                &format!(r#"{{"token_id":"{}","account_id":"{}"}}"#, token_id, hero_account_id(&token_id)),
            );
        } else {
            let _ = Promise::new(payer).transfer(NearToken::from_yoctonear(deposit.0));
        }
        ok
    }

    /// Callback after a hero account withdrawal. If it failed, the amount goes back on the books.
    #[private]
    pub fn on_hero_withdraw(&mut self, token_id: TokenId, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 256).is_ok();
        if !ok {
            self.hero_stats.entry(token_id).or_default().vault += amount.0;
        }
        ok
    }

    /// The hero's own NEAR account, if it has one.
    pub fn hero_account_of(&self, token_id: TokenId) -> Option<AccountId> {
        self.hero_stats.get(&token_id).filter(|s| s.account_open).map(|_| hero_account_id(&token_id))
    }

    // ------------------------------------------------------------ pass (soulbound NFT)

    /// The account's soulbound pass token and its membership record.
    pub fn pass_of(&self, account_id: AccountId) -> Option<PassCardView> {
        if self.passes.get(&account_id).copied().unwrap_or(0) == 0 {
            return None;
        }
        let stats = self.pass_stats.get(&account_id).cloned().unwrap_or_default();
        Some(PassCardView {
            token_id: format!("{}{}", PASS_PREFIX, account_id),
            owner_id: account_id,
            soulbound: true,
            best_finish: finish_name(stats.best_finish).into(),
            stats,
        })
    }

    // ------------------------------------------------------------ hero market

    /// List one of your heroes for sale. Passes are soulbound and can never be listed.
    pub fn list_hero(&mut self, token_id: TokenId, price: U128) -> ListingView {
        self.assert_hero(&token_id);
        let seller = env::predecessor_account_id();
        let owner = self.art.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        require!(owner == seller, "You don't own that hero");
        require!(price.0 >= NearToken::from_millinear(10).as_yoctonear(), "Minimum price is 0.01 NEAR");
        require!(self.auctions.get(&token_id).is_none(), "This hero is in an auction");
        self.listings.insert(
            token_id.clone(),
            Listing { seller: seller.clone(), price, listed_at: U64(env::block_timestamp()) },
        );
        emit("hero_listed", &format!(r#"{{"token_id":"{}","seller":"{}","price":"{}"}}"#, token_id, seller, price.0));
        self.listing_view(&token_id).unwrap()
    }

    /// Take a listing down. The seller can always delist; anyone can clear a stale listing.
    pub fn delist_hero(&mut self, token_id: TokenId) {
        let caller = env::predecessor_account_id();
        let l = self.listings.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("Not listed"));
        let stale = self.art.owner_by_id.get(&token_id).as_ref() != Some(&l.seller);
        require!(caller == l.seller || stale, "Only the seller can delist");
        self.listings.remove(&token_id);
        emit("hero_delisted", &format!(r#"{{"token_id":"{}"}}"#, token_id));
    }

    /// Buy a listed hero. Attach the listed price; the seller gets it minus the royalty.
    #[payable]
    pub fn buy_hero(&mut self, token_id: TokenId) -> Sale {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let l = self.listings.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("That hero isn't for sale"));
        require!(buyer != l.seller, "You can't buy your own hero");
        require!(deposit >= l.price.0, "Attach the listed price");
        let owner = self.art.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        require!(owner == l.seller, "This listing is stale: the seller no longer owns the hero");
        if deposit > l.price.0 {
            let _ = Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(deposit - l.price.0));
        }
        self.execute_sale(&token_id, &l.seller, &buyer, l.price.0)
    }

    // ------------------------------------------------------------ bids and auctions

    /// Bid on any minted hero. The attached NEAR is held in escrow. Bidding again on the same
    /// hero adds to your existing bid. In an auction, a bid must beat the highest by 5%.
    #[payable]
    pub fn place_bid(&mut self, token_id: TokenId) -> Bid {
        self.assert_hero(&token_id);
        let bidder = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();
        let owner = self.art.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        require!(owner != bidder, "You can't bid on your own hero");
        require!(deposit > 0, "Attach NEAR to bid");
        let now = env::block_timestamp();
        let mut bids = self.bids.get(&token_id).cloned().unwrap_or_default();
        let prev = bids.iter().position(|b| b.bidder == bidder);
        let amount = deposit + prev.map(|i| bids[i].amount.0).unwrap_or(0);
        require!(amount >= NearToken::from_millinear(10).as_yoctonear(), "Minimum bid is 0.01 NEAR");
        if let Some(a) = self.auctions.get(&token_id) {
            require!(now < a.ends_at.0, "This auction has ended");
            let highest = bids.iter().map(|b| b.amount.0).max().unwrap_or(0);
            let need = (highest * (BPS + 500) / BPS).max(a.reserve.0).max(1);
            require!(amount >= need, "In an auction your bid must beat the highest by 5% and meet the reserve");
        }
        match prev {
            Some(i) => bids[i] = Bid { bidder: bidder.clone(), amount: U128(amount), at: U64(now) },
            None => {
                require!(bids.len() < 30, "This hero has too many open bids");
                bids.push(Bid { bidder: bidder.clone(), amount: U128(amount), at: U64(now) });
            }
        }
        self.bids.insert(token_id.clone(), bids);
        self.bid_tokens.insert(token_id.clone());
        emit("bid_placed", &format!(r#"{{"token_id":"{}","bidder":"{}","amount":"{}"}}"#, token_id, bidder, amount));
        Bid { bidder, amount: U128(amount), at: U64(now) }
    }

    /// Take your bid back (not allowed while an auction on that hero is running).
    pub fn withdraw_bid(&mut self, token_id: TokenId) -> U128 {
        let bidder = env::predecessor_account_id();
        if let Some(a) = self.auctions.get(&token_id) {
            require!(env::block_timestamp() >= a.ends_at.0, "Bids are locked until the auction ends");
        }
        let mut bids = self.bids.get(&token_id).cloned().unwrap_or_default();
        let i = bids.iter().position(|b| b.bidder == bidder).unwrap_or_else(|| env::panic_str("You have no bid on this hero"));
        let b = bids.remove(i);
        self.store_bids(&token_id, bids);
        let _ = Promise::new(bidder).transfer(NearToken::from_yoctonear(b.amount.0));
        b.amount
    }

    /// The owner picks a bid (any bid, not only the highest). Everyone else is refunded.
    pub fn accept_bid(&mut self, token_id: TokenId, bidder: AccountId) -> Sale {
        let owner = env::predecessor_account_id();
        require!(self.art.owner_by_id.get(&token_id).as_ref() == Some(&owner), "You don't own that hero");
        let bids = self.bids.get(&token_id).cloned().unwrap_or_default();
        let b = bids.iter().find(|b| b.bidder == bidder).cloned().unwrap_or_else(|| env::panic_str("No bid from that account"));
        self.remove_bid(&token_id, &bidder);
        self.execute_sale(&token_id, &owner, &bidder, b.amount.0)
    }

    /// Put a hero up for a timed auction. When it ends it sells automatically to the highest bid
    /// at or above `reserve`. Bids already on the hero count.
    pub fn start_auction(&mut self, token_id: TokenId, duration_ms: U64, reserve: Option<U128>) -> AuctionView {
        self.assert_hero(&token_id);
        let seller = env::predecessor_account_id();
        require!(self.art.owner_by_id.get(&token_id).as_ref() == Some(&seller), "You don't own that hero");
        require!(self.auctions.get(&token_id).is_none(), "Already in an auction");
        require!(duration_ms.0 >= 60_000 && duration_ms.0 <= 7 * 24 * 3600 * 1000, "Auctions run from 1 minute to 7 days");
        self.listings.remove(&token_id);
        let ends_at = env::block_timestamp() + duration_ms.0 * MS;
        self.auctions.insert(token_id.clone(), Auction { seller: seller.clone(), ends_at: U64(ends_at), reserve: reserve.unwrap_or(U128(0)) });
        emit("auction_started", &format!(r#"{{"token_id":"{}","seller":"{}","ends_at":"{}"}}"#, token_id, seller, ends_at));
        self.auction_view(&token_id).unwrap()
    }

    /// Cancel an auction that has no bids yet.
    pub fn cancel_auction(&mut self, token_id: TokenId) {
        let a = self.auctions.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("No auction"));
        require!(env::predecessor_account_id() == a.seller, "Only the seller can cancel");
        require!(self.bids.get(&token_id).map(|b| b.is_empty()).unwrap_or(true), "Bids are in: the auction must run to the end");
        self.auctions.remove(&token_id);
    }

    /// After the auction ends, anyone can settle it: the highest bid at or above the reserve wins,
    /// and every other bid is refunded. With no qualifying bid, all bids are refunded.
    pub fn settle_auction(&mut self, token_id: TokenId) -> Option<Sale> {
        let a = self.auctions.get(&token_id).cloned().unwrap_or_else(|| env::panic_str("No auction"));
        require!(env::block_timestamp() >= a.ends_at.0, "The auction is still running");
        self.auctions.remove(&token_id);
        let bids = self.bids.get(&token_id).cloned().unwrap_or_default();
        let best = bids.iter().max_by_key(|b| b.amount.0).cloned();
        let owner_ok = self.art.owner_by_id.get(&token_id).as_ref() == Some(&a.seller);
        match best {
            Some(b) if owner_ok && b.amount.0 >= a.reserve.0 => {
                self.remove_bid(&token_id, &b.bidder);
                Some(self.execute_sale(&token_id, &a.seller, &b.bidder, b.amount.0))
            }
            _ => {
                self.refund_all_bids(&token_id);
                emit("auction_unsold", &format!(r#"{{"token_id":"{}"}}"#, token_id));
                None
            }
        }
    }

    /// Bids on a hero, highest first.
    pub fn bids_on(&self, token_id: TokenId) -> Vec<Bid> {
        let mut v = self.bids.get(&token_id).cloned().unwrap_or_default();
        v.sort_by(|a, b| b.amount.0.cmp(&a.amount.0));
        v
    }

    /// Heroes that currently have bids (for "most wanted" views).
    pub fn tokens_with_bids(&self, limit: Option<u32>) -> Vec<TokenId> {
        self.bid_tokens.iter().take(limit.unwrap_or(50) as usize).cloned().collect()
    }

    pub fn get_auctions(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<AuctionView> {
        self.auctions
            .keys()
            .filter_map(|id| self.auction_view(id))
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(200) as usize)
            .collect()
    }

    /// Live listings (stale ones, where the seller no longer owns the hero, are skipped).
    pub fn get_listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<ListingView> {
        self.listings
            .keys()
            .filter_map(|id| self.listing_view(id))
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(200) as usize)
            .collect()
    }

    pub fn listing_of(&self, token_id: TokenId) -> Option<ListingView> {
        self.listing_view(&token_id)
    }

    /// Most recent sales first.
    pub fn get_sales(&self, limit: Option<u32>) -> Vec<Sale> {
        let n = self.sales.len();
        let take = limit.unwrap_or(20).min(n);
        (0..take).filter_map(|i| self.sales.get(n - 1 - i).cloned()).collect()
    }

    // ------------------------------------------------------------ royalties (NEP-199)

    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: Option<u32>) -> Payout {
        let owner = self.art.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("No such hero"));
        if let Some(max) = max_len_payout {
            require!(max >= 2, "max_len_payout must allow 2 receivers");
        }
        let mut payout = HashMap::new();
        if owner == self.owner_id {
            payout.insert(owner, balance);
        } else {
            let royalty = balance.0 * self.config.royalty_bps as u128 / BPS;
            payout.insert(self.owner_id.clone(), U128(royalty));
            payout.insert(owner, U128(balance.0 - royalty));
        }
        Payout { payout }
    }

    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        assert_one_yocto();
        self.assert_not_pass(&token_id);
        let payout = self.nft_payout(token_id.clone(), balance, max_len_payout);
        self.art.nft_transfer(receiver_id, token_id, approval_id, memo);
        payout
    }

    // ------------------------------------------------------------ views

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_cycle(&self) -> CycleView {
        let now = env::block_timestamp();
        let mut players = self.cycle.players.clone();
        if let Some(holder) = &self.cycle.last_gesturer {
            let until = now.min(self.cycle.ends_at);
            if let Some(p) = players.iter_mut().find(|p| &p.account_id == holder) {
                p.held_ns = U64(p.held_ns.0 + until.saturating_sub(self.cycle.last_gesture_at));
            }
        }
        players.sort_by(|a, b| b.volume.0.cmp(&a.volume.0));
        let status = if now < self.cycle.opens_at {
            "cooldown"
        } else if self.cycle_ended(now) {
            "awaiting_finalize"
        } else {
            "open"
        };
        CycleView {
            id: self.cycle.id,
            status: status.to_string(),
            now: U64(now),
            opens_at: U64(self.cycle.opens_at),
            ends_at: U64(self.cycle.ends_at),
            pool: U128(self.cycle.pool),
            gesture_count: self.cycle.gesture_count,
            current_cost: U128(self.current_cost()),
            last_gesturer: self.cycle.last_gesturer.clone(),
            last_gesture_at: U64(self.cycle.last_gesture_at),
            seed: hex(&self.cycle.seed),
            players,
        }
    }

    /// Most recent cycles first.
    pub fn get_history(&self, limit: Option<u32>) -> Vec<CycleSummary> {
        let n = self.history.len();
        let take = limit.unwrap_or(10).min(n);
        (0..take).filter_map(|i| self.history.get(n - 1 - i).cloned()).collect()
    }

    pub fn claimable_of(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_treasury(&self) -> U128 {
        U128(self.treasury)
    }

    pub fn total_passes(&self) -> U64 {
        U64(self.total_passes)
    }

    pub fn eligible_collections(&self) -> Vec<AccountId> {
        self.collections.iter().cloned().collect()
    }

    // ------------------------------------------------------------ owner

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        config.assert_valid();
        self.config = config;
    }

    pub fn add_collection(&mut self, collection: AccountId) {
        self.assert_owner();
        self.collections.insert(collection);
    }

    pub fn remove_collection(&mut self, collection: AccountId) {
        self.assert_owner();
        self.collections.remove(&collection);
    }

    /// Treasury also funds storage for minted art, so leave a buffer.
    pub fn withdraw_treasury(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        require!(amount.0 <= self.treasury, "Amount exceeds treasury");
        self.treasury -= amount.0;
        Promise::new(self.owner_id.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }
}

// ---------------------------------------------------------------- internals

impl Boundora {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "Owner only");
    }

    fn cycle_ended(&self, now: u64) -> bool {
        now >= self.cycle.ends_at
    }

    fn find_player(&self, account: &AccountId) -> Option<usize> {
        self.cycle.players.iter().position(|p| &p.account_id == account)
    }

    /// Move the hero, pay the seller minus the royalty, clear its listing/auction, refund all
    /// remaining bids and record the sale.
    fn execute_sale(&mut self, token_id: &TokenId, seller: &AccountId, buyer: &AccountId, price: u128) -> Sale {
        self.listings.remove(token_id);
        self.auctions.remove(token_id);
        self.art.internal_transfer(seller, buyer, token_id, None, Some("Boundora market".into()));
        if self.equipped.get(seller) == Some(token_id) {
            self.equipped.remove(seller);
        }
        let royalty = price * self.config.royalty_bps as u128 / BPS;
        let hero_share = royalty * HERO_ROYALTY_SHARE_BPS / BPS;
        self.treasury += royalty - hero_share;
        self.credit_hero(token_id, hero_share, "royalty");
        let _ = Promise::new(seller.clone()).transfer(NearToken::from_yoctonear(price - royalty));
        self.refund_all_bids(token_id);
        let sale = Sale {
            token_id: token_id.clone(),
            seller: seller.clone(),
            buyer: buyer.clone(),
            price: U128(price),
            royalty: U128(royalty),
            at: U64(env::block_timestamp()),
        };
        emit(
            "hero_sold",
            &format!(r#"{{"token_id":"{}","seller":"{}","buyer":"{}","price":"{}"}}"#, token_id, seller, buyer, price),
        );
        self.sales.push(sale.clone());
        sale
    }

    fn store_bids(&mut self, token_id: &TokenId, bids: Vec<Bid>) {
        if bids.is_empty() {
            self.bids.remove(token_id);
            self.bid_tokens.remove(token_id);
        } else {
            self.bids.insert(token_id.clone(), bids);
        }
    }

    fn remove_bid(&mut self, token_id: &TokenId, bidder: &AccountId) {
        let mut bids = self.bids.get(token_id).cloned().unwrap_or_default();
        bids.retain(|b| &b.bidder != bidder);
        self.store_bids(token_id, bids);
    }

    fn refund_all_bids(&mut self, token_id: &TokenId) {
        for b in self.bids.get(token_id).cloned().unwrap_or_default() {
            let _ = Promise::new(b.bidder.clone()).transfer(NearToken::from_yoctonear(b.amount.0));
        }
        self.store_bids(token_id, vec![]);
    }

    fn auction_view(&self, token_id: &TokenId) -> Option<AuctionView> {
        let a = self.auctions.get(token_id)?;
        let n = index_of_token(token_id)?;
        let bids = self.bids.get(token_id).cloned().unwrap_or_default();
        Some(AuctionView {
            token_id: token_id.clone(),
            number: n + 1,
            rarity: rarity_of_index(n),
            seller: a.seller.clone(),
            ends_at: a.ends_at,
            reserve: a.reserve,
            highest: bids.iter().max_by_key(|b| b.amount.0).cloned(),
            bids: bids.len() as u32,
            ended: env::block_timestamp() >= a.ends_at.0,
        })
    }

    fn listing_view(&self, token_id: &TokenId) -> Option<ListingView> {
        let l = self.listings.get(token_id)?;
        if self.art.owner_by_id.get(token_id).as_ref() != Some(&l.seller) {
            return None;
        }
        let n = index_of_token(token_id)?;
        Some(ListingView {
            token_id: token_id.clone(),
            number: n + 1,
            rarity: rarity_of_index(n),
            seller: l.seller.clone(),
            price: l.price,
            listed_at: l.listed_at,
        })
    }

    fn power_of(&self, account: &AccountId) -> (u64, u32, u32) {
        match self.equipped_of(account.clone()) {
            Some(h) => {
                let (ms, disc, chi) = h.rarity.power();
                let gear = self.stats_of(&h.token_id).gear;
                let (gms, gdisc, gchi) = gear_power(&gear);
                (ms + level_bonus_ms(h.level) + gms, disc + gdisc, chi + gchi)
            }
            None => (0, 0, 0),
        }
    }

    /// Give the winner's equipped hero its XP and its cut of a cash award. Returns the cut.
    fn reward_hero(&mut self, account: &AccountId, amount: u128, xp: u64) -> u128 {
        let finish = match xp {
            XP_FINAL => 4,
            XP_ENDURANCE => 3,
            XP_VOLUME => 2,
            _ => 1,
        };
        let ps = self.pass_stats.entry(account.clone()).or_default();
        ps.wins += 1;
        ps.best_finish = ps.best_finish.max(finish);
        let Some(hero) = self.equipped_of(account.clone()) else { return 0 };
        let cut = amount * HERO_POT_BPS / BPS;
        let st = self.hero_stats.entry(hero.token_id.clone()).or_default();
        st.xp += xp * (100 + gear_xp_bonus(&st.gear)) / 100;
        st.wins += 1;
        self.credit_hero(&hero.token_id, cut, "pot");
        cut
    }

    /// Put NEAR into a hero's vault. If the hero has its own account, the NEAR is sent there.
    fn credit_hero(&mut self, token_id: &TokenId, amount: u128, source: &str) {
        if amount == 0 {
            return;
        }
        let st = self.hero_stats.entry(token_id.clone()).or_default();
        st.vault += amount;
        st.lifetime_earned += amount;
        if st.account_open {
            let _ = Promise::new(hero_account_id(token_id)).transfer(NearToken::from_yoctonear(amount));
        }
        emit("hero_earned", &format!(r#"{{"token_id":"{}","amount":"{}","source":"{}"}}"#, token_id, amount, source));
    }

    /// Drop a gear item into the winner's equipped hero, if it has a free slot.
    fn drop_gear(&mut self, account: &AccountId, salt: &[u8]) {
        let Some(hero) = self.equipped_of(account.clone()) else { return };
        let roll = hash(&[&env::random_seed(), &self.cycle.seed, salt, hero.token_id.as_bytes()]);
        let r = roll[0] as u32 * 256 + roll[1] as u32; // 0..65535
        let st = self.hero_stats.entry(hero.token_id.clone()).or_default();
        let candidates: Vec<u8> = (0..GEAR.len() as u8).filter(|g| !st.gear.contains(g)).collect();
        if st.gear.len() >= GEAR_SLOTS || candidates.is_empty() {
            return;
        }
        // Aurora Gem is rare: 10% of drops; the rest split evenly among the common items.
        let gem = 3u8;
        let item = if candidates.contains(&gem) && r % 10 == 0 {
            gem
        } else {
            let common: Vec<u8> = candidates.iter().copied().filter(|g| *g != gem).collect();
            if common.is_empty() {
                return;
            }
            common[(r as usize / 10) % common.len()]
        };
        st.gear.push(item);
        emit("gear_found", &format!(r#"{{"token_id":"{}","item":"{}"}}"#, hero.token_id, GEAR[item as usize].0));
    }

    fn assert_hero(&self, token_id: &TokenId) {
        require!(!token_id.starts_with(PASS_PREFIX), "The Boundora Pass is soulbound: it can't be sold, bid on or transferred");
        require!(index_of_token(token_id).is_some(), "No such hero");
    }

    fn assert_not_pass(&self, token_id: &TokenId) {
        require!(!token_id.starts_with(PASS_PREFIX), "The Boundora Pass is soulbound: it can't be sold, bid on or transferred");
    }

    fn stats_of(&self, token_id: &TokenId) -> HeroStats {
        self.hero_stats.get(token_id).cloned().unwrap_or_default()
    }

    /// NEP-171 token with live metadata: level, XP, wins and vault are written into the
    /// title, description and `extra` every time the token is read.
    fn decorate(&self, mut token: Token) -> Token {
        if token.token_id.starts_with(PASS_PREFIX) {
            let ps = self.pass_stats.get(&token.owner_id).cloned().unwrap_or_default();
            if let Some(meta) = token.metadata.as_mut() {
                meta.title = Some(format!("Boundora Pass: {}", token.owner_id));
                meta.description = Some(format!(
                    "Soulbound membership, required to play. Member since round {}. {} rounds, {} strikes, {} wins. Best finish: {}.",
                    ps.joined_cycle, ps.rounds, ps.strikes, ps.wins, finish_name(ps.best_finish)
                ));
                meta.extra = Some(format!(
                    r#"{{"kind":"pass","soulbound":true,"member":"{}","joined_at_ms":{},"joined_cycle":{},"rounds":{},"strikes":{},"wins":{},"best_finish":"{}"}}"#,
                    token.owner_id, ps.joined_at_ms, ps.joined_cycle, ps.rounds, ps.strikes, ps.wins, finish_name(ps.best_finish)
                ));
            }
            return token;
        }
        let Some(n) = index_of_token(&token.token_id) else { return token };
        let r = rarity_of_index(n);
        let st = self.stats_of(&token.token_id);
        let level = level_for_xp(st.xp);
        if let Some(meta) = token.metadata.as_mut() {
            meta.title = Some(format!("Boundora Hero #{} (Lv {})", n + 1, level));
            meta.description = Some(format!(
                "{} hero, level {}. Power when equipped: {}. Level bonus: +{} s per strike. Vault: {} yoctoNEAR, claimable by the owner.",
                r.name(),
                level,
                r.power_text(),
                level_bonus_ms(level) / 1000,
                st.vault
            ));
            let base = meta.extra.clone().unwrap_or_else(|| "{}".into());
            let trimmed = base.trim_end().trim_end_matches('}');
            let sep = if trimmed.trim_end().ends_with('{') { "" } else { "," };
            meta.extra = Some(format!(
                r#"{}{}"level":{},"xp":{},"strikes":{},"wins":{},"vault":"{}","lifetime_earned":"{}","gear":[{}],"account":{}}}"#,
                trimmed,
                sep,
                level,
                st.xp,
                st.strikes,
                st.wins,
                st.vault,
                st.lifetime_earned,
                st.gear.iter().map(|g| format!(r#""{}""#, GEAR[*g as usize].0)).collect::<Vec<_>>().join(","),
                if st.account_open { format!(r#""{}""#, hero_account_id(&token.token_id)) } else { "null".into() }
            ));
        }
        token
    }

    fn hero_view(&self, token_id: &TokenId) -> Option<HeroView> {
        let n = index_of_token(token_id)?;
        let r = rarity_of_index(n);
        let st = self.stats_of(token_id);
        Some(HeroView {
            token_id: token_id.clone(),
            number: n + 1,
            rarity: r,
            power: r.power_text().to_string(),
            level: level_for_xp(st.xp),
            vault: U128(st.vault),
        })
    }

    /// Mint the next unminted hero of `want` (or the closest rarity still available,
    /// lower first). Returns None once all 20,000 are gone.
    fn take_hero(&mut self, owner: &AccountId, want: Rarity, rank: &str) -> Option<TokenId> {
        let w = want.idx();
        let order: Vec<usize> = (0..=w).rev().chain(w + 1..5).collect();
        let r = order.into_iter().map(|i| Rarity::ALL[i]).find(|r| self.minted_by_rarity[r.idx()] < r.supply())?;
        let k = self.minted_by_rarity[r.idx()];
        self.minted_by_rarity[r.idx()] += 1;
        let n = index_for(r, k);
        let token_id = format!("hero-{}", n + 1);
        let meta = TokenMetadata {
            title: Some(format!("Boundora Hero #{}", n + 1)),
            description: Some(format!("{} hero. Power when equipped: {}.", r.name(), r.power_text())),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(format!(
                r#"{{"number":{},"rarity":"{}","won_for":"{}","cycle":{},"renderer":"boundora-heroes-v1"}}"#,
                n + 1,
                r.name(),
                rank,
                self.cycle.id
            )),
            reference: None,
            reference_hash: None,
        };
        self.art.internal_mint_with_refund(token_id.clone(), owner.clone(), Some(meta), None);
        emit("hero_minted", &format!(r#"{{"owner_id":"{}","token_id":"{}","rarity":"{}"}}"#, owner, token_id, r.name()));
        Some(token_id)
    }

    fn current_cost(&self) -> u128 {
        let base = self.config.base_cost.0;
        base + base * self.config.cost_step_bps as u128 * self.cycle.gesture_count as u128 / BPS
    }

    fn receipt(&self, accepted: bool, message: &str) -> GestureReceipt {
        GestureReceipt {
            cycle_id: self.cycle.id,
            accepted,
            message: message.to_string(),
            ends_at: U64(self.cycle.ends_at),
            pool: U128(self.cycle.pool),
            next_cost: U128(self.current_cost()),
        }
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let cur = self.claimable.get(account).copied().unwrap_or(0);
        self.claimable.insert(account.clone(), cur + amount);
    }

    fn mint_art(&mut self, owner: &AccountId, rank: &str, count: u32, rarity: Rarity) -> Vec<TokenId> {
        (0..count).filter_map(|_| self.take_hero(owner, rarity, rank)).collect()
    }

    /// Settle the cycle if its clock has run out and open the next one. Returns true if it settled.
    fn settle_if_ended(&mut self, now: u64) -> bool {
        if !self.cycle_ended(now) {
            return false;
        }
        let cfg = self.config.clone();
        let pool = self.cycle.pool;
        let entropy = env::random_seed();
        let mut awards: Vec<Award> = vec![];
        let mut rolled_over = pool;

        if let Some(final_player) = self.cycle.last_gesturer.clone() {
            // Close out the final holder's endurance time.
            let idx = self.find_player(&final_player).unwrap();
            let tail = self.cycle.ends_at.saturating_sub(self.cycle.last_gesture_at);
            self.cycle.players[idx].held_ns = U64(self.cycle.players[idx].held_ns.0 + tail);

            let share = |bps: u32| pool * bps as u128 / BPS;
            let mut paid: u128 = 0;
            let mut final_amt = share(cfg.final_bps);

            // Endurance champion: longest hold, excluding the final gesturer.
            let endurance = self
                .cycle
                .players
                .iter()
                .filter(|p| p.account_id != final_player && p.held_ns.0 > 0)
                .max_by_key(|p| p.held_ns.0)
                .map(|p| p.account_id.clone());
            if endurance.is_none() {
                final_amt += share(cfg.endurance_bps);
            }

            // Volume leaders (anyone, final gesturer included).
            let mut by_volume = self.cycle.players.clone();
            by_volume.sort_by(|a, b| b.volume.0.cmp(&a.volume.0));
            let leaders: Vec<AccountId> = by_volume
                .iter()
                .take(cfg.volume_winners as usize)
                .map(|p| p.account_id.clone())
                .collect();
            let per_leader = share(cfg.volume_bps) / leaders.len() as u128;

            let roll = u64::from_le_bytes(hash(&[&entropy, &self.cycle.seed, b"mythic"])[..8].try_into().unwrap()) % BPS as u64;
            let top = if roll < cfg.mythic_chance_bps as u64 { Rarity::Mythic } else { Rarity::Legendary };
            let art = self.mint_art(&final_player, "final gesture", cfg.art_final, top);
            self.drop_gear(&final_player, b"final");
            let cut = self.reward_hero(&final_player, final_amt, XP_FINAL);
            self.credit(&final_player, final_amt - cut);
            paid += final_amt;
            awards.push(Award {
                account_id: final_player.clone(),
                rank: "final".into(),
                amount: U128(final_amt),
                art_token_ids: art,
            });

            if let Some(champ) = &endurance {
                let amt = share(cfg.endurance_bps);
                let art = self.mint_art(champ, "endurance", cfg.art_endurance, Rarity::Epic);
                self.drop_gear(champ, b"endurance");
                let cut = self.reward_hero(champ, amt, XP_ENDURANCE);
                self.credit(champ, amt - cut);
                paid += amt;
                awards.push(Award {
                    account_id: champ.clone(),
                    rank: "endurance".into(),
                    amount: U128(amt),
                    art_token_ids: art,
                });
            }

            for leader in &leaders {
                let art = self.mint_art(leader, "volume", cfg.art_volume, Rarity::Rare);
                let cut = self.reward_hero(leader, per_leader, XP_VOLUME);
                self.credit(leader, per_leader - cut);
                paid += per_leader;
                awards.push(Award {
                    account_id: leader.clone(),
                    rank: "volume".into(),
                    amount: U128(per_leader),
                    art_token_ids: art,
                });
            }

            // Raffle the remaining art among players who did not place.
            let mut others: Vec<AccountId> = self
                .cycle
                .players
                .iter()
                .map(|p| p.account_id.clone())
                .filter(|a| awards.iter().all(|w| &w.account_id != a))
                .collect();
            let mut r = hash(&[&entropy, &self.cycle.seed, b"raffle"]);
            for _ in 0..cfg.art_raffle {
                if others.is_empty() {
                    break;
                }
                let pick = (u64::from_le_bytes(r[..8].try_into().unwrap()) % others.len() as u64) as usize;
                let lucky = others.remove(pick);
                self.reward_hero(&lucky, 0, XP_RAFFLE);
                let art = self.mint_art(&lucky, "raffle", 1, Rarity::Common);
                awards.push(Award {
                    account_id: lucky,
                    rank: "raffle".into(),
                    amount: U128(0),
                    art_token_ids: art,
                });
                r = hash(&[&r]);
            }

            let treasury_cut = share(cfg.treasury_bps);
            self.treasury += treasury_cut;
            paid += treasury_cut;
            rolled_over = pool - paid; // rollover share plus rounding dust
        }

        let summary = CycleSummary {
            id: self.cycle.id,
            ended_at: U64(self.cycle.ends_at),
            pool: U128(pool),
            gestures: self.cycle.gesture_count,
            players: self.cycle.players.len() as u32,
            seed: hex(&self.cycle.seed),
            awards,
            rolled_over: U128(rolled_over),
        };
        emit(
            "cycle_finalized",
            &format!(
                r#"{{"cycle_id":{},"pool":"{}","rolled_over":"{}","players":{}}}"#,
                summary.id, pool, rolled_over, summary.players
            ),
        );
        self.history.push(summary);

        let opens_at = now + cfg.cooldown_ms.0 * MS;
        self.cycle = Cycle {
            id: self.cycle.id + 1,
            opens_at,
            ends_at: opens_at + cfg.initial_duration_ms.0 * MS,
            pool: rolled_over,
            gesture_count: 0,
            last_gesturer: None,
            last_gesture_at: opens_at,
            seed: hash(&[&self.cycle.seed, &entropy]),
            players: vec![],
        };
        true
    }
}

fn hash(parts: &[&[u8]]) -> [u8; 32] {
    let mut buf = vec![];
    for p in parts {
        buf.extend_from_slice(p);
    }
    env::sha256_array(&buf)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn emit(event: &str, data: &str) {
    log!(
        r#"EVENT_JSON:{{"standard":"boundora","version":"1.0.0","event":"{}","data":[{}]}}"#,
        event,
        data
    );
}

// ---------------------------------------------------------------- NEP-171 (Orbit Art)

#[near]
impl NonFungibleTokenCore for Boundora {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        self.assert_not_pass(&token_id);
        self.art.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.assert_not_pass(&token_id);
        self.art.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.art.nft_token(token_id).map(|t| self.decorate(t))
    }
}

#[near]
impl NonFungibleTokenResolver for Boundora {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.art.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Boundora {
    fn nft_total_supply(&self) -> U128 {
        self.art.nft_total_supply()
    }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.art.nft_tokens(from_index, limit).into_iter().map(|t| self.decorate(t)).collect()
    }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.art.nft_supply_for_owner(account_id)
    }
    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.art.nft_tokens_for_owner(account_id, from_index, limit).into_iter().map(|t| self.decorate(t)).collect()
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Boundora {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.art_metadata.get().unwrap()
    }
}

#[near]
impl NonFungibleTokenApproval for Boundora {
    #[payable]
    fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise> {
        self.assert_not_pass(&token_id);
        self.art.nft_approve(token_id, account_id, msg)
    }
    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.art.nft_revoke(token_id, account_id)
    }
    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.art.nft_revoke_all(token_id)
    }
    fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool {
        self.art.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

/// Lock an NFT from a whitelisted collection by calling `nft_transfer_call` on that
/// collection with this contract as receiver. While locked it counts as a pass.
#[near]
impl NonFungibleTokenReceiver for Boundora {
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: TokenId,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = (sender_id, msg);
        let collection = env::predecessor_account_id();
        if !self.collections.contains(&collection) {
            log!("{} is not an eligible collection; returning token", collection);
            return PromiseOrValue::Value(true);
        }
        let mut locks = self.locks.get(&previous_owner_id).cloned().unwrap_or_default();
        locks.push(LockedNft { collection: collection.clone(), token_id: token_id.clone() });
        self.locks.insert(previous_owner_id.clone(), locks);
        emit(
            "nft_locked",
            &format!(r#"{{"account_id":"{}","collection":"{}","token_id":"{}"}}"#, previous_owner_id, collection, token_id),
        );
        PromiseOrValue::Value(false)
    }
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const SEC: u64 = 1_000_000_000;

    /// NEAR to yocto without float error (precision: 0.001 NEAR).
    fn near(n: f64) -> u128 {
        let milli = (n * 1000.0).round() as u128;
        milli * 10u128.pow(21)
    }

    fn ctx(who: usize, deposit: u128, t: u64) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(accounts(who))
            .current_account_id("boundora.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(t)
            .account_balance(NearToken::from_near(1000))
            .random_seed([7u8; 32]);
        b
    }

    fn setup() -> Boundora {
        testing_env!(ctx(0, 0, 1_000 * SEC).build());
        // NEAR at $5.00, so the $5 pass costs exactly 1 NEAR in most tests
        Boundora::new(accounts(0), None, None, Some(U64(5_000_000)))
    }

    fn mint(c: &mut Boundora, who: usize, t: u64) {
        testing_env!(ctx(who, near(1.0), t).build());
        c.mint_pass();
    }

    fn gesture(c: &mut Boundora, who: usize, amount: u128, t: u64) -> GestureReceipt {
        testing_env!(ctx(who, amount, t).build());
        c.gesture()
    }

    #[test]
    #[should_panic(expected = "Mint your Boundora Pass")]
    fn gesture_needs_pass() {
        let mut c = setup();
        gesture(&mut c, 1, near(0.1), 1_001 * SEC);
    }

    #[test]
    fn one_pass_per_account() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let v = c.passes_of(accounts(1));
        assert_eq!(v.minted, 1);
        assert_eq!(v.stake_multiplier, 1);
        assert_eq!(c.get_treasury().0, near(1.0));
    }

    #[test]
    #[should_panic(expected = "maximum number of passes")]
    fn second_pass_is_refused() {
        let mut c = setup();
        for _ in 0..2 {
            mint(&mut c, 1, 1_001 * SEC);
        }
    }

    #[test]
    fn gesture_extends_clock_and_raises_cost() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let before = c.get_cycle();
        let r = gesture(&mut c, 1, near(0.1), 1_010 * SEC);
        assert!(r.accepted);
        assert_eq!(r.ends_at.0, before.ends_at.0 + 60 * SEC);
        assert_eq!(r.next_cost.0, near(0.1) + near(0.1) * 200 / 10_000);
        assert_eq!(r.pool.0, near(0.1));
    }

    #[test]
    fn clock_is_capped_at_max_remaining() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let mut t = 1_002 * SEC;
        for _ in 0..10 {
            let cost = c.get_cycle().current_cost.0;
            gesture(&mut c, 1, cost, t);
            t += SEC;
        }
        let v = c.get_cycle();
        assert!(v.ends_at.0 <= t + 15 * 60 * SEC);
    }

    #[test]
    #[should_panic(expected = "exceeds cost")]
    fn stake_limited_by_passes() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        gesture(&mut c, 1, near(0.2), 1_002 * SEC);
    }

    #[test]
    fn locked_nft_allows_bigger_stake() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        testing_env!(ctx(0, 0, 1_001 * SEC).build());
        c.add_collection("apes.testnet".parse().unwrap());
        let mut b = ctx(0, 0, 1_001 * SEC);
        b.predecessor_account_id("apes.testnet".parse().unwrap());
        testing_env!(b.build());
        let _ = c.nft_on_transfer(accounts(1), accounts(1), "7".into(), "".into());
        assert!(gesture(&mut c, 1, near(0.2), 1_002 * SEC).accepted);
    }

    #[test]
    fn full_cycle_pays_winners_and_mints_art() {
        let mut c = setup();
        for who in 1..=5 {
            mint(&mut c, who, 1_001 * SEC);
        }
        let big = give_hero(&mut c, 2, Rarity::Legendary); // bob gets +1 chi from a hero
        testing_env!(ctx(2, 0, 1_001 * SEC).build());
        c.equip_hero(Some(big));

        // alice(1) opens and holds for 200s, bob(2) stakes big, others chip in, eve(5) ends it
        let k = c_cost(&c);
        gesture(&mut c, 1, k, 1_010 * SEC);
        let cost = c_cost(&c);
        gesture(&mut c, 2, cost * 2, 1_210 * SEC);
        let k = c_cost(&c);
        gesture(&mut c, 3, k, 1_220 * SEC);
        let k = c_cost(&c);
        gesture(&mut c, 4, k, 1_230 * SEC);
        let k = c_cost(&c);
        gesture(&mut c, 5, k, 1_240 * SEC);
        let pool = c.get_cycle().pool.0;
        let ends = c.get_cycle().ends_at.0;

        testing_env!(ctx(0, 0, ends + SEC).build());
        let s = c.finalize().expect("settled");
        assert_eq!(s.pool.0, pool);

        let final_award = s.awards.iter().find(|a| a.rank == "final").unwrap();
        assert_eq!(final_award.account_id, accounts(5));
        assert_eq!(final_award.amount.0, pool * 3500 / 10_000);
        assert_eq!(final_award.art_token_ids.len(), 1);
        let top = c.nft_token(final_award.art_token_ids[0].clone()).map(|t| c.hero_view(&t.token_id).unwrap().rarity).unwrap();
        assert!(top == Rarity::Legendary || top == Rarity::Mythic);

        let endurance = s.awards.iter().find(|a| a.rank == "endurance").unwrap();
        assert_eq!(endurance.account_id, accounts(1)); // held 200s
        assert_eq!(endurance.art_token_ids.len(), 1);
        assert_eq!(c.hero_view(&endurance.art_token_ids[0]).unwrap().rarity, Rarity::Epic);

        let vol: Vec<_> = s.awards.iter().filter(|a| a.rank == "volume").collect();
        assert_eq!(vol.len(), 3);
        assert_eq!(vol[0].account_id, accounts(2));

        // 1 + 1 + 3 + raffle (up to 2 among non-placers)
        let minted: usize = s.awards.iter().map(|a| a.art_token_ids.len()).sum();
        // + bob's pre-owned hero + 5 soulbound pass tokens
        assert_eq!(c.nft_total_supply().0 as usize, minted + 1 + 5);
        assert!(minted >= 5 && minted <= 7);

        // Accounting: everything is either credited, in treasury, or rolled forward.
        let credited: u128 = (1..=5).map(|i| c.claimable_of(accounts(i)).0).sum();
        let treasury_from_pool = c.get_treasury().0 - near(5.0);
        let in_hero_vaults: u128 =
            c.nft_tokens(None, None).iter().filter(|t| t.token_id.starts_with("hero-")).map(|t| c.hero_stats(t.token_id.clone()).vault.0).sum();
        assert_eq!(credited + treasury_from_pool + in_hero_vaults + s.rolled_over.0, pool);

        // Next cycle starts with the rollover and a cooldown.
        let next = c.get_cycle();
        assert_eq!(next.id, 2);
        assert_eq!(next.pool.0, s.rolled_over.0);
        assert_eq!(next.status, "cooldown");

        // Winners can claim.
        testing_env!(ctx(5, 0, ends + 2 * SEC).build());
        let eve_total: u128 = s.awards.iter().filter(|a| a.account_id == accounts(5)).map(|a| a.amount.0).sum();
        assert_eq!(c.claim().0, eve_total);
        assert_eq!(c.claimable_of(accounts(5)).0, 0);

        // Art metadata carries the seed for the renderer.
        let tok = c.nft_token(final_award.art_token_ids[0].clone()).unwrap();
        assert!(tok.metadata.unwrap().extra.unwrap().contains("boundora-heroes-v1"));
    }

    #[test]
    fn solo_player_takes_endurance_share_too() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        gesture(&mut c, 1, near(0.1), 1_002 * SEC);
        let ends = c.get_cycle().ends_at.0;
        testing_env!(ctx(0, 0, ends).build());
        let s = c.finalize().unwrap();
        let fin = s.awards.iter().find(|a| a.rank == "final").unwrap();
        assert_eq!(fin.amount.0, near(0.1) * 5500 / 10_000);
    }

    #[test]
    fn late_gesture_settles_and_is_refunded_during_cooldown() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        mint(&mut c, 2, 1_001 * SEC);
        gesture(&mut c, 1, near(0.1), 1_002 * SEC);
        let ends = c.get_cycle().ends_at.0;
        let r = gesture(&mut c, 2, near(0.1), ends + SEC);
        assert!(!r.accepted);
        assert_eq!(c.get_cycle().id, 2);
        assert_eq!(c.get_history(None).len(), 1);
    }

    #[test]
    fn empty_cycle_rolls_pool_forward() {
        let mut c = setup();
        let ends = c.get_cycle().ends_at.0;
        testing_env!(ctx(0, 0, ends).build());
        let s = c.finalize().unwrap();
        assert!(s.awards.is_empty());
        assert_eq!(c.get_cycle().id, 2);
    }

    #[test]
    #[should_panic(expected = "still running")]
    fn cannot_finalize_early() {
        let mut c = setup();
        testing_env!(ctx(0, 0, 1_005 * SEC).build());
        c.finalize();
    }

    #[test]
    fn pass_price_tracks_near_usd() {
        let mut c = setup();
        assert_eq!(c.pass_quote().price.0, near(1.0));
        testing_env!(ctx(0, 0, 1_001 * SEC).build());
        c.set_near_usd_price(U64(2_500_000)); // NEAR at $2.50
        assert_eq!(c.pass_quote().price.0, near(2.0));
        // overpay 3 NEAR: charged 2, refunded 1
        testing_env!(ctx(1, near(3.0), 1_002 * SEC).build());
        c.mint_pass();
        assert_eq!(c.get_treasury().0, near(2.0));
    }

    #[test]
    #[should_panic(expected = "Attach the pass price")]
    fn underpaying_the_pass_fails() {
        let mut c = setup();
        testing_env!(ctx(1, near(0.9), 1_001 * SEC).build());
        c.mint_pass();
    }

    #[test]
    fn small_price_moves_are_tolerated() {
        let mut c = setup();
        testing_env!(ctx(1, near(0.995), 1_001 * SEC).build()); // within 1%
        c.mint_pass();
        assert_eq!(c.passes_of(accounts(1)).minted, 1);
    }

    #[test]
    #[should_panic(expected = "stale")]
    fn stale_price_blocks_minting() {
        let mut c = setup();
        testing_env!(ctx(1, near(1.0), 1_000 * SEC + 7 * 3600 * SEC).build());
        c.mint_pass();
    }

    #[test]
    #[should_panic(expected = "price keeper")]
    fn only_keeper_posts_prices() {
        let mut c = setup();
        testing_env!(ctx(3, 0, 1_001 * SEC).build());
        c.set_near_usd_price(U64(1_000_000));
    }

    #[test]
    #[should_panic(expected = "Mint your Boundora Pass")]
    fn locked_nft_alone_cannot_play() {
        let mut c = setup();
        testing_env!(ctx(0, 0, 1_001 * SEC).build());
        c.add_collection("apes.testnet".parse().unwrap());
        let mut b = ctx(0, 0, 1_002 * SEC);
        b.predecessor_account_id("apes.testnet".parse().unwrap());
        testing_env!(b.build());
        let _ = c.nft_on_transfer(accounts(3), accounts(3), "42".into(), "".into());
        gesture(&mut c, 3, near(0.1), 1_003 * SEC);
    }

    #[test]
    fn locked_nft_adds_chi_on_top_of_pass() {
        let mut c = setup();
        mint(&mut c, 3, 1_001 * SEC);
        testing_env!(ctx(0, 0, 1_001 * SEC).build());
        c.add_collection("apes.testnet".parse().unwrap());
        let mut b = ctx(0, 0, 1_002 * SEC);
        b.predecessor_account_id("apes.testnet".parse().unwrap());
        testing_env!(b.build());
        let _ = c.nft_on_transfer(accounts(3), accounts(3), "42".into(), "".into());
        assert_eq!(c.passes_of(accounts(3)).total, 2);
        assert!(gesture(&mut c, 3, near(0.2), 1_003 * SEC).accepted);
    }

    fn give_hero(c: &mut Boundora, who: usize, r: Rarity) -> TokenId {
        testing_env!(ctx(0, 0, 1_001 * SEC).build());
        c.take_hero(&accounts(who), r, "test").unwrap()
    }

    #[test]
    fn rarity_schedule_is_exact_and_invertible() {
        let mut counts = [0u64; 5];
        let mut seen = std::collections::HashSet::new();
        for n in 0..SUPPLY {
            counts[rarity_of_index(n).idx()] += 1;
        }
        assert_eq!(counts, [8400, 5600, 3400, 1800, 800]);
        for r in Rarity::ALL {
            for k in 0..r.supply() {
                let n = index_for(r, k);
                assert_eq!(rarity_of_index(n), r);
                assert!(seen.insert(n));
            }
        }
        assert_eq!(seen.len() as u64, SUPPLY);
    }

    #[test]
    fn public_mint_charges_price_and_caps_per_account() {
        let mut c = setup();
        for i in 0..5 {
            testing_env!(ctx(1, near(2.0), (1_001 + i) * SEC).build());
            let h = c.mint_hero();
            assert!(h.number >= 1 && h.number <= SUPPLY);
        }
        assert_eq!(c.nft_supply_for_owner(accounts(1)).0, 5);
        assert_eq!(c.hero_supply().minted, 5);
        assert_eq!(c.get_treasury().0, near(10.0));
    }

    #[test]
    #[should_panic(expected = "mint limit")]
    fn sixth_mint_is_refused() {
        let mut c = setup();
        for i in 0..6 {
            testing_env!(ctx(1, near(2.0), (1_001 + i) * SEC).build());
            c.mint_hero();
        }
    }

    #[test]
    fn rarity_falls_back_when_sold_out() {
        let mut c = setup();
        for _ in 0..800 {
            give_hero(&mut c, 1, Rarity::Mythic);
        }
        let next = give_hero(&mut c, 1, Rarity::Mythic);
        assert_eq!(c.hero_view(&next).unwrap().rarity, Rarity::Legendary);
    }

    #[test]
    fn epic_hero_discounts_strikes() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(1, 0, 1_001 * SEC).build());
        c.equip_hero(Some(id));
        assert!(gesture(&mut c, 1, near(0.09), 1_002 * SEC).accepted); // 10% under base cost
    }

    #[test]
    #[should_panic(expected = "below the current gesture cost")]
    fn discount_needs_hero() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        gesture(&mut c, 1, near(0.09), 1_002 * SEC);
    }

    #[test]
    fn legendary_adds_chi_and_rare_adds_time() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Legendary);
        testing_env!(ctx(1, 0, 1_001 * SEC).build());
        c.equip_hero(Some(id));
        assert!(gesture(&mut c, 1, near(0.2), 1_002 * SEC).accepted); // 2x with one pass

        mint(&mut c, 2, 1_003 * SEC);
        let rare = give_hero(&mut c, 2, Rarity::Rare);
        testing_env!(ctx(2, 0, 1_003 * SEC).build());
        c.equip_hero(Some(rare));
        let before = c.get_cycle().ends_at.0;
        let k = c_cost(&c);
        let r = gesture(&mut c, 2, k, 1_004 * SEC);
        assert_eq!(r.ends_at.0, before + 63 * SEC);
    }

    #[test]
    #[should_panic(expected = "don't own")]
    fn cannot_equip_someone_elses_hero() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(2, 0, 1_001 * SEC).build());
        c.equip_hero(Some(id));
    }

    #[test]
    fn power_stops_after_transfer_and_royalty_is_paid() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Mythic);
        testing_env!(ctx(1, 0, 1_001 * SEC).build());
        c.equip_hero(Some(id.clone()));
        assert!(c.equipped_of(accounts(1)).is_some());
        let p = c.nft_payout(id.clone(), U128(near(10.0)), Some(10));
        assert_eq!(p.payout.get(&accounts(0)).unwrap().0, near(0.5));
        assert_eq!(p.payout.get(&accounts(1)).unwrap().0, near(9.5));
        testing_env!(ctx(1, 1, 1_002 * SEC).build());
        c.nft_transfer(accounts(2), id, None, None);
        assert!(c.equipped_of(accounts(1)).is_none());
    }

    #[test]
    fn market_list_buy_pays_seller_and_royalty() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        c.list_hero(id.clone(), U128(near(4.0)));
        assert_eq!(c.get_listings(None, None).len(), 1);
        testing_env!(ctx(2, near(4.0), 1_003 * SEC).build());
        let sale = c.buy_hero(id.clone());
        assert_eq!(sale.royalty.0, near(0.2));
        assert_eq!(c.nft_token(id.clone()).unwrap().owner_id, accounts(2));
        assert!(c.equipped_of(accounts(1)).is_none());
        assert_eq!(c.get_listings(None, None).len(), 0);
        // 5% royalty: 60% to the treasury, 40% into the hero's own vault
        assert_eq!(c.get_treasury().0, near(0.12));
        assert_eq!(c.hero_stats(id.clone()).vault.0, near(0.08));
        assert_eq!(c.get_sales(None).len(), 1);
    }

    #[test]
    #[should_panic(expected = "Attach the listed price")]
    fn market_needs_full_price() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(id.clone(), U128(near(3.0)));
        testing_env!(ctx(2, near(1.0), 1_003 * SEC).build());
        c.buy_hero(id);
    }

    #[test]
    #[should_panic(expected = "don't own")]
    fn cannot_list_someone_elses_hero() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(2, 0, 1_002 * SEC).build());
        c.list_hero(id, U128(near(1.0)));
    }

    #[test]
    fn listing_goes_stale_after_outside_transfer() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Common);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(id.clone(), U128(near(1.0)));
        testing_env!(ctx(1, 1, 1_003 * SEC).build());
        c.nft_transfer(accounts(3), id.clone(), None, None);
        assert!(c.listing_of(id.clone()).is_none());
        testing_env!(ctx(4, 0, 1_004 * SEC).build());
        c.delist_hero(id); // anyone can clear a stale listing
    }

    fn bid(c: &mut Boundora, who: usize, id: &TokenId, amt: u128, t: u64) -> Bid {
        testing_env!(ctx(who, amt, t).build());
        c.place_bid(id.clone())
    }

    #[test]
    fn owner_can_accept_any_bid() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        bid(&mut c, 2, &id, near(5.0), 1_002 * SEC);
        bid(&mut c, 3, &id, near(3.0), 1_003 * SEC);
        bid(&mut c, 3, &id, near(1.0), 1_004 * SEC); // top-up: carol now bids 4
        assert_eq!(c.bids_on(id.clone())[1].amount.0, near(4.0));
        testing_env!(ctx(1, 0, 1_005 * SEC).build());
        let sale = c.accept_bid(id.clone(), accounts(3)); // owner picks the lower bid
        assert_eq!(sale.price.0, near(4.0));
        assert_eq!(c.nft_token(id.clone()).unwrap().owner_id, accounts(3));
        assert!(c.bids_on(id.clone()).is_empty()); // bob refunded
        assert_eq!(c.get_treasury().0, near(0.12));
        assert_eq!(c.hero_stats(id.clone()).vault.0, near(0.08));
    }

    #[test]
    fn auction_goes_to_highest_bidder_automatically() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Legendary);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.start_auction(id.clone(), U64(10 * 60 * 1000), Some(U128(near(2.0))));
        bid(&mut c, 2, &id, near(2.0), 1_010 * SEC);
        bid(&mut c, 3, &id, near(3.0), 1_020 * SEC);
        bid(&mut c, 2, &id, near(1.5), 1_030 * SEC); // bob tops up to 3.5 (beats 3.0 by > 5%)
        testing_env!(ctx(4, 0, 1_002 * SEC + 600 * SEC).build());
        let sale = c.settle_auction(id.clone()).unwrap();
        assert_eq!(sale.buyer, accounts(2));
        assert_eq!(sale.price.0, near(3.5));
        assert!(c.bids_on(id).is_empty());
    }

    #[test]
    #[should_panic(expected = "beat the highest by 5%")]
    fn auction_bids_must_beat_highest() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.start_auction(id.clone(), U64(60_000), None);
        bid(&mut c, 2, &id, near(2.0), 1_010 * SEC);
        bid(&mut c, 3, &id, near(2.05), 1_011 * SEC);
    }

    #[test]
    fn auction_below_reserve_refunds_everyone() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.start_auction(id.clone(), U64(60_000), Some(U128(near(10.0))));
        testing_env!(ctx(0, 0, 1_002 * SEC).build());
        // a bid placed before the auction counts but is under the reserve
        testing_env!(ctx(1, 0, 1_100 * SEC).build());
        assert!(c.settle_auction(id.clone()).is_none());
        assert_eq!(c.nft_token(id).unwrap().owner_id, accounts(1));
    }

    #[test]
    #[should_panic(expected = "still running")]
    fn cannot_settle_early() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.start_auction(id.clone(), U64(60_000), None);
        c.settle_auction(id);
    }

    #[test]
    #[should_panic(expected = "locked until the auction ends")]
    fn no_withdrawing_during_auction() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Rare);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.start_auction(id.clone(), U64(60_000), None);
        bid(&mut c, 2, &id, near(1.0), 1_010 * SEC);
        testing_env!(ctx(2, 0, 1_011 * SEC).build());
        c.withdraw_bid(id);
    }

    #[test]
    fn withdraw_and_buy_now_refunds() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Common);
        bid(&mut c, 2, &id, near(0.5), 1_002 * SEC);
        bid(&mut c, 3, &id, near(0.7), 1_003 * SEC);
        testing_env!(ctx(2, 0, 1_004 * SEC).build());
        assert_eq!(c.withdraw_bid(id.clone()).0, near(0.5));
        testing_env!(ctx(1, 0, 1_005 * SEC).build());
        c.list_hero(id.clone(), U128(near(1.0)));
        testing_env!(ctx(4, near(1.0), 1_006 * SEC).build());
        c.buy_hero(id.clone());
        assert!(c.bids_on(id).is_empty()); // carol refunded on sale
    }

    #[test]
    #[should_panic(expected = "own hero")]
    fn cannot_bid_on_own_hero() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Common);
        bid(&mut c, 1, &id, near(1.0), 1_002 * SEC);
    }

    fn c_cost(c: &Boundora) -> u128 {
        c.get_cycle().current_cost.0
    }

    #[test]
    fn level_curve() {
        assert_eq!(level_for_xp(0), 1);
        assert_eq!(level_for_xp(39), 1);
        assert_eq!(level_for_xp(40), 2);
        assert_eq!(level_for_xp(160), 3);
        assert_eq!(level_for_xp(3240), 10);
        assert_eq!(level_for_xp(u64::MAX / 2), MAX_LEVEL);
        assert_eq!(xp_for_level(4), 360);
        assert_eq!(level_bonus_ms(3), 0);
        assert_eq!(level_bonus_ms(4), 1_000);
        assert_eq!(level_bonus_ms(50), 10_000);
    }

    #[test]
    fn equipped_hero_gains_xp_and_levels_show_in_nft_metadata() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let mut t = 1_003 * SEC;
        for _ in 0..4 {
            let cost = c.current_cost();
            gesture(&mut c, 1, cost, t);
            t += SEC;
        }
        let st = c.hero_stats(id.clone());
        assert_eq!(st.xp.0, 40);
        assert_eq!(st.strikes, 4);
        assert_eq!(st.level, 2);
        let tok = c.nft_token(id.clone()).unwrap();
        let meta = tok.metadata.unwrap();
        assert!(meta.title.unwrap().ends_with("(Lv 2)"));
        let extra = meta.extra.unwrap();
        assert!(extra.contains(r#""level":2"#) && extra.contains(r#""xp":40"#) && extra.contains(r#""won_for""#));
        assert!(serde_json_ok(&extra));
    }

    fn serde_json_ok(s: &str) -> bool {
        near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(s).is_ok()
    }

    #[test]
    fn hero_level_adds_clock_time() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        c.hero_stats.insert(id.clone(), HeroStats { xp: xp_for_level(4), ..Default::default() });
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let before = c.get_cycle().ends_at.0;
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_003 * SEC);
        let after = c.get_cycle().ends_at.0;
        // +60 s base, +1 s Common power, +1 s level-4 bonus
        assert_eq!(after - before, 62 * SEC);
    }

    #[test]
    fn winning_hero_keeps_a_cut_of_the_pot_in_its_vault() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_003 * SEC);
        let ends = c.get_cycle().ends_at.0;
        testing_env!(ctx(5, 0, ends + SEC).build());
        let s = c.finalize().unwrap();
        let won: u128 = s.awards.iter().filter(|a| a.account_id == accounts(1)).map(|a| a.amount.0).sum();
        let st = c.hero_stats(id.clone());
        assert!(won > 0);
        let cuts: u128 = s.awards.iter().filter(|a| a.account_id == accounts(1)).map(|a| a.amount.0 / 10).sum();
        assert_eq!(st.vault.0, cuts);
        assert_eq!(c.claimable_of(accounts(1)).0 + st.vault.0, won);
        assert!(st.wins >= 1 && st.xp.0 >= XP_STRIKE + XP_FINAL);
    }

    #[test]
    fn vault_travels_with_the_hero_and_only_owner_claims() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(id.clone(), U128(near(10.0)));
        testing_env!(ctx(2, near(10.0), 1_003 * SEC).build());
        c.buy_hero(id.clone());
        assert_eq!(c.hero_stats(id.clone()).vault.0, near(0.2));
        // new owner claims what the hero earned
        testing_env!(ctx(2, 0, 1_004 * SEC).build());
        assert_eq!(c.claim_hero_vault(id.clone()).0, near(0.2));
        assert_eq!(c.hero_stats(id.clone()).vault.0, 0);
        assert_eq!(c.hero_stats(id.clone()).lifetime_earned.0, near(0.2));
    }

    #[test]
    #[should_panic(expected = "Only the hero's owner")]
    fn seller_cannot_claim_after_selling() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(id.clone(), U128(near(10.0)));
        testing_env!(ctx(2, near(10.0), 1_003 * SEC).build());
        c.buy_hero(id.clone());
        testing_env!(ctx(1, 0, 1_004 * SEC).build());
        c.claim_hero_vault(id);
    }

    #[test]
    #[should_panic(expected = "Delist the hero")]
    fn cannot_drain_a_listed_hero() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        c.hero_stats.insert(id.clone(), HeroStats { vault: near(1.0), ..Default::default() });
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(id.clone(), U128(near(10.0)));
        c.claim_hero_vault(id);
    }

    #[test]
    fn claiming_refunds_open_bids() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        c.hero_stats.insert(id.clone(), HeroStats { vault: near(1.0), ..Default::default() });
        bid(&mut c, 2, &id, near(3.0), 1_002 * SEC);
        testing_env!(ctx(1, 0, 1_003 * SEC).build());
        assert_eq!(c.claim_hero_vault(id.clone()).0, near(1.0));
        assert!(c.bids_on(id).is_empty());
    }

    // ---------------- pass NFT, gear, hero accounts

    fn with_result(who: usize, t: u64, ok: bool) {
        use near_sdk::test_vm_config;
        use near_sdk::RuntimeFeesConfig;
        let mut b = ctx(who, 0, t);
        b.predecessor_account_id("boundora.testnet".parse().unwrap());
        let r = if ok { near_sdk::PromiseResult::Successful(vec![]) } else { near_sdk::PromiseResult::Failed };
        testing_env!(b.build(), test_vm_config(), RuntimeFeesConfig::test(), Default::default(), vec![r]);
    }

    #[test]
    fn pass_is_a_nep171_token_with_a_live_membership_record() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = format!("pass-{}", accounts(1));
        let tok = c.nft_token(id.clone()).unwrap();
        assert_eq!(tok.owner_id, accounts(1));
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_002 * SEC);
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_003 * SEC);
        let p = c.pass_of(accounts(1)).unwrap();
        assert_eq!((p.stats.rounds, p.stats.strikes), (1, 2));
        let ends = c.get_cycle().ends_at.0;
        testing_env!(ctx(5, 0, ends + SEC).build());
        c.finalize();
        let p = c.pass_of(accounts(1)).unwrap();
        assert_eq!(p.best_finish, "final strike");
        assert!(p.stats.wins >= 1);
        let meta = c.nft_token(id).unwrap().metadata.unwrap();
        assert!(meta.title.unwrap().starts_with("Boundora Pass"));
        let extra = meta.extra.unwrap();
        assert!(serde_json_ok(&extra) && extra.contains(r#""soulbound":true"#) && extra.contains(r#""best_finish":"final strike""#));
        assert!(c.pass_of(accounts(2)).is_none());
    }

    #[test]
    #[should_panic(expected = "soulbound")]
    fn pass_token_cannot_be_transferred() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        testing_env!(ctx(1, 1, 1_002 * SEC).build());
        c.nft_transfer(accounts(2), format!("pass-{}", accounts(1)), None, None);
    }

    #[test]
    #[should_panic(expected = "soulbound")]
    fn pass_token_cannot_be_listed() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.list_hero(format!("pass-{}", accounts(1)), U128(near(5.0)));
    }

    #[test]
    #[should_panic(expected = "soulbound")]
    fn pass_token_cannot_be_approved() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        testing_env!(ctx(1, near(0.01), 1_002 * SEC).build());
        c.nft_approve(format!("pass-{}", accounts(1)), accounts(3), None);
    }

    #[test]
    fn gear_is_bought_into_the_hero_and_boosts_it() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        testing_env!(ctx(1, near(0.5), 1_002 * SEC).build());
        let v = c.buy_gear(id.clone(), 0); // Frost Cloak
        assert_eq!(v.gear, vec!["Frost Cloak".to_string()]);
        assert_eq!(c.get_treasury().0, near(1.0) + near(0.5)); // pass + gear
        testing_env!(ctx(1, 0, 1_003 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let before = c.get_cycle().ends_at.0;
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_004 * SEC);
        // +60 s base, +1 s Common, +2 s cloak
        assert_eq!(c.get_cycle().ends_at.0 - before, 63 * SEC);
        let extra = c.nft_token(id).unwrap().metadata.unwrap().extra.unwrap();
        assert!(extra.contains(r#""gear":["Frost Cloak"]"#) && serde_json_ok(&extra));
    }

    #[test]
    fn snow_owl_boosts_xp_and_charm_cuts_cost() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        c.hero_stats.insert(id.clone(), HeroStats { gear: vec![1, 2], ..Default::default() });
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let full = c.current_cost();
        let cheap = full * 95 / 100;
        gesture(&mut c, 1, cheap, 1_003 * SEC); // accepted at 5% off
        assert_eq!(c.hero_stats(id).xp.0, 15);
    }

    #[test]
    #[should_panic(expected = "inventory is full")]
    fn inventory_has_three_slots() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Common);
        c.hero_stats.insert(id.clone(), HeroStats { gear: vec![0, 1, 2], ..Default::default() });
        testing_env!(ctx(1, near(3.0), 1_002 * SEC).build());
        c.buy_gear(id, 3);
    }

    #[test]
    #[should_panic(expected = "already carries")]
    fn no_duplicate_gear() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Common);
        c.hero_stats.insert(id.clone(), HeroStats { gear: vec![0], ..Default::default() });
        testing_env!(ctx(1, near(0.5), 1_002 * SEC).build());
        c.buy_gear(id, 0);
    }

    #[test]
    fn gear_moves_between_own_heroes_and_travels_on_sale() {
        let mut c = setup();
        let a = give_hero(&mut c, 1, Rarity::Common);
        let b = give_hero(&mut c, 1, Rarity::Rare);
        c.hero_stats.insert(a.clone(), HeroStats { gear: vec![3], ..Default::default() });
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.move_gear(a.clone(), b.clone(), 3);
        assert!(c.hero_stats(a).gear.is_empty());
        assert_eq!(c.hero_stats(b.clone()).gear, vec!["Aurora Gem".to_string()]);
        c.list_hero(b.clone(), U128(near(4.0)));
        testing_env!(ctx(2, near(4.0), 1_003 * SEC).build());
        c.buy_hero(b.clone());
        let v = c.hero_stats(b);
        assert_eq!(v.owner_id, Some(accounts(2)));
        assert_eq!(v.gear, vec!["Aurora Gem".to_string()]);
    }

    #[test]
    fn winners_hero_finds_gear() {
        let mut c = setup();
        mint(&mut c, 1, 1_001 * SEC);
        let id = give_hero(&mut c, 1, Rarity::Common);
        testing_env!(ctx(1, 0, 1_002 * SEC).build());
        c.equip_hero(Some(id.clone()));
        let cost = c.current_cost();
        gesture(&mut c, 1, cost, 1_003 * SEC);
        let ends = c.get_cycle().ends_at.0;
        testing_env!(ctx(5, 0, ends + SEC).build());
        c.finalize();
        assert_eq!(c.hero_stats(id).gear.len(), 1);
    }

    #[test]
    fn hero_account_opens_and_then_holds_the_vault() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Legendary);
        c.hero_stats.insert(id.clone(), HeroStats { vault: near(0.3), ..Default::default() });
        let cost = c.hero_account_cost().0;
        testing_env!(ctx(1, cost, 1_002 * SEC).build());
        let _ = c.open_hero_account(id.clone());
        assert!(c.hero_stats(id.clone()).account_pending);
        with_result(0, 1_003 * SEC, true);
        assert!(c.on_hero_account(id.clone(), accounts(1), U128(cost)));
        let v = c.hero_stats(id.clone());
        assert_eq!(v.account_id.unwrap().to_string(), format!("{}.boundora.testnet", id));
        assert!(!v.account_pending);
        assert_eq!(c.hero_account_of(id.clone()).unwrap().to_string(), "hero-".to_string() + &id[5..] + ".boundora.testnet");
        // new earnings are recorded and sent to the hero account
        c.credit_hero(&id, near(0.2), "pot");
        assert_eq!(c.hero_stats(id.clone()).vault.0, near(0.5));
        let extra = c.nft_token(id.clone()).unwrap().metadata.unwrap().extra.unwrap();
        assert!(extra.contains(".boundora.testnet") && serde_json_ok(&extra));
        // claiming asks the hero account to pay; vault is cleared optimistically
        testing_env!(ctx(1, 0, 1_004 * SEC).build());
        assert_eq!(c.claim_hero_vault(id.clone()).0, near(0.5));
        assert_eq!(c.hero_stats(id.clone()).vault.0, 0);
        // if the hero account failed to pay, the amount is restored
        with_result(0, 1_005 * SEC, false);
        assert!(!c.on_hero_withdraw(id.clone(), U128(near(0.5))));
        assert_eq!(c.hero_stats(id).vault.0, near(0.5));
    }

    #[test]
    fn failed_hero_account_is_refunded_and_can_retry() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        let cost = c.hero_account_cost().0;
        testing_env!(ctx(1, cost, 1_002 * SEC).build());
        let _ = c.open_hero_account(id.clone());
        with_result(0, 1_003 * SEC, false);
        assert!(!c.on_hero_account(id.clone(), accounts(1), U128(cost)));
        let v = c.hero_stats(id.clone());
        assert!(v.account_id.is_none() && !v.account_pending);
        testing_env!(ctx(1, cost, 1_004 * SEC).build());
        let _ = c.open_hero_account(id);
    }

    #[test]
    #[should_panic(expected = "Attach hero_account_cost")]
    fn hero_account_needs_its_storage_deposit() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        testing_env!(ctx(1, near(0.01), 1_002 * SEC).build());
        let _ = c.open_hero_account(id);
    }

    #[test]
    #[should_panic(expected = "You don't own that hero")]
    fn only_owner_opens_hero_account() {
        let mut c = setup();
        let id = give_hero(&mut c, 1, Rarity::Epic);
        let cost = c.hero_account_cost().0;
        testing_env!(ctx(2, cost, 1_002 * SEC).build());
        let _ = c.open_hero_account(id);
    }

}
