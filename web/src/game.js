
"use strict";
/* Boundora Heroes: generator for the 10,000-hero collection (renderer "boundora-heroes-v1").
   Hero number N (1..10000) always produces the same hero. Rarity follows the contract's
   schedule exactly: p = (7919·(N-1) + 3571) mod 10000, banded into Common..Mythic.
   Works in the browser (window.Heroes) and in Node (module.exports). */
(function (root) {
  "use strict";
  const SUPPLY = 10000, A = 7919, B = 3571;
  const RARITIES = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
  const BANDS = [[5000, 10000], [2200, 5000], [700, 2200], [100, 700], [0, 100]];
  const POWERS = [
    "Flare: your strikes add 1s more",
    "Long watch: your strikes add 3s more",
    "Shatter: your strikes cost 10% less",
    "Forgefire: +1 chi, stake one more multiple",
    "Aurora: +1 chi, strikes cost 15% less and add 3s more"
  ];
  // [extra seconds, discount 0..1, extra chi]
  const POWER_FX = [[1, 0, 0], [3, 0, 0], [0, 0.10, 0], [0, 0, 1], [3, 0.15, 1]];

  function rarityIdx(N) {
    const p = (A * (N - 1) + B) % SUPPLY;
    for (let i = 0; i < 5; i++) if (p >= BANDS[i][0] && p < BANDS[i][1]) return i;
  }
  function numberFor(r, k) { // k-th hero number of rarity r, same order as the contract
    const p = BANDS[r][0] + k;
    return ((7679 * ((p + SUPPLY - B) % SUPPLY)) % SUPPLY) + 1;
  }

  // deterministic PRNG per hero
  function mix(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; };
  }
  function prng(N, salt) {
    const s = mix("boundora-hero-" + N + "-" + salt);
    let a = s(), b = s(), c = s(), d = s();
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11); d = d + 1 | 0; t = t + d | 0; c = c + t | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function weighted(r, items) { // [[value, weight], ...]
    const tot = items.reduce((s, x) => s + x[1], 0); let x = r() * tot;
    for (const [v, w] of items) { if ((x -= w) < 0) return v; }
    return items[items.length - 1][0];
  }

  /* ---------------- trait tables ---------------- */
  const BUILDS = {
    Scout:  { w: 74,  h: 70,  head: 50, leg: 44, arm: 17, hand: 15, bulk: 0.9 },
    Ranger: { w: 78,  h: 92,  head: 42, leg: 58, arm: 17, hand: 15, bulk: 1 },
    Brute:  { w: 128, h: 104, head: 38, leg: 46, arm: 33, hand: 28, bulk: 1.3 },
    Smith:  { w: 106, h: 86,  head: 44, leg: 42, arm: 27, hand: 23, bulk: 1.15 },
    Seer:   { w: 84,  h: 112, head: 42, leg: 0,  arm: 18, hand: 15, bulk: 1 }
  };
  const SKIN = ["#F4D3B8", "#EBC1A0", "#D9A27A", "#C08257", "#9A6440", "#74462A", "#563220"];
  const HAIR = [["Jet", "#2A2224"], ["Chestnut", "#5C3A24"], ["Auburn", "#8E4527"], ["Flax", "#C9A45E"], ["Snow", "#ECE8E2"], ["Ash", "#9A9590"]];
  const COATS = [["Navy", "#2F4170"], ["Plum", "#56346A"], ["Crimson", "#8F2D2D"], ["Pine", "#2E5E48"], ["Slate", "#4C5868"],
                 ["Umber", "#6E4C33"], ["Teal", "#1F6470"], ["Mustard", "#A07F2C"], ["Charcoal", "#33333D"], ["Glacier", "#4F82AD"]];
  const FURS = [["Snow fur", "#F3F0EA"], ["Grey fur", "#BDB9B2"], ["Tawny fur", "#CDA67C"], ["Sable fur", "#4A3F3A"]];
  const HEADGEAR = ["Fur hood", "Ushanka", "Knit beanie", "Horned helm", "Goggles", "Bare head", "Ice crown", "Aurora halo"];
  const FACIAL = ["None", "Stubble", "Full beard", "Braided beard", "Mustache"];
  const MOODS = ["Determined", "Grumpy", "Calm", "Fierce"];
  const WEAPONS = ["Ice axe", "War hammer", "Crossbow", "Harpoon", "Torch", "Frost blade", "Snow shovel", "Rune staff"];
  const PETS = ["None", "Snow owl", "Husky pup", "Penguin", "Fox kit", "Yeti cub"];
  const SCENES = ["Blizzard", "Glacier", "Pine ridge", "Ember camp", "Aurora night", "Starfall"];
  const FIRST = ["Brann", "Ilka", "Torv", "Mira", "Osk", "Yuna", "Dag", "Senna", "Kael", "Runa", "Bo", "Tilde", "Aksel", "Nyra", "Hux",
                 "Saga", "Eir", "Vali", "Kalle", "Odda", "Pell", "Juno", "Rask", "Wren", "Ansa", "Gorm", "Liv", "Tarek", "Ama", "Kofi",
                 "Zuri", "Emeka", "Ines", "Oleg", "Sanna", "Halvar", "Kira", "Mosi", "Ulla", "Bjorn"];
  const PRE = ["Frost", "Snow", "Ice", "Rime", "Storm", "Pine", "Ember", "Hollow", "North", "Gale", "Sleet", "Drift"];
  const SUF = ["mane", "beard", "heart", "fang", "step", "born", "ward", "hand", "brow", "song", "tooth", "watch"];
  const MATERIAL = [
    { name: "Iron & oak", metal: "#8C96A3", metalD: "#5B6370", wood: "#7A5638", accent: "#C9CED6" },
    { name: "Bluesteel", metal: "#A9C2DB", metalD: "#5E7FA3", wood: "#5B4434", accent: "#6FC3FF" },
    { name: "Voidcrystal", metal: "#B79BF5", metalD: "#6A49B8", wood: "#3E2B52", accent: "#D7C4FF" },
    { name: "Sunforged gold", metal: "#F6CF63", metalD: "#B5841F", wood: "#5E3A1E", accent: "#FFF0B3" },
    { name: "Aurora glass", metal: "#8DF0D2", metalD: "#3E8FB8", wood: "#2B2048", accent: "#F3A6FF" }
  ];

  function traits(N) {
    const r = prng(N, "traits"), ri = rarityIdx(N);
    const build = weighted(r, [["Scout", 22], ["Ranger", 24], ["Brute", 18], ["Smith", 20], ["Seer", 16]]);
    const headOpts = [["Fur hood", 26], ["Ushanka", 20], ["Knit beanie", 18], ["Horned helm", 12], ["Goggles", 12], ["Bare head", 12]];
    if (ri >= 3) headOpts.push(["Ice crown", 22]);
    if (ri === 4) headOpts.push(["Aurora halo", 40]);
    const petOpts = [["None", 60 - ri * 10], ["Snow owl", 8 + ri * 2], ["Husky pup", 8 + ri * 2], ["Penguin", 8 + ri * 2], ["Fox kit", 6 + ri * 2], ["Yeti cub", 2 + ri * 3]];
    const sceneOpts = [["Blizzard", 30], ["Glacier", 24], ["Pine ridge", 24], ["Ember camp", 18]];
    if (ri >= 2) sceneOpts.push(["Aurora night", 20 + ri * 6]);
    if (ri === 4) sceneOpts.push(["Starfall", 60]);
    const weaponOpts = WEAPONS.filter(w => w !== "Rune staff" || build === "Seer" || ri >= 2).map(w => [w, (build === "Seer" && w === "Rune staff") ? 40 : (build === "Brute" && w === "War hammer") ? 20 : 10]);
    const t = {
      number: N,
      rarity: RARITIES[ri], rarityIdx: ri, power: POWERS[ri],
      build,
      skin: Math.floor(r() * SKIN.length),
      hair: Math.floor(r() * HAIR.length),
      coat: Math.floor(r() * COATS.length),
      fur: Math.floor(r() * FURS.length),
      headgear: weighted(r, headOpts),
      facial: build === "Scout" ? weighted(r, [["None", 70], ["Stubble", 30]]) : weighted(r, [["None", 30], ["Stubble", 18], ["Full beard", 22], ["Braided beard", 16], ["Mustache", 14]]),
      mood: pick(r, MOODS),
      weapon: weighted(r, weaponOpts),
      pet: weighted(r, petOpts),
      scene: weighted(r, sceneOpts),
      material: MATERIAL[ri].name,
      name: pick(r, FIRST) + " " + pick(r, PRE) + pick(r, SUF),
      might: Math.round((1 + ri * 0.55) * (12000 + r() * 6000) * BUILDS[build].bulk / 10) * 10
    };
    return t;
  }

  /* ---------------- drawing helpers ---------------- */
  const shade = (hex, f) => { // f<0 darker, f>0 lighter
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  let uidCounter = 0;

  function scene(t, id) {
    const r = prng(t.number, "scene");
    let g = "", sky;
    switch (t.scene) {
      case "Blizzard": sky = ["#9CC6EA", "#4F7FB5"];
        g += `<path d="M0 330 Q80 290 160 320 T320 300 T400 320 V500 H0Z" fill="#DDEBF7" opacity=".7"/>`;
        for (let i = 0; i < 26; i++) { const x = r() * 420, y = r() * 360; g += `<line x1="${x}" y1="${y}" x2="${x - 22}" y2="${y + 10}" stroke="#fff" stroke-width="${1 + r() * 2}" opacity="${.3 + r() * .5}" stroke-linecap="round"/>`; }
        break;
      case "Glacier": sky = ["#BFE3F5", "#6AA7CF"];
        g += `<path d="M0 260 L60 190 L110 240 L170 150 L230 230 L290 170 L350 240 L400 200 V500 H0Z" fill="#E6F6FD"/><path d="M60 190 L80 260 L110 240 M170 150 L190 250 L230 230 M290 170 L300 250" stroke="#9BD2EC" stroke-width="3" fill="none"/>`;
        g += `<path d="M0 300 L50 260 L120 300 L200 250 L280 300 L360 265 L400 290 V500 H0Z" fill="#CBEAF7"/>`;
        break;
      case "Pine ridge": sky = ["#A9C9E3", "#5B86AE"];
        g += `<path d="M0 280 Q100 220 200 260 T400 240 V500 H0Z" fill="#7F9FBC"/>`;
        for (let i = 0; i < 11; i++) { const x = i * 40 + r() * 20 - 10, h = 70 + r() * 60, y = 300; g += `<path d="M${x} ${y - h} L${x - 22} ${y} H${x + 22}Z" fill="#2F4A5C"/><path d="M${x} ${y - h} L${x - 10} ${y - h + 26} H${x + 10}Z" fill="#F4F8FB"/>`; }
        break;
      case "Ember camp": sky = ["#E9A27A", "#5B3A5C"];
        g += `<circle cx="200" cy="330" r="190" fill="#FFB36B" opacity=".25"/><path d="M0 300 Q120 260 220 290 T400 280 V500 H0Z" fill="#6A4A5E"/>`;
        g += `<path d="M300 300 L345 230 L390 300Z" fill="#7A3E2B"/><path d="M345 230 L345 300" stroke="#3B1E14" stroke-width="3"/>`;
        break;
      case "Aurora night": sky = ["#1D2C55", "#0B1430"];
        g += `<path d="M-20 120 Q100 40 200 110 T420 80" stroke="#6EF0B5" stroke-width="34" fill="none" opacity=".35" stroke-linecap="round"/><path d="M-20 160 Q120 90 230 150 T420 120" stroke="#9C7BF0" stroke-width="26" fill="none" opacity=".3" stroke-linecap="round"/>`;
        for (let i = 0; i < 40; i++) g += `<circle cx="${r() * 400}" cy="${r() * 260}" r="${r() * 1.6 + .3}" fill="#fff" opacity="${r() * .8 + .2}"/>`;
        g += `<path d="M0 300 Q110 250 220 290 T400 270 V500 H0Z" fill="#2A3B66"/>`;
        break;
      case "Starfall": sky = ["#2A1650", "#0A0620"];
        for (let i = 0; i < 70; i++) g += `<circle cx="${r() * 400}" cy="${r() * 320}" r="${r() * 1.8 + .3}" fill="#fff" opacity="${r() * .9 + .1}"/>`;
        for (let i = 0; i < 4; i++) { const x = 40 + r() * 320, y = 20 + r() * 150; g += `<line x1="${x}" y1="${y}" x2="${x - 50}" y2="${y + 30}" stroke="url(#${id}au)" stroke-width="2.5" stroke-linecap="round"/>`; }
        g += `<path d="M-20 140 Q100 60 210 130 T420 100" stroke="url(#${id}au)" stroke-width="40" fill="none" opacity=".45" stroke-linecap="round"/>`;
        g += `<path d="M0 300 Q110 255 220 290 T400 270 V500 H0Z" fill="#2B1F55"/>`;
        break;
    }
    return { sky, g };
  }

  function aura(t, cx, cy, id) {
    switch (t.rarityIdx) {
      case 1: return `<circle cx="${cx}" cy="${cy}" r="150" fill="url(#${id}glow)" opacity=".55"/>`;
      case 2: return `<circle cx="${cx}" cy="${cy}" r="165" fill="url(#${id}glow)" opacity=".75"/>`;
      case 3: {
        let rays = ""; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; rays += `<path d="M${cx} ${cy} L${cx + Math.cos(a - .09) * 260} ${cy + Math.sin(a - .09) * 260} L${cx + Math.cos(a + .09) * 260} ${cy + Math.sin(a + .09) * 260}Z" fill="#FFE8A0" opacity=".18"/>`; }
        return rays + `<circle cx="${cx}" cy="${cy}" r="170" fill="url(#${id}glow)" opacity=".9"/>`;
      }
      case 4: return `<circle cx="${cx}" cy="${cy}" r="190" fill="url(#${id}glow)"/><ellipse cx="${cx}" cy="${cy}" rx="175" ry="60" fill="none" stroke="url(#${id}au)" stroke-width="5" opacity=".7" transform="rotate(-18 ${cx} ${cy})"/>`;
      default: return "";
    }
  }

  function weaponSVG(t, x, y, M, id) {
    const s = 1;
    switch (t.weapon) {
      case "Ice axe": return `<g transform="translate(${x} ${y}) rotate(-20)"><rect x="-5" y="-120" width="10" height="150" rx="4" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <path d="M-6 -122 Q-46 -120 -58 -96 L-50 -94 Q-36 -108 -6 -104Z M6 -122 L34 -118 L34 -104 L6 -106Z" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/></g>`;
      case "War hammer": return `<g transform="translate(${x} ${y}) rotate(-14)"><rect x="-6" y="-130" width="12" height="165" rx="4" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <rect x="-36" y="-162" width="72" height="44" rx="8" fill="${M.metal}" stroke="#1A1216" stroke-width="3.5"/><rect x="-36" y="-150" width="72" height="8" fill="${M.metalD}"/><circle cx="0" cy="-140" r="7" fill="${M.accent}"/></g>`;
      case "Crossbow": return `<g transform="translate(${x} ${y}) rotate(-8)"><rect x="-70" y="-8" width="90" height="14" rx="5" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <path d="M-64 -40 Q-50 0 -64 40" stroke="${M.metal}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M-64 -40 L-40 0 L-64 40" stroke="#E8E2D6" stroke-width="2" fill="none"/>
        <path d="M-76 -1 h-16 l6 -5 m-6 5 l6 5" stroke="${M.accent}" stroke-width="3" fill="none"/></g>`;
      case "Harpoon": return `<g transform="translate(${x} ${y}) rotate(-24)"><rect x="-4" y="-170" width="8" height="205" rx="3" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <path d="M0 -205 L-12 -168 L-4 -172 L-14 -150 L0 -160 L14 -150 L4 -172 L12 -168Z" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/>
        <path d="M4 -40 q30 10 18 40 q-10 20 10 34" stroke="#C9B38F" stroke-width="3" fill="none"/></g>`;
      case "Torch": return `<g transform="translate(${x} ${y}) rotate(-10)"><rect x="-6" y="-80" width="12" height="100" rx="4" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <rect x="-10" y="-88" width="20" height="14" rx="3" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/>
        <circle cx="0" cy="-110" r="40" fill="#FFB347" opacity=".25"/><path d="M0 -140 Q22 -110 10 -92 Q0 -84 -10 -92 Q-22 -110 0 -140Z" fill="#FF8A2B" stroke="#B4471A" stroke-width="2.5"/><path d="M0 -122 Q10 -106 4 -96 Q0 -92 -4 -96 Q-10 -106 0 -122Z" fill="#FFE27A"/></g>`;
      case "Frost blade": return `<g transform="translate(${x} ${y}) rotate(-28)"><rect x="-5" y="-14" width="10" height="34" rx="3" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <rect x="-22" y="-22" width="44" height="10" rx="4" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/>
        <path d="M-9 -22 L-7 -128 L0 -150 L7 -128 L9 -22Z" fill="url(#${id}blade)" stroke="#1A1216" stroke-width="3"/><path d="M0 -140 L0 -30" stroke="#fff" stroke-width="2" opacity=".7"/></g>`;
      case "Snow shovel": return `<g transform="translate(${x} ${y}) rotate(-16)"><rect x="-5" y="-110" width="10" height="150" rx="4" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <rect x="-14" y="-122" width="28" height="12" rx="5" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/><path d="M-26 38 H26 L22 82 Q0 92 -22 82Z" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/></g>`;
      case "Rune staff": return `<g transform="translate(${x} ${y}) rotate(-8)"><rect x="-5" y="-170" width="10" height="210" rx="4" fill="${M.wood}" stroke="#1A1216" stroke-width="3"/>
        <path d="M0 -168 Q-24 -180 -18 -205 M0 -168 Q24 -180 18 -205" stroke="${M.wood}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <circle cx="0" cy="-196" r="32" fill="${M.accent}" opacity=".3"/><path d="M0 -216 L13 -196 L0 -176 L-13 -196Z" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/></g>`;
    }
    return "";
  }

  function petSVG(t, x, y) {
    switch (t.pet) {
      case "Snow owl": return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-30" rx="26" ry="32" fill="#F6F4F0" stroke="#1A1216" stroke-width="3"/>
        <path d="M-22 -40 L-20 -64 L-8 -54 M22 -40 L20 -64 L8 -54" fill="#F6F4F0" stroke="#1A1216" stroke-width="3"/><circle cx="-10" cy="-38" r="8" fill="#FFD23F" stroke="#1A1216" stroke-width="2"/><circle cx="10" cy="-38" r="8" fill="#FFD23F" stroke="#1A1216" stroke-width="2"/>
        <circle cx="-10" cy="-38" r="3.5" fill="#1A1216"/><circle cx="10" cy="-38" r="3.5" fill="#1A1216"/><path d="M-4 -30 L0 -22 L4 -30Z" fill="#3A2B22"/><path d="M-12 -14 l4 4 4 -4 4 4 4 -4" stroke="#9AA3AD" stroke-width="2" fill="none"/></g>`;
      case "Husky pup": return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-20" rx="30" ry="20" fill="#8A93A0" stroke="#1A1216" stroke-width="3"/><path d="M26 -26 q18 -14 10 -30" stroke="#8A93A0" stroke-width="9" fill="none" stroke-linecap="round"/>
        <circle cx="-22" cy="-46" r="22" fill="#8A93A0" stroke="#1A1216" stroke-width="3"/><path d="M-40 -60 L-36 -82 L-24 -64 M-4 -60 L-8 -82 L-20 -64" fill="#8A93A0" stroke="#1A1216" stroke-width="3"/>
        <ellipse cx="-22" cy="-40" rx="15" ry="13" fill="#F4F2EE"/><circle cx="-29" cy="-50" r="3.5" fill="#3A6FD8"/><circle cx="-15" cy="-50" r="3.5" fill="#3A6FD8"/><ellipse cx="-22" cy="-38" rx="5" ry="3.5" fill="#1A1216"/></g>`;
      case "Penguin": return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-34" rx="24" ry="34" fill="#23252E" stroke="#1A1216" stroke-width="3"/><ellipse cx="0" cy="-26" rx="15" ry="24" fill="#F6F4F0"/>
        <circle cx="-7" cy="-50" r="3.5" fill="#fff"/><circle cx="7" cy="-50" r="3.5" fill="#fff"/><circle cx="-7" cy="-50" r="1.8" fill="#1A1216"/><circle cx="7" cy="-50" r="1.8" fill="#1A1216"/>
        <path d="M-6 -44 L0 -36 L6 -44Z" fill="#F29A2E"/><path d="M-14 0 h10 M4 0 h10" stroke="#F29A2E" stroke-width="5" stroke-linecap="round"/><path d="M-12 -18 Q-6 -8 0 -16" stroke="#F6C9A0" stroke-width="0" fill="none"/></g>`;
      case "Fox kit": return `<g transform="translate(${x} ${y})"><path d="M20 -16 Q56 -20 48 -52 Q40 -30 18 -30Z" fill="#E8743B" stroke="#1A1216" stroke-width="3"/><path d="M48 -52 Q46 -40 38 -36 Q44 -46 48 -52Z" fill="#fff"/>
        <ellipse cx="0" cy="-18" rx="24" ry="17" fill="#E8743B" stroke="#1A1216" stroke-width="3"/><path d="M-22 -40 L-34 -60 L-30 -32Z M-2 -40 L4 -60 L-8 -34Z" fill="#E8743B" stroke="#1A1216" stroke-width="3"/>
        <path d="M-12 -24 L-38 -40 L-30 -50 L-4 -50Z" fill="#E8743B" stroke="#1A1216" stroke-width="3"/><path d="M-36 -42 L-20 -36 L-14 -46Z" fill="#fff"/><circle cx="-22" cy="-46" r="3" fill="#1A1216"/><circle cx="-38" cy="-41" r="2.5" fill="#1A1216"/></g>`;
      case "Yeti cub": return `<g transform="translate(${x} ${y})"><path d="M-30 0 Q-36 -50 -18 -70 Q0 -84 18 -70 Q36 -50 30 0Z" fill="#F2F4F8" stroke="#1A1216" stroke-width="3"/>
        <path d="M-26 -60 l-6 -6 M26 -60 l6 -6 M-30 -30 l-8 2 M30 -30 l8 2" stroke="#1A1216" stroke-width="3"/><ellipse cx="0" cy="-48" rx="16" ry="13" fill="#8FB8E8" stroke="#1A1216" stroke-width="2.5"/>
        <circle cx="-6" cy="-51" r="2.6" fill="#1A1216"/><circle cx="6" cy="-51" r="2.6" fill="#1A1216"/><path d="M-5 -42 q5 4 10 0" stroke="#1A1216" stroke-width="2" fill="none"/></g>`;
    }
    return "";
  }

  function headgearBack(t, hx, hy, R, coat, fur, M) {
    if (t.headgear === "Fur hood" || t.headgear === "Aurora halo")
      return `<ellipse cx="${hx}" cy="${hy - 2}" rx="${R * 1.32}" ry="${R * 1.36}" fill="${shade(coat, -.15)}" stroke="#1A1216" stroke-width="3.5"/>`;
    if (t.headgear === "Ushanka")
      return `<rect x="${hx - R * 1.12}" y="${hy - R * .25}" width="${R * .48}" height="${R * 1.05}" rx="${R * .2}" fill="${fur}" stroke="#1A1216" stroke-width="3"/><rect x="${hx + R * .64}" y="${hy - R * .25}" width="${R * .48}" height="${R * 1.05}" rx="${R * .2}" fill="${fur}" stroke="#1A1216" stroke-width="3"/>`;
    return "";
  }
  function headgearFront(t, hx, hy, R, coat, fur, hair, M, id) {
    const top = hy - R;
    switch (t.headgear) {
      case "Fur hood": case "Aurora halo": {
        let s = `<ellipse cx="${hx}" cy="${hy}" rx="${R * 1.12}" ry="${R * 1.16}" fill="none" stroke="${fur}" stroke-width="${R * .32}"/>
        <ellipse cx="${hx}" cy="${hy}" rx="${R * 1.28}" ry="${R * 1.32}" fill="none" stroke="#1A1216" stroke-width="3"/>`;
        if (t.headgear === "Aurora halo") s += `<ellipse cx="${hx}" cy="${top - R * .55}" rx="${R * .9}" ry="${R * .22}" fill="none" stroke="url(#${id}au)" stroke-width="7"/><ellipse cx="${hx}" cy="${top - R * .55}" rx="${R * .9}" ry="${R * .22}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".8"/>`;
        return s;
      }
      case "Ushanka": return `<path d="M${hx - R * 1.02} ${hy - R * .5} Q${hx - R} ${top - R * .55} ${hx} ${top - R * .6} Q${hx + R} ${top - R * .55} ${hx + R * 1.02} ${hy - R * .5}Z" fill="${shade(coat, -.25)}" stroke="#1A1216" stroke-width="3.5"/>
        <rect x="${hx - R * 1.06}" y="${hy - R * .86}" width="${R * 2.12}" height="${R * .42}" rx="${R * .2}" fill="${fur}" stroke="#1A1216" stroke-width="3.5"/>
        <circle cx="${hx}" cy="${hy - R * .65}" r="${R * .13}" fill="${M.metal}" stroke="#1A1216" stroke-width="2"/>`;
      case "Knit beanie": return `<path d="M${hx - R * .98} ${hy - R * .45} Q${hx - R * .9} ${top - R * .45} ${hx} ${top - R * .5} Q${hx + R * .9} ${top - R * .45} ${hx + R * .98} ${hy - R * .45}Z" fill="${shade(coat, .25)}" stroke="#1A1216" stroke-width="3.5"/>
        <rect x="${hx - R}" y="${hy - R * .72}" width="${R * 2}" height="${R * .32}" rx="${R * .12}" fill="${shade(coat, .05)}" stroke="#1A1216" stroke-width="3"/>
        <circle cx="${hx}" cy="${top - R * .55}" r="${R * .26}" fill="${fur}" stroke="#1A1216" stroke-width="3"/>`;
      case "Horned helm": return `<path d="M${hx - R * .9} ${hy - R * .5} Q${hx - R * 1.7} ${top - R * .2} ${hx - R * 1.45} ${top - R * .95} Q${hx - R * 1.15} ${top - R * .2} ${hx - R * .55} ${hy - R * .85}Z" fill="#EDE3CC" stroke="#1A1216" stroke-width="3"/>
        <path d="M${hx + R * .9} ${hy - R * .5} Q${hx + R * 1.7} ${top - R * .2} ${hx + R * 1.45} ${top - R * .95} Q${hx + R * 1.15} ${top - R * .2} ${hx + R * .55} ${hy - R * .85}Z" fill="#EDE3CC" stroke="#1A1216" stroke-width="3"/>
        <path d="M${hx - R * 1.02} ${hy - R * .48} Q${hx - R} ${top - R * .35} ${hx} ${top - R * .38} Q${hx + R} ${top - R * .35} ${hx + R * 1.02} ${hy - R * .48}Z" fill="${M.metal}" stroke="#1A1216" stroke-width="3.5"/>
        <rect x="${hx - R * 1.04}" y="${hy - R * .66}" width="${R * 2.08}" height="${R * .2}" fill="${M.metalD}" stroke="#1A1216" stroke-width="2.5"/><rect x="${hx - R * .08}" y="${hy - R * .66}" width="${R * .16}" height="${R * .62}" fill="${M.metalD}" stroke="#1A1216" stroke-width="2.5"/>`;
      case "Goggles": return `<path d="M${hx - R * .98} ${hy - R * .3} Q${hx - R} ${top - R * .2} ${hx} ${top - R * .25} Q${hx + R} ${top - R * .2} ${hx + R * .98} ${hy - R * .3}Z" fill="${shade(coat, .1)}" stroke="#1A1216" stroke-width="3.5"/>
        <path d="M${hx + R * .9} ${hy - R * .55} l${R * .55} ${R * .1} l-${R * .2} ${R * .3}Z" fill="${shade(coat, .1)}" stroke="#1A1216" stroke-width="3"/>
        <rect x="${hx - R}" y="${hy - R * .72}" width="${R * 2}" height="${R * .14}" fill="#3A2B22"/>
        <circle cx="${hx - R * .4}" cy="${hy - R * .65}" r="${R * .26}" fill="${M.accent}" stroke="#1A1216" stroke-width="3.5"/><circle cx="${hx + R * .4}" cy="${hy - R * .65}" r="${R * .26}" fill="${M.accent}" stroke="#1A1216" stroke-width="3.5"/>
        <circle cx="${hx - R * .48}" cy="${hy - R * .72}" r="${R * .07}" fill="#fff"/><circle cx="${hx + R * .32}" cy="${hy - R * .72}" r="${R * .07}" fill="#fff"/>`;
      case "Bare head": return `<path d="M${hx - R * .95} ${hy - R * .2} Q${hx - R} ${top - R * .2} ${hx} ${top - R * .2} Q${hx + R} ${top - R * .2} ${hx + R * .95} ${hy - R * .2} Q${hx + R * .6} ${hy - R * .75} ${hx} ${hy - R * .7} Q${hx - R * .6} ${hy - R * .75} ${hx - R * .95} ${hy - R * .2}Z" fill="${hair}" stroke="#1A1216" stroke-width="3.5"/>
        <circle cx="${hx}" cy="${top - R * .35}" r="${R * .32}" fill="${hair}" stroke="#1A1216" stroke-width="3"/><rect x="${hx - R * .3}" y="${top - R * .12}" width="${R * .6}" height="${R * .14}" rx="4" fill="${M.metal}" stroke="#1A1216" stroke-width="2"/>`;
      case "Ice crown": {
        let s = `<path d="M${hx - R * .95} ${hy - R * .2} Q${hx - R} ${top - R * .15} ${hx} ${top - R * .15} Q${hx + R} ${top - R * .15} ${hx + R * .95} ${hy - R * .2} Q${hx + R * .6} ${hy - R * .75} ${hx} ${hy - R * .7} Q${hx - R * .6} ${hy - R * .75} ${hx - R * .95} ${hy - R * .2}Z" fill="${hair}" stroke="#1A1216" stroke-width="3.5"/>`;
        const sp = [[-.7, .55], [-.35, .8], [0, 1.05], [.35, .8], [.7, .55]];
        sp.forEach(([dx, h]) => { s += `<path d="M${hx + dx * R - R * .15} ${top + R * .02} L${hx + dx * R} ${top - h * R} L${hx + dx * R + R * .15} ${top + R * .02}Z" fill="url(#${id}blade)" stroke="#1A1216" stroke-width="2.5"/>`; });
        return s + `<rect x="${hx - R * .85}" y="${top - R * .02}" width="${R * 1.7}" height="${R * .2}" rx="5" fill="${M.metal}" stroke="#1A1216" stroke-width="2.5"/>`;
      }
    }
    return "";
  }

  function face(t, hx, hy, R, skin, hair) {
    const eyeY = hy - R * .12, ex = R * .36, er = R * .16;
    const brow = { Determined: [8, -8], Grumpy: [14, -14], Calm: [-2, 2], Fierce: [18, -18] }[t.mood];
    let s = `<ellipse cx="${hx - R * .95}" cy="${hy + R * .05}" rx="${R * .16}" ry="${R * .22}" fill="${shade(skin, -.08)}" stroke="#1A1216" stroke-width="3"/>
      <ellipse cx="${hx + R * .95}" cy="${hy + R * .05}" rx="${R * .16}" ry="${R * .22}" fill="${shade(skin, -.08)}" stroke="#1A1216" stroke-width="3"/>
      <ellipse cx="${hx}" cy="${hy}" rx="${R * .96}" ry="${R}" fill="url(#__SKIN__)" stroke="#1A1216" stroke-width="3.5"/>
      <ellipse cx="${hx - R * .55}" cy="${hy + R * .28}" rx="${R * .2}" ry="${R * .12}" fill="#F08C7A" opacity=".45"/><ellipse cx="${hx + R * .55}" cy="${hy + R * .28}" rx="${R * .2}" ry="${R * .12}" fill="#F08C7A" opacity=".45"/>`;
    // eyes
    for (const side of [-1, 1]) {
      const x = hx + side * ex;
      s += `<ellipse cx="${x}" cy="${eyeY}" rx="${er}" ry="${er * (t.mood === "Calm" ? .55 : .9)}" fill="#fff" stroke="#1A1216" stroke-width="2.5"/>
        <circle cx="${x + side * -1}" cy="${eyeY + 1}" r="${er * .55}" fill="#2A1F2B"/><circle cx="${x + side * -1 - er * .2}" cy="${eyeY - er * .2}" r="${er * .18}" fill="#fff"/>
        <path d="M${x - er * 1.3} ${eyeY - er * 1.5 + (side < 0 ? -brow[0] : brow[1]) * R / 140} L${x + er * 1.3} ${eyeY - er * 1.5 + (side < 0 ? brow[0] : -brow[1]) * R / 140}" stroke="${shade(hair, -.2)}" stroke-width="${R * .13}" stroke-linecap="round"/>`;
    }
    if (t.mood === "Fierce") s += `<path d="M${hx + ex - er} ${eyeY - er * 2} l${er * 1.6} ${er * 3.4}" stroke="#B5523F" stroke-width="2.5" opacity=".8"/>`;
    // nose
    s += `<ellipse cx="${hx}" cy="${hy + R * .2}" rx="${R * .2}" ry="${R * .17}" fill="${shade(skin, -.12)}" stroke="#1A1216" stroke-width="3"/><ellipse cx="${hx - R * .06}" cy="${hy + R * .15}" rx="${R * .06}" ry="${R * .04}" fill="#fff" opacity=".6"/>`;
    // mouth / beard
    const mouth = `<path d="M${hx - R * .2} ${hy + R * .52} Q${hx} ${hy + R * (t.mood === "Grumpy" ? .44 : .6)} ${hx + R * .2} ${hy + R * .52}" stroke="#4A2620" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    switch (t.facial) {
      case "None": s += mouth; break;
      case "Stubble": s += `<path d="M${hx - R * .82} ${hy + R * .25} Q${hx - R * .7} ${hy + R * .95} ${hx} ${hy + R} Q${hx + R * .7} ${hy + R * .95} ${hx + R * .82} ${hy + R * .25} Q${hx} ${hy + R * .62} ${hx - R * .82} ${hy + R * .25}Z" fill="${hair}" opacity=".35"/>` + mouth; break;
      case "Mustache": s += mouth + `<path d="M${hx} ${hy + R * .38} Q${hx - R * .45} ${hy + R * .3} ${hx - R * .62} ${hy + R * .55} Q${hx - R * .3} ${hy + R * .5} ${hx} ${hy + R * .44} Q${hx + R * .3} ${hy + R * .5} ${hx + R * .62} ${hy + R * .55} Q${hx + R * .45} ${hy + R * .3} ${hx} ${hy + R * .38}Z" fill="${hair}" stroke="#1A1216" stroke-width="2.5"/>`; break;
      case "Full beard": s += `<path d="M${hx - R * .9} ${hy + R * .1} Q${hx - R * .95} ${hy + R * 1.35} ${hx} ${hy + R * 1.55} Q${hx + R * .95} ${hy + R * 1.35} ${hx + R * .9} ${hy + R * .1} Q${hx + R * .5} ${hy + R * .55} ${hx} ${hy + R * .42} Q${hx - R * .5} ${hy + R * .55} ${hx - R * .9} ${hy + R * .1}Z" fill="${hair}" stroke="#1A1216" stroke-width="3"/>
        <path d="M${hx - R * .3} ${hy + R * .62} Q${hx} ${hy + R * .72} ${hx + R * .3} ${hy + R * .62}" stroke="#4A2620" stroke-width="3" fill="none"/>
        <path d="M${hx - R * .35} ${hy + R * .9} q${R * .1} ${R * .3} 0 ${R * .45} M${hx + R * .35} ${hy + R * .9} q-${R * .1} ${R * .3} 0 ${R * .45}" stroke="${shade(hair, -.3)}" stroke-width="2" fill="none"/>`; break;
      case "Braided beard": s += `<path d="M${hx - R * .9} ${hy + R * .1} Q${hx - R * .8} ${hy + R * 1.0} ${hx} ${hy + R * 1.05} Q${hx + R * .8} ${hy + R * 1.0} ${hx + R * .9} ${hy + R * .1} Q${hx + R * .5} ${hy + R * .55} ${hx} ${hy + R * .42} Q${hx - R * .5} ${hy + R * .55} ${hx - R * .9} ${hy + R * .1}Z" fill="${hair}" stroke="#1A1216" stroke-width="3"/>
        ${[0, 1, 2].map(i => `<ellipse cx="${hx}" cy="${hy + R * (1.12 + i * .22)}" rx="${R * .14}" ry="${R * .12}" fill="${hair}" stroke="#1A1216" stroke-width="2.5"/>`).join("")}
        <rect x="${hx - R * .1}" y="${hy + R * 1.68}" width="${R * .2}" height="${R * .1}" fill="#C9A24E" stroke="#1A1216" stroke-width="2"/>
        <path d="M${hx - R * .3} ${hy + R * .62} Q${hx} ${hy + R * .72} ${hx + R * .3} ${hy + R * .62}" stroke="#4A2620" stroke-width="3" fill="none"/>`; break;
    }
    return s;
  }

  /* ---------------- main render ---------------- */
  function heroSVG(N, opts) {
    opts = opts || {};
    const bg = opts.background !== false;
    const t = traits(N), B = BUILDS[t.build], M = MATERIAL[t.rarityIdx];
    const id = "h" + N + "_" + (uidCounter++);
    const skin = SKIN[t.skin], hair = HAIR[t.hair][1], coat = COATS[t.coat][1], fur = FURS[t.fur][1];
    const cx = 196, ground = 452;
    const boot = 24, leg = B.leg, legTop = ground - boot - leg;
    const torsoBot = t.build === "Seer" ? ground - 6 : legTop + 22;
    const torsoTop = (t.build === "Seer" ? legTop - 20 : legTop) - B.h;
    const w = B.w, R = B.head * 1.22, hx = cx, hy = torsoTop - R * .6;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bg ? "0 0 400 500" : "40 40 330 440"}" class="hero-svg">`);
    out.push(`<defs>
      <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="__SKY0__"/><stop offset="1" stop-color="__SKY1__"/></linearGradient>
      <linearGradient id="${id}coat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(coat, .22)}"/><stop offset=".55" stop-color="${coat}"/><stop offset="1" stop-color="${shade(coat, -.35)}"/></linearGradient>
      <radialGradient id="${id}skin" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="${shade(skin, .18)}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -.2)}"/></radialGradient>
      <linearGradient id="${id}blade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="${M.accent}"/><stop offset="1" stop-color="${M.metalD}"/></linearGradient>
      <linearGradient id="${id}au" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6EF0B5"/><stop offset=".5" stop-color="#7FB8FF"/><stop offset="1" stop-color="#F3A6FF"/></linearGradient>
      <radialGradient id="${id}glow"><stop offset="0" stop-color="${["#ffffff", "#8FD3FF", "#C7A6FF", "#FFE08A", "#B9FFE8"][t.rarityIdx]}" stop-opacity=".9"/><stop offset="1" stop-color="${["#ffffff", "#8FD3FF", "#C7A6FF", "#FFE08A", "#B9FFE8"][t.rarityIdx]}" stop-opacity="0"/></radialGradient>
    </defs>`);
    if (bg) {
      const sc = scene(t, id);
      out.push(`<rect width="400" height="500" fill="url(#${id}sky)"/>${sc.g}`);
      out.push(aura(t, cx, hy + 40, id));
      out.push(`<ellipse cx="200" cy="462" rx="190" ry="44" fill="#F2F7FC"/><ellipse cx="200" cy="456" rx="150" ry="26" fill="#DCEAF6"/>`);
      out[1] = out[1].replace("__SKY0__", sc.sky[0]).replace("__SKY1__", sc.sky[1]);
    } else {
      out[1] = out[1].replace("__SKY0__", "#000").replace("__SKY1__", "#000");
    }
    const S = bg ? 1.3 : 1;
    out.push(`<g transform="translate(${cx} ${ground}) scale(${S}) translate(${-cx} ${-ground})">`);
    out.push(`<ellipse cx="${cx + 6}" cy="${ground + 4}" rx="${w * .75 + 16}" ry="12" fill="#1A2A44" opacity=".28"/>`);
    out.push(`<g class="bob"><g class="all">`);
    // back arm (hero's left, viewer's right)
    const sY = torsoTop + 18, lHand = [cx + w / 2 + B.hand * .5 + 4, torsoTop + B.h * .66];
    out.push(`<path d="M${cx + w / 2 - 6} ${sY} Q${cx + w / 2 + B.arm * .6} ${sY + B.h * .3} ${lHand[0]} ${lHand[1] - B.hand}" stroke="#1A1216" stroke-width="${B.arm + 7}" stroke-linecap="round" fill="none"/>
      <path d="M${cx + w / 2 - 6} ${sY} Q${cx + w / 2 + B.arm * .6} ${sY + B.h * .3} ${lHand[0]} ${lHand[1] - B.hand}" stroke="${shade(coat, -.3)}" stroke-width="${B.arm}" stroke-linecap="round" fill="none"/>`);
    // legs + boots
    if (t.build !== "Seer") {
      for (const side of [-1, 1]) {
        const x = cx + side * w * .2;
        out.push(`<rect x="${x - B.arm * .55 - 6}" y="${legTop}" width="${B.arm * 1.1 + 12}" height="${leg + 6}" rx="8" fill="#2E2A36" stroke="#1A1216" stroke-width="3.5"/>
          <rect x="${x - B.arm * .6 - 12}" y="${ground - boot}" width="${B.arm * 1.2 + 26}" height="${boot}" rx="9" fill="#4A3426" stroke="#1A1216" stroke-width="3.5"/>
          <rect x="${x - B.arm * .6 - 10}" y="${ground - boot - 8}" width="${B.arm * 1.2 + 22}" height="12" rx="6" fill="${fur}" stroke="#1A1216" stroke-width="3"/>`);
      }
    }
    // coat body
    const tw = w / 2, flare = t.build === "Seer" ? w * .7 : w * .58;
    out.push(`<path d="M${cx - tw} ${torsoTop + 10} Q${cx - tw} ${torsoTop - 6} ${cx - tw + 16} ${torsoTop - 6} H${cx + tw - 16} Q${cx + tw} ${torsoTop - 6} ${cx + tw} ${torsoTop + 10} L${cx + flare} ${torsoBot} Q${cx} ${torsoBot + 10} ${cx - flare} ${torsoBot}Z" fill="url(#${id}coat)" stroke="#1A1216" stroke-width="4"/>`);
    // fur hem + center trim
    out.push(`<path d="M${cx - flare - 2} ${torsoBot - 4} Q${cx} ${torsoBot + 14} ${cx + flare + 2} ${torsoBot - 4}" stroke="${fur}" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="M${cx - flare - 2} ${torsoBot - 4} Q${cx} ${torsoBot + 14} ${cx + flare + 2} ${torsoBot - 4}" stroke="#1A1216" stroke-width="2" fill="none" opacity=".35" transform="translate(0 7)"/>
      <path d="M${cx - 2} ${torsoTop + 4} L${cx - 8} ${torsoBot}" stroke="${fur}" stroke-width="12" stroke-linecap="round"/>`);
    // belt + buckle + pouch
    const beltY = torsoTop + B.h * .66;
    out.push(`<rect x="${cx - tw - 3}" y="${beltY}" width="${w + 6}" height="${12 + B.bulk * 3}" rx="4" fill="#3B2A22" stroke="#1A1216" stroke-width="3"/>
      <rect x="${cx - 12}" y="${beltY - 3}" width="24" height="${18 + B.bulk * 3}" rx="4" fill="${M.metal}" stroke="#1A1216" stroke-width="3"/><rect x="${cx - 5}" y="${beltY + 3}" width="10" height="${6 + B.bulk * 3}" fill="${M.metalD}"/>
      <rect x="${cx + tw * .35}" y="${beltY + 10}" width="${18 + B.bulk * 4}" height="${20 + B.bulk * 4}" rx="5" fill="#6A4A33" stroke="#1A1216" stroke-width="3"/>`);
    // shoulder pads for brutes/smiths (rarity metal)
    if (t.build === "Brute" || t.build === "Smith" || t.rarityIdx >= 3) {
      for (const side of [-1, 1]) out.push(`<ellipse cx="${cx + side * (tw - 6)}" cy="${torsoTop + 6}" rx="${B.arm * .95 + 6}" ry="${B.arm * .65 + 4}" fill="${M.metal}" stroke="#1A1216" stroke-width="3.5"/><ellipse cx="${cx + side * (tw - 10)}" cy="${torsoTop + 1}" rx="${B.arm * .5}" ry="${B.arm * .22}" fill="#fff" opacity=".35"/>`);
    }
    // collar fur
    out.push(`<ellipse cx="${cx}" cy="${torsoTop - 2}" rx="${tw * .82 + 8}" ry="${14 + B.bulk * 4}" fill="${fur}" stroke="#1A1216" stroke-width="3.5"/>`);
    // back hand
    out.push(`<circle cx="${lHand[0]}" cy="${lHand[1] - B.hand * .2}" r="${B.hand}" fill="#5A3E2B" stroke="#1A1216" stroke-width="3.5"/><rect x="${lHand[0] - B.hand}" y="${lHand[1] - B.hand * 1.5}" width="${B.hand * 2}" height="${B.hand * .5}" rx="4" fill="${fur}" stroke="#1A1216" stroke-width="2.5"/>`);
    // pet sits in front, at viewer's right
    out.push(`<g class="pet">${petSVG(t, cx + tw + (t.build === "Brute" ? 52 : 70), ground + 2)}</g>`);
    // head
    out.push(headgearBack(t, hx, hy, R, coat, fur, M));
    out.push(face(t, hx, hy, R, skin, hair).replace(/__SKIN__/g, id + "skin"));
    out.push(headgearFront(t, hx, hy, R, coat, fur, hair, M, id));
    // weapon arm (viewer's left) — group "farm" so the arena can animate the strike
    const wHand = [cx - tw - B.hand * .4 - 6, torsoTop + B.h * .58];
    out.push(`<g class="farm">`);
    out.push(weaponSVG(t, wHand[0], wHand[1], M, id));
    out.push(`<path d="M${cx - tw + 6} ${sY} Q${cx - tw - B.arm * .7} ${sY + B.h * .25} ${wHand[0]} ${wHand[1] - B.hand * .4}" stroke="#1A1216" stroke-width="${B.arm + 7}" stroke-linecap="round" fill="none"/>
      <path d="M${cx - tw + 6} ${sY} Q${cx - tw - B.arm * .7} ${sY + B.h * .25} ${wHand[0]} ${wHand[1] - B.hand * .4}" stroke="${shade(coat, -.05)}" stroke-width="${B.arm}" stroke-linecap="round" fill="none"/>
      <rect x="${wHand[0] - B.hand}" y="${wHand[1] - B.hand * 1.55}" width="${B.hand * 2}" height="${B.hand * .5}" rx="4" fill="${fur}" stroke="#1A1216" stroke-width="2.5"/>
      <circle cx="${wHand[0]}" cy="${wHand[1]}" r="${B.hand}" fill="#5A3E2B" stroke="#1A1216" stroke-width="3.5"/><path d="M${wHand[0] - B.hand * .5} ${wHand[1] - B.hand * .3} h${B.hand}" stroke="#2E1F16" stroke-width="2"/>`);
    out.push(`</g></g></g></g>`);
    // Mythic sparkles
    if (t.rarityIdx === 4 && bg) {
      const r = prng(N, "spark"); for (let i = 0; i < 14; i++) { const x = 40 + r() * 320, y = 40 + r() * 340, s = 3 + r() * 5; out.push(`<path d="M${x} ${y - s} L${x + s * .3} ${y} L${x} ${y + s} L${x - s * .3} ${y}Z M${x - s} ${y} L${x} ${y + s * .3} L${x + s} ${y} L${x} ${y - s * .3}Z" fill="#fff" opacity="${.5 + r() * .5}"/>`); }
    }
    out.push(`</svg>`);
    return out.join("");
  }

  function metadata(N) {
    const t = traits(N);
    return {
      name: `Boundora Hero #${N}`, number: N, title: t.name, rarity: t.rarity, power: t.power, might: t.might,
      attributes: [
        { trait_type: "Rarity", value: t.rarity }, { trait_type: "Build", value: t.build },
        { trait_type: "Coat", value: COATS[t.coat][0] }, { trait_type: "Trim", value: FURS[t.fur][0] },
        { trait_type: "Headgear", value: t.headgear }, { trait_type: "Facial hair", value: t.facial },
        { trait_type: "Hair", value: HAIR[t.hair][0] }, { trait_type: "Mood", value: t.mood },
        { trait_type: "Weapon", value: t.weapon }, { trait_type: "Gear", value: t.material },
        { trait_type: "Companion", value: t.pet }, { trait_type: "Scene", value: t.scene }
      ],
      renderer: "boundora-heroes-v1"
    };
  }

  const api = { SUPPLY, RARITIES, POWERS, POWER_FX, BANDS, rarityIdx, numberFor, traits, heroSVG, metadata };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Heroes = api;
})(typeof window !== "undefined" ? window : globalThis);

