// Deploy Boundora to NEAR testnet from this machine (no near CLI needed).
//   node scripts/deploy.mjs          create the account from the faucet if missing, deploy (init on first deploy), post price, smoke-test
//   node scripts/deploy.mjs price    only post the NEAR/USD price
// Key: ~/.near-credentials/testnet/<id>.json. Env: NEAR_CONTRACT_ID, NEAR_KEY_FILE.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair, transactions, utils } from "near-api-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ID = process.env.NEAR_CONTRACT_ID || "boundora-okafor.testnet";
const KEY = process.env.NEAR_KEY_FILE || join(homedir(), ".near-credentials", "testnet", `${ID}.json`);
const WASM = join(ROOT, "contract/target/wasm32-unknown-unknown/release/boundora.wasm");
const RPC = "https://rpc.testnet.near.org";
const TGAS = n => BigInt(n) * 10n ** 12n;

const cred = JSON.parse(readFileSync(KEY, "utf8"));
const keyStore = new keyStores.InMemoryKeyStore();
await keyStore.setKey("testnet", ID, KeyPair.fromString(cred.private_key));
const near = await connect({ networkId: "testnet", nodeUrl: RPC, keyStore });
const account = await near.account(ID);
const view = (methodName, args = {}) => account.viewFunction({ contractId: ID, methodName, args });

async function exists() {
  try { await account.state(); return true; } catch (e) { if (e.type === "AccountDoesNotExist" || /exist/.test(e.message)) return false; throw e; }
}

async function createFromFaucet() {
  for (const url of ["https://helper.nearprotocol.com/account", "https://helper.testnet.near.org/account"]) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ newAccountId: ID, newAccountPublicKey: cred.public_key }) }).catch(() => null);
    if (r?.ok) { console.log(`created ${ID} from the faucet`); return; }
    console.log(`faucet ${url}: ${r ? r.status + " " + (await r.text()).slice(0, 200) : "unreachable"}`);
  }
  throw new Error(`could not create ${ID}; fund it by hand (e.g. MyNearWallet testnet) and rerun`);
}

async function postPrice() {
  const py = process.platform === "win32" ? "python" : "python3";
  const micro = execFileSync(py, [join(ROOT, "scripts/near-usd-from-pyth.py")], { encoding: "utf8" }).trim();
  await account.functionCall({ contractId: ID, methodName: "set_near_usd_price", args: { price_micro_usd: micro }, gas: TGAS(30) });
  console.log(`posted NEAR/USD = $${(+micro / 1e6).toFixed(4)}`);
}

if (process.argv[2] === "price") { await postPrice(); process.exit(0); }

if (!(await exists())) {
  await createFromFaucet();
  for (let i = 0; i < 20 && !(await exists()); i++) await new Promise(r => setTimeout(r, 1500));
}
const { amount } = await account.state();
console.log(`${ID} balance: ${utils.format.formatNearAmount(amount, 3)} NEAR`);

const code = readFileSync(WASM);
const initialized = await view("get_config").then(() => true, () => false);
const actions = [transactions.deployContract(code)];
if (!initialized) actions.push(transactions.functionCall("new", { owner_id: ID }, TGAS(100), 0n));
const out = await account.signAndSendTransaction({ receiverId: ID, actions });
console.log(`${initialized ? "updated code" : "deployed and initialized"} (${(code.length / 1024).toFixed(0)} KB): https://testnet.nearblocks.io/txns/${out.transaction.hash}`);

await postPrice();
const cycle = await view("get_cycle");
console.log("get_cycle:", { id: cycle.id, status: cycle.status, pool: cycle.pool, current_cost: cycle.current_cost });
console.log("pass_quote:", await view("pass_quote"));
console.log("hero_accounts_enabled:", await view("hero_accounts_enabled"));
