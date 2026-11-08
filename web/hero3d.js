/* Boundora Heroes 3D (renderer "boundora-heroes-3d-v1").
   Builds a toon-shaded, outlined 3D hero from the same traits as heroes.js, so hero #N
   looks the same everywhere. Exposes window.Hero3D:
     thumb(N)                -> Promise<dataURL> (cached), transparent PNG of the hero
     Viewer(canvas, N)       -> turntable with drag-to-rotate (profile dialog)
     Stage(canvas, slots)    -> live scene of several heroes (landing lineup, arena) */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js";

const H = window.Heroes;
const INK = new THREE.Color("#14203A");

/* ---------- materials ---------- */
const gradient = (() => {
  const d = new Uint8Array([125, 125, 190, 190, 240, 240, 255, 255]);
  const t = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const matCache = new Map();
function toon(hex, emissive, emissiveIntensity) {
  const k = hex + (emissive || "") + (emissiveIntensity || "");
  if (!matCache.has(k)) {
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: gradient });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity ?? 0.6; }
    matCache.set(k, m);
  }
  return matCache.get(k);
}
const outlineMat = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.022 }, color: { value: INK } },
  vertexShader: "uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
  fragmentShader: "uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }",
  side: THREE.BackSide
});
const glowMat = (hex, o = .85) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: o, depthWrite: false });

/* ---------- helpers ---------- */
function part(group, geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.s) m.scale.set(...o.s);
  if (o.outline !== false) { const ol = new THREE.Mesh(geo, outlineMat); m.add(ol); }
  group.add(m); return m;
}
function limb(group, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const len = Math.max(0.001, d.length() - 2 * r);
  const m = part(group, new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.position.copy(A.clone().add(B).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const shade = (hex, f) => { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + f))); return "#" + c.getHexString(); };

const BUILD3 = {
  Scout:  { w: .64, h: .62, head: .50, leg: .30, arm: .12, hand: .13 },
  Ranger: { w: .64, h: .78, head: .44, leg: .40, arm: .12, hand: .13 },
  Brute:  { w: .98, h: .86, head: .40, leg: .32, arm: .22, hand: .21 },
  Smith:  { w: .84, h: .72, head: .45, leg: .30, arm: .18, hand: .18 },
  Seer:   { w: .68, h: 1.0, head: .44, leg: 0,   arm: .12, hand: .13 }
};

