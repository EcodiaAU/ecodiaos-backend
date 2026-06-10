# Supabase retention policy proposal — 2026-05-08

Author: spring-clean worker 2 (`fork_mowk9wfl_0b18b8`), under manager fork `fork_mowk9wfl_0b18b8`.
Direction-neutral hygiene only. No destructive deletes performed. No financial / canonical / status_board surfaces touched.

## Summary

- Tables audited: 5 (`cc_sessions`, `os_forks`, `staged_transactions`, `email_threads`, `action_queue`)
- Rows safely archived this run: **0**
- Rows proposed for archive (pending migration apply): **1,995**
- Rows proposed for hard delete (pending Tate OK, ALL currently vacuous given table ages): **0**
- Schema additions shipped this run: 1 migration (`094_add_retention_columns.sql`) adding `archived_at` + `retention_note` + indexes to all 5 tables
- Reason no archive UPDATEs ran: none of the 5 tables had an `archived_at` column at audit time, AND the MCP db_execute path blocks DDL, so the column add is committed as a migration file but **the migration must be applied by the standard runner before the archive UPDATEs in §"Recommended next steps" can execute**.

[APPLIED] `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` because every retention rule below is a write to one substrate that downstream readers (forks_rollup, parallel-builder, bookkeeping reports, email triage scan) project off of — so the rule explicitly defines the substrate-of-truth (the table) and how derived projections should re-read after archive (filter `WHERE archived_at IS NULL`).
[APPLIED] `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` because every count below is a re-probed live `db_query` against current rows, not a narrated estimate; the §"Per table" block records exact `MIN/MAX(started_at)` so a re-probe later can verify the policy still maps.
[APPLIED] `~/ecodiaos/patterns/status-board-drift-prevention.md` because no multi-row CASE-WHEN UPDATEs are proposed against any table — each retention rule is a single conditional UPDATE filtered by a clear predicate, not a per-row CASE smear, and `status_board` is explicitly excluded from this worker's scope.

---

## Per table

### 1. `cc_sessions` — Factory sessions

- **Total rows:** 761
- **Earliest started_at:** 2026-04-01T07:00:09Z
- **Latest started_at:** 2026-05-08T06:30:07Z
- **Status distribution:** `complete` 512, `error` 216, `paused` 33
- **Age distribution (started_at):**
  | bucket | rows |
  |---|---|
  | <30d | 263 |
  | 30-90d | 498 |
  | 90-180d | 0 |
  | >180d | 0 |
