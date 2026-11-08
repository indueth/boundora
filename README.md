# Boundora

**Every gesture extends the clock. Top players claim the orbit.**

**▶ Play now: [boundora.xyz](https://boundora.xyz)**

Boundora is a competitive, round-based game on **NEAR testnet**, with a 20,000-piece hero NFT collection whose heroes have real powers in the game. Mint a soulbound Boundora Pass, pay NEAR to *strike*, and each strike pushes the countdown back. When the clock hits zero, the top players split the pot and win **Boundora Heroes**: NFTs that level up, carry gear, hold their own money and can even have their own NEAR account.

Built for the NEAR Hackathon, track **NFTs That Do Something**. It runs on testnet, so everything is played with free test NEAR: no real money is involved.

## How to play

1. **Get a testnet wallet:** [MyNearWallet (testnet)](https://testnet.mynearwallet.com) or [Meteor Wallet](https://wallet.meteorwallet.app) (switch it to testnet).
   Meteor's web wallet signs each action in a small pop-up window, so **allow pop-ups for boundora.xyz** (or use the Meteor browser extension, or MyNearWallet, which needs no pop-ups).
2. **Get free test NEAR** from a faucet such as [near-faucet.io](https://near-faucet.io).
3. Open **https://boundora.xyz** and click **Connect wallet**.
4. **Mint your pass** (0.01 test NEAR, one per player, soulbound). It's your membership card and it records your rounds, strikes and wins.
5. **Strike!** Each strike costs a little NEAR and adds time to the clock. Be the last to strike when it hits zero, hold the spot longest, or stake the most.
6. **Win heroes and NEAR.** Claim your winnings, equip a hero for its power, give it gear, open its own NEAR account, or sell it on the market.
7. Optional: **claim a NEAR name** like `alice.testnet` straight from the game.

## How Boundora fits "NFTs That Do Something"

| Track ask | Boundora |
|---|---|
| NFTs that own money | Each hero has a vault, and can have its own NEAR sub-account (`hero-N.boundora.testnet`, e.g. [hero-2371](https://testnet.nearblocks.io/address/hero-2371.boundora.testnet)) |
| Earn royalties | 40% of every resale royalty goes into the hero's vault |
| Hold inventory | 3 gear slots per hero; gear moves with the hero when it's sold |
| Carry credentials, memberships, access rights | Soulbound pass NFT, required to play, with a live membership record |
| Dynamic NFTs | Level, XP, wins, vault, gear and account are written into metadata on every read |
| NEP-171 | Heroes and passes are NEP-171/177/181 tokens with NEP-199 payouts |
| Sub-accounts | `hero-N.boundora.testnet` hero accounts running the `vault/` contract |

Everything in the game is a real transaction on the contract [`boundora.testnet`](https://testnet.nearblocks.io/address/boundora.testnet): the pass, strikes, claims, hero minting, equipping, gear, vaults, hero accounts, the market, bids and auctions.

## Boundora Heroes (20,000 NFTs)

- **Supply:** 20,000 heroes. 8,400 Common, 5,600 Rare, 3,400 Epic, 1,800 Legendary and 800 Mythic. These counts are exact and enforced by the contract.
- **Fixed in advance:** hero N's rarity comes from `p = (7919·(N−1) + 3571) mod 20000`, and its traits come from a seeded generator, so the whole collection can be browsed before minting. Traits cover build, coat, fur trim, headgear, facial hair, hair, mood, weapon, gear material, companion and scene, and all 20,000 combinations are unique.
- **How you get one:**
  - **Public mint:** `mint_hero()` costs 2 NEAR (max 5 per wallet) and draws a random hero from the remaining supply. The proceeds go to the treasury.
  - **Winning rounds:** final strike earns a Legendary (5% chance of Mythic), iron stance an Epic, each chi master a Rare, and the raffle 2 Commons. If a rarity sells out, the contract gives the closest rarity still available.
- **What a hero does:** call `equip_hero(token_id)`. The power applies to your strikes for as long as you own the hero, and stops if you sell it.
  - Common: +1s per strike
  - Rare: +3s per strike
  - Epic: strikes cost 10% less
  - Legendary: +1 chi
  - Mythic: +1 chi, 15% off and +3s
- **Heroes level up (dynamic NFTs):** the equipped hero earns XP: 10 per strike, 120 for a final strike, 80 for iron stance, 50 for chi master, 20 for a raffle win. Level L needs 40·(L−1)² XP (max 50). Every 3 levels add 1 more second to each strike, up to 10 s. `nft_token`, `nft_tokens` and `nft_tokens_for_owner` return the live state: the title reads "Boundora Hero #N (Lv L)" and `metadata.extra` carries `level`, `xp`, `strikes`, `wins`, `vault` and `lifetime_earned`.
- **Heroes hold money (NFTs as accounts):** every hero has its own NEAR vault. It receives 10% of each cash award its owner wins with it equipped, and 40% of the royalty each time it is resold. The vault belongs to the token, not the wallet, so it moves with every sale or transfer. Only the current owner can call `claim_hero_vault(token_id)`, and not while the hero is listed or on auction. Claiming also refunds open bids, because the hero's value just changed. `hero_stats(token_id)` returns level, XP, next-level XP, strikes, wins, vault and lifetime earnings.
- **Heroes carry inventory:** each hero has 3 gear slots. Gear belongs to the hero, not the wallet, so it goes with the hero when it's sold. Final-strike and iron-stance winners' heroes find gear (Aurora Gem is a 1-in-10 find). Owners can `buy_gear(token_id, item)` (proceeds go to the treasury) and `move_gear(from, to, item)` between their own heroes, but not out of a listed or auctioned hero. Moving gear refunds open bids. `gear_catalog()` lists the items:
  - Frost Cloak, 0.5 NEAR: +2 s per strike
  - Ember Charm, 0.8 NEAR: strikes cost 5% less
  - Snow Owl, 0.5 NEAR: +50% XP
  - Aurora Gem, 3 NEAR: +1 chi
- **Heroes as accounts (sub-accounts):** `open_hero_account(token_id)` creates `hero-N.boundora.testnet`, deploys the `vault/` contract there and moves the hero's vault NEAR into it. The owner attaches `hero_account_cost()`, which covers the code storage and stays in the account. After that, every pot cut and royalty share is sent to that account, where anyone can see it on an explorer. `claim_hero_vault` asks the hero account to pay the current owner, and a callback puts the amount back on the books if that fails. If account creation fails, the deposit is refunded. `hero_account_of(token_id)` and `hero_accounts_enabled()` are views.
- **The pass is a soulbound NFT:** `mint_pass` also mints the NEP-171 token `pass-<account>`. `nft_transfer`, `nft_transfer_call`, `nft_approve`, `nft_transfer_payout`, listings, bids and auctions all refuse it. Its metadata is a live membership record: when you joined, rounds played, strikes, wins and best finish. `pass_of(account)` returns the same record.
- **Royalties:** a 5% resale royalty via NEP-199 (`nft_payout`, `nft_transfer_payout`). The marketplace approval methods (`nft_approve` and related) are implemented, so heroes can be listed.
- **Revenue:** pass sales, hero mint sales, 5% of every pot, and 3% of every hero resale (the other 2% goes into the hero's vault).

## In-game names

In the game, a cycle is a **round** and a gesture is a **strike**. Your pass count sets your **belt**: 1 pass for white, 2 for black, and a locked NFT adds a gold stripe and your **chi**, which is your stake multiplier. The prizes are **Final strike** (a Legendary hero), **Iron stance** (an Epic hero) and **Chi masters** (a Rare hero each). Everyone else who fought is in the raffle for Common heroes. The arena is a frozen mountain dojo. The fighters on screen are the equipped heroes of the current final-strike holder and the top challenger. Kitsu, an original fox monk, explains the rules.

## Game rules

- **Clock:** a round opens with 10 minutes. Each strike adds 60 s. The clock can never show more than 15 minutes. There's a 60 s pause between rounds.
- **Cost:** the first strike costs 0.1 NEAR. Each strike raises the price by 2% of the base.
- **Pass (required to play):** every player must mint **one** soulbound Boundora Pass before they can strike. It costs a fixed **0.01 NEAR**, set by the owner with `set_pass_price_near`. (Without a fixed price, `pass_quote()` converts $5 at the latest NEAR/USD rate instead.) `mint_pass()` charges the quote and refunds any extra. It can never be transferred, listed or sold. A locked NFT doesn't replace the pass; it only adds chi. Your pass gives 1× stake. A locked NFT adds one more, and so does an equipped Legendary or Mythic hero, up to 4× in total.
- **Payout when the clock hits zero:**
  - **Final strike** (last player to strike): 35% plus a Legendary hero (5% chance of Mythic)
  - **Iron stance** (held the last-strike spot longest, final striker excluded): 20% plus an Epic hero
  - **Chi masters** (top 3 by volume): 25% split evenly, plus a Rare hero each
  - **Rollover** to the next round: 15%
  - **Treasury** (pays storage for minted art): 5%
  - 2 Common heroes are raffled among players who didn't place.
- If only one person played, the iron-stance share goes to the final striker.
- Winnings are credited and pulled with **Claim** (`claim()`). This keeps settlement to a single transaction and avoids failed transfers.
- **Settling a round:** anyone can call `finalize()` after zero, and the next strike also settles the old round. If the new round hasn't opened yet, that strike is refunded rather than reverted, so the settlement still goes through.

## Verify it on chain

`node scripts/e2e-testnet.mjs` creates two fresh faucet accounts and walks the whole NFT track on `boundora.testnet` with the same calls the game makes, printing PASS/FAIL for each: soulbound pass (and that it can't be transferred), a strike, hero mint, equip, gear inventory, dynamic metadata, the hero's own sub-account, listing, an escrowed bid, a sale that moves the hero and its gear, the resale royalty landing in the hero's own account, bid refunds, and that only the new owner can claim the hero's vault. Last run: 17 passed, 0 failed.

## Contract API

**Calls:** `new(owner_id, config?, price_keeper?, near_usd_micro?)`, `mint_pass()` *(payable)*, `set_near_usd_price(price_micro_usd)` *(keeper)*, `set_price_keeper` *(owner)*, `set_pass_price_near(price?)` *(owner; fixed NEAR pass price, `null` = USD)*, `pass_quote()` *(view)*, `gesture()` *(payable)*, `finalize()`, `claim()`, `unlock_nft(collection, token_id)`
**Owner:** `set_config`, `add_collection`, `remove_collection`, `withdraw_treasury`
**Heroes:** `mint_hero` *(payable)*, `equip_hero`, `hero_stats(token_id)`, `claim_hero_vault(token_id)`, `buy_gear` *(payable)*, `move_gear`, `gear_catalog`, `open_hero_account` *(payable)*, `hero_account_cost`, `hero_account_of`, `hero_accounts_enabled`, `pass_of(account)`, `equipped_of`, `hero_info(number)`, `hero_supply`, `nft_payout`, `nft_transfer_payout`, `nft_approve`, `nft_revoke`, `nft_revoke_all`, `nft_is_approved`
**Market:** `list_hero(token_id, price)`, `delist_hero`, `buy_hero` *(payable)*, `get_listings`, `listing_of`, `get_sales`.
**Bids and auctions:** `place_bid` *(payable; NEAR held in escrow; bidding again adds to your bid)*, `withdraw_bid`, `accept_bid(token_id, bidder)` *(owner picks any bid, not only the highest)*, `start_auction(token_id, duration_ms, reserve?)`, `cancel_auction` *(only while it has no bids)*, `settle_auction` *(anyone can call after the end: the highest bid at or above the reserve wins, everyone else is refunded)*, `bids_on`, `get_auctions`, `tokens_with_bids`. In an auction, each bid must beat the top bid by 5% and bids are locked until it ends. Any sale, by buy-now, accepted bid or auction, refunds every other open bid on that hero. The 5% royalty on every sale is split: 60% to the treasury, 40% into the sold hero's own vault. Passes can't be listed.
**Views:** `get_cycle`, `get_config`, `get_history(limit?)`, `passes_of`, `claimable_of`, `get_treasury`, `total_passes`, `eligible_collections`
**NEP-171 / 177 / 181:** `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner`, `nft_total_supply`, `nft_metadata`
**NEP-171 receiver:** `nft_on_transfer`. To lock an NFT, call `nft_transfer_call` on an approved collection with this contract as the receiver.
**Events:** `EVENT_JSON` logs with `standard: "boundora"` for `pass_minted`, `gesture`, `cycle_finalized`, `claim`, `nft_locked`, `hero_earned`, `hero_vault_claimed`, `gear_found`, `gear_bought`, `gear_moved` and `hero_account_opened`.

Each hero token is `hero-N` and stores `{"number","rarity","won_for","cycle","renderer":"boundora-heroes-v1"}` in `metadata.extra`; reads add the live `level`, `xp`, `strikes`, `wins`, `vault`, `lifetime_earned`, `gear` and `account`. Pass tokens (`pass-<account>`) share the collection, so `nft_total_supply` counts heroes plus passes. `Heroes.heroSVG(N)` in `web/heroes.js` draws it.

## What's in this repository

| Path | What it is |
|---|---|
| `contract/` | Rust smart contract (near-sdk 5.30): rounds, strikes, ranking, payouts, soulbound passes, NFT locking, the 20,000 Boundora Heroes (NEP-171, NEP-199 royalties, approvals) with equippable powers, levels, gear inventories, their own NEAR vaults and optional sub-accounts; the pass is a soulbound NEP-171 token. 64 unit tests. |
| `vault/` | The small contract deployed inside each hero's own NEAR account (`hero-N.boundora.testnet`). 3 unit tests. `res/vault.wasm` is the compiled contract, embedded in the main contract, which deploys it into each new hero account. |
| `web/` | The game, served at https://boundora.xyz: a fighting-game HUD, Round/Fight/K.O. calls, combo counter, hit effects and sound, belts and a chi gauge, heroes as the fighters, hero minting and equipping, a market, and a browser for all 20,000 heroes. `web/near/live.js` turns every action into a contract call; `web/hero3d.js` renders the 3D heroes; `web/heroes.js` generates them. |
| `collection/` | Full metadata for all 20,000 heroes, trait counts, sample SVGs and a preview image. |
| `scripts/` | `e2e-testnet.mjs` (the on-chain check above), `deploy.mjs` (deploys and configures the contract), `export-collection.js` (writes `collection/`). |
| `.github/workflows/` | Builds the contract and deploys it to NEAR testnet from GitHub Actions. |

## Build and test (developers)

```bash
cd contract && cargo test          # 64 unit tests
cd ../vault && cargo test          # 3 unit tests for the hero account contract
node web/near/live.test.mjs        # game <-> chain mapping
```

Rust stable (near-sdk 5.30 needs rustc 1.95 or newer) with the `wasm32-unknown-unknown` target. Build the `vault/` wasm first and copy it to `vault/res/vault.wasm`, then build `contract/`; otherwise `hero_accounts_enabled()` is false. Plain `cargo build` needs `--cfg near` (set in each crate's `.cargo/config.toml`), or contract errors reach the chain as a bare `WasmTrap(Unreachable)` instead of their message; `cargo near build` sets it itself. The **Deploy to NEAR testnet** workflow does all of this: add `NEAR_CONTRACT_ID`, `NEAR_PUBLIC_KEY` and `NEAR_PRIVATE_KEY` as repository secrets and run it from the Actions tab (tick **init** the first time).

After changing `web/near/boundora-near.js`, rebuild the bundled wallet code with `node web/build-wallet.mjs`; after changing `web/src/`, rebuild the page with `python web/build.py`.

## Known limits

- Randomness for the raffle and art seeds uses `env::random_seed()`. That's fine for a testnet game, but block producers can influence it.
- Each round stores its players in one vector, capped at 150, so settlement fits in gas. For more players, move to paginated settlement.
