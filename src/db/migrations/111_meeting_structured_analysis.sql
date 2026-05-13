-- 111_meeting_structured_analysis.sql
-- Phase 1 of Meeting Analysis Editor: add structured_analysis column to meeting_recordings.
-- This is the canonical state the editor reads/writes.
-- analysis_json and action_items_json remain as read-only historical blobs.
-- Authored by fork_mp3d5dpn_a2b6b4 (2026-05-13).

ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS structured_analysis jsonb,
  ADD COLUMN IF NOT EXISTS structured_analysis_version text DEFAULT '1',
  ADD COLUMN IF NOT EXISTS structured_analysis_migrated_at timestamptz;

COMMENT ON COLUMN meeting_recordings.structured_analysis IS
  'Canonical ID-stable graph-connected analysis object for the Meeting Analysis Editor (v1 schema). Backfilled from analysis_json + action_items_json. Editor reads/writes this; analysis_json is historical read-only.';

COMMENT ON COLUMN meeting_recordings.structured_analysis_version IS
  'Schema version of structured_analysis. Bump on breaking shape changes.';

COMMENT ON COLUMN meeting_recordings.structured_analysis_migrated_at IS
  'Timestamp of initial backfill from analysis_json + action_items_json into structured_analysis.';
