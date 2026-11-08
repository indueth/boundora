// Live mode: open index.html?live to play against the deployed contract instead of the simulation.
// Wired to the chain: wallet, clock/pot/fighters (get_cycle every second), pass mint, strike, finalize, claim.
// shortcut: market, auctions, gear, hero minting, NFT locking and round history stay simulated; wire them the same way when needed.
import { CONTRACT_ID, NETWORK, RPCS } from "./config.js";
const NAME_SUFFIX = NETWORK === "mainnet" ? ".near" : ".testnet";
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

// Chain reads go straight to RPC with fetch, so the game is live in about a second;
// the wallet libraries (hundreds of CDN modules) load in the background and are only awaited for signing.
let rpcAt = 0; // index of the last RPC that answered
async function rpcQuery(params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "optimistic", ...params } });
  let r, lastErr;
  for (let i = 0; i < RPCS.length && !r; i++) {
    const url = RPCS[(rpcAt + i) % RPCS.length];
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      const j = res.ok ? await res.json() : null;
      if (j && !(j.error && j.error.code === -429)) { r = j; rpcAt = (rpcAt + i) % RPCS.length; }
      else lastErr = new Error(`${new URL(url).host} answered ${res.status}`);
    } catch (e) { lastErr = e; } // 429s without CORS headers surface here as "Failed to fetch"
  }
  if (!r) throw lastErr;
  // missing access keys and view panics come back as result.error, not a top-level error
  if (r.error || r.result?.error) throw new Error(r.error ? r.error.data || r.error.message : r.result.error);
  return r.result;
}
const view = (method_name, args = {}) => rpcQuery({ request_type: "call_function", account_id: CONTRACT_ID, method_name,
  args_base64: btoa(JSON.stringify(args)) }).then(r => JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))));
const balanceOf = account_id => rpcQuery({ request_type: "view_account", account_id }).then(r => r.amount);
const accountExists = account_id => rpcQuery({ request_type: "view_account", account_id })
  .then(() => true, e => /UNKNOWN_ACCOUNT|does(n't| not) exist/.test(e.message) ? false : Promise.reject(e));
const hasKey = (account_id, public_key) => rpcQuery({ request_type: "view_access_key", account_id, public_key }).then(() => true, () => false);

// ---------- errors players may see
// Only the contract's own require!() text (static, written for players) or a plain summary.
// Raw RPC/wallet errors can carry endpoints, JSON, stack traces or key material: console only.
export function userError(e) {
  const raw = String((e && e.message) ?? e ?? "");
  const panic = raw.match(/panic_msg:\s*\\?"(.{1,200}?)\\?"\s*\}/) || raw.match(/Smart contract panicked: ([^\n"\\]{1,200})/);
  if (panic) return panic[1];
  if (/open popup|allow popup|allow the popup|refused to allow/i.test(raw))
    return "Your browser blocked the wallet window. Allow pop-ups for this site (icon in the address bar), then try again.";
  if (/new action was started/i.test(raw)) return "Finish or close the wallet window that is already open, then try again.";
  if (/reject|cancel|denied|User closed|closed the window/i.test(raw)) return "Transaction cancelled.";
  if (/NotEnoughBalance|not enough balance|insufficient/i.test(raw)) return "Not enough NEAR in your wallet for that.";
  if (/No wallet selected|not signed in/i.test(raw)) return "Connect your wallet first.";
  return "Something went wrong. Please try again.";
}
const fail = e => { console.error(e); toast(userError(e)); };

// ---------- heroes, gear, vaults, hero accounts, market, bids, auctions: all on chain
// "1.5" NEAR -> yocto string, exact (no float math)
export const yocto = n => {
  const [i, f = ""] = String(n).split(".");
  return (BigInt(i || 0) * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
};
const heroNum = t => +String(t).slice(5); // "hero-42" -> 42
const tok = n => `hero-${n}`;
const RANK = { final: "Final gesture", endurance: "Endurance", volume: "Volume", raffle: "Raffle" };
// get_history entry -> the page's round-summary shape (K.O. card, history, win toasts)
export const toSummary = h => {
  const awards = h.awards.map(a => ({ id: a.account_id, rank: RANK[a.rank] || a.rank, amount: near(a.amount),
    art: a.art_token_ids.map(t => ({ id: t, n: heroNum(t), r: Heroes.rarityIdx(heroNum(t)) })) }));
  return { id: h.id, pool: near(h.pool), gestures: h.gestures, players: h.players, seed: h.seed, awards,
    rolled: near(h.rolled_over), final: (awards.find(a => a.rank === "Final gesture") || {}).id || null };
};
// run fn over items, at most `k` RPC calls in flight (public RPCs rate-limit bursts)
async function pmap(items, k, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]); } }));
  return out;
}

