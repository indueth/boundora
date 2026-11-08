// Boundora on real NEAR: drop-in replacement for the page's simulated chain.
// npm i @near-wallet-selector/core @near-wallet-selector/modal-ui @near-wallet-selector/my-near-wallet @near-wallet-selector/meteor-wallet near-api-js
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { providers, utils } from "near-api-js";

export const CONTRACT_ID = "boundora-okafor.testnet";       // your deployed contract
const NETWORK = "testnet";
const RPC = "https://rpc.testnet.near.org";
const TGAS = (n) => String(n * 1e12);

const rpc = new providers.JsonRpcProvider({ url: RPC });
let selector, modal;

export async function initWallet() {
  selector = await setupWalletSelector({
    network: NETWORK,
    modules: [setupMyNearWallet(), setupMeteorWallet()],
  });
  modal = setupModal(selector, { contractId: CONTRACT_ID });
  return selector;
}
export const connect = () => modal.show();
export async function accountId() {
  const { accounts } = selector.store.getState();
  return accounts[0]?.accountId ?? null;
}
export async function disconnect() { (await selector.wallet()).signOut(); }

// ---------- views (free, no wallet needed)
async function view(method, args = {}) {
  const res = await rpc.query({
    request_type: "call_function", finality: "optimistic", account_id: CONTRACT_ID,
    method_name: method, args_base64: btoa(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(res.result)));
}
export const getCycle    = () => view("get_cycle");            // poll every ~1s for the clock
export const getConfig   = () => view("get_config");
export const getHistory  = (limit = 10) => view("get_history", { limit });
export const passesOf    = (account_id) => view("passes_of", { account_id });
export const claimableOf = (account_id) => view("claimable_of", { account_id });
export const artOf       = (account_id) => view("nft_tokens_for_owner", { account_id, limit: 50 });
// Each token's metadata.extra is JSON with { seed, cycle, rank, renderer }; pass seed to drawArt().

// ---------- calls (signed by the wallet)
async function call(method, args, depositYocto = "0", gas = 100) {
  const wallet = await selector.wallet();
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: TGAS(gas), deposit: depositYocto } }],
  });
}
export const mintPass = (priceYocto) => call("mint_pass", {}, priceYocto);
// stakeYocto must be between current_cost and current_cost × passes_of().stake_multiplier
export const gesture  = (stakeYocto) => call("gesture", {}, stakeYocto, 300);  // may also settle the previous cycle
export const finalize = () => call("finalize", {}, "0", 300);
export const claim    = () => call("claim", {});
// Lock an NFT from an approved collection: call nft_transfer_call on THAT collection
export async function lockNft(collectionId, tokenId) {
  const wallet = await selector.wallet();
  return wallet.signAndSendTransaction({
    receiverId: collectionId,
    actions: [{ type: "FunctionCall", params: { methodName: "nft_transfer_call",
      args: { receiver_id: CONTRACT_ID, token_id: tokenId, msg: "lock" }, gas: TGAS(100), deposit: "1" } }],
  });
}
export const toNear = (yocto) => Number(utils.format.formatNearAmount(yocto, 4));
export const toYocto = (near) => utils.format.parseNearAmount(String(near));
export const passQuote  = () => view("pass_quote");
export async function balanceOf(account_id) {
  const a = await rpc.query({ request_type: "view_account", finality: "final", account_id });
  return a.amount;
}
