-- §3.2 Pre-authorized action patterns for Tier-3 auto-issue
-- When an outbound action matches a row here, the Tier-3 gate auto-issues
-- and auto-consumes a token without requiring SMS-OTP. Empty by default
-- so no auto-issue path exists at ship time.
-- See docs/SECURITY_HARDENING.md §3.2.

CREATE TABLE IF NOT EXISTS authorized_action_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_name TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  matcher_json JSONB NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS authorized_action_patterns_action_idx
  ON authorized_action_patterns (action_type, active);