/* ---------- the hero ---------- */
function buildHero(N) {
  const t = H.traits(N), B = BUILD3[t.build], M = H.MATERIAL[t.rarityIdx];
  const skin = H.SKIN[t.skin], hair = H.HAIR[t.hair][1], coat = H.COATS[t.coat][1], fur = H.FURS[t.fur][1];
  const root = new THREE.Group(), body = new THREE.Group(), armR = new THREE.Group();
  root.add(body); body.add(armR);
  const mCoat = toon(coat), mCoatD = toon(shade(coat, -.12)), mFur = toon(fur), mSkin = toon(skin), mHair = toon(hair);
  const mMetal = toon(M.metal), mMetalD = toon(M.metalD), mWood = toon(M.wood), mGlove = toon("#5A3E2B"), mBoot = toon("#4A3426"), mPants = toon("#2E2A3A");
  const mAccent = toon(M.accent, M.accent, t.rarityIdx >= 2 ? .9 : .35);

  const boot = .2, y0 = t.build === "Seer" ? .06 : boot + B.leg - .06, y1 = y0 + B.h, w = B.w;
  // legs + boots
  if (t.build !== "Seer") for (const sx of [-1, 1]) {
    const x = sx * w * .22;
    limb(body, [x, boot - .02, 0], [x, y0 + .12, 0], Math.max(.1, B.arm * .85), mPants);
    part(body, sph(1), mBoot, { x, y: .1, z: .05, s: [.17 + B.arm * .3, .12, .23 + B.arm * .2] });
    part(body, new THREE.TorusGeometry(.13 + B.arm * .25, .055, 10, 20), mFur, { x, y: .2, rx: Math.PI / 2 });
  }
  // coat (lathe)
  const rH = w * (t.build === "Seer" ? .66 : .6), rW = w * .5, rC = w * .54, rS = w * .48;
  const prof = [[0, y0 - .01], [rH, y0], [rH * 1.01, y0 + .06], [rW, y0 + B.h * .45], [rC, y0 + B.h * .75], [rS, y1 - .07], [rS * .55, y1], [0, y1 + .03]].map(([r, y]) => new THREE.Vector2(r, y));
  const coatM = part(body, new THREE.LatheGeometry(prof, 40), mCoat, { s: [1, 1, .82] });
  part(body, new THREE.TorusGeometry(rH, .07, 10, 40), mFur, { y: y0 + .03, rx: Math.PI / 2, s: [1, .82, 1] });
  part(body, new THREE.TorusGeometry(rS * .62, .1, 10, 28), mFur, { y: y1 - .01, rx: Math.PI / 2, s: [1, .85, 1] });
  part(body, new THREE.BoxGeometry(.09, B.h * .86, .05), mFur, { y: y0 + B.h * .46, z: rW * .84 + .02, rx: -.06 });
  // belt + buckle + pouch
  part(body, new THREE.CylinderGeometry(rW * 1.04, rW * 1.06, .08, 36), toon("#3B2A22"), { y: y0 + B.h * .42, s: [1, 1, .84] });
  part(body, new THREE.BoxGeometry(.14, .11, .05), mMetal, { y: y0 + B.h * .42, z: rW * .88 + .02 });
  part(body, new THREE.BoxGeometry(.14, .16, .09), toon("#6A4A33"), { x: w * .3, y: y0 + B.h * .3, z: rW * .62 });
  // shoulder pads
  if (t.build === "Brute" || t.build === "Smith" || t.rarityIdx >= 3)
    for (const sx of [-1, 1]) part(body, sph(1), mMetal, { x: sx * rS * .95, y: y1 - .05, s: [B.arm + .12, B.arm * .7 + .06, B.arm + .1] });
  // arms
  const sh = y1 - .1;
  const handL = [w * .62, y0 + B.h * .28, .05];
  limb(body, [rS * .9, sh, 0], handL, B.arm, mCoat);
  part(body, new THREE.TorusGeometry(B.hand * .9, .045, 8, 16), mFur, { x: handL[0], y: handL[1] + B.hand * .8, z: handL[2], rx: Math.PI / 2 });
  part(body, sph(B.hand), mGlove, { x: handL[0], y: handL[1], z: handL[2] });
  // weapon arm in its own group (pivot at shoulder) so the arena can swing it
  armR.position.set(-rS * .9, sh, 0);
  const handR = [-w * .66 + rS * .9, y0 + B.h * .36 - sh, .2];
  limb(armR, [0, 0, 0], handR, B.arm, mCoat);
  part(armR, new THREE.TorusGeometry(B.hand * .9, .045, 8, 16), mFur, { x: handR[0], y: handR[1] + B.hand * .8, z: handR[2], rx: Math.PI / 2 });
  part(armR, sph(B.hand), mGlove, { x: handR[0], y: handR[1], z: handR[2] });
  const wpn = new THREE.Group(); wpn.position.set(...handR); armR.add(wpn); weapon(wpn, t, mWood, mMetal, mMetalD, mAccent);

  // head
  const R = B.head, hy = y1 + R * .78, head = new THREE.Group(); head.position.set(0, hy, 0); body.add(head);
  part(head, sph(R, 28, 20), mSkin, { s: [1, .96, .93] });
  for (const sx of [-1, 1]) part(head, sph(R * .2), mSkin, { x: sx * R * .95, y: -R * .02 });
  // eyes, brows
  const brow = { Determined: .18, Grumpy: .32, Calm: -.06, Fierce: .42 }[t.mood];
  for (const sx of [-1, 1]) {
    part(head, sph(1, 14, 10), toon("#FFFFFF"), { x: sx * R * .33, y: R * .04, z: R * .83, s: [R * .17, R * (t.mood === "Calm" ? .12 : .19), R * .08] });
    part(head, sph(R * .1, 12, 8), toon("#1E1622"), { x: sx * R * .31, y: R * .03, z: R * .9, outline: false });
    part(head, sph(R * .03, 8, 6), toon("#FFFFFF", "#FFFFFF", 1), { x: sx * R * .29, y: R * .09, z: R * .96, outline: false });
    part(head, new THREE.BoxGeometry(R * .32, R * .07, R * .06), toon(shade(hair, -.15)), { x: sx * R * .33, y: R * .27, z: R * .86, rz: sx * -brow });
    part(head, sph(1, 12, 8), toon("#F0957F"), { x: sx * R * .52, y: -R * .2, z: R * .74, s: [R * .16, R * .1, R * .05], outline: false });
  }
  if (t.mood === "Fierce") part(head, new THREE.BoxGeometry(R * .05, R * .38, R * .02), toon("#B5523F"), { x: R * .4, y: R * .1, z: R * .9, rz: .5, outline: false });
  part(head, sph(R * .18), toon(shade(skin, -.08)), { y: -R * .1, z: R * .93 });
  // facial hair / mouth
  const mouth = () => part(head, new THREE.TorusGeometry(R * .14, R * .025, 6, 14, Math.PI), toon("#4A2620"), { y: -R * .38, z: R * .93, rz: t.mood === "Grumpy" ? 0 : Math.PI, outline: false });
  if (t.facial === "None") mouth();
  if (t.facial === "Stubble") { mouth(); part(head, new THREE.SphereGeometry(R * 1.012, 28, 10, Math.PI * .1, Math.PI * .8, Math.PI * .7, Math.PI * .22), toon(shade(skin, -.06)), { s: [1, .96, .93], outline: false }); }
  if (t.facial === "Mustache") { mouth(); for (const sx of [-1, 1]) limb(head, [0, -R * .26, R * .92], [sx * R * .42, -R * .38, R * .8], R * .07, mHair); }
  if (t.facial === "Full beard") { part(head, sph(1, 20, 14), mHair, { y: -R * .58, z: R * .42, s: [R * .78, R * .62, R * .52] }); for (const sx of [-1, 1]) limb(head, [0, -R * .26, R * .92], [sx * R * .4, -R * .34, R * .82], R * .07, mHair); }
  if (t.facial === "Braided beard") { part(head, sph(1, 20, 14), mHair, { y: -R * .5, z: R * .45, s: [R * .7, R * .45, R * .48] }); for (let i = 0; i < 3; i++) part(head, sph(R * .13), mHair, { y: -R * (.95 + i * .2), z: R * .6 }); part(head, new THREE.CylinderGeometry(R * .1, R * .1, R * .08, 12), toon("#C9A24E"), { y: -R * 1.5, z: R * .6 }); }
  headgear(head, t, R, coat, fur, hair, mMetal, mMetalD, mAccent);

  // companion
  if (t.pet !== "None") { const p = new THREE.Group(); p.position.set(w * .62 + .45, 0, .35); p.rotation.y = -.5; pet(p, t.pet); root.add(p); }
  // base + rarity ring
  part(root, new THREE.CylinderGeometry(1.05, 1.15, .1, 48), toon("#EAF4FC"), { y: -.05, outline: false });
  const ringCol = ["#C9D6E3", "#3FB68B", "#A77BF0", "#F2C14E", "#8DF0D2"][t.rarityIdx];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, .035, 8, 64), glowMat(ringCol, t.rarityIdx ? .95 : .6)); ring.rotation.x = Math.PI / 2; ring.position.y = .005; root.add(ring);
  if (t.rarityIdx === 4) {
    const sp = new THREE.Group(); sp.name = "sparkles";
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(.05), glowMat(i % 2 ? "#F3A6FF" : "#8DF0D2", 1)); const a = i / 10 * Math.PI * 2; m.position.set(Math.cos(a) * 1.0, .6 + (i % 3) * .55, Math.sin(a) * .6); sp.add(m); }
    root.add(sp);
  }
  root.userData = { t, body, armR, head, coat: coatM, height: hy + R * 1.4 };
  return root;
}

