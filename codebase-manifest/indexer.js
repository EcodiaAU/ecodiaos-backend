"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { glob } = require("glob");
const chokidar = require("chokidar");

const { open, DB_PATH } = require("./db");
const { parseFile } = require("./parsers");
const { summariseFile } = require("./summarise");

const MANIFEST_PATH = path.join(__dirname, "manifest.json");

const ARGS = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const args = { mode: "full", since: null, codebase: null, noSummary: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") args.mode = "full";
    else if (a === "--watch") args.mode = "watch";
    else if (a === "--since") {
      args.mode = "since";
      args.since = parseInt(argv[++i], 10);
    }
    else if (a === "--codebase") args.codebase = argv[++i];
    else if (a === "--no-summary") args.noSummary = true;
    else if (a === "--quiet" || a === "-q") args.quiet = true;
  }
  return args;
}

function log() {
  if (ARGS.quiet) return;
  const args = ["[indexer]"].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function shouldSkipDir(name) {
  return name === "node_modules" || name === ".git" || name === "dist" || name === "build" || name === ".next" || name === "out" || name === "__pycache__" || name === ".venv" || name === "venv" || name === ".gradle";
}

async function listFiles(codebase) {
  const patterns = (codebase.watcher_glob || ["**/*"]);
  const ignore = (codebase.watcher_ignore || []).slice();
  ignore.push("**/node_modules/**", "**/.git/**");
  const all = new Set();
  for (const pat of patterns) {
    const matches = await glob(pat, {
      cwd: codebase.path,
      ignore,
      nodir: true,
      absolute: true,
      dot: false,
      windowsPathsNoEscape: true,
    });
    for (const f of matches) all.add(f.replace(/\\/g, "/"));
  }
  return Array.from(all);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function detectPatternSlugs(content, knownSlugs) {
  const found = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const slug of knownSlugs) {
      if (line.indexOf(slug) !== -1) {
        found.push({ slug: slug, line: i + 1 });
      }
    }
  }
  return found;
}

function loadKnownPatternSlugs(manifest) {
  const slugs = new Set();
  for (const cb of manifest.codebases) {
    if (cb.id !== "patterns-corpus" && !cb.patterns_subdir) continue;
    const patternsRoot = cb.patterns_subdir ? path.join(cb.path, cb.patterns_subdir) : cb.path;
    if (!fs.existsSync(patternsRoot)) continue;
    const files = fs.readdirSync(patternsRoot);
    for (const f of files) {
      if (f.endsWith(".md") && f !== "INDEX.md") {
        slugs.add(f.replace(/\.md$/, ""));
      }
    }
  }
  return Array.from(slugs);
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".md") return "markdown";
  if (ext === ".json") return "json";
  if (ext === ".sql") return "sql";
  if (ext === ".css") return "css";
  if (ext === ".html") return "html";
  return ext.replace(/^\./, "") || "unknown";
}

