-- §3.2 Tier-3 SMS OTP pending challenges
-- When auto-issue is denied (no pre-authorized pattern, or governance-domain
-- recipient), the gate dispatches an SMS to Tate with a 6-digit code that
-- must be replied to within 10 minutes.
-- See docs/SECURITY_HARDENING.md §3.2.

CREATE TABLE IF NOT EXISTS tier3_otp_pending (
  id BIGSERIAL PRIMARY KEY,
  otp_code TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tier3_otp_pending_session_idx
  ON tier3_otp_pending (session_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS tier3_otp_pending_expires_idx
  ON tier3_otp_pending (expires_at);