function weapon(g, t, wood, metal, metalD, accent) {
  const shaft = (len, r = .035) => part(g, new THREE.CylinderGeometry(r, r, len, 10), wood, { y: len * .25 });
  g.rotation.z = .25; g.rotation.x = -.15;
  switch (t.weapon) {
    case "Ice axe": shaft(1.2); part(g, new THREE.ConeGeometry(.06, .5, 8), metal, { x: -.22, y: .82, rz: Math.PI / 2 + .3 }); part(g, new THREE.BoxGeometry(.16, .1, .07), metal, { x: .08, y: .85 }); break;
    case "War hammer": shaft(1.4); part(g, new THREE.BoxGeometry(.5, .3, .3), metal, { y: 1.02 }); part(g, new THREE.BoxGeometry(.52, .08, .32), metalD, { y: 1.02 }); part(g, sph(.06), accent, { y: 1.02, z: .17, outline: false }); break;
    case "Crossbow": g.rotation.set(0, .2, Math.PI / 2 - .1); part(g, new THREE.BoxGeometry(.08, .75, .08), wood, { y: .2 }); part(g, new THREE.TorusGeometry(.32, .03, 8, 20, Math.PI), metal, { y: .5, rz: 0 }); part(g, new THREE.ConeGeometry(.04, .14, 6), accent, { y: .66, outline: false }); break;
    case "Harpoon": shaft(1.7, .03); part(g, new THREE.ConeGeometry(.07, .3, 8), metal, { y: 1.35 }); part(g, new THREE.ConeGeometry(.04, .16, 6), metal, { x: -.06, y: 1.18, rz: -.6 }); break;
    case "Torch": shaft(.8, .045); part(g, new THREE.CylinderGeometry(.07, .06, .12, 10), metal, { y: .58 }); part(g, new THREE.ConeGeometry(.1, .32, 10), toon("#FF8A2B", "#FF6A00", 1), { y: .8, outline: false }); part(g, sph(.07), toon("#FFE27A", "#FFD23F", 1.2), { y: .72, outline: false }); g.add(new THREE.Mesh(sph(.24), glowMat("#FFB347", .25))).position.y = .78; break;
    case "Frost blade": part(g, new THREE.CylinderGeometry(.035, .035, .26, 8), wood, { y: 0 }); part(g, new THREE.BoxGeometry(.3, .06, .08), metal, { y: .15 }); part(g, new THREE.OctahedronGeometry(.1), toon(H.MATERIAL[t.rarityIdx].accent, H.MATERIAL[t.rarityIdx].accent, .7), { y: .7, s: [.75, 5.4, .3] }); break;
    case "Snow shovel": shaft(1.2); part(g, new THREE.BoxGeometry(.32, .38, .04), metal, { y: -.35, rx: .3 }); break;
    case "Rune staff": shaft(1.7, .04); part(g, new THREE.TorusGeometry(.12, .025, 6, 14), wood, { y: 1.32 }); part(g, new THREE.OctahedronGeometry(.12), accent, { y: 1.33 }); g.add(new THREE.Mesh(sph(.22), glowMat(H.MATERIAL[t.rarityIdx].accent, .25))).position.y = 1.33; break;
  }
}

