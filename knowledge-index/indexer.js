"use strict";

// Knowledge indexer. Walks the doctrine/reference/memory corpus and builds the
// local SQLite front-door index (docs + triggers + FTS5). Incremental via
// sha256. Phase 0 indexes the CURRENT flat layout (patterns/, clients/, docs/,
// drafts/, voice/, brand/, auto-memory) and infers category/facet; after the
// Phase 3 migration into backend/knowledge/<category>/ it reads category from
// the path. Keyword-only (no embeddings) - the dense leg layers on later.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { open } = require("./db");

const BACKEND = path.resolve(__dirname, "..");
const HOME = require("os").homedir();

// (root dir, category-or-null-to-infer, source_root label, exclude-substring)
const ROOTS = [
  [path.join(BACKEND, "patterns"), null, "patterns", "/_archived/"],
  [path.join(BACKEND, "clients"), "reference", "clients", "/archived/"],
  [path.join(BACKEND, "docs", "secrets"), "secrets", "secrets", null],
  [path.join(BACKEND, "docs"), "reference", "docs", "/secrets/"],
  [path.join(BACKEND, "voice"), "identity", "voice", "/out/"],
  [path.join(BACKEND, "brand"), "identity", "brand", null],
  [path.join(BACKEND, "drafts"), "workbench", "drafts", "/_archive/"],
  [path.join(HOME, ".claude", "projects", "-Users-ecodia--code-ecodiaos-backend", "memory"), "memory", "auto-memory", null],
];

const FACET_RULES = [
  [/release|ship|testflight|asc|play[\s-]?console|altool|xcode|capacitor|android|ios\b|app[\s-]?store/i, "release"],
  [/\bcdp\b|gui|macro|screenshot|chrome|puppeteer|laptop-agent|corazon|sy094/i, "gui"],
  [/autonom|dispatch|worker|coord|conductor|fork|scheduler|cron|self-schedul/i, "autonomy"],
  [/neo4j|memory|auto-memory|episode|reflection|substrate|knowledge|retriev|pattern-lifecycle/i, "memory"],
  [/supabase|postgres|vps|pm2|deploy|infra|mcp|connector|bearer|kv_store|vercel/i, "infra"],
  [/email|gmail|sms|comms|inbox|calendar|outreach|zernio|social/i, "comms"],
  [/invoice|stripe|bookkeep|xero|ledger|gl_account|finance|bas|tax|money/i, "finance"],
  [/client|coexist|chambers|roam|goodreach|resonaverde|woodford|wattle|glovebox/i, "clients"],
  [/voice|brand|aesthetic|tone|em-dash|profile/i, "voice-brand"],
  [/status[\s-]?board|hygiene|doctrine|codif|generalis|audit|meta/i, "meta"],
];

function inferFacet(name, triggers) {
  const hay = (name + " " + (triggers || "")).toLowerCase();
  for (const [re, facet] of FACET_RULES) if (re.test(hay)) return facet;
  return "meta";
}

const RECIPE_NAME = /recipe|release|-ship-|ship-recipe|-flow\b|scaffold|protocol/i;
const RECIPE_BODY = /^##\s*(steps|prerequisites|pre-flight|step-by-step)/im;

function inferCategory(defaultCat, name, body) {
  if (defaultCat) return defaultCat;
  // patterns/ default to doctrine, but split out recipes.
  if (RECIPE_NAME.test(name) || RECIPE_BODY.test(body)) return "recipes";
  return "doctrine";
}

function parseFrontmatter(text) {
  const out = { triggers: null, category: null, facet: null, status: null, title: null };
  const tline = text.match(/^triggers:\s*(.+)$/im);
  if (tline) out.triggers = tline[1].trim();
  const cline = text.match(/^category:\s*(.+)$/im);
  if (cline) out.category = cline[1].trim();
  const fline = text.match(/^facet:\s*(.+)$/im);
  if (fline) out.facet = fline[1].trim();
  const sline = text.match(/^status:\s*(.+)$/im);
  if (sline) out.status = sline[1].trim();
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) out.title = h1[1].trim();
  return out;
}

