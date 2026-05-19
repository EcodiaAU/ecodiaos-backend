-- Migration 130: tate_priority column on status_board
-- Dual consumer:
--   1. iOS native widget (top-3 glance via /api/native/tate-priority)
--   2. headlessConductor _loadTurnContext (triage context filter)
-- Curated by tatePriorityCurator (set() / refresh()) and by Opus via the
-- set_tate_priority tool.
--
-- Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
BEGIN;

ALTER TABLE status_board
  ADD COLUMN IF NOT EXISTS tate_priority int NULL
    CHECK (tate_priority IS NULL OR tate_priority BETWEEN 1 AND 3);

CREATE INDEX IF NOT EXISTS idx_status_board_tate_priority
  ON status_board (tate_priority)
  WHERE tate_priority IS NOT NULL;

COMMIT;
