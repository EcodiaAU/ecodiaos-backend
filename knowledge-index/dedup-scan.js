// Near-duplicate doctrine scan. Accreted doctrine grows stale siblings that
// compete at retrieval time and split the answer. Using the embeddings already
// in the index, find doctrine pairs whose cosine is high enough to be a
// consolidation candidate. Read-only: it proposes, never rewrites (load-bearing
// doctrine is conductor-gated, never auto-merged). Run: node dedup-scan.js [minCos]
const path = require("path");
const { open } = require("./db");
const { bufToVec, cosine } = require("./embed");

const MIN = parseFloat(process.argv[2] || "0.90");

const db = open();
const rows = db
  .prepare(
    "SELECT v.path, v.embedding, d.category FROM vectors v JOIN docs d ON d.path=v.path " +
      "WHERE d.category IN ('doctrine','recipes')"
  )
  .all();

const items = rows.map((r) => ({
  name: path.basename(r.path),
  cat: r.category,
  vec: bufToVec(r.embedding),
}));

const pairs = [];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const c = cosine(items[i].vec, items[j].vec);
    if (c >= MIN) pairs.push({ c, a: items[i].name, b: items[j].name });
  }
}
pairs.sort((x, y) => y.c - x.c);

console.log(`doctrine+recipes docs scanned: ${items.length}`);
console.log(`pairs at cosine >= ${MIN}: ${pairs.length}\n`);
const band = (c) => (c >= 0.95 ? "DUP " : c >= 0.92 ? "near" : "ovlp");
for (const p of pairs.slice(0, 60)) {
  console.log(`  [${band(p.c)} ${p.c.toFixed(3)}] ${p.a}\n            ${p.b}`);
}
if (pairs.length > 60) console.log(`\n  ... ${pairs.length - 60} more`);
