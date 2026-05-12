-- 103_meeting_email_sends.sql
-- Audit log for meeting analysis emails sent from the UI.
-- Authored by fork_mp26v2vz_0d1bb2 (2026-05-12).

CREATE TABLE IF NOT EXISTS meeting_email_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  sent_to           TEXT[] NOT NULL,
  subject           TEXT,
  resend_message_id TEXT,
  status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'error')),
  error_text        TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_email_sends_meeting_id
  ON meeting_email_sends(meeting_id);

-- RLS enabled; backend uses service_role key (bypasses RLS)
ALTER TABLE meeting_email_sends ENABLE ROW LEVEL SECURITY;