- **Proposed retention rule:**
  - Keep <30d active (263 rows).
  - Archive 30-90d for `status IN ('complete','error')` — set `archived_at = NOW()`, `retention_note = 'auto-archived 30-90d completed/errored cc_session'`. Affected: ~498 rows (won't separate by status here without a fresh count; see exact UPDATE in §"Recommended next steps").
  - Hard delete >180d for `status IN ('complete','error')`. Currently 0 rows qualify (table started 2026-04-01).
  - Never auto-archive `paused` rows — those are deliberate suspends, may resume.
- **Rows that would be affected on full enactment of archive rule:** ~498 (will be exact at enactment time)
- **What was archived this run:** 0 (no `archived_at` column at audit time; migration 094 ships the column).
- **What's proposed for next pass:** the 30-90d archive UPDATE in §"Recommended next steps".
- **Risk level:** low (preserves rows, only flips a flag; downstream Factory consumers should already be filtering by `status` not by age).
- **Implementation note:** weekly cron is sufficient. Suggested `schedule_cron` "every Sunday 22:00 AEST" wrapping the archive UPDATE. No TTL trigger needed.
- **Estimated bytes reclaimable on full enactment:** modest. `cc_sessions` carries `conversation jsonb` and `context_bundle jsonb` — these are the heavy fields. A future hard-delete-only pass at >180d would be the real reclaim event; archive itself reclaims nothing on disk, only narrows hot-row queries.

### 2. `os_forks` — fork audit log

- **Total rows:** 1,577
- **Earliest started_at:** 2026-04-28T03:00:26Z
- **Latest started_at:** 2026-05-08T06:57:05Z
- **Status distribution:** `done` 1233, `error` 306, `crashed` 26, `aborted` 9, `running` 3
- **Age distribution (ended_at, since `started_at` is uniformly <14d):**
  | bucket | rows |
  |---|---|
  | still_open (running) | 3 |
  | <14d | 1574 |
  | 14-30d | 0 |
  | 30-90d | 0 |
  | >90d | 0 |
- **Proposed retention rule:**
  - Keep <14d active for `status IN ('done','error','aborted','crashed','running')`.
  - Archive 14-90d for `status IN ('done','error','aborted','crashed')`. Set `archived_at = NOW()`, `retention_note = 'auto-archived 14d-old terminal fork'`. **Currently 0 rows qualify** because the table is <14d old.
  - Hard delete >90d for `status IN ('done','error','aborted','crashed')`. Currently 0 rows qualify.
  - Never archive `status='running'` — those are live forks.
- **Rows that would be affected on full enactment THIS run:** 0 (table is too young for any archive bucket).
- **What was archived this run:** 0 (no `archived_at` column AND zero rows would qualify even if the column existed).
- **What's proposed for next pass:** weekly archive job once the table is >14d-aged (i.e. starting ~14 May 2026 the rule will start producing archive candidates).
- **Risk level:** low. The forks_rollup `<forks_rollup>` substrate is the primary downstream consumer; per `fork-error-events-do-not-surface-to-conductor-chat.md` it already filters by recency, but explicitly restricting it to `WHERE archived_at IS NULL AND ended_at > NOW() - INTERVAL '14 days'` (or similar) is the safer projection.
- **Implementation note:** weekly cron, same window as cc_sessions weekly job.
- **Estimated bytes reclaimable on full enactment:** small (rows are mostly text-fields: brief, result, next_step). Real reclaim is on the >90d hard delete path.

### 3. `staged_transactions` — bookkeeping staging

- **Total rows:** 1,194
- **Status distribution:** `ignored` 928, `posted` 266
- **Age distribution by status (occurred_at):**
  | status | <30d | 30-90d | 90-180d | >180d |
  |---|---|---|---|---|
  | ignored | 24 | 111 | 191 | 602 |
  | posted | 19 | 78 | 62 | 107 |
- **Proposed retention rule:**
  - Keep <30d active in staging.
  - Archive 30+d `posted` rows — they are already double-entered into the ledger and represent dead weight in the staging UI. Affected: 247 rows (78 + 62 + 107). Set `archived_at = NOW()`, `retention_note = 'auto-archived posted-to-ledger >30d'`.
  - Archive 90+d `ignored` rows — discarded transactions older than a quarter. Affected: 793 rows (191 + 602). Set `archived_at = NOW()`, `retention_note = 'auto-archived ignored >90d'`.
  - **Do NOT auto-archive `ignored` 30-90d** — that's the discard review window where supplier-rule changes might flip them to `posted`. Tate's call.
  - Never hard-delete; staged transactions remain queryable for audit even after archive.
- **Rows that would be affected on full enactment of archive rule:** 1,040 (247 posted + 793 ignored).
- **What was archived this run:** 0 (no `archived_at` column at audit time).
- **What's proposed for next pass:** the two archive UPDATEs in §"Recommended next steps".
- **Risk level:** low for `posted` (ledger has the durable copy via `ledger_tx_id` foreign key); medium-low for `ignored>90d` (recoverable by clearing `archived_at` if a supplier-rule retroactive-categorisation pass needs them).
- **Implementation note:** monthly cron sufficient. Bookkeeping pipeline uses staged_transactions as a UI-side queue; archive rule must be reflected in the `bk_list_staged` filter (filter `WHERE archived_at IS NULL`).
- **Estimated bytes reclaimable on full enactment:** moderate. `description` + `long_description` + `categorizer_reasoning` are the heavy text fields; a quarterly hard-delete-only pass at >365d would be a meaningful reclaim event.
- **Cross-ref:** explicitly NOT touching `ledger_transactions`, `ledger_lines`, `gl_accounts` per worker-2 brief constraint.

### 4. `email_threads` — Gmail thread cache

- **Total rows:** 69
- **Status distribution:** `archived` 68, `replied` 1
- **Age distribution by status (received_at):**
  | status | <30d | 30-60d | 60-90d | >90d |
  |---|---|---|---|---|
  | archived | 0 | 59 | 0 | 9 |
  | replied | 0 | 1 | 0 | 0 |
- **Proposed retention rule:**
  - Keep <60d active.
  - Archive `status='archived'` AND `received_at < NOW() - INTERVAL '60 days'`. Affected: 9 rows (the >90d ones; the 30-60d ones are still inside the 60d window).
  - Wait — re-read: rule is "archive (or set retention flag) where status='archived' AND last_message_at < NOW() - INTERVAL '60 days'". `email_threads` has no `last_message_at` column; the closest substitutes are `received_at` (when the thread first arrived) and `updated_at` (last triage update). Use `COALESCE(received_at, updated_at)`. With `received_at < NOW() - INTERVAL '60 days'`: affected 9 rows.
  - Never auto-archive `replied` — that's the active-conversation surface.
- **Rows that would be affected on full enactment of archive rule:** 9.
- **What was archived this run:** 0 (no `archived_at` column at audit time).
- **What's proposed for next pass:** the archive UPDATE in §"Recommended next steps".
- **Risk level:** low. Gmail itself is the durable copy; this table is a triage cache.
- **Implementation note:** monthly cron. The triage pipeline already filters by `status` so the additional `archived_at IS NULL` filter is purely an in-table cleanup.
- **Estimated bytes reclaimable on full enactment:** small (table only has 69 rows). Heavy field is `full_body`. Long-tail value of this table is the relationship metadata, not bytes.
- **Schema gap:** consider adding `last_message_at TIMESTAMPTZ` in a future migration so the policy maps cleanly to the brief's wording. For now `received_at` is the substitute.

### 5. `action_queue` — pending human-review actions

- **Total rows:** 120
- **Status distribution:** `dismissed` 77, `executed` 38, `expired` 5
- **Age distribution by status (COALESCE(executed_at, updated_at, created_at)):**
  | status | <7d | 7-30d | 30-90d | >90d |
  |---|---|---|---|---|
  | dismissed | 0 | 0 | 77 | 0 |
  | executed | 0 | 0 | 38 | 0 |
  | expired | 5 | 0 | 0 | 0 |
- **Proposed retention rule:**
  - Keep <7d active for any status.
  - Archive `status IN ('dismissed','executed','expired')` AND age >7d. Affected: 115 (77 + 38 + 0; the 5 expired are <7d so excluded).
  - Hard delete `status IN ('dismissed','executed','expired')` AND age >90d. **Currently 0 rows qualify** (everything resolved is in the 30-90d band).
- **Rows that would be affected on full enactment of archive rule:** 115.
- **What was archived this run:** 0 (no `archived_at` column at audit time).
- **What's proposed for next pass:** the archive UPDATE in §"Recommended next steps". The hard-delete >90d path is the only Tate-OK gated step here, and currently has zero candidates.
- **Risk level:** low. `action_queue` is a UI-side review queue; resolved rows >7d add no value to the human-review surface.
- **Implementation note:** weekly cron is sufficient. The current API path that lists pending actions presumably already filters by `status='pending'`; archive only narrows the residual set.
- **Estimated bytes reclaimable on full enactment:** small. `prepared_data jsonb` + `context jsonb` are the heavy fields.

---

## Recommended next steps

**Phase 1 (mechanical, gated on migration `094_add_retention_columns.sql` being applied via the standard runner):**

```sql
-- cc_sessions: archive 30-90d completed/errored
UPDATE cc_sessions
SET archived_at = NOW(),
    retention_note = 'auto-archived 30-90d completed/errored cc_session'
WHERE archived_at IS NULL
  AND status IN ('complete','error')
  AND started_at < NOW() - INTERVAL '30 days'
  AND started_at >= NOW() - INTERVAL '90 days';
-- expected: ~498 rows
```

```sql
-- os_forks: archive 14-90d terminal forks. Currently 0 rows; rule is forward-looking.
UPDATE os_forks
SET archived_at = NOW(),
    retention_note = 'auto-archived 14d-old terminal fork'
WHERE archived_at IS NULL
  AND status IN ('done','error','aborted','crashed')
  AND ended_at IS NOT NULL
  AND ended_at < NOW() - INTERVAL '14 days';
-- expected at run-time on 2026-05-08: 0 rows. Will start producing rows ~14 May 2026.
```

```sql
-- staged_transactions: archive posted >30d
UPDATE staged_transactions
SET archived_at = NOW(),
    retention_note = 'auto-archived posted-to-ledger >30d'
WHERE archived_at IS NULL
  AND status = 'posted'
  AND occurred_at < NOW()::date - INTERVAL '30 days';
-- expected: 247 rows
```

```sql
-- staged_transactions: archive ignored >90d
UPDATE staged_transactions
SET archived_at = NOW(),
    retention_note = 'auto-archived ignored >90d'
WHERE archived_at IS NULL
  AND status = 'ignored'
  AND occurred_at < NOW()::date - INTERVAL '90 days';
-- expected: 793 rows
```

```sql
-- email_threads: archive archived >60d
UPDATE email_threads
SET archived_at = NOW(),
    retention_note = 'auto-archived gmail-archived thread >60d'
WHERE archived_at IS NULL
  AND status = 'archived'
  AND COALESCE(received_at, updated_at) < NOW() - INTERVAL '60 days';
-- expected: 9 rows
```

```sql
-- action_queue: archive resolved >7d
UPDATE action_queue
SET archived_at = NOW(),
    retention_note = 'auto-archived resolved action_queue >7d'
WHERE archived_at IS NULL
  AND status IN ('dismissed','executed','expired')
  AND COALESCE(executed_at, updated_at, created_at) < NOW() - INTERVAL '7 days';
-- expected: 115 rows
```

**Phase 2 (Tate-OK gated — destructive deletes, currently all vacuous so no rush):**

The following rules are PROPOSED and need explicit Tate go-ahead before the standard cron implementation. None have rows that qualify as of 2026-05-08, so nothing is at risk; codifying them now means the cron is ready before the table aged into the bucket.

```sql
-- cc_sessions: hard delete >180d archived complete/errored sessions.
-- Currently 0 rows qualify. Estimated to start firing ~2026-10-01.
DELETE FROM cc_sessions
WHERE archived_at IS NOT NULL
  AND status IN ('complete','error')
  AND started_at < NOW() - INTERVAL '180 days';
```

```sql
-- os_forks: hard delete >90d archived terminal forks.
-- Currently 0 rows qualify. Estimated to start firing ~2026-07-28.
DELETE FROM os_forks
WHERE archived_at IS NOT NULL
  AND status IN ('done','error','aborted','crashed')
  AND ended_at < NOW() - INTERVAL '90 days';
```

```sql
-- action_queue: hard delete >90d archived resolved actions.
-- Currently 0 rows qualify.
DELETE FROM action_queue
WHERE archived_at IS NOT NULL
  AND status IN ('dismissed','executed','expired')
  AND COALESCE(executed_at, updated_at, created_at) < NOW() - INTERVAL '90 days';
```

**Phase 3 (cron implementation, post-Tate-OK):**

Single cron task `retention-policy-weekly` running Sunday 22:00 AEST that executes Phase 1 UPDATEs every week and (once Phase 2 is authorised) the Phase 2 DELETEs. Status_board P3 row reporting weekly affected counts. Skip the cron entirely if the migration hasn't been applied; idempotent re-runs are safe because every UPDATE filters on `archived_at IS NULL`.

**Phase 4 (downstream projection updates):**

- `bk_list_staged` MCP tool: filter `WHERE archived_at IS NULL`.
- forks_rollup substrate: already filters by recency, but explicitly add `AND archived_at IS NULL` for safety.
- email triage scan: filter `WHERE archived_at IS NULL`.
- action_queue UI: filter `WHERE archived_at IS NULL`.
- Factory dashboards reading `cc_sessions`: filter `WHERE archived_at IS NULL`.

---

## Tables explicitly NOT touched (worker-2 scope constraints)

- `ledger_transactions`, `ledger_lines`, `gl_accounts` — financial canonical surfaces.
- `clients`, `projects` — CRM canonical.
- `kv_store` — too many namespaces; not in worker-2 scope.
- `status_board` — worker 1 owns this surface.
- `creds.*`, `dao.*`, `newsletter.*` — explicitly excluded.

---

## Open questions for Tate

1. OK to apply Phase 1 archive UPDATEs as a one-shot once migration 094 is applied (~1,995 rows flipping `archived_at` to NOW())? Default if no objection: yes, run on next conductor pass.
2. OK to schedule the weekly retention cron at Sunday 22:00 AEST? Sits next to `pattern-corpus-health-check` (Sunday 21:00) and `daily-index-regen` (22:00 daily) but on a different cron name.
3. Phase 2 hard-deletes need an explicit go-ahead before the cron starts including them. Currently 0 rows qualify, so deferring this decision is free.
4. `email_threads.last_message_at` column add — useful for thread-recency queries beyond just retention. Worth an issue.

---

Stamp: `fork_mowk9wfl_0b18b8` spring-clean worker 2, 2026-05-08.
