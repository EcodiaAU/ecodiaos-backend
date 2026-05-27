---
triggers: 24x7-autonomy, away-conductor, multi-conductor, worker-tab-leak, coord-events, conductor-turn-start, claims-table, outcome-verification, failure-escalate, africa-trip, oct-dec-2026, autonomy-substrate, conductor-blindness, signal-done-not-seen, dispatch-worker-pollutes-ide
---

# The 24/7 autonomy architecture has 10 load-bearing invariants

## Why this exists

Tate is travelling October-December 2026. EcodiaOS must run for ~90 days without manual prompting, complete chained tasks across multiple substrates, coordinate parallel conductor sessions, recover from its own crashes, escalate only when human judgement is required.

The spec at `backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md` decomposes the full loop into 8 layers (substrate / scheduler+dispatcher+watchdog / worker lifecycle / conductor turn-start awareness / multi-conductor coordination / verification+self-healing / continuity across sessions / escalation tiers). This pattern names the 10 invariants every component MUST satisfy.

Origin: Tate verbatim 2026-05-27 "I need you to be much much much more thorough with how you design each part. Actually thinking about your ongoing and 24/7 autonomy, ability to complete chained tasks, coordinate the different parts of you, stay coherent over time, manage yourself etc." This pattern + the spec + the P0-P2 ship were the same-arc response.

## The 10 invariants

1. **Tabs spawned by dispatch_worker MUST close on signal_done.** Accumulation is a regression. Worker calls `coord.close_my_tab` after `signal_done({terminate:true})` per the brief instructions in [[D:/.code/eos-laptop-agent/tools/cowork.js::composeBrief]]. Coord-side implementation: [[D:/.code/eos-laptop-agent/tools/coord.js::close_my_tab]].

2. **No conductor reads `~/.claude/.credentials.json` directly.** Only `creds.rotate_to` writes. No `fs.watch`. Cross-ref: [[reference_autonomy_substrate_2026-05-26]].

3. **Conductor-owns-restart.** Workers file `pending_restart_requests`. Conductor reads + approves + executes. No worker calls `pm2_restart` directly. Cross-ref: [[forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates]].

4. **No conductor double-dispatches a scheduled task.** `scheduler.leaseDueRows` is the atomic gate.

5. **No two conductors act on the same `status_board` row simultaneously.** The lease substrate gates this: [[D:/.code/EcodiaOS/backend/src/services/conductorClaimsService.js]] + migration 138 (`coordination_claims` table). Pattern: acquire-then-act-finally-release. Use `withClaim()` wrapper for the common case.

6. **Every worker brief mandates `signal_bound` as the literal first instruction.** Without it the scheduler treats the dispatch as failed after a 30s timeout and may redispatch.

7. **Worker `signal_done` MUST trigger conductor turn-start surfacing.** No silent completion. Three live substrates surface coord events:
   - Cursor conductor: [[C:/Users/tjdTa/.claude/hooks/ecodia/coord_events_pending.py]] UserPromptSubmit hook
   - VPS conductors (iOS native, voice, cron-spawned): `_injectCoordEvents` continuity block in [[D:/.code/EcodiaOS/backend/src/services/osSessionService.js]]
   - Future: visible in `<coord_events>` block at turn-start

8. **Verification ALWAYS runs after signal_done when a probe is declared.** Narrated success is not real success. Library: [[D:/.code/EcodiaOS/backend/src/services/outcomeVerificationService.js]]. Workers declare verify intent via `result_pointer: 'verify:type=status_board;name=...'` or callers pass `opts.verify`. No probe declared = no probe runs (silence is not a failure mode). Cross-ref: [[verify-deployed-state-against-narrated-state]].

9. **Continuity blocks have hard byte caps.** No turn-start block exceeds 2KB. Tail-truncation with "N more omitted" pointer. Applies to `<coord_events>` (1500B), `<pending_restart_requests>` (800B), `<status_board_critical>` (6KB sum cap on the Cursor hook), `<approval_queue>` (800B).

