# Scheduler poller diagnosis - 5 May 2026 (fork_mos3hwpk_9fbdc5)

## Symptom

Tate verbatim 5 May 2026 13:52 AEST: "you're scheduling taskss needs to be 100% reliable, check that".

Ground-truth probe at 13:52 AEST showed:

- 6 scheduled `delayed` tasks queued 12:45-12:50 AEST (`next_run_at` 13:14, 13:17, 13:48, 14:18, 14:44, plus 21:15 UTC backup).
- ALL had `last_run_at = NULL`, `run_count = 0`, `status = 'active'`.
- `ecodia-api` uptime ~82 min — poller has been alive long enough to fire every overdue task at least 80 times.
- 3 tasks already 38-42 min overdue.

DB confirmation (`os_scheduled_tasks` filter `status='active' AND next_run_at IS NOT NULL` ordered by `next_run_at`):

| name | type | overdue (min) | run_count |
|---|---|---:|---:|
| codify-no-bedrock-and-fork-error-noise-rule-2026-05-05 | delayed | 41.9 | 0 |
| chambers-cascade-F6-signup-flows-2026-05-05 | delayed | 38.3 | 0 |
| chambers-cascade-F7-memberships-chamber-switching-2026-05-05 | delayed | 7.9 | 0 |
| (additional tasks negative = future-due) | | | |

All cron tasks also showed last-fired ~yesterday with `next_run_at` ~52 minutes future, indicating they had been silently re-deferred by the poller every cycle.

## Root cause

`src/services/schedulerPollerService.js` `pollOnce()` has two pre-gates that block firing despite the doctrine `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md`:

### Gate A — Critical-energy (active, lines 255-273)

```javascript
if (energyLevel === 'critical') {
  const essentialTasks = due.filter(t => ESSENTIAL_CRON_NAMES.has(t.name))
  if (essentialTasks.length === 0) {
    for (const t of due) {
      if (t.type === 'cron') {                                 // ← only crons get rescheduled
        const deferred = new Date(Date.now() + 60 * 60 * 1000)
        await db`UPDATE os_scheduled_tasks SET next_run_at = ${deferred} WHERE id = ${t.id}`
      }
    }
    return                                                      // ← delayed tasks never fire, never rescheduled
  }
  ...
  await fireTask(essentialTasks[0])
  return
}
```

Both Claude Max accounts at 100% used (probe `/api/os-session/energy` → `level: "critical"`). This branch fires every poll cycle. Side effects:

1. All non-essential crons get `next_run_at` pushed +1h every poll → infinite deferral.
2. Delayed tasks fall through ALL branches without firing AND without rescheduling. They stay overdue forever; the loop just `return`s.
3. Even if `essentialTasks.length > 0`, only `essentialTasks[0]` fires; remaining due tasks (essential or not) get nothing.

Conflicts with doctrine: `scheduler-no-pregate-trust-os-message-queue.md` says "No pre-gate. Trust /api/os-session/message with source:'scheduler' to queue behind in-flight turns". Critical-energy is exactly such a pre-gate.

### Gate B — Pay-as-you-go (idle, lines 247-253)

```javascript
if (isPayAsYouGoProvider) {
  logger.info(...)
  return                                                       // ← halts ALL task types
}
```

Currently `false` (energy report `isBedrockFallback: false, isDeepseekFallback: false`), but same shape — pre-gate blocks delayed tasks alongside crons. Active spend protection rationale, but applied at the wrong layer (per-task budget should govern, not blanket halt).

### Why this surfaces NOW

Both Claude Max accounts hit 100% earlier today. Tate explicitly said the conductor can route DeepSeek/Bedrock for autonomous work, but the energy classifier doesn't know that and still reports `level=critical`. Before today, energy was usually `healthy` so the gate was dormant.

## Fix plan (Phase 2)

1. **Remove the critical-energy pre-gate** — fully. Trust /api/os-session/message to queue. The os-session message queue serialises turns downstream; if the conductor is busy or rate-limited, queueing is the right behaviour, not silent deferral.
2. **Narrow the pay-as-you-go gate to crons only** — delayed tasks are explicit Tate-typed or conductor-typed work. They MUST fire. Crons can be safely halted under spend protection because they're recurring and the next cycle picks up.
3. **Add structured logging** — every gate trip logs `gate_tripped` with task name + reason, so future drift is visible in `pm2 logs`.
4. **Fire-then-update sequencing** stays the same (already correct in `fireTask`).

## Verification

- Manually fire `codify-no-bedrock-and-fork-error-noise-rule-2026-05-05` via `mcp__scheduler__schedule_run_now` after deploying fix.
- Expect `last_run_at` to populate, `status` flip to `completed`.
- Then fire `chambers-cascade-F6-signup-flows-2026-05-05` to dispatch the Chambers cascade.
- Skip F7/F8 cascades for conductor manual trigger (they may overlap with this fork's work).

## Activation

Code path is in-process (poller polls every 30s with `setTimeout`). Editing the JS file does NOT take effect without `pm2 restart ecodia-api`. Brief constraint forbids restart unless required. Plan: ship fix, document activation point in commit message, ship dispatch_queue + Phase 4-5 in same commit-set, then NATURAL next pm2 restart picks up everything. The 6 dead tasks fired manually via `schedule_run_now` will use the running poller's `fireTask` directly which DOES not have the gates (the gates are only in `pollOnce`'s due-list dispatch, not in `fireTask` itself), so they WILL fire under the running process even pre-restart.

Wait — verify: `mcp__scheduler__schedule_run_now` calls into the scheduler MCP server, which is its own process (stdio). Need to check what code path it takes.