async function indexOne(db, statements, file, codebase, knownSlugs, opts) {
  const doSummarise = opts.summarise;
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    return { skipped: "read-error" };
  }
  const stat = fs.statSync(file);
  const sha = sha256(buf);

  const existing = statements.selectFile.get(file);
  if (existing && existing.sha256 === sha) {
    return { skipped: "unchanged" };
  }

  const content = buf.toString("utf8");
  const language = detectLanguage(file);
  const parsed = parseFile(content, file);

  let summary = existing ? existing.summary_50_words : null;
  let summaryModel = existing ? existing.summary_model : null;
  let costCents = 0;

  if (doSummarise && language !== "json" && content.length > 200) {
    const result = await summariseFile({
      filePath: file,
      language: language,
      content: content,
      symbols: parsed.symbols,
    });
    if (result.summary) {
      summary = result.summary;
      summaryModel = result.model;
      costCents = result.costCents;
    }
  }

  const now = Date.now();

  db.transaction(() => {
    statements.upsertFile.run({
      path: file,
      codebase_id: codebase.id,
      language: language,
      sha256: sha,
      size: stat.size,
      mtime: stat.mtimeMs | 0,
      summary_50_words: summary,
      summary_model: summaryModel,
      summary_cost_cents: costCents,
      last_indexed: now,
    });

    statements.deleteSymbols.run(file);
    for (const sym of parsed.symbols || []) {
      statements.insertSymbol.run({
        file_path: file,
        name: sym.name,
        kind: sym.kind,
        line_start: sym.line_start,
        line_end: sym.line_end || sym.line_start,
        signature: (sym.signature || "").slice(0, 500),
      });
    }

    statements.deleteImports.run(file);
    for (const imp of parsed.imports || []) {
      statements.insertImport.run({
        file_path: file,
        imports_module: imp.module,
        line: imp.line || 0,
      });
    }

    statements.deletePatternsUsed.run(file);
    if (knownSlugs.length) {
      const slugs = detectPatternSlugs(content, knownSlugs);
      for (const s of slugs) {
        statements.insertPatternUsed.run({
          file_path: file,
          pattern_slug: s.slug,
          line: s.line,
        });
      }
    }
  })();

  return {
    indexed: true,
    summarised: !!(summary && doSummarise),
    costCents: costCents,
  };
}

function prepareStatements(db) {
  return {
    selectFile: db.prepare("SELECT * FROM files WHERE path = ?"),
    upsertFile: db.prepare(
      "INSERT INTO files (path, codebase_id, language, sha256, size, mtime, summary_50_words, summary_model, summary_cost_cents, last_indexed)" +
      " VALUES (@path, @codebase_id, @language, @sha256, @size, @mtime, @summary_50_words, @summary_model, @summary_cost_cents, @last_indexed)" +
      " ON CONFLICT(path) DO UPDATE SET" +
      " codebase_id = excluded.codebase_id," +
      " language = excluded.language," +
      " sha256 = excluded.sha256," +
      " size = excluded.size," +
      " mtime = excluded.mtime," +
      " summary_50_words = excluded.summary_50_words," +
      " summary_model = excluded.summary_model," +
      " summary_cost_cents = excluded.summary_cost_cents," +
      " last_indexed = excluded.last_indexed"
    ),
    deleteSymbols: db.prepare("DELETE FROM symbols WHERE file_path = ?"),
    insertSymbol: db.prepare(
      "INSERT INTO symbols (file_path, name, kind, line_start, line_end, signature)" +
      " VALUES (@file_path, @name, @kind, @line_start, @line_end, @signature)"
    ),
    deleteImports: db.prepare("DELETE FROM imports WHERE file_path = ?"),
    insertImport: db.prepare(
      "INSERT INTO imports (file_path, imports_module, line) VALUES (@file_path, @imports_module, @line)"
    ),
    deletePatternsUsed: db.prepare("DELETE FROM patterns_used WHERE file_path = ?"),
    insertPatternUsed: db.prepare(
      "INSERT INTO patterns_used (file_path, pattern_slug, line) VALUES (@file_path, @pattern_slug, @line)"
    ),
    deleteFile: db.prepare("DELETE FROM files WHERE path = ?"),
    runStart: db.prepare(
      "INSERT INTO index_runs (started_at, mode, files_scanned, files_changed, summaries_generated, haiku_cost_cents, errors) VALUES (?, ?, 0, 0, 0, 0, NULL)"
    ),
    runFinish: db.prepare(
      "UPDATE index_runs SET finished_at = ?, files_scanned = ?, files_changed = ?, summaries_generated = ?, haiku_cost_cents = ?, errors = ? WHERE id = ?"
    ),
  };
}

