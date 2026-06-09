"use strict";

// The knowledge front door. Layered fast-to-slow:
//   L1 deterministic trigger lookup (exact + prefix) - same-need-same-files
//   L2 faceted browse (category x facet)
//   L3 FTS5 BM25 keyword search over title+triggers+body
// Degrades L3 -> LIKE scan if FTS5 errors; never returns a silent empty without
// saying the index might be stale. The dense vector leg (Phase 0b) slots in as
// an L3 sibling fused by RRF; this file is the keyword-complete version.

const path = require("path");
const { open } = require("./db");

const CATEGORIES = ["doctrine", "recipes", "reference", "memory", "identity", "secrets", "workbench"];
const FACETS = ["release", "gui", "autonomy", "memory", "infra", "comms", "finance", "clients", "voice-brand", "scheduler", "meta"];

const STOP = new Set(
  ("the a an of to for and or in on at by is are be do does how what when where which that this with from " +
    "i we you it me my our your need want find show get about into via use using do done").split(/\s+/)
);

function shortPath(p) {
  return p.replace(/^\/Users\/[^/]+\/\.code\/ecodiaos\/backend\//, "").replace(/^\/Users\/[^/]+\/\.claude\//, "~/.claude/");
}

function tokens(need) {
  const raw = String(need || "").toLowerCase();
  const words = raw.split(/[^a-z0-9-]+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w);
  }
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
  // OR the tokens, each as a prefix term, quoted to survive punctuation.
  return toks.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}

function freshness(db) {
  const last = db.prepare("SELECT started_at, mode FROM index_runs ORDER BY started_at DESC LIMIT 1").get();
  if (!last) return { stale: true, reason: "never indexed" };
  const ageMin = Math.round((Date.now() - last.started_at) / 60000);
  return { stale: ageMin > 60, age_minutes: ageMin, last_mode: last.mode };
}

function lookup(need, opts) {
  const options = opts || {};
  const limit = Math.min(Math.max(options.limit || 5, 1), 25);
  const db = open({ readonly: true });
  try {
    const toks = tokens(need);
    const facet = options.facet || detectFacet(need);
    const category = options.category || detectCategory(need);
    const scores = new Map(); // path -> {score, layers:Set}

    function bump(p, s, layer) {
      const cur = scores.get(p) || { score: 0, layers: new Set() };
      cur.score += s;
      cur.layers.add(layer);
      scores.set(p, cur);
    }

    // L1 deterministic trigger lookup (exact + prefix both directions)
    if (toks.length) {
      const stmt = db.prepare(
        "SELECT path, COUNT(*) c FROM triggers WHERE " +
          toks.map(() => "(trigger = ? OR trigger LIKE ? OR ? LIKE trigger || '%')").join(" OR ") +
          " GROUP BY path"
      );
      const args = [];
      for (const t of toks) args.push(t, t + "%", t);
      for (const row of stmt.all(...args)) bump(row.path, 100 * row.c, "L1-trigger");
    }

    // L3 FTS5 BM25
    if (toks.length) {
      try {
        const q = ftsQuery(toks);
        const rows = db
          .prepare("SELECT path, bm25(docs_fts) rank FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT 60")
          .all(q);
        rows.forEach((r, i) => bump(r.path, Math.max(40 - i, 4), "L3-fts"));
      } catch (e) {
        // degrade to LIKE over body
        const like = `%${toks[0]}%`;
        const rows = db.prepare("SELECT path FROM docs_fts WHERE body LIKE ? LIMIT 40").all(like);
        rows.forEach((r) => bump(r.path, 8, "L3-like"));
      }
    }

    // L2 facet/category boost (does not gate, just lifts on-target docs)
    if (facet || category) {
      const docs = db
        .prepare(
          "SELECT path FROM docs WHERE " +
            [facet ? "facet = ?" : null, category ? "category = ?" : null].filter(Boolean).join(" AND ")
        )
        .all(...[facet, category].filter(Boolean));
      for (const d of docs) if (scores.has(d.path)) bump(d.path, 15, "L2-facet");
    }

    // pure-browse fallback: no token hits but a facet/category named
    if (!scores.size && (facet || category)) {
      const docs = db
        .prepare(
          "SELECT path FROM docs WHERE " +
            [facet ? "facet = ?" : null, category ? "category = ?" : null].filter(Boolean).join(" AND ") +
            " ORDER BY mtime DESC LIMIT ?"
        )
        .all(...[facet, category].filter(Boolean), limit);
      for (const d of docs) bump(d.path, 5, "L2-browse");
    }

    const ranked = Array.from(scores.entries())
      .map(([p, v]) => ({ path: p, score: v.score, layers: Array.from(v.layers) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const meta = db.prepare("SELECT path, category, facet, title, triggers_raw, status FROM docs WHERE path = ?");
    const results = ranked.map((r) => {
      const m = meta.get(r.path) || {};
      return {
        path: shortPath(r.path),
        category: m.category,
        facet: m.facet,
        title: m.title,
        status: m.status || "active",
        triggers: m.triggers_raw,
        score: r.score,
        layers: r.layers,
      };
    });

    const fresh = freshness(db);
    return {
      need,
      count: results.length,
      results,
      index: fresh,
      note:
        results.length === 0
          ? "No hit. If the index is fresh this knowledge likely does not exist yet - author it after acting (grep-absence is not absence)."
          : undefined,
    };
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
    return { total_docs: tot, by_category: byCat, trigger_rows: trig, index: freshness(db) };
  } finally {
    db.close();
  }
}

module.exports = { lookup, stats };

// CLI: node lookup.js "how do I ship coexist ios"
if (require.main === module) {
  const need = process.argv.slice(2).join(" ");
  if (!need) {
    console.log(JSON.stringify(stats(), null, 2));
  } else {
    console.log(JSON.stringify(lookup(need), null, 2));
  }
}
