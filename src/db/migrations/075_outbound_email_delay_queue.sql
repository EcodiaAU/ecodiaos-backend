-- §3.4 24-hour delay queue for unknown recipients.
-- Any outbound email to an address Ecodia hasn't corresponded with in the
-- last 30 days enters this queue. Tate gets one daily digest with approve
-- or discard actions. Prevents "spam the new contact list" amplification
-- after a prompt-injection compromise without slowing real client comms.
-- See docs/SECURITY_HARDENING.md §3.4.

CREATE TABLE IF NOT EXISTS outbound_email_delay_queue (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  cc_addresses TEXT[] DEFAULT ARRAY[]::TEXT[],
  bcc_addresses TEXT[] DEFAULT ARRAY[]::TEXT[],
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  thread_id TEXT,
  -- Analysis attached at enqueue time so the daily digest can render
  -- commitment detector verdicts without re-running the classifier.
  commitment_risk TEXT,
  commitment_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  release_at TIMESTAMPTZ NOT NULL,
  -- status: 'pending' | 'approved' | 'discarded' | 'sent' | 'expired'
  status TEXT NOT NULL DEFAULT 'pending',
  -- tate_decision: 'approve' | 'discard' when Tate acts via digest link
  tate_decision TEXT,
  tate_decision_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_message_id TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS outbound_email_delay_queue_status_idx
  ON outbound_email_delay_queue (status, release_at);
CREATE INDEX IF NOT EXISTS outbound_email_delay_queue_to_idx
  ON outbound_email_delay_queue (to_address, queued_at DESC);
CREATE INDEX IF NOT EXISTS outbound_email_delay_queue_session_idx
  ON outbound_email_delay_queue (session_id, queued_at DESC);
