triggers: outcome, oracle, success-bias, survivorship, inference, confidence, triangulation, artefact-verification

# Outcome inference must seek evidence of failure - absence of error is not success

## The rule

When inferring the outcome of a dispatched action (tool call, fork spawn, factory dispatch), the oracle MUST search for evidence of failure across MULTIPLE substrates BEFORE classifying the outcome as success. The absence of a crash is not evidence of correctness. A fork that completed without an error signal may have failed silently, produced wrong results, written no artefact, or been aborted at the parent level - the oracle only learns this by probing across the failure surface.

Single-substrate inference (checking only one table for status) creates survivorship bias in the decision-quality feedback loop. Every outcome-event row classified as `success` from a single positive signal inflates the success_rate metric while the actual work may have produced nothing. The self-tuning loop calibrates against a null oracle - every drift-detection rule keyed on outcome metrics reads from a structurally vacuous dataset.

## Failure substrates to probe (in priority order)

1. **Process status** (os_forks.status IN ('error','aborted','errored','failed','cancelled') / cc_sessions.status IN ('error','rejected','aborted')) - the dispatch's own row in the fork/session table
2. **Tool output evidence** (non-zero exit codes, error objects in return values, failure_class fields on the fork/session row) - the dispatch produced something that looks like a failure
3. **Expected artefact absence** (dispatch metadata specifying `expected_artefact` / `output_path` that does not exist) - the dispatch finished but produced nothing expected
4. **Timing anomaly** (non-trivial dispatch completed in <15 seconds) - suspiciously fast completion suggests the fork bailed without doing real work
5. **Human correction signal** (Tate SMS within 30 min containing correction keywords) - the strongest negative signal when present
6. **Downstream failure cascade** (fork spawned children that failed or aborted) - the fork looked clean but its dependents did not

## Do

- DO probe at least 3 failure substrates before returning `{outcome: 'success'}`
- DO set confidence based on triangulation count: 3+ substrates = 0.9 (high), 2 = 0.7 (medium), 1 = 0.4 (low), 0 = 0.2 (no evidence)
- DO encode confidence in the evidence string as `confidence=N.N|` prefix for downstream metric pipelines
- DO log a warning when returning success with confidence < 0.7, and downgrade to `unverified` when confidence < 0.5
- DO surface a status_board P1 row when the oracle's outcome_classification_rate drops below baseline * 0.5
- DO count Human correction as the strongest negative signal - it overrides all other substrates when present
- DO specify an `expected_artefact` in dispatch metadata when the dispatch is expected to produce a tangible deliverable (status_board row, file on disk, DB record, email sent)

## Do NOT

- Do NOT treat "no error" as "success" - treat it as "unknown with weak positive signal" at best
- Do NOT collapse confidence to a single substrate when multiple are available - triangulation is the entire point
- Do NOT classify `unverified` as `success` at any confidence level - `unverified` is a first-class state that surfaces the dark-matter problem
- Do NOT suppress low-confidence warnings - the warning IS the signal that the oracle needs more substrates, not less logging
- Do NOT skip the artefact probe when metadata specifies `expected_artefact` - that metadata exists precisely because the dispatcher expected a deliverable, and the oracle must verify it

## Verification

Before/after test on outcomeInference.js:

1. Dispatch a fork that completes with status='done' but writes no expected artefact
2. Before: inferrer returns `{outcome: 'success', evidence: 'os_forks.status=done result_length=0'}` with no confidence field
3. After: inferrer returns evidence starting with `confidence=0.4|` reflecting the probe count and containing triangulation data

Probe the outcome_event table after fix:
```sql
SELECT COUNT(*) FROM outcome_event WHERE evidence LIKE 'confidence=0.%' AND outcome='success';
```
Expect zero rows with confidence < 0.5 for `success` outcomes after the fix (such rows are downgraded to `unverified`).

The distribution of confidence values across all outcome_event rows should show a spread (not all 0.9+). A uniform cluster at 0.9 means the oracle is not finding enough disconfirming evidence to overcome its success bias.

## Origin

Phase G adversarial self-audit 2026-05-05, critique-01 (recurrence of survivorship bias pattern). The original Phase G fix (30 Apr 2026) correctly introduced `unverified` as a first-class state, replacing the pre-Phase-G 100%-success-by-default behavior. However, it did not add multi-substrate triangulation or confidence scoring to the success path itself - a fork that returned status='done' with an empty result was still classified as success. This pattern closes that remaining gap by requiring the oracle to actively seek disconfirming evidence before accepting the success classification.

## Cross-references

- `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` - the Phase G fix that introduced the 4-state model (unverified predecessor)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` - Layer 6 outcome oracle specification
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the meta-rule: narration is unreliable evidence; probe the substrate
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - claiming success without artefact is symbolic; require the artefact
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the architectural framing of why state drifts across substrates
- `~/ecodiaos/docs/JARVIS_GAP_ANALYSIS.md` section 8 - Accountability layer: unverified as a first-class state, which this pattern extends with confidence
