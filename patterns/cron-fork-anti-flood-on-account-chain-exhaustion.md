---
triggers: anti-flood, cron-anti-flood, cron-flood, fork-flood, exhaustion-flood, credit-exhaustion-flood, redundant-spawns, account-chain-exhausted, cron-pause, dispatcher-pause, flood-prevention, consecutive-credit-errors
---

# Cron-fork anti-flood on account-chain exhaustion - pause dispatcher after N consecutive errors

## Status: SPEC (not yet implemented)

This is a design specification. The implementation will be shipped via a follow-up Factory session after credit reset. The spec is codified now so the rule is clear when capacity returns.

## The problem

During the May 11-12 2026 credit exhaustion event, the cron-fork-dispatcher continued firing hourly crons into the exhausted account chain for ~2.5h after the chain was confirmed exhausted. This produced ~10 redundant fork spawn attempts, each failing within 4-5s at 0 tool_calls. The spawns burned slot queue time, added noise to `<forks_rollup>`, and provided zero diagnostic value - the chain state was already known.

The anti-flood mechanism described here would have detected the exhaustion state after 3 consecutive failures and paused the dispatcher until the soonest account reset window.

## The rule

When the cron-fork-dispatcher observes **N=3 consecutive cron-dispatched fork errors** where:
- `abort_reason` contains "out of extra usage" or equivalent credit-signal text
- `tool_calls = 0`
- Fork lifetime < 15s
- All three errors occurred within a Y=10-minute sliding window

...the dispatcher MUST enter **anti-flood pause mode**:
1. Stop spawning new cron forks
2. Read per-account reset timestamps from the most recent `abort_reason` texts
3. Compute `min(reset_account_1, reset_account_2, reset_account_3)` = flood_pause_until
4. Write `flood_pause_until` to `kv_store.cron_fork_dispatcher.flood_pause_until`
5. Log one P2 status_board row (or update existing credit-exhaustion row) with the pause state
6. Resume automatically at `flood_pause_until` (scheduler-driven, not a sleep loop)

## What still fires during pause

Anti-flood pause MUST NOT suppress:
- Meta-loop (conductor-side, not cron-fork-dispatched)
- Any fork already in-flight before the pause triggered
- Critical-path crons explicitly tagged `HIGH_PRIORITY_FORK_CRONS` in the dispatcher config
- Manual `mcp__forks__spawn_fork` calls from the conductor (conductor decides to override)

Anti-flood pause ONLY suppresses cron-fork-dispatcher's automatic spawn cycle.

## Resume protocol

At `flood_pause_until`:
1. Attempt one test fork (brief: "Confirm chain recovery. Report provider and tool_calls count.")
2. If succeeds: clear `kv_store.cron_fork_dispatcher.flood_pause_until`, resume normal dispatch
3. If fails: extend pause by another `min(resets) + 5min`, log extension in the status_board row
4. Maximum 3 extensions before escalating to P1 and SMS Tate

## Implementation target

File: `~/ecodiaos/src/services/cronForkDispatcher.js`

The dispatcher tracks `consecutiveChainErrors: 0` in module state. Increment on each chain-exhausted fork error, reset on any successful fork. At threshold (3), call `_enterAntiFloodPause(minResetTime)`. At resume time, `_resumeFromAntiFloodPause()` runs the test fork.

kv_store key: `cron_fork_dispatcher.flood_pause_until` (ISO UTC string or null).

On dispatcher startup, read this key. If set and in the future, enter paused state immediately (handles PM2 restart during a flood pause).

## Parameters (tunable)

| Parameter | Default | Rationale |
|---|---|---|
| N (consecutive errors threshold) | 3 | Avoids false positives from transient single-fork errors |
| Y (sliding window) | 10 min | Matches the cluster detection window in fork-error-cluster pattern |
| Max extensions before P1 | 3 | ~15-20h of coverage before escalating |

## Cross-refs

- `~/ecodiaos/patterns/multi-account-credit-state-model.md` - the authoritative mental model for account-chain exhaustion
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` - operational response (status_board row, kv_store, drift audit pivot)
- `~/ecodiaos/patterns/_archived/fork-error-cluster-at-zero-tools-treat-as-credit-exhausted.md` - the cluster detection heuristic this builds on
- `~/ecodiaos/patterns/crons-route-to-forks-by-default.md` - the dispatcher architecture this spec extends
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - the kv_store write + status_board update IS the artefact; don't narrate the pause without writing both

## Origin

Triage fork `fork_mp1xqs5q_93fe1c` (11:14 AEST 12 May 2026) surfaced: "Anti-pattern: crons continued firing hourly into the exhaustion wall for 2.5h - anti-flood pause would have saved ~10 redundant spawn attempts."

Codified as spec pattern by fork `fork_mp1y4qi1_6542c6` (12 May 2026 11:20 AEST) per Tate's multi-account codification directive. Implementation deferred until account chain recovers (Factory requires credits to ship code).
