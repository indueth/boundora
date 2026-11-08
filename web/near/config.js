// Network settings shared by the wallet adapter and live mode (kept dependency-free so it loads instantly).
export const CONTRACT_ID = "boundora.testnet"; // your deployed contract
export const NETWORK = "testnet";                      // "mainnet" makes names alice.near
// Public RPCs rate-limit browsers (FastNear answers 429 after a few quick calls), so live mode rotates through these.
export const RPCS = NETWORK === "mainnet"
  ? ["https://near.drpc.org", "https://rpc.mainnet.fastnear.com", "https://rpc.mainnet.near.org"]
  : ["https://near-testnet.drpc.org", "https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"];
export const RPC = RPCS[0]; // used for signing (wallet selector, near-api-js)
