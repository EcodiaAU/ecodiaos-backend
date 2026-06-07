"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { open } = require("./db");

function shortPath(p) {
  return p
    .replace(/\\/g, "/")
    .replace(/^\/Users\/[^/]+\/\.code\//, "")
    .replace(/^D:\/\.code\//, "");
}

function fmtTs(ms) {
  if (!ms) return "(never)";
  const d = new Date(ms);
  const iso = d.toISOString();
  return iso.slice(0, 16).replace("T", " ") + "Z";
}

function getCommitSha(cwd) {
  try {
    const r = spawnSync("git", ["log", "-1", "--format=%h %s"], { cwd: cwd, encoding: "utf8" });
    if (r.status === 0) return (r.stdout || "").trim().slice(0, 80);
  } catch (_) {}
  return "(no git)";
}

function recentlyChangedFiles(db, sinceMs, perCb) {
  const stmt = db.prepare(
    "SELECT codebase_id, path, mtime FROM files WHERE mtime > ? ORDER BY mtime DESC LIMIT ?"
  );
  return stmt.all(sinceMs, perCb);
}

function topPatternsRecent(db, sinceMs, limit) {
  const stmt = db.prepare(
    "SELECT p.pattern_slug, COUNT(DISTINCT p.file_path) c FROM patterns_used p" +
    " JOIN files f ON p.file_path = f.path WHERE f.mtime > ? GROUP BY p.pattern_slug" +
    " ORDER BY c DESC, p.pattern_slug ASC LIMIT ?"
  );
  return stmt.all(sinceMs, limit);
}

function findWatcherByCmdline() {
  if (process.platform !== "win32") return null;
  try {
    const r = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*watcher-daemon.js*' } | Select-Object -ExpandProperty ProcessId -First 1"
      ],
      { encoding: "utf8" }
    );
    if (r.status === 0) {
      const pid = parseInt((r.stdout || "").trim(), 10);
      if (pid && !isNaN(pid)) return pid;
    }
  } catch (_) {}
  return null;
}

function watcherStatus() {
  const lockPath = path.join(__dirname, "watcher.pid");
  let pidFromFile = null;
  if (fs.existsSync(lockPath)) {
    pidFromFile = parseInt(fs.readFileSync(lockPath, "utf8").trim(), 10);
    if (pidFromFile && !isNaN(pidFromFile)) {
      try {
        process.kill(pidFromFile, 0);
        return { running: true, pid: pidFromFile };
      } catch (_) {}
    }
  }
  const livePid = findWatcherByCmdline();
  if (livePid) {
    try {
      fs.writeFileSync(lockPath, String(livePid));
    } catch (_) {}
    return { running: true, pid: livePid, recovered_from: pidFromFile || "no pid file" };
  }
  return { running: false, pid: pidFromFile, reason: pidFromFile ? "process gone" : "no pid file" };
}

function indexStaleness(db) {
  const last = db.prepare("SELECT * FROM index_runs ORDER BY started_at DESC LIMIT 1").get();
  if (!last) return { stale: true, reason: "no runs ever" };
  const ageMin = Math.round((Date.now() - last.started_at) / 60000);
  return {
    stale: ageMin > 60,
    age_minutes: ageMin,
    last_run_at: fmtTs(last.started_at),
    last_run_mode: last.mode,
    files_changed_last_run: last.files_changed,
  };
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
}

function main() {
  const since = Date.now() - 24 * 3600 * 1000;
  const manifest = loadManifest();
  const db = open({ readonly: true });
  let out = "";

  out += "# Codebase orient brief - " + new Date().toISOString().slice(0, 10) + "\n\n";

  out += "## Active codebases + recent commit\n";
  for (const cb of manifest.codebases) {
    if (!fs.existsSync(cb.path)) {
      out += "- " + cb.id + ": MISSING (" + cb.path + ")\n";
      continue;
    }
    const sha = getCommitSha(cb.path);
    out += "- **" + cb.id + "** (" + cb.language + "): " + sha + "\n";
  }
  out += "\n";

  out += "## Files modified in the last 24h (per codebase)\n";
  const recent = recentlyChangedFiles(db, since, 200);
  const grouped = {};
  for (const r of recent) {
    if (!grouped[r.codebase_id]) grouped[r.codebase_id] = [];
    grouped[r.codebase_id].push(r);
  }
  const cbIds = Object.keys(grouped).sort();
  if (!cbIds.length) {
    out += "(none)\n\n";
  } else {
    for (const id of cbIds) {
      const list = grouped[id];
      out += "- **" + id + "**: " + list.length + " files\n";
      for (const r of list.slice(0, 5)) {
        out += "  - " + shortPath(r.path) + " (" + fmtTs(r.mtime) + ")\n";
      }
      if (list.length > 5) out += "  - ... +" + (list.length - 5) + " more\n";
    }
    out += "\n";
  }

  out += "## Top 5 patterns referenced in recently-changed code\n";
  const top = topPatternsRecent(db, since, 5);
  if (!top.length) {
    out += "(none)\n\n";
  } else {
    for (const t of top) {
      out += "- `" + t.pattern_slug + "` (in " + t.c + " files)\n";
    }
    out += "\n";
  }

  out += "## Indexer health\n";
  const stale = indexStaleness(db);
  out += "- last run: " + (stale.last_run_at || "never") + " (" + stale.age_minutes + "m ago, mode=" + stale.last_run_mode + ", " + stale.files_changed_last_run + " files changed)\n";
  out += "- stale: " + stale.stale + "\n";
  const ws = watcherStatus();
  out += "- watcher: " + (ws.running ? ("running (pid " + ws.pid + ")") : ("NOT running" + (ws.reason ? " (" + ws.reason + ")" : ""))) + "\n";

  const tot = db.prepare("SELECT COUNT(*) c FROM files").get().c;
  const sumd = db.prepare("SELECT COUNT(*) c FROM files WHERE summary_50_words IS NOT NULL").get().c;
  out += "- index size: " + tot + " files indexed, " + sumd + " summarised (" + (tot ? Math.round((sumd / tot) * 100) : 0) + " pct)\n";

  db.close();
  process.stdout.write(out);
}

main();