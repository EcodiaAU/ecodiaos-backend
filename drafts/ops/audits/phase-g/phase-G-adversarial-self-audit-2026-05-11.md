# Phase G Adversarial Self-Audit — 2026-05-11

**audit_id:** phase-G-audit-2026-05-11
**fork:** fork_mp15hz2o_0e9650
**authored_at:** 2026-05-11 ~22:10 AEST
**sample_window:** 7 days (2026-05-04 to 2026-05-11)
**outcome_rows_sampled:** 30 random rows from 1,199 total
**critiques_authored:** 5 (cap: 5)
**backpressure_check:** 2 open critiques before audit (below 10 threshold — proceed)

---

## Telemetry State at Audit Time

| Metric | Value | 7-day window |
|--------|-------|-------------|
| dispatch_event | 1,217 | |
| surface_event | 410 | |
| application_event | 574 | |
| outcome_event | 1,199 | |
| primitive_perf_event | 1 | total (Layer 6 still effectively dark) |
| episode_resurface_event | 567 | total — NEW since 8-May audit, but broken (see C#1) |

**Outcome distribution (7d):**
- success: 845 (70.5%) — all classification=NULL
- unverified: 271 (22.6%) — all classification=NULL
- failure: 83 (6.9%) — all classified as 'operational_failure'
- correction: **0 (0.0%) — LIFETIME ZERO**

---

## Critique #1 — Layer 7 episode_resurface dispatch_event_id always NULL

**Severity:** 5 (HIGH)
**Failure class:** doctrine_failure
**Neo4j node:** phase-G-audit-2026-05-11/critique-01-layer7-resurface-dispatch-fk-null

**Finding:**
`episode_resurface_event` has 567 rows — a significant change from the 8-May audit which reported 0 rows and "no callers." However, every single row has `dispatch_event_id = NULL`. The column exists (uuid type) but is never written.

Layer 7's primary health KPI is "repeated-failure-after-resurface rate," which requires the join chain:
`episode_resurface_event.dispatch_event_id → dispatch_event.id → outcome_event.dispatch_event_id`

That chain is permanently broken. The producer was wired after the 8-May finding (volume problem fixed), but the data quality problem was not addressed. All 567 rows are orphaned and the KPI is uncomputable.

**Evidence:**
```sql
SELECT count(*), count(DISTINCT dispatch_event_id) as distinct_dispatches
FROM episode_resurface_event
WHERE ts > '2026-05-10';
-- Returns: cnt=457, distinct_dispatches=0
```
Distribution across days: 457 on 2026-05-11, 28 on 2026-05-10, 81 on 2026-05-09, 1 on 2026-05-08.

**Recommended fix:**
Locate the producer in `episodeResurface.js` (or wherever the INSERT is). Audit the INSERT statement — `dispatch_event_id` is almost certainly not being passed in the call. Fix to populate it at write time from the current dispatch context. Validate: after fix, `count(DISTINCT dispatch_event_id) > 0` on new rows within 1h.

**Status board:** P2, entity_type='infrastructure', tracked under audit batch row.

---

## Critique #2 — Correction oracle dark for 144h: escalation of unresolved sev-5

**Severity:** 5 (HIGH — ESCALATION)
**Failure class:** doctrine_failure
**Neo4j node:** phase-G-audit-2026-05-11/critique-02-correction-oracle-dark-6d-overdue
**Escalates:** phase-G-audit-2026-05-05/critique-04-tate-correction-source-structurally-absent

**Finding:**
Zero `correction` rows exist in the entire `outcome_event` table — not just in the 7-day window, but across the system's entire lifetime. This is not a new finding. It was first surfaced on 2026-05-05 as critique-04 with severity 5.

The Layer 8 graduation protocol requires P1 critiques to be actioned within 12h. As of this audit (2026-05-11), that finding is 144 hours old with no remediation. The original critique node has `status=null`, meaning the graduation flow was never triggered at all.

This matters because the correction signal is one of the two explicit Tate-feedback channels in the 4-state outcome model. Without it, the `correction_rate` per-pattern KPI is permanently 0%, Phase D cannot distinguish "usage failure" from "correct application," and the entire feedback loop the architecture is built around is operating on one leg.

**Evidence:**
```sql
SELECT count(*) FROM outcome_event WHERE outcome = 'correction';
-- Returns: 0
```
Active Tate interaction occurred throughout this period with visible course-corrections in the fork briefs and session transcripts.

**Recommended fix:**
1. Probe `outcomeInference.js` — find the CORRECTION_KEYWORDS regex and test it against actual Tate SMS message patterns. Tate's corrections are typically short phrases ("no", "wrong", "revert this", "stop", "don't do that") which may not match the assumed keyword list.
2. Verify the SMS ingestion pipeline is actually passing messages to the inferrer — the inferrer may not be receiving raw SMS text at all.
3. Update critique-04's node status to 'in_progress' to properly trigger graduation tracking.

**Status board:** P1 (escalation), separate status_board row created.

---

## Critique #3 — Telemetry cron forks systematically self-classified as "unverified"

**Severity:** 4 (MEDIUM)
**Failure class:** usage_failure
**Neo4j node:** phase-G-audit-2026-05-11/critique-03-telemetry-cron-forks-self-unverified

**Finding:**
The three telemetry infrastructure cron forks that implement the outcome pipeline are themselves classified as "unverified" by the inferrer they implement:

| Fork brief prefix | Count | success | unverified |
|---|---|---|---|
| TELEMETRY DISPATCH CONSUMER (every 15m) | 15 | 0 | 15 |
| TELEMETRY OUTCOME INFERENCE (every 30m) | 8 | 0 | 8 |
| TELEMETRY FAILURE CLASSIFIER (every 1h) | 4 | 0 | 4 |

27 out of 27 = **100% unverified**. These are not random dark-matter; they are the machinery of the verification system itself.

The inferrer uses generic fork-spawn heuristics (`os_forks.status=done AND result_length > 0`). For short-result deterministic shell-script forks, this heuristic fails silently. Notably, a slight variant of the consumer brief ("TELEMETRY DISPATCH CONSUMER: Run..." — shorter) did achieve success=3/3, suggesting the outcome is sensitive to brief phrasing, not fork quality.

**Evidence:**
Query on outcome_event joined to dispatch_event, grouped by brief_excerpt prefix (first 60 chars). The pattern is consistent and repeated across all three cron types.

**Recommended fix:**
Add a cron-fork-specific success heuristic to `outcomeInference.js`: for forks whose `brief_excerpt` starts with 'TELEMETRY', check downstream substrate state:
- Consumer fork: did `dispatch_event` rows appear with `ts > fork.started_at`?
- Classifier fork: was `outcome_event.classification_at` updated recently?
- Inferrer fork: did any `outcome` fields update in the last N minutes?

Short-circuit to `success=confidence:0.85` when the downstream substrate was updated. This is the correct pattern for any deterministic cron fork: verify via side-effect, not result_length.

**Status board:** P3, tracked under audit batch row.

---

## Critique #4 — 33 Critique nodes have status=null: graduation protocol never fired at graph level

**Severity:** 4 (MEDIUM)
**Failure class:** doctrine_failure
**Neo4j node:** phase-G-audit-2026-05-11/critique-04-critique-nodes-status-null-graduation-never-fired

**Finding:**
Across all 7 Phase G audit cycles (bootstrap + 2026-04-30 through 2026-05-08), every Critique node in Neo4j has `status=null`. The graduation protocol specifies dual tracking:
1. status_board row with `entity_type='infrastructure', name='phase-G-audit-{YYYY-MM-DD}/critique-NN-{slug}'`
2. Critique node `c.status` updated on each graduation step

The first substrate has 2 rows (covering the 05-07 and 05-08 audits only). The second substrate has never been updated — 0 out of 33 nodes have a non-null status, including confirmed-shipped fixes. The 05-08 audit status_board row notes "C#1 SHIPPED inline" but the corresponding Critique node still has `status=null`.

The graph is a write-only critique archive, not a live graduation pipeline. Querying `MATCH (c:Critique) WHERE c.status = 'resolved'` returns empty — you cannot tell from the graph which critiques are actually resolved.

**Evidence:**
```cypher
MATCH (c:Critique)
RETURN c.audit_id, count(*) as total, count(c.status) as with_status
```
Returns `with_status=0` for every audit_id.

**Recommended fix:**
The triaging/graduation fork must write to BOTH substrates. Add a `graph_merge_node` call alongside every `db_execute UPDATE status_board WHERE name LIKE 'phase-G-%'`. Short-term: run a one-pass update setting `c.status='resolved'` on the 3 Critique nodes whose corresponding status_board context confirms inline-shipment.

**Status board:** P3, tracked under audit batch row.

---

## Critique #5 — Phase D classifies only failure outcomes: 93.1% of outcome_event rows permanently dark

**Severity:** 4 (MEDIUM)
**Failure class:** usage_failure
**Neo4j node:** phase-G-audit-2026-05-11/critique-05-phase-d-classifies-only-failure-93pct-dark

**Finding:**
Phase D classification runs exclusively on `outcome='failure'` rows, leaving success (845) and unverified (271) permanently at `classification=null`. This represents 93.1% of all outcome_event rows in the 7-day window with zero classification coverage.

The architecture mandates classifying all four outcome states into `usage_failure / surfacing_failure / doctrine_failure`. The implementation only processes the failure branch and labels everything `operational_failure` — no `usage_failure`, no `surfacing_failure`, no `doctrine_failure` appear in the full table.

The consequence is structural: the `success_rate` headline metric (70.5%) is entirely unvalidated. A fork that succeeded despite relevant doctrine being silently ignored (`tagged_silent=true`) produces `outcome='success', classification=null` — indistinguishable from a fork that correctly applied all surfaced doctrine. The feedback mechanism the architecture was built to provide does not exist for the dominant outcome class.

Note: this pattern has been flagged in prior audits (phase-G-2026-05-05 critique-02, phase-G-2026-05-07 critique-02). This is a third consecutive cycle with the same finding. The recurrence itself is a meta-signal: the finding is being logged but not driving remediation.

**Evidence:**
```sql
SELECT outcome, count(*) as cnt, count(*) FILTER (WHERE classification IS NOT NULL) as classified
FROM outcome_event WHERE ts > NOW() - INTERVAL '7 days' GROUP BY outcome;
-- success/845/0, unverified/271/0, failure/83/83
```
All 83 classified failure rows have `classification='operational_failure'`.

**Recommended fix:**
Extend the Phase D classifier to process success and unverified outcomes:
- Success rows: join to application_event chain; if `tagged_silent=true` patterns exist in the surface chain, flag as `usage_success_with_silent_doctrine` for triage signal
- Unverified rows >24h old with no incoming signal: classify as `classification_deficit`
This expansion is non-trivial but is the minimum required to make the architecture function as designed.

**Status board:** P3, tracked under audit batch row.

---

## Failure Class Distribution

| Failure class | Count |
|---|---|
| doctrine_failure | 3 (C#1, C#2, C#4) |
| usage_failure | 2 (C#3, C#5) |
| surfacing_failure | 0 |

## Severity Distribution

| Severity | Count |
|---|---|
| 5 (HIGH) | 2 (C#1, C#2) |
| 4 (MEDIUM) | 3 (C#3, C#4, C#5) |
| 3 (LOW) | 0 |

## Prior Audit Resolution Snapshot

| Audit | Critiques | Named | status!=null |
|---|---|---|---|
| 2026-04-29 (bootstrap) | 3 | 0 | 0 |
| 2026-04-30 | 5 | 5 | 0 |
| 2026-05-03 | 5 | 0 | 0 |
| 2026-05-04 | 5 | 0 | 0 |
| 2026-05-05 | 5 | 5 | 0 |
| 2026-05-07 | 5 | 5 | 0 |
| 2026-05-08 | 5 | 0 | 0 |
| **2026-05-11 (this)** | **5** | **5** | **5** |
| **TOTAL prior** | **33** | **15** | **0** |

The 0/33 prior resolution rate at the node level is itself a meta-finding captured in C#4.

---

## Status Board Rows Created

1. `phase-G-audit-2026-05-11 (5 critiques: 2 sev-5, 3 sev-4)` — P3, next_action_by=ecodiaos
2. `phase-G-audit-2026-05-11/critique-02-ESCALATION-correction-oracle-144h-overdue` — P1, next_action_by=ecodiaos
