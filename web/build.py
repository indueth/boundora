"""Assemble web/index.html from src/ parts, heroes.js, the game logic and hero3d.js."""
import pathlib, re
W = pathlib.Path(__file__).parent
game = (W / "src/game.js").read_text()
game = game[game.index("const CFG = {"):]

def cut(s, start, end):
    a = s.index(start); b = s.index(end, a)
    return s[:a] + s[b:]

# drop the old orbit-art engine (keep hash256/rng) and the old 2D arena/orb code
game = cut(game, "const PALETTES", "const S={")
game = cut(game, "/* Live spirit orb */", "/* Engine hooks */")

R = [
    ("var(--mist)", "var(--muted)"), ("var(--paper)", "var(--ink)"), ("var(--jade)", "var(--r-rare)"),
    ("<h3>Your belt</h3>", ""), ("<h3>Your round</h3>", ""), ("<h3>Mint a hero</h3>", ""), ("<h3>Your heroes</h3>", ""), ("<h3>Sell a hero</h3>", ""),
    ('let label,sub,cls="strike";', 'let label,sub,cls="btn xl stack strike";'), ('cls+=" gold"', 'cls+=" blue"'),
    ('<button class="strike gold" id="mintHeroBtn" style="font-size:1.3rem;padding:14px">', '<button class="btn xl stack strike" id="mintHeroBtn">'),
    ('<button class="strike gold" id="listBtn" style="font-size:1.2rem;padding:12px;margin-top:12px">', '<button class="btn stack strike" id="listBtn" style="margin-top:14px">'),
    ("btn btn-gold", "btn sm"), ("btn btn-line", "btn ice sm"),
    ('["#F4E9D0","#3FB68B","#A77BF0","#F2C14E","#B48CFF"]', '["#93A3B8","#22B07D","#8D5CF6","#FFAE1F","#67E3C4"]'),
    ('class="rtag ', 'class="tag '), ('class="eqtag"', 'class="tag eq"'),
    ('$("viewMarket").hidden', '$("pg-market").hidden'),
    ('if(!$("mkPeek").innerHTML)$("mkPeek").innerHTML=Heroes.heroSVG(Heroes.numberFor(4,7),{background:false});',
     'if(!$("mkPeek").innerHTML)$("mkPeek").innerHTML=`<img data-art="${Heroes.numberFor(4,7)}" alt="">`;'),
    ('<div class="mk-stat">', '<div class="panel mk-stat">'), ('<div class="floor">', '<div class="panel floor">'),
    ('<div class="rar ${RCLS[r]}">${Heroes.heroSVG(sellN)}</div>', '${art(sellN)}'),
    ('<div class="rar ${RCLS[Heroes.rarityIdx(x.n)]}" style="padding:2px;border-radius:7px">${Heroes.heroSVG(x.n,{background:false})}</div>', '${art(x.n)}'),
    ('<div class="chilab"><span>Chi</span><b>${mult?stake:0}× of ${mult}× unlocked</b></div>',
     '<div class="chilab"><span>Chi</span><b>${mult?stake:0}× of ${mult}× unlocked</b></div>${equippedN(ME)?`<div class="eqhero">${art(equippedN(ME))}<div><b style="font-family:var(--display);font-weight:400">Hero #${equippedN(ME)} equipped</b><small class="muted" style="display:block">${Heroes.POWERS[Heroes.rarityIdx(equippedN(ME))]}</small></div></div>`:""}'),
    ('["#F4E9D0","#B6A6C9"]', '["#2A5590","#FFFFFF"]'),
    ('const o=document.querySelector(".orb").getBoundingClientRect(),a=fx.getBoundingClientRect(),d=fx.width/a.width;', 'const a=fx.getBoundingClientRect(),d=fx.width/(a.width||1);if(!a.width)return;'),
    ('c.fillStyle="#F4F8FF"', 'c.fillStyle="#FFFFFF"'),
    ("if(S.now-slow>1){slow=S.now;", 'if(S.now-slow>1){slow=S.now;settleAuctions();renderAuctions();if(!$("pg-home").hidden)renderLive();'),
    ('renderMint();renderMyHeroes();renderVault();renderMarket();', 'renderMint();renderMyHeroes();renderVault();renderMarket();renderAuctions(true);'),
    ('for(let i=0;i<5;i++){const ls=[...S.listings];', 'seedAuctions();for(let i=0;i<5;i++){const ls=[...S.listings];'),
]
for a, b in R:
    if a not in game:
        if a.startswith("var(--") or a.startswith("c.fillStyle"):
            continue
        raise SystemExit("patch target missing: " + a[:80])
    game = game.replace(a, b)

over = (W / "src/overrides.js").read_text()
i = game.index("/* Boot: two rounds")
game = game[:i] + over + "\n" + game[i:]

heroes = (W / "heroes.js").read_text()
hero3d = (W / "hero3d.js").read_text()
css = (W / "src/style.css").read_text()
body = (W / "src/body.html").read_text()
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Boundora</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20x%3D%2212%22%20y%3D%2212%22%20width%3D%22216%22%20height%3D%22216%22%20rx%3D%2254%22%20fill%3D%22%232A5590%22%20stroke%3D%22%2313233F%22%20stroke-width%3D%2214%22/%3E%3Cpolygon%20points%3D%2240%2C226%2082%2C226%20228%2C76%20228%2C34%22%20fill%3D%22%23FF8A1F%22/%3E%3Cpath%20d%3D%22M78%2056h62c34%200%2052%2016%2052%2040%200%2014-8%2025-20%2030%2016%205%2026%2018%2026%2034%200%2028-22%2044-56%2044H78z%22%20fill%3D%22%23fff%22%20stroke%3D%22%2313233F%22%20stroke-width%3D%2214%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E">
<script type="importmap">{{"imports":{{
  "@near-wallet-selector/core":"https://esm.sh/@near-wallet-selector/core@8",
  "@near-wallet-selector/modal-ui":"https://esm.sh/@near-wallet-selector/modal-ui@8",
  "@near-wallet-selector/my-near-wallet":"https://esm.sh/@near-wallet-selector/my-near-wallet@8",
  "@near-wallet-selector/meteor-wallet":"https://esm.sh/@near-wallet-selector/meteor-wallet@8",
  "near-api-js":"https://esm.sh/near-api-js@4"}}}}</script>
<link rel="stylesheet" href="https://unpkg.com/@near-wallet-selector/modal-ui@8/styles.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Titan+One&family=Nunito:wght@600;700;800&display=swap" rel="stylesheet">
<style>
{css}
</style>
</head>
<body>
{body}
<script>
"use strict";
{heroes}
{game}
</script>
<script type="module">
{hero3d}
</script>
<script type="module" src="near/live.js"></script>
</body>
</html>
"""
(W / "index.html").write_text(html)
print("built", len(html) // 1024, "KB")
