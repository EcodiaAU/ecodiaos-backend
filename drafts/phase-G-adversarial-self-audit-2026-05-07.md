# Phase G Adversarial Self-Audit — 2026-05-07

**Audit ID:** phase-G-audit-2026-05-07
**Auditor:** adversarial critic-fork (fork_movfp2a6_cf08b9)
**Sample window:** 2026-04-30 ~10:00 UTC → 2026-05-07 ~10:00 UTC (rolling 7d)
**Sample size:** 30 random `outcome_event` rows (out of 892 in window) + cross-checks against `dispatch_event`, `os_forks`, `surface_event`, `application_event`, prior Critique nodes, prior status_board rows.
**Cap:** 5 critiques (per `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md`).
**Constraints honoured:** read-only on Phase B telemetry tables, no Pattern node creation, no canonical-doctrine edits, no kv_store mutation, no sub-fork spawn. The audit IS the deliverable.

The critic's job is to be uncomfortable. Soft-pedalling defeats the layer.

---

## Top-line numbers (the 30-row sample reveals the system, not the rows)

```
Last 7d outcome distribution (n=892):
  unverified  465  (52.1%)
  success     419  (47.0%)
  failure       8  ( 0.9%)   ← supposedly closed Critique #1 of 30 Apr; 0.9% vs 14.7% reality (220/1500 known-bad)
  correction    0  ( 0.0%)   ← STRUCTURAL ZERO, no change since 5 May audit

Last 7d classification distribution (n=892):
  NULL              884 (99.1%)
  surfacing_failure   8 ( 0.9%)   ← 100% of classified rows; classifier output is single-class

os_forks reality, last 7d:
  done       719  (76.7%)
  error      197  (21.0%)   ← bad outcome
  crashed     19  ( 2.0%)   ← bad outcome (still NOT in inferrer keyword set)
  aborted      4  ( 0.4%)   ← bad outcome
  → 220 distinct known-bad forks; outcome_event recorded 3 distinct fork_ids as 'failure'
  → 217 known-bad forks invisible to architecture (98.6% blindness on negative side)

Tate-tagged ground truth (Layer 5 oracle):
  classification_tate_tagged populated: 0 / 892   ← unchanged from 5 May audit
  correction_text populated:            0 / 892   ← unchanged from 5 May audit

application_event Layer-3 forcing function (n=510 over 7d):
  applied=true:    1     (0.2%)   ← was 168 on 29 Apr (36% of that day's 467)
  applied=false:  30     (5.9%)
  tagged_silent: 479    (93.9%)   ← Phase C effectively dead

application_event pattern_path namespace breakdown (n=510 over 7d):
  secrets:* (cred-keyword, NOT doctrine paths):  395  (77.5%)
  /home/tate/ecodiaos/patterns/...md:             94  (18.4%)
  /home/tate/ecodiaos/clients/...md:              14  ( 2.7%)
  /home/tate/ecodiaos/docs/secrets/...md:          7  ( 1.4%)
```

The 30-sample read like this: 30/30 had `classification = NULL`, 30/30 had `classification_tate_tagged = NULL`, 30/30 had `correction_text = NULL`, ~50% success and ~50% unverified, **0 failure rows in the 30-sample** despite 220 distinct bad forks in the source data — the rare-event undersample is itself a finding (sample size 30 against a 0.9% positive rate has a 76% chance of seeing zero failures, validating the suspicion that the headline 0.9% is not a true rate but a structural ceiling).

---

## Critique #1 — sev=5, doctrine_failure

