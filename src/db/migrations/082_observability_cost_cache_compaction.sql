-- migrations/082_observability_cost_cache_compaction.sql
--
-- Tier A audit remediation 2026-05-01 (fork_mom9j8g9_5ab468). Three additive
-- observability changes, no behaviour change to existing code paths:
--
--   (a) claude_usage gains cache_creation_input_tokens + cache_read_input_tokens
--       columns. cost_usd column already existed but was never populated; this
--       migration leaves the column shape alone, the corresponding code change
--       (anthropicPricing.js + usageEnergyService.logUsage extension) starts
--       persisting it.
--   (b) compaction_events table records every SDK compact_boundary fire.
--       Before this we only had logger.info breadcrumbs; the /ops dashboard
--       had no time-series view of compaction frequency.
--
-- Migration number: 082 chosen by reading existing migration filenames; 079 has
-- a known 3-way collision (row b50d462e tracks). 080 + 081 are clean. Next
-- free is 082. Documented per the parent conductor's done-when criterion #4.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.

-- (a) extend claude_usage with cache token signals from Anthropic SDK usage field
ALTER TABLE claude_usage ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE claude_usage ADD COLUMN IF NOT EXISTS cache_read_input_tokens     INTEGER NOT NULL DEFAULT 0;

-- (b) compaction_events: one row per SDK compact_boundary 'start' (or singleton)
-- Schema mirrors the audit brief request shape:
--   fired_at, threshold, prefix_tokens_at_fire, post_compact_tokens, reason
-- post_compact_tokens may be NULL until the matching compact_boundary 'end' arrives.
CREATE TABLE IF NOT EXISTS compaction_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cc_session_id        uuid,
  fired_at             timestamptz NOT NULL DEFAULT NOW(),
  threshold            integer,
  prefix_tokens_at_fire integer,
  post_compact_tokens  integer,
  reason               text,            -- 'sdk_boundary' | 'threshold_hit' | 'synthetic_end_timeout'
  duration_ms          integer,         -- populated when end-marker matches
  ended_at             timestamptz,
  metadata             jsonb
);

CREATE INDEX IF NOT EXISTS idx_compaction_events_fired_at  ON compaction_events (fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_compaction_events_session   ON compaction_events (cc_session_id, fired_at DESC);
