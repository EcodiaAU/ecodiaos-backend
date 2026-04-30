triggers: credit-wall, out-of-extra-usage, burst-rate, anthropic-throttling, fork-dispatch-cadence, paywall, weekly-cap, extra-usage-pool, both-paths-exhausted, credit-exhaustion

# Anthropic credit-wall is burst-rate throttling not total exhaustion

## The rule

When SDK fork dispatches return `Claude Code returned an error result: You're out of extra usage · resets <date>`, the failure is **burst-rate throttling** on Anthropic's Extra Usage pool, not total weekly exhaustion. The pool refills slowly between bursts. Spaced-out dispatches succeed; bursts of 3+ within 60s fail.

The named reset date is the **hard floor** for guaranteed availability, not the time at which dispatches start working again. Dispatches start working again within ~15 minutes when cadence drops below the throttle threshold.

## Do
- Treat consecutive credit-exhaustion errors as a cadence problem, not a capacity problem
- Reduce fork dispatch cadence to ≤1 per 60-120s when the error appears
- Continue letting cron-fired single-fork tasks run (they're naturally spaced)
- Probe a running SDK fork's tool count before classifying state - if any fork has tool_count >0 in the last few minutes, the pool is NOT empty
- Update the credit-wall status_board row to `BURST_RATE_THROTTLED_INTERMITTENT` with cadence-reduction guidance, not `BOTH_PATHS_EXHAUSTED`
- SMS Tate once with the throttling state, NOT once per errored fork (the listener will fire per-fork)

## Do not
- Classify the failure as `BOTH_PATHS_EXHAUSTED` or `total_credit_exhaustion` on first observation
- Pause every recurring cron - many will succeed naturally on cadence
- Set the status_board row to P1 unless productive throughput has actually halted (verify by probing a fresh dispatch)
- Treat the named reset date as the time to "wait until" - dispatches usually self-recover within minutes
- Spam Tate with one SMS per errored fork in the burst

## Verification protocol (before declaring full exhaustion)

1. Probe `os_forks` for any fork with `started_at > NOW() - INTERVAL '5 minutes'` AND `tool_calls > 0`. If yes → throttled, not exhausted.
2. Spawn one test SDK fork with a trivial brief (1-tool brief like "echo hello and exit"). Wait 30s. If it succeeds, throttling not exhaustion.
3. Only after both 1 and 2 fail (no recent successful tool, test fork errors instantly) is the framing `total_exhaustion` correct.

## Origin

30 Apr 2026 19:45-20:02 AEST meta-loop. Conductor observed 6 SDK forks errored at 9-10s/0 tools with `out of extra usage · resets May 5, 11am (UTC)`. Wrote status_board P1 row 844ca706 status = `BOTH_PATHS_EXHAUSTED_30_apr_2026_19:45_AEST` and SMS'd Tate. 17min later (20:02 AEST), observed fork_molbbzgc_3d68ce running successfully 134s/12 tool calls, contradicting the framing. The 6 burst-failures were ~30min apart from the running fork - the pool refilled between waves. Reframed status_board to `BURST_RATE_THROTTLED_INTERMITTENT_30_apr_2026` priority=2 and codified this pattern.

The wrong move (which I made) was the panic-frame: SMS Tate, mark P1, prepare to pause crons. The right move would have been: probe a running fork first, observe success, frame as throttle. The 30 seconds it took to read os_forks live state at 20:02 AEST would have prevented the wrong P1 update at 19:46.

## Cross-references
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` - the per-fork classification protocol that still applies; this pattern refines the wave-level state
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the meta-rule (probe live state before propagating a frame)
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` - sibling rule for cached metrics
- Status_board P1 row 844ca706 (Factory CLI paywall) - the row reframed by this lesson