const CFG = {
  initial: 60, ext: 12, maxRemain: 75, cooldown: 10,
  baseCost: 0.1, stepBps: 200, maxMult: 3,
  passUsd: 5, maxPasses: 1, maxPlayers: 150,
  bps: {final:3500, endurance:2000, volume:2500, rollover:1500, treasury:500},
  volumeWinners: 3, art: {final:1, endurance:1, volume:1, raffle:2},
  heroPrice: 2, maxHeroMints: 5
};
let ME = "you.testnet"; // live mode (near/live.js) swaps in the signed-in account
// The site always plays on NEAR testnet; the offline simulation code below is not reachable.
const LIVE = true;
const BOTS = LIVE ? [] : [
  {id:"aurora.near", passes:2, eager:1.0},
  {id:"kepler.near", passes:1, eager:0.8},
  {id:"vesta.near", passes:2, eager:1.2},
  {id:"lagrange.near", passes:2, eager:0.9},
  {id:"halley.near", passes:1, eager:1.4},
  {id:"tycho.near", passes:2, eager:0.7},
  {id:"ada.near", passes:2, eager:1.1}
];
function hash256(str){ // 256-bit mixed hash -> 64 hex chars (stand-in for env::sha256)
  let h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);
    for(let k=0;k<8;k++){h[k]=Math.imul(h[k]^c^(h[(k+1)&7]>>>7),0x9E3779B1+k*2)>>>0;h[k]=(h[k]<<13|h[k]>>>19)>>>0;}}
  for(let r=0;r<4;r++)for(let k=0;k<8;k++){h[k]=Math.imul(h[k]^h[(k+3)&7]>>>11,0x85EBCA6B)>>>0;h[k]=(h[k]^h[k]>>>15)>>>0;}
  return h.map(x=>x.toString(16).padStart(8,"0")).join("");
}
function rng(seedHex){ // sfc32 seeded from hex
  let a=parseInt(seedHex.slice(0,8),16)|0,b=parseInt(seedHex.slice(8,16),16)|0,c=parseInt(seedHex.slice(16,24),16)|0,d=parseInt(seedHex.slice(24,32),16)|0;
  const f=()=>{a|=0;b|=0;c|=0;d|=0;const t=(a+b|0)+d|0;d=d+1|0;a=b^b>>>9;b=c+(c<<3)|0;c=c<<21|c>>>11;c=c+t|0;return (t>>>0)/4294967296;};
  for(let i=0;i<12;i++)f();return f;
}

