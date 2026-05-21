-- 132_case_files.sql
-- One-brain stateful coordination: case_files track in-flight work across voice/away/IDE
-- Spec: backend/drafts/one-brain-stateful-coordination-2026-05-21.md §3.2
-- Migration is additive + rollback-safe (DROP TABLE wipes it).

CREATE TABLE IF NOT EXISTS case_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       text NOT NULL DEFAULT 'tate',
  opened_at       timestamptz NOT NULL DEFAULT NOW(),
  opened_by       text NOT NULL,
  opened_in_call  text,
  prompt          text NOT NULL,
  status          text NOT NULL CHECK (status IN ('open','working','resolved','abandoned','blocked')) DEFAULT 'open',
  blocking_on     text,
  result          text,
  resolved_at     timestamptz,
  acknowledged_at timestamptz,
  delivered_via   text[] NOT NULL DEFAULT ARRAY[]::text[],
  hops            int NOT NULL DEFAULT 0,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_case_files_open
  ON case_files (thread_id, status)
  WHERE status IN ('open','working','blocked');

CREATE INDEX IF NOT EXISTS idx_case_files_opened_in_call
  ON case_files (opened_in_call)
  WHERE opened_in_call IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_case_files_unacked
  ON case_files (thread_id, resolved_at)
  WHERE status = 'resolved' AND acknowledged_at IS NULL;

COMMENT ON TABLE case_files IS 'In-flight work crossing voice/away/IDE contexts. Opens on HANDOFF/escalation, closes on delivery+ack. Per spec one-brain-stateful-coordination-2026-05-21.';
COMMENT ON COLUMN case_files.opened_by IS 'voice | native | sms | telegram | ide | cron';
COMMENT ON COLUMN case_files.opened_in_call IS 'voice_call_id when opened during a call, links case to its originating WS connection';
COMMENT ON COLUMN case_files.delivered_via IS 'Channels that have already received the result. Prevents double-send.';
COMMENT ON COLUMN case_files.hops IS 'Increments on each re-HANDOFF for same case. Cap at 3 to prevent infinite loops.';