function headgear(h, t, R, coat, fur, hair, metal, metalD, accent) {
  const mC = toon(shade(coat, -.08)), mF = toon(fur), mH = toon(hair);
  const cap = (r, m, y = R * .26) => part(h, new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m, { y });
  switch (t.headgear) {
    case "Fur hood": case "Aurora halo": {
      part(h, new THREE.SphereGeometry(R * 1.24, 32, 18, Math.PI * .5 + .95, Math.PI * 2 - 1.9), mC, { y: R * .06 });
      part(h, new THREE.TorusGeometry(R * .98, R * .2, 12, 32), mF, { y: R * .02, z: R * .52, s: [1, 1.06, .8] });
      if (t.headgear === "Aurora halo") { const halo = new THREE.Mesh(new THREE.TorusGeometry(R * .75, R * .06, 8, 40), glowMat("#9FF7E0", 1)); halo.rotation.x = Math.PI / 2 - .25; halo.position.y = R * 1.55; h.add(halo); halo.name = "halo"; }
      break;
    }
    case "Ushanka":
      cap(R * 1.08, toon(shade(coat, -.2)), R * .34);
      part(h, new THREE.TorusGeometry(R * 1.02, R * .19, 12, 32), mF, { y: R * .46, rx: Math.PI / 2 + .12, s: [1, 1, .9] });
      for (const sx of [-1, 1]) part(h, sph(1), mF, { x: sx * R * .98, y: -R * .12, s: [R * .2, R * .5, R * .42] });
      part(h, new THREE.CylinderGeometry(R * .12, R * .12, R * .05, 12), metal, { y: R * .42, z: R * 1.02, rx: Math.PI / 2 });
      break;
    case "Knit beanie":
      cap(R * 1.05, toon(shade(coat, .18)), R * .3);
      part(h, new THREE.TorusGeometry(R * 1.0, R * .14, 10, 32), toon(shade(coat, .05)), { y: R * .4, rx: Math.PI / 2 + .1 });
      part(h, sph(R * .26), mF, { y: R * 1.42 });
      break;
    case "Horned helm":
      cap(R * 1.07, metal, R * .3);
      part(h, new THREE.TorusGeometry(R * 1.02, R * .09, 8, 32), metalD, { y: R * .36, rx: Math.PI / 2 + .1 });
      part(h, new THREE.BoxGeometry(R * .12, R * .36, R * .1), metalD, { y: R * .3, z: R * .98 });
      for (const sx of [-1, 1]) { const horn = part(h, new THREE.ConeGeometry(R * .2, R * .95, 12), toon("#EDE3CC"), { x: sx * R * 1.1, y: R * .9, rz: -sx * .75 }); horn.scale.x = .8; }
      break;
    case "Goggles":
      cap(R * 1.04, toon(shade(coat, .1)), R * .3);
      part(h, new THREE.TorusGeometry(R * 1.0, R * .07, 8, 32), toon("#3A2B22"), { y: R * .56, rx: Math.PI / 2 + .1 });
      for (const sx of [-1, 1]) part(h, new THREE.CylinderGeometry(R * .2, R * .2, R * .14, 18), accent, { x: sx * R * .36, y: R * .66, z: R * .78, rx: Math.PI / 2 - .55 });
      break;
    case "Bare head":
      cap(R * 1.01, mH, R * .22); part(h, sph(R * .3), mH, { y: R * 1.25, z: -R * .2 }); break;
    case "Ice crown":
      cap(R * 1.01, mH, R * .22);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; part(h, new THREE.ConeGeometry(R * .1, R * (.4 + (i % 2) * .25), 6), toon(H.MATERIAL[t.rarityIdx].accent, H.MATERIAL[t.rarityIdx].accent, .8), { x: Math.sin(a) * R * .72, y: R * 1.0, z: Math.cos(a) * R * .72 }); }
      part(h, new THREE.TorusGeometry(R * .75, R * .06, 8, 32), metal, { y: R * .82, rx: Math.PI / 2 });
      break;
  }
}

