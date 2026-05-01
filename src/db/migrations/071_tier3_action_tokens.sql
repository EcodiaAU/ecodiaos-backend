-- §3.2 Tier-3 action token gate
-- Replaces the freetext tateGoaheadRef with HMAC-signed, single-use, expiring
-- tokens bound to {action_type, target_hash, session_id}.
-- See docs/SECURITY_HARDENING.md §3.2.

CREATE TABLE IF NOT EXISTS tier3_action_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tier3_action_tokens_session_idx
  ON tier3_action_tokens (session_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS tier3_action_tokens_expires_idx
  ON tier3_action_tokens (expires_at);
