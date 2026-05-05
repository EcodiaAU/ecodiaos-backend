-- Listener-driven dispatch queue. Fork fork_mos3hwpk_9fbdc5, 5 May 2026.
-- Tate verbatim 13:52 AEST: "take work off your plate as the conductor".
--
-- Replaces the pattern "schedule a chain of timed prompts" with event-driven
-- dispatch. When fork X transitions to a terminal state (or any other named
-- trigger event), this table is queried for queued rows whose trigger matches
-- and whose `depends_on` row has fired-and-succeeded. Each match: execute
-- dispatch_payload, mark `fired`. The conductor enqueues "when F6 ships clean,
-- fire F7" once and walks away — the listener handles the cascade.
--
-- Doctrine cross-refs:
--   ~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md
--     — producer (os_forks UPDATE) → trigger (db:event) → bridge (dbBridge)
--       → listener (dispatchQueueListener) → side-effect (mcp__forks__spawn_fork
--       or pg_notify scheduler-fire or email-send)
--   ~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md
--     — disk-backed queue, not "I'll remember to fire that next"
--   ~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md
--     — no pre-gate, fire-time decides

CREATE TABLE IF NOT EXISTS dispatch_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trigger condition.
  -- trigger_event_type values include:
  --   'fork_complete' — any os_forks row hits status='done'
  --   'fork_done_clean' — os_forks status='done' AND result NOT LIKE '%error%' / no fallback marker
  --   'fork_failed' — status in ('error','aborted')
  --   'cron_fire' — a specific cron name fires (match name in trigger_event_match)
  --   'manual' — fire only via /api/dispatch-queue/{id}/fire-now
  trigger_event_type TEXT NOT NULL,
  trigger_event_match JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Match shape examples:
    --   {"prior_fork_id": "fork_xxx_yyy"}                — exact fork id
    --   {"prior_fork_brief_contains": "F6 sign-up"}      — substring match on brief
    --   {"cron_name": "meta-loop"}                       — for cron_fire triggers
    --   {"min_seconds_after_match": 30}                  — fire 30s after match observed

  -- Dispatch target.
  -- dispatch_type values:
  --   'spawn_fork'  — POST /api/forks/spawn  (or mcp__forks__spawn_fork)
  --   'fire_cron'   — POST /api/scheduler/run-now with task name
  --   'send_email'  — POST /api/gmail/send
  --   'sms_tate'    — POST /api/sms/tate
  --   'enqueue_message' — POST /api/os-session/message  (last resort; pollutes chat)
  dispatch_type TEXT NOT NULL,
  dispatch_payload JSONB NOT NULL,
    -- spawn_fork shape:
    --   {"brief": "...", "context_mode": "brief", "priority": 1}
    -- fire_cron shape:
    --   {"task_id": "uuid"} OR {"task_name": "chambers-cascade-F8-..."}
    -- send_email shape:
    --   {"to": "...", "subject": "...", "body": "..."}
    -- sms_tate shape:
    --   {"text": "..."}

  -- Lifecycle.
  status TEXT NOT NULL DEFAULT 'queued',
    -- queued / fired / cancelled / failed / expired
  fired_at TIMESTAMPTZ,
  fired_by_event_id TEXT,                     -- which event triggered the fire (sourceEventId)
  fired_result JSONB,                         -- response from dispatch endpoint

  -- Metadata.
  description TEXT,                           -- human-readable for /list
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                     -- if not fired by this time, mark stale
  created_by TEXT,                            -- which fork/conductor turn enqueued

  -- Chain support: this row fires only after `depends_on_id` has fired-and-succeeded.
  -- If depends_on row is cancelled/failed/expired, this row inherits the same status.
  depends_on_id UUID REFERENCES dispatch_queue(id) ON DELETE CASCADE,

  CONSTRAINT dispatch_queue_status_chk CHECK (
    status IN ('queued', 'fired', 'cancelled', 'failed', 'expired')
  ),
  CONSTRAINT dispatch_queue_dispatch_type_chk CHECK (
    dispatch_type IN ('spawn_fork', 'fire_cron', 'send_email', 'sms_tate', 'enqueue_message')
  )
);

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_trigger
  ON dispatch_queue(trigger_event_type, status)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_expires
  ON dispatch_queue(expires_at)
  WHERE status = 'queued' AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_depends_on
  ON dispatch_queue(depends_on_id)
  WHERE status = 'queued' AND depends_on_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_created_at
  ON dispatch_queue(created_at DESC);

COMMENT ON TABLE dispatch_queue IS
  'Listener-driven dispatch queue (5 May 2026, fork_mos3hwpk_9fbdc5). Conductor enqueues "when X happens, do Y" rows; dispatchQueueListener subscribes to db:event for os_forks UPDATE and similar producer streams, matches queued rows, executes dispatch_payload. Replaces timed-cascade pattern with event-driven cascade. See ~/ecodiaos/patterns/listener-driven-dispatch-replaces-timed-cascade.md.';