function pet(g, kind) {
  const W = toon("#F6F4F0"), K = toon("#23252E"), O = toon("#F29A2E"), G = toon("#8A93A0"), F = toon("#E8743B");
  const eye = (x, y, z, c = "#1A1216", r = .03) => part(g, sph(r, 10, 8), toon(c), { x, y, z, outline: false });
  switch (kind) {
    case "Snow owl": part(g, sph(1), W, { y: .26, s: [.22, .27, .2] }); for (const sx of [-1, 1]) { part(g, sph(.07), toon("#FFD23F"), { x: sx * .08, y: .34, z: .17 }); eye(sx * .08, .34, .23); } part(g, new THREE.ConeGeometry(.03, .07, 6), toon("#3A2B22"), { y: .27, z: .21, rx: Math.PI / 2 + .6 }); break;
    case "Husky pup": part(g, new THREE.CapsuleGeometry(.13, .22, 6, 12), G, { y: .16, rz: Math.PI / 2 }); part(g, sph(.15), G, { x: -.2, y: .32, z: .05 }); part(g, sph(.09), W, { x: -.22, y: .27, z: .15 }); for (const sx of [-1, 1]) part(g, new THREE.ConeGeometry(.05, .12, 6), G, { x: -.2 + sx * .08, y: .48, z: .04 }); eye(-.26, .35, .17, "#3A6FD8"); eye(-.15, .35, .18, "#3A6FD8"); part(g, sph(.03), K, { x: -.22, y: .28, z: .24, outline: false }); break;
    case "Penguin": part(g, new THREE.CapsuleGeometry(.14, .18, 6, 12), K, { y: .27 }); part(g, sph(1), W, { y: .25, z: .07, s: [.11, .16, .1] }); part(g, new THREE.ConeGeometry(.035, .09, 6), O, { y: .4, z: .14, rx: Math.PI / 2 }); eye(-.05, .45, .12, "#FFFFFF", .02); eye(.05, .45, .12, "#FFFFFF", .02); for (const sx of [-1, 1]) part(g, sph(1), O, { x: sx * .06, y: .02, z: .05, s: [.05, .02, .07] }); break;
    case "Fox kit": part(g, new THREE.CapsuleGeometry(.11, .2, 6, 12), F, { y: .14, rz: Math.PI / 2 }); part(g, sph(.13), F, { x: -.2, y: .28, z: .04 }); part(g, sph(.07), W, { x: -.24, y: .24, z: .13 }); for (const sx of [-1, 1]) part(g, new THREE.ConeGeometry(.05, .13, 6), F, { x: -.2 + sx * .07, y: .44, z: .02 }); limb(g, [.15, .14, 0], [.35, .32, -.05], .07, F); part(g, sph(.06), W, { x: .37, y: .36, z: -.05 }); eye(-.25, .31, .14); break;
    case "Yeti cub": part(g, sph(1), W, { y: .3, s: [.26, .32, .24] }); part(g, sph(1), toon("#8FB8E8"), { y: .36, z: .17, s: [.14, .11, .06] }); eye(-.05, .38, .23); eye(.05, .38, .23); for (const sx of [-1, 1]) limb(g, [sx * .22, .32, 0], [sx * .3, .14, .05], .06, W); break;
  }
}

