# Phase G Critique #3: Consumer/producer ratio drift check blind spot

**Status:** graduated_from_critique
**Priority:** P2
**Audit date:** 2026-05-05
**Critique author:** adversarial-audit fork

## Finding

The decision-quality drift check (`src/services/telemetry/decisionQualityDriftCheck.js`) monitors auto-vs-Tate classification accuracy but does NOT monitor whether its own consumers (outcomeInference, failureClassifier, driftCheck itself, autoTags) are actually processing events. A consumer can flatline (0 events processed over 24h) while the producer continues writing — creating a silent drift blind spot.

Example: the telemetry batch consumer broke on 2026-05-05 (fork_mos86bly_ab448c errored). Events accumulated in JSONL but no `dispatch_event` rows reached Postgres. The drift check saw zero events and reported nothing abnormal. The conductor only noticed when the `perception_summary` showed fork errors.

## Evidence

- Consumer `failureClassifier` processed 0 dispatch events during the JSONL consumer outage window
- Producer `outcome_event` rows continued being written (via other paths)  
- No alert fired — the drift check monitors accuracy (quality) but not throughput (liveness)

## Recommended fix

Add consumer health rules to `decisionQualityDriftCheck.js`:

1. **parent_24h > 50 AND child_24h < 0.3 * parent_24h** → P2 status_board: "Consumer lag: {name} processed {N} vs {M} produced"
2. **child_24h = 0 AND parent_24h > 10** → P1 status_board: "Consumer flatline: {name} processed 0 events in 24h"
3. **Ratio decline over 7d** (5+ consecutive days falling) → P3 status_board: "Consumer attenuation: {name} ratio declining"

### Consumers to monitor

| Consumer | Parent source | Child metric |
|----------|-------------|-------------|
| outcomeInference | dispatch_event | outcome_event |
| failureClassifier | outcome_event WHERE state_change = 'failure_signal' | outcome_event WHERE classification IS NOT NULL |
| driftCheck | outcome_event | its own run events |
| autoTags | surface_event | application_event |

## Cross-refs
- `src/services/telemetry/decisionQualityDriftCheck.js` — file to modify
- `src/services/telemetry/outcomeInference.js` — first consumer to monitor
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 drift detection
