// Network settings shared by the wallet adapter and live mode (kept dependency-free so it loads instantly).
export const CONTRACT_ID = "boundora-okafor.testnet"; // your deployed contract
export const NETWORK = "testnet";                      // "mainnet" makes names alice.near
export const RPC = NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org";
