---
triggers: consumer_health_signal, consumer_lag, consumer_pair, decisionQualityService, computeDriftSignals, Layer 4 drift, autoTags, surface_event vs application_event, asymmetric cardinality, per-hook vs per-turn, ratio threshold false positive, applied-tag-telemetry-stop, structural false positive drift, dispatch_event vs outcome_event, drift signal unit mismatch, P2 consumer lag false positive, decision-quality-pass, lagThreshold
category: doctrine
facet: telemetry-drift-signal-correctness
binding: script=backend/src/services/telemetry/decisionQualityService.js + cron=decision-quality-pass
authored_by: decision-quality-pass worker 49d9ffe2 fire 2026-06-10T04:55Z
status: active
---

# consumer_health_signal needs per-pair unit matching, not a uniform ratio

## General form

A drift heuristic of the form "child consumed less than N percent of parent in 24h" only carries signal when the parent and child measure the SAME unit. The moment a producer counts per-event-emission and the consumer counts per-batch-scan, or per-hook-call versus per-turn-summary, the ratio is structurally bounded below the threshold and the rule produces false positives every fire. Applies to any consumer_health style telemetry, not just decisionQualityService.

## Rule

`decisionQualityService.computeDriftSignals()` consumer_health_signal pairs MUST carry a per-pair `lagThreshold`. Set the threshold to a real value only for pairs whose parent and child share a unit. Set `lagThreshold: null` to suppress Rule 1 (lag) for pairs where parent and child have different units. Rule 2 (flatline: child=0 with parent>10) and Rule 3 (attenuation: declining ratio over 5+ consecutive days) still apply, because both are unit-independent.

Today the pairs split cleanly:

- `outcomeInference` (dispatch_event -> outcome_event) is a true 1:1: one outcome inferred per dispatched action. `lagThreshold: 0.3`. Real signal.
- `autoTags` (surface_event -> application_event) is NOT 1:1. surface_event counts per-hook-call (90 percent of 24h volume comes from hook:status-board-write firing on every matching write). application_event counts per-pattern-per-Stop-scan (one row per unique pattern detected in transcript at end of conductor turn). A healthy turn with 20 hook surfaces detecting 5 unique patterns yields ratio 0.25, below 0.3 while the consumer is fine. `lagThreshold: null`. Suppress Rule 1.

## Why

2026-06-10T04:55Z `decision-quality-pass` cron fire 49d9ffe2 inherited the autoTags consumer_lag flag for the 4th consecutive fire. The status_board row `1c2b1eb2-415a-45b3-a75d-757c85b13866` had been carrying a confident-sounding "consumer pipeline regression, investigate the application_event drain" diagnosis since 2026-06-09. Live probes in this fire falsified the regression frame:

- application_event total 996, most_recent 2026-06-10T04:14:52Z (41 minutes before this fire). NOT frozen.
- application_event 24h hourly distribution shows bursty per-Stop activity: 04:00 hour n=8, 01:00 hour n=5, 09:00 hour n=4. Stop scanner IS detecting and writing pattern surfacings as designed.
- surface_event 24h breakdown: `hook:status-board-write` 1198, `hook:cred-mention` 110, `hook:dispatch-sched-reflex-surface` 7, etc. The producer is dominated by a per-write hook, while the consumer counts per-pattern-detection-per-turn-Stop. Different units.
- outcomeInference pair ratio 0.3762, just above its 0.3 threshold. The 0.3 threshold makes sense there because dispatch and outcome share a unit (per-action).

The 0.3 threshold for autoTags is structurally unreachable in normal operation because a conductor turn produces N surface_event rows but at most O(unique-patterns-detected) application_event rows, and unique-patterns-per-turn is always smaller than per-write-hook-emission-count-per-turn. The rule has never fired correctly for autoTags; every prior fire that wrote "investigate the consumer pipeline" was a wrong diagnosis sitting in durable substrate.

This is the same shape as `[[silent-hook-candidate-drift-signal-needs-emit-surfaces-vs-wired-distinction-2026-06-10]]`: a defensible-looking heuristic with no per-pair (or per-hook) class awareness absorbs class-mismatched inputs and pollutes the drift signal. There the silent_hook_candidate default ate every conditional-emit hook; here the consumer_health_signal default ate every asymmetric-cardinality pair.