function stripFrontmatter(text) {
  // remove a leading --- ... --- block if present
  return text.replace(/^---[\s\S]*?---\s*/, "");
}

function tokenizeTriggers(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length >= 2);
}

function walk(dir, exclude, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (exclude && full.includes(exclude)) continue;
    if (e.isDirectory()) {
      // do not recurse into node_modules / .git / out
      if (/node_modules|\.git|\/out$/.test(full)) continue;
      walk(full, exclude, acc);
    } else if (e.isFile() && e.name.endsWith(".md") && e.name !== "INDEX.md") {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const full = process.argv.includes("--full");
  const db = open();
  const started = Date.now();
  db.exec("BEGIN");
  if (full) {
    db.exec("DELETE FROM triggers; DELETE FROM docs; DELETE FROM docs_fts;");
  }

  const upDoc = db.prepare(
    "INSERT INTO docs(path,category,facet,title,triggers_raw,status,source_root,sha256,mtime,body_len,last_indexed)" +
      " VALUES(@path,@category,@facet,@title,@triggers_raw,@status,@source_root,@sha256,@mtime,@body_len,@last_indexed)" +
      " ON CONFLICT(path) DO UPDATE SET category=@category,facet=@facet,title=@title,triggers_raw=@triggers_raw," +
      "status=@status,source_root=@source_root,sha256=@sha256,mtime=@mtime,body_len=@body_len,last_indexed=@last_indexed"
  );
  const getSha = db.prepare("SELECT sha256 FROM docs WHERE path=?");
  const delTrig = db.prepare("DELETE FROM triggers WHERE path=?");
  const insTrig = db.prepare("INSERT INTO triggers(trigger,path) VALUES(?,?)");
  const delFts = db.prepare("DELETE FROM docs_fts WHERE path=?");
  const insFts = db.prepare("INSERT INTO docs_fts(path,title,triggers,body) VALUES(?,?,?,?)");

  let scanned = 0;
  let changed = 0;
  for (const [root, defaultCat, label, exclude] of ROOTS) {
    if (!fs.existsSync(root)) continue;
    const files = walk(root, exclude, []);
    for (const fp of files) {
      scanned++;
      let text;
      try {
        text = fs.readFileSync(fp, "utf8");
      } catch (_) {
        continue;
      }
      const sha = crypto.createHash("sha256").update(text).digest("hex");
      if (!full) {
        const prev = getSha.get(fp);
        if (prev && prev.sha256 === sha) continue;
      }
      changed++;
      const fmeta = parseFrontmatter(text);
      const body = stripFrontmatter(text);
      const name = path.basename(fp, ".md");
      const category = fmeta.category || inferCategory(defaultCat, name, body);
      const facet = fmeta.facet || inferFacet(name, fmeta.triggers);
      const title = fmeta.title || name.replace(/-/g, " ");
      let mtime = 0;
      try {
        mtime = Math.round(fs.statSync(fp).mtimeMs);
      } catch (_) {}
      upDoc.run({
        path: fp,
        category,
        facet,
        title,
        triggers_raw: fmeta.triggers,
        status: fmeta.status,
        source_root: label,
        sha256: sha,
        mtime,
        body_len: body.length,
        last_indexed: started,
      });
      delTrig.run(fp);
      for (const t of tokenizeTriggers(fmeta.triggers)) insTrig.run(t, fp);
      delFts.run(fp);
      insFts.run(fp, title, fmeta.triggers || "", body.slice(0, 20000));
    }
  }

  db.prepare(
    "INSERT INTO index_runs(started_at,finished_at,mode,docs_scanned,docs_changed) VALUES(?,?,?,?,?)"
  ).run(started, Date.now(), full ? "full" : "incremental", scanned, changed);
  db.exec("COMMIT");

  const tot = db.prepare("SELECT COUNT(*) c FROM docs").get().c;
  const byCat = db.prepare("SELECT category, COUNT(*) c FROM docs GROUP BY category ORDER BY c DESC").all();
  db.close();
  process.stdout.write(
    `indexed ${changed} changed / ${scanned} scanned. total docs=${tot}\n` +
      byCat.map((r) => `  ${r.category}: ${r.c}`).join("\n") +
      "\n"
  );
}

main();