/* ============================================================
   Orbit Art: three-body renderer (boundora-threebody-v1)
   ============================================================ */
const PALETTES = [
  {name:"Brass orrery", bg:["#13244A","#08112A"], b:["#D4AE62","#ECEFF6","#EF8A8A"]},
  {name:"Tidewater",   bg:["#0E2B3A","#061521"], b:["#74C7C1","#E8F1EE","#D4AE62"]},
  {name:"Ember",       bg:["#2E1622","#120810"], b:["#F09A6B","#F6D7A8","#C9617E"]},
  {name:"Aurora",      bg:["#0F2A2A","#06100F"], b:["#8FE3A6","#7FB3F0","#E7F5EF"]},
  {name:"Violet hour", bg:["#21183F","#0C0820"], b:["#B39BF2","#F0A6C8","#EDE8FA"]},
  {name:"Ice",         bg:["#E9EEF6","#C7D2E4"], b:["#1F3A73","#5A7BC2","#C4513F"], light:true}
];
const SHAPES = ["Figure-eight","Lagrange triangle","Hierarchical","Slingshot"];
function traitsOf(seed){
  const r=rng(seed);
  const shape=SHAPES[Math.floor(r()*SHAPES.length)];
  const pal=PALETTES[r()<0.08?5:Math.floor(r()*5)];
  const chaos=r();
  return {shape,pal,chaos,chaosLabel:chaos<0.33?"Calm":chaos<0.7?"Restless":"Wild",r};
}
const simCache=new Map();
function simulate(seed){
  if(simCache.has(seed))return simCache.get(seed);
  const T=traitsOf(seed), r=T.r, k=0.02+T.chaos*0.16;
  let p,v,m=[1,1,1];
  const j=()=> (r()-0.5)*2*k;
  if(T.shape==="Figure-eight"){
    p=[[-0.97000436,0.24308753],[0.97000436,-0.24308753],[0,0]];
    const v3=[-0.93240737,-0.86473146];
    v=[[-v3[0]/2,-v3[1]/2],[-v3[0]/2,-v3[1]/2],[v3[0],v3[1]]];
  }else if(T.shape==="Lagrange triangle"){
    p=[0,1,2].map(i=>{const a=i*2*Math.PI/3+r();return[Math.cos(a),Math.sin(a)]});
    const s=Math.sqrt(1/Math.sqrt(3))*(0.85+r()*0.25);
    v=p.map(q=>[-q[1]*s,q[0]*s]);
  }else if(T.shape==="Hierarchical"){
    p=[[-0.25,0],[0.25,0],[1.7,0]];m=[1,1,0.15+r()*0.4];
    const vb=Math.sqrt(1/(4*0.25))*0.98, vo=Math.sqrt(2/1.7)*(0.85+r()*0.2);
    v=[[0,-vb],[0,vb],[0,vo]];
  }else{
    p=[[-1,0.3],[1,-0.3],[0.1,0.9]];
    v=[[0.35,0.3],[-0.35,-0.3],[0,-0.1]];
  }
  p=p.map(q=>[q[0]+j(),q[1]+j()]);v=v.map(q=>[q[0]+j()*0.6,q[1]+j()*0.6]);
  m=m.map(x=>x*(1+j()*0.5));
  // centre of momentum frame
  const M=m[0]+m[1]+m[2];
  for(const d of[0,1]){const P=(m[0]*v[0][d]+m[1]*v[1][d]+m[2]*v[2][d])/M;v.forEach(q=>q[d]-=P);
    const C=(m[0]*p[0][d]+m[1]*p[1][d]+m[2]*p[2][d])/M;p.forEach(q=>q[d]-=C);}
  const dt=0.004, eps2=0.004, steps=7000, every=2, trails=[[],[],[]];
  const acc=()=>{const a=[[0,0],[0,0],[0,0]];
    for(let i=0;i<3;i++)for(let q=i+1;q<3;q++){const dx=p[q][0]-p[i][0],dy=p[q][1]-p[i][1];const d2=dx*dx+dy*dy+eps2,inv=1/(d2*Math.sqrt(d2));
      a[i][0]+=m[q]*dx*inv;a[i][1]+=m[q]*dy*inv;a[q][0]-=m[i]*dx*inv;a[q][1]-=m[i]*dy*inv;}return a;};
  let a=acc();
  for(let s=0;s<steps;s++){
    for(let i=0;i<3;i++){v[i][0]+=a[i][0]*dt/2;v[i][1]+=a[i][1]*dt/2;p[i][0]+=v[i][0]*dt;p[i][1]+=v[i][1]*dt;}
    a=acc();
    for(let i=0;i<3;i++){v[i][0]+=a[i][0]*dt/2;v[i][1]+=a[i][1]*dt/2;}
    if(s%every===0){let out=false;for(let i=0;i<3;i++){if(Math.hypot(p[i][0],p[i][1])>3.2)out=true;}
      if(out&&s>steps*0.25)break;for(let i=0;i<3;i++)trails[i].push(p[i][0],p[i][1]);}
  }
  // fit to view
  // fit to view on the 94th percentile of distance, so one escaping body can't shrink the piece
  const ds=[];for(const t of trails)for(let i=0;i<t.length;i+=2)ds.push(Math.max(Math.abs(t[i]),Math.abs(t[i+1])));
  ds.sort((a,b)=>a-b);const mx=ds[Math.floor(ds.length*0.94)]||1;
  const res={trails,scale:1/Math.max(mx,0.5),T,m};
  simCache.set(seed,res);if(simCache.size>80)simCache.delete(simCache.keys().next().value);
  return res;
}
function paintBackground(ctx,W,H,T,seed){
  const g=ctx.createRadialGradient(W*0.5,H*0.45,0,W*0.5,H*0.5,W*0.75);
  g.addColorStop(0,T.pal.bg[0]);g.addColorStop(1,T.pal.bg[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const r=rng(hash256(seed+"stars"));ctx.fillStyle=T.pal.light?"rgba(31,58,115,.35)":"rgba(236,239,246,.55)";
  for(let i=0;i<140;i++){const s=r()*1.3*W/600;ctx.globalAlpha=0.2+r()*0.6;ctx.beginPath();ctx.arc(r()*W,r()*H,s,0,7);ctx.fill();}
  ctx.globalAlpha=1;
}
function pathOf(ctx,t,from,to,W,H,sc){
  const cx=W/2,cy=H/2,R=W*0.42*sc;ctx.beginPath();
  for(let i=from;i<to;i+=2){const x=cx+t[i]*R,y=cy+t[i+1]*R;if(i===from)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
}
function drawArt(canvas,seed){ // static, full piece
  const ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height,S=simulate(seed),T=S.T;
  paintBackground(ctx,W,H,T,seed);
  ctx.globalCompositeOperation=T.pal.light?"multiply":"lighter";ctx.lineJoin="round";ctx.lineCap="round";
  ctx.save();ctx.beginPath();ctx.rect(W*0.03,H*0.03,W*0.94,H*0.94);ctx.clip();
  S.trails.forEach((t,i)=>{ctx.strokeStyle=T.pal.b[i];
    ctx.globalAlpha=T.pal.light?0.18:0.10;ctx.lineWidth=W/60;pathOf(ctx,t,0,t.length,W,H,S.scale);ctx.stroke();
    ctx.globalAlpha=T.pal.light?0.35:0.28;ctx.lineWidth=W/220;pathOf(ctx,t,0,t.length,W,H,S.scale);ctx.stroke();
    ctx.globalAlpha=T.pal.light?0.95:0.95;ctx.lineWidth=Math.max(1,W/600);pathOf(ctx,t,0,t.length,W,H,S.scale);ctx.stroke();});
  ctx.restore();
  ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
  S.trails.forEach((t,i)=>{const n=t.length-2,R=W*0.42*S.scale,x=W/2+t[n]*R,y=H/2+t[n+1]*R;
    ctx.fillStyle=T.pal.b[i];ctx.beginPath();ctx.arc(x,y,W/90*Math.cbrt(S.m[i]),0,7);ctx.fill();});
}


const S={
  now:0, nextArt:0, treasury:0, history:[], art:[], claimable:new Map(), feed:[],
  passes:new Map(), locks:new Map(), balances:new Map(), wallet:null,
  cycle:null, botPlan:null, lastSettled:null
};
BOTS.forEach(b=>{S.passes.set(b.id,b.passes);S.balances.set(b.id,1e6);});
if(!LIVE)S.locks.set("vesta.near",[{collection:"demo-collection.testnet",token:"77"}]);
function newCycle(id,opensAt,pool,seed){
  S.cycle={id,opensAt,endsAt:opensAt+CFG.initial,pool,count:0,last:null,lastAt:opensAt,seed,players:[]};
  S.botPlan={target:12+Math.floor(Math.random()*16)};
}
const passTotal=id=>(S.passes.get(id)||0)+((S.locks.get(id)||[]).length);
/* Heroes: ownership, equip, powers (mirrors the contract) */
S.heroMinted=[0,0,0,0,0];S.heroOwner=new Map();S.equipped=new Map();S.heroMints=new Map();
const SUPPLY_BY=[8400,5600,3400,1800,800];
function equippedN(id){const n=S.equipped.get(id);return n&&S.heroOwner.get(n)===id?n:0;}
function fxOf(id){const n=equippedN(id);if(!n)return[0,0,0];const f=Heroes.POWER_FX[Heroes.rarityIdx(n)];let ms=f[0]+lvlBonus(heroLv(n)),d=f[1],c=f[2];for(const g of gearOf(n)){ms+=GEAR[g].ms;d+=GEAR[g].disc;c+=GEAR[g].chi;}return[ms,d,c];}
S.nearUsd=3.71;
// CFG.passNear: fixed NEAR price set by the owner (set_pass_price_near); otherwise $passUsd at the oracle rate
const passNear=()=>CFG.passNear??+(CFG.passUsd/S.nearUsd).toFixed(4);
const passLabel=()=>CFG.passNear!=null?`${fmt(passNear())} NEAR`:`$${CFG.passUsd} (${fmt(passNear())} NEAR)`;
const hasPass=id=>(S.passes.get(id)||0)>0;
const multOf=id=>!hasPass(id)?0:Math.min(passTotal(id),CFG.maxMult)+fxOf(id)[2];
const cost=()=>CFG.baseCost+CFG.baseCost*CFG.stepBps*S.cycle.count/10000;
const costFor=id=>cost()*(1-fxOf(id)[1]);
function takeHero(owner,want,rank){
  const order=[];for(let r=want;r>=0;r--)order.push(r);for(let r=want+1;r<5;r++)order.push(r);
  const r=order.find(x=>S.heroMinted[x]<SUPPLY_BY[x]);if(r===undefined)return null;
  const n=Heroes.numberFor(r,S.heroMinted[r]++);S.heroOwner.set(n,owner);
  const a={id:"hero-"+n,n,r,cycle:S.cycle?S.cycle.id:0,rank,owner};S.art.unshift(a);return a;
}
S.listings=new Map();S.sales=[];S.volume=0;
const ROYALTY=0.05;
/* Dynamic heroes that hold money (mirrors the contract): XP, level, own NEAR vault */
const XP={strike:10,"Final gesture":120,"Endurance":80,"Volume":50,"Raffle":20},HERO_POT=0.10,HERO_ROY=0.40,MAX_LV=50;
S.hstats=new Map();
const hs=n=>{let x=S.hstats.get(n);if(!x){x={xp:0,strikes:0,wins:0,vault:0,earned:0,gear:[],acct:false};S.hstats.set(n,x);}return x;};
/* Hero inventory (gear lives on the hero, so it moves with it) */
const GEAR=[{name:"Frost Cloak",price:0.5,ms:2,disc:0,chi:0,xp:0,fx:"+2s per strike"},{name:"Ember Charm",price:0.8,ms:0,disc:0.05,chi:0,xp:0,fx:"Strikes cost 5% less"},{name:"Snow Owl",price:0.5,ms:0,disc:0,chi:0,xp:50,fx:"+50% XP"},{name:"Aurora Gem",price:3,ms:0,disc:0,chi:1,xp:0,fx:"+1 chi"}],GEAR_SLOTS=3;
const gearOf=n=>(S.hstats.get(n)||{gear:[]}).gear||[];
function buyGear(id,n,g){if(S.heroOwner.get(n)!==id)return "You don't own that hero.";const x=hs(n),it=GEAR[g];
  if(x.gear.includes(g))return "This hero already carries that item.";if(x.gear.length>=GEAR_SLOTS)return "This hero's inventory is full (3 slots).";
  if((S.balances.get(id)||0)<it.price)return `You need ${fmt(it.price)} NEAR.`;S.balances.set(id,S.balances.get(id)-it.price);S.treasury+=it.price;x.gear.push(g);
  log(`${short(id)} gave hero #${n} a ${it.name}`,id===ME?"me":"");return null;}
function moveGear(id,a,b,g){if(S.heroOwner.get(a)!==id||S.heroOwner.get(b)!==id)return "You don't own that hero.";if(S.listings.has(a))return "Delist the hero before moving its gear.";if(S.auctions&&S.auctions.has(a))return "The hero is on auction.";
  const from=hs(a),to=hs(b),i=from.gear.indexOf(g);if(i<0)return "The hero doesn't carry that item.";if(to.gear.includes(g))return "That hero already carries this item.";if(to.gear.length>=GEAR_SLOTS)return "That hero's inventory is full.";
  from.gear.splice(i,1);to.gear.push(g);if(typeof refundBids==="function")refundBids(a);log(`${short(id)} moved a ${GEAR[g].name} from #${a} to #${b}`,id===ME?"me":"");return null;}
function dropGear(id,salt){const n=equippedN(id);if(!n)return;const x=hs(n);if(x.gear.length>=GEAR_SLOTS)return;const free=[0,1,2,3].filter(g=>!x.gear.includes(g));if(!free.length)return;
  const r=parseInt(hash256(salt+n+S.now).slice(0,6),16);let g=free.includes(3)&&r%10===0?3:free.filter(z=>z!==3)[Math.floor(r/10)%Math.max(1,free.filter(z=>z!==3).length)];if(g===undefined)return;
  x.gear.push(g);if(id===ME&&!booting)log(`Hero #${n} found a ${GEAR[g].name}`,"me");}
/* Hero accounts: hero-N.boundora.testnet (sub-account that holds the hero's NEAR) */
const CONTRACT_ID="boundora.testnet",HERO_ACCT_COST=1.2;
const acctOf=n=>`hero-${n}.${CONTRACT_ID}`;
function openAccount(id,n){if(S.heroOwner.get(n)!==id)return "You don't own that hero.";const x=hs(n);if(x.acct)return "This hero already has an account.";
  if((S.balances.get(id)||0)<HERO_ACCT_COST)return `You need ${fmt(HERO_ACCT_COST)} NEAR to cover the account's storage.`;
  S.balances.set(id,S.balances.get(id)-HERO_ACCT_COST);x.acct=true;log(`Hero #${n} now has its own NEAR account: ${acctOf(n)}`,id===ME?"me":"");return null;}
/* Pass: a soulbound NEP-171 token with a live membership record */
S.pstats=new Map();
const ps=id=>{let x=S.pstats.get(id);if(!x){x={joinedRound:S.cycle?S.cycle.id:1,joined:S.now||0,rounds:0,strikes:0,wins:0,best:0,last:0};S.pstats.set(id,x);}return x;};
const FINISH=["none yet","raffle","chi master","iron stance","final strike"],FINISH_OF={"Final gesture":4,"Endurance":3,"Volume":2,"Raffle":1};
const lvlOf=xp=>Math.min(MAX_LV,1+Math.floor(Math.sqrt(Math.floor(xp/40))));
const xpFor=l=>40*(l-1)*(l-1);
const lvlBonus=l=>Math.min(10,Math.floor((l-1)/3));
const heroLv=n=>lvlOf((S.hstats.get(n)||{xp:0}).xp);
function heroEarn(n,amt,src){if(!(amt>0))return;const x=hs(n);x.vault+=amt;x.earned+=amt;
  const o=S.heroOwner.get(n);if(o===ME&&!booting)log(`Hero #${n} earned ${fmt(amt)} NEAR from ${src}`,"me");}
function heroXP(n,xp,win){if(!n)return;const x=hs(n),before=lvlOf(x.xp);x.xp+=Math.floor(xp*(100+x.gear.reduce((t,g)=>t+GEAR[g].xp,0))/100);if(win)x.wins++;else x.strikes++;
  const after=lvlOf(x.xp);if(after>before&&S.heroOwner.get(n)===ME&&!booting){log(`Hero #${n} reached level ${after}`,"me");if(typeof toast==="function")toast(`Hero #${n} is now level ${after}${lvlBonus(after)>lvlBonus(before)?`: +${lvlBonus(after)}s per strike`:""}.`);}}
function claimVault(id,n){
  if(S.heroOwner.get(n)!==id)return "Only the hero's owner can empty its vault.";
  if(S.listings.has(n))return "Delist the hero before claiming its vault.";
  if(S.auctions&&S.auctions.has(n))return "The hero is on auction.";
  const x=hs(n);if(!(x.vault>0))return "This hero's vault is empty.";
  const a=x.vault;x.vault=0;if(typeof refundBids==="function")refundBids(n);
  S.balances.set(id,(S.balances.get(id)||0)+a);log(`${short(id)} claimed ${fmt(a)} NEAR from hero #${n}'s vault`,id===ME?"me":"");return null;
}
function transferHero(n,from,to){S.heroOwner.set(n,to);const a=S.art.find(x=>x.n===n);if(a)a.owner=to;if(S.equipped.get(from)===n)S.equipped.delete(from);}
function listHero(id,n,price){if(S.heroOwner.get(n)!==id)return "You don't own that hero.";if(S.auctions&&S.auctions.has(n))return "This hero is in an auction.";if(!(price>=0.01))return "Minimum price is 0.01 NEAR.";S.listings.set(n,{seller:id,price:+price.toFixed(3),at:S.now});log(`${short(id)} listed hero #${n} for ${fmt(price)} NEAR`,id===ME?"me":"");return null;}
function delistHero(id,n){const l=S.listings.get(n);if(!l||l.seller!==id)return "Not your listing.";S.listings.delete(n);return null;}
function buyHero(id,n){
  const l=S.listings.get(n);if(!l)return "That hero isn't for sale any more.";if(l.seller===id)return "You can't buy your own hero.";
  if(S.heroOwner.get(n)!==l.seller){S.listings.delete(n);return "That listing is stale.";}
  if((S.balances.get(id)||0)<l.price)return "Not enough NEAR for this hero.";
  S.listings.delete(n);S.balances.set(id,S.balances.get(id)-l.price);const roy=l.price*ROYALTY;S.treasury+=roy*(1-HERO_ROY);heroEarn(n,roy*HERO_ROY,"its resale royalty");
  S.balances.set(l.seller,(S.balances.get(l.seller)||0)+l.price-roy);transferHero(n,l.seller,id);refundBids(n);
  S.sales.unshift({n,seller:l.seller,buyer:id,price:l.price,royalty:roy,at:S.now});S.volume+=l.price;
  if(id!==ME)equipBest(id);if(l.seller!==ME&&!equippedN(l.seller))equipBest(l.seller);
  log(`${short(id)} bought hero #${n} from ${short(l.seller)} for ${fmt(l.price)} NEAR`,id===ME||l.seller===ME?"me":"");return null;
}
const PRICE_BAND=[[0.8,2.4],[2.5,5],[5,10],[12,26],[40,85]];
function botMarketTick(){
  if(Math.random()<.5&&botBidTick())return;
  const bots=BOTS.map(b=>b.id),r=Math.random();
  if(r<.6){ // a bot lists a spare hero
    const b=bots[Math.floor(Math.random()*bots.length)];
    const spare=[...S.heroOwner].filter(([n,o])=>o===b&&!S.listings.has(n)&&equippedN(b)!==n).map(([n])=>n);
    if(spare.length){const n=spare[Math.floor(Math.random()*spare.length)],[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)];listHero(b,n,lo+Math.random()*(hi-lo));}
  }else{ // a bot buys a fairly priced listing
    const deals=[...S.listings].filter(([n,l])=>{const[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)];return l.price<=lo+(hi-lo)*.45&&S.now-l.at>15;});
    if(deals.length){const[n,l]=deals[Math.floor(Math.random()*deals.length)];const b=bots.filter(x=>x!==l.seller)[Math.floor(Math.random()*(bots.length-1))];buyHero(b,n);}
  }
}
function equipBest(id){let best=0,br=-1;for(const[n,o]of S.heroOwner)if(o===id){const r=Heroes.rarityIdx(n);if(r>br){br=r;best=n;}}if(best)S.equipped.set(id,best);}
const isOpen=()=>S.now>=S.cycle.opensAt&&S.now<S.cycle.endsAt;
const findP=id=>S.cycle.players.find(p=>p.id===id);

function gesture(id,amount){
  settleIfEnded();
  const c=S.cycle;
  if(multOf(id)<1)return `Mint your Boundora Pass to play. It costs ${passLabel()}.`;
  if(S.now<c.opensAt)return "The next round hasn't started yet.";
  const k=costFor(id);
  if(amount<k-1e-9)return "Stake is below the current gesture cost.";
  if(amount>k*multOf(id)+1e-9)return "That stake is above your chi limit.";
  if(!findP(id)&&c.players.length>=CFG.maxPlayers)return "This cycle is full.";
  if((S.balances.get(id)||0)<amount)return "Not enough NEAR in your wallet.";
  S.balances.set(id,S.balances.get(id)-amount);
  if(c.last){findP(c.last).held+=S.now-c.lastAt;}
  let p=findP(id);if(!p){p={id,volume:0,gestures:0,held:0};c.players.push(p);}
  p.volume+=amount;p.gestures++;
  c.pool+=amount;c.count++;c.last=id;c.lastAt=S.now;
  const before=c.endsAt;
  c.endsAt=Math.min(c.endsAt+CFG.ext+fxOf(id)[0],S.now+CFG.maxRemain);
  c.seed=hash256(c.seed+id+amount.toFixed(6)+S.now.toFixed(3));
  heroXP(equippedN(id),XP.strike,false);
  {const q=ps(id);q.strikes++;if(q.last!==c.id){q.rounds++;q.last=c.id;}}
  log(`${short(id)} struck for ${fmt(amount)} NEAR`, id===ME?"me":"");
  onGesture(id,c.endsAt-before);
  return null;
}
function mintArt(owner,rank,count,entropy){
  const want={"Final gesture":parseInt(hash256(entropy+"mythic").slice(0,4),16)%100<5?4:3,"Endurance":2,"Volume":1,"Raffle":0}[rank];
  const out=[];for(let i=0;i<count;i++){const a=takeHero(owner,want,rank);if(a)out.push(a);}
  if(owner!==ME&&!equippedN(owner))equipBest(owner);
  return out;
}
function credit(id,amt){if(amt>0)S.claimable.set(id,(S.claimable.get(id)||0)+amt);}
function creditWin(id,amt){const n=equippedN(id),cut=n?amt*HERO_POT:0;if(cut)heroEarn(n,cut,"a round win");credit(id,amt-cut);}
function settleIfEnded(){
  const c=S.cycle;if(S.now<c.endsAt)return false;
  const pool=c.pool,entropy=hash256("block"+S.now);const awards=[];let rolled=pool;
  if(c.last){
    findP(c.last).held+=c.endsAt-c.lastAt;
    const share=b=>pool*b/10000;let paid=0,finalAmt=share(CFG.bps.final);
    const others=c.players.filter(p=>p.id!==c.last&&p.held>0).sort((a,b)=>b.held-a.held);
    const champ=others[0]?others[0].id:null;
    if(!champ)finalAmt+=share(CFG.bps.endurance);
    const leaders=[...c.players].sort((a,b)=>b.volume-a.volume).slice(0,CFG.volumeWinners).map(p=>p.id);
    const per=share(CFG.bps.volume)/leaders.length;
    awards.push({id:c.last,rank:"Final gesture",amount:finalAmt,art:mintArt(c.last,"Final gesture",CFG.art.final,entropy)});creditWin(c.last,finalAmt);paid+=finalAmt;
    if(champ){const a=share(CFG.bps.endurance);awards.push({id:champ,rank:"Endurance",amount:a,art:mintArt(champ,"Endurance",CFG.art.endurance,entropy)});creditWin(champ,a);paid+=a;}
    leaders.forEach(l=>{awards.push({id:l,rank:"Volume",amount:per,art:mintArt(l,"Volume",CFG.art.volume,entropy)});creditWin(l,per);paid+=per;});
    let pool2=c.players.map(p=>p.id).filter(a=>awards.every(w=>w.id!==a));let r=rng(hash256(entropy+c.seed+"raffle"));
    for(let i=0;i<CFG.art.raffle&&pool2.length;i++){const pick=Math.floor(r()*pool2.length);const lucky=pool2.splice(pick,1)[0];
      awards.push({id:lucky,rank:"Raffle",amount:0,art:mintArt(lucky,"Raffle",1,entropy+i)});}
    awards.forEach(w=>{if(w.rank==='Final gesture'||w.rank==='Endurance')dropGear(w.id,w.rank);heroXP(equippedN(w.id),XP[w.rank]||0,true);const q=ps(w.id);q.wins++;q.best=Math.max(q.best,FINISH_OF[w.rank]||0);});
    const t=share(CFG.bps.treasury);S.treasury+=t;paid+=t;rolled=pool-paid;
  }
  const summary={id:c.id,pool,gestures:c.count,players:c.players.length,seed:c.seed,awards,rolled,final:c.last};
  S.history.unshift(summary);S.lastSettled=summary;
  log(c.last?`K.O. Round ${c.id} goes to ${c.last===ME?"you":short(c.last)}.`:`Round ${c.id} ended with no strikes.`,"sys");
  newCycle(c.id+1,S.now+CFG.cooldown,rolled,hash256(c.seed+entropy));
  onSettle(summary);
  return true;
}
function claim(id){const a=S.claimable.get(id)||0;if(a<=0)return 0;S.claimable.delete(id);S.balances.set(id,(S.balances.get(id)||0)+a);log(`${short(id)} claimed ${fmt(a)} NEAR`,id===ME?"me":"");return a;}

/* Simulated players */
function botsTick(dt){
  const c=S.cycle;if(!isOpen())return;
  const rem=c.endsAt-S.now, tired=c.count>=S.botPlan.target;
  for(const b of BOTS){
    let lambda=tired?0.0035:0.022;
    if(!tired&&rem<14)lambda+=0.11;
    if(!tired&&rem<5)lambda+=0.25;
    if(c.last===b.id)lambda*=0.15;
    lambda*=b.eager;
    if(Math.random()<1-Math.exp(-lambda*dt)){
      const k=costFor(b.id),mult=1+Math.floor(Math.random()*Math.random()*multOf(b.id));
      gesture(b.id,+(k*mult).toFixed(4));
    }
  }
}


/* ============================================================
   Game layer
   ============================================================ */
const $=id=>document.getElementById(id);
const fmt=n=>n>=100?n.toFixed(1):n>=10?n.toFixed(2):n.toFixed(3);
const short=id=>id===ME?"You":String(id).replace(/^bot:/,"").replace(/\.near$|\.testnet$/,""); // bot:john -> john
const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
let booting=true, stake=1, hint={msg:"",err:false};
const RCLS=["common","rare","epic","legendary","mythic"];
const RANKNAME0={"Public mint":"Minted"};
const RANKNAME={"Final gesture":"Final strike","Endurance":"Iron stance","Volume":"Chi master","Raffle":"Raffle","Public mint":"Public mint"};
const TITLES=["the Patient","Iron Palm","Swift Comet","Quiet Storm","Twin Moon","Falling Star","Stone Root","Jade Wind","Seven Steps","Paper Tiger"];
function log(msg,cls){S.feed.unshift({msg,cls,t:S.now});if(S.feed.length>60)S.feed.pop();}
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("on"),2600);}