/* ---------- shared lighting ---------- */
function light(scene) {
  scene.add(new THREE.HemisphereLight(0xEAF3FF, 0x8090B0, 1.45));
  const key = new THREE.DirectionalLight(0xFFF1DC, 2.1); key.position.set(2.5, 4, 3.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9FD3FF, 1.4); rim.position.set(-3, 2.5, -3); scene.add(rim);
}
const _box = new THREE.Box3(), _v = new THREE.Vector3();
function fit(cam, obj, aspect, fill = .84) {
  const u = obj.userData; if (u.coat) { _box.setFromObject(u.coat); _box.union(new THREE.Box3().setFromObject(u.head)); _box.min.y = -.08; } else _box.setFromObject(obj); const size = _box.getSize(_v), cy = (_box.min.y + _box.max.y) / 2;
  const fovV = cam.fov * Math.PI / 180, needH = size.y / fill, needW = Math.max(size.x * 1.5, 1.5) / fill;
  const dist = Math.max(needH / (2 * Math.tan(fovV / 2)), needW / (2 * Math.tan(fovV / 2) * aspect));
  cam.position.set(0, cy + dist * .1, dist + _box.max.z * .2); cam.lookAt(0, cy, 0);
}
function disposeTree(o) { o.traverse(m => { if (m.isMesh && m.material && m.material.isMeshBasicMaterial && !m.material.isShared) m.geometry.dispose(); }); }

