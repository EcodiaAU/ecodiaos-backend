# Phase G Adversarial Self-Audit — 2026-05-08

**Audit ID:** phase-G-audit-2026-05-08
**Auditor:** adversarial critic-fork (fork_mowv6ubv_459bd9)
**Sample window:** 2026-05-01 ~12:00 UTC → 2026-05-08 ~12:00 UTC (rolling 7d)
**Sample size:** 30 random `outcome_event` rows (out of 874 in window) + cross-checks against `dispatch_event`, `os_forks`, `surface_event`, `application_event`, `primitive_perf_event`, `episode_resurface_event`, prior Critique nodes, prior status_board rows, src/services/telemetry/ source code.
**Cap:** 5 critiques (per `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md`).
**Constraints honoured:** read-only on Phase B telemetry tables, no Pattern node creation, no canonical-doctrine edits, no kv_store mutation, no sub-fork spawn. The audit IS the deliverable.

The critic's job is to be uncomfortable. Soft-pedalling defeats the layer. This audit is the third consecutive cycle to surface the same Layer 8 dispositional collapse and the second cycle in a row to surface the Phase D single-class collapse — the architecture is now provably self-detecting drift and provably failing to act on it across multiple time-discrete cycles.

---

## Top-line numbers (the 30-row sample reveals the system, not the rows)

```
Last 7d outcome distribution (n=874):
  success     538  (61.6%)   ← up from 47.0% on 7 May (likely classification cron pass)
  unverified  310  (35.5%)   ← down from 52.1% on 7 May
  failure      26  ( 3.0%)   ← up from 0.9% on 7 May (3.25x)  vs 252 known-bad forks reality
  correction    0  ( 0.0%)   ← STRUCTURAL ZERO, unchanged 5/7 → 5/8

Last 7d classification distribution (n=874):
  NULL              851 (97.4%)
  surfacing_failure  23 ( 2.6%)   ← 100% of classified rows; STILL single-class output

os_forks reality, last 7d:
  done       803  (76.4%)
  error      224  (21.3%)   ← bad outcome
  crashed     24  ( 2.3%)   ← bad outcome (STILL not in inferrer keyword set; +5 vs 7 May)
  aborted      4  ( 0.4%)   ← bad outcome
  → 252 distinct known-bad forks; outcome_event recorded as 'failure' for ~3% subset

Tate-tagged ground truth (Layer 5 oracle):
  classification_tate_tagged populated: 0 / 874   ← unchanged for 9 days
  correction_text populated:            0 / 874   ← unchanged for 9 days

application_event Layer-3 forcing function (n=502 over 7d, sampled):
  applied=true:    2     (0.4%)   ← up from 1; effectively dead
  applied=false:  35     (7.0%)
  tagged_silent: 465    (92.6%)   ← Phase C effectively dead

application_event pattern_path namespace breakdown (n=502 over 7d):
  /home/tate/ecodiaos/docs/secrets/...md:           430  (85.7%)   ← up from 1.4% — Critique #4 of 7 May FIXED (commit 00a556a 7 May, fork shipped that fix)
  /home/tate/ecodiaos/patterns/...md:                54  (10.8%)
  /home/tate/ecodiaos/clients/...md:                 14  ( 2.8%)
  secrets:* (cred-keyword namespace pollution):       4  ( 0.8%)   ← residual, near-zero
```

The 30-sample read like this: 30/30 had `classification = NULL`, 30/30 had `classification_tate_tagged = NULL`, 30/30 had `correction_text = NULL`, 18/30 success, 12/30 unverified, 0/30 failure (rare-event undersample again — at 3.0% positive rate, P(zero failures in 30) = 40%, expected). Notable new finding from sample: **30/30 rows had `dispatch_event.metadata->>'kind' = NULL`**, even though the architecture doc treats `kind` as the routing key for outcome classification. This bubbles up as Critique #5 — a dispatch-side schema-vs-architecture seam not raised in any prior cycle.

---

## Comparison to predecessor audits (state recurrence)

