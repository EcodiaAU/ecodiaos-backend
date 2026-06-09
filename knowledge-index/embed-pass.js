"use strict";

// Incremental embedding pass - the dense-leg refresh. Embeds every doc whose
// sha256 changed (or has no vector yet) and stores the 384-dim float32 BLOB.
// Separate from the (sync, fast) keyword indexer so the keyword index stays
// instant and the slow embedding work runs on its own cadence. Idempotent.
//
// Run: node embed-pass.js          (incremental)
//      node embed-pass.js --full   (re-embed everything)
//
// The text embedded is the contextual prefix (title + triggers) plus the body
// head - Anthropic's contextual-prefixing lever, which lifts retrieval quality
// well above embedding the raw body alone.

const fs = require("fs");
const { open } = require("./db");
const { embed, vecToBuf, DIM } = require("./embed");

function embedText(row) {
  const head = [];
  if (row.title) head.push(row.title);
  if (row.triggers_raw) head.push(row.triggers_raw);
  let body = "";
  try {
    body = fs.readFileSync(row.path, "utf8").replace(/^---[\s\S]*?---\s*/, "");
  } catch (_) {}
  return (head.join(". ") + "\n" + body).slice(0, 4000);
}

const LOCK = require("path").join(__dirname, ".embed.lock");

function acquireLock() {
  try {
    const st = fs.existsSync(LOCK) ? fs.statSync(LOCK) : null;
    // stale lock older than 10 min is ignored
    if (st && Date.now() - st.mtimeMs < 600000) return false;
    fs.writeFileSync(LOCK, String(process.pid));
    return true;
  } catch (_) {
    return true;
  }
}
function releaseLock() {
  try {
    fs.unlinkSync(LOCK);
  } catch (_) {}
}

async function main() {
  const full = process.argv.includes("--full");
  if (!acquireLock()) {
    process.stdout.write("embed-pass: another instance is running, skipping\n");
    return;
  }
  process.on("exit", releaseLock);
  const db = open();

  const docs = db.prepare("SELECT path, title, triggers_raw, sha256 FROM docs").all();
  const haveStmt = db.prepare("SELECT sha256 FROM vectors WHERE path = ?");
  const upStmt = db.prepare(
    "INSERT INTO vectors(path,sha256,dim,embedding,embedded_at) VALUES(@path,@sha256,@dim,@embedding,@at)" +
      " ON CONFLICT(path) DO UPDATE SET sha256=@sha256,dim=@dim,embedding=@embedding,embedded_at=@at"
  );

  const todo = [];
  for (const d of docs) {
    if (!full) {
      const prev = haveStmt.get(d.path);
      if (prev && prev.sha256 === d.sha256) continue;
    }
    todo.push(d);
  }

  // prune vectors whose doc is gone
  db.prepare("DELETE FROM vectors WHERE path NOT IN (SELECT path FROM docs)").run();

  let done = 0;
  const t0 = Date.now();
  for (const d of todo) {
    let vec;
    try {
      vec = await embed(embedText(d));
    } catch (e) {
      process.stderr.write(`embed-fail ${d.path}: ${e.message}\n`);
      continue;
    }
    upStmt.run({ path: d.path, sha256: d.sha256, dim: DIM, embedding: vecToBuf(vec), at: Date.now() });
    done++;
    if (done % 100 === 0) process.stdout.write(`  embedded ${done}/${todo.length} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
  }

  const total = db.prepare("SELECT COUNT(*) c FROM vectors").get().c;
  db.close();
  process.stdout.write(`embed-pass: ${done} embedded / ${todo.length} pending. total vectors=${total}. ${Math.round((Date.now() - t0) / 1000)}s\n`);
}

main();
