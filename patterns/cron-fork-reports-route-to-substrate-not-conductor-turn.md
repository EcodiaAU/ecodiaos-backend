---
triggers: cron-fork-report-substrate, cron-fork-routing, cron-fork-suppression, fork-report-substrate-only, conductor-turn-suppression, is-cron-flag, cron-routed-fork, fork-report-routing, idle-reply-pollution, cron-routed-no-wake, conductor-turn-cron-pollution, fork-report-passive-substrate, conductor-message-queue-cron, messageQueue-cron-suppression, forkComplete-listener-cron, eos_listener_notify_compact-is-cron, migration-088-os-forks-is-cron
---

# Cron-fork [FORK_REPORT]s route to passive substrate, not conductor turns

When `cronForkDispatcher` spawns a fork, that fork's `[FORK_REPORT]` MUST land in passive substrate only:
- `<forks_rollup>` context block (read on every natural conductor turn)
- `perceptionBus` `fork_complete` event (already published by `forkService` for every successful fork at `src/services/forkService.js:976-996`, regardless of `is_cron`)
- `status_board` rows (when the fork wrote one - genuine emergencies still surface via the existing `status-board-write-surface.sh` hook + perception pipeline)

It MUST NOT:
- Enqueue into `messageQueue` via `forkService._enqueueForkReport â†’ mq.enqueueMessage` (the path that drains as `[SYSTEM: fork_report ...]` on the next conductor turn)
- Trigger `_wakeOsSession` from `src/services/listeners/forkComplete.js` (the path that POSTs to `/api/os-session/message` and forces a conductor turn)

The conductor sees cron-fork outcomes via context-stitching on the next natural turn (meta-loop fire, Tate-typed message, stale-heartbeat alert). Cron-fork autonomy delivery is the substrate, not the inbox.

## Why

**Tate verbatim 7 May 2026 09:15 AEST:** "is it not a deeper problem bro... stop bullshitting me. You need to just stop whatever is triggering you there, because you're going to have to return something regardlesss.... it should jsut be handled by a fork that you can ignore unless needed."

Pre-fix failure mode:
1. Cron fires â†’ `cronForkDispatcher.dispatchCronAsFork` â†’ `forkService.spawnFork`
2. Fork runs, emits `[FORK_REPORT] Idle - nothing to do.`
3. `forkService._enqueueForkReport` puts the report into `messageQueue`
4. `forkService` flips `os_forks.status='done'`
5. `pg_notify` fires â†’ `dbBridge` publishes `db:event` â†’ `listeners/forkComplete.handle` runs
6. `forkComplete._wakeOsSession` POSTs to `/api/os-session/message`
7. Conductor takes a turn â†’ `drainIntoDirectMessage` prepends the queued report
8. Conductor's only valid response: "Idle." â€” but it cost a full turn, blew the prompt cache, and polluted the chat surface

The doctrine layer (`~/ecodiaos/patterns/crons-route-to-forks-by-default.md`, 4 May 2026) routed the cron *prompt* into a fork, but the *fork report* still came back through the conductor turn substrate. The fork-report return path was the unfixed half.

## How (substrate)

Single explicit signal: `os_forks.is_cron BOOLEAN NOT NULL DEFAULT false`.

- **Migration 088** (`src/db/migrations/088_os_forks_is_cron.sql`):
  - Adds `is_cron BOOLEAN NOT NULL DEFAULT false` column.
  - Adds partial index `idx_os_forks_is_cron_started ON os_forks (started_at DESC) WHERE is_cron = true` for "cron forks today" analytics.
  - Updates `eos_listener_notify_compact()` so the os_forks branch of the pg_notify payload includes `is_cron`. Listener-side check is zero-DB-query.
