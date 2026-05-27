---
triggers: dispatch-queue, listener-driven-cascade, schedule_delayed-cascade, fork-cascade, timed-cascade-anti-pattern, when-X-then-Y, depends-on-prior-fork, conductor-state-offload, dispatch_queue, dispatchQueueListener, sequential-fork-dispatch, ship-then-ship-cascade, F6-then-F7, redispatch-after-prior, fork-completion-trigger
---

# Listener-driven dispatch replaces the timed-cascade pattern

## The rule

When the conductor needs "fork F7 to run after fork F6 ships clean", DO NOT schedule F7 via `schedule_delayed at T+30min` and hope F6 finished. Enqueue an event-driven `dispatch_queue` row that fires F7 the moment F6's `os_forks` row hits `status='done'`.

Substrate: `dispatch_queue` table (migration 086) + `dispatchQueueListener` (subscribed to `db:event` for `os_forks` UPDATE) + `/api/dispatch-queue/*` routes.

## Do

- Use `POST /api/dispatch-queue/enqueue` (or the `dispatchQueueEnqueue` MCP tool when shipped) for any "after X happens, do Y" dependency. Single-row enqueue per cascade step.
- Chain via `depends_on_id`: row B specifies row A's UUID; B fires only after A is `status='fired'` AND `fired_result.ok=true`.
- Use `trigger_event_match.prior_fork_brief_contains` for substring-match on the upstream fork's brief when you don't have an exact `prior_fork_id` (e.g. when the upstream fork is being dispatched by another row in the same cascade).
- Set `expires_at` for any cascade step that becomes irrelevant after a window (e.g. "wake-up summary if F8 ships before 10am tomorrow"). Stale cascade rows are worse than no rows.
- Verify the listener loaded after restart: `pm2 logs ecodia-api | grep "listener: loaded dispatchQueueListener"`. If absent, the cascade is silent (the queue grows, nothing fires).

## Do not

- Do not schedule a chain of `schedule_delayed` tasks at T+30, T+60, T+90 hoping the prior step finished. That's the timed-cascade anti-pattern. Real fork durations vary 2× either way; the timed cascade either fires before the dependency is ready (wasted work, broken assumptions) or fires too late (Tate waiting on idle conductor).
- Do not enqueue `dispatch_type='enqueue_message'` to drop a `[SCHEDULED:]` prompt into the conductor chat. That pollutes the chat stream. Use `spawn_fork` for any cascade step that produces work; the conductor doesn't need to be in the loop for fork-to-fork hand-offs.
- Do not skip `depends_on_id` when the cascade is genuinely sequential. Without it, row B fires on the FIRST `fork_complete` event, which may not be A's completion.
- Do not assume `fork_done_clean` filters out partial-success forks perfectly - it's a heuristic on `result` text. If the upstream fork's clean-vs-broken state matters, add a manual review checkpoint (a `manual` trigger row that the conductor fires with `/api/dispatch-queue/:id/fire-now` after eyeballing the deliverable).

## Protocol - enqueueing a cascade

For "F6 ships clean → F7 dispatches; F7 ships clean → F8 dispatches; F8 ships clean → final summary email":

```
POST /api/dispatch-queue/enqueue
{
  "trigger_event_type": "fork_done_clean",
  "trigger_event_match": {"prior_fork_brief_contains": "F6 sign-up"},
  "dispatch_type": "spawn_fork",
  "dispatch_payload": {"brief": "F7 brief here...", "context_mode": "brief"},
  "description": "F7 memberships+chamber-switching after F6 ships clean",
  "priority": 2,
  "expires_at": "2026-05-06T00:00:00Z",
  "created_by": "conductor-mos3hwpk"
}
→ {id: "<F7_id>", ...}

POST /api/dispatch-queue/enqueue
{
  "trigger_event_type": "fork_done_clean",
  "trigger_event_match": {},
  "dispatch_type": "spawn_fork",
  "dispatch_payload": {"brief": "F8 brief here...", "context_mode": "brief"},
  "description": "F8 production polish after F7",
  "depends_on_id": "<F7_id>",
  ...
}
→ {id: "<F8_id>", ...}

POST /api/dispatch-queue/enqueue
{
  "trigger_event_type": "fork_done_clean",
  "dispatch_type": "send_email",  // when implemented
  "dispatch_payload": {"to": "tate@ecodia.au", "subject": "...", "body": "..."},
  "depends_on_id": "<F8_id>",
  ...
}
```

The conductor walks away. F6 finishes → listener fires F7 row. F7 finishes → listener fires F8 row. F8 finishes → listener fires email.

## Verification

- After enqueue: `GET /api/dispatch-queue/list?status=queued` shows the row.
- After upstream fork transitions: `GET /api/dispatch-queue/list?status=fired` shows the row with `fired_at`, `fired_by_event_id`, `fired_result`.
- Failed dispatches stay visible: `GET /api/dispatch-queue/list?status=failed` for inspection.
- Listener boot: `[listener-registry] load: loaded dispatchQueueListener (dispatchQueueListener.js)` in pm2 stderr on every restart.
- 5-layer listener verification per `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`:
  1. Producer: `forkService.spawnFork`/transition writes `os_forks.status`
  2. Trigger: pg_notify `eos_listener_events` on os_forks UPDATE
  3. Bridge: `dbBridge.js` fans pg_notify → wsManager.publish('db:event')
  4. Listener: `dispatchQueueListener.handle` matches + claims + dispatches
  5. Side-effect: `forkService.spawnFork` (or `os_scheduled_tasks` UPDATE) is observable

## Failure modes

- Stale `expires_at`: row past expiry stays `queued` until the cleanup sweep (TODO: add a 60s expiry-check tick to the listener init). Expect a small window of "expired but still queued".
- Listener not loaded: registry's `EXPECTED_LOADED_COUNT` mismatch warning fires at boot. If the count is wrong, no events flow. Probe `getListeners()` length before trusting the substrate.
- Dispatch failure cascading: if F7 dispatch fails, F8's `depends_on_id` will see F7 with `status='failed'` (not `'fired'`), so F8 stays queued forever. This is intentional - failed cascades require conductor intervention, not auto-retry. The conductor reads `/api/dispatch-queue/list?status=failed` on next turn.

## Origin

5 May 2026, fork_mos3hwpk_9fbdc5. Tate verbatim 13:52 AEST: "you're scheduling taskss needs to be 100% reliable, check that... we need to fix these things by getting creative, implementing whatever systems you need to thrive, take work off your plate as the conductor, and jsut make everything so much more cohesive/workable... Right now you're still doing too many things at once."

The dispatch_queue substrate replaces the timed-cascade pattern that was used for the Chambers F6/F7/F8 cascade earlier today (12:45-12:50 AEST). The timed cascade silently broke when the scheduler poller's critical-energy gate deferred all cron and delayed tasks (see `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md` for the gate-removal rationale). Even with the gate gone, timed cascades are fragile because real fork durations vary; event-driven cascades don't. This pattern files alongside the sibling fix in the same fork.

## Cross-references

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - 5-layer architecture all listeners must satisfy
- `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md` - gate-removal that motivated the substrate refactor
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - disk-backed queue is the artefact, not "I'll remember"
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` - cron-firing isn't completion; cascade rows must produce a deliverable per step
- `~/ecodiaos/src/db/migrations/086_dispatch_queue.sql`
- `~/ecodiaos/src/services/listeners/dispatchQueueListener.js`
- `~/ecodiaos/src/routes/dispatchQueue.js`
