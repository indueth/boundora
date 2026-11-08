// Export the Boundora Heroes collection.
//   node scripts/export-collection.js            -> collection/metadata.json (all 10,000) + rarity report
//   node scripts/export-collection.js --svg 1 50 -> also writes collection/svg/1.svg .. 50.svg
const fs = require("fs"), path = require("path");
const H = require("../web/heroes.js");
const out = path.join(__dirname, "..", "collection");
fs.mkdirSync(out, { recursive: true });
const all = [];
for (let n = 1; n <= H.SUPPLY; n++) all.push(H.metadata(n));
fs.writeFileSync(path.join(out, "metadata.json"), JSON.stringify(all));
const report = {};
for (const m of all) for (const a of m.attributes) { report[a.trait_type] ??= {}; report[a.trait_type][a.value] = (report[a.trait_type][a.value] || 0) + 1; }
fs.writeFileSync(path.join(out, "trait-report.json"), JSON.stringify(report, null, 2));
const i = process.argv.indexOf("--svg");
if (i > 0) {
  const from = +process.argv[i + 1] || 1, to = +process.argv[i + 2] || from;
  fs.mkdirSync(path.join(out, "svg"), { recursive: true });
  for (let n = from; n <= to; n++) fs.writeFileSync(path.join(out, "svg", n + ".svg"), H.heroSVG(n));
}
console.log("Wrote", all.length, "heroes. Rarity:", report.Rarity);