/* Crests: procedural mon emblems, one per account */
const CREST_COLORS=[["#C8372B","#F2C14E"],["#3FB68B","#F4E9D0"],["#A77BF0","#F2C14E"],["#F2C14E","#C8372B"],["#E8743B","#F4E9D0"],["#5DA9E9","#F4E9D0"],["#F4E9D0","#C8372B"]];
const crestCache=new Map();
function crest(id){
  if(crestCache.has(id))return crestCache.get(id);
  const r=rng(hash256("crest"+id)),[a,b]=CREST_COLORS[Math.floor(r()*CREST_COLORS.length)];
  const n=3+Math.floor(r()*6),kind=Math.floor(r()*3);let g="";
  for(let i=0;i<n;i++){const rot=i*360/n;
    if(kind===0)g+=`<path d="M50 50 Q${58+r()*4} 30 50 ${12+r()*4} Q${42-r()*4} 30 50 50Z" fill="${a}" transform="rotate(${rot} 50 50)"/>`;
    else if(kind===1)g+=`<ellipse cx="50" cy="30" rx="8" ry="15" fill="none" stroke="${a}" stroke-width="5" transform="rotate(${rot} 50 50)"/>`;
    else g+=`<path d="M50 50 L58 16 L50 22 L42 16Z" fill="${a}" transform="rotate(${rot} 50 50)"/>`;}
  const s=`<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#1A0E26"/><circle cx="50" cy="50" r="42" fill="none" stroke="${b}" stroke-width="3"/>${g}<circle cx="50" cy="50" r="${8+r()*5}" fill="${b}"/><circle cx="50" cy="50" r="4" fill="#1A0E26"/></svg>`;
  crestCache.set(id,s);return s;
}
const titleOf=id=>id===ME?"the Newcomer":TITLES[parseInt(hash256("t"+id).slice(0,6),16)%TITLES.length];
const BELTS=[[0,"No belt","#4A2F6B"],[1,"Black belt","#111"],[2,"Master black belt","#111"]];
function beltOf(n){let b=BELTS[0];for(const x of BELTS)if(n>=x[0])b=x;return b;}
function beltSVG(n){const[, ,c]=beltOf(n);return `<svg width="70" height="46" viewBox="0 0 70 46" aria-hidden="true"><rect x="2" y="12" width="66" height="12" rx="3" fill="${c}" stroke="#000" stroke-width="1.5"/><path d="M30 22 L22 44 L30 42 L34 26 L38 42 L46 44 L38 22Z" fill="${c}" stroke="#000" stroke-width="1.5"/><rect x="28" y="9" width="14" height="18" rx="3" fill="${c}" stroke="#000" stroke-width="1.5"/>${n>=2?'<rect x="56" y="12" width="4" height="12" fill="#F2C14E"/><rect x="50" y="12" width="4" height="12" fill="#F2C14E"/>':""}</svg>`;}