/* ---------- thumbnails ---------- */
let thumbR = null; const thumbCache = new Map();
function thumbRenderer() {
  if (thumbR) return thumbR;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(400, 500, false); r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); light(scene);
  const cam = new THREE.PerspectiveCamera(30, 400 / 500, .1, 50);
  thumbR = { r, scene, cam }; return thumbR;
}
function thumbNow(N) {
  if (thumbCache.has(N)) return thumbCache.get(N);
  const { r, scene, cam } = thumbRenderer();
  const hero = buildHero(N); hero.rotation.y = -.42; scene.add(hero);
  fit(cam, hero, 400 / 500, .8);
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  scene.remove(hero); disposeTree(hero);
  thumbCache.set(N, url); if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value);
  return url;
}
// render queue so long grids never block a frame for long
const queue = []; let pumping = false;
function pump() {
  pumping = true; const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 12) { const [N, res] = queue.shift(); try { res(thumbNow(N)); } catch (e) { res(null); } }
  if (queue.length) requestAnimationFrame(pump); else pumping = false;
}
function thumb(N) {
  if (thumbCache.has(N)) return Promise.resolve(thumbCache.get(N));
  return new Promise(res => { queue.push([N, res]); if (!pumping) requestAnimationFrame(pump); });
}

/* ---------- turntable viewer ---------- */
class Viewer {
  constructor(canvas, N) {
    this.canvas = canvas; this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); light(this.scene); this.cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
    this.angle = -.42; this.drag = null; this.auto = true; this.vel = 0; this.idle = 0; this.tilt = 0;
    canvas.style.touchAction = "none"; canvas.style.cursor = "grab";
    const down = e => { this.drag = { x: e.clientX, y: e.clientY, t: performance.now() }; this.auto = false; this.vel = 0; canvas.style.cursor = "grabbing"; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); };
    const move = e => {
      if (!this.drag) return;
      const w = Math.max(200, canvas.clientWidth), dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y, now = performance.now();
      const d = dx / w * Math.PI * 2.2;                 // a full-width swipe turns the hero ~1.1 times
      this.angle += d; this.vel = d / Math.max(8, now - this.drag.t) * 16;
      this.tilt = Math.max(-.35, Math.min(.35, this.tilt + dy / w * 1.2));
      this.drag = { x: e.clientX, y: e.clientY, t: now }; e.preventDefault();
    };
    const up = () => { if (!this.drag) return; this.drag = null; this.idle = performance.now(); canvas.style.cursor = "grab"; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
    this.set(N); this.loop = this.loop.bind(this); this.running = true; requestAnimationFrame(this.loop);
  }
  set(N) { if (this.hero) { this.scene.remove(this.hero); disposeTree(this.hero); } this.hero = buildHero(N); this.scene.add(this.hero); this.angle = -.42; this.auto = true; this.vel = 0; this.tilt = 0; this.fitted = 0; }
  loop(ts) {
    if (!this.running) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (this.canvas.width !== Math.round(w * this.r.getPixelRatio()) || this.canvas.height !== Math.round(h * this.r.getPixelRatio()))) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    if (!this.fitted || this.fitted !== this.cam.aspect) { const a = this.hero.rotation.y; this.hero.rotation.y = 0; fit(this.cam, this.hero, this.cam.aspect, .62); this.hero.rotation.y = a; this.fitted = this.cam.aspect; }
    if (!this.drag) {
      if (Math.abs(this.vel) > .0004) { this.angle += this.vel; this.vel *= .94; }      // momentum after a flick
      else if (!this.auto && performance.now() - this.idle > 2500) this.auto = true;   // resume slow spin
      if (this.auto && !matchMedia("(prefers-reduced-motion: reduce)").matches) this.angle += .006;
      this.tilt *= .92;
    }
    this.hero.rotation.y = this.angle; this.hero.rotation.x = this.tilt * .5; animateIdle(this.hero, ts / 1000);
    this.r.render(this.scene, this.cam); requestAnimationFrame(this.loop);
  }
  stop() { this.running = false; }
  start() { if (!this.running) { this.running = true; requestAnimationFrame(this.loop); } }
}

