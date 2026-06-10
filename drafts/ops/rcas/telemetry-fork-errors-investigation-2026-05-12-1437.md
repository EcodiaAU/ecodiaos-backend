# Telemetry fork errors investigation - 2026-05-12 14:37 AEST

## Forks
- fork_mp24yx4z_6984ac: `account_chain_exhausted` - hit credit cap at 04:34:08 UTC before any tool calls (0 tokens, 0 calls, 7s lifespan); sibling fork_mp24yxdn_35964d ran simultaneously on account3 and completed the dispatch consumer work.
- fork_mp24tfi0_411d8b: `account_chain_exhausted` - hit credit cap at 04:29:52 UTC before any tool calls (0 tokens, 0 calls, 4s lifespan); no successful sibling perf consumer this tick.

## Substrate-effect check
- dispatch_event last 2h: 69 rows, range 2026-05-12T02:45..04:21 UTC (pre-fork timestamps; sibling fork_mp24yxdn claims 30 new inserts at 04:34 — consistent, ts field reflects event-origination time not insert time)
- primitive_perf_event last 2h: 106 rows, range 2026-05-12T02:40..03:59 UTC (max ts is ~30min before the perf consumer fork attempted; no perf inserts during the fork window)
- Verdict: **dispatch consumer - work-completed-via-sibling** / **perf consumer - work-actually-missed** (will backfill on 04:44 UTC next tick)

## Existing status_board context
- P2 row outcomeInference.js (id 3494b860): not relevant to update — tracks implementation debt in outcomeInference.js, unaffected by this credit event.
- P3 row "4 cron forks crashed/errored in 02:43 UTC tick" (id e47b3d6d): **directly relevant** — this is the same credit-exhaustion wave continuing. Update: broaden name and context to cover multi-tick pattern, set status to ongoing_partial_recovery.

## Credit chain state
- claude_max (tate@): exhausted — abort messages say "resets 11am (UTC)" = 2026-05-12T11:00:00Z
- claude_max_2 (code@): exhausted — same reset window (all error forks show 0 tokens, accounts 1+2 both burning)
- claude_max_3 (money@): healthy — kv_store wave2 resolution confirms account3 came online first; sibling forks like fork_mp24yxdn running on account3 are succeeding
- Pattern: cron dispatcher fires N parallel forks; some land on account3 (succeed), others hit accounts 1+2 (error). Not flooding — fires match normal 15-30m cron schedule.

## Conductor action this turn
- Update P3 status_board row e47b3d6d to reflect multi-tick pattern and partial recovery state. No new row, no SMS, no escalation.
- All three telemetry crons remain active and scheduled (next fires: dispatch 04:49, perf 04:44, outcome 04:45 UTC). No pausing needed — account3 provides coverage.
- **Defer** full resolution until 11am UTC (~6h from investigation time). At reset: verify all three crons fire cleanly with 0 errors across all accounts.
- Anti-flood spec check: NOT flooding — error intervals are 15-30m (normal cron cadence), well above the flood threshold in ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md.

```sql
UPDATE status_board
SET
  name = 'Cron-fork credit exhaustion — accounts 1+2 exhausted until 11am UTC (12 May 2026)',
  status = 'ongoing_partial_recovery',
  priority = 3,
  next_action = 'No action until 11am UTC reset. Account3 (money@) healthy and covering some ticks. At reset, verify all 3 telemetry crons (dispatch, perf, outcome) fire cleanly.',
  next_action_by = 'ecodiaos',
  last_touched = NOW(),
  context = 'Multi-tick credit exhaustion: 02:43 UTC (4 forks), 04:15 UTC (outcome fork_mp24aq7r), 04:29 UTC (perf fork_mp24tfi0), 04:34 UTC (dispatch fork_mp24yx4z). All abort_reason = "You re out of extra usage resets 11am (UTC)". Account3 (money@ecodia.au) partially back — some forks succeed (dispatch sibling fork_mp24yxdn done at 04:34). Accounts 1+2 still exhausted. Substrate: dispatch consumer work-completed-via-sibling, perf consumer work-missed-this-tick (backfills 04:44). All 3 telemetry crons still active+scheduled. Not flooding. Patterns: graceful-credit-exhaustion-handling.md, cron-fork-anti-flood-on-account-chain-exhaustion.md'
WHERE id = 'e47b3d6d-450c-4363-acce-a3a9ddf7fc40';
```
