---
triggers: drift-audit-slice-query, status-board-row-dump-token-cap, drift-audit-large-board, slice-query-template, count-filter-where, drift-audit-categorical-question, p1p2-stale-14d, monitor-rows-count, tate-blocked-count, full-select-blowback
---

# Drift-audit slice-queries beat row-dump queries at scale

## Rule

When `status_board` (or any audited table) has more than ~50 active rows, the drift audit MUST use **slice-queries by red-flag category** — count of stale-7d, p1p2-stale-14d, monitor-rows, tate-blocked-high-pri, priority distribution — and NOT a full `SELECT * ... ORDER BY priority` row dump.

Two reasons:

1. **Token cap.** A 100+ row dump regularly exceeds the tool-result token cap. The query succeeds at the DB, but the result is unusable and forces re-querying. 8 May 2026 23:03 AEST: 103-row dump produced 84,573 characters across 1,135 lines and errored "result exceeds maximum allowed tokens."
2. **Wrong question.** The audit asks categorical questions ("are there stale P1s? are monitor-rows piling up? is the Tate-blocked queue growing?"). The categorical answer lives in `count(*) FILTER (WHERE ...)` aggregates, not in 103 rows of free-text scrolling. Per-row inspection is the drill-down step, not the survey step.

## Slice-query template

```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE last_touched < now() - interval '7 days')                              AS stale_7d,
  count(*) FILTER (WHERE last_touched < now() - interval '14 days' AND priority IN (1,2))       AS p1p2_stale_14d,
  count(*) FILTER (WHERE next_action ILIKE '%monitor%')                                         AS monitor_rows,
  count(*) FILTER (WHERE next_action_by = 'tate' AND priority IN (1,2))                         AS tate_blocked_high_pri,
  count(*) FILTER (WHERE priority = 1)                                                          AS p1,
  count(*) FILTER (WHERE priority = 2)                                                          AS p2,
  count(*) FILTER (WHERE priority = 3)                                                          AS p3,
  count(*) FILTER (WHERE priority >= 4)                                                         AS p4_or_lower
FROM status_board
WHERE archived_at IS NULL;
```

This returns a single row of ~9 numbers, well under any token cap. Each red-flag column with non-zero count signals a category that needs drill-down.

## Drill-down template (per red-flag category)

```sql
SELECT id, name, status, next_action_by, priority,
       extract(day FROM now() - last_touched) AS days_stale
FROM status_board
WHERE archived_at IS NULL
  AND <red-flag-condition>     -- e.g. last_touched < now() - interval '14 days' AND priority IN (1,2)
ORDER BY priority, last_touched
LIMIT 30;
```

Always `LIMIT 30`. If a category produces more than 30 hits, that itself is a finding (the bucket is structurally over-fed and needs a bulk archive sweep, not row-by-row triage).

## Do

- Run the slice-query FIRST when the board exceeds ~50 active rows. Use the count results to decide which red-flag categories warrant drill-down.
- Drill down on each red-flag category with `LIMIT 30` and a category-specific `WHERE`.
- Generalise the technique to any large table where the audit asks categorical questions: `cc_sessions` (sessions completed, sessions stuck >1h, sessions with confidence <0.4), `os_scheduled_tasks` (silent-failed crons last 24h), `os_forks` (phantom-bailed forks last hour). Slice-query the survey, drill-down the row inspection.
- When drill-down rows surface a row that needs forking later, write a P3 status_board row capturing the work — do not inline the work into a meta-loop fire.

## Do not

- `SELECT * FROM status_board WHERE archived_at IS NULL ORDER BY priority` on a >50 row board. The query succeeds; the result is unusable.
- Skip the slice-query step because "I'll just look at the rows directly." That mindset works at 20 rows, fails at 80+, and the cost of catching the failure (re-querying, retry latency, token waste) is asymmetric.
- Use slice-queries when the board is small (<30 rows). Direct dump is cheaper and answers the same question.
- Treat slice-query counts as the deliverable. The deliverable is the UPDATE / archive writes that follow.

## Anti-pattern (worked example)

8 May 2026 23:03 AEST meta-loop fire on a 103-row board attempted the canonical `SELECT * ... ORDER BY priority`. Result was rejected by the tool boundary:

> result (84,573 characters across 1,135 lines) exceeds maximum allowed tokens

Forced re-query with the slice template. Slice answered the actual audit question (which categories are over-fed) in <5kB.

## Origin

8 May 2026 23:03 AEST meta-loop fire on a 103-row status_board. Full dump errored at 84kB exceeding token cap. Slice query gave clean signal in <5kB. Pattern observation written to Neo4j as Pattern 1398 in same arc; .md file authored 8 May 2026 evening by fork_mowxtqm8_66ef91.

## Cross-references

- Parent pattern this is the technique for: `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`.
- Original drift doctrine: `~/ecodiaos/patterns/_archived/status-board-drift-prevention.md`.
- Related at-scale audit discipline: `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (the slice surfaces the work; the writes are the artefact), `~/ecodiaos/patterns/status-board-no-batch-case-when-update.md` (one statement per row when writing back).
