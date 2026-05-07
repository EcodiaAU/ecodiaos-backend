-- iMessage outbound queue (substrate replacing SSH+osascript path)
--
-- Authored 7 May 2026 by fork_mousbxym_89ac2e during the iMessage outbound
-- migration off SSH (Tate verbatim 2026-05-06 08:08 AEST + 2026-05-07 11:03
-- AEST: "Now we need to codify this as the absolute primary path to contact
-- me via" + "We also need to set up system to help you see and respond
-- here as easily as possible").
--
-- Architecture:
--   sendImessage() in skills/tate-msg/index.js INSERTs a row here.
--   SY094-side LaunchAgent (au.ecodia.imessage-outbound) polls
--   /api/imessage/outbound/next every 5s. The route atomically dequeues up
--   to 5 oldest rows where status='queued', flips them to 'sending', and
--   returns them HMAC-signed. The watcher invokes osascript locally on
--   SY094 to send via Messages.app, then POSTs /api/imessage/outbound/ack
--   with {id, ok, error?} which marks status='sent' on success or back to
--   'queued' with attempts++ on transient failure (final 'failed' after 3
--   attempts).
--
-- Why a queue (not synchronous): SY094 is not on the same Tailscale
-- network as the VPS, and the never-ssh-on-mic doctrine forbids the prior
-- sshpass+ssh+osascript path. The queue gives the SY094 watcher a pull
-- semantic (poll, dequeue, send, ack) which mirrors the inbound substrate
-- (SY094 watcher pushes to /api/imessage/inbound) and keeps zero inbound
-- network dependencies on SY094.
--
-- Row lifecycle:
--   created_at -> status=queued, attempts=0
--   POST /next -> status=sending (atomic, returned in response)
--   POST /ack ok=true  -> status=sent, sent_at=now()
--   POST /ack ok=false -> if attempts<3: status=queued, attempts++,
--                                       last_error=<msg>
--                        else:          status=failed, attempts++,
--                                       last_error=<msg>

CREATE TABLE IF NOT EXISTS imessage_outbound_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_handle text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Queue ordering index: dequeue picks oldest queued first.
CREATE INDEX IF NOT EXISTS idx_imessage_outbound_queue_pending
  ON imessage_outbound_queue (created_at)
  WHERE status = 'queued';

-- Status filter index for telemetry / status_board surfacing.
CREATE INDEX IF NOT EXISTS idx_imessage_outbound_queue_status
  ON imessage_outbound_queue (status, created_at DESC);

COMMENT ON TABLE imessage_outbound_queue IS
  'Outbound iMessage queue. sendImessage() enqueues; SY094-side LaunchAgent polls /next, sends via Messages.app, POSTs /ack. Replaces SSH+osascript path. Authored 2026-05-07 fork_mousbxym_89ac2e.';
