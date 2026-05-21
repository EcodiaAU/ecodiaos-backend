---
triggers: decision-quality-classifier, dq-classifier, dq-classifier-backlog, outcome_event-unclassified, outcome_event, dq-classifier-heartbeat, dq-classifier-backpressure, classification-deficit, silent-accumulation, dq-classifier-starvation, dq-classifier-budget
status: active
authored_at: 2026-05-13
origin_fork: fork_mp3o3hvx_9a7222
---

# Decision-quality classifier must heartbeat and alert on backlog accumulation

<!-- Trigger narrowing 2026-05-21 (self-evolution routine).
     OLD: decision-quality-classifier, dq-classifier, backlog, unclassified, outcome_event, heartbeat, backpressure, classification-deficit, silent-accumulation
     NEW: decision-quality-classifier, dq-classifier, dq-classifier-backlog, outcome_event-unclassified, outcome_event, dq-classifier-heartbeat, dq-classifier-backpressure, classification-deficit, silent-accumulation, dq-classifier-starvation, dq-classifier-budget
     Why: removed 4 bare-noun triggers (backlog, unclassified, heartbeat, backpressure) per triggers-must-be-narrow-not-broad.md - these would fire on every queue/health/backpressure brief. Replaced with `dq-classifier-` prefixed compounds and `outcome_event-unclassified` (compound of the literal table-column-style name with the state). Added `dq-classifier-starvation` and `dq-classifier-budget` for the per-tick budget starvation failure mode covered in the body. -->


## Rule

The `decision-quality-classifier` cron is the only process that classifies `outcome_event` rows. If it silently falls behind, the Phase D metric pipeline produces stale/misleading signals with no visible alarm. Two failure modes must be instrumented:

1. **Silent backlog accumulation** — unclassified rows pile up without triggering any alert.
2. **Single-pass starvation** — cheap rows (success/unverified) eat the entire per-tick budget, starving expensive rows (failure/correction) that need semantic search.

## Do

- **Heartbeat every tick**: write `kv_store.health.decision_quality_classifier` with `{ts, processed, unclassified, oldest_unclassified_age_sec}` on EVERY run, including zero-work ticks. This is the canary that lets monitoring detect starvation without querying `outcome_event` directly.

- **Two-pass architecture**: separate cheap rows (success, unverified — no semantic search) from expensive rows (failure, correction — one Neo4j vector probe each) with independent per-tick caps.
  - `DEFAULT_MAX_CHEAP_PER_TICK = 200` (success + unverified)
  - `DEFAULT_MAX_SEMANTIC_PER_TICK = 50` (failure + correction, embedding budget cap)
  
  Rationale: after Phase G Critique #5 added success/unverified rows (93% of population) to the queue, the old single `LIMIT 50` caused all 50 slots to be consumed by cheap rows every tick, leaving failure/correction rows permanently unclassified.

- **Backpressure alerting** with consecutive-run thresholds (not point-in-time):
  - Soft (unclassified > 50 for 2 consecutive runs): write `kv_store.alert.dq_classifier.backlog` + SMS via `osAlertingService.sendSmsToTate`.
  - Hard (unclassified > 200 for 4 consecutive runs): status_board P2 upsert + escalated SMS.
  - Consecutive state persisted in `kv_store.telemetry.dq_classifier.consecutive_over_threshold`.
  - 12h SMS dedup to prevent alert storms during extended degradation periods.

- **Dry-run support**: set `DQ_CLASSIFIER_ALERT_DRY_RUN=1` (or CLI `--dry-run`) to suppress SMS sends while still writing kv_store keys. Required for test environments and backfill runs.

## Do not

- Do not use a single `LIMIT N` query for all outcome classes when cheap and expensive rows coexist in the queue — cheap rows will always win the timestamp ordering and starve the expensive path.
- Do not skip the heartbeat write on no-op ticks (classified=0) — a silent no-op is indistinguishable from a crash if there is no heartbeat.
- Do not alert on a single over-threshold observation — transient spikes (single burst hour) should not page. Consecutive-run gating filters transients.
- Do not send more than one SMS per 12h for the same alert level — the `soft_sms_last_sent` dedup key enforces this.

## Verification protocol

After shipping a change to the classifier:
1. Run with `--dry-run` and verify `[DRY_RUN] would SMS` lines appear at the correct thresholds.
2. Check `kv_store.health.decision_quality_classifier` was written with a fresh `ts`.
3. Query `SELECT outcome, classification, COUNT(*) FROM outcome_event WHERE classification IS NULL GROUP BY 1, 2` — the only acceptable NULL rows are `unverified` younger than 24h.

## Origin

2026-05-13, fork_mp3o3hvx_9a7222, Phase G audit-2026-05-12 critique-03.

**Root cause diagnosed:** After Critique #5 (2026-05-12) expanded the classifier to process success/unverified rows (~93% of population), the single `LIMIT 50` caused every tick to fill its budget with cheap unverified→classification_deficit rows. Failure and correction rows — the semantically meaningful ground-truth signals — were permanently starved. Evidence: `outcome='failure', classification=NULL: 50 rows; outcome='success', classification=NULL: 150 rows; outcome='unverified', classification=NULL: 242 rows` accumulated over 38+ hours despite the cron firing 38+ times.

**Backfill executed:** `--max-cheap=500 --max-semantic=100 --dry-run` on 2026-05-13T06:25 cleared 228 rows (50 operational_failure + 10 usage_success_with_silent_doctrine + 140 verified_clean + 28 classification_deficit). `unclassified_after=0`. Entropy restored to 0.826 bits.

## Cross-refs

- `~/ecodiaos/patterns/health-canary-must-alert-not-silently-accumulate.md` — threshold-based escalation doctrine
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` — Phase D / Layer 5 spec
- `~/ecodiaos/patterns/phase-d-must-classify-all-outcome-classes-not-just-failure.md` — single-class collapse spec
- `~/ecodiaos/src/services/telemetry/failureClassifier.js` — implementation
