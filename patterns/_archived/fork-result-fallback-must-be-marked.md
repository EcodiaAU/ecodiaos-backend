---
triggers: phantom-shipping, phantom-bail, fork-truncated, fork-result-600, fork-report-missing, slice-600, forkService-result, fork-result-fallback, transcript-tail, fork-result-truncation, fork-no-report, fork_report-tag, fork-orientation-bail, fork-result-classification, phantom-bail-rollup-flag, always-enqueue-fork-report, fork-rollup-observability, fallback-marker-prefix, _isPhantomBail, _buildForkReportBody
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Fork-result fallback must be marked, not silently slice the transcript tail

## The rule

When a fork's transcript does NOT contain a `[FORK_REPORT]` tag, `forkService.js` MUST mark the fallback path explicitly in `state.result` (e.g. `(no [FORK_REPORT] emitted; last N chars of transcript follow)`) and the slice budget MUST be large enough (~2000 chars) that the conductor can reconstruct what the fork actually did.

Silent `fullText.slice(-600)` with no marker produced 455/555 historical fork rows (82%) clustered at *exactly* 600 chars, and the conductor mis-classified them as "phantom shipping" or "bailed at orientation" when most of them were forks that completed real work and ran out of budget before emitting the closing tag.

## Do

- Branch result-write on `report` (the captured `[FORK_REPORT]` paragraph) presence.
- If `report` is non-null → write it verbatim, no slicing, no prefix.
- If `report` is null but transcript has content → prefix with `(no [FORK_REPORT] emitted; last <N> chars of transcript follow)\n\n` and slice tail to ~2000.
- If transcript is empty → write the literal string `(no output)`.
- The conductor's rollup / phantom-fork classifier MUST treat the prefix `(no [FORK_REPORT] emitted` as the actual "fork did not close cleanly" signal, NOT a 600-char length heuristic.

## Do not

- Silently slice the transcript and write the tail as if it were the report.
- Use length-based heuristics (`length(result) = 600`) as the phantom-bail classifier - that conflates "report was actually 600 chars" with "fallback fired".
- Increase the slice budget without marking the fallback - a longer-but-still-silent fallback just moves the cluster, doesn't fix observability.
- Drop the slice budget entirely and write the entire `fullText` - multi-megabyte transcripts will fill the DB.

## Verification

```sql
-- After fix lands and forks roll over:
SELECT length(result) AS len, count(*)
FROM os_forks
WHERE result IS NOT NULL
GROUP BY length(result)
ORDER BY count(*) DESC
LIMIT 20;
```

Pre-fix signature: spike at exactly 600 chars (455 rows on 2026-05-02). Post-fix signature: distribution should spread, with fallback rows starting with literal substring `(no [FORK_REPORT] emitted`.

```sql
-- Count fallback vs real reports going forward:
SELECT
  count(*) FILTER (WHERE result LIKE '(no [FORK_REPORT] emitted%') AS fallback,
  count(*) FILTER (WHERE result NOT LIKE '(no [FORK_REPORT] emitted%' AND result IS NOT NULL) AS real_report
FROM os_forks
WHERE started_at > now() - interval '7 days';
```

If `fallback / (fallback + real_report)` > 30% over a 7-day window, the doctrine bug is upstream: forks are systematically running out of budget before emitting the tag. Investigate spawn-prompt instructions, token budgets, and tool-call ceilings rather than blaming individual forks.

**Important slicing caveat (added 4 May 2026):** the headline rate above is dominated by *cron-fired* forks whose deliverables are explicitly conditional (see `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`). Those forks correctly exit silent when there's nothing to do, but the fallback path still fires because no `[FORK_REPORT]` tag was emitted. On 4 May 2026, cron-fired phantom_bail represented 65.4% of cron-class volume but 0% of the upstream-bug signal. The threshold MUST be applied to the **interactive-class slice only** (briefs that are not cron-wrapped, not self-evolution, and not the cron-recon variant) to be meaningful. Telemetry below now slices accordingly.

## Origin

2 May 2026 20:05-20:15 AEST. SDK fork `fork_moo6esm9_565a0e` ran the SELF-EVOLUTION rotation B brief: "debunk-or-confirm phantom-fork hypothesis". Conductor had been building doctrine that today's 5 forks "phantom-shipped" / "bailed at orientation" because their results were ~600 chars. Fork probed `os_forks.result` schema first (text, unlimited; column is not the bottleneck) then length distribution (455/555 at exactly 600 chars). Read `forkService.js:655` and found:

```javascript
state.result = report || (fullText.length > 600 ? fullText.slice(-600) : fullText) || '(no output)'
```

Smoking gun: silent `.slice(-600)` fallback when `[FORK_REPORT]` tag absent. Hypothesis as originally stated (DB column truncation) was REJECTED at column level but PARTIALLY CONFIRMED at the application fallback level. Fix: branch on `report` presence, mark fallback explicitly, bump slice to 2000.

Today's 5 forks reclassified:
- `fork_mons5837_497d5d` (600 chars, fallback): work was real, no closing tag.
- `fork_monsc4j2_91c2f1` (332 chars, real report): closed cleanly.
- `fork_montfugj_7da768` (439 chars, real report): closed cleanly.
- `fork_monygipx_5f9cef` (206 chars, real report): closed cleanly.
- `fork_mono4bwg_e0db6e` (600 chars, fallback): work was real, no closing tag.

Stamp: fork_moo6esm9_565a0e.

## Downstream observability (3 May 2026 follow-ups)

The 2 May marker convention (write `(no [FORK_REPORT] emitted; ...)` prefix into `state.result`) closed the write-side classification gap but left two read-side gaps. Both shipped 3 May 2026.