async function runFull(opts) {
  const manifest = loadManifest();
  const db = open();
  const statements = prepareStatements(db);
  const knownSlugs = loadKnownPatternSlugs(manifest);
  log("known pattern slugs:", knownSlugs.length);

  const startTs = Date.now();
  const runRes = statements.runStart.run(startTs, opts.mode || "full");
  const runId = runRes.lastInsertRowid;

  let scanned = 0;
  let changed = 0;
  let summarised = 0;
  let costCents = 0;
  const errors = [];

  for (const cb of manifest.codebases) {
    if (opts.codebase && cb.id !== opts.codebase) continue;
    if (!fs.existsSync(cb.path)) {
      log("skip missing", cb.id, cb.path);
      continue;
    }
    log("scan", cb.id);
    let files;
    try {
      files = await listFiles(cb);
    } catch (err) {
      errors.push(cb.id + ":listFiles:" + err.message);
      continue;
    }
    log("  ", files.length, "files");

    for (const f of files) {
      if (opts.since && fs.statSync(f).mtimeMs < opts.since) continue;
      scanned++;
      try {
        const r = await indexOne(db, statements, f, cb, knownSlugs, {
          summarise: !opts.noSummary,
        });
        if (r.indexed) changed++;
        if (r.summarised) summarised++;
        costCents += r.costCents || 0;
      } catch (err) {
        errors.push(f + ":" + err.message);
      }
      if (scanned % 200 === 0) log("  ", scanned, "scanned,", changed, "changed,", summarised, "summarised,", costCents.toFixed(3), "cents");
    }
  }

  statements.runFinish.run(
    Date.now(),
    scanned,
    changed,
    summarised,
    costCents,
    errors.length ? errors.slice(0, 50).join("\n") : null,
    runId
  );

  log("done. scanned=" + scanned, "changed=" + changed, "summarised=" + summarised, "costCents=" + costCents.toFixed(3), "elapsed=" + ((Date.now() - startTs) / 1000).toFixed(1) + "s");
  if (errors.length) log("errors:", errors.length);
  db.close();
  return { scanned: scanned, changed: changed, summarised: summarised, costCents: costCents, errors: errors };
}

async function runWatch() {
  const manifest = loadManifest();
  const db = open();
  const statements = prepareStatements(db);
  const knownSlugs = loadKnownPatternSlugs(manifest);

  log("starting watcher across", manifest.codebases.length, "codebases");

  for (const cb of manifest.codebases) {
    if (!fs.existsSync(cb.path)) {
      log("skip missing", cb.id);
      continue;
    }
    const watcher = chokidar.watch(cb.watcher_glob || ["**/*"], {
      cwd: cb.path,
      ignored: function (file) {
        const base = path.basename(file);
        return shouldSkipDir(base);
      },
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    watcher.on("add", function (rel) { onChange(cb, rel); });
    watcher.on("change", function (rel) { onChange(cb, rel); });
    watcher.on("unlink", function (rel) { onUnlink(cb, rel); });
    watcher.on("error", function (err) { log("watcher error", cb.id, err.message); });
    log("  watching", cb.id);
  }

  async function onChange(cb, rel) {
    const f = path.join(cb.path, rel).replace(/\\/g, "/");
    try {
      const r = await indexOne(db, statements, f, cb, knownSlugs, { summarise: true });
      if (r.indexed) log("change", f.slice(-80), r.summarised ? "summarised" : "(no-summary)");
    } catch (err) {
      log("error indexing", f, err.message);
    }
  }

  function onUnlink(cb, rel) {
    const f = path.join(cb.path, rel).replace(/\\/g, "/");
    statements.deleteFile.run(f);
    log("unlink", f.slice(-80));
  }
}

async function main() {
  log("mode:", ARGS.mode);
  log("db:", DB_PATH);
  if (ARGS.mode === "watch") {
    await runWatch();
  } else {
    await runFull({ noSummary: ARGS.noSummary, codebase: ARGS.codebase, mode: ARGS.mode, since: ARGS.since });
    process.exit(0);
  }
}

main().catch(function (err) {
  console.error("[indexer] fatal", err);
  process.exit(1);
});