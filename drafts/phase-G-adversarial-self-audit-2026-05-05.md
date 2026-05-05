# Phase G Adversarial Self-Audit — 2026-05-05

**Audit ID:** phase-G-audit-2026-05-05
**Auditor:** adversarial critic-fork (fork_moskthuo_0c0d1a)
**Sample window:** 2026-04-28 ~12:00 UTC → 2026-05-05 12:00 UTC (rolling 7d)
**Sample size:** 30 random `outcome_event` rows (out of 897 in window) + cross-checks against `dispatch_event`, `os_forks`, `cc_sessions`, `surface_event`, `application_event`, prior Critique nodes.
**Cap:** 5 critiques (per `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md`).
**Constraints honoured:** read-only on Phase B telemetry tables, no Pattern node creation, no canonical-doctrine edits, no kv_store mutation, no sub-fork spawn. The audit IS the deliverable.

The critic's job is to be uncomfortable. Soft-pedalling defeats the layer.

---

## Top-line numbers (the 30-row sample reveals the system, not the rows)

```
Last 7d outcome distribution (n=897):
  success     505  (56.3%)
  unverified  392  (43.7%)
  failure       0  ( 0.0%)   ← structural zero
  correction    0  ( 0.0%)   ← structural zero

Last 7d classification distribution (n=897):
  NULL        897 (100.0%)   ← Phase D classifier consumed 0 events

Last 7d Tate-tagged ground truth (classification_tate_tagged):
  populated     0 (  0.0%)   ← oracle empty

Evidence-string archaeology (n=897):
  pre-PhaseG-survivorship-success  398  (44.4%) ← rows written by old inferrer, never re-classified
  phaseG-unverified-default        386  (43.0%)
  phaseG-substrate-direct-success   71  ( 7.9%)
  phaseG-explicit-success           36  ( 4.0%)
  phaseG-explicit-unverified         6  ( 0.7%)

os_forks reality, last 7d (n=865):
  done       736  (85.1%)
  error      106  (12.3%)   ← bad outcome
  crashed     14  ( 1.6%)   ← bad outcome (NOT in inferrer keyword set)
  aborted      9  ( 1.0%)   ← bad outcome
  running      2  ( 0.2%)
  → 129 known-bad forks. Inferrer recorded 0 'failure' rows. Blindness is total.
```

The 30-sample read like this: 30/30 had `classification = NULL`, 30/30 had `classification_tate_tagged = NULL`, 30/30 had `correction_text = NULL`, ~50% had pre-PhaseG-survivorship evidence, ~50% had phaseG-unverified-default evidence. Not one row had a substrate-direct success or explicit-confidence band. The sample is monotone — that itself is a finding.

---

## Critique #1 — sev=5, doctrine_failure

**Title:** Outcome=failure rate is structurally 0% over 7d despite 129 known-bad forks; the 4-state outcome model is functionally a 2-state model and Critique #1 (30 Apr 2026) was replaced by an isomorphic blindness, not fixed.

### Finding

`outcome_event` over 7d contains **zero** rows with `outcome='failure'` and **zero** with `outcome='correction'`. Meanwhile `os_forks` over the same window has **129 forks** in non-success terminal states (106 `error` + 14 `crashed` + 9 `aborted`). The inferrer cannot see them for two compounding reasons:

