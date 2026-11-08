// Node globals some NEAR libraries expect; injected into the wallet bundle by build-wallet.mjs.
export { Buffer } from "buffer";
export const process = { env: { NODE_ENV: "production" }, browser: true, version: "", versions: {}, argv: [],
  nextTick: (f, ...a) => queueMicrotask(() => f(...a)) };
