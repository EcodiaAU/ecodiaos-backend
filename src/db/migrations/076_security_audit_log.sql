-- §7.1 Signed, append-only Tier-3 action audit log.
-- Every Tier-3 action (gmail_send external, git push, deploySession,
-- Stripe/Xero writes, governance-domain recipients) writes a row here
-- with an HMAC signature. UPDATE and DELETE are denied by trigger.
-- Retain 7 years per APRA/ASIC / AU record-keeping.
-- See docs/SECURITY_HARDENING.md §7.1.

CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  action_fingerprint TEXT NOT NULL,       -- sha256 of canonical(action payload)
  session_id TEXT,
  trigger_source TEXT,                    -- 'email', 'crm', 'cowork', 'cron', 'tate'...
  gate_token_id BIGINT,                   -- tier3_action_tokens.id if applicable
  content_hash TEXT,                      -- sha256 of the actual sent/committed content
  hmac_signature TEXT,                    -- hmac_sha256 over canonical(row)
  timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_audit_log_session_idx
  ON security_audit_log (session_id, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_action_idx
  ON security_audit_log (action_type, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_fingerprint_idx
  ON security_audit_log (action_fingerprint);

-- Append-only: reject UPDATE and DELETE. Only INSERT and SELECT are
-- permitted. A compromised session cannot fabricate a clean history
-- because it cannot modify existing rows.
CREATE OR REPLACE FUNCTION security_audit_log_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_log is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_audit_log_no_update ON security_audit_log;
CREATE TRIGGER security_audit_log_no_update
  BEFORE UPDATE ON security_audit_log
  FOR EACH ROW EXECUTE FUNCTION security_audit_log_append_only();

DROP TRIGGER IF EXISTS security_audit_log_no_delete ON security_audit_log;
CREATE TRIGGER security_audit_log_no_delete
  BEFORE DELETE ON security_audit_log
  FOR EACH ROW EXECUTE FUNCTION security_audit_log_append_only();


-- §7.2 Incident state. Emergency mode revokes all Tier-3 tokens, pauses
-- cron dispatcher, halts forks, SMS-alerts Tate. Cleared manually via SSH
-- only (no self-clear path). kv_store is used for the flag itself; this
-- table is the incident log.
CREATE TABLE IF NOT EXISTS security_incidents (
  id BIGSERIAL PRIMARY KEY,
  incident_class TEXT NOT NULL,           -- e.g. 'credential_redaction', 'cypher_rejected', 'self_mod_denylist'
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_source TEXT,
  session_id TEXT,
  details JSONB,
  -- resolution: 'unresolved' | 'cleared_by_tate' | 'false_positive'
  resolution TEXT NOT NULL DEFAULT 'unresolved',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS security_incidents_class_idx
  ON security_incidents (incident_class, detected_at DESC);
CREATE INDEX IF NOT EXISTS security_incidents_unresolved_idx
  ON security_incidents (resolution, detected_at DESC)
  WHERE resolution = 'unresolved';
