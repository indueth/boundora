# Boundora

**Every gesture extends the clock. Top players claim the orbit.**

Boundora is a competitive, cycle-based game on NEAR, with a 20,000-piece hero NFT collection whose heroes have real powers in the game. You hold a soulbound Boundora Pass (or lock an NFT from an approved collection), pay native NEAR to make *gestures*, and each gesture pushes the countdown back. When the clock hits zero, the top players split the pool and receive **Boundora Heroes**, ranked by rarity.

## What's in this folder

| Path | What it is |
|---|---|
| `vault/` | The small contract deployed inside each hero's own NEAR account (`hero-N.<boundora>`). Only Boundora can move NEAR out of it, and only for the hero's current owner. 3 unit tests. `res/vault.wasm` is a placeholder; the deploy workflow builds the real one and embeds it in the main contract. |
| `contract/` | Rust smart contract (near-sdk 5.30): cycles, gestures, ranking, payouts, soulbound passes, NFT locking, the 20,000 Boundora Heroes (NEP-171, NEP-199 royalties, approvals) with equippable powers, levels, gear inventories, their own NEAR vaults and optional sub-accounts; the pass is a soulbound NEP-171 token. 64 unit tests. |
| `web/index.html` | The playable dojo game: a fighting-game HUD, Round/Fight/K.O. calls, combo counter, hit effects and sound, belts and a chi gauge, heroes as the fighters, hero minting and equipping, and a browser for all 20,000 heroes. It plays on NEAR testnet against `boundora.testnet`; `?demo` runs a local simulation with practice bots and arcade-speed clocks. |
| `web/hero3d.js` | The 3D hero renderer (three.js, cartoon shading with outlines). It builds each hero from the same traits, renders card images, and drives the spinning profile view and the arena fighters. |
| `web/src/`, `web/build.py` | Page sources: the stylesheet, the page markup and the UI layer. `python3 web/build.py` rebuilds `web/index.html`. |
| `.github/workflows/deploy-testnet.yml` | Builds the contract and deploys it to NEAR testnet from GitHub Actions. |
| `web/heroes.js` | The Boundora Heroes generator. Hero number N (1 to 20,000) always draws the same hero, with rarity matching the contract's schedule exactly. Works in the browser and in Node. |
| `scripts/export-collection.js` | Writes `collection/metadata.json` (all 20,000), a trait report, and optional SVGs. |
| `collection/` | Full metadata, trait counts, 24 sample SVGs and `boundora-heroes-preview.png` for your X post. |
| `web/near/` | The testnet layer: `live.js` (every page action as a contract call), `boundora-near.js` (wallet adapter, bundled by `web/build-wallet.mjs`), `config.js` (contract, network, RPCs). |
| `scripts/e2e-testnet.mjs` | End-to-end check of the deployed contract: walks every NFT feature with two fresh faucet accounts and prints PASS/FAIL. |

## Boundora Heroes (20,000 NFTs)

- **Supply:** 20,000 heroes. 8,400 Common, 5,600 Rare, 3,400 Epic, 1,800 Legendary and 800 Mythic. These counts are exact and enforced by the contract.
- **Fixed in advance:** hero N's rarity comes from `p = (7919·(N−1) + 3571) mod 20000`, and its traits come from a seeded generator, so the whole collection can be browsed before minting. Traits cover build, coat, fur trim, headgear, facial hair, hair, mood, weapon, gear material, companion and scene, and all 20,000 combinations are unique.
- **How you get one:**
  - **Public mint:** `mint_hero()` costs 2 NEAR (max 5 per wallet) and draws a random hero from the remaining supply. The proceeds go to the treasury.
  - **Winning rounds:** final strike earns a Legendary (5% chance of Mythic), iron stance an Epic, each chi master a Rare, and the raffle 2 Commons. If a rarity sells out, the contract gives the closest rarity still available.
