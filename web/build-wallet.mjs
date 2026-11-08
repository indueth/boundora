// Bundle web/near/boundora-near.js and the NEAR wallet libraries into one local file.
// Loading them from a CDN meant ~200 chained module requests (a minute or more before
// "Connect wallet" opened anything). Run after changing the adapter: node web/build-wallet.mjs
import { build } from "esbuild";
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(W, "near/boundora-near.js")],
  outfile: join(W, "near/boundora-near.bundle.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2020", minify: true,
  define: { global: "globalThis", "process.env.NODE_ENV": "\"production\"" },
  inject: [join(W, "near/buffer-shim.js")],
  plugins: [{ // http/https/crypto are only used by near-api-js on Node (fetch fallback, local view execution)
    name: "node-only",
    setup(b) {
      b.onResolve({ filter: /^(http|https|crypto)$/ }, a => ({ path: a.path, namespace: "empty" }));
      b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "module.exports = {}" }));
    },
  }],
  logLevel: "warning",
});
copyFileSync(join(W, "node_modules/@near-wallet-selector/modal-ui/styles.css"), join(W, "near/wallet-modal.css"));
console.log("built near/boundora-near.bundle.js and near/wallet-modal.css");
