-- §2.2 Dual-reviewer columns on cc_sessions
-- Review B (security-only, diff-isolated) runs after Review A for any
-- self-modification session. Its go/no-go result is persisted here so
-- deploymentService.deploySession() can hard-block on a missing approval.
-- See docs/SECURITY_HARDENING.md §2.2.

ALTER TABLE cc_sessions
  ADD COLUMN IF NOT EXISTS security_review_status TEXT,
  ADD COLUMN IF NOT EXISTS security_review_concerns JSONB,
  ADD COLUMN IF NOT EXISTS security_review_at TIMESTAMPTZ;

-- Values: 'approved' | 'rejected' | 'shadow_approved' | 'shadow_rejected'
-- Shadow variants are written while SECURITY_DUAL_REVIEWER_ENFORCE != '1',
-- so the gate runs and records verdicts without yet blocking deploys.
-- Null = gate did not run (non-self-mod session, or feature disabled).

CREATE INDEX IF NOT EXISTS cc_sessions_security_review_status_idx
  ON cc_sessions (security_review_status);