/* Sound: tiny WebAudio synth, starts after the first tap */
const SFX={ctx:null,on:true,
  init(){if(this.ctx||!this.on)return;try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){this.ctx=null;}},
  noise(t,dur,f,q,vol){const c=this.ctx,b=c.createBuffer(1,c.sampleRate*dur,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    const s=c.createBufferSource();s.buffer=b;const bp=c.createBiquadFilter();bp.type="bandpass";bp.frequency.value=f;bp.Q.value=q;const g=c.createGain();g.gain.value=vol;s.connect(bp).connect(g).connect(c.destination);s.start(t);},
  tone(t,f0,f1,dur,vol,type="sine"){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur);},
  play(kind){if(!this.on||!this.ctx)return;const t=this.ctx.currentTime;
    if(kind==="hit"){this.noise(t,.18,1800,1.2,.5);this.tone(t,160,50,.22,.6);}
    if(kind==="tap"){this.noise(t,.08,2600,2,.12);}
    if(kind==="gong"){[110,165,221,277].forEach((f,i)=>this.tone(t,f,f*.98,2.6-i*.4,.28/(i+1),"sine"));this.noise(t,.4,500,1,.25);}
    if(kind==="fight"){this.tone(t,440,440,.12,.18,"square");this.tone(t+.14,660,660,.25,.18,"square");}
    if(kind==="coin"){this.tone(t,988,988,.08,.15,"square");this.tone(t+.08,1319,1319,.3,.15,"square");}
  }};
function renderMute(){$("mute").innerHTML=SFX.on?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4E9D0" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B6A6C9" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
  $("mute").setAttribute("aria-label",SFX.on?"Sound on. Turn off":"Sound off. Turn on");}