function animateIdle(hero, t) {
  const u = hero.userData; if (!u.body) return;
  u.body.position.y = Math.sin(t * 2.2) * .02; u.head.rotation.z = Math.sin(t * 1.3) * .04;
  hero.traverse(o => { if (o.name === "sparkles") o.rotation.y = t * .6; if (o.name === "halo") o.position.y = u.head.position.y * 0 + o.position.y; });
}

/* ---------- stage: several heroes in one scene ---------- */
class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); light(this.scene); this.cam = new THREE.PerspectiveCamera(opts.fov || 28, 1, .1, 80);
    this.slots = []; this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  setHeroes(list) { // [{n, x, z, ry, scale}]
    list.forEach((s, i) => {
      const cur = this.slots[i];
      if (cur && cur.n === s.n) { Object.assign(cur, s); return; }
      if (cur) { this.scene.remove(cur.hero); disposeTree(cur.hero); }
      const hero = buildHero(s.n); this.scene.add(hero);
      this.slots[i] = { ...s, hero, hit: 0, punch: 0 };
    });
    while (this.slots.length > list.length) { const c = this.slots.pop(); this.scene.remove(c.hero); disposeTree(c.hero); }
  }
  strike(from, to) { if (this.slots[from]) this.slots[from].punch = 1; if (this.slots[to]) this.slots[to].hit = 1; }
  loop(ts) {
    const t = ts / 1000, w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h) {
      const pr = this.r.getPixelRatio();
      if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr)) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
      const c = this.opts.camera || [0, 1.6, 9.5], look = this.opts.look || [0, 1.15, 0];
      const narrow = w / h < .9 ? (this.opts.narrowZoom || 1.35) : 1;
      this.cam.position.set(c[0], c[1], c[2] * narrow); this.cam.lookAt(...look);
      for (const s of this.slots) {
        const hero = s.hero, u = hero.userData, dir = Math.sign(-(s.x || 0)) || 1;
        hero.position.set((s.x || 0) + dir * Math.sin(Math.PI * s.punch) * .55 - dir * Math.sin(Math.PI * s.hit) * .35, 0, s.z || 0);
        hero.rotation.y = (s.ry || 0) + (s.spin ? t * .4 : 0); hero.scale.setScalar(s.scale || 1);
        u.armR.rotation.x = -Math.sin(Math.PI * s.punch) * 1.4; u.armR.rotation.z = -Math.sin(Math.PI * s.punch) * .3;
        hero.rotation.z = dir * Math.sin(Math.PI * s.hit) * .18;
        animateIdle(hero, t + (s.x || 0));
        s.punch = Math.max(0, s.punch - .045); s.hit = Math.max(0, s.hit - .04);
      }
      if (!this.canvas.closest("[hidden]")) this.r.render(this.scene, this.cam);
    }
    requestAnimationFrame(this.loop);
  }
}

window.Hero3D = { thumb, cached: N => thumbCache.get(N), Viewer, Stage, buildHero, ready: true };
window.dispatchEvent(new Event("hero3d-ready"));
