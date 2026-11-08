// Network settings shared by the wallet adapter and live mode (kept dependency-free so it loads instantly).
export const CONTRACT_ID = "boundora.testnet"; // your deployed contract
export const NETWORK = "testnet";                      // "mainnet" makes names alice.near
// rpc.*.near.org is deprecated and now refuses requests (429); FastNear is the free public replacement.
export const RPC = NETWORK === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://test.rpc.fastnear.com";