$("mute").onclick=()=>{SFX.on=!SFX.on;if(SFX.on)SFX.init();renderMute();};
addEventListener("pointerdown",()=>SFX.init(),{once:true});

/* Announcer, shake, combo, sparks */
let callQ=[],callBusy=false;
function announce(text,red){callQ.push([text,red]);if(!callBusy)nextCall();}
function nextCall(){const it=callQ.shift();if(!it){callBusy=false;return;}callBusy=true;const el=$("caller");el.textContent=it[0];el.className=it[1]?"red":"";void el.offsetWidth;el.classList.add("go");setTimeout(nextCall,1250);}
function shake(big){if(reduceMotion)return;const a=$("arena");a.classList.remove("shake","shake-big");void a.offsetWidth;a.classList.add(big?"shake-big":"shake");}
let combo={n:0,t:-99};
function bumpCombo(){if(S.now-combo.t<4)combo.n++;else combo.n=1;combo.t=S.now;
  if(combo.n>=2){$("comboN").textContent=combo.n;const c=$("combo");c.classList.remove("go");void c.offsetWidth;c.classList.add("go");}}
const fx=$("fx"),parts=[];
function sizeFx(){const r=fx.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);fx.width=r.width*d;fx.height=r.height*d;}
function sparks(n,colors){if(reduceMotion)n=Math.min(n,6);const o=document.querySelector(".orb").getBoundingClientRect(),a=fx.getBoundingClientRect(),d=fx.width/a.width;
  const cp=contactPoint(),cx=cp.x*d,cy=cp.y*d,R=6*d;
  for(let i=0;i<n;i++){const ang=Math.random()*Math.PI*2,sp=(4+Math.random()*9)*d;parts.push({x:cx+Math.cos(ang)*R,y:cy+Math.sin(ang)*R,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,life:1,c:colors[i%colors.length],w:(2+Math.random()*3)*d});}}
const flakes=Array.from({length:70},()=>({x:Math.random(),y:Math.random(),s:.5+Math.random()*1.6,v:.0006+Math.random()*.0012,d:Math.random()*6}));
function drawFx(){const c=fx.getContext("2d");c.clearRect(0,0,fx.width,fx.height);c.lineCap="round";
  if(!reduceMotion){c.fillStyle="#F4F8FF";for(const f of flakes){f.y+=f.v;f.d+=.01;if(f.y>1){f.y=0;f.x=Math.random();}c.globalAlpha=.55;c.beginPath();c.arc((f.x+Math.sin(f.d)*.01)*fx.width,f.y*fx.height,f.s*fx.width/700+.6,0,7);c.fill();}c.globalAlpha=1;}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vx*=.92;p.vy=p.vy*.92+.25;p.life-=.035;if(p.life<=0){parts.splice(i,1);continue;}
    c.strokeStyle=p.c;c.globalAlpha=p.life;c.lineWidth=p.w;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*2.2,p.y-p.vy*2.2);c.stroke();}c.globalAlpha=1;}

/* Live spirit orb */
const sky=$("sky");
const live={seed:null,S:null,base:null,head:0,prev:null,fade:1};
function sizeSky(){const r=sky.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);sky.width=Math.round(r.width*d);sky.height=Math.round(r.height*d);if(live.seed)setLiveSeed(live.seed,true);}
function setLiveSeed(seed,force){
  if(seed===live.seed&&!force)return;
  if(live.base&&!force){live.prev=live.base;live.fade=0;}
  live.seed=seed;live.S=simulate(seed);
  if(!sky.width||!sky.height){live.base=null;return;}
  const off=document.createElement("canvas");off.width=sky.width;off.height=sky.height;
  const ctx=off.getContext("2d"),W=off.width,H=off.height,T=arenaT(live.S.T);
  paintBackground(ctx,W,H,T,seed);
  ctx.globalCompositeOperation="lighter";ctx.lineJoin="round";ctx.lineCap="round";
  live.S.trails.forEach((t,i)=>{ctx.strokeStyle=T.pal.b[i];
    ctx.globalAlpha=.09;ctx.lineWidth=W/55;pathOf(ctx,t,0,t.length,W,H,live.S.scale);ctx.stroke();
    ctx.globalAlpha=.22;ctx.lineWidth=W/200;pathOf(ctx,t,0,t.length,W,H,live.S.scale);ctx.stroke();
    ctx.globalAlpha=.75;ctx.lineWidth=Math.max(1,W/520);pathOf(ctx,t,0,t.length,W,H,live.S.scale);ctx.stroke();});
  ctx.globalCompositeOperation="source-over";live.base=off;if(force)live.prev=null;
}
function drawSky(){
  if(!live.base||!sky.width||!live.base.width||$("viewArena").hidden)return;const ctx=sky.getContext("2d"),W=sky.width,H=sky.height,L=live.S,T=arenaT(L.T);
  ctx.globalAlpha=1;ctx.drawImage(live.base,0,0);
  if(live.prev&&live.prev.width&&live.fade<1){ctx.globalAlpha=1-live.fade;ctx.drawImage(live.prev,0,0);ctx.globalAlpha=1;live.fade=Math.min(1,live.fade+.04);}
  const len=L.trails[0].length,head=reduceMotion?len-2:Math.floor(live.head)%len,tail=Math.min(head,360);
  ctx.globalCompositeOperation="lighter";ctx.lineCap="round";ctx.lineJoin="round";
  L.trails.forEach((t,i)=>{ctx.strokeStyle=T.pal.b[i];ctx.globalAlpha=.9;ctx.lineWidth=W/240;pathOf(ctx,t,Math.max(0,head-tail)&~1,(head&~1)+2,W,H,L.scale);ctx.stroke();});
  ctx.globalCompositeOperation="source-over";
  L.trails.forEach((t,i)=>{const h=head&~1,R=W*.42*L.scale,x=W/2+t[h]*R,y=H/2+t[h+1]*R;ctx.globalAlpha=.25;ctx.fillStyle=T.pal.b[i];ctx.beginPath();ctx.arc(x,y,W/36,0,7);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,W/100*Math.cbrt(L.m[i]),0,7);ctx.fill();});
  if(!reduceMotion)live.head+=7;
}

/* Arena fighters: original mascots Kitsu (fox) and Usa (hare) */
function fighterSVG(kind){
  const fox=kind==="fox";
  const gi=fox?"#B8322A":"#2E3F8F", giS=fox?"#7E1C16":"#1C2860", trim=fox?"#F2C14E":"#3FB68B", pants="#22152F", fur=fox?"#E8743B":"#E6E1EC", belt="#111";
  const tail=fox?`<path d="M120 232 Q36 252 40 182 Q46 138 84 148 Q64 192 122 214Z" fill="#E8743B" stroke="#5A2318" stroke-width="3"/><path d="M40 182 Q46 138 84 148 Q68 158 62 184Z" fill="#F8EEDB"/>`
    :`<circle cx="112" cy="236" r="15" fill="#F4F1F7" stroke="#8A8396" stroke-width="3"/>`;
  const head=fox?`
    <polygon points="58,74 46,14 96,58" fill="#E8743B" stroke="#5A2318" stroke-width="3"/><polygon points="64,66 56,30 86,58" fill="#5A2318"/>
    <polygon points="162,74 174,14 124,58" fill="#E8743B" stroke="#5A2318" stroke-width="3"/><polygon points="156,66 164,30 134,58" fill="#5A2318"/>
    <polygon points="110,170 46,100 58,62 162,62 174,100" fill="#E8743B" stroke="#5A2318" stroke-width="3"/>
    <polygon points="110,168 48,101 74,112 92,126" fill="#F8EEDB"/><polygon points="110,168 172,101 146,112 128,126" fill="#F8EEDB"/>
    <polygon points="58,62 162,62 168,76 52,76" fill="#C8372B"/>
    <path d="M166 70 Q190 64 204 82 M166 72 Q186 84 192 104" stroke="#C8372B" stroke-width="8" fill="none" stroke-linecap="round"/>
    <polygon points="68,94 96,90 90,103" fill="#1A0E10"/><polygon points="152,94 124,90 130,103" fill="#1A0E10"/>
    <circle cx="88" cy="96" r="2.2" fill="#F2C14E"/><circle cx="132" cy="96" r="2.2" fill="#F2C14E"/>
    <polygon points="110,160 101,148 119,148" fill="#1A0E10"/>`
   :`
    <ellipse cx="84" cy="26" rx="15" ry="46" fill="#E6E1EC" stroke="#4B4458" stroke-width="3" transform="rotate(-14 84 60)"/>
    <ellipse cx="84" cy="30" rx="7" ry="34" fill="#E7A3B5" transform="rotate(-14 84 60)"/>
    <path d="M128 66 Q140 0 168 -6 Q176 18 150 70Z" fill="#E6E1EC" stroke="#4B4458" stroke-width="3"/>
    <path d="M136 62 Q146 14 162 6 Q164 24 146 64Z" fill="#E7A3B5"/>
    <ellipse cx="110" cy="112" rx="58" ry="54" fill="#E6E1EC" stroke="#4B4458" stroke-width="3"/>
    <ellipse cx="80" cy="134" rx="22" ry="16" fill="#F7F4FA"/><ellipse cx="140" cy="134" rx="22" ry="16" fill="#F7F4FA"/>
    <path d="M54 80 Q110 62 166 80 L164 94 Q110 78 56 94Z" fill="#3FB68B" stroke="#1D6E50" stroke-width="2"/>
    <path d="M60 86 Q34 84 22 100 M60 88 Q40 100 36 118" stroke="#3FB68B" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M74 108 L98 114 L92 122 Z" fill="#1A0E10"/><path d="M146 108 L122 114 L128 122 Z" fill="#1A0E10"/>
    <circle cx="92" cy="116" r="2" fill="#fff"/><circle cx="128" cy="116" r="2" fill="#fff"/>
    <path d="M104 132 h12 l-6 7z" fill="#D9687F"/><path d="M110 139 v6 M110 145 q-7 6 -12 2 M110 145 q7 6 12 2" stroke="#4B4458" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M70 140 h-26 M72 146 l-24 6 M150 140 h26 M148 146 l24 6" stroke="#8A8396" stroke-width="2"/>`;
  return `<svg viewBox="0 0 300 340" aria-hidden="true"><ellipse cx="160" cy="330" rx="100" ry="10" fill="#000" opacity=".5"/>
  <g class="bob"><g class="all">
    ${tail}
    <path d="M122 236 L98 316 L128 320 L144 244Z" fill="${pants}" stroke="#000" stroke-width="3"/>
    <path d="M160 236 L198 312 L226 306 L184 232Z" fill="${pants}" stroke="#000" stroke-width="3"/>
    <ellipse cx="110" cy="320" rx="22" ry="9" fill="#120A0E"/><ellipse cx="216" cy="312" rx="22" ry="9" fill="#120A0E"/>
    <path d="M122 176 Q98 200 112 214" stroke="${gi}" stroke-width="24" stroke-linecap="round" fill="none"/>
    <circle cx="114" cy="214" r="14" fill="${fur}" stroke="#000" stroke-width="3"/>
    <path d="M108 160 Q150 146 192 160 L188 248 Q150 256 112 248Z" fill="${gi}" stroke="#000" stroke-width="3"/>
    <path d="M132 158 L152 216 L170 158Z" fill="${giS}"/>
    <path d="M132 158 L152 216 M170 158 L152 216" stroke="${trim}" stroke-width="6"/>
    <rect x="110" y="226" width="80" height="14" rx="3" fill="${belt}"/><path d="M150 238 l-9 28 h9 l4-20 4 20 h9 l-9-28z" fill="${belt}"/>
    <g class="farm"><path d="M184 172 Q214 178 226 192" stroke="${gi}" stroke-width="26" stroke-linecap="round" fill="none"/>
      <circle cx="234" cy="194" r="17" fill="${fur}" stroke="#000" stroke-width="3"/><path d="M226 186 v16" stroke="#0005" stroke-width="2.5"/></g>
    <g transform="translate(150 100) scale(.8) translate(-110 -100)">${head}</g>
  </g></g></svg>`;
}
function heroFor(id){if(!id)return 0;const n=equippedN(id);return n||1+parseInt(hash256("stand"+id).slice(0,8),16)%20000;}
function setFighter(el,id){
  const box=$(el),n=id?heroFor(id):(el==="faL"?1329:2415),key=n+"|"+id;if(box.dataset.k===key)return;box.dataset.k=key;
  box.innerHTML=Heroes.heroSVG(n,{background:false})+`<span class="plate">${id?short(id):"Waiting"}${id&&equippedN(id)?` (${Heroes.RARITIES[Heroes.rarityIdx(n)]})`:""}</span>`;
}
function animateFight(){
  if(reduceMotion)return;
  const L=$("faL"),R=$("faR");
  L.classList.remove("punch");R.classList.remove("hit");void L.offsetWidth;L.classList.add("punch");R.classList.add("hit");
}
function contactPoint(){
  const a=$("arena").getBoundingClientRect(),l=$("faL").getBoundingClientRect(),r=$("faR").getBoundingClientRect();
  return {x:(l.right+r.left)/2-a.left,y:l.top+l.height*.55-a.top};
}

const arenaT=T=>T.pal.light?{...T,pal:PALETTES[0]}:T;
/* Engine hooks */
function onGesture(id,added){
  if(booting)return;
  setLiveSeed(S.cycle.seed);bumpCombo();animateFight();
  const mine=id===ME;
  sparks(mine?26:12,mine?["#F2C14E","#FFF2C4","#C8372B"]:["#F4E9D0","#B6A6C9"]);
  shake(mine);SFX.play(mine?"hit":"tap");
  renderAll();
}
function onSettle(sum){
  if(booting)return;
  setLiveSeed(sum.seed);combo.n=0;hint={msg:"",err:false};
  announce(sum.final?"K.O.":"Time",true);SFX.play("gong");shake(true);sparks(40,["#F2C14E","#C8372B","#F4E9D0"]);
  setTimeout(()=>{renderKO();},1300);
  const mine=sum.awards.filter(a=>a.id===ME);
  if(mine.length)setTimeout(()=>{SFX.play("coin");toast(`You won round ${sum.id}: ${mine.map(a=>(RANKNAME[a.rank]||a.rank).toLowerCase()).join(", ")}.`);},1500);
  renderAll();
}
function roundOpened(){$("ko").classList.remove("on");hint={msg:"",err:false};announce(`Round ${S.cycle.id}`);announce("Fight!",true);SFX.play("fight");setLiveSeed(S.cycle.seed);renderAll();}

/* Wallet */
function renderWallet(){
  const w=$("wallet");
  if(!S.wallet){w.innerHTML=`<button class="btn btn-gold" id="connect">Connect<span class="long"> wallet</span></button>`;$("connect").onclick=connect;return;}
  w.innerHTML=`<div class="acct"><b>${ME}</b><small>${fmt(S.balances.get(ME))} NEAR</small></div><button class="btn btn-line" id="disc">Leave</button>`;
  $("disc").onclick=()=>{S.wallet=null;renderAll();};
}
// Actions the live layer (near/live.js) replaces with contract calls (local fallbacks, not used on the site).
function lockNft(){S.locks.set(ME,[{collection:"demo-collection.testnet",token:"2187"}]);stake=multOf(ME);toast("demo-collection.testnet #2187 locked. It counts as a pass.");log("You locked demo-collection.testnet #2187","me");renderAll();}
function equipHero(n){S.equipped.set(ME,n);return null;}
function connect(){if(LIVE){S.wantConnect=true;return toast("Loading wallets, one moment…");}S.wallet={id:ME};if(!S.balances.has(ME))S.balances.set(ME,25);SFX.init();toast("Demo wallet connected: 25 test NEAR.");renderAll();}
function mintPass(){const bal=S.balances.get(ME),price=passNear();if(bal<price){hint={msg:`You need ${fmt(price)} NEAR for the pass.`,err:true};return renderAll();}
  const n=(S.passes.get(ME)||0);if(n>=CFG.maxPasses)return;S.balances.set(ME,bal-price);S.passes.set(ME,n+1);S.treasury+=price;S.pstats.delete(ME);ps(ME);
  stake=multOf(ME);hint={msg:"",err:false};SFX.play("coin");toast(`Pass minted for ${fmt(price)} NEAR. You can play now.`);log(`You minted a Boundora Pass for ${fmt(price)} NEAR`,"me");renderAll();}
function doStrike(){
  if(!S.wallet){connect();return;}
  if(multOf(ME)<1){mintPass();return;}
  const err=gesture(ME,+(costFor(ME)*stake).toFixed(6));
  hint=err?{msg:err,err:true}:{msg:"Hit! You hold the final strike.",err:false};
  if(err)renderAll();
}
addEventListener("keydown",e=>{if(e.code==="Space"&&!["INPUT","TEXTAREA","BUTTON","DIALOG"].includes(document.activeElement.tagName)&&!$("dlg").open){e.preventDefault();doStrike();}});