function installNftLayer({ view, wallet }) {
  const g = globalThis, CONFIRM = "Confirm in your wallet…";
  let busy = false, gearLoaded = false;

  async function refresh() {
    if (busy) return; busy = true;
    try {
      if (!gearLoaded) {
        (await view("gear_catalog")).forEach(c => { if (GEAR[c.id]) GEAR[c.id].price = near(c.price); });
        S.heroAcctCost = await view("hero_account_cost"); // cached so opening an account goes straight to the wallet
        gearLoaded = true;
      }
      S.history = (await view("get_history", { limit: 10 })).map(toSummary); // rounds and their award heroes
      const supply = await view("hero_supply");
      S.heroMinted = supply.minted_by_rarity.map(Number); CFG.heroPrice = near(supply.price);
      // every minted hero and its owner, newest first (Heroes page "Minted"/"Mine"); passes share the collection
      // shortcut: reads the first 500 tokens; page through nft_tokens once more than that are minted.
      const all = await view("nft_tokens", { from_index: "0", limit: 500 });
      S.art = all.filter(t => t.token_id.startsWith("hero-")).reverse()
        .map(t => { const n = heroNum(t.token_id); S.heroOwner.set(n, t.owner_id); return { id: t.token_id, n, r: Heroes.rarityIdx(n), owner: t.owner_id }; });
      const [listings, auctions, sales, withBids] = await pmap(
        [["get_listings", { limit: 100 }], ["get_auctions", { limit: 50 }], ["get_sales", { limit: 30 }], ["tokens_with_bids", { limit: 30 }]], 2, ([m, a]) => view(m, a));
      S.listings = new Map(listings.map(l => [l.number, { seller: l.seller, price: near(l.price) }]));
      S.auctions = new Map(auctions.map(a => [a.number, { seller: a.seller, ends: +a.ends_at / NS, reserve: near(a.reserve), start: 0 }]));
      S.sales = sales.map(x => ({ n: heroNum(x.token_id), seller: x.seller, buyer: x.buyer, price: near(x.price), royalty: near(x.royalty), at: +x.at / NS }));
      S.volume = S.sales.reduce((t, x) => t + x.price, 0);
      const bids = await pmap(withBids, 3, t => view("bids_on", { token_id: t }).then(b => [heroNum(t), b]));
      S.bids = new Map(bids.filter(([, b]) => b.length).map(([n, b]) => [n, b.map(x => ({ bidder: x.bidder, amount: near(x.amount), at: +x.at / NS }))]));

      const detail = new Set([...S.listings.keys(), ...S.auctions.keys(), ...S.bids.keys()]);
      if (S.wallet) {
        const toks = await view("nft_tokens_for_owner", { account_id: ME, from_index: "0", limit: 100 });
        const mine = new Set(toks.filter(t => t.token_id.startsWith("hero-")).map(t => heroNum(t.token_id)));
        for (const [n, o] of [...S.heroOwner]) if (o === ME && !mine.has(n)) S.heroOwner.delete(n);
        mine.forEach(n => { S.heroOwner.set(n, ME); detail.add(n); });
        const [eq, pass] = await pmap([["equipped_of", { account_id: ME }], ["pass_of", { account_id: ME }]], 2, ([m, a]) => view(m, a));
        if (eq) S.equipped.set(ME, eq.number); else S.equipped.delete(ME);
        if (pass) { const p = pass.stats;
          S.pstats.set(ME, { joinedRound: p.joined_cycle, joined: p.joined_at_ms / 1000, rounds: p.rounds, strikes: p.strikes, wins: p.wins, best: p.best_finish, last: p.last_cycle }); }
      }
      // the fighters on screen are the players' equipped heroes
      const fighters = [...new Set([S.cycle.last, ...S.cycle.players.slice(0, 3).map(p => p.id)])].filter(id => id && id !== ME);
      for (const [id, eq] of await pmap(fighters, 2, id => view("equipped_of", { account_id: id }).then(e => [id, e]))) {
        if (eq) { S.equipped.set(id, eq.number); S.heroOwner.set(eq.number, id); detail.add(eq.number); } else S.equipped.delete(id);
      }
      for (const s of await pmap([...detail].slice(0, 40), 3, n => view("hero_stats", { token_id: tok(n) }))) {
        if (s.owner_id) S.heroOwner.set(s.number, s.owner_id);
        S.hstats.set(s.number, { xp: +s.xp, strikes: s.strikes, wins: s.wins, vault: near(s.vault), earned: near(s.lifetime_earned),
          gear: s.gear.map(name => GEAR.findIndex(x => x.name === name)).filter(i => i >= 0), acct: !!s.account_id });
      }
      if (typeof syncArena === "function") syncArena();
      renderAll();
    } catch (e) { console.warn("hero sync", e); }
    finally { busy = false; }
  }

  // sign a contract call; refresh chain state when it lands. Returns the text the UI shows meanwhile.
  const act = (method, args, deposit = "0", gas = 100, ok) => {
    if (!S.wallet) { g.connect(); return "Connect a wallet first."; }
    wallet().then(N => N.call(method, args, deposit, gas))
      .then(() => { if (ok) { SFX.play("coin"); toast(ok); } return refresh(); }, fail);
    return CONFIRM;
  };

  g.mintHero = () => {
    if (!S.wallet) return g.connect();
    const before = new Set([...S.heroOwner].filter(([, o]) => o === ME).map(([n]) => n));
    toast(`${CONFIRM} Minting costs ${fmt(CFG.heroPrice)} NEAR.`);
    wallet().then(N => N.call("mint_hero", {}, yocto(CFG.heroPrice), 100)).then(async () => {
      await refresh();
      const n = [...S.heroOwner].find(([m, o]) => o === ME && !before.has(m));
      SFX.play("gong"); if (n) openHero(n[0], true); else toast("Hero minted.");
    }, fail);
  };
  g.equipHero = n => act("equip_hero", { token_id: tok(n) }, "0", 50, `Equipped hero #${n}.`);
  g.buyGear = (id, n, gi) => act("buy_gear", { token_id: tok(n), item: gi }, yocto(GEAR[gi].price), 50, `${GEAR[gi].name} added to hero #${n}.`);
  g.moveGear = (id, a, b, gi) => act("move_gear", { from_token: tok(a), to_token: tok(b), item: gi }, "0", 50, `Moved to hero #${b}.`);
  g.claimVault = (id, n) => act("claim_hero_vault", { token_id: tok(n) }, "0", 100, `Claimed hero #${n}'s vault.`);
  g.openAccount = (id, n) => S.heroAcctCost
    ? act("open_hero_account", { token_id: tok(n) }, S.heroAcctCost, 300, `Hero #${n} now has its own NEAR account.`)
    : "Still loading hero account prices. Try again in a moment.";
  g.listHero = (id, n, price) => price >= 0.01
    ? act("list_hero", { token_id: tok(n), price: yocto(+price.toFixed(6)) }, "0", 50, `Hero #${n} listed for ${fmt(price)} NEAR.`)
    : "Minimum price is 0.01 NEAR.";
  g.delistHero = (id, n) => act("delist_hero", { token_id: tok(n) }, "0", 50, `Hero #${n} delisted.`);
  g.doBuy = n => {
    const l = S.listings.get(n); if (!l) return;
    toast(act("buy_hero", { token_id: tok(n) }, yocto(l.price), 100, `You bought hero #${n} for ${fmt(l.price)} NEAR.`));
  };
  g.placeBid = (id, n, total) => {
    if (S.heroOwner.get(n) === id) return "You can't bid on your own hero.";
    const a = S.auctions.get(n);
    if (a && S.now >= a.ends) return act("settle_auction", { token_id: tok(n) }, "0", 150, `Auction for hero #${n} settled.`);
    const prev = myBid(id, n), add = +(total - (prev ? prev.amount : 0)).toFixed(6); // bidding again adds to your bid
    if (!(add > 0)) return `Enter more than your current bid of ${fmt(prev.amount)} NEAR.`;
    return act("place_bid", { token_id: tok(n) }, yocto(add), 50, `Bid placed: ${fmt(total)} NEAR on hero #${n}.`);
  };
  g.withdrawBid = (id, n) => act("withdraw_bid", { token_id: tok(n) }, "0", 50, "Bid withdrawn and refunded.");
  g.acceptBid = (id, n, bidder) => act("accept_bid", { token_id: tok(n), bidder }, "0", 150, `Hero #${n} sold to ${short(bidder)}.`);
  g.startAuction = (id, n, secs, reserve) => act("start_auction",
    { token_id: tok(n), duration_ms: String(secs * 1000), reserve: reserve ? yocto(reserve) : null }, "0", 50, `Auction started for hero #${n}.`);
  g.settleAuctions = () => {}; // anyone settles on chain: bidding on an ended auction calls settle_auction
  g.lockNft = async () => {
    const cols = await view("eligible_collections");
    if (!cols.length) return toast("No NFT collections are approved for locking yet.");
    const v = prompt(`Lock an NFT for +1 chi. Approved: ${cols.join(", ")}\nEnter collection:token_id`, `${cols[0]}:`);
    const [col, id] = (v || "").split(":");
    if (!cols.includes(col) || !id) return v && toast("Use an approved collection and a token id, like collection.testnet:12.");
    (await wallet()).lockNft(col, id).then(() => { toast(`${col} #${id} locked.`); refresh(); }, fail);
  };
  return { refresh };
}

