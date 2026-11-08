/* Boundora Heroes: generator for the 20,000-hero collection (renderer "boundora-heroes-v1").
   Hero number N (1..20000) always produces the same hero. Rarity follows the contract's
   schedule exactly: p = (7919·(N-1) + 3571) mod 20000, banded into Common..Mythic.
   Works in the browser (window.Heroes) and in Node (module.exports). */
(function (root) {
  "use strict";
  const SUPPLY = 20000, A = 7919, B = 3571;
  const RARITIES = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
  const BANDS = [[11600, 20000], [6000, 11600], [2600, 6000], [800, 2600], [0, 800]];
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
    return ((17679 * ((p + SUPPLY - B) % SUPPLY)) % SUPPLY) + 1;
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
    if (opts.noHero) { out.push(`</svg>`); return out.join(""); }
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

  const api = { SUPPLY, RARITIES, POWERS, POWER_FX, BANDS, rarityIdx, numberFor, traits, heroSVG, metadata, SKIN, HAIR, COATS, FURS, MATERIAL };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Heroes = api;
})(typeof window !== "undefined" ? window : globalThis);