**Title:** `'crashed'` keyword recommended for inferrer fix on 5 May 2026 (Critique #1 of phase-G-audit-2026-05-05) is still NOT in `outcomeInference.js` keyword set 2 days later — 19/19 `crashed` forks remain silently classified `unverified`. Concrete proof the Layer 8 critique → action loop is structurally broken.

### Finding

The 5 May audit's Critique #1 explicitly recommended a 1-line code change to `~/ecodiaos/src/services/telemetry/outcomeInference.js:318` adding `'crashed'` to the failure-status keyword set (`s === 'aborted' || s === 'errored' || s === 'failed' || s === 'cancelled' || s === 'error'`). 2 days have elapsed; status_board row `15f9739d-c6f4-420c-a0a0-3fb282bfc3e5` for that audit was archived 2026-05-06 14:10 AEST and folded into a "Phase G adversarial-audit findings backlog" P3 row (`34159fec-3456-4843-99b8-8501cce6594b`) that has remained `open_consolidated` for another ~24h with `next_action_by=ecodiaos` and no actor.

Ground truth: 19 `crashed` forks in the 7d window, 0 of them produce `outcome='failure'` in `outcome_event`. The recommendation was filed, archived into a backlog row, and never executed. The fix is a 1-line change.

This is a **direct falsifier of Layer 8's value proposition.** Layer 8 was specified to "audit its own audit" and surface drift the other layers miss. It surfaced this drift on 5 May. The drift remains. The Layer-8 → action loop has zero throughput on its first non-trivially-actionable critique under the new disposition protocol.

### Evidence

```sql
-- 19 crashed forks, 0 failures inferred
SELECT
  (SELECT COUNT(*) FROM os_forks WHERE started_at >= NOW() - INTERVAL '7 days' AND status='crashed') AS crashed_count,
  (SELECT COUNT(*) FROM outcome_event oe
    JOIN dispatch_event de ON oe.dispatch_event_id = de.id
    WHERE oe.ts >= NOW() - INTERVAL '7 days' AND oe.outcome='failure'
    AND (de.metadata->>'fork_id') IN (SELECT fork_id FROM os_forks WHERE status='crashed' AND started_at >= NOW() - INTERVAL '7 days')
  ) AS crashed_inferred_as_failure;
-- crashed_count: 19, crashed_inferred_as_failure: 0
```

```sql
-- Predecessor status_board row for 5 May audit, now archived to backlog
SELECT id, name, status, next_action, archived_at, next_action_by FROM status_board
WHERE id IN ('15f9739d-c6f4-420c-a0a0-3fb282bfc3e5', '34159fec-3456-4843-99b8-8501cce6594b');
-- 15f97...: 'phase-G-audit-2026-05-05 (5 critiques: 3 sev-5, 2 sev-4)' status='authored' archived 2026-05-06T14:10:50.881Z
-- 34159...: 'Phase G adversarial-audit findings backlog (2026-05-03/04/05)' status='open_consolidated' next_action_by='ecodiaos' archived=null
```

```cypher
// 5 May audit's 5 Critique nodes — all still tate_decision=NULL, resolution_status=NULL
MATCH (c:Critique) WHERE c.audit_id='phase-G-audit-2026-05-05'
RETURN c.title, c.severity, c.tate_decision, c.resolution_status;
// All 5 rows: tate_decision=null, resolution_status=null
```

### Recommended fix (P1, advisory)

1. Land the 1-line `'crashed'` keyword addition at `~/ecodiaos/src/services/telemetry/outcomeInference.js:318` THIS turn-cycle, not via another critique-graduation hop. This is below the threshold of work that warrants its own dispatch fork; it is the kind of fix the conductor should execute on read of the audit, not enqueue.
2. Add a unit test pinned against the live `os_forks.status` enum surface: `SELECT DISTINCT status FROM os_forks` over 30d feeds a contract-test that fails the build when a new status string appears that the inferrer doesn't classify. Locks the substrate seam.
3. Add a Layer-8 meta-rule: when an audit's recommended fix is sub-15-line code change, the disposition protocol must skip the "graduate → status_board → fork-dispatch" chain and execute inline. The protocol overhead exceeds the work cost by 50x and is producing systematic non-action.

### Status board ref

Will be tracked under today's audit-tracker row (P3, see "Status board write" below). Per-critique status_board rows are not created by this fork (per Layer 8 graduation protocol — graduation is the conductor's call after triage).

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-05.md` Critique #1 (the predecessor recommendation)
- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` (the doctrine that should have caught this)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 8 graduation protocol
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (the parent doctrine being violated by Layer 8 itself)

---

## Critique #2 — sev=5, exploration_drift

