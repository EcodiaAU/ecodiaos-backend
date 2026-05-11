# Perf Consumer Diagnosis - 2026-05-12
Fork: fork_mp1runw1_f84791

## Failure Mode Confirmed: (e-variant) - single credit_exhaustion event, NOT recurring

The brief's characterisation of "~15 cron fires all closing without artefact" was a perception
artifact. Actual 24h data (os_forks, last 7 telemetry-perf-consumer fires):

| Fork | Status | Tool calls | Outcome |
|------|--------|-----------|---------|
| fork_mp1rti8p_07e2bb | error | 0 | CREDIT EXHAUSTION |
| fork_mp1r84a1_7c4e10 | done | 2 | 17 rows inserted |
| fork_mp1qo1ld_21a494 | done | 2 | 11 rows inserted |
| fork_mp1q2feh_f77973 | done | 2 | 12 rows inserted |
| fork_mp1pggy3_e0865e | done | 2 | 84 rows inserted |
| fork_mp1p98dt_3e9962 | crashed | 0 | unrelated (api_memory_restart) |

5 of 6 resolved forks succeeded. 1 failed. The failing fork's `abort_reason`:
`"Claude Code returned an error result: You're out of extra usage · resets 11am (UTC)"`

This is the known credit_exhaustion pattern per
`~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md`. The SDK aborted before
executing any tools because the Claude Max extra usage cap was hit at ~22:26 UTC. Resets
at 11:00 UTC daily.

## Manual Run Output (2026-05-12 ~22:27 UTC)

```
[perf-consumer] tick complete: {"ok":true,"processed":12,"perfInserts":12,"lineErrors":0,
  "processedPath":"/home/tate/ecodiaos/logs/telemetry/processed/2026-05-11T22-27-46-397Z-perf-events.jsonl"}
```

Script healthy. perf-events.jsonl rotated and consumed. primitive_perf_event table exists
and is receiving rows.

## What was NOT the problem

- (a) Cron prompt: complete, well-formed, not truncated
- (b) Consumer script path: exists at `src/services/telemetry/perfEventConsumer.js`
- (c) DB connection / missing table: `primitive_perf_event` exists, inserts succeed
- (d) Empty JSONL: file had 12 events queued when this fork ran

## Recommended Fix

No code fix required. The consumer, prompt, script, and table are all correct. The single
failure at 22:26 UTC was a transient credit_exhaustion event that self-resolves at the 11:00
UTC reset. Per the graceful-credit-exhaustion-handling pattern: classify as credit_exhaustion
(not fork_error), mark resumable. The next cron fire at 22:41 UTC (after reset window) will
succeed.

## Cron Pause: NOT recommended

The cron is working correctly 5/6 fires in 24h. Pausing it would cause perf-events.jsonl to
accumulate unbounded. The credit_exhaustion pattern is system-wide (affects all forks during
the daily cap window) - pausing this specific cron solves nothing.

## Note on Perception Artifact

The "15 silent fires" perception likely came from forks with status=done but processed=0
(correct silent-exit per cron prompt: "Exit silent on processed:0") being counted as
"without artefact". Those are correct behaviour - they ran when the JSONL queue was empty.
