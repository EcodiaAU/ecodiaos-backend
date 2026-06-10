---
triggers: outcome-inference, tickInferOutcomes, wrongInputClass, dispatch_event, tool_call hook telemetry, LIMIT burn, outcome backlog, signal_density
status: active
binding: code=src/services/telemetry/outcomeInference.js tickInferOutcomes WHERE clause
---
# Outcome-inference tool_call guard must filter in SQL, not JS

**Rule.** When `outcomeInference.tickInferOutcomes` excludes a wide class of dispatch rows from inference (the `tool_call:%` hook telemetry guard introduced 2026-06-10 via `outcome-inference-must-exclude-raw-hook-telemetry-action-types-2026-06-10.md`), the exclusion MUST be applied in the SQL `WHERE` clause, not as a `continue` inside the row loop. Otherwise the per-tick `LIMIT` burns on rows the guard will skip anyway, and the inferrer never sees the classifiable rows it exists to classify.

**Why.** Discovered 2026-06-10 during the consolidated telemetry-batch cron fire (task `b4474169-91ed-44f6-929e-0f6a8dd6ab37`). The JS-side guard worked as a correctness gate but did not push down to the LIMIT, so:
- `tickInferOutcomes` SELECTed 500 unresolved dispatches in `ts ASC` order.
- The 14-day, 5-min-old, no-outcome backlog held 12,494 rows of which 12,493 were `tool_call:%` hook telemetry (wrong input class) and only 1 was classifiable.
- Every tick returned `inferred=0, wrongInputClass=500`, distribution all zeros, `signal_density` undefined-as-100% by the `(inferred + wrongInputClass) == 0` short-circuit. The TUNE layer was reading flat-line empty distributions and could not tell whether the inferrer was healthy-but-quiet or starved-by-LIMIT.
- The signal looked like "no work to do", which it wasn't: the work the inferrer exists to find was beneath the LIMIT horizon, indefinitely.

**How to apply.**
- Any `continue` inside `tickInferOutcomes` (or a sibling tick function) that is purely an input-class filter belongs in the SELECT's `WHERE` clause. If the JS-side guard remains as belt-and-braces, that is fine, but the LIMIT must not see rows the guard will reject.
- `signal_density = inferred / (inferred + wrongInputClass)` is a useful intra-batch noise metric ONLY when `wrongInputClass` rows survive the SQL filter (eg edge cases the SQL can't express). When the SQL filter is exhaustive, `signal_density` becomes purely `inferred / inferred` and the metric collapses to "did we classify". That is the desired state; do not invent a synthetic wrongInputClass count to "preserve" the metric.
- Backfill paths (`backfillCorrections`, `backfillSuppressedCorrections`) are a different invariant: they explicitly want to INCLUDE `unverified`/no-outcome rows so they can be upgraded on a chat-signal match. They do NOT need the tool_call exclusion in their SQL because `findTateChatSignal` returns null for hook telemetry by construction; the waste is bounded by signal absence, not by per-tick LIMIT. Leave them alone.

**Verification probe.** Before declaring the fix shipped, run:
```
SELECT
  COUNT(*) FILTER (WHERE d.action_type LIKE 'tool_call:%' AND COALESCE(d.action_subtype,'') <> 'infrastructure_verified') AS hook_rows,
  COUNT(*) FILTER (WHERE NOT (d.action_type LIKE 'tool_call:%' AND COALESCE(d.action_subtype,'') <> 'infrastructure_verified')) AS classifiable_rows
FROM dispatch_event d
LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
WHERE o.id IS NULL
  AND d.ts < NOW() - INTERVAL '5 minutes'
  AND d.ts > NOW() - INTERVAL '14 days';
```
Then re-run `tickInferOutcomes` once. `wrongInputClass` should drop from `LIMIT` to a small number (ideally 0), `inferred + skipped` should equal `classifiable_rows` (capped at LIMIT), distribution should be non-empty when classifiable rows exist.

**Anti-patterns.**
- Do NOT bump the LIMIT to compensate for a JS-side guard. That trades one wasted query plan for a bigger wasted query plan, and the symptom returns the moment the backlog grows again.
- Do NOT remove the JS-side guard when the SQL filter is added. The redundant belt-and-braces check guards against future SQL drift and costs one cheap string compare per row.
- Do NOT classify the "flat-line empty distribution" output as "consumer healthy" without checking the underlying classifiable backlog. A 100% wrongInputClass tick is a producer/SQL drift signal that demands triage.

**Origin.** 2026-06-10 telemetry-batch fire. Probe established 12,493/12,494 = 99.99% of the 14-day no-outcome backlog was hook telemetry; the JS-side guard was correctly excluding them but only after the LIMIT had already been spent. Fix moved the guard into the SELECT's `WHERE`.

**Cross-refs.**
- [[outcome-inference-must-exclude-raw-hook-telemetry-action-types-2026-06-10]]: the JS-side guard that motivated this push-down.
- [[outcome-classification-must-distinguish-unverified-from-success]]: the parent doctrine on inference correctness.
- [[decision-quality-self-optimization-architecture]]: the TUNE layer this inferrer feeds.
- [[verify-deployed-state-against-narrated-state]]: narrated `ok:true` masked starvation; a probing query revealed the real state.
