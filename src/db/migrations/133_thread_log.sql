-- 133_thread_log.sql
-- One-brain stateful coordination: unified thread log across voice/native/sms/tg/ide/away
-- Spec: backend/drafts/one-brain-stateful-coordination-2026-05-21.md §3.1
-- Migration is additive + rollback-safe.

CREATE TABLE IF NOT EXISTS thread_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts              timestamptz NOT NULL DEFAULT NOW(),
  thread_id       text NOT NULL DEFAULT 'tate',
  channel         text NOT NULL CHECK (channel IN ('voice','native','sms','telegram','ide','away','system')),
  role            text NOT NULL CHECK (role IN ('tate','ecodia','system')),
  body            text NOT NULL,
  case_id         uuid REFERENCES case_files(id) ON DELETE SET NULL,
  voice_call_id   text,
  source          text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  redact_after    timestamptz
);

-- Tail query: WHERE thread_id = $1 AND ts > $cursor ORDER BY ts DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_thread_log_tail
  ON thread_log (thread_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_thread_log_case
  ON thread_log (case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thread_log_voice_call
  ON thread_log (voice_call_id)
  WHERE voice_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thread_log_redact_pending
  ON thread_log (redact_after)
  WHERE redact_after IS NOT NULL;

COMMENT ON TABLE thread_log IS 'Unified cross-channel conversation log. One row per turn (voice transcript, ecodia reply, away result, ide note). Tailed on connect by every brain. Per spec one-brain-stateful-coordination-2026-05-21.';
COMMENT ON COLUMN thread_log.channel IS 'voice | native | sms | telegram | ide | away | system';
COMMENT ON COLUMN thread_log.role IS 'tate (Tate said) | ecodia (we said) | system (internal note)';
COMMENT ON COLUMN thread_log.case_id IS 'Links this turn to a case_file if applicable (HANDOFF resolution, case open, etc).';
COMMENT ON COLUMN thread_log.voice_call_id IS 'Groups all entries from one WS connection. Helps identify which call this turn came from.';
COMMENT ON COLUMN thread_log.redact_after IS 'When set, a daily cron blanks body to <expired> after this ts. Voice transcripts default 30d; cases + system entries default NULL (permanent).';
