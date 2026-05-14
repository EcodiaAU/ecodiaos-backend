-- 121: pattern_fire_event — observability for pattern surfacing
--
-- Closes the "patterns surface but no telemetry on whether they helped" gap
-- from AUTONOMY_AUDIT_2026-05-13 (memory/perception audit, finding 2.1).
--
-- Every time patternsRetrieval.semanticSearch returns a pattern that the
-- conductor's turn-prep injects into context, one row lands here with
-- conductor_accepted=NULL. A post-turn classifier flips it TRUE/FALSE based
-- on whether the assistant response or subsequent tool calls reference the
-- pattern's slug or its declared subject.
--
-- The aggregates power:
--   - auto-suppress: patterns with fire_count >= 20 and accept_rate < 5% in
--     the last 14 days flip to status='narrowed' in pattern frontmatter.
--   - cold-start: surface "patterns never fired" to the weekly tuning cron.
--   - decision-quality: cross-reference high-acceptance patterns against
--     outcomes recorded in dispatch_event.

CREATE TABLE IF NOT EXISTS public.pattern_fire_event (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_path         TEXT NOT NULL,                -- filesystem path or Neo4j slug
  pattern_source       TEXT NOT NULL DEFAULT 'filesystem'
                         CHECK (pattern_source IN ('filesystem', 'neo4j')),
  query_text_hash      TEXT,                          -- sha256 of the query text used to surface
  query_text_excerpt   TEXT,                          -- first 300 chars for human inspection
  turn_id              TEXT,                          -- ties to osSessionService currentTurnId
  dispatch_event_id    UUID,                          -- ties to dispatch_event when surfaced via that path
  conductor_accepted   BOOLEAN,                       -- NULL until classifier flips
  acceptance_signal    TEXT,                          -- 'slug_in_response' | 'tool_call_match' | 'manual_ack' | 'no_signal'
  similarity_score     DOUBLE PRECISION,              -- carried from semanticSearch result
  metadata             JSONB NOT NULL DEFAULT '{}',
  fired_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acked_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pattern_fire_event_path_idx
  ON public.pattern_fire_event (pattern_path, fired_at DESC);

CREATE INDEX IF NOT EXISTS pattern_fire_event_turn_idx
  ON public.pattern_fire_event (turn_id)
  WHERE turn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pattern_fire_event_unacked_idx
  ON public.pattern_fire_event (fired_at DESC)
  WHERE conductor_accepted IS NULL;

COMMENT ON TABLE public.pattern_fire_event IS
  'One row per pattern surface. NULL conductor_accepted is the pending state; flip after post-turn classifier runs.';