- **What a hero does (NFTs That Do Something):** call `equip_hero(token_id)`. The power applies to your strikes for as long as you own the hero, and stops if you sell it.
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
- **Heroes as accounts (sub-accounts):** `open_hero_account(token_id)` creates `hero-N.<boundora>`, deploys the `vault/` contract there and moves the hero's vault NEAR into it. The owner attaches `hero_account_cost()`, which covers the code storage and stays in the account. After that, every pot cut and royalty share is sent to that account, where anyone can see it on an explorer. `claim_hero_vault` asks the hero account to pay the current owner, and a callback puts the amount back on the books if that fails. If account creation fails, the deposit is refunded. `hero_account_of(token_id)` and `hero_accounts_enabled()` are views.
- **The pass is a soulbound NFT:** `mint_pass` also mints the NEP-171 token `pass-<account>`. `nft_transfer`, `nft_transfer_call`, `nft_approve`, `nft_transfer_payout`, listings, bids and auctions all refuse it. Its metadata is a live membership record: when you joined, rounds played, strikes, wins and best finish. `pass_of(account)` returns the same record.
- **Royalties:** a 5% resale royalty via NEP-199 (`nft_payout`, `nft_transfer_payout`). The marketplace approval methods (`nft_approve` and related) are implemented, so heroes can be listed.
- **Revenue:** pass sales, hero mint sales, 5% of every pot, and 3% of every hero resale (the other 2% goes into the hero's vault).

## In-game names

In the game, a cycle is a **round** and a gesture is a **strike**. Your pass count sets your **belt**: 1 pass for white, 2 for black, and a locked NFT adds a gold stripe and your **chi**, which is your stake multiplier. The prizes are **Final strike** (a Legendary hero), **Iron stance** (an Epic hero) and **Chi masters** (a Rare hero each). Everyone else who fought is in the raffle for Common heroes. The arena is a frozen mountain dojo. The fighters on screen are the equipped heroes of the current final-strike holder and the top challenger. The orbit art glows behind them as the moon. Kitsu, an original fox monk, explains the rules.

## Game rules (contract defaults)

- **Clock:** a cycle opens with 10 minutes. Each gesture adds 60s. The clock can never show more than 15 minutes. There's a 60s pause between cycles.
- **Cost:** the first gesture costs 0.1 NEAR. Each gesture raises the price by 2% of the base.
- **Pass (required to play):** every player must mint **one** soulbound Boundora Pass before they can strike. On `boundora.testnet` it costs a fixed **0.01 NEAR**, set by the owner with `set_pass_price_near`. Without a fixed price, `pass_quote()` converts $5 at the latest NEAR/USD rate instead. `mint_pass()` charges the quote (1% tolerance) and refunds any extra. It can never be transferred, listed or sold. A locked NFT doesn't replace the pass; it only adds chi. Your pass gives 1× stake. A locked NFT adds one more, and so does an equipped Legendary or Mythic hero, up to 4× in total.
- **Payout when the clock hits zero:**
  - **Final gesture** (last player to gesture): 35% plus a Legendary hero (5% chance of Mythic)
  - **Endurance** (held the last-gesture spot longest, final gesturer excluded): 20% plus an Epic hero
  - **Top 3 by volume:** 25% split evenly, plus a Rare hero each
  - **Rollover** to the next cycle: 15%
  - **Treasury** (pays storage for minted art): 5%
  - 2 Common heroes are raffled among players who didn't place.
- If only one person played, the endurance share goes to the final gesturer.
- Winnings are credited and pulled with `claim()`. This keeps settlement to a single transaction and avoids failed transfers.
- **Finalize:** anyone can call `finalize()` after zero. The next `gesture()` also settles the old cycle. If the new cycle hasn't opened yet, that gesture is refunded and not reverted, so the settlement still goes through.

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

## Build, test, deploy

```bash
cd contract
cargo test                         # 64 unit tests
(cd ../vault && cargo test)        # 3 unit tests for the hero account contract
rustup toolchain install stable    # near-sdk 5.30 needs rustc >= 1.95
cargo near build                   # install with: cargo install cargo-near
near contract deploy boundora.testnet use-file target/near/boundora.wasm \
  with-init-call new json-args '{"owner_id":"you.testnet"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

Fund the contract account with a few NEAR so it can cover storage before the first art mint. After that, the treasury share covers it.

## Front end

**Live on NEAR testnet:** the contract runs at [`boundora.testnet`](https://testnet.nearblocks.io/address/boundora.testnet). Serve `web/` (`bash scripts/local.sh serve`, or `python -m http.server 8000 -d web`) and open http://localhost:8000/. The page plays on testnet by default; `?demo` runs an offline practice simulation with bots instead.

Everything a player does in the page is a signed testnet transaction, sent through `web/near/live.js`:

- **Wallet:** MyNearWallet or Meteor (wallet libraries bundled locally in `web/near/boundora-near.bundle.js`; rebuild with `node web/build-wallet.mjs`).
- **Game:** soulbound pass (0.01 NEAR), strikes, finalize, claim. The clock, pot and fighters come from `get_cycle`; the K.O. card, award heroes and round history from `get_history`.
- **Heroes:** mint (`mint_hero`), equip, gear shop and moving gear, claiming a hero's vault, giving a hero its own account (`open_hero_account`). Levels, XP, gear, vaults and accounts are read back from `hero_stats`, and the Heroes page lists every minted hero with its owner from `nft_tokens`.
- **Market:** list, delist and buy; bids held in escrow, raising, withdrawing and accepting; auctions (bidding on an ended auction settles it); sales history from `get_sales`.
- **Locking an NFT** from an approved collection (`nft_transfer_call`) for +1 chi.
- **NEAR names:** a connected player can claim a top-level name (`alice.testnet`, or `alice.near` with `NETWORK = "mainnet"` in `web/near/config.js`) through NEAR's registrar (`create_account` on `testnet`/`near`). The page checks the name is free, makes a key pair in the browser and shows it to save before the player signs; 0.1 NEAR goes into the new account.

Chain reads use plain `fetch` and rotate between public RPCs (they rate-limit browsers). `node web/near/live.test.mjs` checks the chain-to-page mapping.

**Verify it yourself:** `node scripts/e2e-testnet.mjs` creates two fresh faucet accounts and walks the whole NFT track on `boundora.testnet` with the same calls the page makes, printing PASS/FAIL for each: soulbound pass (and that it can't be transferred), a strike, hero mint, equip, gear inventory, dynamic metadata, the hero's own sub-account, listing, an escrowed bid, a sale that moves the hero and its gear, the resale royalty landing in the hero's own account, bid refunds, and that only the new owner can claim the hero's vault. Last run: 17 passed, 0 failed.

## How Boundora fits "NFTs That Do Something"

| Track ask | Boundora |
|---|---|
| NFTs that own money | Each hero has a vault, and can have its own NEAR sub-account (`hero-N.boundora.testnet`, e.g. [hero-2371](https://testnet.nearblocks.io/address/hero-2371.boundora.testnet)) |
| Earn royalties | 40% of every resale royalty goes into the hero's vault |
| Hold inventory | 3 gear slots per hero; gear moves with the hero |
| Carry credentials, memberships, access rights | Soulbound pass NFT, required to play, with a live membership record |
| Dynamic NFTs | Level, XP, wins, vault, gear and account are written into metadata on every read |
| NEP-171 | Heroes and passes are NEP-171/177/181 tokens with NEP-199 payouts |
| Sub-accounts | `hero-N.<boundora>` hero accounts running the `vault/` contract |

## Hackathon notes and known limits
- Hero accounts need the real `vault/` wasm embedded. `scripts/local.sh build` and the deploy workflow build it first; building only `contract/` leaves `hero_accounts_enabled()` false.
- Plain `cargo build` needs `--cfg near` (set in `contract/.cargo/config.toml` and `vault/.cargo/config.toml`), or every contract error reaches the chain as a bare `WasmTrap(Unreachable)` instead of its message. `cargo near build` sets it itself. The embedded code makes the main contract roughly 100 KB larger, so keep about 2 NEAR extra on the contract account for storage.

- Randomness for the raffle and art seeds uses `env::random_seed()`. That's fine for a demo, but block producers can influence it.
- Each cycle stores its players in one vector, capped at 150, so settlement fits in gas. For more players, move to paginated settlement.
- In the `?demo` simulation, the hash function stands in for sha256. Art seeds from the real contract are true sha256 hashes.

## Run everything from this machine

`scripts/local.sh` (Git Bash on Windows) runs the tests, builds both wasm files (embedding the real hero-account contract), creates the testnet account from the faucet if needed, deploys with `scripts/deploy.mjs` (near-api-js, no near CLI) (calling `new` the first time), posts the NEAR/USD price and serves the page at `http://localhost:8000/`. Run one step with `scripts/local.sh test|build|deploy|price|serve`. It needs Rust stable with the `wasm32-unknown-unknown` target, Node, Python, and the key file `~/.near-credentials/testnet/<contract>.json`. Set `NEAR_CONTRACT_ID` to use another account.

## Deploying to testnet with GitHub Actions

1. Create a testnet account for the contract, for example with MyNearWallet or `near account create-account sponsor-by-faucet-service boundora-yourname.testnet ...`, and export its full-access key pair.
2. Push this folder to a public GitHub repo (judges need it public anyway).
3. In the repo, go to Settings > Secrets and variables > Actions and add `NEAR_CONTRACT_ID`, `NEAR_PUBLIC_KEY` and `NEAR_PRIVATE_KEY`.
4. In the Actions tab, run **Deploy to NEAR testnet** with **init** ticked. The workflow tests, builds with cargo-near on stable Rust, deploys, and reads `get_cycle` back as a check.
5. After that, every push that changes `contract/` redeploys the code and keeps the existing state.

## Keeping the USD pass price accurate (only when no fixed NEAR price is set)

The NEAR/USD rate comes from Pyth's NEAR/USD feed (`c415de8d…6750`). `.github/workflows/price-keeper.yml` fetches it from Pyth's Hermes API every 30 minutes and posts it with `set_near_usd_price`. The deploy workflow posts the first price straight after deploying. Public Hermes now returns 401 without a key, so the script sends `PYTH_API_KEY` as a bearer token when it is set and otherwise falls back to the Coinbase NEAR-USD spot price. If no price is posted for 6 hours, `mint_pass` pauses instead of charging a stale amount. To sign prices from a separate account, call `set_price_keeper`.
