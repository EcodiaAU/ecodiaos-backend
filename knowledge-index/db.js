"use strict";

// better-sqlite3 is reused from the sibling codebase-manifest install (same
// native binary, FTS5-enabled) so the knowledge index needs no separate npm
// install. If that ever moves, `npm i better-sqlite3` in this dir restores it.
const path = require("path");
const fs = require("fs");

let Database;
try {
  Database = require("better-sqlite3");
} catch (_) {
  Database = require(path.join(
    __dirname,
    "..",
    "codebase-manifest",
    "node_modules",
    "better-sqlite3"
  ));
}

const DB_PATH = path.join(__dirname, "index.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function open(opts) {
  const options = opts || {};
  const db = new Database(DB_PATH, { readonly: !!options.readonly });
  if (!options.readonly) {
    db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  }
  return db;
}

module.exports = { open, DB_PATH, SCHEMA_PATH };
