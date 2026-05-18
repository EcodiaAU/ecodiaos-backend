PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  codebase_id TEXT NOT NULL,
  language TEXT,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  summary_50_words TEXT,
  summary_model TEXT,
  summary_cost_cents REAL,
  last_indexed INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_codebase ON files(codebase_id);
CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime);
CREATE INDEX IF NOT EXISTS idx_files_last_indexed ON files(last_indexed);

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER,
  signature TEXT,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_name_kind ON symbols(name, kind);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  imports_module TEXT NOT NULL,
  line INTEGER,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imports_module ON imports(imports_module);
CREATE INDEX IF NOT EXISTS idx_imports_file ON imports(file_path);

CREATE TABLE IF NOT EXISTS patterns_used (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  pattern_slug TEXT NOT NULL,
  line INTEGER,
  FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patterns_slug ON patterns_used(pattern_slug);
CREATE INDEX IF NOT EXISTS idx_patterns_file ON patterns_used(file_path);

CREATE TABLE IF NOT EXISTS index_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  mode TEXT NOT NULL,
  files_scanned INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  symbols_extracted INTEGER DEFAULT 0,
  summaries_generated INTEGER DEFAULT 0,
  haiku_cost_cents REAL DEFAULT 0,
  errors TEXT
);

CREATE INDEX IF NOT EXISTS idx_index_runs_started ON index_runs(started_at);
