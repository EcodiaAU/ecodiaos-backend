---
triggers: phantom-shipping, phantom-bail, fork-truncated, fork-result-600, fork-report-missing, slice-600, forkService-result, fork-result-fallback, transcript-tail, fork-result-truncation, fork-no-report, fork_report-tag, fork-orientation-bail, fork-result-classification
---

# Fork-result fallback must be marked, not silently slice the transcript tail

## The rule

When a fork's transcript does NOT contain a `[FORK_REPORT]` tag, `forkService.js` MUST mark the fallback path explicitly in `state.result` (e.g. `(no [FORK_REPORT] emitted; last N chars of transcript follow)`) and the slice budget MUST be large enough (~2000 chars) that the conductor can reconstruct what the fork actually did.

Silent `fullText.slice(-600)` with no marker produced 455/555 historical fork rows (82%) clustered at *exactly* 600 chars — and the conductor mis-classified them as "phantom shipping" or "bailed at orientation" when most of them were forks that completed real work and ran out of budget before emitting the closing tag.

## Do

- Branch result-write on `report` (the captured `[FORK_REPORT]` paragraph) presence.
- If `report` is non-null → write it verbatim, no slicing, no prefix.
- If `report` is null but transcript has content → prefix with `(no [FORK_REPORT] emitted; last <N> chars of transcript follow)\n\n` and slice tail to ~2000.
- If transcript is empty → write the literal string `(no output)`.
- The conductor's rollup / phantom-fork classifier MUST treat the prefix `(no [FORK_REPORT] emitted` as the actual "fork did not close cleanly" signal, NOT a 600-char length heuristic.

## Do not

- Silently slice the transcript and write the tail as if it were the report.
- Use length-based heuristics (`length(result) = 600`) as the phantom-bail classifier — that conflates "report was actually 600 chars" with "fallback fired".
- Increase the slice budget without marking the fallback — a longer-but-still-silent fallback just moves the cluster, doesn't fix observability.
- Drop the slice budget entirely and write the entire `fullText` — multi-megabyte transcripts will fill the DB.

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

If `fallback / (fallback + real_report)` > 30% over a 7-day window, the doctrine bug is upstream — forks are systematically running out of budget before emitting the tag. Investigate spawn-prompt instructions, token budgets, and tool-call ceilings rather than blaming individual forks.

## Origin

2 May 2026 20:05-20:15 AEST. SDK fork `fork_moo6esm9_565a0e` ran the SELF-EVOLUTION rotation B brief: "debunk-or-confirm phantom-fork hypothesis". Conductor had been building doctrine that today's 5 forks "phantom-shipped" / "bailed at orientation" because their results were ~600 chars. Fork probed `os_forks.result` schema first (text, unlimited — column is not the bottleneck) then length distribution (455/555 at exactly 600 chars). Read `forkService.js:655` and found:

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

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — would have flagged the phantom-bail doctrine earlier if applied (length-heuristic was the narrated state; column-type and .slice site were the disk state).
- `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` — the conductor was classifying "600-char result" as a known failure mode without empirical verification.
- `~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md` — same family: don't trust string-pattern heuristics over filesystem/transcript probes.