1. **Keyword gap.** `outcomeInference.js:318` checks `s === 'aborted' || s === 'errored' || s === 'failed' || s === 'cancelled' || s === 'error'`. **`'crashed'` is not in this set.** All 14 crashed forks are silently classified as `unverified`. (Cross-checked: 3 `crashed` rows where the dispatch_event DID have `fork_id` were inferred as `unverified` with evidence "no positive or negative signal within 30min".)
2. **Metadata gap.** Of the 106 `error`-status forks in 7d, **0** have a corresponding `dispatch_event` row carrying the `fork_id` in metadata (because the consumer's ts-proximity enrichment only began landing 4 May 2026 ~12:00 AEST and even now lands on ~83% of dispatches; pre-4-May forks carry 0% fork_id forever). The substrate-direct failure probe is unreachable.

The 30 Apr Phase G Critique #1 ("Survivorship bias in outcome oracle") was supposed to fix the "100%-success-by-default" pre-Phase-G behaviour by adding `unverified` as a first-class state. The fix shipped, but the symmetric blindness on the *negative* side was never closed: `failure` is now 0% by structural unreachability, not by absence of failure events. The KPIs computed off this data — `success_rate`, `verification_rate`, `failure_class` distributions — are being calibrated against a sterilised oracle. The architecture is once again unfalsifiable.

### Evidence

```sql
-- 129 known-bad forks, 0 inferred failures
SELECT status, COUNT(*) FROM os_forks
WHERE started_at >= NOW() - INTERVAL '7 days' AND status IN ('error','crashed','aborted')
GROUP BY status;
-- error: 106, crashed: 14, aborted: 9

SELECT outcome, COUNT(*) FROM outcome_event
WHERE ts >= NOW() - INTERVAL '7 days' GROUP BY outcome;
-- success: 505, unverified: 392, failure: 0, correction: 0

-- The 3 crashed forks that DID have fork_id metadata (specimen)
-- → all inferred as 'unverified', evidence 'no positive or negative signal within 30min'
-- fork_id=fork_mortxyac_f3490d, status=crashed (3 dispatch rows, all unverified)
```

### Recommended fix (P1, advisory)

1. Add `'crashed'` to the failure keyword set at `~/ecodiaos/src/services/telemetry/outcomeInference.js:318`. Audit `os_forks.status` enum (`done|error|crashed|aborted|running` as observed in 7d) against the inferrer's expected set; lock the contract via a unit test that fails when a new status string appears.
2. Backfill the missing `fork_id` metadata for pre-4-May `dispatch_event` rows where ts-proximity to an `os_forks.started_at` is <60s. ~600 rows recoverable via the same query the consumer now uses on the hot path.
3. Add an unconditional reverse-drift detector: alarm if `outcome='failure'` count is < 1% of `outcome` total over a 24h window where `os_forks` shows ≥10 non-success forks. Asymmetric blindness has now happened twice in the same architecture; the mechanical layer must catch the next one.

### Status board ref

Will be tracked under `phase-G-audit-2026-05-05` row (P3 audit-tracker, see `Status board write` at end). Per-critique status_board rows are not created by this fork (per Layer 8 graduation protocol — graduation is the conductor's call after triage).

### Cross-refs

- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` (Critique #1 fix doctrine — needs `crashed` keyword note)
- `~/ecodiaos/drafts/phase-G-critique-01-triage-2026-05-05.md` (the 30 Apr predecessor)
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (this is a substrate seam between dispatch_event and os_forks)

---

## Critique #2 — sev=5, surfacing_failure

**Title:** Phase D failureClassifier has been completely flatlined for 7+ days — 100% of 897 outcome_event rows in the window have `classification = NULL`. The consumer-flatline pattern Critique #3 (30 Apr) raised was graduated_from_critique on 30 Apr but never reached resolved.

### Finding

Phase D classifies `correction` and `failure` rows into `usage_failure | surfacing_failure | doctrine_failure` (the failure-class taxonomy that powers `surfacing_miss_rate` and `doctrine_coverage` KPIs). Over the last 7d (and looking back further: ALL 897 rows in window) **classification is NULL on every single row.** The classifier is not running, OR it is running but skipping every row, OR it is running but writes are silently failing. The Phase B `/api/telemetry/decision-quality` endpoint's failure-class panels are therefore being computed off a row count of zero.

The 30 Apr Critique #3 ("Consumer/producer ratio drift check blind spot") explicitly raised this exact failure mode — that a Phase D consumer can silently flatline while producers continue. Critique #3 was set `tate_decision='graduated_to_implementation'` and `reviewed=true` on 4 May, but it has `resolution_status = null` and the consumer health rules in `decisionQualityDriftCheck.js` were never authored. Five days of real telemetry have passed with this consumer dark and the architecture's own meta-detector blind to it.

A second supporting signal: across all 897 rows, `classification_tate_tagged` is also 100% NULL. The Layer 5 drift signal "auto-classifier accuracy < 70% on Tate-tagged ground truth" has neither numerator nor denominator. The architecture's quality metric is currently unmeasurable, not undefined-but-fine.

### Evidence

```sql
SELECT classification, COUNT(*) FROM outcome_event
WHERE ts >= NOW() - INTERVAL '7 days' GROUP BY classification;
-- NULL: 897

SELECT COUNT(*) FROM outcome_event WHERE classification_tate_tagged IS NOT NULL;
-- 0
```

Critique-graduation status (Neo4j):
- Critique #3 (30 Apr): `tate_decision = graduated_to_implementation`, `reviewed = true`, `resolution_status = null`
- No Pattern node has been created with title containing "consumer health" or "consumer flatline" since 30 Apr.

### Recommended fix (P1, advisory)

1. Author `~/ecodiaos/src/services/telemetry/decisionQualityDriftCheck.js` consumer-health rules per Critique #3's spec (3 rules: P2 lag-threshold, P1 flatline, P3 attenuation). Wire to the daily drift-check cron.
2. Investigate why `failureClassifier.js` is not classifying ANY rows over 7d — likely the cron is dead, the classification gate (`outcome IN ('correction','failure')` is structurally satisfied by zero rows because of Critique #1), or the writes are erroring silently. Per `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`, do the 5-layer producer→consumer→side-effect probe.
3. Begin populating `classification_tate_tagged` opportunistically — when a Tate SMS/iMessage explicitly references a doctrine path (`~/ecodiaos/patterns/...md`), backfill the matching outcome_event with the path as the Tate-tag. This bootstraps the ground-truth oracle.

### Cross-refs

- `~/ecodiaos/drafts/phase-G-critique-03-triage-2026-05-05.md` (the unfinished predecessor)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`

---

## Critique #3 — sev=4, doctrine_failure

**Title:** Phase G fixes ship forward-only and never backfill — 391 pre-Phase-G survivorship-success rows persist in `outcome_event` and inflate the success bucket by ~44%, distorting every Layer-4 KPI.

### Finding

Of 897 outcome_event rows in the 7d window, **398 (44%)** carry the pre-Phase-G evidence string `'no correction signal within%'` — these were written before the unverified-default fix shipped on ~30 Apr 12:26 AEST. They are still classified as `outcome='success'` despite being inferred under the exact survivorship-bias rule Critique #1 was authored to deprecate. The Phase G fix changed forward-going behaviour but never backfilled the existing rows. Of those 398, only **7 are recoverable** via fork_id (the rest predate the consumer's enrichment patch).

The downstream effect: `success_rate` over 7d is biased upward by ≈45 percentage points. Any KPI that consumes `outcome` directly (`/api/telemetry/decision-quality`, dashboards, drift-check thresholds) is reading a distorted distribution. The 30 Apr Critique #1 is technically `resolved` per the architecture-doc cross-ref, but operationally the bias it was authored to eliminate is still present in the data lake.

This is a Distributed-State-Seam failure between code-state and data-state: a forward-only fix declares victory because the new rows look right, while the cohort it was supposed to invalidate sits in the table indefinitely.

### Evidence

```sql
-- Survivorship cohort breakdown
SELECT outcome, evidence_class, COUNT(*) FROM (...) GROUP BY ...;
-- pre-PhaseG-survivorship  success  398
-- phaseG-unverified-default  unverified  386
-- phaseG-substrate-direct  success  71
-- phaseG-explicit  success  36

-- Recoverable subset
WITH precrit AS (...) SELECT COUNT(*), SUM(CASE WHEN dispatch_fork_id IS NOT NULL THEN 1 ELSE 0 END) FROM precrit;
-- total_precrit_success: 398, recoverable_via_fork_id: 7
```

### Recommended fix (P2, advisory)

1. Author a one-shot backfill migration: `UPDATE outcome_event SET outcome = 'unverified', evidence = 'backfilled-2026-05-05: pre-PhaseG-inference, fork_id unrecoverable' WHERE evidence LIKE 'no correction signal within%' AND <fork_id-not-recoverable predicate>` AND for the 7 recoverable rows, route through the new substrate-direct inferrer. **Do this as a Tate-supervised migration** — bulk outcome rewrites are a data-state mutation that crosses the dispatch-vs-data seam and should not be silent.
2. Add a Phase G hard rule: every code fix to `outcomeInference.js` MUST be accompanied by a backfill plan for the cohort the fix invalidates, OR a documented decision that backfill is not warranted. Forward-only fixes are an architectural anti-pattern when the substrate is read-historical (KPIs, dashboards) not just stream-forward.
3. Author `~/ecodiaos/patterns/code-fixes-must-account-for-historical-cohort.md` (or similar — see `forks-self-assessment-is-input-not-substitute.md` and route through Tate first).

### Cross-refs

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`

---

## Critique #4 — sev=5, surfacing_failure

**Title:** Tate-correction signal source is structurally absent — none of `sms_messages`, `sms_inbound`, `sms_log` exist in the public schema; the iMessage primary contact channel writes nowhere queryable; `outcome='correction'` count is structurally zero regardless of how many corrections Tate sends.

### Finding

`outcomeInference.findTateSignal` probes for an SMS table (`sms_messages` then `sms_inbound` then `sms_log`) and scans for `CORRECTION_KEYWORDS` / `AFFIRMATION_KEYWORDS` in inbound messages within 30 minutes after a dispatch. Reality:

```sql
SELECT to_regclass('public.sms_messages'),
       to_regclass('public.sms_inbound'),
       to_regclass('public.sms_log');
-- NULL, NULL, NULL — none exist.
```

**The inferrer's correction-signal probe is permanently dead.** It cannot be a coincidence — the architecture was designed when SMS via Twilio was the primary Tate→system channel; on 4 May 2026 the contact channel switched to iMessage primary (`~/CLAUDE.md` "Contact channel to Tate (iMessage primary, SMS fallback)"). iMessage is delivered via `osascript` on SY094 and Twilio fallback runs through `osAlertingService`, but **neither persists inbound Tate-side messages to a queryable table.** Outbound is the only tracked direction.

Compounding: even if SMS tables existed, the keyword set is brittle and conservative. `'go'` requires a word boundary but `'thanks'` is a substring match — Tate's 4 May 2026 verbatim "Fuck me cunt..." (which IS a correction in any reasonable reading) would not match either keyword set. The architecture has no semantic-similarity fallback for correction detection.

Net effect: every Tate correction since 30 Apr is invisible to the architecture. The Phase D `correction` rate is structurally zero. Layer 4's "Tate as oracle" pathway — the foundational signal that calibrates the entire self-tuning loop — does not exist.

### Evidence

- All three SMS table candidates return NULL from `to_regclass`.
- `~/CLAUDE.md` 4 May 2026 update: "iMessage is the primary outbound contact channel ... `imessagePathHealthCheck.js` runs every 6h" — confirms outbound-only telemetry.
- `outcomeInference.js:171-194` keyword set fits 2024-era SMS register, not Tate's 2026 register (which is far blunter and more profane).
- `classification_tate_tagged` is 100% NULL across all rows — independent confirmation that no human ground-truth signal is being captured.

### Recommended fix (P1, advisory)

1. Author a `tate_inbound_signal` table (or extend existing — `meta_messages`?) that captures every inbound SMS, iMessage, and conductor-chat user-message with: `id, ts, channel, body, source_message_id`. Wire ingest at the three substrates (Twilio webhook, SY094 iMessage poller, `/api/os-session/message` user-direction).
2. Update `outcomeInference.findTateSignal` to read from the new table.
3. Replace keyword-list match with semantic-similarity match against a small classifier or LLM-based correction/affirmation classifier. The keyword set will not survive Tate's prose.
4. Backfill `classification_tate_tagged` from the conductor-chat history (Tate's prior 7-day messages) where a doctrine path was explicitly mentioned.

### Cross-refs

- `~/CLAUDE.md` "Contact channel to Tate (iMessage primary, SMS fallback)"
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`

---

## Critique #5 — sev=4, exploration_drift

**Title:** Layer-3 forcing function (Phase C) is silently dead — `application_event` shows ~98% `tagged_silent=true` over the last 5 days and 0 `applied=true` rows since 30 Apr; the meta-detector for this regression does not exist.

### Finding

```sql
SELECT day, surfaces, applied, silent FROM (...);
-- 4-29: 467 surfaces, 168 applied, 107 silent  (36% applied)
-- 4-30:   3 surfaces,   0 applied,   3 silent
-- 5-01:  76 surfaces,   0 applied,  76 silent
-- 5-02:  47 surfaces,   0 applied,  47 silent
-- 5-03:  15 surfaces,   1 applied,  14 silent
-- 5-04:  60 surfaces,   0 applied,  60 silent
-- 5-05:  73 surfaces,   0 applied,  57 silent
```

On 29 Apr, Layer 3 had a 36% applied rate. From 30 Apr onward it has been ≤2%. The Phase C forcing-function (PostToolUse hook scanning brief/tool-result text for `[APPLIED]` / `[NOT-APPLIED]` tags) is no longer being honoured by the conductor — either because the hook stopped emitting `[FORCING WARN]` lines, the conductor stopped writing tags, or the application_event schema/write-path changed and the hook can no longer match.

This is a Layer-3 → Layer-2 → Layer-1 cascade: when the forcing function dies, Layer-1 doctrine surfacing becomes free-to-ignore again, doctrine drift returns, and the failure-class taxonomy in Phase D loses its primary signal-source for `usage_failure` classifications. The 30 Apr origin failure mode (substrate-shipped-but-deliverable-undone) is exactly the kind of pattern that the [APPLIED] discipline was supposed to catch.

The architecture's drift detection in this layer is "Pattern's silent-rate > baseline → escalate forcing-function loudness" (Layer 3 row of the Cross-cutting drift table) — but no concrete cron or detector implements this. There is no mechanical alarm. The 4 May audit's Critique #1 ("Per-pattern silent-rate cliffs hidden by systemwide aggregate") flagged this and was set `requires_tate_review`; nothing has changed in the 24h since.

### Evidence

- `application_event` daily counts above.
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 row in cross-cutting drift table: drift signal exists conceptually but no mechanical detector implements it.
- 4 May Critique #1 (sev=3) Neo4j node: `tate_decision = requires_tate_review`, `reviewed = true`, `resolution_status = null` — bottlenecked on the same protocol gap.

### Recommended fix (P2, advisory)

1. Diagnose why `applied=true` count has been zero for 5 days. Five-layer probe: (a) is the PostToolUse hook firing? (b) is it parsing brief/tool-output for `[APPLIED]` correctly? (c) is the conductor still emitting tags? (d) is the schema for application_event still aligned with hook insertion code? (e) is the `applied` column being populated by the hook or by a downstream batch job that has stalled?
2. Add a mechanical drift detector at the daily-drift-check cron: alarm to status_board P2 when 7-day applied-rate is <5% AND surface volume is >100 (the architecture's own Layer-3 drift signal made operational).
3. Treat this as part of the systemic Layer-8-output-not-consumed pattern (4 May Critique #5): the architecture surfaces drift but does not action it autonomously. The next critique-disposition cycle must include a "if `tate_decision = requires_tate_review` is older than 7 days AND severity ≥4, escalate to status_board P1" rule.

### Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 + Cross-cutting drift table
- `~/ecodiaos/drafts/phase-G-critique-02-triage-2026-05-05.md` (graduated_from_critique → resolved precedent for how this kind of fix lands)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (silent-tag = symbolic non-engagement)
- 4 May audit Critique #1 (per-pattern silent-rate cliffs)

---

## Reverse-drift signal check

Per Layer 8 doctrine: "three consecutive audit cycles producing zero critiques = reverse drift signal." Today's audit produces 5 critiques (3 sev-5, 2 sev-4); reverse-drift signal is **not triggered**. Prior cycles:
- 2026-05-04: 5 critiques (1 sev-5, 1 sev-5, 1 sev-4, 1 sev-4, 1 sev-3) ✓
- 2026-05-03: 5 critiques (2 sev-5, 1 sev-4, 1 sev-4, 1 sev-3) ✓
- 2026-05-05: 5 critiques (this audit) ✓

The audit is not too shallow.

---

## Summary table

| # | Severity | Failure class    | One-line                                                                       |
|---|----------|------------------|---------------------------------------------------------------------------------|
| 1 | 5        | doctrine_failure | failure-rate structural zero despite 129 bad forks (crashed-keyword + fork_id)  |
| 2 | 5        | surfacing_failure| Phase D classifier flatlined 7+ days; consumer-health rules from #3 never authored |
| 3 | 4        | doctrine_failure | 391 pre-PhaseG survivorship rows still distort 7d KPIs (forward-only fix)       |
| 4 | 5        | surfacing_failure| Tate-correction signal source structurally absent (no SMS table, iMessage opaque) |
| 5 | 4        | exploration_drift| Phase C applied-rate ~0% for 5 days; no mechanical Layer-3 drift detector       |

**Severity distribution:** 3× sev-5, 2× sev-4, 0× sev-3, 0× sev-2, 0× sev-1.
**Failure-class distribution:** 2× doctrine_failure, 2× surfacing_failure, 1× exploration_drift, 0× usage_failure.

The audit is uncomfortable on purpose. The pattern across all 5 critiques: the architecture self-detects drift but has no autonomous action loop, ships forward-only fixes that don't backfill cohort, and has substrate-seam blindness on both the negative-outcome side (failures invisible) and the human-oracle side (Tate corrections invisible). Layer 8 is the only layer functioning to spec. The other 7 are partially silent.

— fork_moskthuo_0c0d1a, adversarial critic, 2026-05-05.
