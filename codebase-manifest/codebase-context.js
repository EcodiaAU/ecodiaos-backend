"use strict";

const path = require("path");
const fs = require("fs");
const { open } = require("./db");

function context(opts) {
  const t0 = Date.now();
  const codebaseId = opts.codebase_id || "*";
  const queryType = opts.query_type;
  const query = (opts.query || "").trim();
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit || 20, 10)));
  const db = open({ readonly: true });
  try {
    if (!queryType) throw new Error("query_type required");
    let rows = [];
    switch (queryType) {
      case "find_symbol":
        rows = findSymbol(db, codebaseId, query, limit);
        break;
      case "find_callers":
        rows = findCallers(db, codebaseId, query, limit);
        break;
      case "find_pattern_users":
        rows = findPatternUsers(db, codebaseId, query, limit);
        break;
      case "file_summary":
        rows = fileSummary(db, codebaseId, query, limit);
        break;
      case "recently_changed":
        rows = recentlyChanged(db, codebaseId, query, limit);
        break;
      case "find_imports_of":
        rows = findImportsOf(db, codebaseId, query, limit);
        break;
      default:
        throw new Error("unknown query_type: " + queryType);
    }
    return {
      query_type: queryType,
      query: query,
      codebase_id: codebaseId,
      latency_ms: Date.now() - t0,
      result_count: rows.length,
      results: rows,
    };
  } finally {
    db.close();
  }
}

function codebaseFilter(codebaseId, alias) {
  if (codebaseId === "*" || !codebaseId) return { sql: "", params: [] };
  const prefix = alias ? alias + "." : "";
  return { sql: " AND " + prefix + "codebase_id = ?", params: [codebaseId] };
}

function findSymbol(db, codebaseId, query, limit) {
  const cb = codebaseFilter(codebaseId, "f");
  const sql =
    "SELECT s.name, s.kind, s.line_start, s.line_end, s.signature," +
    " f.path AS file, f.codebase_id, f.language, f.summary_50_words" +
    " FROM symbols s JOIN files f ON s.file_path = f.path" +
    " WHERE (s.name = ? OR s.name LIKE ?)" + cb.sql +
    " ORDER BY (s.name = ?) DESC, length(s.name) ASC, f.codebase_id ASC" +
    " LIMIT ?";
  return db.prepare(sql).all([query, "%" + query + "%", ...cb.params, query, limit]);
}

function findCallers(db, codebaseId, query, limit) {
  const cb = codebaseFilter(codebaseId, "f");
  const sql =
    "SELECT i.imports_module AS module, i.line, f.path AS file, f.codebase_id, f.language, f.summary_50_words" +
    " FROM imports i JOIN files f ON i.file_path = f.path" +
    " WHERE i.imports_module LIKE ?" + cb.sql +
    " ORDER BY f.codebase_id, f.path LIMIT ?";
  return db.prepare(sql).all(["%" + query + "%", ...cb.params, limit]);
}

function findImportsOf(db, codebaseId, query, limit) {
  const cb = codebaseFilter(codebaseId, "f");
  const sql =
    "SELECT i.imports_module, i.line, f.path AS file, f.codebase_id" +
    " FROM imports i JOIN files f ON i.file_path = f.path" +
    " WHERE f.path LIKE ?" + cb.sql +
    " ORDER BY i.line LIMIT ?";
  return db.prepare(sql).all(["%" + query + "%", ...cb.params, limit]);
}

function findPatternUsers(db, codebaseId, query, limit) {
  const cb = codebaseFilter(codebaseId, "f");
  const sql =
    "SELECT p.pattern_slug, p.line, f.path AS file, f.codebase_id, f.language, f.summary_50_words" +
    " FROM patterns_used p JOIN files f ON p.file_path = f.path" +
    " WHERE p.pattern_slug LIKE ?" + cb.sql +
    " ORDER BY f.codebase_id, f.path, p.line LIMIT ?";
  return db.prepare(sql).all(["%" + query + "%", ...cb.params, limit]);
}

function fileSummary(db, codebaseId, query, limit) {
  const cb = codebaseFilter(codebaseId, "");
  const sql =
    "SELECT path, codebase_id, language, sha256, size, mtime, summary_50_words, summary_model, summary_cost_cents, last_indexed" +
    " FROM files WHERE path LIKE ?" + cb.sql +
    " ORDER BY mtime DESC LIMIT ?";
  return db.prepare(sql).all(["%" + query + "%", ...cb.params, limit]);
}

function recentlyChanged(db, codebaseId, sinceArg, limit) {
  const since = sinceArg ? Number(sinceArg) : Date.now() - 24 * 3600 * 1000;
  const cb = codebaseFilter(codebaseId, "");
  const sql =
    "SELECT path, codebase_id, language, mtime, summary_50_words" +
    " FROM files WHERE mtime > ?" + cb.sql +
    " ORDER BY mtime DESC LIMIT ?";
  return db.prepare(sql).all([since, ...cb.params, limit]);
}

function stats() {
  const db = open({ readonly: true });
  try {
    const filesPerCb = db.prepare("SELECT codebase_id, COUNT(*) c FROM files GROUP BY codebase_id ORDER BY c DESC").all();
    const totalFiles = db.prepare("SELECT COUNT(*) c FROM files").get().c;
    const totalSymbols = db.prepare("SELECT COUNT(*) c FROM symbols").get().c;
    const totalImports = db.prepare("SELECT COUNT(*) c FROM imports").get().c;
    const totalPatterns = db.prepare("SELECT COUNT(*) c FROM patterns_used").get().c;
    const summarised = db.prepare("SELECT COUNT(*) c FROM files WHERE summary_50_words IS NOT NULL").get().c;
    const lastRun = db.prepare("SELECT * FROM index_runs ORDER BY started_at DESC LIMIT 1").get();
    return {
      total_files: totalFiles,
      total_symbols: totalSymbols,
      total_imports: totalImports,
      total_patterns_used: totalPatterns,
      files_summarised: summarised,
      summarisation_pct: totalFiles ? Math.round((summarised / totalFiles) * 1000) / 10 : 0,
      files_per_codebase: filesPerCb,
      last_run: lastRun,
    };
  } finally {
    db.close();
  }
}

module.exports = { context, stats };