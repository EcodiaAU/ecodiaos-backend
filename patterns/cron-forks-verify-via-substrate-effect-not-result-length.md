---
triggers: cron-fork-verification, self-unverified, telemetry-cron, outcome-inference, unverified-rate, deterministic-cron, substrate-verification, result-length-heuristic, cron-fork-outcome, cron-self-classify
status: active
---

# Cron Forks Must Verify Success via Substrate Effect - Not Result Length

## Rule

The outcome inferrer's generic "result_length > 0" heuristic is wrong for deterministic cron forks. A cron fork that runs a fixed shell script, writes a row to a table, or posts a metric produces a short, deterministic output - not a multi-paragraph narrative. Inferring `outcome='unverified'` because `result_length < threshold` silently corrupts the telemetry baseline for the exact forks that ARE the telemetry infrastructure.

Cron forks that implement the telemetry pipeline (dispatch consumer, outcome inferrer, failure classifier) are a special case of a general principle: **for any fork whose success produces a predictable downstream substrate change, verify by probing the substrate, not by measuring output length.**

## Do

- For telemetry-pipeline cron forks: verify success by checking whether the target substrate was updated after fork start time:
  - Consumer fork: `SELECT COUNT(*) FROM dispatch_event WHERE ts > :fork_started_at` - if > 0, consumer ran
  - Inferrer fork: `SELECT COUNT(*) FROM outcome_event WHERE ts > :fork_started_at` - if > 0, inferrer ran
  - Classifier fork: `SELECT COUNT(*) FROM outcome_event WHERE classification_at > :fork_started_at` - if > 0, classifier ran
- For any deterministic cron fork with a known side-effect: add a fork-brief prefix marker (e.g. `TELEMETRY DISPATCH CONSUMER:`, `INDEX REGEN:`, `HEALTH CHECK:`) and add a substrate-verification rule in the inferrer keyed on that prefix
- If inferrer doesn't have a rule for the prefix, classify as `outcome='unverified'` with `evidence='deterministic_cron_no_substrate_rule'` rather than the generic unverified - this makes the gap visible

## Do NOT

- Infer `outcome='success'` on cron forks based on `result_length > N` - deterministic forks produce minimal output by design
- Infer `outcome='unverified'` as a catch-all for telemetry cron forks - if the system's own verification machinery is "unverified", the telemetry baseline is self-corrupted
- Leave the inferrer's `telemetry:` or `TELEMETRY` prefix unhandled - these forks are high-frequency (15min, 30min, 1h cycles) and misclassification accumulates rapidly

## Diagnosis

```sql
SELECT brief_excerpt_prefix, outcome, COUNT(*) 
FROM outcome_event oe 
JOIN dispatch_event de ON oe.dispatch_event_id = de.id
WHERE de.metadata->>'brief_excerpt' ILIKE 'TELEMETRY%' 
   OR de.metadata->>'brief_excerpt' ILIKE '%cron%'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

If any prefix row shows 100% `unverified`, the inferrer has no substrate rule for that fork class.

## Generalisation

This principle applies beyond telemetry cron forks. Any fork whose sole deliverable is a substrate write (db row, git commit, file write, status_board update) should be verified by probing that substrate, not by reading the fork's output text. The inferrer should have a "substrate-effect" verification path as a first-class alternative to "result_length and confidence-keywords."

The inverse is also true: a fork with a long, fluent output but no substrate side-effect has produced nothing durable - output length is not the deliverable.

## Origin

Found in Phase G adversarial self-audit 2026-05-11 as critique-03 (`phase-G-audit-2026-05-11/critique-03-telemetry-cron-forks-self-unverified`). All 27 telemetry-pipeline cron forks in a 7-day window were classified `outcome='unverified'` by the inferrer they implement. Evidence: TELEMETRY DISPATCH CONSUMER (15 forks, 0 success), TELEMETRY OUTCOME INFERENCE (8 forks, 0 success), TELEMETRY FAILURE CLASSIFIER (4 forks, 0 success). A slight brief variant (shorter prefix) did achieve success=3/3, confirming the outcome was sensitive to brief format, not fork quality. Graduated from Critique node to pattern file 2026-05-12 via fork_mp1drm4m_dbb590 Phase G triage pass.

## Cross-refs

- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` (deliverable must land in a substrate; this pattern adds: the inferrer must verify the substrate, not the narration)
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` (same verification-by-effect principle at the operator level)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 (outcome inference specification)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (the five-layer check applies to the cron-fork verification path itself)
