#!/usr/bin/env bash
# Run Boundora from this machine: test, build, deploy to NEAR testnet, serve the page.
#   scripts/local.sh            all steps
#   scripts/local.sh test|build|deploy|price|serve
# Needs: Rust stable (>= 1.95, wasm32-unknown-unknown target), Node, Python.
# The contract key lives in ~/.near-credentials/testnet/<id>.json (never committed). Env: NEAR_CONTRACT_ID, NEAR_KEY_FILE.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
export AWS_LC_SYS_PREBUILT_NASM=${AWS_LC_SYS_PREBUILT_NASM:-1}  # Windows: near-sdk test deps build aws-lc-sys, which otherwise needs NASM
PY=$(command -v python || command -v python3)

t() { (cd vault && cargo test) && (cd contract && cargo test); }

b() {
  (cd vault && cargo build --release --target wasm32-unknown-unknown)
  cp vault/target/wasm32-unknown-unknown/release/boundora_vault.wasm vault/res/vault.wasm
  (cd contract && cargo build --release --target wasm32-unknown-unknown)
  ls -l vault/res/vault.wasm contract/target/wasm32-unknown-unknown/release/boundora.wasm
}

deps() { [ -d scripts/node_modules/near-api-js ] || (cd scripts && npm install); }
d() { [ -f contract/target/wasm32-unknown-unknown/release/boundora.wasm ] || b; deps; node scripts/deploy.mjs; }
price() { deps; node scripts/deploy.mjs price; }
s() { echo "Open http://localhost:8000/"; "$PY" -m http.server 8000 -d web; }

case "${1:-all}" in
  test) t ;; build) b ;; deploy) d ;; price) price ;; serve) s ;;
  all) t && b && d && s ;;
  *) echo "usage: $0 [test|build|deploy|price|serve|all]"; exit 2 ;;
esac