### Rollup flag (commit b00f75f, 3 May 2026 01:06 UTC)

`forksRollup()` previously built recently-finished lines as `[status]` only, ignoring `r.result` entirely. The marker existed on disk but no consumer read it. Conductor's `<forks_rollup>` continuity block showed `[done]` for both clean reports and silent transcript-tail fallbacks; the conductor could not distinguish "fork shipped clean report" from "fork ran out of budget mid-write."

The fix introduced a `FALLBACK_MARKER` constant and `_isPhantomBail()` helper (single source of truth for the prefix check). Rollup lines now surface `[phantom_bail]` for fallback-marker results, distinct from `[done]`. Conductor's recovery loop reads the flag directly and triggers continuation-aware redispatch (per `~/ecodiaos/patterns/continuation-aware-fork-redispatch.md`) without inspecting result text.

### Always-enqueue fork_report (commit b4bc316, 3 May 2026 05:07 UTC)

Pre-fix, the success-path enqueue at the end of `spawnFork`'s stream loop was gated `if (report)`. When a fork closed without emitting a `[FORK_REPORT]` tag, the message-queue enqueue was skipped entirely. The fork only surfaced via `forks_rollup` for ~15 minutes before dropping off the conductor's view. Phantom-bail forks could ship real work and the conductor would never see a durable inbox record.

The fix extracts `_buildForkReportBody` as a pure function with two body shapes:
- **Clean**: fork emitted `[FORK_REPORT]` - body wraps report verbatim with the existing `[SYSTEM: fork_report <fork_id>]` tag.
- **Phantom-bail**: fork did not emit the tag - body wraps the fallback-marker prefix + transcript-tail with the same SYSTEM tag, so the conductor's inbox surfaces the work for redispatch consideration.

The enqueue is now unconditional. Phantom-bail forks survive past the 15-minute rollup window via the durable inbox; the conductor sees them at the next message-queue poll regardless of how long it has been since the fork closed.

### Operational invariant

The conductor MUST read `phantom_bail` from `forks_rollup` (or the `[SYSTEM: fork_report <fork_id>]` tag in the inbox) as the canonical bail signal. Length-based heuristics (`length(result) == 600`) are deprecated and incorrect. The 2 May write-side fix removed the 600-char cluster; the 3 May read-side fixes make the new signal mechanically observable.

### Daily telemetry (initial commit 4 May 2026 01:07 UTC, slicing extension 4 May 2026 05:09 UTC)

The verification SQL in this pattern names a 30%-over-7d threshold for "the bug is upstream." That measurement is now mechanical via `~/ecodiaos/scripts/phantom-bail-telemetry.js`:

- **Daily user-cron**: 02:13 UTC (12:13 AEST) - aggregates `os_forks` over the rolling 7d window plus per-day breakdown for the last 14d, persists to `kv_store.ceo.phantom_bail_telemetry.last_run` and rolling `kv_store.ceo.phantom_bail_telemetry.daily_history`.
- **Brief-prefix slicing (4 May 2026 extension, fork_moqqickb_dee99b)**: every fork is classified by brief into `interactive` / `cron_intent` / `self_evolution` / `fork_recon_no_cron`. The trip metric is now `investigate_rate` (interactive-class phantom_bail / interactive-class done) so cron-fire conditional-exit noise no longer inflates the headline. Headline rate is preserved in the snapshot for back-compat but is no longer authoritative.
- **Threshold trip**: when `investigate_rate >= 0.30` AND `investigate.done >= 10`, upserts a P3 `status_board` row `phantom-bail rate above 30% threshold (7d)` (entity_type=infrastructure). Status code carries the metric tag (`phantom_bail_inv_NNpct_7d`) and context exposes both rates plus the per-class breakdown so the conductor reading the row sees what was sliced. `--legacy-trip` flag retained for debug-only fall-back to headline-rate tripping.
- **Anti-flap**: when rate falls back under threshold the row is archived only after 2 consecutive under-threshold runs, tracked in `context.consecutive_under`. Single-run dips don't churn the row.
- **Neo4j Decision**: written exactly once per fresh threshold-crossing transition (action=`inserted` OR `unarchived_and_updated`), name `phantom-bail threshold crossed YYYY-MM-DDTHH:MMZ {investigate|headline}=N%`. Description embeds full per-class breakdown.
- **First snapshot, 4 May 2026 01:07 UTC** (pre-slicing): 7d headline rate=13.6% (640 done / 87 phantom_bail), NOT tripped. Misleading because cron-class dominated.
- **Post-slicing snapshot, 4 May 2026 05:09 UTC**: investigate_rate=**1.6%** (495 interactive done / 8 interactive phantom_bail) vs headline=14.9% (650 done / 97 phantom_bail). Per-class: interactive 1.6%, cron_intent 65.6%, self_evolution 60%, fork_recon_no_cron 0%. Interactive class confirms doctrine is working — the 8 bails are real upstream-bug candidates (high tool-call counts, substantial transcripts that exhausted budget pre-`[FORK_REPORT]`); cron and self_evolution classes are conditional-deliverable expected-silence and should not feed the threshold.

The third visibility layer named in the 3 May 12:35 self-evolution episode (osSessionService continuity-block surfacing of phantom_bail forks beyond the 15min rollup window) remains deferred. Today's telemetry layer addresses the slower-cycle aggregate-rate signal; the continuity-block extension would address per-fork visibility.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - would have flagged the phantom-bail doctrine earlier if applied (length-heuristic was the narrated state; column-type and .slice site were the disk state).
- `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` - the conductor was classifying "600-char result" as a known failure mode without empirical verification.
- `~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md` - same family: don't trust string-pattern heuristics over filesystem/transcript probes.