async function start() {
  const g = globalThis;
  g.botsTick = () => {}; g.botMarketTick = () => {}; g.settleIfEnded = () => false;
  let cv = null, tick = 0, failed = false, synced = false, nft = null; // before `ready`: a restored wallet session calls sync() early
  // wallet libraries are one local bundle built by web/build-wallet.mjs
  const ready = import("./boundora-near.bundle.js").then(async N => {
    const selector = await N.initWallet();
    let lastId;
    selector.store.observable.subscribe(async () => {
      const id = await N.accountId();
      if (id === lastId) return;
      lastId = id; S.wallet = id ? { id } : null;
      if (id) { ME = id; if (!S.balances.has(id)) S.balances.set(id, 0); } // header renders before the first balance read
      await sync(true);
      nft?.refresh();
    });
    const pending = JSON.parse(localStorage.getItem(PENDING) || "null");
    if (pending) showClaimResult(N, pending); // back from a wallet redirect mid-claim
    return N;
  });
  ready.catch(e => { console.error(e); toast("Wallet sign-in couldn't load. Refresh the page to try again."); });

  const tx = (p, ok) => p.then(() => { toast(ok); sync(true); nft?.refresh(); }, fail);
  const wallet = async () => { const N = await ready; return N; };
  g.connect = async () => { SFX.init(); toast("Opening wallets…"); (await wallet()).connect(); };
  const baseRenderWallet = g.renderWallet;
  g.renderWallet = () => {
    baseRenderWallet();
    if (!$("disc")) return;
    $("disc").onclick = async () => (await wallet()).disconnect();
    $("disc").insertAdjacentHTML("beforebegin", `<button class="btn ice sm" id="nameBtn">Claim a ${NAME_SUFFIX} name</button>`);
    $("nameBtn").onclick = async () => openNameClaim(await wallet());
  };
  g.mintPass = async () => {
    const q = S.passQuote || await view("pass_quote"); // cached by sync(), so the wallet opens right away
    if (!q.fresh) return toast("The NEAR price feed is stale. Try again shortly.");
    tx((await wallet()).mintPass(q.price), "Pass minted. You can play now.");
  };
  // shortcut: pays current_cost × chi; with a discount hero equipped on chain, max chi can exceed the contract's limit.
  g.doStrike = async () => {
    if (!S.wallet) return g.connect();
    if (multOf(ME) < 1) return g.mintPass();
    if (!cv) return;
    const N = await wallet();
    if (cv.status === "awaiting_finalize") return tx(N.finalize(), "Round settled.");
    tx(N.gesture((BigInt(cv.current_cost) * BigInt(stake)).toString()), "Hit! You hold the final strike.");
  };
  nft = installNftLayer({ view, wallet });
  g.claim = id => { wallet().then(N => tx(N.claim(), "Winnings sent to your wallet.")); return S.claimable.get(id) || 0; };

  renderAll(); // rebind buttons to the handlers above
  if (S.wantConnect) g.connect(); // clicked Connect before this module ran

  const cfg = await view("get_config");
  Object.assign(CFG, {
    initial: +cfg.initial_duration_ms / 1000, ext: +cfg.extension_ms / 1000,
    maxRemain: +cfg.max_remaining_ms / 1000, cooldown: +cfg.cooldown_ms / 1000,
    baseCost: near(cfg.base_cost), stepBps: cfg.cost_step_bps, maxMult: cfg.max_multiplier,
    passUsd: cfg.pass_price_usd_cents / 100,
  });

  async function sync(withAccount) {
    try {
      cv = await view("get_cycle");
      const { now, cycle } = toCycle(cv), prev = S.cycle;
      S.now = now; S.cycle = cycle;
      if (synced && prev.id === cycle.id && cycle.count > prev.count) onGesture(cycle.last, cycle.endsAt - prev.endsAt);
      if (synced && prev.id !== cycle.id) roundEnded(); // settled on chain: K.O. card, awards, new heroes
      synced = true;
      if (withAccount || tick++ % 5 === 0) {
        const q = await view("pass_quote"); S.passQuote = q;
        S.nearUsd = +q.near_usd_micro / 1e6 || S.nearUsd;
        CFG.passNear = q.fixed_near ? near(q.price) : null; // owner-set NEAR price (0.01) beats the $ price
        if (S.wallet) {
          const [pv, cl, bal] = await Promise.all([view("passes_of", { account_id: ME }), view("claimable_of", { account_id: ME }), balanceOf(ME)]);
          S.passes.set(ME, pv.minted); S.locks.set(ME, pv.locked);
          S.claimable.set(ME, near(cl)); S.balances.set(ME, near(bal));
        }
        renderAll();
      }
      failed = false;
    } catch (e) {
      if (!failed) { console.error(e); toast("Can't reach the NEAR network right now. Retrying…"); }
      failed = true;
    }
  }

  async function roundEnded() {
    const [h] = await view("get_history", { limit: 1 });
    if (!h || S.history[0]?.id === h.id) return;
    const sum = toSummary(h); S.history.unshift(sum); S.lastSettled = sum; onSettle(sum); nft.refresh();
  }
  await sync(true);
  setInterval(sync, 2000); // the frame loop counts the clock down between polls
  nft.refresh();
  setInterval(nft.refresh, 20000);
  toast(`Live on NEAR ${NETWORK}: ${CONTRACT_ID}`);
}