- **`src/lib/forkCapAtomic.js`**: `tryReserveForkSlot({..., is_cron = false})` writes the column at INSERT inside the advisory-lock-transaction. Coerces with `=== true` so undefined/null/string truthiness can't slip through.
- **`src/services/forkService.js`**:
  - `spawnFork({brief, context_mode, parent_fork_id, is_cron = false})` plumbs through to `tryReserveForkSlot`.
  - `state.is_cron = !!is_cron` retained on the in-memory state so `_enqueueForkReport` can read it without a DB round-trip.
  - `_enqueueForkReport({..., is_cron})`: when truthy, returns `{enqueued: false, reason: 'cron_routed_substrate_only'}` BEFORE `mq.enqueueMessage`. The clean-noop suppression check still runs first (cron noop = old code path, kept for when callers don't pass the flag).
- **`src/services/cronForkDispatcher.js`**: `forkService.spawnFork({..., is_cron: true})`. Single call site sets the flag.
- **`src/services/listeners/forkComplete.js`**: in the `status === 'done'` branch, after the empty / phantom-bail check, before the wake POST: `if (row.is_cron === true) return`. Logs `cron-routed fork done with [FORK_REPORT] (silent, substrate-only - no wake)`.

## Boundaries (DO NOT break these)

- **Manual fork dispatches still wake.** `mcp__forks__spawn_fork` from the conductor (or sub-fork from a manager) calls `spawnFork` WITHOUT `is_cron`, so `is_cron=false`, so the existing wake path runs unchanged. The manager-fork pattern (`MANAGER: true` brief) is unaffected.
- **Tate-typed messages still wake.** `osSessionService._sendMessageImpl` is untouched. Inbound Tate-message â†’ conductor turn path is preserved.
- **Genuine emergencies still surface.** A cron fork that writes a P1 status_board row hits `status-board-write-surface.sh` and the existing perception_dispatcher â†’ context-injection pipeline. Conductor sees it on the next turn (forks_rollup + status_board context stitch). The wake suppression here ONLY removes the listener-driven wake on success-with-FORK_REPORT, NOT the perception path.
- **Sub-fork â†’ manager routing unaffected.** The `parent_id !== 'main'` branch in `_enqueueForkReport` runs before the `is_cron` check (sub-forks of cron-spawned managers still report up to their parent). Cron-routed root forks have `parent_id='main'` so the substrate-only branch fires.
- **Stale-heartbeat wakes are unaffected.** `forkComplete` listener wakes on stale heartbeat regardless of `is_cron` - a hung cron fork is exactly the case where the conductor needs to know.
- **Terminal failures (status='aborted'/'error') unaffected.** That path was already silent per `~/ecodiaos/patterns/_archived/fork-error-events-do-not-surface-to-conductor-chat.md` (5 May 2026). is_cron is irrelevant to that branch.

## Verification (post-restart, after 03:00 AEST 8 May 2026 PM2 restart)

Five-layer check (per `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`):
1. **Producer**: cron fires â†’ `os_scheduled_tasks.last_dispatched_fork_id` set â†’ `os_forks` row inserted with `is_cron=true`. Verify: `SELECT name, last_dispatched_fork_id FROM os_scheduled_tasks WHERE last_dispatched_fork_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5` then `SELECT fork_id, is_cron FROM os_forks WHERE fork_id = '<id>'`.
2. **Trigger**: `os_forks` UPDATE to `status='done'` â†’ `pg_notify('eos_listener_events', ...)` payload contains `is_cron: true`. Verify: subscribe to channel, look at row payload.
3. **Bridge**: `dbBridge` publishes `db:event` â†’ `event.data.row.is_cron === true`.
4. **Listener**: `forkComplete.handle` reads `row.is_cron`, logs `cron-routed fork done with [FORK_REPORT] (silent, substrate-only - no wake)`. Verify: `pm2 logs ecodia-api | grep "substrate-only - no wake"`.
5. **Side-effect**: NO `[SYSTEM: fork_report ...]` message arrives in conductor's `messageQueue` for that fork_id. Verify: query `os_messages` (or whatever the queue substrate is named on this version) for `source = 'fork:<id>'` post-completion - should be empty.

## Anti-patterns

- **Brief-string detection.** `CRON_BRIEF_PREFIX = 'You are EcodiaOS in fork form, no prior context.'` only matches *some* cron prompts (`tate-blocked-nudge-weekly`, `vercel-deploy-monitor`); other crons (`telemetry-dispatch-consumer`, `os-forks-reaper`, `telemetry-outcome-inference`) don't include it. Cron detection MUST be the explicit `is_cron` column, not brief-prefix grep.
- **Suppress at one layer only.** Both layers (`_enqueueForkReport` AND `forkComplete._wakeOsSession`) must respect `is_cron`. Suppressing only the wake leaves a queued report that drains on the next natural conductor turn (still pollution). Suppressing only the queue leaves the wake firing a turn with empty drain (still pollution).
- **Suppress unconditionally for all forks.** Manual fork dispatches and Tate-driven autonomy chains rely on the wake path for fork-driven autonomous chains (`~/ecodiaos/patterns/_archived/fork-error-events-do-not-surface-to-conductor-chat.md` Tate verbatim 6 May 2026 ~10:29 AEST). The suppression is gated on `is_cron=true` only.
- **Add a parallel "system-cron" parent_id.** Tempting to set `parent_id='system-cron'` for cron forks, but that bleeds into manager/worker hierarchy logic, root_fork_id resolution, sub-fork routing in `_enqueueForkReport`. Explicit boolean column is the surgical fix.

## Origin

- Tate verbatim 7 May 2026 09:15 AEST (this turn).
- Sibling pattern: `~/ecodiaos/patterns/_archived/fork-error-events-do-not-surface-to-conductor-chat.md` (5 May 2026, Tate 12:40 AEST). Same architectural principle, applied to fork errors. This pattern extends it to cron-fork successes.
- Parent doctrine: `~/ecodiaos/patterns/crons-route-to-forks-by-default.md` (4 May 2026, Tate 19:30 AEST). The cron-prompt routing layer; this is the cron-fork-report routing layer (the unfixed half).
- Ship: fork `fork_mouofp9r_72cd3a`, migration 088. Code edits land at:
  - `src/db/migrations/088_os_forks_is_cron.sql` (new)
  - `src/lib/forkCapAtomic.js:32-41,76-123`
  - `src/services/forkService.js:210,607,646,667,1015-1023`
  - `src/services/cronForkDispatcher.js:276-293`
  - `src/services/listeners/forkComplete.js:135-170`

Cross-refs: `~/ecodiaos/patterns/substrate-before-doer.md` (this fix lives at the fork-report-emit substrate, not the conductor's per-turn prompt - doer-level "respond with Idle. quickly" was the failure mode this supersedes), `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`, `~/ecodiaos/patterns/no-self-prompting-from-queued-kv-store-plans.md`, `~/ecodiaos/patterns/_archived/fork-result-fallback-must-be-marked.md` (phantom-bail check still runs first; the new is_cron guard sits AFTER the empty/phantom-bail short-circuit so phantom-bail observability is preserved), `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`, `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`.