10. **All substrate writes go through named producer methods.** No ad-hoc INSERTs from chat narration. Status_board edits via the hygiene reflex. Approval queue via `approvalQueueService.enqueue*`. Failure escalation via [[D:/.code/EcodiaOS/backend/src/services/failureEscalateService.js]] - one helper, six severity tiers, single routing surface.

## What "shipped" looks like on a fresh laptop boot

A fresh Cursor chat on Corazon at any time after the autonomy substrate is fully on (SCHEDULER_ENABLED=true + cred refresher in PM2 + agent supervised) shows on first turn:

- `<status_board_critical count="N">` populated from priority<=2 rows
- `<coord_events count="N">` if any worker fired done/error/inbound since last turn
- `<pending_restart_requests count="N">` if any worker requested ecodia-api restart
- `<active_workers count="N">` if any dispatched worker is alive

Without those four blocks, the conductor is blind to fresh worker outcomes. Adding new continuity blocks for new substrates follows the same pattern (hook OR `_inject*` function + registration in `ORDER` + dedupe candidate).

## Escalation tier table (the failureEscalate routing)

| Severity | Surfaces written |
|---|---|
| `routine_info` | observer_signal (P5) |
| `action_recommended` | observer_signal (P3) + status_board (P3) |
| `conductor_decision` | observer_signal (P2) + status_board (P2) |
| `tate_judgement` | approval_queue + observer_signal (P2) |
| `time_critical` | sms.tate + observer_signal (P1) + status_board (P1) |
| `hard_tripwire` | sms.tate + observer_signal (P1) + status_board (P1) |

Callers MUST pick the right tier. Dedupe key recommended for any repeating failure mode (sticky 1h window).

## Anti-patterns flagged by this pattern

- **Conductor polling coord inbox manually** because the turn-start block "might not be live yet" - check first, the block exists.
- **Worker omitting `coord.close_my_tab`** because it's "best effort" - it's load-bearing; without it tabs leak.
- **Acting on a status_board row without checking `coordination_claims`** when there could be sibling conductors - silent dupes will happen.
- **SMSing Tate via `osAlertingService.sendSmsToTate` directly** - use `failureEscalate.fire({severity:'time_critical', ...})` so the tier routing is consistent (and dedupe applies).
- **Declaring "verified shipped" without invoking a verification probe** - verify via `outcomeVerification.verify({type, ...})` or accept the row as unverified.

## Migration map for this ship

- `134_approval_queue.sql` + `135_status_board_approval_trigger.sql` + `137_approval_queue_cron_seed.sql` - prior session, approval queue substrate
- `136_os_scheduled_tasks_autonomy_substrate.sql` - prior architect, scheduler tables
- `138_conductor_claims.sql` - THIS SHIP, multi-conductor coordination lease table (`coordination_claims`, named to avoid name collision with prior Phase G `conductor_claims` telemetry table)

## Open follow-ups (not blockers, but tracked)

- code@/money@ cred files seeded (manual sign-in by Tate)
- PM2 elevated supervision of laptop-agent (Tate runs install once)
- VPS corazonWatchdog deploy (git pull + pm2 reload)
- Per-caller adoption of `failureEscalate.fire` in existing tripwire surfaces (a sweep is a separate ship)
- Per-caller adoption of `conductorClaims.withClaim` for email triage, status_board row pickup, scheduled task dispatch (also a separate ship per surface)
- End-to-end smoke of the full loop (scheduler fires -> tab spawns -> brief executes -> signal_done -> tab closes -> conductor surfaces -> verification probes) once laptop-agent restarts pick up the new coord.close_my_tab tool

## Cross-references

- Spec: backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md
- Sibling: [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- Sibling: [[coord-conventions-heartbeat-signal-done-2026-05-18]]
- Sibling: [[dispatch-worker-worktree-hygiene-2026-05-26]]
- Sibling: [[dispatch-worker-runtime-semantics-2026-05-26]]
- Sibling: [[forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates]]
- Sibling: [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]]
- Origin doctrine: [[100-percent-autonomy-doctrine-30-apr-2026]]
- Doctrine: [[action-over-plans-honesty-redeems-mistakes]]