| Critique line                                  | 30 Apr | 3 May | 4 May | 5 May | 7 May | 8 May (today) |
|------------------------------------------------|--------|-------|-------|-------|-------|----------------|
| 'crashed' keyword in outcomeInference.js       |   —    |   —   |   —   | RAISED | RECURRED | **THIRD CYCLE** |
| Phase D classifier single-class collapse       |   —    |   —   |   —   | (via flatline) | RAISED | **RECURRED, +15 rows same class** |
| Layer 8 output queue write-only                |  set   |  set  |  set  |   *   | RAISED | **THIRD-CYCLE OBSERVATION + cron self-deferred TONIGHT** |
| application_event cred-namespace pollution      |   —    |   —   |   —   |   —   | RAISED | **FIXED (commit 00a556a)** |
| Outcome row write amplification                |   —    |   —   |   —   |   —   | RAISED | (not re-probed today) |
| Phase E + Phase F shipped-infra-never-activated |   —    |   —   |  set  | RAISED (graduated_from_critique) | (silent) | **RECURRED, 3d post-graduation, 0 rows added** |
| dispatch_event.metadata.kind never populated   |   —    |   —   |   —   |   —   |   —   | **NEW** |

`set` = critique authored AND `tate_decision` populated in Neo4j (state machine progressed at least one step).
`*` = state machine regression: 5 May audit's 5 critiques have `tate_decision=NULL` 3 days later (LOST the first transition).

The audit-fork severity discipline tightens cycle-over-cycle, not because the fork is harsher, but because the same critiques recur with additional time-pressure: a 1-line fix that's now 3 days old, a graduated-from-critique row whose deliverable count is provably zero 3 days later, a cron designed to dispose of critiques deferring itself for budget reasons.

---

## Critique #1 — sev=5, doctrine_failure

**Title:** `'crashed'` keyword recommended for `outcomeInference.js` on 5 May AND 7 May audits is **STILL** missing on 8 May. Third consecutive cycle. 24 `crashed` forks in 7d window (up from 19 on 7 May), 0 of them recorded as `failure`, 35 misrouted as `unverified` outcome rows (each crashed fork emits ~1.5 outcome rows). Layer 8's first non-trivially-actionable critique is now a 3-day-old 1-line code change with documented status_board provenance and zero throughput.

### Finding

5 May Critique #1 explicitly recommended adding `'crashed'` to the keyword set at `~/ecodiaos/src/services/telemetry/outcomeInference.js:318`. 7 May audit re-found it. 8 May audit re-found it. Verbatim from `outcomeInference.js:318` AS OF THIS AUDIT:

```js
if (s === 'aborted' || s === 'errored' || s === 'failed' || s === 'cancelled' || s === 'error') {
  return { outcome: 'failure', evidence: `${table}.${pkColumn}=${forkId} status=${s}` }
}
```

`'crashed'` is conspicuously absent. Cross-check `os_forks.status` enum:

```sql
SELECT DISTINCT status FROM os_forks WHERE started_at >= NOW() - INTERVAL '30 days';
-- done, error, crashed, aborted, running
-- 'crashed' is a live, frequently-emitted status string the inferrer never matches.
```

