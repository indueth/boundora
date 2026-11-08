/* ============================================================
   v4: 3D heroes + game-lobby UI (overrides earlier definitions)
   ============================================================ */
function sizeSky(){} function setLiveSeed(){} function drawSky(){}
let H3=null,NO3D=false,arenaStage=null,lineupStage=null,viewer=null;
const fight={L:null,R:null};

/* hero art: scene background (SVG) + 3D render (PNG) */
function sceneBG(n){return Heroes.heroSVG(n,{noHero:true});}
function art(n,extra=""){const r=RCLS[Heroes.rarityIdx(n)];return `<span class="hart ${r} ${extra}" data-n="${n}">${sceneBG(n)}<img alt="" data-art="${n}"></span>`;}
function hydrate(img){
  if(img.dataset.done)return;const n=+img.dataset.art;
  if(H3){const c=H3.cached(n);img.dataset.done=1;
    if(c){img.src=c;img.classList.add("on","now");}
    else H3.thumb(n).then(u=>{if(u){img.src=u;img.classList.add("on");}});}
  else if(NO3D){img.dataset.done=1;const box=document.createElement("div");box.innerHTML=Heroes.heroSVG(n,{background:false});const svg=box.firstChild;svg.setAttribute("style","position:absolute;inset:0;width:100%;height:100%");img.replaceWith(svg);}
}
function hydrateAll(){document.querySelectorAll("img[data-art]:not([data-done])").forEach(hydrate);}
new MutationObserver(()=>{if(H3||NO3D)hydrateAll();}).observe(document.body,{childList:true,subtree:true});

function on3D(){
  if(H3||!window.Hero3D)return;
  try{
    arenaStage=new Hero3D.Stage($("arena3d"),{camera:[0,1.5,10.6],look:[0,1.05,0],fov:28,narrowZoom:1.7});
    lineupStage=new Hero3D.Stage($("lineup"),{camera:[0,1.4,11.5],look:[0,1.35,0],fov:24,narrowZoom:1.35});
    lineupStage.setHeroes([{n:Heroes.numberFor(3,2),x:-2.35,z:-.5,ry:.5},{n:Heroes.numberFor(4,3),x:0,z:.35,ry:0,scale:1.12},{n:Heroes.numberFor(2,4),x:2.35,z:-.5,ry:-.5}]);
    H3=window.Hero3D;syncArena();hydrateAll();
  }catch(e){NO3D=true;hydrateAll();}
}
if(window.Hero3D)on3D();else addEventListener("hero3d-ready",on3D);
setTimeout(()=>{if(!H3){NO3D=true;hydrateAll();}},9000);

/* arena */
function heroFor(id){if(!id)return 0;const n=equippedN(id);return n||1+parseInt(hash256("stand"+id).slice(0,8),16)%20000;}
function setFighter(el,id){if(el==="faL")fight.L=id;else fight.R=id;const pl=$(el==="faL"?"plL":"plR");if(pl)pl.textContent=id?short(id):"Waiting";syncArena();}
function syncArena(){if(!arenaStage)return;const nL=fight.L?heroFor(fight.L):Heroes.numberFor(3,5),nR=fight.R?heroFor(fight.R):Heroes.numberFor(2,9);
  arenaStage.setHeroes([{n:nL,x:-1.8,ry:.72},{n:nR,x:1.8,ry:-.72}]);}
function animateFight(){if(arenaStage)arenaStage.strike(0,1);}
function contactPoint(){const a=$("arena").getBoundingClientRect();return{x:a.width/2,y:a.height*.6};}
function fighterHTML(id,role,pct,jade){const n=id?heroFor(id):0;
  return `<span class="face">${n?`<img data-art="${n}" alt="">`:""}</span><div style="min-width:0"><div class="nm">${id?short(id):"Open spot"}</div><div class="role">${role}</div><div class="bar ${jade?"jade":""}"><i class="trail" style="width:${pct||0}%"></i><i class="fill" style="width:${pct||0}%"></i></div></div>`;}

