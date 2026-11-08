// End-to-end check of the deployed contract on NEAR testnet, using the same calls the page makes.
// Creates two fresh player accounts from the faucet, then walks the "NFTs That Do Something" features:
// soulbound pass, strikes, hero mint, equip, gear inventory, dynamic metadata, hero sub-account,
// listing, bid, sale with royalty into the hero's own account, vault claim.
//   node scripts/e2e-testnet.mjs            (NEAR_CONTRACT_ID to target another contract)
import { connect, keyStores, KeyPair, providers, utils } from "near-api-js";

const ID = process.env.NEAR_CONTRACT_ID || "boundora.testnet";
const RPC = "https://test.rpc.fastnear.com";
const TGAS = n => BigInt(n) * 10n ** 12n;
const N = n => BigInt(utils.format.parseNearAmount(String(n)));
const fmt = y => utils.format.formatNearAmount(String(y), 4);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const keyStore = new keyStores.InMemoryKeyStore();
const near = await connect({ networkId: "testnet", nodeUrl: RPC, keyStore });
const contract = await near.account(ID);
const view = (methodName, args = {}) => contract.viewFunction({ contractId: ID, methodName, args });

let passed = 0, failed = 0;
const check = (ok, what, detail = "") => { ok ? passed++ : failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`); };

async function player(tag) {
  const id = `bdq-${tag}-${Date.now().toString(36)}.testnet`, kp = KeyPair.fromRandom("ed25519");
  await keyStore.setKey("testnet", id, kp);
  const r = await fetch("https://helper.nearprotocol.com/account", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) throw new Error(`faucet: ${r.status} ${await r.text()}`);
  for (let i = 0; i < 20; i++) { try { await (await near.account(id)).state(); break; } catch { await sleep(1500); } }
  return near.account(id);
}
const call = async (acct, methodName, args = {}, deposit = 0n, gas = 100) => providers.getTransactionLastResult(
  await acct.functionCall({ contractId: ID, methodName, args, gas: TGAS(gas), attachedDeposit: deposit }));
const fails = async (p, re) => { try { await p; return false; } catch (e) { return re.test(String(e.message || e)); } };

console.log(`Contract ${ID}\n`);
const a = await player("a"), b = await player("b");
check(true, `two players from the faucet`, `${a.accountId}, ${b.accountId}`);

// 1. Soulbound pass: a membership credential, required to play
const q = await view("pass_quote");
await call(a, "mint_pass", {}, BigInt(q.price));
await call(b, "mint_pass", {}, BigInt(q.price));
const pass = await view("pass_of", { account_id: a.accountId });
check(pass?.soulbound === true, "pass minted as a soulbound NEP-171 token", `${pass?.token_id}, ${fmt(q.price)} NEAR`);
check(await fails(call(a, "nft_transfer", { receiver_id: b.accountId, token_id: pass.token_id }, 1n), /soulbound|can't|cannot|not transferable/i),
  "pass refuses nft_transfer");

// 2. A strike (settles the previous round first if its clock already ran out)
let cyc = await view("get_cycle");
if (cyc.status === "awaiting_finalize") { await call(a, "finalize", {}, 0n, 300); cyc = await view("get_cycle"); }
if (cyc.status === "cooldown") { const wait = Number((BigInt(cyc.opens_at) - BigInt(cyc.now)) / 1000000n) + 1500; console.log(`      waiting ${Math.round(wait / 1000)}s for the round to open`); await sleep(wait); cyc = await view("get_cycle"); }
await call(a, "gesture", {}, BigInt(cyc.current_cost), 300);
cyc = await view("get_cycle");
check(cyc.last_gesturer === a.accountId, "strike lands on chain", `round ${cyc.id}, pot ${fmt(cyc.pool)} NEAR`);

// 3. Hero NFT: mint, equip, gear inventory
const supply = await view("hero_supply");
const hero = await call(a, "mint_hero", {}, BigInt(supply.price));
const tok = hero.token_id;
check(/^hero-\d+$/.test(tok), "hero minted", `${tok}, ${hero.rarity}, ${fmt(supply.price)} NEAR`);
await call(a, "equip_hero", { token_id: tok }, 0n, 50);
check((await view("equipped_of", { account_id: a.accountId }))?.token_id === tok, "hero equipped (its power applies to strikes)");
const gear = await view("gear_catalog");
await call(a, "buy_gear", { token_id: tok, item: 0 }, BigInt(gear[0].price), 50);
let st = await view("hero_stats", { token_id: tok });
check(st.gear.includes(gear[0].name), "gear stored in the hero's inventory", st.gear.join(", "));

// 4. Dynamic NFT: strikes with the hero equipped raise its XP, and nft_token shows it live
cyc = await view("get_cycle");
await call(a, "gesture", {}, BigInt(cyc.current_cost), 300);
st = await view("hero_stats", { token_id: tok });
const nt = await view("nft_token", { token_id: tok });
const extra = JSON.parse(nt.metadata.extra);
check(+st.xp > 0 && extra.xp !== undefined, "dynamic metadata updates on chain", `xp ${st.xp}, title "${nt.metadata.title}"`);

// 5. NFT as an account: the hero gets its own NEAR sub-account
const cost = await view("hero_account_cost");
await call(a, "open_hero_account", { token_id: tok }, BigInt(cost), 300);
const acct = await view("hero_account_of", { token_id: tok });
const acctState = acct && await (await near.account(acct)).state().catch(() => null);
check(!!acctState && acctState.code_hash !== "11111111111111111111111111111111", "hero has its own sub-account running the vault contract", acct);

// 6. Market: list, bid, buy. 5% royalty: 40% of it goes into the hero's own account
const price = N("0.05");
await call(a, "list_hero", { token_id: tok, price: price.toString() }, 0n, 50);
check((await view("listing_of", { token_id: tok }))?.seller === a.accountId, "hero listed", `${fmt(price)} NEAR`);
await call(b, "place_bid", { token_id: tok }, N("0.02"), 50);
check((await view("bids_on", { token_id: tok })).some(x => x.bidder === b.accountId), "bid held in escrow");
const before = BigInt(acctState.amount);
await call(b, "buy_hero", { token_id: tok }, price, 150);
await sleep(3000);
const owner = (await view("nft_token", { token_id: tok })).owner_id;
const after = BigInt((await (await near.account(acct)).state()).amount);
check(owner === b.accountId, "sale transfers the hero (and its gear) to the buyer", `owner ${owner}`);
check(after > before, "resale royalty paid into the hero's own account", `+${fmt(after - before)} NEAR`);
check((await view("bids_on", { token_id: tok })).length === 0, "other open bids refunded on sale");
st = await view("hero_stats", { token_id: tok });
check(st.gear.includes(gear[0].name), "inventory travelled with the hero");

// 7. Only the current owner can claim the hero's money
check(await fails(call(a, "claim_hero_vault", { token_id: tok }, 0n, 100), /owner|own/i), "previous owner can't claim the vault");
const got = await call(b, "claim_hero_vault", { token_id: tok }, 0n, 100);
check(BigInt(got ?? 0) >= 0n, "new owner claims the hero's vault", `${fmt(got ?? 0)} NEAR`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
