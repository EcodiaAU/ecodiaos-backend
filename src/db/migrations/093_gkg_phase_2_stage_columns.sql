-- GKG Phase 2 stage-tracking columns + indexes.
--
-- Authored 7 May 2026 by fork_mov80as1_c968cc for GKG Phase 2.
-- Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md (commit 390fd61).
-- Status_board P2 row 04599f46-b09f-4958-8129-01bf8e693109.
--
-- Phase 1 already shipped `processed_at` as a single end-of-pipeline marker.
-- Phase 2 splits the pipeline into 4 stages so a partial-progress row can
-- resume from the next-pending stage without redoing earlier stages:
--
--   1. classified_at      - row has been mapped to its UIAction record (if
--                            applicable: only click_with_uia + screenshot
--                            event types contribute UIAction nodes; other
--                            event_types skip directly to processed_at).
--   2. enriched_at        - vision-call against the click frame returned a
--                            `purpose` string (or was skipped because no
--                            frame is available + we marked it skipped).
--   3. embedded_at        - purpose + element_text + handler embedded.
--   4. graph_upserted_at  - Neo4j MERGE landed for the corresponding
--                            :Handler / :UIAction / :LEADS_TO / :RUNS_HANDLER
--                            mutations.
--
-- Pipeline ordering (per-row):
--   classified_at  -> enriched_at  -> embedded_at  -> graph_upserted_at
-- After graph_upserted_at, the row also gets processed_at = NOW() so the
-- existing Phase 1 idx_gkg_events_unprocessed partial index reflects the
-- final terminal state.
--
-- Idempotency: every column is timestamptz. NULL = stage pending. NOT NULL =
-- stage done. Re-running a stage is a no-op (the prior NOT NULL value
-- remains; the pipeline filters WHERE <stage>_at IS NULL).

ALTER TABLE gkg_events
  ADD COLUMN IF NOT EXISTS classified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS enriched_at        timestamptz,
  ADD COLUMN IF NOT EXISTS embedded_at        timestamptz,
  ADD COLUMN IF NOT EXISTS graph_upserted_at  timestamptz;

-- Partial indexes for each pending-stage scan so the Phase 2 cron can sweep
-- in O(log N) per stage rather than full-table-scanning gkg_events.

CREATE INDEX IF NOT EXISTS idx_gkg_events_pending_classify
  ON gkg_events (timestamp_iso)
  WHERE classified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gkg_events_pending_enrich
  ON gkg_events (timestamp_iso)
  WHERE classified_at IS NOT NULL AND enriched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gkg_events_pending_embed
  ON gkg_events (timestamp_iso)
  WHERE enriched_at IS NOT NULL AND embedded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gkg_events_pending_upsert
  ON gkg_events (timestamp_iso)
  WHERE embedded_at IS NOT NULL AND graph_upserted_at IS NULL;

COMMENT ON COLUMN gkg_events.classified_at IS
  'GKG Phase 2 stage 1: row mapped to UIAction record (or marked non-action). NULL = pending classification.';
COMMENT ON COLUMN gkg_events.enriched_at IS
  'GKG Phase 2 stage 2: vision-purpose attached (or skipped). NULL = pending enrich.';
COMMENT ON COLUMN gkg_events.embedded_at IS
  'GKG Phase 2 stage 3: embedding vector computed. NULL = pending embed.';
COMMENT ON COLUMN gkg_events.graph_upserted_at IS
  'GKG Phase 2 stage 4: Neo4j MERGE landed. NULL = pending graph upsert.';
