---
triggers: entropy collapse, single-class collapse, checkClassificationEntropy, classification_deficit, rolling-50 entropy, classifier routing audit, producer stall, telemetry frozen, decision-quality-pass, failureClassifier, Phase D entropy, homogeneous distribution alarm, distribution drift false positive, TUNE layer noise, producer freshness guard, newest outcome_event ts, paused learning machine alarm
category: doctrine
facet: telemetry-drift-signal-correctness
binding: code=backend/src/services/telemetry/failureClassifier.js checkClassificationEntropy + cron=decision-quality-pass
authored_by: decision-quality-pass worker 49d9ffe2-8b6f-4f73-93a2-ed202264b28a 2026-06-14T06:53Z
status: active
---

# Classifier entropy/homogeneity alarms must guard on producer freshness

## General form

Any health alarm that fires on "the recent output distribution collapsed to one class" is only valid when fresh input is still arriving. When the upstream producer has stalled, the recent-output window is homogeneous because its sole remaining input is a stale burst already drained to one class, not because the classifier or router broke. A distribution-collapse alarm with no producer-freshness guard re-asserts a false "audit the routing" diagnosis on every fire for as long as the producer stays stalled. The honest discriminator is the age of the newest producer row, not the shape of the output distribution.

This is the same failure family as `[[silent-hook-candidate-drift-signal-needs-emit-surfaces-vs-wired-distinction-2026-06-10]]` and `[[outcome-inference-must-exclude-raw-hook-telemetry-action-types-2026-06-10]]`: a defensible-looking default absorbs a wrong-class condition and mislabels it, polluting the metric.

## Rule

`failureClassifier.checkClassificationEntropy` MUST probe the newest `outcome_event.ts` before raising the single-class-collapse P2. If the newest outcome row is older than 6h (producer stalled), the homogeneity is a producer-stall artefact:

- downgrade the row to P3,
- rewrite the context to name the stall ("newest outcome_event row is Nh old ... no classifier-routing action while production is paused"),
- set `next_action` to "no action until fresh telemetry resumes".

Only when fresh outcomes ARE arriving (newest ts within 6h) and entropy is still < 0.5 is it a genuine classifier-routing collapse worth a P2 "audit routing" alarm.

## Why

2026-06-14T06:5xZ `decision-quality-pass` fire (task 49d9ffe2) found the standing P2 row `1f1a9fd4` "Phase D classifier single-class collapse - entropy below 0.5 bits" asserting "Action: audit classifier routing". Cross-substrate probe established the real state:

- `outcome_event` newest row 2026-06-10 04:27, `dispatch_event` newest 2026-06-10 05:12, `surface_event` newest 2026-06-10 05:11. All three telemetry tables stopped writing simultaneously at ~2026-06-10 05:12 - the intentional seven-layer-learning-machine pause (billing, per Tate, resume is his call).
- The 1800-row unclassified backlog was a single homogeneous burst of `outcome=unverified` rows from 2026-06-09T07:59:59 to 2026-06-10T04:20, every one correctly classified to `classification_deficit`. The classifier was healthy and draining 200/run; this fire drained it 1800->0.
- Entropy was 0.000 not because routing collapsed but because the only classifiable input was that stale homogeneous burst. The producer had been silent 98h.

The unguarded alarm would have kept telling every future fire (and Tate) to "audit classifier routing" every 2h for the entire duration of the pause - chasing a routing bug that does not exist. The classifier cron itself is NOT paused (it still fires, drains, heartbeats), only the upstream producers are, so the alarm self-perpetuates.

The fix added a producer-freshness probe (`SELECT EXTRACT(EPOCH FROM (NOW()-MAX(ts))) FROM outcome_event`) and branched the alarm: P3 stall-artefact framing when stalled, original P2 routing framing when fresh. Verified live: row 1f1a9fd4 flipped to P3 with context "PRODUCER-STALL ARTEFACT, not a routing collapse: newest outcome_event row is 98h old".

## How to apply

- The entropy row is `entity_type=infrastructure`. A `cowork`-scope `status_board_upsert` CANNOT write it (`[[cowork-cannot-update-infrastructure-status-board-rows-2026-06-10]]`). The classifier writes it via direct `client.query` (server-side, not the cowork connector), which is in scope. A cron worker that needs to touch it out-of-band uses `db_execute`, never the MCP upsert.
- 6h is the stall threshold: comfortably longer than the cron's own 2h cadence and the 24h unverified-eligibility gate's natural lag, short enough to catch a genuine producer halt within a few fires. Tune if the producer cadence changes.
- Generalise the guard to any sibling distribution/rate alarm in the telemetry stack (drift signals, surfacing-rate health, signal_density) before trusting a "distribution collapsed" reading: check the producer is alive first.

## Anti-patterns

- Raising or re-asserting "audit classifier routing" while the producer is demonstrably stalled. The routing is fine; the input is empty.
- Annotating the entropy row's `context` by hand to record the real cause. `checkClassificationEntropy` overwrites `context` every fire, so a hand annotation is clobbered within one cadence. Fix the alarm logic instead.
- Archiving the entropy row because "it is just the pause". It correctly reflects a live-but-degraded TUNE input; let it sit at P3 until fresh telemetry resumes and the guard re-evaluates it.
- Treating the 2026-06-10 telemetry freeze as an outage / P1. It is the intentional learning-machine pause; the single clean cutover across all three tables is the tell.

## Related

- `[[silent-hook-candidate-drift-signal-needs-emit-surfaces-vs-wired-distinction-2026-06-10]]` - sibling drift-signal false-positive class authored by this same cron.
- `[[outcome-inference-tool-call-guard-must-be-sql-side-not-js-side-2026-06-10]]` - the same fire's other lesson on narrated-empty distributions masking real state.
- `[[cowork-cannot-update-infrastructure-status-board-rows-2026-06-10]]` - why the entropy row is written server-side, not via MCP.
- `[[decision-quality-self-optimization-architecture]]` - the TUNE layer this alarm feeds.
- `[[verify-deployed-state-against-narrated-state]]` - the probe that revealed the real cause behind a confident-sounding alarm.
- `[[decision-quality-classifier-must-heartbeat-and-alert-on-backlog]]` - the backpressure sibling alarm.