// ---------- claim a top-level NEAR name (alice.testnet / alice.near) through NEAR's registrar
// A new key is made in the browser and shown before signing; the player imports it into a wallet.
const PENDING = "boundora:name-claim"; // survives the wallet redirect; cleared once the player has seen the result
// NEAR rules: lowercase a-z 0-9, single - or _ between alphanumerics, whole account id <= 64 chars.
export const validName = (n, suffix) => n.length >= 2 && (n + suffix).length <= 64 && /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(n);

function nameDialog() {
  let d = document.getElementById("nameDlg");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "nameDlg"; d.setAttribute("aria-labelledby", "nameH");
    d.style.cssText = "max-width:480px;width:calc(100% - 32px);border:3px solid var(--ink);border-radius:20px;padding:22px;color:var(--ink);background:var(--snow)";
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  return d;
}
const keyBox = s => `<textarea id="nmKey" readonly rows="3" aria-label="Private key" style="width:100%;box-sizing:border-box;font:.85rem ui-monospace,monospace;margin:6px 0;padding:8px;border:2px solid var(--ink);border-radius:12px">${s}</textarea>
  <div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn ice sm" id="nmCopy">Copy key</button><button class="btn ice sm" id="nmSave">Download key file</button></div>`;
function wireKey(account, kp) {
  $("nmCopy").onclick = () => navigator.clipboard.writeText(kp.secretKey).then(() => toast("Key copied."));
  $("nmSave").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ account_id: account(), public_key: kp.publicKey, private_key: kp.secretKey }, null, 2)], { type: "application/json" }));
    a.download = `${account() || "near-key"}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
}

function openNameClaim(N) {
  const d = nameDialog(), kp = N.newKeyPair(), sfx = N.NAME_SUFFIX;
  d.innerHTML = `<h3 id="nameH" style="margin:0 0 6px">Claim your NEAR name</h3>
    <p class="muted" style="margin:0 0 14px">Get your own account, like <b>alice${sfx}</b>. ${N.NAME_DEPOSIT_NEAR} NEAR from your wallet goes into it.</p>
    <label for="nmIn" style="font-weight:800">Name</label>
    <div style="display:flex;align-items:center;gap:6px;margin:6px 0 4px"><input id="nmIn" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="${64 - sfx.length}" style="flex:1;min-width:0;font:inherit;padding:10px 12px;border:2px solid var(--ink);border-radius:12px"><b>${sfx}</b></div>
    <p id="nmMsg" role="status" aria-live="polite" class="muted" style="margin:0 0 14px;min-height:1.3em">Lowercase letters, digits, - or _.</p>
    <b>Your new account's private key</b>
    ${keyBox(kp.secretKey)}
    <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:16px"><input type="checkbox" id="nmOk" style="margin-top:4px"><span>I saved this key. It's the only way into the new account, and Boundora can't recover it.</span></label>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ice sm" id="nmCancel">Cancel</button><button class="btn sm" id="nmGo" disabled>Claim for ${N.NAME_DEPOSIT_NEAR} NEAR</button></div>`;
  let name = "", free = false, seq = 0;
  const msg = (t, err) => { $("nmMsg").textContent = t; $("nmMsg").style.color = err ? "var(--fire-lo)" : ""; };
  const ready = () => { $("nmGo").disabled = !(free && $("nmOk").checked); };
  $("nmIn").oninput = async e => {
    name = e.target.value = e.target.value.toLowerCase().trim(); free = false; ready();
    if (!name) return msg("Lowercase letters, digits, - or _.");
    if (!validName(name, sfx)) return msg("Use a-z, 0-9 and single - or _ between them (2+ characters).", true);
    const mine = ++seq; msg(`Checking ${name}${sfx}…`);
    const taken = await accountExists(name + sfx).catch(() => null);
    if (mine !== seq) return;
    if (taken === null) return msg("Couldn't check that name. Try again.", true);
    free = !taken; msg(taken ? `${name}${sfx} is taken.` : `${name}${sfx} is available.`, taken); ready();
  };
  $("nmOk").onchange = ready;
  wireKey(() => name && name + sfx, kp);
  $("nmCancel").onclick = () => d.close();
  $("nmGo").onclick = () => {
    $("nmGo").disabled = true; msg("Confirm in your wallet…");
    const claim = { name: name + sfx, ...kp };
    localStorage.setItem(PENDING, JSON.stringify(claim));
    N.claimName(name, kp.publicKey).then(() => showClaimResult(N, claim), e => {
      console.error(e); localStorage.removeItem(PENDING); msg(userError(e), true); ready();
    });
  };
  d.showModal(); $("nmIn").focus();
}

async function showClaimResult(N, claim) {
  const d = nameDialog();
  d.innerHTML = `<h3 id="nameH" style="margin:0">Checking ${claim.name}…</h3>`;
  if (!d.open) d.showModal();
  let ok = false;
  for (let i = 0; i < 8 && !(ok = await hasKey(claim.name, claim.publicKey)); i++) await new Promise(r => setTimeout(r, 1500));
  d.innerHTML = ok
    ? `<h3 id="nameH" style="margin:0 0 6px">${claim.name} is yours</h3>
       <p style="margin:0 0 10px">It's a real NEAR account holding ${N.NAME_DEPOSIT_NEAR} NEAR. Keep this key safe:</p>${keyBox(claim.secretKey)}
       <p class="muted" style="margin:0 0 16px">To use it, import it with the private key: in MyNearWallet choose <b>Import Existing Account</b>, in Meteor choose <b>Add wallet</b>, then <b>Import with private key</b>. Then connect here as ${claim.name}.</p>
       <div style="display:flex;justify-content:flex-end"><button class="btn sm" id="nmDone">Done, I saved the key</button></div>`
    : `<h3 id="nameH" style="margin:0 0 6px">${claim.name} wasn't created</h3>
       <p style="margin:0 0 16px">The claim was cancelled or the name was taken first. If the transaction went through, NEAR's registrar refunded your ${N.NAME_DEPOSIT_NEAR} NEAR.</p>
       <div style="display:flex;justify-content:flex-end"><button class="btn sm" id="nmDone">Close</button></div>`;
  if (ok) wireKey(() => claim.name, claim);
  $("nmDone").onclick = () => { localStorage.removeItem(PENDING); d.close(); };
  if (ok) { SFX.play("coin"); log(`You claimed ${claim.name}`, "me"); }
}

if (typeof location !== "undefined") start(); // always on NEAR testnet
