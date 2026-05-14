-- 119: outbound_actions — durable audit + verification ledger for external sends
--
-- Closes the "system claims success without verifying" gap from
-- AUTONOMY_AUDIT_2026-05-13 (integrations audit, primary finding).
--
-- Every Tier-3 outbound action (email, deploy, invoice, sms, push) records a
-- row here at the moment of dispatch with status='pending'. A verifier callback
-- flips it to 'verified' when post-send confirmation succeeds, or 'failed' when
-- it does not. Stuck rows (status='pending' for >30min) are surfaced to the
-- conductor as observer signals.
--
-- This is the audit table; the runtime wrapper lives at src/lib/actionVerification.js.

CREATE TABLE IF NOT EXISTS public.outbound_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type     TEXT NOT NULL,           -- 'email_send' | 'vercel_deploy' | 'stripe_invoice' | 'sms' | 'push' | ...
  action_key      TEXT,                    -- caller-supplied idempotency key (recipient+subject hash, deploy hash, invoice ref, ...)
  target          TEXT,                    -- human-readable target (recipient email, project name, invoice ref, ...)
  payload_hash    TEXT,                    -- sha256 of the meaningful payload, for dedup
  external_id     TEXT,                    -- vendor's id after dispatch (Gmail message_id, Vercel deployment id, Stripe invoice id)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'dispatched', 'verified', 'failed', 'abandoned')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  dispatched_at   TIMESTAMPTZ,
  verified_at     TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_actions_status_idx
  ON public.outbound_actions (status, created_at DESC)
  WHERE status IN ('pending', 'dispatched');

CREATE INDEX IF NOT EXISTS outbound_actions_action_type_idx
  ON public.outbound_actions (action_type, created_at DESC);

-- Idempotency support: caller passes (action_type, action_key) and we de-dup on
-- the partial unique index. Only enforced when action_key is non-null because
-- not every action_type needs idempotency (e.g. transient SMS).
CREATE UNIQUE INDEX IF NOT EXISTS outbound_actions_idempotency_idx
  ON public.outbound_actions (action_type, action_key)
  WHERE action_key IS NOT NULL;

COMMENT ON TABLE public.outbound_actions IS
  'Audit + verification ledger for every Tier-3 outbound action. Pending rows older than 30min are surfaced to observer_signals.';
COMMENT ON COLUMN public.outbound_actions.action_key IS
  'Caller-supplied idempotency key. Combined with action_type, unique. Retries with the same key return the original row instead of re-sending.';
COMMENT ON COLUMN public.outbound_actions.payload_hash IS
  'sha256 of the canonical payload (recipient + subject + body for email; project + commit_sha for deploys). Used for soft-dedup detection across rotated keys.';
