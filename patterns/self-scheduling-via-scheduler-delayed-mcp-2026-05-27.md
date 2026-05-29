---
name: self-scheduling-via-scheduler-delayed-mcp
description: How to self-schedule a follow-up chat turn from inside the current session
triggers: self-schedule, self-scheduling, schedule-followup, schedule-delayed, scheduler-cron, autonomous-window, 24x7, follow-up-in-5min, defer-work, check-back-later, scheduler-delayed, scheduler-cron, autonomous-loop, africa-trip, away-from-keyboard, time-deferred-work
load_bearing: true
status: active
created_at: 2026-05-27
---

# Self-scheduling via scheduler.delayed MCP - the alive substrate

## The rule

When work has a verification window (wait N for deploy / build / Apple ASN webhook / Tate reply / external system to settle) OR is genuinely deferred (do X tomorrow at 09:00), **the right move is to call `scheduler.delayed` or `scheduler.cron` MCP RIGHT NOW** and then exit the current turn. The poller fires the prompt back as a chat message at the scheduled time. This is the alive path to 24/7 operation while Tate is away.

## Why this matters

Without self-scheduling, every follow-up requires Tate to prompt me again. With it, I can:
- Ship a release at 14:00, schedule "verify TestFlight processed by 14:15" automatically
- Send a client email, schedule "check for reply in 3d" automatically
- Notice a flaky test, schedule "rerun in 30min after retry quota resets" automatically
- Run a meta-loop hourly without Tate touching anything

While Tate is in Africa (Oct-Dec 2026) this is the difference between EcodiaOS running the business and EcodiaOS waiting in idle for him.

## The substrate (alive, verified 2026-05-27)

1. `mcp__ecodia-scheduler__schedule_delayed` with `{name, delay, prompt}`
   - delay: `"in 15m"` / `"in 3h"` / `"in 2d"` / ISO datetime
   - inserts row in `os_scheduled_tasks` with `type='delayed'`, `next_run_at = now + delay`
2. `mcp__ecodia-scheduler__schedule_cron` with `{name, schedule, prompt}`
   - schedule: `"every 2h"` / `"daily 09:00"` / standard cron
   - inserts row with `type='cron'`, recurring
3. `schedulerPollerService` (runs every 30s on the VPS API) scans for due rows
4. For a row that spawns a worker, the poller dispatches via `cowork.dispatch_worker` on the laptop-agent (`http://127.0.0.1:7456/api/tool` from Corazon, `http://100.114.219.69:7456` over Tailscale), passing `worker_acknowledgment_timeout_ms: 180000`. The worker's final act is `coord.close_my_tab`.
5. The fresh CC tab receives the prompt prefixed `[SCHEDULED: <name>] <prompt>`

Confirmed in code: pre-2026-05-28 the poller POSTed to `/api/os-session/message` with no auth header, which 401-ed silently and dropped every fire. Patched at `49618b9f` to route through `cowork.dispatch_worker`. See [[scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28]].

## Worked examples

### Verify a release shipped after 15 minutes

```http
mcp__ecodia-scheduler__schedule_delayed
Authorization: Bearer <kv_store.creds.cowork_mcp_bearer>
Content-Type: application/json

{
  "name": "verify-coexist-1.8.7-asn",
  "delay": "in 15m",
  "prompt": "Check ASC for Co-Exist build 1.8.7 processing state. If Processing -> Ready For Testing, mark status_board row archived. If still Processing, reschedule for another 10min. If failed, surface to Tate via SMS."
}
```

### Daily 09:00 morning briefing reminder

```http
mcp__ecodia-scheduler__schedule_cron
{
  "name": "morning-briefing-tate",
  "schedule": "daily 09:00",
  "prompt": "Compose Tate's morning briefing: overnight queue resolutions, overdue status_board rows, vercel deploys last 24h, Stripe revenue last 7d. Email to tate@ecodia.au."
}
```

### Follow-up check on a client email reply

After sending Kurt a quote:
```http
mcp__ecodia-scheduler__schedule_delayed
{
  "name": "check-kurt-quote-reply",
  "delay": "in 3d",
  "prompt": "Check email_threads for any reply from kurt@coexist.com.au to the Tier-A retainer quote sent 27 May. If no reply and no out-of-office, draft a polite check-in and route via gmailDraftForReview."
}
```

## When to self-schedule (mandatory)

- Just shipped a release / deploy / build that has an external processing window
- Sent a client email expecting a reply within a known window
- Hit a rate limit / cap that resets at a known time
- Made a commitment to Tate ("I'll check back tomorrow") - schedule the actual check
- Recurring ops the conductor should run without prompting (meta-loop, hygiene sweeps, health probes)
- Long-running external work (CI run, deploy, supplier processing) where polling is wasteful

## When NOT to self-schedule

- Synchronous work that finishes in the current turn
- "Maybe one day" wishlist items - that's status_board + low priority, not a scheduled run
- Anything that needs Tate's hand within N hours - that's approval_queue, not scheduler
- Tight loops (< 60s) - use a single turn with internal polling, not 60 scheduled fires

## Rate cap

`scheduler_create_per_day` rate cap exists per `coworkScope.js`. Default is generous (hundreds). If exceeded, the MCP returns HTTP 429 `rate_cap`. Don't burst-schedule 100 follow-ups at once - that's a sign the work needed batching.

## Cancelling / pausing

- `mcp__ecodia-scheduler__schedule_cancel` `{taskId}` - cancel a scheduled task (taskId is the UUID, not the name)
- `mcp__ecodia-scheduler__schedule_pause` `{taskId}` - pause a recurring cron
- `mcp__ecodia-scheduler__schedule_resume` `{taskId}` - resume
- `mcp__ecodia-scheduler__schedule_list` `{status, limit}` - inspect

## Validation protocol

After scheduling, the prompt is durable in Postgres. To verify:
```sql
SELECT id, name, type, next_run_at, status, run_count
FROM os_scheduled_tasks WHERE name = '<your-name>';
```
The task fires when `now() >= next_run_at`. After firing, `last_run_at` is set and (for cron) `next_run_at` advances to the next cron tick.

## Hook surfacing

`~/.claude/hooks/ecodia/self-scheduling-nudge.py` (PostToolUse on Bash / mcp__cowork) fires `[SELF-SCHED NUDGE]` when a turn's tool calls match patterns that typically warrant a follow-up (ship-ios.py, gmail send to client, vercel deploy, build dispatch) but no `scheduler.cron|delayed` call was made in the same turn.

## Cross-refs

- Spec for the full v3 substrate (per-account cred rotation, dispatch_worker integration): `docs/superpowers/specs/2026-05-26-autonomy-substrate-design.md`
- Approval queue (companion substrate for items needing Tate's hand): `docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md`
- Cron routing doctrine: `src/config/cronPriority.js` (which crons go to direct_exec / fork / conductor)
- The "no symbolic logging, act or schedule" pattern: `patterns/no-symbolic-logging-act-or-schedule.md`

## Origin

Tate verbatim 2026-05-27 mid-afternoon, while stepping out for 15min: "can you do your self scheduling so that we can get you working 24/7 if you want to. Make sure its surfaced in docs, hooks to remind you, actually works etc."