It is also a direct hit on `[[verify-before-asserting-in-durable-memory]]`, `[[verify-deployed-state-against-narrated-state]]`, and `[[outcome-classification-must-distinguish-unverified-from-success]]`. Prior fires asserted a "consumer pipeline regression" without probing whether the producer and consumer shared a unit.

## How to apply

When extending `CONSUMER_PAIRS` in `decisionQualityService.computeDriftSignals()` or adding a new consumer_health rule anywhere:

1. State the unit each side measures. Parent unit, child unit. If they differ, set `lagThreshold: null`.
2. Same-unit pair example: dispatch_event (one row per dispatched tool action) and outcome_event (one outcome inferred per action). Threshold 0.3 fires when the consumer falls more than 70 percent behind.
3. Different-unit pair example: surface_event (per-hook-call) and application_event (per-pattern-per-Stop). Threshold null suppresses Rule 1. Rule 2 (flatline) still catches the genuine drain-dead case; Rule 3 (attenuation) catches gradual decline against the pair's own historical baseline.
4. When the rule is suppressed, the substrate-write deliverable shifts to the flatline check. Document the per-pair reasoning in the inline comment so the next worker does not re-add a threshold.

For drift heuristic authoring generally: every ratio rule must answer "what is the unit on each side?" before setting a threshold. A ratio between different units is not a ratio, it is a category error.

## Anti-patterns

- Adding a new consumer pair to CONSUMER_PAIRS without per-pair lagThreshold review. Default 0.3 is the wrong default for any asymmetric-cardinality pair.
- Writing "investigate consumer pipeline" into a P2 or P3 row without first running per-hour COUNT queries on both parent and child. Bursty consumers look dead by ratio while being healthy by latest-ts.
- Disabling consumer_health_signal entirely to dodge the false positive. The outcomeInference pair signal is real and worth surfacing. The fix is per-pair config, not signal removal.
- Lowering the threshold globally (e.g. 0.3 -> 0.01) to silence false positives. That hides genuine outcomeInference lag too. Per-pair config is the right granularity.

## Related

- `[[silent-hook-candidate-drift-signal-needs-emit-surfaces-vs-wired-distinction-2026-06-10]]` - sibling Layer 4 drift signal class-mismatch authored 2026-06-10T04:19Z by the same cron, fixed at 04:36Z by commit 2dd0a38e.
- `[[verify-before-asserting-in-durable-memory]]` - the prior fires' failure mode (wrong diagnosis sitting in a P3 row).
- `[[verify-deployed-state-against-narrated-state]]` - probe the substrate before narrating regression.
- `[[outcome-classification-must-distinguish-unverified-from-success]]` - sibling-class rule on the outcome side.
- `[[layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26]]` - the Stop-event scanner doctrine that pairs with application_event.
- `[[decision-quality-self-optimization-architecture]]` - parent architecture, Layers 1-5.

## Evidence at codify time (2026-06-10T04:55Z, this fire)

- Pre-patch sub-pass B returned 1 flag: `consumer_health_signal` "Consumer lag: autoTags", ratio 0.0136 (18/1323).
- Post-patch sub-pass B returned 0 flags. outcomeInference ratio 0.3762, autoTags lag rule suppressed (lagThreshold null), Rule 2 not triggered (cc=18 not 0), Rule 3 not triggered.
- surface_event 24h source_layer composition: hook:status-board-write 1198, hook:cred-mention 110, hook:dispatch-sched-reflex-surface 7, hook:status-board-hygiene 5, hook:emit-telemetry-py-smoke 2, hook:chrome-cdp-reflex-surface 1.
- application_event 24h hourly distribution: 04:00 n=8, 01:00 n=5, 09:00 n=4, 06:00 n=1, 01:00 n=3 (5 hours active, 18 rows total, latest 2026-06-10T04:14:52Z).
- dispatch_event 24h: 5319 across 10 hours active. outcome_event 24h: 2001. autoTags ratio 0.0136, outcomeInference ratio 0.3762.
- Status_board row `1c2b1eb2-415a-45b3-a75d-757c85b13866` (entity_type=infrastructure) carries the wrong "investigate consumer pipeline" diagnosis from prior fires. Cowork scope cannot update infrastructure rows so this fire ships the fix in code and authors this doctrine; the row needs reframing or archival by a wider-scope actor.
