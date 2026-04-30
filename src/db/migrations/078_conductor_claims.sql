-- Claim grammar persistence + verification tracking.
-- See docs/OBSERVABILITY_SPEC.md §3.

CREATE TABLE IF NOT EXISTS conductor_claims (
  id BIGSERIAL PRIMARY KEY,
  turn_id TEXT,
  session_id TEXT NOT NULL,
  action TEXT NOT NULL,                   -- 'deployed', 'emailed', 'committed', etc.
  handle_kv JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'verified' | 'failed' | 'action_unknown'
  verification_detail TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verification_lag_ms INTEGER
);

CREATE INDEX IF NOT EXISTS conductor_claims_session_idx
  ON conductor_claims (session_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS conductor_claims_pending_idx
  ON conductor_claims (verification_status, claimed_at)
  WHERE verification_status = 'pending';
CREATE INDEX IF NOT EXISTS conductor_claims_action_idx
  ON conductor_claims (action, verification_status);
