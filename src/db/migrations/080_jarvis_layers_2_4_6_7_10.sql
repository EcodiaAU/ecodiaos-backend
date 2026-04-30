-- 080: Jarvis Layers 2, 4, 6, 7, 10 — proactivity, perception, time sense, economic governance, evolution
--
-- Layer 4: os_observations (perception bus event store)
-- Layer 7: organism_goals.fork_budget_remaining (per-goal fork cap)
-- Layer 7: claude_usage.client_id / project_id (cost attribution)

-- ═══════════════════════════════════════════════════════════════════════
-- LAYER 4 — Perception bus event store
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS os_observations (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  kind          TEXT NOT NULL,
  data          JSONB,
  confidence    REAL DEFAULT 1.0,
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_to_kg BOOLEAN DEFAULT FALSE,
  kg_node_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_os_observations_observed_at
  ON os_observations (observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_os_observations_source_kind
  ON os_observations (source, kind, observed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- LAYER 7 — Per-goal fork budget
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE organism_goals
  ADD COLUMN IF NOT EXISTS fork_budget_remaining INTEGER DEFAULT 10;

-- ═══════════════════════════════════════════════════════════════════════
-- LAYER 7 — Cost attribution on claude_usage
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE claude_usage
  ADD COLUMN IF NOT EXISTS client_id TEXT;

ALTER TABLE claude_usage
  ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_claude_usage_client
  ON claude_usage (client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claude_usage_project
  ON claude_usage (project_id) WHERE project_id IS NOT NULL;