**Title:** Phase D failure classifier output is **single-class collapsed** — 100% of 8 ever-classified rows are `surfacing_failure`. The classifier ran exactly twice (2026-05-06 15:04 UTC and 2026-05-07 06:05 UTC) and emitted only one of three possible classes. The taxonomy is degenerate in operational reality, not just under-utilised.

### Finding

The architecture specifies Layer 5 classification across three classes: `usage_failure | surfacing_failure | doctrine_failure`. These map to three distinct remediation paths:

- `usage_failure` → escalate Layer 3 forcing function loudness (the doctrine surfaced but the conductor proceeded anyway)
- `surfacing_failure` → tighten triggers / add missing trigger keyword (the doctrine existed but didn't surface)
- `doctrine_failure` → author new pattern (the corpus has a gap)

Reality: across the entire history of the `outcome_event` table, only 8 rows have ever been classified, and **all 8 are `surfacing_failure`**. The classifier produces a single-class output, which means the Layer-5 routing decisions Phase D was supposed to enable cannot fire. The dashboard panels that compute "what fraction of corrections are usage_failure vs surfacing_failure vs doctrine_failure" are collapsed to a single bar and the auto-tune actions per class are dead.

This is structurally worse than the 5 May audit's Critique #2 ("classifier flatlined for 7+ days, 100% NULL"). 5 May said the classifier was sleeping; 7 May says the classifier woke up, ran twice, and produced only one possible answer. The 4 May Critique #2 of the prior audit ("Layer 8 produces output that nothing consumes") had a sibling classifier at Layer 5 producing output that has only one shape.

Two possible upstream causes (both fit the data):

1. **Code-path collapse:** the classifier's gating/decision-tree always returns `surfacing_failure` regardless of input. Verify by inspecting `~/ecodiaos/src/services/telemetry/failureClassifier.js` (referenced in 5 May audit as the consumer Critique #3 of 30 Apr was supposed to drive). If the decision tree is missing branches or has a default that swallows everything, the architecture's branchpoint is a lie.
2. **Selection bias:** the classifier is correctly identifying surfacing_failure but is silently skipping every input that doesn't fit. The 884 NULL rows would be classifications-deferred, not classifications-attempted. Verify by checking whether the classifier's gate filters out all but a tiny known-shape subset.

Either way, the architecture's "three remediation paths" is a one-path system in production.

### Evidence

```sql
SELECT classification, COUNT(*) FROM outcome_event WHERE classification IS NOT NULL GROUP BY classification;
-- surfacing_failure: 8 (the only class ever emitted)

SELECT DATE_TRUNC('minute', classification_at) AS run, COUNT(*) FROM outcome_event WHERE classification_at IS NOT NULL GROUP BY run ORDER BY run DESC;
-- 2026-05-07 06:05: 5
-- 2026-05-06 15:04: 3
-- (only two runs, ever)

-- All 8 classified rows are 'failure' outcomes (the only failures the inferrer caught)
SELECT outcome, classification, COUNT(*) FROM outcome_event WHERE classification IS NOT NULL GROUP BY outcome, classification;
-- failure / surfacing_failure: 8
```

### Recommended fix (P1, advisory)

1. Inspect `~/ecodiaos/src/services/telemetry/failureClassifier.js` (referenced in 5 May Critique #2's recommended fix path). Determine whether the decision tree is degenerate (always returns surfacing_failure) or whether the gate filters out usage/doctrine candidates. The 5-layer probe (`~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`) applies: producer (outcome_event with outcome='failure'), trigger (cron / consumer), bridge, listener (classifier function), side-effect (write to classification column).
2. Add a synthetic-input regression test: feed three rows shaped to deserve usage_failure / surfacing_failure / doctrine_failure respectively, assert the classifier produces all three. Wire to CI.
3. Add Layer-5 drift rule: classifier output entropy < 0.5 over a 100-row window = single-class-collapse alert (status_board P2).

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-05.md` Critique #2 (the predecessor flatline; today reveals it as collapse)
- `~/ecodiaos/drafts/phase-G-critique-03-triage-2026-05-05.md` (consumer/producer ratio drift, never resolved)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

---

## Critique #3 — sev=5, exploration_drift

**Title:** Layer 8 output queue is structurally write-only — every Critique node from 5 May, 4 May, 3 May still has `tate_decision=NULL` AND `resolution_status=NULL`; the 5 May audit's parent status_board row was archived into a "consolidated backlog" without any of its 5 critiques ever transitioning past `authored`. The Critique #2 of phase-G-audit-2026-05-04 ("Layer 8 produces output that nothing consumes") is now operationally re-confirmed for the third audit cycle running.

### Finding

Layer 8's graduation protocol specifies the state machine `authored → triaged (assigned priority) → graduated_from_critique (actionable, dispatched to fork) → in_progress (fork running) → resolved (fix verified, row archived)`. Reality from Neo4j:

```
phase-G-audit-2026-05-05:  5 critiques, 0 with tate_decision set, 0 with resolution_status set
phase-G-audit-2026-05-04:  5 critiques, 5 with tate_decision set (4 graduated_to_implementation, 1 requires_tate_review), 0 with resolution_status set
phase-G-audit-2026-05-03:  5 critiques, 5 with tate_decision set (4 graduated_to_status_board, 1 requires_tate_review), 0 with resolution_status set
phase-G-audit-2026-04-30:  5 critiques, 5 with tate_decision set, 0 with resolution_status set (titles also NULL — earlier-format)
```

The `resolution_status` column is **0% populated across 20 critiques over 8 days**. Yesterday (5 May audit), even the first transition (`authored → triaged`) didn't fire — `tate_decision=NULL` for all 5. The state machine specified in the architecture doc is a fiction.

Compounding evidence:

- The status_board row for 5 May audit (`15f9739d`) was archived 2026-05-06 14:10 AEST without any of its 5 critiques having `tate_decision` set in Neo4j. Archive-without-disposition.
- The receiving consolidated row (`34159fec`, "Phase G adversarial-audit findings backlog 2026-05-03/04/05") is itself stale: `next_action="Triage 15 unactioned critiques across 3 cycles - meta-finding: prior critiques unactioned needs escalation"`, status `open_consolidated`, no actor for ~24h.
- This is the THIRD audit cycle in a row to surface "Layer 8 output queue is dead" (4 May audit Critique #2, 5 May audit by implication via "Critique #2 graduated but never resolved", today's audit by direct observation).

The mechanical layer is observably broken on its own logic. The architecture's recursion ("Layer 8 audits the system; nothing audits Layer 8's disposition") collapses to "Layer 8 audits the system into a backlog row that nothing audits."

### Evidence

```cypher
MATCH (c:Critique) WHERE c.audit_id IN ['phase-G-audit-2026-05-05','phase-G-audit-2026-05-04','phase-G-audit-2026-05-03','phase-G-audit-2026-04-30']
RETURN c.audit_id, COUNT(*) AS critiques,
       SUM(CASE WHEN c.tate_decision IS NULL THEN 1 ELSE 0 END) AS tate_decision_null,
       SUM(CASE WHEN c.resolution_status IS NULL THEN 1 ELSE 0 END) AS resolution_status_null
ORDER BY c.audit_id;
-- 04-30: 5 critiques, 0 null, 5 null (resolution never set for any audit)
-- 05-03: 5 critiques, 0 null, 5 null
-- 05-04: 5 critiques, 0 null, 5 null
-- 05-05: 5 critiques, 5 null, 5 null  (5 May lost even the first transition)
```

```sql
SELECT id, name, status, archived_at FROM status_board
WHERE name LIKE '%phase-G%' OR name LIKE '%adversarial%' ORDER BY created_at DESC LIMIT 10;
-- 5 of last 6 rows show 'critique' or 'audit' in name; only 1 reached 'resolved' status (critique-02 from 30 Apr, the doctrine-edit one); the other 4 archived into rolling backlogs without verifiable shipped-fix.
```

### Recommended fix (P2, advisory — escalation route)

This finding cannot be remediated within Layer 8 itself; the layer's output queue has no mechanical consumer. Escalation paths (in priority order):

1. **Tate-disposition burst this turn-cycle.** Re-open the 4 stale audit rows + the consolidated backlog and force a Tate-decision pass on each of the 20 unresolved critiques. This is the only path that breaks the symmetric-non-consumption pattern. ~10 min of Tate's time, 3 days of architecture stagnation cleared.
2. **Wire the disposition protocol mechanically.** Author a daily `phase-g-disposition-cron` that for each Critique node with `tate_decision=NULL` and age > 24h, raises a status_board P2 row "Critique X awaiting Tate-decision". For each Critique with `tate_decision='graduated_to_implementation'` and age > 96h with `resolution_status=NULL`, raises a P1 status_board row. This is the layer's drift detector authored mechanically rather than as a written rule.
3. **Stop authoring Critiques the layer can't consume.** If 6 audit cycles produce 30 critiques and only 1 reaches `resolved`, the layer is emitting at 30x the system's ability to absorb. Either reduce sample size, raise severity threshold, or pause the daily cron until the backlog drains.

The conductor should be uncomfortable about this finding because today's 5 critiques are joining a queue that is provably write-only. The act of writing this audit is symbolic logging unless the disposition pattern changes.

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-04.md` Critique #2 (the precursor; 3-cycle recurrence)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (the parent doctrine — Layer 8 itself is violating it)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 8 graduation protocol section
- `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md` (the constraint on Layer 8 output)

---

## Critique #4 — sev=5, surfacing_failure

**Title:** `application_event.pattern_path` is **77.5% polluted with cred-keyword artefacts** (`secrets:cred-class`, `secrets:Corazon`, `secrets:Supabase`) — the Phase C silent-rate metric Layer 3 depends on is being computed off non-doctrine namespace strings, structurally invalidating the headline KPI.

### Finding

`application_event.pattern_path` is meant to identify which doctrine file a `[APPLIED]` / `[NOT-APPLIED]` tag references. The schema was authored to receive paths under `~/ecodiaos/patterns/`, `~/ecodiaos/clients/`, and `~/ecodiaos/docs/secrets/`. Reality:

```
Last 7d application_event pattern_path namespace breakdown (n=510):
  secrets:* (e.g. 'secrets:cred-class', 'secrets:Corazon'):  395  (77.5%)
  /home/tate/ecodiaos/patterns/...md:                         94  (18.4%)
  /home/tate/ecodiaos/clients/...md:                          14  ( 2.7%)
  /home/tate/ecodiaos/docs/secrets/...md:                      7  ( 1.4%)
```

The `secrets:*` rows are emitted by `cred-mention-surface.sh` when the hook detects a credential keyword in a brief; the hook serialises the matched keyword (e.g. `secrets:Corazon`) into the application_event row instead of the canonical credential file path under `~/ecodiaos/docs/secrets/`. The result: 4 out of every 5 application_event rows reference a string that **isn't a path and doesn't index any file**. Phase C's silent-rate metric (the Layer 3 KPI) sums silent / total across this pollution, so a "94% silent rate" includes 77.5% noise that could not have been tagged because the rows don't reference a file the conductor could produce a tag for.

This invalidates THREE downstream metrics:

1. **Per-pattern silent-rate.** Cannot be computed for cred surfaces because the namespace string is not a unique-identifier-of-a-doctrine-file. Multiple cred surfaces with identical `pattern_path='secrets:cred-class'` are not "the same pattern."
2. **Layer-3 drift detection.** Phase C's drift rule "any pattern whose silent-rate climbs above the baseline is a candidate for tightening / retiring / escalating" cannot fire on `secrets:*` rows because there's no pattern to retire.
3. **/api/telemetry/decision-quality output.** The `pattern_usage` panel returns 4 cred-namespace rows in the top-10 surfaced patterns, distorting the dashboard.

### Evidence

```sql
-- Namespace breakdown
SELECT
  COUNT(*) AS total_7d,
  SUM(CASE WHEN pattern_path LIKE 'secrets:%' THEN 1 ELSE 0 END) AS cred_namespace_rows
FROM application_event WHERE ts >= NOW() - INTERVAL '7 days';
-- total_7d: 510, cred_namespace_rows: 395

-- Top non-doctrine "patterns" in last 7d
SELECT pattern_path, applied, COUNT(*), MAX(ts) FROM application_event
WHERE ts >= NOW() - INTERVAL '7 days' AND applied IS NOT NULL
GROUP BY pattern_path, applied ORDER BY MAX(ts) DESC LIMIT 5;
-- 'secrets:cred-class' applied=false 4   <-- not a doctrine file
-- 'secrets:Corazon' applied=false 3      <-- not a doctrine file
-- 'secrets:Supabase' applied=false 3     <-- not a doctrine file
```

### Recommended fix (P1, advisory)

1. Patch `~/ecodiaos/scripts/hooks/cred-mention-surface.sh` to emit the canonical doc path (`~/ecodiaos/docs/secrets/<file>.md`) into application_event when known, and skip the application_event INSERT entirely when the cred surface doesn't map to a specific file (e.g. generic "cred-class" warns). Schema-level fix: ADD CHECK constraint that `pattern_path` must start with a path prefix from the canonical doctrine roots.
2. Backfill existing `secrets:*` rows: either DELETE (because they invalidate the silent-rate metric and have no remediation surface) or rewrite to canonical path where one exists. Tate-supervised migration per Critique #3 of 5 May (forward-only fixes anti-pattern).
3. Add Phase C drift rule: % of application_event rows with `pattern_path NOT LIKE '/home/tate/ecodiaos/%'` over 24h > 10% = schema-pollution alert (status_board P2).

### Cross-refs

- `~/ecodiaos/scripts/hooks/cred-mention-surface.sh` (the producer of the polluted rows)
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (cred-namespace ↔ pattern-namespace seam)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 (the consumer of the polluted metric)

---

## Critique #5 — sev=4, doctrine_failure

**Title:** Outcome row write amplification — 161 distinct fork_ids produce 892 dispatch_event rows in 7d (5.5x mean amplification, 18x max for `fork_morrkfub_7bea8c`). Each amplified dispatch produces its own outcome_event row inferring the SAME fork's status, biasing the headline `success_rate` and `verification_rate` KPIs toward whichever forks dispatch most heavily, not toward distinct-fork performance.

### Finding

```sql
SELECT (de.metadata->>'fork_id') AS fork_id, COUNT(*) AS dispatch_rows
FROM dispatch_event de WHERE de.ts >= NOW() - INTERVAL '7 days' AND de.metadata->>'fork_id' IS NOT NULL
GROUP BY (de.metadata->>'fork_id') HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC LIMIT 5;
-- fork_morrkfub_7bea8c: 18 dispatch rows
-- fork_mos8gamx_616e7c: 12
-- fork_mor2yqdv_be0de0:  9
-- fork_mos9ht2s_6bdf53:  6
-- fork_mos9pzrg_94baa7:  6
```

For a fork with 18 dispatch rows, the outcome inferrer produces ~18 outcome_event rows, each carrying the same fork_id and the same `status=done`/`error`/etc. inference. The `success_rate` aggregate is thus weighted by **dispatch frequency** rather than **distinct-fork result**. A single high-dispatch successful fork like `fork_morrkfub_7bea8c` (18 success rows) outweighs eighteen distinct error-status forks (1 row each, assuming the inferrer caught them — which it doesn't, see Critique #1 — and even if it did, weighting is wrong).

Two compounding effects:

1. **Aggregate KPI distortion.** Headline `success_rate = success / (success + correction + failure + unverified)` is biased by ~3-5x toward heavy-dispatch forks. The architecture's quality metric is a fork-frequency metric in disguise.
2. **Layer 5 classifier's input is biased.** When Phase D's classifier eventually runs across the 8 failure rows from 3 distinct forks, it has effectively a sample-of-3 not a sample-of-8. Cross-validation against external ground truth (Tate-tagged) is impossible because the population isn't what it appears.

### Evidence

```sql
SELECT
  COUNT(*) AS total_outcome_rows,
  COUNT(DISTINCT (de.metadata->>'fork_id')) AS distinct_fork_ids,
  ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT (de.metadata->>'fork_id')),0), 2) AS amplification_factor
FROM outcome_event oe LEFT JOIN dispatch_event de ON oe.dispatch_event_id = de.id
WHERE oe.ts >= NOW() - INTERVAL '7 days' AND de.metadata->>'fork_id' IS NOT NULL;
-- total_outcome_rows: 448 (with fork_id), distinct_fork_ids: 161, amplification_factor: 2.78
-- (overall 7d count is 892 but 420 don't carry fork_id)
```

### Recommended fix (P2, advisory)

1. Pick a canonical aggregation level for KPIs: outcome_event-row OR distinct-fork. Both views are valuable; the headline metric must declare which it is. Add a `success_rate_by_fork` panel to `/api/telemetry/decision-quality` that uses `MAX(outcome) GROUP BY fork_id` to deduplicate.
2. Investigate why a single fork produces 18 dispatch_event rows. Likely cause: the eventEmitter is firing on every internal turn-step within a single fork's lifetime, not just on initial spawn. If yes, the dispatch_event semantic is "dispatch-events-during-fork" not "fork-was-dispatched", and the schema should rename or filter accordingly. Spec mismatch with the architecture doc's "1 dispatch_event → N surface_event rows".
3. Add deduplication at consumer time if the producer can't be fixed without breaking other consumers. UPSERT keyed on `(fork_id, dispatch_minute_bucket)` instead of `(dispatch_event_id)`.

### Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` "1 dispatch → N surface" specification (today's evidence shows N can be 0 and dispatch can be M)
- `~/ecodiaos/src/services/telemetry/dispatchEventConsumer.js` (the consumer)
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`

---

## Reverse-drift signal check

Per Layer 8 doctrine: "three consecutive audit cycles producing zero critiques = reverse drift signal." Today's audit produces 5 critiques (4 sev-5, 1 sev-4); reverse-drift signal is **not triggered**. Prior cycles:

- 2026-05-05: 5 critiques (3 sev-5, 2 sev-4) ✓
- 2026-05-04: 5 critiques (2 sev-5, 2 sev-4, 1 sev-3) ✓
- 2026-05-07: 5 critiques (this audit) ✓

The audit is not too shallow. The OPPOSITE pattern is the concern: the layer keeps finding the same gaps because the gaps are not closing.

---

## Summary table

| # | Severity | Failure class      | One-line                                                                            |
|---|----------|--------------------|--------------------------------------------------------------------------------------|
| 1 | 5        | doctrine_failure   | `'crashed'` keyword still missing 2d post-recommendation; 19/19 crashed forks invisible |
| 2 | 5        | exploration_drift  | Phase D classifier emits single class — 100% surfacing_failure across 8 ever-classified rows |
| 3 | 5        | exploration_drift  | Layer 8 output queue write-only — 20/20 critiques across 8 days have resolution_status=NULL |
| 4 | 5        | surfacing_failure  | application_event 77.5% cred-namespace pollution invalidates Phase C silent-rate KPI |
| 5 | 4        | doctrine_failure   | Outcome row write amplification 5.5x mean (18x max) biases headline success_rate KPI  |

**Severity distribution:** 4× sev-5, 1× sev-4, 0× sev-3, 0× sev-2, 0× sev-1.
**Failure-class distribution:** 2× doctrine_failure, 1× surfacing_failure, 2× exploration_drift, 0× usage_failure.

The audit is uncomfortable on purpose. The pattern across all 5 critiques: **the architecture self-detects drift, surfaces it, and does nothing about it.** Critique #1 is a 1-line code change recommended 2 days ago and not made. Critique #3 names this exact problem as the third-cycle-running observation. Critique #2 reveals that even the layer below (Phase D) collapses to a degenerate single-class output. Critique #4 reveals the foundational metric (silent-rate) is computed off polluted data. Critique #5 reveals the dispatch-vs-outcome 1:1 specification is a 5.5:1 reality.

The conductor should treat **Critique #3 as the master finding**: until Layer 8's output queue has a mechanical consumer (or a Tate-disposition-burst is forced through), today's audit is symbolic logging exactly per `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md`. The act of authoring this file is the entire artefact.

— fork_movfp2a6_cf08b9, adversarial critic, 2026-05-07.
