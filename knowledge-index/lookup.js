"use strict";

// The knowledge front door. Hybrid fast-to-slow:
//   L1 deterministic trigger lookup (exact + prefix)
//   L2 faceted browse (category x facet)
//   L3 keyword (FTS5 BM25) fused with dense (bge-small cosine) via RRF
// Two entrypoints:
//   lookup(need, opts)        - SYNC, keyword-only (L1+L2+FTS). Always works,
//                               no model load. The dependable fallback.
//   lookupHybrid(need, opts)  - ASYNC, adds the dense leg and RRF-fuses it with
//                               the keyword ranking. Degrades to lookup() if the
//                               embedder or the vectors table is unavailable.
// Never returns a silent empty without flagging possible staleness.

const path = require("path");
const { open } = require("./db");

const CATEGORIES = ["doctrine", "recipes", "reference", "memory", "identity", "secrets", "workbench"];
const FACETS = ["release", "gui", "autonomy", "memory", "infra", "comms", "finance", "clients", "voice-brand", "scheduler", "meta"];
const RRF_K = 60;

const STOP = new Set(
  ("the a an of to for and or in on at by is are be do does how what when where which that this with from " +
    "i we you it me my our your need want find show get about into via use using do done").split(/\s+/)
);

function shortPath(p) {
  return p.replace(/^\/Users\/[^/]+\/\.code\/ecodiaos\/backend\//, "").replace(/^\/Users\/[^/]+\/\.claude\//, "~/.claude/");
}
function tokens(need) {
  const words = String(need || "").toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  const out = [];
  for (const w of words) if (w.length >= 3 && !STOP.has(w)) out.push(w);
  return Array.from(new Set(out));
}
function detectFacet(need) {
  const low = String(need || "").toLowerCase();
  for (const f of FACETS) if (low.includes(f)) return f;
  return null;
}
function detectCategory(need) {
  const low = String(need || "").toLowerCase();
  for (const c of CATEGORIES) if (low.includes(c)) return c;
  return null;
}
function ftsQuery(toks) {
  return toks.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}
function freshness(db) {
  const last = db.prepare("SELECT started_at, mode FROM index_runs ORDER BY started_at DESC LIMIT 1").get();
  if (!last) return { stale: true, reason: "never indexed" };
  const ageMin = Math.round((Date.now() - last.started_at) / 60000);
  return { stale: ageMin > 60, age_minutes: ageMin, last_mode: last.mode };
}

// Keyword ranking: returns ordered [{path, score, layers}]. Pure SQLite, sync.
function keywordRanked(db, need, opts) {
  const toks = tokens(need);
  const facet = (opts && opts.facet) || detectFacet(need);
  const category = (opts && opts.category) || detectCategory(need);
  const scores = new Map();
  const bump = (p, s, layer) => {
    const cur = scores.get(p) || { score: 0, layers: new Set() };
    cur.score += s;
    cur.layers.add(layer);
    scores.set(p, cur);
  };

  if (toks.length) {
    const stmt = db.prepare(
      "SELECT path, COUNT(*) c FROM triggers WHERE " +
        toks.map(() => "(trigger = ? OR trigger LIKE ? OR ? LIKE trigger || '%')").join(" OR ") +
        " GROUP BY path"
    );
    const args = [];
    for (const t of toks) args.push(t, t + "%", t);
    for (const row of stmt.all(...args)) bump(row.path, 100 * row.c, "L1-trigger");

    try {
      const rows = db
        .prepare("SELECT path, bm25(docs_fts) rank FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT 60")
        .all(ftsQuery(toks));
      rows.forEach((r, i) => bump(r.path, Math.max(40 - i, 4), "L3-fts"));
    } catch (e) {
      const rows = db.prepare("SELECT path FROM docs_fts WHERE body LIKE ? LIMIT 40").all(`%${toks[0]}%`);
      rows.forEach((r) => bump(r.path, 8, "L3-like"));
    }
  }
  if (facet || category) {
    const where = [facet ? "facet = ?" : null, category ? "category = ?" : null].filter(Boolean).join(" AND ");
    for (const d of db.prepare("SELECT path FROM docs WHERE " + where).all(...[facet, category].filter(Boolean)))
      if (scores.has(d.path)) bump(d.path, 15, "L2-facet");
  }
  if (!scores.size && (facet || category)) {
    const where = [facet ? "facet = ?" : null, category ? "category = ?" : null].filter(Boolean).join(" AND ");
    for (const d of db.prepare("SELECT path FROM docs WHERE " + where + " ORDER BY mtime DESC LIMIT 25").all(...[facet, category].filter(Boolean)))
      bump(d.path, 5, "L2-browse");
  }
  return Array.from(scores.entries())
    .map(([p, v]) => ({ path: p, score: v.score, layers: Array.from(v.layers) }))
    .sort((a, b) => b.score - a.score);
}

// Dense ranking: brute-force cosine over stored vectors. Returns ordered [{path, cos}].
function vectorRanked(db, needVec, embedmod, topN) {
  const rows = db.prepare("SELECT path, embedding FROM vectors").all();
  if (!rows.length) return [];
  const scored = [];
  for (const r of rows) {
    const v = embedmod.bufToVec(r.embedding);
    scored.push({ path: r.path, cos: embedmod.cosine(needVec, v) });
  }
  scored.sort((a, b) => b.cos - a.cos);
  return scored.slice(0, topN || 60);
}

function enrich(db, ranked, limit) {
  const meta = db.prepare("SELECT path, category, facet, title, triggers_raw, status FROM docs WHERE path = ?");
  return ranked.slice(0, limit).map((r) => {
    const m = meta.get(r.path) || {};
    return {
      path: shortPath(r.path),
      category: m.category,
      facet: m.facet,
      title: m.title,
      status: m.status || "active",
      triggers: m.triggers_raw,
      layers: r.layers,
    };
  });
}

// Drafts/work-in-progress must stay findable but never outrank load-bearing
// doctrine on a generic query. Weight applies to BOTH entry doors (keyword +
// hybrid) so retrieval quality stays identical; an explicit category ask
// (opts.category or the word in the need) exempts that category.
const TIER_WEIGHTS = { workbench: 0.6 };
function applyTierWeights(db, ranked, need, opts) {
  if (!ranked.length) return ranked;
  const explicit = (opts && opts.category) || detectCategory(need);
  const catStmt = db.prepare("SELECT category FROM docs WHERE path = ?");
  for (const r of ranked) {
    const m = catStmt.get(r.path);
    const w = m && TIER_WEIGHTS[m.category];
    if (w && m.category !== explicit) r.score *= w;
  }
  return ranked.sort((a, b) => b.score - a.score);
}

function noteFor(results) {
  return results.length === 0
    ? "No hit. If the index is fresh this knowledge likely does not exist yet - author it after acting (grep-absence is not absence)."
    : undefined;
}

// SYNC keyword-only.
function lookup(need, opts) {
  const limit = Math.min(Math.max((opts && opts.limit) || 5, 1), 25);
  const db = open({ readonly: true });
  try {
    const ranked = applyTierWeights(db, keywordRanked(db, need, opts), need, opts);
    const results = enrich(db, ranked, limit);
    return { need, mode: "keyword", count: results.length, results, index: freshness(db), note: noteFor(results) };
  } finally {
    db.close();
  }
}

// ASYNC hybrid: RRF-fuse keyword rank + dense rank. Degrades to keyword.
async function lookupHybrid(need, opts) {
  const limit = Math.min(Math.max((opts && opts.limit) || 5, 1), 25);
  const db = open({ readonly: true });
  try {
    const kw = keywordRanked(db, need, opts);
    let dense = [];
    let mode = "keyword";
    try {
      const haveVecs = db.prepare("SELECT COUNT(*) c FROM vectors").get().c;
      if (haveVecs > 0) {
        const embedmod = require("./embed");
        const needVec = await embedmod.embed(need);
        dense = vectorRanked(db, needVec, embedmod, 60);
        mode = "hybrid";
      }
    } catch (e) {
      mode = "keyword(dense-unavailable)";
    }

    // RRF fuse
    const rrf = new Map();
    const layers = new Map();
    kw.forEach((r, i) => {
      rrf.set(r.path, (rrf.get(r.path) || 0) + 1 / (RRF_K + i));
      layers.set(r.path, new Set(r.layers));
    });
    dense.forEach((r, i) => {
      rrf.set(r.path, (rrf.get(r.path) || 0) + 1 / (RRF_K + i));
      const s = layers.get(r.path) || new Set();
      s.add("L3-dense");
      layers.set(r.path, s);
    });
    const ranked = applyTierWeights(
      db,
      Array.from(rrf.entries())
        .map(([p, s]) => ({ path: p, score: s, layers: Array.from(layers.get(p) || []) }))
        .sort((a, b) => b.score - a.score),
      need,
      opts
    );

    const results = enrich(db, ranked, limit);
    return { need, mode, count: results.length, results, index: freshness(db), note: noteFor(results) };
  } finally {
    db.close();
  }
}

function stats() {
  const db = open({ readonly: true });
  try {
    const tot = db.prepare("SELECT COUNT(*) c FROM docs").get().c;
    const byCat = db.prepare("SELECT category, COUNT(*) c FROM docs GROUP BY category ORDER BY c DESC").all();
    const trig = db.prepare("SELECT COUNT(*) c FROM triggers").get().c;
    let vec = 0;
    try {
      vec = db.prepare("SELECT COUNT(*) c FROM vectors").get().c;
    } catch (_) {}
    return { total_docs: tot, by_category: byCat, trigger_rows: trig, vector_rows: vec, index: freshness(db) };
  } finally {
    db.close();
  }
}

module.exports = { lookup, lookupHybrid, stats };

// CLI: node lookup.js "need"             -> hybrid (loads model, auto-degrades
//                                            to keyword if model/vectors absent).
//                                            Matches the MCP front door so the
//                                            retrieval quality is identical by
//                                            either entry path.
//      node lookup.js --keyword "need"    -> fast keyword-only, no model load.
//      node lookup.js --hybrid "need"     -> explicit hybrid (back-compat alias).
if (require.main === module) {
  const args = process.argv.slice(2);
  const keywordOnly = args[0] === "--keyword";
  const need = args.filter((a) => a !== "--keyword" && a !== "--hybrid").join(" ");
  if (!need) {
    console.log(JSON.stringify(stats(), null, 2));
  } else if (keywordOnly) {
    console.log(JSON.stringify(lookup(need), null, 2));
  } else {
    lookupHybrid(need).then((r) => console.log(JSON.stringify(r, null, 2)));
  }
}
