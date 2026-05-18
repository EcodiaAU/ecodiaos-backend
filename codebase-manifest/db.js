"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "index.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function open(opts) {
  const options = opts || {};
  const db = new Database(DB_PATH, { readonly: !!options.readonly });
  if (!options.readonly) {
    const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(sql);
  } else {
    db.pragma("foreign_keys = ON");
  }
  return db;
}

module.exports = { open, DB_PATH, SCHEMA_PATH };
