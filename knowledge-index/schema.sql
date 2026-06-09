PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- One row per doctrine/reference/memory document.
CREATE TABLE IF NOT EXISTS docs (
  path TEXT PRIMARY KEY,
  category TEXT NOT NULL,      -- doctrine|recipes|reference|memory|identity|secrets|workbench
  facet TEXT,                  -- domain: release|gui|autonomy|memory|infra|comms|finance|clients|voice-brand|scheduler|meta
  title TEXT,
  triggers_raw TEXT,           -- the raw `triggers:` line
  status TEXT,                 -- active|narrowed|archived|validated_v1|untested_spec
  source_root TEXT NOT NULL,   -- which corpus root it came from
  sha256 TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  body_len INTEGER NOT NULL,
  last_indexed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_category ON docs(category);
CREATE INDEX IF NOT EXISTS idx_docs_facet ON docs(facet);
CREATE INDEX IF NOT EXISTS idx_docs_mtime ON docs(mtime);

-- One row per trigger keyword per doc - the L1 deterministic lookup table.
CREATE TABLE IF NOT EXISTS triggers (
  trigger TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_triggers_trigger ON triggers(trigger);
CREATE INDEX IF NOT EXISTS idx_triggers_path ON triggers(path);

-- FTS5 over title + triggers + body - the L3 BM25 keyword leg.
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  path UNINDEXED,
  title,
  triggers,
  body,
  tokenize = 'porter unicode61'
);

-- Dense embeddings (bge-small-en-v1.5, 384-dim float32 BLOB) - the L3 dense leg.
-- Cosine is brute-forced in JS over these (~1150 rows, sub-ms), so no sqlite-vec
-- native extension is needed. sha256 lets the embed pass skip unchanged docs.
CREATE TABLE IF NOT EXISTS vectors (
  path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  dim INTEGER NOT NULL,
  embedding BLOB NOT NULL,
  embedded_at INTEGER NOT NULL,
  FOREIGN KEY (path) REFERENCES docs(path) ON DELETE CASCADE
);

-- Index-run bookkeeping + freshness signal.
CREATE TABLE IF NOT EXISTS index_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  mode TEXT NOT NULL,
  docs_scanned INTEGER DEFAULT 0,
  docs_changed INTEGER DEFAULT 0,
  errors TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON index_runs(started_at);
