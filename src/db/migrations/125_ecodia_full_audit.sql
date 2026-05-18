-- 125_ecodia_full_audit.sql
-- ecodia-full MCP - audit table parallel to cowork_audit_log.
--
-- Records every tools/call into /api/mcp/ecodia-full with bearer fingerprint,
-- tool name, request summary, response summary, status code, duration. Used
-- for rate-cap counting (shell_exec_per_hour, factory_dispatch_per_day) and
-- for the regen CLI to compute observed-tool-call statistics.
--
-- Authored: 15 May 2026 (Lane E of VPS-to-local migration).

CREATE TABLE IF NOT EXISTS ecodia_full_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tool_name           TEXT NOT NULL,
  bearer_fingerprint  TEXT,
  args                JSONB,
  result_summary      TEXT,
  status_code         INTEGER,
  duration_ms         INTEGER,
  client_ip           INET,
  affected_substrate  TEXT,
  affected_row_ref    TEXT
);

CREATE INDEX IF NOT EXISTS ecodia_full_audit_log_occurred_idx
  ON ecodia_full_audit_log(occurred_at DESC);

CREATE INDEX IF NOT EXISTS ecodia_full_audit_log_tool_idx
  ON ecodia_full_audit_log(tool_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ecodia_full_audit_log_bearer_idx
  ON ecodia_full_audit_log(bearer_fingerprint, occurred_at DESC);