/* Panels */
function heldOf(id){const c=S.cycle,p=findP(id);if(!p)return 0;let h=p.held;if(c.last===id)h+=Math.min(S.now,c.endsAt)-c.lastAt;return h;}
function renderPass(){
  const b=$("passBox");
  if(!S.wallet){b.innerHTML=`<h3>Your belt</h3><div class="belt">${beltSVG(0)}<div><b>Not connected</b><small>Connect a wallet to step into the dojo.</small></div></div>`;return;}
  const n=passTotal(ME),[,name]=beltOf(n),mult=multOf(ME);stake=Math.max(1,Math.min(stake,Math.max(1,mult)));
  const locked=(S.locks.get(ME)||[]).length;
  b.innerHTML=`<h3>Your belt</h3>${n?"":`<div class="belt">${beltSVG(n)}<div><b>${name}</b><small>${n?`Pass${locked?` + ${locked} locked NFT`:""}`:"You need a pass to play. It costs ${passLabel()}. It stays yours forever."}</small></div></div>`}
    ${hasPass(ME)?(()=>{const q=ps(ME);return `<div class="passcard"><div class="pc-h"><b>Boundora Pass</b><span class="tag sb">Soulbound</span></div><small>Token <code>pass-${ME}</code></small>
      <div class="hnums"><div><small>Member since</small><b>Round ${q.joinedRound}</b></div><div><small>Rounds</small><b>${q.rounds}</b></div><div><small>Strikes</small><b>${q.strikes}</b></div><div><small>Best finish</small><b>${FINISH[q.best]}</b></div></div></div>`;})():""}
    <div class="chi" style="grid-template-columns:repeat(${CFG.maxMult},1fr)" role="group" aria-label="Chi: stake multiplier">${Array.from({length:CFG.maxMult},(_,i)=>`<button data-i="${i+1}" class="${i<mult?"unl":""} ${i<stake&&mult?"sel":""}" ${i<mult?"":"disabled"} aria-label="Chi ${i+1}×${i<mult?"":", locked"}" aria-pressed="${i<stake&&mult>0}"></button>`).join("")}</div>
    <div class="chilab"><span>Chi</span><b>${mult?stake:0}× of ${mult}× unlocked</b></div>
    <div class="links">${(S.passes.get(ME)||0)<CFG.maxPasses?`<button class="btn btn-line" id="mintMore">Mint your pass: ${passLabel()}</button>`:""}${locked||!hasPass(ME)?"":`<button class="btn btn-line" id="lock">Lock an NFT for +1 chi</button>`}</div>`;
  b.querySelectorAll(".chi button").forEach(x=>x.onclick=()=>{stake=+x.dataset.i;renderAll();});
  if($("mintMore"))$("mintMore").onclick=mintPass;
  if($("lock"))$("lock").onclick=()=>lockNft();
}
// NEAR testnet explorer links: make the on-chain NFTs and accounts checkable
const EXPLORER="https://testnet.nearblocks.io";
const exAcct=a=>`${EXPLORER}/address/${a}`,exNft=n=>`${EXPLORER}/nft-token/${CONTRACT_ID}/hero-${n}`;
const xlink=(href,text)=>`<a class="xl" href="${href}" target="_blank" rel="noopener">${text} &#8599;</a>`;
const FAUCET="https://near-faucet.io";
function needNear(){if(!S.wallet)return 0;const need=multOf(ME)<1?passNear():costFor(ME)*stake;return (S.balances.get(ME)||0)<need+0.01?need:0;}
function renderStrike(){
  const b=$("strikeBox"),c=S.cycle,cool=S.now<c.opensAt,over=c.status==="awaiting_finalize";
  let label,sub,cls="strike";
  if(!S.wallet){label="Enter the dojo";sub=LIVE?"Connect your NEAR wallet":"Connect a demo wallet";cls+=" gold";}
  else if(multOf(ME)<1){label="Mint your pass";sub=`${passLabel()}, required to play`;cls+=" gold";}
  else if(over){label="Start round "+(c.id+1);sub=`Settles round ${c.id}, no NEAR needed`;}
  else if(cool){label="Between rounds";sub=`Round ${c.id} opens soon`;}
  else{label="Strike!";sub=`${fmt(costFor(ME)*stake)} NEAR at ${stake}× chi`;}
  b.innerHTML=`<button class="${cls}" id="strikeBtn" ${cool&&S.wallet&&multOf(ME)>0?"disabled":""}>${label}<small>${sub}</small></button>
    ${needNear()?`<p class="hint err">You need about ${fmt(needNear())} test NEAR to play. ${xlink(FAUCET,"Get free test NEAR")}</p>`:""}<p class="hint ${hint.err?"err":""}">${hint.msg||(S.wallet&&multOf(ME)>0?`Adds ${CFG.ext+fxOf(ME)[0]}s.<span class="kbdhint"> Press <span class="kbd">Space</span></span>`:(LIVE?"Connect a wallet and mint your pass to fight.":"Seven sparring partners are already fighting."))}</p>`;
  $("strikeBtn").onclick=doStrike;
}
function renderMe(){
  const b=$("meBox"),c=S.cycle,p=findP(ME),cl=S.wallet?(S.claimable.get(ME)||0):0;
  const rank=p?[...c.players].sort((a,b)=>b.volume-a.volume).findIndex(x=>x.id===ME)+1:0;
  b.innerHTML=`<h3>Your round</h3>
    <div class="stat"><span>Staked</span><b>${fmt(p?.volume||0)} NEAR</b></div>
    <div class="stat"><span>Strikes</span><b>${p?.gestures||0}</b></div>
    <div class="stat"><span>Time holding</span><b>${heldOf(ME).toFixed(0)}s</b></div>
    <div class="stat"><span>Volume rank</span><b>${rank?"#"+rank:"Not fighting yet"}</b></div>
    ${cl>0?`<div class="claim"><div><b>${fmt(cl)} NEAR</b><small style="display:block;color:var(--mist)">Winnings to claim</small></div><button class="btn btn-gold" id="claim">Claim</button></div>`:""}`;
  if($("claim"))$("claim").onclick=()=>{const a=claim(ME);SFX.play("coin");toast(`Claimed ${fmt(a)} NEAR.`);renderAll();};
}
function fighterHTML(id,role,pct,jade){
  if(!id)return `<span class="crest" style="opacity:.35">${crest("empty")}</span><div><div class="nm">Open spot</div><div class="role">${role}</div><div class="bar"><i class="trail"></i><i class="fill"></i></div></div>`;
  return `<span class="crest">${crest(id)}</span><div style="min-width:0"><div class="nm">${short(id)}</div><div class="role">${role}</div><div class="bar ${jade?"jade":""}"><i class="trail" style="width:${pct}%"></i><i class="fill" style="width:${pct}%"></i></div></div>`;
}
let hudKey="";
function renderHud(){
  const c=S.cycle,cool=S.now<c.opensAt;
  const over=c.status==="awaiting_finalize";
  $("roundLbl").textContent=over?`Round ${c.id} is over`:cool?`Round ${c.id} next`:`Round ${c.id}`;
  const rem=cool?c.opensAt-S.now:Math.max(0,c.endsAt-S.now);
  const m=Math.floor(rem/60),s=Math.floor(rem%60);
  $("digits").textContent=over?"Strike!":!cool&&rem<10?`${s}.${Math.floor(rem*10)%10}`:`${m}:${String(s).padStart(2,"0")}`;
  $("digits").classList.toggle("hot",!over&&!cool&&rem<10);
  $("timebar").style.width=(cool?0:Math.min(100,rem/CFG.maxRemain*100))+"%";
  $("pot").textContent=fmt(c.pool);
  // left: final-strike holder (bar = hold time); right: top challenger by stake
  const players=c.players.map(p=>({...p,h:heldOf(p.id)}));
  const maxH=Math.max(20,...players.map(p=>p.h)),maxV=Math.max(1e-9,...players.map(p=>p.volume));
  const holder=c.last,hp=players.find(p=>p.id===holder);
  const chall=players.filter(p=>p.id!==holder).sort((a,b)=>b.volume-a.volume)[0];
  const lp=hp?Math.round(hp.h/maxH*100):0,rp=chall?Math.round(chall.volume/maxV*100):0;
  const key=[holder,lp,chall?.id,rp].join("|");if(key===hudKey)return;hudKey=key;
  setFighter("faL",holder);setFighter("faR",chall?chall.id:null);
  const L=$("fL"),R=$("fR");
  if(L.dataset.id!==String(holder)){L.innerHTML=fighterHTML(holder,"Holds final strike",lp,true);L.dataset.id=String(holder);}
  else{L.querySelectorAll(".bar i").forEach(i=>i.style.width=lp+"%");}
  if(R.dataset.id!==String(chall?.id)){R.innerHTML=fighterHTML(chall?.id,"Top challenger",rp,false);R.dataset.id=String(chall?.id);}
  else{R.querySelectorAll(".bar i").forEach(i=>i.style.width=rp+"%");}
}
function renderKO(){
  const sum=S.lastSettled,ko=$("ko");if(!sum||S.now>=S.cycle.opensAt)return;
  const cards=sum.awards.filter(a=>a.art.length).map((a,i)=>{const h=a.art[0],r=RCLS[h.r];return `<div class="lc"><div class="in" style="animation-delay:${i*90}ms"><div class="rar ${r}">${Heroes.heroSVG(h.n)}</div>
    <div class="who">${short(a.id)}</div><small>${RANKNAME[a.rank]}, ${Heroes.RARITIES[h.r]}${a.amount?`, ${fmt(a.amount)} NEAR`:""}</small></div></div>`;}).join("");
  ko.innerHTML=`<div class="ko-card"><h2>${sum.final?(sum.final===ME?"You land the final strike!":`${short(sum.final)} lands the final strike`):"Nobody fought this round"}</h2>
    <p>Round ${sum.id}: ${fmt(sum.pool)} NEAR pot, ${sum.gestures} strike${sum.gestures===1?"":"s"}, ${sum.players} fighter${sum.players===1?"":"s"}. ${fmt(sum.rolled)} NEAR carries into round ${sum.id+1}.</p>
    <div class="loot">${cards}</div><div class="next" id="nextIn"></div></div>`;
  ko.classList.add("on");
}
function renderRoster(){
  const c=S.cycle;
  if(!c.players.length){$("roster").innerHTML=`<p class="empty">${S.now<c.opensAt?"Fighters are bowing in for the next round.":"The mat is empty. Strike first to start the clock."}</p>`;return;}
  const rows=c.players.map(p=>({...p,h:heldOf(p.id)})).sort((a,b)=>b.volume-a.volume);
  const champ=rows.filter(r=>r.id!==c.last&&r.h>0).sort((a,b)=>b.h-a.h)[0];
  $("roster").innerHTML=rows.map((r,i)=>`<div class="fr ${r.id===ME?"me":""}"><span class="pos">${i+1}</span>${crest(r.id)}
    <div><b>${short(r.id)}${r.id===c.last?'<span class="badge f">Final strike</span>':""}${champ&&r.id===champ.id?'<span class="badge e">Iron stance</span>':""}${i<CFG.volumeWinners?'<span class="badge v">Chi master</span>':""}</b>
    <small>${titleOf(r.id)}, ${beltOf(passTotal(r.id))[1].toLowerCase()}</small></div>
    <div class="num">${fmt(r.volume)} NEAR<small>${r.gestures} strike${r.gestures>1?"s":""}, ${r.h.toFixed(0)}s held</small></div></div>`).join("");
}
function ago(t){const d=Math.max(0,S.now-t);return d<5?"now":d<60?`${Math.floor(d)}s ago`:`${Math.floor(d/60)}m ago`;}
function renderLog(){$("log").innerHTML=S.feed.slice(0,30).map(f=>`<li class="${f.cls}"><div>${f.msg}</div><span>${ago(f.t)}</span></li>`).join("")||`<li>Waiting for the first strike.</li>`;}
/* Hero cards, collection, mint, equip */
const SNOW='<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M9 3l3 3 3-3M9 21l3-3 3 3" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
function heroCard(n,extra){
  const t=Heroes.traits(n),r=RCLS[t.rarityIdx],o=S.heroOwner.get(n),eq=o&&S.equipped.get(o)===n;
  return `<button class="hcard ${o?"":"unminted"}" data-n="${n}"><div class="rar ${r}">${Heroes.heroSVG(n)}</div>
    <b>#${n} ${t.name}</b><small><span class="rtag ${r}">${t.rarity}</span> ${o?short(o):"Not minted"}${S.listings&&S.listings.get(n)&&extra!=="nolist"?` <span style="color:var(--gold)">${fmt(S.listings.get(n).price)} NEAR</span>`:""}${eq&&o===ME?'<span class="eqtag">Equipped</span>':""}</small></button>`;
}
function bindCards(root){root.querySelectorAll(".hcard").forEach(b=>b.onclick=()=>openHero(+b.dataset.n));}
let filter="minted",rfilter="",page=0,vaultKey="";
function collectionList(){
  let list;
  if(filter==="all"){list=[];for(let n=1;n<=20000;n++)if(rfilter===""||Heroes.rarityIdx(n)==rfilter)list.push(n);}
  else{list=S.art.filter(a=>filter==="minted"||a.owner===ME).map(a=>a.n);if(rfilter!=="")list=list.filter(n=>Heroes.rarityIdx(n)==rfilter);}
  return list;
}
function renderVault(force){
  const list=collectionList(),per=24,pages=Math.max(1,Math.ceil(list.length/per));page=Math.min(page,pages-1);
  const slice=list.slice(page*per,page*per+per),key=[filter,rfilter,page,slice.join(),S.art.length,[...S.equipped.values()].join(),S.statsVer].join("|");
  if(key===vaultKey&&!force)return;vaultKey=key;
  $("vault").innerHTML=slice.length?slice.map(n=>heroCard(n)).join(""):`<p class="empty">${filter==="mine"?"No heroes yet. Mint one above, or win one in the arena.":"Nothing matches that filter yet."}</p>`;
  bindCards($("vault"));
  $("pager").innerHTML=pages>1?`<button class="btn btn-line" id="pgPrev" ${page?"":"disabled"}>Previous</button><span>Page ${page+1} of ${pages.toLocaleString()} (${list.length.toLocaleString()} heroes)</span><button class="btn btn-line" id="pgNext" ${page<pages-1?"":"disabled"}>Next</button>`:"";
  if($("pgPrev"))$("pgPrev").onclick=()=>{page--;renderVault();};
  if($("pgNext"))$("pgNext").onclick=()=>{page++;renderVault();};
}
document.querySelectorAll(".chip[data-f]").forEach(ch=>ch.onclick=()=>{filter=ch.dataset.f;page=0;document.querySelectorAll(".chip[data-f]").forEach(x=>x.setAttribute("aria-pressed",x===ch));renderVault();});
$("rfilter").onchange=e=>{rfilter=e.target.value;page=0;renderVault();};
$("findN").onkeydown=e=>{if(e.key==="Enter"){const n=+e.target.value;if(n>=1&&n<=20000)openHero(n);else toast("Hero numbers run from 1 to 20,000.");}};