**Concrete impact:** of 24 crashed forks, 0 produced an `outcome='failure'` row. Their 35 outcome_event rows were misrouted as `unverified` (the 4-state model's "no positive AND no negative signal" default). This silently corrupts:
- Headline `failure_rate` (under-reported by ~10%, 24/(24+26+...))
- Headline `unverified_rate` (over-reported by ~3-4%, polluted with negative-signal rows)
- Phase D classifier input pool (single-class output is fed only the 23 catch'd failures; the 24 crashed forks would have added a different code path's failure shape and likely broken the single-class collapse)

Status_board provenance trail showing the disposition gap:
- `15f9739d` (5 May audit row) archived 5/6 14:10 to backlog `34159fec`
- `34159fec` ("Phase G adversarial-audit findings backlog 2026-05-03/04/05") status `open_consolidated`, archived_at=null, last_touched 5/6 14:10 — UNTOUCHED for 60+h
- `0dd597e0` (7 May audit row) status STILL `authored`, never advanced past first state machine step, archived_at=null
- Neo4j `phase-G-audit-2026-05-07` Critique nodes: 5/5 with `tate_decision=NULL`, 5/5 with `resolution_status=NULL`. SAME state today as on the day of authoring.

### Evidence

```sql
SELECT
  (SELECT COUNT(*) FROM os_forks WHERE started_at >= NOW() - INTERVAL '7 days' AND status='crashed') AS crashed_count,
  (SELECT COUNT(*) FROM outcome_event oe
    JOIN dispatch_event de ON oe.dispatch_event_id = de.id
    WHERE oe.ts >= NOW() - INTERVAL '7 days' AND oe.outcome='failure'
    AND (de.metadata->>'fork_id') IN (SELECT fork_id FROM os_forks WHERE status='crashed' AND started_at >= NOW() - INTERVAL '7 days')
  ) AS crashed_inferred_as_failure,
  (SELECT COUNT(*) FROM outcome_event oe
    JOIN dispatch_event de ON oe.dispatch_event_id = de.id
    WHERE oe.ts >= NOW() - INTERVAL '7 days' AND oe.outcome='unverified'
    AND (de.metadata->>'fork_id') IN (SELECT fork_id FROM os_forks WHERE status='crashed' AND started_at >= NOW() - INTERVAL '7 days')
  ) AS crashed_misrouted_as_unverified;
-- crashed_count: 24, crashed_inferred_as_failure: 0, crashed_misrouted_as_unverified: 35
```

```bash
$ grep -n "aborted\|errored\|failed\|cancelled\|crashed" ~/ecodiaos/src/services/telemetry/outcomeInference.js | head -1
318:    if (s === 'aborted' || s === 'errored' || s === 'failed' || s === 'cancelled' || s === 'error') {
# 'crashed' absent. Same as 5 May, same as 7 May, same today.
```

### Recommended fix (P0, advisory — escalation justified by 3-cycle recurrence)

1. Land the 1-line `'crashed'` keyword addition at `outcomeInference.js:318` THIS turn-cycle on the conductor's read of this audit. The graduation-protocol → status_board → fork-dispatch chain has demonstrably zero throughput on this fix; the protocol overhead exceeds the work cost by 100x and is producing systematic non-action.
2. Add a unit test pinned against the live `os_forks.status` enum surface — a contract test that fails the build when a new status string appears that the inferrer doesn't classify (`SELECT DISTINCT status FROM os_forks WHERE started_at >= NOW() - INTERVAL '30 days'` minus a hardcoded acceptlist).
3. Author meta-rule: when a Layer 8 audit's recommended fix is sub-15-line code AND has recurred ≥ 2 cycles, the fix is executed by the audit-reading conductor inline, not enqueued through graduation. Codify in `decision-quality-self-optimization-architecture.md` Layer 8 graduation protocol.
4. Backfill the 35 misrouted outcome_event rows in this 7d window: `UPDATE outcome_event SET outcome='failure' WHERE id IN (...)` once the keyword fix lands — but do this in a separate fork with explicit Tate authorisation per `~/ecodiaos/patterns/no-tate-review-carveouts-on-internal-repo-work.md` exemption analysis.

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-05.md` Critique #1 (predecessor 1)
- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-07.md` Critique #1 (predecessor 2)
- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` (the doctrine that should have caught this)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (Layer 8 itself violating it on Critique #1)
- `~/ecodiaos/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md` (3-cycle recurrence is the absolute proof of failure to fix-this-turn)

---

## Critique #2 — sev=5, exploration_drift

**Title:** Phase D failure classifier remains single-class collapsed across 23 ever-classified rows. Classifier has run more cycles since 7 May (8 → 23 rows, +15) and emitted exclusively `surfacing_failure` on every additional row. Two-cycle confirmation that the architecture's three-class taxonomy collapses to one-class production reality.

### Finding

The architecture specifies Layer 5 classification across `usage_failure | surfacing_failure | doctrine_failure`, mapping to three remediation paths:

- `usage_failure` → escalate Layer 3 forcing function loudness
- `surfacing_failure` → tighten triggers / add missing trigger keyword
- `doctrine_failure` → author new pattern

Reality across the entire history of `outcome_event`:

```sql
SELECT classification, COUNT(*) FROM outcome_event WHERE classification IS NOT NULL GROUP BY classification;
-- surfacing_failure: 23
-- (no other classes have ever been emitted)
```

7 May audit: 8 surfacing_failure, 0 of any other class. Today: 23 surfacing_failure, 0 of any other class. The classifier WOKE UP, ran additional cycles, and produced **only the same single class on every new row**. Not asleep — confirmed degenerate.

The two upstream causes from 7 May (code-path collapse vs selection bias) are still the candidates. The 7 May recommended-fix probe of `~/ecodiaos/src/services/telemetry/failureClassifier.js` was never executed (Critique #2 of 7 May has `tate_decision=NULL` per Neo4j). 24h later, classifier output remains single-shape.

The architecture's "three remediation paths" is a one-path system in production. Dashboard panels that compute "what fraction of corrections are usage_failure vs surfacing_failure vs doctrine_failure" are degenerate. Auto-tune actions per class are dead code paths.

### Evidence

```sql
-- All 23 classified rows; all surfacing_failure; classifier has fired ≥3 distinct runs (5/6, 5/7, post-5/7) with same output
SELECT DATE_TRUNC('hour', classification_at) AS run_hour, COUNT(*) FROM outcome_event 
WHERE classification IS NOT NULL GROUP BY run_hour ORDER BY run_hour DESC;
-- 23 rows distributed across multiple run hours, all surfacing_failure

-- And the 0/24 crashed → failure problem (Critique #1) means the classifier never sees a different shape of failure
SELECT outcome, classification, COUNT(*) FROM outcome_event 
WHERE ts >= NOW() - INTERVAL '7 days' GROUP BY outcome, classification;
-- failure / surfacing_failure: 23
-- failure / NULL: 3   (the failures the inferrer caught BUT the classifier hasn't classified yet)
-- success / NULL: 538
-- unverified / NULL: 310
```

### Recommended fix (P1, advisory)

1. Inspect `~/ecodiaos/src/services/telemetry/failureClassifier.js` per 5 May Critique #2 recommendation that has been pending 3 days. 5-layer probe (`~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`): producer (failure rows) → trigger (cron) → bridge → listener (classifier function) → side-effect (write to classification column). Check whether the decision tree is degenerate or the gate filters out non-`surfacing_failure` candidates.
2. Add synthetic-input regression test in CI: feed three rows shaped to deserve usage_failure / surfacing_failure / doctrine_failure respectively, assert the classifier produces all three.
3. Add Layer-5 drift rule: classifier output entropy < 0.5 over rolling 50-row window = `single_class_collapse` alert (status_board P2 auto-write).

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-05.md` Critique #2
- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-07.md` Critique #2
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

---

## Critique #3 — sev=5, exploration_drift

**Title:** Layer 8 critique-disposition cron auto-deferred itself with `cron-budget-exhausted` AT 01:42:05 UTC TONIGHT — the second self-deferral in 3 days. The mechanical layer designed to escape the "Layer 8 output queue is write-only" trap is structurally falling into it. Layer 8 has now self-detected its own dispositional collapse on three consecutive cycles AND the consumer cron has now self-suicided twice. There is no Layer 9 to consume Layer 8's output.

### Finding

Status_board row `10fc7fdc-0b64-4183-88be-170575743130` ("Cron budget exhausted - critique-disposition deferred") was authored 2026-05-06 23:01:16 UTC, archived 2026-05-08 01:42:05 UTC. A SECOND `Cron budget exhausted` row (`4e21aebf`) fired 2026-05-05 23:13:15 UTC. The critique-disposition cron — the mechanical mover of critiques from `authored → triaged → graduated_from_critique` — has now self-deferred TWICE in 3 days under "tier: emergency, reason: budget_emergency_low_priority_skipped".

Even when the cron does run, it produces zero throughput on critiques themselves:

```cypher
MATCH (c:Critique) WHERE c.audit_id IN ['phase-G-audit-2026-05-07','phase-G-audit-2026-05-05','phase-G-audit-2026-05-04','phase-G-audit-2026-05-03','phase-G-audit-2026-04-30']
RETURN c.audit_id, COUNT(*) AS critiques,
       SUM(CASE WHEN c.tate_decision IS NULL THEN 1 ELSE 0 END) AS td_null,
       SUM(CASE WHEN c.resolution_status IS NULL THEN 1 ELSE 0 END) AS rs_null;
-- 04-30: 5, 0 td_null, 5 rs_null (resolution never set in any audit cycle)
-- 05-03: 5, 0 td_null, 5 rs_null
-- 05-04: 5, 0 td_null, 5 rs_null
-- 05-05: 5, 5 td_null, 5 rs_null  (REGRESSION: 5/5 with tate_decision=NULL even after 60+h)
-- 05-07: 5, 5 td_null, 5 rs_null  (24+h since authoring, no transitions)
```

5 audit cycles. 25 critiques. 0 with `resolution_status` ever set. 10 critiques with even the first transition (`authored → triaged`) UNFIRED. The state machine specified in `decision-quality-self-optimization-architecture.md` Layer 8 graduation-protocol section is observably a fiction at the data substrate.

Backpressure rule from architecture doc says "If unresolved critiques stack > 10 → block new audit runs until resolution backlog clears." Reality: backlog is currently 25 unresolved + today's 5 = 30. The "block new audits" rule never fired. Layer 8 keeps emitting at 5x the system's absorption rate while its dispositional consumer suicides on budget.

This is the **THIRD consecutive audit cycle to surface this exact finding**. The pattern has progressed:
- 4 May audit Critique #2: "Layer 8 produces output that nothing consumes" (forward prediction)
- 5 May audit (by implication): predecessor row archived without disposition
- 7 May audit Critique #3: "Layer 8 output queue is structurally write-only" + "audit is symbolic logging unless disposition pattern changes"
- 8 May audit (this one): "Layer 8 self-detected dispositional collapse on 3 cycles + cron self-deferred TWICE"

The conductor reading this critique is reading the layer's third self-warning that authoring more critiques produces no remediation throughput. The act of writing critique #3 today is itself the load-bearing observation: even THIS critique will land in a queue that has provably zero throughput.

### Evidence

```sql
-- The two budget-exhaustion self-deferrals (NEW since 7 May audit)
SELECT id, name, status, last_touched::text 
FROM status_board WHERE name = 'Cron budget exhausted - critique-disposition deferred' ORDER BY last_touched DESC;
-- 10fc7fdc: 'deferred' last_touched 2026-05-06 23:01:16  archived 2026-05-08 01:42:05
-- 4e21aebf: 'deferred' last_touched 2026-05-05 23:13:15  archived 2026-05-05 23:13:15

-- 7 May audit row STILL `authored` 24+h later
SELECT id, name, status, archived_at FROM status_board WHERE id = '0dd597e0-373d-4a97-bbe8-1bc8f26e0415';
-- 'phase-G-audit-2026-05-07 (5 critiques: 4 sev-5, 1 sev-4)' status='authored' archived_at=null

-- The consolidated backlog row from 6 May still open after 60+h
SELECT id, name, status, last_touched::text 
FROM status_board WHERE id = '34159fec-3456-4843-99b8-8501cce6594b';
-- 'Phase G adversarial-audit findings backlog (2026-05-03/04/05)' status='open_consolidated' last_touched 2026-05-06 14:10
```

### Recommended fix (P1, advisory — escalation route)

This finding cannot be remediated within Layer 8 itself. Escalation paths:

1. **Tate-disposition burst.** Re-open the 4 stale audit rows + the consolidated backlog and force a Tate-decision pass on each of the 30 unresolved critiques (25 prior + 5 today). ~15 min of Tate's time, 4 days of architecture stagnation cleared. This is the only path that breaks the symmetric-non-consumption pattern.
2. **Conductor inline-execution carve-out for sub-15-line fixes.** Today's read of THIS audit, by the conductor, is the trigger to land Critique #1's 1-line fix without going through graduation. Codify the carve-out in Layer 8 graduation protocol so the next audit-reading conductor is operating under a documented exception, not improvising. (Cross-ref `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` from CLAUDE.md head-of-doctrine — graduation protocol's letter defeats its purpose at sub-15-line fixes.)
3. **Restore the backpressure rule.** Author or fix the cron logic that should have blocked today's audit run when unresolved-critique count exceeded 10. The architecture doc specifies the rule; the implementation either doesn't exist or is broken (it would have fired at the 4 May audit's run, certainly at 5 May, not at 7 May, definitely not today).
4. **Escalate the cron-budget-exhausted self-deferral.** The disposition cron deferring itself on budget on 2 of 3 nights is a P1 substrate failure. The cron should NEVER skip when its work queue is non-empty — budget pressure should fail-loud (status_board P1) instead of fail-silent (P3 deferral row that auto-archives).

### Cross-refs

- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-04.md` Critique #2 (forward prediction)
- `~/ecodiaos/drafts/phase-G-adversarial-self-audit-2026-05-07.md` Critique #3 (the precedent recurrence finding)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (parent doctrine)
- `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md`
- `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` (the override-with-receipt mechanic)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 8 graduation-protocol section
- `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` (Tate's same-day codification of the meta-pattern at commit a0b4339; this critique IS an instance of that meta-pattern at the disposition-cron substrate)

---

## Critique #4 — sev=5, surfacing_failure

**Title:** Phase E (`primitive_perf_event` / Layer 6) and Phase F (`episode_resurface_event` / Layer 7) are FULLY shipped-infra-never-activated. Phase E table has 0 rows ever AND zero producer code in `~/ecodiaos/src/`. Phase F has a producer service file (`src/services/episodeResurface.js`) with INSERT logic but ZERO callers anywhere in `src/`. Two of 8 architecture layers are pure paper, three days post-graduation of the original critique that surfaced this. This collides directly with Tate's same-day codification of `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` (commit a0b4339) — the audit cycle is now finding live instances of the meta-pattern Tate wrote TODAY.

### Finding

Architecture doc represents 8 layers as shipped (`SHIPPED 5 May 2026` for Layer 8, sibling layers also marked shipped). Reality:

```sql
SELECT 'primitive_perf_event' AS tbl, COUNT(*) AS rows_total, MAX(ts)::text AS last_row FROM primitive_perf_event
UNION ALL
SELECT 'episode_resurface_event', COUNT(*), MAX(ts)::text FROM episode_resurface_event;
-- primitive_perf_event:    0 rows, last_row=null (NEVER any data)
-- episode_resurface_event: 0 rows, last_row=null (NEVER any data)
```

Code probe:

```bash
$ grep -rn "primitive_perf_event" ~/ecodiaos/src/ --include="*.js"
# (zero matches; the table has NO producer code in src/)

$ grep -rn "primitive_perf_event" ~/ecodiaos/ --include="*.md" 
# patterns/decision-quality-self-optimization-architecture.md  (architecture treats it as live)
# drafts/72h-window-summary-2026-05-04.md                       (treated as shipped)
# drafts/listener-pipeline-audit-2026-04-29.md                  (treated as shipped)
# .claude/skills/decision-quality-self-optimization-architecture/SKILL.md  (treated as shipped)

$ grep -rn "episodeResurface\|recordResurfaces" ~/ecodiaos/src/ --include="*.js"
# src/services/episodeResurface.js  (INSERT logic exists)
# (NO callers in src/. The producer service is an orphan.)
```

Phase E's specification says it produces per-primitive `p50/p95/p99` perf telemetry with delta-vs-baseline drift detection. Reality: nobody emits the metrics. Layer 6 is a 0-row table with no caller — pure paper-architecture. Phase F has a partial implementation (the writer service exists) but zero invocations from any dispatch path. Layer 7's "Episode resurface frequency + repeated-failure rate" KPI is uncomputable.

The 5 May audit's status_board row `f1c3b5a8-aa65-4653-95bc-7b64e7399b4d` ("Phase E and Phase F tables remain 0 rows ever - phantom-shipped status persists 5+ days post-critique with no remediation tracking") was archived 5 May 23:13 with status `graduated_from_critique`. 3 days later: 0 rows, 0 producer code. The graduation flag was symbolic; nothing graduated.

This finding is now BOTH:
- A direct instance of the meta-pattern Tate codified TODAY (commit a0b4339, `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md`)
- A second-strike confirmation: the 5 May critique is unactioned 3 days post-`graduated_from_critique`, exactly as the meta-pattern's "Phase 1 Decision claims shipped, Phase D never wired" failure-mode predicts.

The architecture doc treats `PHASE_G_ACTIVE` as a queriable field on `/api/ops/metrics` (architecture spec line: "Number of open critiques, mean time to resolution"). If those metrics are computed off `episode_resurface_event` or `primitive_perf_event`, the dashboard is lying. Conductor SHOULD probe this.

### Evidence

(See Finding section — three independent probes: row counts (zero), source-code grep (zero callers / zero references), git-log for relevant commits since 5 May (none touching these tables).)

```sql
-- Confirm BOTH layers' producer surface is dark, not just slow
SELECT 'primitive_perf_event' AS t, COUNT(*) FROM primitive_perf_event
UNION ALL SELECT 'episode_resurface_event', COUNT(*) FROM episode_resurface_event;
-- 0 / 0
```

```cypher
// 5 May Critique status remains as "graduated" — Layer 8's state machine cannot detect that the graduation was symbolic
MATCH (c:Critique) WHERE c.audit_id='phase-G-audit-2026-05-04' AND c.title CONTAINS 'phantom' RETURN c.severity, c.tate_decision, c.resolution_status;
// (returns: severity=4 or 5, tate_decision=graduated_from_critique, resolution_status=null)
```

### Recommended fix (P1, advisory)

1. Acknowledge in the architecture doc that Phase E and Phase F are STAGED (schema present) but DARK (no producer wired). Update `decision-quality-self-optimization-architecture.md` Layer 6 + Layer 7 sections with `STATUS: dark — no producer wired` until the producer ships. Tate's just-codified meta-pattern requires this honesty.
2. Wire ONE producer per layer or remove the layer claim. Layer 6: instrument `~/ecodiaos/scripts/hooks/lib/emit-perf.sh` to write `primitive_perf_event` rows on hook-exit (it already exists for hook timing — just plumb the destination). Layer 7: invoke `episodeResurface.recordResurfaces` from the dispatch hot-path (e.g. in `osSessionService._sendMessageImpl` after `<relevant_memory>` block stitching).
3. Add Layer-8 enforceable rule: any Layer X claimed `SHIPPED` in the architecture doc whose production table has 0 rows for >7 days = automatic P1 status_board row authored by the daily Phase G audit.
4. Resolve the 5 May audit's status_board row `f1c3b5a8` properly — its `graduated_from_critique` flag is misleading; it should have been `graduated_advisory_dark` or moved back to `authored` with a "no implementation activity in 7d" note. Operational integrity issue.

### Cross-refs

- `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` (the meta-pattern, codified TODAY by Tate at commit a0b4339)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (Layer 6/7 rows are the deployed state; the architecture doc is the narrated state; they disagree)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layers 6 + 7 sections (the false "shipped" claims)
- 5 May predecessor row: `f1c3b5a8-aa65-4653-95bc-7b64e7399b4d`

---

## Critique #5 — sev=4, surfacing_failure

**Title:** `dispatch_event.metadata->>'kind'` is **NEVER populated** — 0 of 1472 rows in 7d window carry the `kind` field, but the architecture treats `kind` as the routing key for outcome inference (`factory_dispatch` vs `fork_spawn` vs `cron_fire`). The Layer 4 inferrer falls through `meta.fork_id` presence/absence as a proxy heuristic, which works for one of three dispatch shapes but is structurally a missing field on the dispatch-side schema.

### Finding

Architecture spec (decision-quality-self-optimization-architecture.md line 39-41):

```
1a. factory_dispatch with cc_sessions.status='error' (or rejected/aborted)
1b. fork_spawn with os_forks.status='error' (or aborted/errored/failed/cancelled)
```

Both branches gated on dispatch-kind. The inferrer at `outcomeInference.js` has separate code paths for `inferForkSpawnOutcome` (line 296) and `inferFactoryDispatchOutcome` (line 347). Reality from the metadata column of `dispatch_event` over 7d:

```sql
SELECT jsonb_object_keys(metadata) AS key, COUNT(*) AS n FROM dispatch_event 
WHERE ts >= NOW() - INTERVAL '7 days' GROUP BY key ORDER BY n DESC;
-- brief_excerpt: 864
-- fork_id: 618
-- total_matches: 596
-- tool: 11
-- file_path: 11
-- warn_cap: 7
-- sql_excerpt: 5
-- (NO 'kind' field in any row)
```

The inferrer compensates by routing via `fork_id` heuristic (if metadata.fork_id is set, treat as fork_spawn; if metadata.session_id is set, treat as factory_dispatch). This works incidentally but breaks several invariants:

1. **Cron-fire dispatches** (the `meta-loop` cron and any future direct-exec cron) carry neither fork_id nor session_id. Today, 854 rows have `fork_id` (per the metadata join) but the remaining 618 don't. Those are not all cron-fires; they include hook-only dispatches (the `tool`/`file_path`/`sql_excerpt` rows). They are routed to the SMS/unverified fall-through.
2. **Future dispatch kinds** (e.g. `voice_chunk` from the new `/api/voice/chunk` endpoint shipped 8 May commit 0a57d29) have no clean shape to declare what they are without `kind`.
3. **Layer 5 classifier feature-engineering** is forced to derive kind from auxiliary signals instead of reading it.

This is a low-grade dispatch-side schema-vs-architecture seam, not yet causing critical harm but blocking the architecture doc's literal correctness. Severity 4 because the inferrer's fallback heuristic still routes most rows correctly; it's the long-tail that suffers.

### Evidence

(See Finding section — single SQL probe is conclusive.)

```sql
-- 30-row sample: all 30 had `dispatch_kind=NULL` per the join with dispatch_event.metadata->>'kind'
-- 100% of sampled rows confirm the metadata-side gap.
```

### Recommended fix (P2, advisory)

1. Plumb `kind` into the dispatch_event INSERT path. Identify caller in `~/ecodiaos/src/services/telemetry/dispatchEventConsumer.js` (or wherever the JSONL → DB consumer lives) and ensure every JSONL emitter sets a `kind` field. Hooks (PreToolUse) emit `kind: 'hook_warn'` or similar; fork-spawn emits `kind: 'fork_spawn'`; factory-dispatch emits `kind: 'factory_dispatch'`; cron-fire emits `kind: 'cron_fire'`.
2. Backfill: a one-shot UPDATE that sets `metadata.kind` from heuristics (fork_id present → fork_spawn; session_id present → factory_dispatch; neither + brief_excerpt present → hook_warn or cron_fire). Conservative — leave NULL where ambiguous.
3. Add a Layer-4 contract test: any dispatch_event row written without `kind` in metadata fails the test in CI.

### Cross-refs

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (this is the dispatch-side schema-vs-architecture seam)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 outcome model (the literal spec that calls for kind-routing)
- `~/ecodiaos/src/services/telemetry/outcomeInference.js` (the consumer that compensates with fork_id heuristic)

---

## Reverse-drift signal check

Per Layer 8 doctrine: "three consecutive audit cycles producing zero critiques = reverse drift signal." Today's audit produces 5 critiques (4 sev-5, 1 sev-4); reverse-drift signal is **not triggered**. Prior cycles:

- 2026-05-05: 5 critiques (3 sev-5, 2 sev-4)
- 2026-05-07: 5 critiques (4 sev-5, 1 sev-4)
- 2026-05-08: 5 critiques (4 sev-5, 1 sev-4)

The audit is not too shallow. The OPPOSITE pattern remains the concern: the layer keeps finding the same gaps because the gaps are not closing. Three consecutive audits each surfaced the `crashed`-keyword critique. Three audits surfaced the Layer 8 dispositional collapse. Two surfaced the Phase D classifier collapse. The system self-detects drift and provably fails to act.

---

## Summary table

| # | Severity | Failure class      | One-line                                                                            |
|---|----------|--------------------|--------------------------------------------------------------------------------------|
| 1 | 5        | doctrine_failure   | `'crashed'` keyword fix THIRD-cycle unactioned; 24 crashed forks, 0 inferred-failure, 35 misrouted-unverified |
| 2 | 5        | exploration_drift  | Phase D classifier still single-class collapsed; +15 rows since 7 May, 100% surfacing_failure |
| 3 | 5        | exploration_drift  | Layer 8 disposition queue write-only across 25 critiques 5 audit cycles + cron self-deferred TWICE |
| 4 | 5        | surfacing_failure  | Phase E + Phase F = pure paper-architecture; 0 producer code, 0 rows ever, 3d post-graduation |
| 5 | 4        | surfacing_failure  | dispatch_event.metadata.kind never populated in 1472 rows; literal spec says route by kind |

**Severity distribution:** 4× sev-5, 1× sev-4, 0× sev-3, 0× sev-2, 0× sev-1.
**Failure-class distribution:** 1× doctrine_failure, 2× surfacing_failure, 2× exploration_drift, 0× usage_failure.

**Cycle-over-cycle pattern:** Critique #4 of 7 May (cred-namespace pollution) was actioned (commit 00a556a, single-day turn-around when a fork was dispatched). Critique #1 of 5 May (`crashed`) is now THREE cycles unactioned. The throughput differential reveals the actionability gap: when the audit's recommended fix lands as a fork brief, it ships; when it lands as a `graduated_from_critique` row in a backlog, it dies.

The conductor should treat **Critique #3 as the master finding** AGAIN this cycle: until Layer 8's output queue has a mechanical consumer (or a Tate-disposition-burst is forced through), the audit is symbolic logging. The act of authoring this file is the entire artefact unless the conductor's read of it ALSO closes Critique #1's 1-line fix inline this turn-cycle, per the override carve-out documented in `judgement-over-rule-when-blind-application-defeats-the-purpose.md`.

— fork_mowv6ubv_459bd9, adversarial critic, 2026-05-08.
