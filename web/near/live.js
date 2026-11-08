// Live mode: open index.html?live to play against the deployed contract instead of the simulation.
// Wired to the chain: wallet, clock/pot/fighters (get_cycle every second), pass mint, strike, finalize, claim.
// shortcut: market, auctions, gear, hero minting, NFT locking and round history stay simulated; wire them the same way when needed.
const NS = 1e9;
const near = y => Number(BigInt(y) / 10n ** 18n) / 1e6; // yocto -> NEAR, 6 decimals, no float noise

// get_cycle view -> the page's S.cycle shape (seconds and NEAR as numbers)
export function toCycle(v) {
  const now = +v.now / NS, lastAt = +v.last_gesture_at / NS, endsAt = +v.ends_at / NS;
  // the contract's held_ns already counts the holder's live time; the page adds it again in heldOf()
  const liveHold = v.last_gesturer ? Math.max(0, Math.min(now, endsAt) - lastAt) : 0;
  return {
    now,
    cycle: {
      id: v.id, opensAt: +v.opens_at / NS, endsAt, pool: near(v.pool), count: v.gesture_count,
      last: v.last_gesturer, lastAt, seed: v.seed,
      players: v.players.map(p => ({
        id: p.account_id, volume: near(p.volume), gestures: p.gestures,
        held: +p.held_ns / NS - (p.account_id === v.last_gesturer ? liveHold : 0),
      })),
    },
  };
}

async function start() {
  const N = await import("./boundora-near.js");
  const g = globalThis;
  g.botsTick = () => {}; g.botMarketTick = () => {}; g.settleIfEnded = () => false;

  const cfg = await N.getConfig();
  Object.assign(CFG, {
    initial: +cfg.initial_duration_ms / 1000, ext: +cfg.extension_ms / 1000,
    maxRemain: +cfg.max_remaining_ms / 1000, cooldown: +cfg.cooldown_ms / 1000,
    baseCost: near(cfg.base_cost), stepBps: cfg.cost_step_bps, maxMult: cfg.max_multiplier,
    passUsd: cfg.pass_price_usd_cents / 100,
  });

  let view = null, tick = 0, failed = false;
  async function sync(withAccount) {
    try {
      view = await N.getCycle();
      const { now, cycle } = toCycle(view), prev = S.cycle;
      S.now = now; S.cycle = cycle;
      if (prev && prev.id === cycle.id && cycle.count > prev.count) onGesture(cycle.last, cycle.endsAt - prev.endsAt);
      if (withAccount || tick++ % 5 === 0) {
        const q = await N.passQuote();
        S.nearUsd = +q.near_usd_micro / 1e6 || S.nearUsd;
        if (S.wallet) {
          const [pv, cl, bal] = await Promise.all([N.passesOf(ME), N.claimableOf(ME), N.balanceOf(ME)]);
          S.passes.set(ME, pv.minted); S.locks.set(ME, pv.locked);
          S.claimable.set(ME, near(cl)); S.balances.set(ME, near(bal));
        }
        renderAll();
      }
      failed = false;
    } catch (e) {
      if (!failed) toast(`Can't reach ${N.CONTRACT_ID} on testnet: ${e.message || e}`);
      failed = true;
    }
  }

  const tx = (p, ok) => p.then(() => { toast(ok); sync(true); }, e => toast(String(e.message || e)));
  g.connect = () => { SFX.init(); N.connect(); };
  const baseRenderWallet = g.renderWallet;
  g.renderWallet = () => { baseRenderWallet(); if ($("disc")) $("disc").onclick = () => N.disconnect(); };
  g.mintPass = async () => {
    const q = await N.passQuote();
    if (!q.fresh) return toast("The NEAR price feed is stale. Try again shortly.");
    tx(N.mintPass(q.price), "Pass minted. You can play now.");
  };
  // shortcut: pays current_cost × chi; with a discount hero equipped on chain, max chi can exceed the contract's limit.
  g.doStrike = () => {
    if (!S.wallet) return g.connect();
    if (multOf(ME) < 1) return g.mintPass();
    if (!view) return;
    if (view.status === "awaiting_finalize") return tx(N.finalize(), "Round settled.");
    tx(N.gesture((BigInt(view.current_cost) * BigInt(stake)).toString()), "Hit! You hold the final strike.");
  };
  g.claim = id => { tx(N.claim(), "Winnings sent to your wallet."); return S.claimable.get(id) || 0; };

  const selector = await N.initWallet();
  let lastId;
  selector.store.observable.subscribe(async () => {
    const id = await N.accountId();
    if (id === lastId) return;
    lastId = id; S.wallet = id ? { id } : null; if (id) ME = id;
    await sync(true);
  });
  await sync(true);
  setInterval(sync, 1000);
  toast(`Live on NEAR testnet: ${N.CONTRACT_ID}`);
}

if (typeof location !== "undefined" && new URLSearchParams(location.search).has("live")) start();
