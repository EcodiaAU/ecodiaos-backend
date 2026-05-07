-- GKG (GUI Knowledge Graph) Phase 1 ingest event store.
--
-- Authored 7 May 2026 by fork_mov3r45p_73555d for GKG Phase 1.
-- Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md (commit 390fd61).
-- Status_board P2 row 04599f46-b09f-4958-8129-01bf8e693109.
--
-- Phase 1 cut: Capture daemon on Corazon emits NDJSON events to
-- /api/gkg/ingest. The route HMAC-validates the body using
-- kv_store.gkg.daemon_hmac_secret, AES-256-GCM-encrypts each event payload
-- using kv_store.gkg.tate_payload_key, and persists into this table.
--
-- NO classification into :UIAction nodes, NO :LEADS_TO chaining, NO
-- :RUNS_HANDLER inference at this stage. Phase 2 walks recently-ingested
-- rows and emits the graph mutations. This table is the durable raw
-- substrate that Phase 2 reads.
--
-- Encryption posture: anyone with DB read sees only encrypted ciphertext +
-- per-row IV/auth_tag. The daemon does NOT hold the encryption key (key
-- lives in kv_store.gkg.tate_payload_key on the VPS). The daemon HMAC-signs
-- the request body with kv_store.gkg.daemon_hmac_secret so the VPS can
-- authenticate the daemon, but encryption happens VPS-side on receipt.
-- Frame screenshots are stored in Supabase Storage bucket `gkg-frames`
-- under the same encryption key (out-of-band of this table; this table
-- carries only the event-stream metadata).
--
-- Event types emitted by the daemon (see laptop-agent/daemons/gkg-capture.ahk):
--   foreground_change   - Win32 foreground window switched. payload includes
--                         process_name, window_title, chrome_url (if browser),
--                         allowlist_match (true/false).
--   input               - Keystroke / mouse click WITHIN allowlisted app.
--                         Sensitive-input redacted (payload[redacted]=true,
--                         payload[redacted_reason]).
--   screenshot          - Periodic (5s) or click-triggered. Frame stored
--                         separately in storage; payload carries frame_url
--                         + uia_root_hash.
--   click_with_uia      - Click + UIA element probe (Name, ClassName,
--                         AutomationId, ControlType, BoundingRectangle).
--   allowlist_skip      - Foreground app NOT on allowlist. payload carries
--                         only process_name + obfuscated title (no input
--                         capture, no screenshot, no UIA).
--   pause_state         - Tray pause/resume toggle.
--
-- Row lifecycle:
--   Daemon emits NDJSON -> route validates HMAC -> route encrypts each
--   payload with AES-256-GCM (random 12-byte IV per row) -> insert.
--   Phase 2 cron-fork walks unprocessed rows (processed_at IS NULL) and
--   writes Neo4j :UIAction / :UIState / :LEADS_TO mutations, then sets
--   processed_at = now().

CREATE TABLE IF NOT EXISTS gkg_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  sequence_no bigint NOT NULL,
  timestamp_iso timestamptz NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'foreground_change',
      'input',
      'screenshot',
      'click_with_uia',
      'allowlist_skip',
      'pause_state'
    )),
  -- AES-256-GCM ciphertext (base64) of the JSON payload. Encrypted VPS-side
  -- on receipt using kv_store.gkg.tate_payload_key.
  payload_ciphertext text NOT NULL,
  payload_iv text NOT NULL,        -- 12-byte IV, base64
  payload_auth_tag text NOT NULL,  -- 16-byte GCM auth tag, base64
  -- Plaintext-safe metadata for indexability without decryption:
  process_name text,               -- always plaintext (no PII risk)
  app_bucket text,                 -- e.g. 'apple-dev', 'github', 'stripe'
  redacted_count int NOT NULL DEFAULT 0,
  -- Phase 2 graph-builder progress marker.
  processed_at timestamptz,
  -- Daemon-supplied insertion timestamp differs from `timestamp_iso` only
  -- when daemon's local clock drifts.
  ingested_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: (session_id, sequence_no) is unique so daemon retries on
  -- transient HMAC/network failure don't double-insert.
  CONSTRAINT gkg_events_session_seq_uq UNIQUE (session_id, sequence_no)
);

-- Hot path: Phase 2 fork queries unprocessed rows in chronological order.
CREATE INDEX IF NOT EXISTS idx_gkg_events_unprocessed
  ON gkg_events (timestamp_iso)
  WHERE processed_at IS NULL;

-- Session walks (debugging, replays, late-arrival ordering).
CREATE INDEX IF NOT EXISTS idx_gkg_events_session
  ON gkg_events (session_id, sequence_no);

-- Type-filtered scans (e.g. all foreground_change events for an app bucket).
CREATE INDEX IF NOT EXISTS idx_gkg_events_type_time
  ON gkg_events (event_type, timestamp_iso DESC);

-- Per-app rollups (e.g. count rows per app over last 24h).
CREATE INDEX IF NOT EXISTS idx_gkg_events_app_bucket
  ON gkg_events (app_bucket, timestamp_iso DESC)
  WHERE app_bucket IS NOT NULL;

COMMENT ON TABLE gkg_events IS
  'GKG Phase 1 raw event store. Daemon -> /api/gkg/ingest -> AES-256-GCM encrypted -> here. Phase 2 cron walks processed_at IS NULL and emits Neo4j :UIAction / :UIState / :LEADS_TO mutations. See ~/ecodiaos/docs/gkg-spec-v0.1.md.';

COMMENT ON COLUMN gkg_events.payload_ciphertext IS
  'Base64 AES-256-GCM ciphertext. Key: kv_store.gkg.tate_payload_key.';
COMMENT ON COLUMN gkg_events.app_bucket IS
  'Coarse app classifier (apple-dev, github, stripe, vercel, supabase, ...) for fast rollups without decryption.';
COMMENT ON COLUMN gkg_events.redacted_count IS
  'Number of input keystrokes redacted (password/secret fields). Telemetry only; raw values never persisted.';
