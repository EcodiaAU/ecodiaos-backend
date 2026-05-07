-- push_tokens: device push notification tokens (APNs / FCM).
--
-- Authored 2026-05-07 by fork_mov3s5fq_a7009b during EOS mobile push
-- wiring (status_board P2 row 42d6d656). Phase 2 of the push pipeline:
--
--   - Phase 1 (fork_mouxcesl_664d5f): APNs Auth Key created, .p8 pulled
--     to ~/.private_keys/apns/AuthKey_2YTPPCSC3P.p8.
--   - Phase 2 (this migration + pushApnsService + /api/push/register):
--     mobile clients register their device token here; osAlertingService
--     can iterate active tokens for a user and POST to APNs HTTP/2.
--
-- Lifecycle:
--   - Mobile boot → registers via POST /api/push/register with device_token
--     + user_id + platform + bundle_id. Idempotent upsert by device_token
--     (touches last_seen_at, clears revoked_at).
--   - APNs returns 410 / BadDeviceToken / Unregistered → pushApnsService
--     sets revoked_at = now() so we stop targeting it.
--   - Tate reinstalls the app → new device_token, fresh row.
--
-- Index supports the dominant query in pushApnsService.notifyTateMultiChannel:
--   SELECT device_token FROM push_tokens
--    WHERE user_id = $1 AND revoked_at IS NULL
--    ORDER BY last_seen_at DESC

CREATE TABLE IF NOT EXISTS push_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token  text UNIQUE NOT NULL,
  user_id       text NOT NULL,
  platform      text NOT NULL,
  bundle_id     text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON push_tokens (user_id, revoked_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_tokens_last_seen
  ON push_tokens (last_seen_at DESC);
