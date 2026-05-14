-- 124: typed-table promotions for hot kv_store keys.
--
-- AUTONOMY_AUDIT_2026-05-13 finding 16 — three families of keys in kv_store
-- that should be proper tables for query-ability, indexability, and audit:
--
--   1. gkg_credentials — encryption keys + HMAC secrets for GUI Knowledge
--      Graph (currently kv_store.gkg.tate_payload_key, gkg.daemon_hmac_secret).
--   2. session_state    — handoff state currently in kv_store.session.handoff_state.
--   3. factory_results  — latest_code_request / factory_result blobs.
--
-- This migration creates the typed tables. Service-layer double-writes can
-- land in follow-up commits without breaking the current kv_store callers
-- (idempotent reads, kv_store stays as the source of truth until cutover).

CREATE TABLE IF NOT EXISTS public.gkg_credentials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('payload_key', 'hmac_secret', 'session_token')),
  owner       TEXT NOT NULL,                       -- 'tate' | 'system' | daemon name
  value       BYTEA NOT NULL,                      -- raw cipher bytes; never hex/base64 in DB
  rotated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}',
  UNIQUE (kind, owner)
);

COMMENT ON TABLE public.gkg_credentials IS
  'Typed home for GKG encryption + HMAC keys. Replaces kv_store.gkg.* keys at cutover.';

CREATE TABLE IF NOT EXISTS public.session_state (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT NOT NULL UNIQUE,
  current_work     TEXT,
  active_plan      TEXT,
  tate_last_direction TEXT,
  deliverables_status TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_state_saved_at_idx
  ON public.session_state (saved_at DESC);

COMMENT ON TABLE public.session_state IS
  'Typed home for handoff state. Replaces kv_store.session.handoff_state at cutover.';

CREATE TABLE IF NOT EXISTS public.factory_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cc_session_id UUID,
  kind          TEXT NOT NULL CHECK (kind IN ('latest_code_request', 'factory_result', 'review_verdict')),
  payload       JSONB NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS factory_results_session_kind_idx
  ON public.factory_results (cc_session_id, kind, recorded_at DESC)
  WHERE cc_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS factory_results_recorded_at_idx
  ON public.factory_results (recorded_at DESC);

COMMENT ON TABLE public.factory_results IS
  'Typed home for factory result blobs. Replaces kv_store.factory_result / kv_store.latest_code_request at cutover.';

-- Touch-on-update triggers reuse the function from migration 120.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'eos_kv_store_touch_updated_at') THEN
    -- Add updated_at columns + triggers if we want them later. For now keep
    -- saved_at / rotated_at / recorded_at semantics; the function is here
    -- and ready when a future migration wants it.
    NULL;
  END IF;
END $$;
