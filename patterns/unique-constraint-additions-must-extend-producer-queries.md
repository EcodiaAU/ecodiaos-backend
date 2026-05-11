---
triggers: unique-constraint, dedup, ON CONFLICT, INSERT violation, constraint violation, duplicate-key, partial index, outcome_event, correction, dedup guard, producer query
status: active
---

# Unique constraint additions must extend every producer query, not just the table

When you add a UNIQUE constraint (or partial UNIQUE INDEX) to prevent future duplicates,
the constraint enforces the invariant at the DB level but does NOT automatically make the
INSERT/UPDATE producers aware of it. Every path that writes to that table will violate
the constraint until each path either:

(a) uses `ON CONFLICT DO NOTHING` (or `DO UPDATE`) to handle the conflict gracefully, OR
(b) adds a pre-INSERT existence check that routes around the conflict

Failing to extend the producers means the constraint runs but produces violations on every
execution, which log as errors and may leave rows in a stuck state (never getting the
fallback outcome they need to stop cycling).

## The failure mode

1. Constraint added to prevent future duplicates (correct)
2. Existing INSERT code continues to fire without conflict handling
3. Constraint blocks the INSERT — violation raised, row caught in try-catch, `errors += 1`
4. Dispatch/record has no row → selected again on next tick → same violation → infinite loop
5. `errors` counter inflates every run; logs are noisy; the actual state is "stuck"

Observed: `outcome_event_dedup_correction` (md5(correction_text) WHERE outcome='correction')
was added 11 May 2026 after backfill produced 4x duplicate correction rows. The prior sibling
fix (93de4bb) added `ON CONFLICT DO NOTHING` but forgot the fallback: when conflict fires and
0 rows are returned, the dispatch still has no outcome_event row, so it gets re-selected on
every inference tick forever. 27 dispatches stuck for hours. Fixed by 9204158 + 8e6aeb4.

## The correct pattern (INSERT path)

```javascript
const ins = await client.query(
  `INSERT INTO table (...) VALUES (...)
   ON CONFLICT DO NOTHING
   RETURNING id`,
  [...]
)
if (ins.rowCount > 0) {
  // Success
} else {
  // Conflict fired — handle it explicitly, do NOT just increment skipped.
  // If the row needs to be settled with a fallback state, INSERT that fallback here.
  // Without this, the caller cycles forever because the record still has no row.
  await client.query(
    `INSERT INTO table (...) VALUES ($1, 'fallback_state', ...)`,
    [record.id, ...]
  )
}
```

## The correct pattern (UPDATE path)

When updating an existing row that has a UNIQUE expression index, the UPDATE also fires
the index on changed values. Pre-check before UPDATE:

```javascript
const dup = await client.query(
  `SELECT 1 FROM table
   WHERE unique_expression = unique_expression($1)
     AND id != $2
   LIMIT 1`,
  [new_value, existing_row_id]
)
if (dup.rowCount > 0) continue // Already attributed elsewhere — skip
await client.query(`UPDATE table SET col = $1 WHERE id = $2`, [new_value, existing_row_id])
```

## The correct pattern (WHERE clause — do NOT over-broaden)

When fixing the WHERE clause that selects candidates for insertion, resist the temptation
to change a general LEFT JOIN (exclude ALL outcome rows) to a specific LEFT JOIN (exclude
only one outcome type). Over-broadening causes already-classified rows to re-enter the
candidate pool, filling the LIMIT and starving genuinely unclassified rows.

Keep the general exclusion clause. Handle per-constraint dedup at INSERT time.

```sql
-- CORRECT: general exclusion, all classified rows excluded
LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id
WHERE o.id IS NULL

-- WRONG: specific exclusion, causes 1944-row batch starvation in this codebase
LEFT JOIN outcome_event o ON o.dispatch_event_id = d.id AND o.outcome = 'correction'
WHERE o.id IS NULL
```

## Producer paths to audit when adding a UNIQUE constraint

Per ~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md:
1. Live inference / cron path
2. Backfill / migration script
3. Manual classification / admin path
4. Any webhook or ingest path that writes the same table
5. Any retry/recovery script

Each path must add conflict handling before the fix is complete.

## Checklist

- [ ] `ON CONFLICT DO NOTHING RETURNING id` on primary INSERT path
- [ ] Fallback state inserted when conflict fires (do not leave the record without a row)
- [ ] Pre-check (`SELECT 1 WHERE unique_expr = ...`) on UPDATE path before setting the unique column
- [ ] Same ON CONFLICT applied to backfill/migration script
- [ ] WHERE clause for candidate selection NOT broadened to compensate (keep existing exclusion logic)
- [ ] Verify: run producer, confirm `errors=0` and all previously-stuck records now have rows

## Origin

11-12 May 2026. `outcome_event_dedup_correction` partial index. Fork fork_mp1blvjw_f47c75.
Commits: 9204158 (ON CONFLICT + fallback + backfill guard), 8e6aeb4 (revert WHERE regression).
Neo4j Episode: "outcomeInference dedup WHERE clause fixed 2026-05-12".

## Cross-references

- ~/ecodiaos/patterns/recurring-drift-extends-existing-enforcement-layer.md (parent: when adding
  enforcement, update all producers, not just the constraint)
- ~/ecodiaos/patterns/enumerate-all-trigger-paths-when-fixing-data-flow-bugs.md (enumerate every
  producer path before declaring fix complete)
- ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md (verify errors=0 and
  stuck_dispatches=0 before declaring shipped)
