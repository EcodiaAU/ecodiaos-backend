-- 113_meeting_analysis_edits.sql
-- Phase 1 of Meeting Analysis Editor: append-only edit audit log.
-- Every op applied by the editor agent is recorded here for undo history
-- and reanalysis context.
-- Authored by fork_mp3d5dpn_a2b6b4 (2026-05-13).

CREATE TABLE IF NOT EXISTS meeting_analysis_edits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES meeting_editor_sessions(id) ON DELETE SET NULL,
  edit_op       text NOT NULL,
  args          jsonb,
  affected_ids  text[],
  cascade_flags jsonb,
  applied_by    text NOT NULL DEFAULT 'tate',
  applied_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_analysis_edits_meeting
  ON meeting_analysis_edits(meeting_id, applied_at);

CREATE INDEX IF NOT EXISTS idx_meeting_analysis_edits_session
  ON meeting_analysis_edits(session_id, applied_at)
  WHERE session_id IS NOT NULL;

-- RLS enabled; backend uses service_role key (bypasses RLS)
ALTER TABLE meeting_analysis_edits ENABLE ROW LEVEL SECURITY;