function renderPowers(){
  $("powers").innerHTML=Heroes.RARITIES.map((r,i)=>`<div class="pw"><span class="rtag ${RCLS[i]}">${r}</span><span class="cnt">${SUPPLY_BY[i].toLocaleString()}</span><p>${Heroes.POWERS[i]}</p></div>`).join("");
}
function renderMint(){
  const minted=S.heroMinted.reduce((a,b)=>a+b,0),mine=S.heroMints.get(ME)||0;
  const cols=["#F4E9D0","#3FB68B","#A77BF0","#F2C14E","#B48CFF"];
  $("mintBox").innerHTML=`<h3>Mint a hero</h3><p style="margin:0;color:var(--mist)">${minted.toLocaleString()} of 20,000 minted.</p>
    <div class="supply">${Heroes.RARITIES.map((r,i)=>`<div class="sup"><span>${r}</span><div class="track"><i style="width:${Math.max(.6,S.heroMinted[i]/SUPPLY_BY[i]*100)}%;background:${cols[i]}"></i></div><small>${S.heroMinted[i].toLocaleString()} / ${SUPPLY_BY[i].toLocaleString()}</small></div>`).join("")}</div>
    <button class="strike gold" id="mintHeroBtn" style="font-size:1.3rem;padding:14px">${S.wallet?(mine>=CFG.maxHeroMints?"Mint limit reached":`Mint a hero`):"Connect to mint"}<small>${S.wallet?`${CFG.heroPrice} NEAR, ${CFG.maxHeroMints-mine} left for you`:(LIVE?"NEAR testnet":"Demo wallet, test NEAR")}</small></button>`;
  $("mintHeroBtn").disabled=!!S.wallet&&mine>=CFG.maxHeroMints;
  $("mintHeroBtn").onclick=mintHero;
}
function mintHero(){
  if(!S.wallet){connect();return;}
  const mine=S.heroMints.get(ME)||0,bal=S.balances.get(ME);
  if(mine>=CFG.maxHeroMints)return;
  if(bal<CFG.heroPrice){toast(`You need ${CFG.heroPrice} NEAR to mint.`);return;}
  const rem=SUPPLY_BY.map((s,i)=>s-S.heroMinted[i]),left=rem.reduce((a,b)=>a+b,0);if(!left){toast("All 20,000 heroes are minted.");return;}
  let x=Math.random()*left,r=0;for(;r<5;r++){if((x-=rem[r])<0)break;}
  const a=takeHero(ME,r,"Public mint");S.balances.set(ME,bal-CFG.heroPrice);S.treasury+=CFG.heroPrice;S.heroMints.set(ME,mine+1);
  if(!equippedN(ME))S.equipped.set(ME,a.n);
  log(`You minted hero #${a.n} (${Heroes.RARITIES[a.r]})`,"me");SFX.play(a.r>=3?"gong":"coin");
  renderAll();openHero(a.n,true);
}
function renderMyHeroes(){
  const mine=[...S.heroOwner].filter(([,o])=>o===ME).map(([n])=>n).sort((a,b)=>Heroes.rarityIdx(b)-Heroes.rarityIdx(a));
  const eq=equippedN(ME);
  $("myHeroes").innerHTML=`<h3>Your heroes</h3>${!S.wallet?`<p class="empty">Connect a wallet to see your heroes.</p>`:mine.length?`<p style="margin:0;color:var(--mist)">${eq?`Equipped: #${eq}. ${Heroes.POWERS[Heroes.rarityIdx(eq)]}.`:"Tap a hero to equip it."}${(()=>{const v=mine.reduce((t,n)=>t+((S.hstats.get(n)||{}).vault||0),0);return v>0?` Your heroes hold <b>${fmt(v)} NEAR</b> in their own vaults.`:"";})()}</p><div class="owned">${mine.slice(0,12).map(n=>heroCard(n)).join("")}</div>`:`<p class="empty">No heroes yet. Mint one, or win one: the final strike earns a Legendary.</p>`}`;
  bindCards($("myHeroes"));
}
function openHero(n,fresh){
  const t=Heroes.traits(n),r=RCLS[t.rarityIdx],o=S.heroOwner.get(n),eq=o&&equippedN(o)===n,md=Heroes.metadata(n);
  $("dlgFrame").className="rar "+r;$("dlgArt").innerHTML=Heroes.heroSVG(n);
  $("dlgH").textContent=`${fresh?"You minted ":""}${t.name}`;
  $("dlgSub").innerHTML=`Boundora Hero #${n} <span class="rtag ${r}">${t.rarity}</span>`;
  $("dlgStars").innerHTML=Array.from({length:5},(_,i)=>`<span style="color:${i<=t.rarityIdx?"#6FF3FF":"#3A2754"}">${SNOW}</span>`).join("");
  $("dlgMight").innerHTML=`<span class="might">Might ${t.might.toLocaleString()}</span>`;
  $("dlgPower").innerHTML=`<b>Power when equipped</b><br>${t.power}`;
  $("dlgT").innerHTML=md.attributes.filter(x=>x.trait_type!=="Rarity").map(x=>`<dt>${x.trait_type}</dt><dd>${x.value}</dd>`).join("")+`<dt>Owner</dt><dd>${o||"Not minted yet"}</dd>${S.listings.get(n)?`<dt>For sale</dt><dd>${fmt(S.listings.get(n).price)} NEAR</dd>`:""}<dt>Token</dt><dd>hero-${n}, NEP-171, 5% royalty</dd>`;
  const act=$("dlgAct"),lst=S.listings.get(n);let h="";
  if(o===ME){
    h+=eq?`<span class="eqtag" style="font-size:.9rem;padding:4px 10px">Equipped</span> `:`<button class="btn btn-gold" id="equipBtn">Equip</button> `;
    h+=lst?`<button class="btn btn-line" id="dlgDelist">Delist (${fmt(lst.price)} NEAR)</button> `:`<button class="btn btn-line" id="dlgSell">Sell</button> `;
  }else if(lst){h+=`<button class="btn btn-gold" id="dlgBuy">Buy for ${fmt(lst.price)} NEAR</button> `;}
  act.innerHTML=h;
  if($("equipBtn"))$("equipBtn").onclick=()=>{S.equipped.set(ME,n);SFX.play("coin");toast(`Equipped #${n}. ${t.power}.`);log(`You equipped hero #${n}`,"me");$("dlg").close();renderAll();};
  if($("dlgSell"))$("dlgSell").onclick=()=>{sellN=n;$("dlg").close();go("/market");renderMarket(true);$("sellBox").scrollIntoView({behavior:"smooth"});};
  if($("dlgDelist"))$("dlgDelist").onclick=()=>{delistHero(ME,n);toast(`Hero #${n} delisted.`);$("dlg").close();renderAll();};
  if($("dlgBuy"))$("dlgBuy").onclick=()=>{$("dlg").close();doBuy(n);};
  if(!$("dlg").open)$("dlg").showModal();
}
$("dlgClose").onclick=()=>$("dlg").close();
$("dlg").addEventListener("click",e=>{if(e.target===$("dlg"))$("dlg").close();});

/* Market view */
let mkMine=false,mkR="",mkSort="low",sellN=0,mkKey="";
function floorOf(r){let m=Infinity;for(const[n,l]of S.listings)if(Heroes.rarityIdx(n)===r)m=Math.min(m,l.price);return m;}
function renderMarket(force){
  if($("viewMarket").hidden&&!force)return;
  const key=[S.listings.size,S.sales.length,mkMine,mkR,mkSort,sellN,S.wallet?1:0,[...S.heroOwner].filter(([,o])=>o===ME).length,Math.round(S.balances.get(ME)||0)].join("|");
  if(key===mkKey&&!force)return;mkKey=key;
  if(!$("mkPeek").innerHTML)$("mkPeek").innerHTML=Heroes.heroSVG(Heroes.numberFor(4,7),{background:false});
  const vol=S.volume,owners=new Set(S.heroOwner.values()).size;
  $("mkStats").innerHTML=`<div class="mk-stat"><small>Listed now</small><b>${S.listings.size}</b></div><div class="mk-stat"><small>Volume traded</small><b>${fmt(vol)} NEAR</b></div>
    <div class="mk-stat"><small>Heroes minted</small><b>${S.heroMinted.reduce((a,b)=>a+b,0).toLocaleString()}</b></div><div class="mk-stat"><small>Owners</small><b>${owners}</b></div>`;
  $("mkFloors").innerHTML=Heroes.RARITIES.map((r,i)=>{const f=floorOf(i);return `<div class="floor"><span class="rtag ${RCLS[i]}">${r}</span><b>${isFinite(f)?fmt(f)+" NEAR":"No listings"}</b><small>Floor price</small></div>`;}).join("");
  // listings
  let L=[...S.listings].map(([n,l])=>({n,...l}));
  if(mkMine)L=L.filter(x=>x.seller===ME);if(mkR!=="")L=L.filter(x=>Heroes.rarityIdx(x.n)==mkR);
  L.sort(mkSort==="low"?(a,b)=>a.price-b.price:mkSort==="high"?(a,b)=>b.price-a.price:(a,b)=>b.at-a.at);
  $("mkList").innerHTML=L.length?L.slice(0,36).map(x=>`<div class="lcard">${heroCard(x.n,"nolist")}<div class="price"><b>${fmt(x.price)} NEAR</b>${x.seller===ME?`<button class="btn btn-line" data-delist="${x.n}">Delist</button>`:`<button class="btn btn-gold" data-buy="${x.n}">Buy</button>`}</div></div>`).join("")
    :`<p class="empty">${mkMine?"You have no heroes listed. Pick one in the sell panel.":"Nothing listed with these filters yet."}</p>`;
  bindCards($("mkList"));
  $("mkList").querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>doBuy(+b.dataset.buy));
  $("mkList").querySelectorAll("[data-delist]").forEach(b=>b.onclick=()=>{delistHero(ME,+b.dataset.delist);toast(`Hero #${b.dataset.delist} delisted.`);renderAll();});
  // sell panel
  const mine=[...S.heroOwner].filter(([n,o])=>o===ME&&!S.listings.has(n)).map(([n])=>n).sort((a,b)=>Heroes.rarityIdx(b)-Heroes.rarityIdx(a));
  if(!mine.includes(sellN))sellN=mine[0]||0;
  const passHTML="";
  if(!S.wallet)$("sellBox").innerHTML=`<h3>Sell a hero</h3><p class="empty">Connect a wallet to list your heroes.</p><button class="btn btn-gold" id="mkConnect">Connect wallet</button>${passHTML}`;
  else if(!mine.length)$("sellBox").innerHTML=`<h3>Sell a hero</h3><p class="empty">No heroes to sell yet.</p>${passHTML}`;
  else{
    const r=Heroes.rarityIdx(sellN),f=floorOf(r),sug=isFinite(f)?Math.max(.01,f*.98):PRICE_BAND[r][0]*1.2;
    $("sellBox").innerHTML=`<h3>Sell a hero</h3>
      <label for="sellPick">Hero</label><select id="sellPick">${mine.map(n=>`<option value="${n}" ${n===sellN?"selected":""}>#${n} ${Heroes.traits(n).name} (${Heroes.RARITIES[Heroes.rarityIdx(n)]})${equippedN(ME)===n?", equipped":""}</option>`).join("")}</select>
      <div class="sellprev"><div class="rar ${RCLS[r]}">${Heroes.heroSVG(sellN)}</div><div><b>${Heroes.traits(sellN).name}</b><br><small style="color:var(--mist)">${Heroes.POWERS[r]}</small></div></div>
      <label for="sellPrice">Price in NEAR</label><input id="sellPrice" type="number" min="0.01" step="0.01" value="${sug.toFixed(2)}">
      <div class="youget" id="youGet"></div>
      ${equippedN(ME)===sellN?`<div class="youget">This hero is equipped. If it sells, its power stops working for you.</div>`:""}
      <button class="strike gold" id="listBtn" style="font-size:1.2rem;padding:12px;margin-top:12px">List for sale<small>${isFinite(f)?`${Heroes.RARITIES[r]} floor is ${fmt(f)} NEAR`:`No ${Heroes.RARITIES[r]} listed yet`}</small></button>
      <div class="or"><span>or</span></div>
      <label for="aucDur">Auction: the highest bid wins automatically</label>
      <select id="aucDur"><option value="120">Ends in 2 minutes</option><option value="300" selected>Ends in 5 minutes</option><option value="900">Ends in 15 minutes</option></select>
      <button class="btn ice stack" id="aucBtn" style="width:100%;margin-top:12px">Start auction<small>The price above becomes the reserve (minimum)</small></button>${passHTML}`;
    const upd=()=>{const p=+$("sellPrice").value||0;$("youGet").innerHTML=`You get <b>${fmt(p*(1-ROYALTY))} NEAR</b> after the 5% royalty.`;};upd();
    $("sellPrice").oninput=upd;$("sellPick").onchange=e=>{sellN=+e.target.value;renderMarket(true);};
    $("listBtn").onclick=()=>{const p=+$("sellPrice").value;const err=listHero(ME,sellN,p);if(err){toast(err);return;}SFX.play("coin");toast(`Hero #${sellN} listed for ${fmt(p)} NEAR.`);sellN=0;renderAll();};
    $("aucBtn").onclick=()=>{const p=+$("sellPrice").value||0,d=+$("aucDur").value;const err=startAuction(ME,sellN,d,p);if(err){toast(err);return;}SFX.play("fight");toast(`Auction started for hero #${sellN}. Highest bid at or above ${fmt(p)} NEAR wins.`);sellN=0;renderAll();};
  }
  if($("mkConnect"))$("mkConnect").onclick=connect;
  $("mkSales").innerHTML=S.sales.slice(0,10).map(x=>`<li><div class="rar ${RCLS[Heroes.rarityIdx(x.n)]}" style="padding:2px;border-radius:7px">${Heroes.heroSVG(x.n,{background:false})}</div><div>#${x.n} to ${short(x.buyer)}<small>from ${short(x.seller)}, ${ago(x.at)}</small></div><b>${fmt(x.price)}</b></li>`).join("")||`<li style="display:block;color:var(--mist)">No sales yet.</li>`;
}
function doBuy(n){
  if(!S.wallet){connect();return;}
  const l=S.listings.get(n);if(!l)return;
  const err=buyHero(ME,n);if(err){toast(err);return;}
  SFX.play("gong");toast(`You bought hero #${n} for ${fmt(l.price)} NEAR.`);if(!equippedN(ME))S.equipped.set(ME,n);renderAll();openHero(n);
}
document.querySelectorAll(".chip[data-m]").forEach(ch=>ch.onclick=()=>{mkMine=ch.dataset.m==="mine";document.querySelectorAll(".chip[data-m]").forEach(x=>x.setAttribute("aria-pressed",x===ch));renderMarket(true);});
$("mkR").onchange=e=>{mkR=e.target.value;renderMarket(true);};
$("mkSort").onchange=e=>{mkSort=e.target.value;renderMarket(true);};
function route(){
  const m=location.hash==="#market";$("viewArena").hidden=m;$("viewMarket").hidden=!m;
  $("navArena").setAttribute("aria-current",m?"false":"page");$("navMarket").setAttribute("aria-current",m?"page":"false");
  if(m){renderMarket(true);}else{sizeSky();sizeFx();setLiveSeed(live.seed||S.cycle.seed,true);}
}
// navigation is handled by go()/popstate in overrides.js

function renderAll(){const f=document.activeElement&&document.activeElement.id;
  renderWallet();renderPass();renderStrike();renderMe();renderRoster();renderLog();renderMint();renderMyHeroes();renderVault();renderMarket();hudKey="";renderHud();
  if(f&&$(f)&&document.activeElement!==$(f))$(f).focus();}

/* Boot: two rounds fought instantly so the vault has history */
newCycle(1,0,0,hash256("boundora-genesis"));
if(!LIVE)while(S.history.length<2){S.now+=0.5;botsTick(0.5);settleIfEnded();}
S.feed=S.feed.filter(f=>f.cls==="sys");
S.now=S.cycle.opensAt+0.5;S.lastSettled=null;
booting=false;renderMute();
setFighter("faL",null);setFighter("faR",null);renderPowers();
if(!LIVE){
for(const b of BOTS)equipBest(b.id);
// seed the market: bots mint a few spare heroes and list them
for(const b of BOTS){for(let i=0;i<4;i++){const rem=SUPPLY_BY.map((x,j)=>x-S.heroMinted[j]),left=rem.reduce((a,c)=>a+c,0);let x=Math.random()*left,r=0;for(;r<5;r++){if((x-=rem[r])<0)break;}takeHero(b.id,r,"Public mint");}equipBest(b.id);}
for(const b of BOTS){const spare=[...S.heroOwner].filter(([n,o])=>o===b.id&&equippedN(b.id)!==n).map(([n])=>n);for(const n of spare.slice(0,3)){const[lo,hi]=PRICE_BAND[Heroes.rarityIdx(n)];listHero(b.id,n,lo+Math.random()*(hi-lo));}}
for(let i=0;i<5;i++){const ls=[...S.listings];if(!ls.length)break;const[n,l]=ls[Math.floor(Math.random()*ls.length)];const pool=BOTS.map(b=>b.id).filter(x=>x!==l.seller);buyHero(pool[Math.floor(Math.random()*pool.length)],n);}
}
S.feed=S.feed.filter(f=>f.cls==="sys");
sizeSky();sizeFx();addEventListener("resize",()=>{clearTimeout(sizeSky.h);sizeSky.h=setTimeout(()=>{sizeSky();sizeFx();},150);});
setLiveSeed(S.cycle.seed,true);renderAll();
route();
setTimeout(()=>{announce(`Round ${S.cycle.id}`);announce("Fight!",true);},400);

let last=performance.now(),acc=0,slow=0,wasCool=false;
function frame(t){
  const dt=Math.min(.25,(t-last)/1000);last=t;S.now+=dt;acc+=dt;
  if(acc>=.1){botsTick(acc);acc=0;if(!LIVE&&S.now>=S.cycle.endsAt)settleIfEnded();
    const cool=S.now<S.cycle.opensAt;
    if(wasCool&&!cool)roundOpened();
    if(!wasCool&&cool){renderStrike();}
    wasCool=cool;
    if(!LIVE&&Math.random()<.012)botMarketTick();
    if(S.now-slow>1){slow=S.now;if(!LIVE)S.nearUsd=Math.max(.5,S.nearUsd*(1+(Math.random()-.5)*.002));renderMarket();const f=document.activeElement&&document.activeElement.id;renderRoster();renderLog();renderMe();if(f&&$(f)&&document.activeElement!==$(f))$(f).focus();}
    if(cool&&$("nextIn"))$("nextIn").textContent=`Round ${S.cycle.id} starts in ${Math.ceil(S.cycle.opensAt-S.now)}`;
  }
  renderHud();drawSky();drawFx();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