/* wallet + sound */
function renderWallet(){
  const w=$("wallet");
  if(!S.wallet){w.innerHTML=`<button class="btn sm" id="connect">Connect wallet</button>`;$("connect").onclick=connect;return;}
  w.innerHTML=`<span class="coin" title="${ME}"><i>N</i>${fmt(S.balances.get(ME))}</span><button class="btn ice sm" id="disc">Leave</button>`;
  $("disc").onclick=()=>{S.wallet=null;renderAll();};
}
function renderMute(){$("mute").innerHTML=SFX.on?'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#13233F" stroke-width="2.4" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>':'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B6F8F" stroke-width="2.4"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  $("mute").setAttribute("aria-label",SFX.on?"Sound on. Turn off":"Sound off. Turn on");}

/* cards */
function heroCard(n,extra){
  const t=Heroes.traits(n),r=RCLS[t.rarityIdx],o=S.heroOwner.get(n),eq=o&&S.equipped.get(o)===n,l=S.listings&&S.listings.get(n);
  return `<button class="hcard ${o?"":"unminted"}" data-n="${n}">${art(n)}<b>#${n} ${t.name}</b><small>${o?`<span class="tag lv">Lv ${heroLv(n)}</span> `:""}${gearOf(n).length?`<span class="tag gr">${gearOf(n).length} gear</span> `:""}<span class="tag ${r}">${t.rarity}</span> ${o?short(o):"Not minted"}${eq&&o===ME?' <span class="tag eq">Equipped</span>':""}${l&&extra!=="nolist"?` <span style="color:var(--fire-lo)">${fmt(l.price)} NEAR</span>`:""}</small></button>`;
}
function rtile(i,n){return `<div class="rtile">${art(n)}<b>${Heroes.RARITIES[i]}</b> <span class="muted">${SUPPLY_BY[i].toLocaleString()}</span><p>${Heroes.POWERS[i]}</p></div>`;}
function renderPowers(){$("powers").innerHTML=Heroes.RARITIES.map((r,i)=>rtile(i,Heroes.numberFor(i,31))).join("");}

/* home */
let homeDone=false,liveT=0;
function renderHome(){
  if(!homeDone){homeDone=true;
    const W=[["35%","Final strike","Last to strike at zero. Legendary hero (5% Mythic).",3],["20%","Iron stance","Hold the lead the longest. Epic hero.",2],["25%","Chi masters","Top 3 stakers. Rare hero each.",1]];
    $("homeWins").innerHTML=W.map(([p,h,d,r])=>`<div class="panel win">${art(Heroes.numberFor(r,11))}<div class="panel-b"><div class="pct" style="color:var(--r-${RCLS[r]})">${p}</div><h3>${h}</h3><p>${d}</p></div></div>`).join("");
    $("homeRar").innerHTML=Heroes.RARITIES.map((r,i)=>rtile(i,Heroes.numberFor(i,20))).join("");
  }
  renderLive();
}
function renderLive(){
  const c=S.cycle,cool=S.now<c.opensAt,rem=cool?c.opensAt-S.now:Math.max(0,c.endsAt-S.now);
  $("liveCard").innerHTML=`<div class="panel-b"><div><small><span class="dot"></span>Round ${c.id} ${cool?"starts in":"is live"}</small><div class="t">${Math.floor(rem/60)}:${String(Math.floor(rem%60)).padStart(2,"0")}</div></div>
    <div><small>Pot</small><div class="t" style="font-size:1.45rem">${fmt(c.pool)} NEAR</div><small>${c.last?`Leading: ${short(c.last)}`:"No strikes yet"}</small></div><a class="btn" href="/play">Join</a></div>`;
}

/* roster */
function renderRoster(){
  const c=S.cycle;
  if(!c.players.length){$("roster").innerHTML=`<p class="empty">${S.now<c.opensAt?"Fighters are getting ready for the next round.":"No strikes yet. Strike first to start the clock."}</p>`;return;}
  const rows=c.players.map(p=>({...p,h:heldOf(p.id)})).sort((a,b)=>b.volume-a.volume);
  const champ=rows.filter(r=>r.id!==c.last&&r.h>0).sort((a,b)=>b.h-a.h)[0];
  $("roster").innerHTML=rows.map((r,i)=>{const eq=equippedN(r.id);return `<div class="fr ${r.id===ME?"me":""}"><span class="pos">${i+1}</span>${art(heroFor(r.id))}
    <div style="min-width:0"><b>${short(r.id)}</b>${r.id===c.last?'<span class="badge f">Final strike</span>':""}${champ&&r.id===champ.id?'<span class="badge e">Iron stance</span>':""}${i<CFG.volumeWinners?'<span class="badge v">Chi master</span>':""}
    <small style="display:block">${eq?`${Heroes.RARITIES[Heroes.rarityIdx(eq)]} hero #${eq}`:"No hero equipped"}</small></div>
    <div class="num">${fmt(r.volume)} NEAR<small>${r.gestures} strike${r.gestures>1?"s":""}, ${r.h.toFixed(0)}s held</small></div></div>`;}).join("");
}

/* K.O. */
function renderKO(){
  const sum=S.lastSettled,ko=$("ko");if(!sum||S.now>=S.cycle.opensAt)return;
  const cards=sum.awards.filter(a=>a.art.length).map((a,i)=>{const h=a.art[0];return `<div class="lc" style="animation-delay:${i*90}ms">${art(h.n)}<div class="who">${short(a.id)}</div><small>${RANKNAME[a.rank]||a.rank}, ${Heroes.RARITIES[h.r]}${a.amount?`, ${fmt(a.amount)} NEAR`:""}</small></div>`;}).join("");
  ko.innerHTML=`<div class="panel"><div class="panel-h"><h3>Round ${sum.id} results</h3></div><div class="panel-b">
    <h2>${sum.final?(sum.final===ME?"You land the final strike!":`${short(sum.final)} lands the final strike`):"Nobody fought this round"}</h2>
    <p>${fmt(sum.pool)} NEAR pot, ${sum.gestures} strike${sum.gestures===1?"":"s"}, ${sum.players} fighter${sum.players===1?"":"s"}. ${fmt(sum.rolled)} NEAR carries into round ${sum.id+1}.</p>
    <div class="loot">${cards}</div><div class="next" id="nextIn"></div></div></div>`;
  ko.classList.add("on");
}

/* gear icons */
const GEAR_ICON=[
 '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L18 9 L19 21 L5 21 L6 9Z" fill="#7FB8E6" stroke="#13233F" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9 L12 12 L15 9" fill="none" stroke="#fff" stroke-width="1.8"/></svg>',
 '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 C15 7 18 9 18 14 A6 6 0 0 1 6 14 C6 10 9 9 12 3Z" fill="#FF8A1F" stroke="#13233F" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 11 C13.5 13 14.5 14 14.5 15.5 A2.5 2.5 0 0 1 9.5 15.5 C9.5 14 11 13 12 11Z" fill="#FFD36B"/></svg>',
 '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8 L8 4 L12 7 L16 4 L19 8 V15 A7 6 0 0 1 5 15Z" fill="#F4F7FB" stroke="#13233F" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9.5" cy="11" r="2.2" fill="#FFC23A" stroke="#13233F" stroke-width="1.2"/><circle cx="14.5" cy="11" r="2.2" fill="#FFC23A" stroke="#13233F" stroke-width="1.2"/><path d="M11 14 L12 16 L13 14Z" fill="#FF8A1F"/></svg>',
 '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 10 L12 22 L4 10Z" fill="#B57BFF" stroke="#13233F" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 10 H20 M12 2 L9 10 L12 22 L15 10Z" fill="none" stroke="#fff" stroke-width="1.1" opacity=".8"/></svg>'];
const mineOther=n=>[...S.heroOwner].filter(([m,o])=>o===ME&&m!==n).map(([m])=>m).slice(0,30);

/* hero profile */
function openHero(n,fresh){
  const t=Heroes.traits(n),r=RCLS[t.rarityIdx],o=S.heroOwner.get(n),eq=o&&equippedN(o)===n,md=Heroes.metadata(n),lst=S.listings.get(n);
  $("dlgArt").innerHTML=sceneBG(n);
  if(H3){try{if(!viewer)viewer=new Hero3D.Viewer($("dlgCanvas"),n);else{viewer.set(n);viewer.start();}}catch(e){$("dlgArt").innerHTML=Heroes.heroSVG(n);}}
  else $("dlgArt").innerHTML=Heroes.heroSVG(n);
  $("dlgH").textContent=`${fresh?"New hero: ":""}${t.name}`;
  $("dlgSub").innerHTML=`Boundora Hero #${n} <span class="tag ${r}">${t.rarity}</span>`;
  $("dlgStars").innerHTML=Array.from({length:5},(_,i)=>`<span style="color:${i<=t.rarityIdx?"#1FC8E6":"#CFDCE8"}">${SNOW}</span>`).join("");
  $("dlgMight").innerHTML=`<span class="might">Might ${t.might.toLocaleString()}</span>`;
  {const x=S.hstats.get(n)||{xp:0,strikes:0,wins:0,vault:0,earned:0},L=lvlOf(x.xp),lo=xpFor(L),hi=L>=MAX_LV?lo:xpFor(L+1),pct=L>=MAX_LV?100:Math.round((x.xp-lo)/(hi-lo)*100),lb=lvlBonus(L);
  $("dlgPower").innerHTML=`<b>Power when equipped</b><br>${t.power}${lb?`, plus ${lb}s more per strike from level ${L}`:""}
   <div class="hstat"><div class="lvrow"><span class="lvbadge">Lv ${L}</span><div class="xpbar" role="progressbar" aria-label="XP to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><small>${L>=MAX_LV?"Max level":`${x.xp-lo}/${hi-lo} XP`}</small></div>
   <div class="hnums"><div><small>Strikes</small><b>${x.strikes}</b></div><div><small>Wins</small><b>${x.wins}</b></div><div><small>Vault</small><b>${fmt(x.vault)} NEAR</b></div><div><small>Earned ever</small><b>${fmt(x.earned)} NEAR</b></div></div>
   <p class="hnote">Earns 10% of its owner's winnings and 40% of its resale royalty.</p>
   ${o===ME&&x.vault>0?`<button class="btn btn-gold sm" id="dlgVault">Claim ${fmt(x.vault)} NEAR from vault</button>`:""}
   <div class="acctrow">${x.acct?`<span class="tag acct">Own NEAR account</span> <code>${acctOf(n)}</code>`
     :o===ME?`<button class="btn ice sm" id="dlgAcct">Give it its own NEAR account (${fmt(HERO_ACCT_COST)} NEAR)</button><small><code>${acctOf(n)}</code></small>`:`<small>No account of its own yet.</small>`}</div></div>
   <div class="inv"><b>Inventory</b> <span class="muted">${(x.gear||[]).length}/${GEAR_SLOTS} slots.</span>
   <div class="slots">${[0,1,2].map(i=>{const g=(x.gear||[])[i];return g===undefined?`<div class="slot empty">Empty</div>`:`<div class="slot">${GEAR_ICON[g]}<b>${GEAR[g].name}</b><small>${GEAR[g].fx}</small>${o===ME&&mineOther(n).length?`<select class="ctl mv" data-g="${g}" aria-label="Move ${GEAR[g].name} to another hero"><option value="">Move to...</option>${mineOther(n).map(m=>`<option value="${m}">#${m}</option>`).join("")}</select>`:""}</div>`;}).join("")}</div>
   ${o===ME&&(x.gear||[]).length<GEAR_SLOTS?`<div class="shop">${GEAR.map((it,g)=>(x.gear||[]).includes(g)?"":`<button class="btn sm ice" data-buy="${g}">${it.name}: ${fmt(it.price)} NEAR</button>`).join("")}</div>`:""}</div>`;}
  $("dlgT").innerHTML=md.attributes.filter(x=>x.trait_type!=="Rarity").map(x=>`<dt>${x.trait_type}</dt><dd>${x.value}</dd>`).join("")+`<dt>Owner</dt><dd>${o||"Not minted yet"}</dd>${lst?`<dt>For sale</dt><dd>${fmt(lst.price)} NEAR</dd>`:""}<dt>Token</dt><dd>hero-${n}, NEP-171 with live metadata, 5% royalty</dd>`;
  let h="";
  if(o===ME){h+=eq?`<span class="tag eq" style="font-size:.95rem;padding:4px 12px">Equipped</span>`:`<button class="btn sm" id="equipBtn">Equip</button>`;
    h+=lst?`<button class="btn ice sm" id="dlgDelist">Delist (${fmt(lst.price)} NEAR)</button>`:`<button class="btn ice sm" id="dlgSell">Sell</button>`;}
  else if(lst)h+=`<button class="btn sm" id="dlgBuy">Buy for ${fmt(lst.price)} NEAR</button>`;
  $("dlgAct").innerHTML=h;
  if($("equipBtn"))$("equipBtn").onclick=()=>{const err=equipHero(n);if(err){$("dlg").close();return toast(err);}SFX.play("coin");toast(`Equipped #${n}. ${t.power}.`);log(`You equipped hero #${n}`,"me");$("dlg").close();syncArena();renderAll();};
  if($("dlgSell"))$("dlgSell").onclick=()=>{sellN=n;$("dlg").close();go("/market");};
  if($("dlgDelist"))$("dlgDelist").onclick=()=>{delistHero(ME,n);toast(`Hero #${n} delisted.`);$("dlg").close();renderAll();};
  if($("dlgAcct"))$("dlgAcct").onclick=()=>{const err=openAccount(ME,n);if(err)return toast(err);SFX.play("coin");toast(`Hero #${n} now has its own NEAR account.`);openHero(n);renderAll();};
  $("dlgPower").querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{const err=buyGear(ME,n,+b.dataset.buy);if(err)return toast(err);SFX.play("coin");toast(`${GEAR[+b.dataset.buy].name} added to hero #${n}.`);openHero(n);renderAll();});
  $("dlgPower").querySelectorAll("select.mv").forEach(sl=>sl.onchange=()=>{if(!sl.value)return;const err=moveGear(ME,n,+sl.value,+sl.dataset.g);if(err)return toast(err);toast(`Moved to hero #${sl.value}.`);openHero(n);renderAll();});
  if($("dlgVault"))$("dlgVault").onclick=()=>{const err=claimVault(ME,n);if(err)return toast(err);SFX.play("coin");toast("Vault claimed.");openHero(n);renderAll();};
  if($("dlgBuy"))$("dlgBuy").onclick=()=>{$("dlg").close();doBuy(n);};
  if(!$("dlg").open)$("dlg").showModal();
  $("dlgH").setAttribute("tabindex","-1");$("dlgH").focus({preventScroll:true});$("dlg").scrollTop=0;
}
$("dlg").addEventListener("close",()=>{if(viewer)viewer.stop();});

/* routing: Home, Play, Heroes, Market */
// Clean URLs: /, /play, /heroes, /market (Vercel serves index.html for each). Old #play links forward to /play.
const PAGES=["home","play","heroes","market"];
function go(path){if(location.pathname!==path)history.pushState(null,"",path);route();}
document.addEventListener("click",e=>{const a=e.target.closest&&e.target.closest("a[href]");if(!a||a.target||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const h=a.getAttribute("href");if(!/^\/(play|heroes|market)?$/.test(h))return;e.preventDefault();go(h);});
addEventListener("popstate",()=>route());
function route(){
  const old=(location.hash||"").slice(1);if(PAGES.includes(old))history.replaceState(null,"",old==="home"?"/":"/"+old);
  const p=location.pathname.replace(/^\/+|\/+$/g,"")||"home",cur=PAGES.includes(p)?p:"home";
  PAGES.forEach(x=>$("pg-"+x).hidden=x!==cur);
  document.querySelectorAll("[data-nav]").forEach(a=>a.setAttribute("aria-current",a.dataset.nav===cur?"page":"false"));
  if(cur==="market"){renderMarket(true);renderAuctions(true);}if(cur==="play")sizeFx();if(cur==="home")renderHome();if(cur==="heroes")renderVault(true);
  window.scrollTo(0,0);
}

/* ============================================================
   Bids + auctions (mirrors contract: place_bid, withdraw_bid, accept_bid,
   start_auction, settle_auction). Bid NEAR is held in escrow.
   ============================================================ */
S.bids=new Map();S.auctions=new Map();
const AUC_STEP=1.05;
const bidsOn=n=>(S.bids.get(n)||[]).slice().sort((a,b)=>b.amount-a.amount);
const myBid=(id,n)=>(S.bids.get(n)||[]).find(b=>b.bidder===id);
function minBid(n){const a=S.auctions.get(n),top=bidsOn(n)[0];if(!a)return .01;return Math.max(.01,a.reserve||0,top?top.amount*AUC_STEP:0);}
function placeBid(id,n,total){
  const o=S.heroOwner.get(n);if(!o)return "That hero hasn't been minted yet.";if(o===id)return "You can't bid on your own hero.";
  const prev=myBid(id,n),add=+(total-(prev?prev.amount:0)).toFixed(4);
  if(!(total>=.01))return "Minimum bid is 0.01 NEAR.";if(add<=0)return `Enter more than your current bid of ${fmt(prev.amount)} NEAR.`;
  const a=S.auctions.get(n);
  if(a){if(S.now>=a.ends)return "This auction has ended.";const need=minBid(n);if(total<need-1e-9)return `Bid at least ${fmt(need)} NEAR: 5% over the top bid${a.reserve?", and at or above the reserve":""}.`;}
  if((S.balances.get(id)||0)<add)return "Not enough NEAR for that bid.";
  S.balances.set(id,S.balances.get(id)-add);
  const list=S.bids.get(n)||[];if(prev){prev.amount=total;prev.at=S.now;}else list.push({bidder:id,amount:total,at:S.now});S.bids.set(n,list);
  if(a&&a.ends-S.now<20)a.ends=S.now+20; // last-second bids extend the auction a little (demo only)
  log(`${short(id)} bid ${fmt(total)} NEAR on hero #${n}`,id===ME||o===ME?"me":"");
  if(o===ME&&id!==ME&&!booting)toast(`New bid: ${short(id)} offers ${fmt(total)} NEAR for hero #${n}.`);
  return null;
}
function refundBids(n,keep){for(const b of S.bids.get(n)||[])if(b.bidder!==keep)S.balances.set(b.bidder,(S.balances.get(b.bidder)||0)+b.amount);S.bids.delete(n);}
function withdrawBid(id,n){
  const a=S.auctions.get(n);if(a&&S.now<a.ends)return "Bids are locked until the auction ends.";
  const list=S.bids.get(n)||[],i=list.findIndex(b=>b.bidder===id);if(i<0)return "You have no bid on this hero.";
  const b=list.splice(i,1)[0];S.balances.set(id,S.balances.get(id)+b.amount);if(!list.length)S.bids.delete(n);
  log(`${short(id)} withdrew a ${fmt(b.amount)} NEAR bid on hero #${n}`,id===ME?"me":"");return null;
}
function sellTo(n,seller,buyer,price,how){
  S.listings.delete(n);S.auctions.delete(n);
  const list=(S.bids.get(n)||[]).filter(b=>b.bidder!==buyer);S.bids.set(n,list);refundBids(n);
  const roy=price*ROYALTY;S.treasury+=roy*(1-HERO_ROY);heroEarn(n,roy*HERO_ROY,"its resale royalty");S.balances.set(seller,(S.balances.get(seller)||0)+price-roy);transferHero(n,seller,buyer);
  S.sales.unshift({n,seller,buyer,price,royalty:roy,at:S.now,how});S.volume+=price;
  if(buyer!==ME)equipBest(buyer);if(seller!==ME&&!equippedN(seller))equipBest(seller);
  log(`${short(buyer)} won hero #${n} from ${short(seller)} for ${fmt(price)} NEAR (${how})`,buyer===ME||seller===ME?"me":"sys");
  if(!booting&&(buyer===ME||seller===ME)){SFX.play("coin");toast(buyer===ME?`You won hero #${n} for ${fmt(price)} NEAR.`:`Hero #${n} sold to ${short(buyer)} for ${fmt(price)} NEAR. You got ${fmt(price-roy)}.`);if(buyer===ME&&!equippedN(ME))S.equipped.set(ME,n);}
}
function acceptBid(id,n,bidder){
  if(S.heroOwner.get(n)!==id)return "You don't own that hero.";const b=myBid(bidder,n);if(!b)return "That bid is no longer there.";
  sellTo(n,id,bidder,b.amount,"bid accepted");return null;
}
function startAuction(id,n,secs,reserve){
  if(S.heroOwner.get(n)!==id)return "You don't own that hero.";if(S.auctions.has(n))return "This hero is already in an auction.";
  S.listings.delete(n);S.auctions.set(n,{seller:id,ends:S.now+secs,reserve:Math.max(0,reserve||0),start:S.now});
  log(`${short(id)} put hero #${n} up for auction`,id===ME?"me":"");return null;
}
function settleAuctions(){
  for(const[n,a]of[...S.auctions]){if(S.now<a.ends)continue;
    const best=bidsOn(n)[0];
    if(best&&best.amount>=a.reserve&&S.heroOwner.get(n)===a.seller)sellTo(n,a.seller,best.bidder,best.amount,"auction");
    else{S.auctions.delete(n);refundBids(n);log(`The auction for hero #${n} ended without a sale`,a.seller===ME?"me":"");if(a.seller===ME&&!booting)toast(`Your auction for hero #${n} ended without a winning bid. Any bids were refunded.`);}
  }
}
/* practice players bid too */
function botBidTick(){
  const bots=BOTS.map(b=>b.id),r=Math.random();
  if(r<.5&&S.auctions.size){ // outbid on a running auction
    const aucs=[...S.auctions].filter(([n,a])=>S.now<a.ends);if(!aucs.length)return false;
    const[n,a]=aucs[Math.floor(Math.random()*aucs.length)],[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)],need=minBid(n);
    if(need>hi*1.4)return false;
    const b=bots.filter(x=>x!==a.seller&&(bidsOn(n)[0]||{}).bidder!==x)[Math.floor(Math.random()*5)];if(!b)return false;
    return !placeBid(b,n,+(Math.max(need,lo*.8)*(1+Math.random()*.15)).toFixed(3));
  }
  if(r<.75){ // make an offer on someone's hero (including yours)
    const owned=[...S.heroOwner].filter(([n,o])=>!S.auctions.has(n));if(!owned.length)return false;
    const[n,o]=owned[Math.floor(Math.random()*owned.length)],[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)];
    const b=bots.filter(x=>x!==o)[Math.floor(Math.random()*6)];if(!b||myBid(b,n))return false;
    return !placeBid(b,n,+(lo*(.7+Math.random()*.5)).toFixed(3));
  }
  if(r<.9){ // a bot owner accepts a good offer
    for(const[n,list]of S.bids){const o=S.heroOwner.get(n);if(!o||o===ME||S.auctions.has(n)||!BOTS.some(b=>b.id===o))continue;
      const top=bidsOn(n)[0],[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)];if(top&&top.amount>=lo+(hi-lo)*.35){acceptBid(o,n,top.bidder);return true;}}
    return false;
  }
  // a bot starts an auction
  const b=bots[Math.floor(Math.random()*bots.length)],spare=[...S.heroOwner].filter(([n,o])=>o===b&&!S.listings.has(n)&&!S.auctions.has(n)&&equippedN(b)!==n).map(([n])=>n);
  if(!spare.length||S.auctions.size>=6)return false;const n=spare[Math.floor(Math.random()*spare.length)];
  return !startAuction(b,n,120+Math.floor(Math.random()*240),+(PRICE_BAND[Heroes.rarityIdx(n)][0]*.8).toFixed(2));
}

/* ---------- bid UI ---------- */
const mmss=s=>{s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;};
let openN=0,bidTimer=null;
let bidKey="";
function renderBidBox(force){
  const n=openN,box=$("dlgBids");if(!n||!box)return;
  const a0=S.auctions.get(n),k=[n,S.heroOwner.get(n),JSON.stringify(bidsOn(n)),a0?a0.ends:0,!!S.wallet,a0&&S.now>=a0.ends].join("|");
  const tm=box.querySelector(".auc-timer");if(tm&&a0){tm.textContent=S.now<a0.ends?"Ends in "+mmss(a0.ends-S.now):"Ending";tm.classList.toggle("calm",a0.ends-S.now>30);}
  if(k===bidKey&&!force)return;bidKey=k;
  const o=S.heroOwner.get(n),a=S.auctions.get(n),list=bidsOn(n),mine=myBid(ME,n),isOwner=o===ME;
  if(!o){box.innerHTML=`<h4>Bids</h4><p class="bidnote">This hero hasn't been minted yet, so it can't take bids.</p>`;return;}
  const rows=list.slice(0,6).map((b,i)=>`<div class="bidrow ${i?"":"top"}"><span>${b.bidder===ME?"You":short(b.bidder)}${i?"":' <span class="tag eq" style="font-size:.7rem">Top</span>'}</span><b>${fmt(b.amount)} NEAR</b>${isOwner?`<button class="btn sm" data-accept="${b.bidder}">Accept</button>`:"<span></span>"}</div>`).join("");
  let head=a?`<h4>Auction <span class="auc-timer ${a.ends-S.now>30?"calm":""}">${S.now<a.ends?"Ends in "+mmss(a.ends-S.now):"Ending"}</span></h4><p class="bidnote">Highest bid wins automatically${a.reserve?`, if it's at least the ${fmt(a.reserve)} NEAR reserve`:""}. Bids are locked until it ends.</p>`
    :`<h4>Bids <span class="muted" style="font-family:var(--body);font-size:.85rem;font-weight:800">${list.length?list.length+" open":"none yet"}</span></h4>`;
  let form="";
  if(isOwner){
    form=a?`<p class="bidnote">You can still accept any bid early, or let the timer pick the highest.</p>`
      :`<p class="bidnote">${list.length?"Accept the bid you want: it doesn't have to be the highest. Or let an auction pick the highest automatically.":"No bids yet. Start an auction and the highest bid wins automatically."}</p>
        <div class="bidform"><select id="dlgAucDur" aria-label="Auction length"><option value="120">2 minutes</option><option value="300" selected>5 minutes</option><option value="900">15 minutes</option></select><button class="btn ice sm" id="dlgAuc">Start auction</button></div>`;
  }else if(S.wallet){
    const need=a?minBid(n):Math.max(.01,(list[0]?list[0].amount*1.01:PRICE_BAND[Heroes.rarityIdx(n)][0]*.8));
    form=`<div class="bidform"><input id="bidAmt" type="number" min="0.01" step="0.01" value="${(mine&&!a?Math.max(mine.amount,need):need).toFixed(2)}" aria-label="Your total bid in NEAR"><button class="btn sm" id="bidBtn">${mine?"Raise bid":"Place bid"}</button></div>
      <p class="bidnote">${mine?`Your bid: ${fmt(mine.amount)} NEAR, held in escrow. Raising only charges the difference.`:"Your NEAR is held in escrow and refunded if you don't win."}${mine&&!a?` <a href="#" id="bidWd">Withdraw</a>`:""}</p>`;
  }else form=`<p class="bidnote">Connect a wallet to bid.</p>`;
  box.innerHTML=head+(rows||`<p class="bidnote" style="margin:4px 0 0">No bids yet.</p>`)+form;
  box.querySelectorAll("[data-accept]").forEach(b=>b.onclick=()=>{const err=acceptBid(ME,n,b.dataset.accept);if(err)return toast(err);$("dlg").close();renderAll();});
  if($("dlgAuc"))$("dlgAuc").onclick=()=>{const err=startAuction(ME,n,+$("dlgAucDur").value,0);if(err)return toast(err);SFX.play("fight");toast(`Auction started for hero #${n}. The highest bid wins.`);renderBidBox();renderAll();};
  if($("bidBtn"))$("bidBtn").onclick=()=>{const v=+$("bidAmt").value;const err=placeBid(ME,n,v);if(err)return toast(err);SFX.play("hit");toast(`Bid placed: ${fmt(v)} NEAR on hero #${n}.`);renderBidBox();renderAll();};
  if($("bidWd"))$("bidWd").onclick=e=>{e.preventDefault();const err=withdrawBid(ME,n);if(err)return toast(err);toast("Bid withdrawn and refunded.");renderBidBox();renderAll();};
}
const _openHeroBase=openHero;
openHero=function(n,fresh){openN=n;_openHeroBase(n,fresh);renderBidBox(true);clearInterval(bidTimer);bidTimer=setInterval(()=>{if(!$("dlg").open){clearInterval(bidTimer);openN=0;return;}const f=document.activeElement&&document.activeElement.id;if(f==="bidAmt")return;renderBidBox();},500);};

let aucKey="";
function renderAuctions(force){
  if($("pg-market").hidden&&!force)return;
  const A=[...S.auctions].sort((x,y)=>x[1].ends-y[1].ends);
  const key=A.map(([n,a])=>n+":"+Math.ceil(a.ends-S.now)+":"+(bidsOn(n)[0]||{}).amount).join("|")+S.wallet;
  if(key===aucKey&&!force)return;aucKey=key;
  $("mkAuctions").innerHTML=A.length?A.map(([n,a])=>{const top=bidsOn(n)[0];return `<div class="lcard acard">${heroCard(n,"nolist")}<div class="meta"><div><small>${top?"Top bid":"Reserve"}</small><b>${fmt(top?top.amount:a.reserve)} NEAR</b></div><span class="auc-timer ${a.ends-S.now>30?"calm":""}">${mmss(a.ends-S.now)}</span></div><button class="btn sm" data-bidn="${n}" style="margin-top:8px">${a.seller===ME?"View bids":myBid(ME,n)?"Raise bid":"Bid"}</button></div>`;}).join("")
    :`<p class="empty">No auctions running. Start one from the sell panel: the highest bid wins automatically.</p>`;
  bindCards($("mkAuctions"));$("mkAuctions").querySelectorAll("[data-bidn]").forEach(b=>b.onclick=()=>openHero(+b.dataset.bidn));
  // your bids
  const mine=[...S.bids].filter(([n,l])=>l.some(b=>b.bidder===ME)).map(([n])=>n);
  $("mkMyBids").innerHTML=!S.wallet?`<li style="display:block;color:var(--muted)">Connect a wallet to bid.</li>`:mine.length?mine.map(n=>{const b=myBid(ME,n),top=bidsOn(n)[0],lead=top&&top.bidder===ME,a=S.auctions.get(n);
      return `<li>${art(n)}<div>#${n} ${a?"(auction)":""}<small>${lead?"You're the top bid":`Top bid ${fmt(top.amount)} NEAR`}</small></div><button class="btn ${lead?"ice":""} sm" data-bidn="${n}">${fmt(b.amount)}</button></li>`;}).join("")
    :`<li style="display:block;color:var(--muted)">No open bids. Tap any hero to make an offer.</li>`;
  $("mkMyBids").querySelectorAll("[data-bidn]").forEach(b=>b.onclick=()=>openHero(+b.dataset.bidn));
}
const _heroCardBase=heroCard;
heroCard=function(n,extra){let h=_heroCardBase(n,extra);const a=S.auctions&&S.auctions.get(n),top=S.bids&&bidsOn(n)[0];
  if(a)h=h.replace("</small></button>",` <span class="tag" style="background:var(--hot)">Auction</span></small></button>`);
  else if(top&&extra!=="nolist")h=h.replace("</small></button>",` <span class="muted">bid ${fmt(top.amount)}</span></small></button>`);return h;};

function seedAuctions(){ // a few auctions already running when you arrive
  const bots=BOTS.map(b=>b.id);let made=0;
  for(const b of bots){if(made>=3)break;const spare=[...S.heroOwner].filter(([n,o])=>o===b&&!S.listings.has(n)&&equippedN(b)!==n).map(([n])=>n);
    if(!spare.length)continue;const n=spare[0];if(startAuction(b,n,150+made*90,+(PRICE_BAND[Heroes.rarityIdx(n)][0]*.8).toFixed(2)))continue;made++;
    for(let k=0;k<1+made;k++){const x=bots.filter(z=>z!==b)[(k+made)%6];placeBid(x,n,+(minBid(n)*(1+Math.random()*.1)).toFixed(3));}}
  for(let i=0;i<6;i++)botBidTick();
}
