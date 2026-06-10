---
triggers: cron-duplicate-rows, os-scheduled-tasks-dedupe, duplicate-active-cron, cron-fleet-sprawl, installer-cancel-failed-silently, keep-newest-active-per-name, scheduler-stale-lease-mass-fail, cron-row-never-permanently-fail-reset, dedupe-via-postgres-direct, cron-corpus-installer-dupes, partial-unique-index-cron-name
category: doctrine
facet: scheduler
canonical: true
---

# Cron fleet dedupe: keep newest+most-run active per name, reset stale-lease failures

## The two failure shapes (both seen 2026-06-09)

1. **Duplicate active rows under one name.** `cron_corpus_installer.py` is idempotent-by-name on paper: it cancels ALL existing rows for a name, then recreates one. But the cancel routes through the scheduler MCP (localhost:7456). When the scheduler dispatch path is regressed, the cancel silently no-ops while the recreate succeeds, so each install leaves the old active row plus a new one. Dupes accrete every install. The producer logic is correct; the cancel SUBSTRATE is the leak.

2. **Crons stuck in `failed` from a mass lease event.** A scheduler/host transition expires leases on every in-flight cron at the same instant (e.g. 2026-06-03 22:18, error "stale lease - max retries exhausted"). The rows stay `failed` forever, so the automation is silently down for days. This violates [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] (cron rows must never permanently fail).

## The safe fix (reversible, Postgres-direct, NOT via the flaky MCP)

**Dedupe** - per name with >1 active row, keep the newest-created (which is also the highest run_count = the live canonical one) and cancel the rest:
```sql
WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC, run_count DESC) AS rn
  FROM os_scheduled_tasks WHERE type='cron' AND status='active'
  AND name IN (SELECT name FROM os_scheduled_tasks WHERE type='cron' AND status='active' GROUP BY name HAVING count(*)>1))
UPDATE os_scheduled_tasks t SET status='cancelled', archived_at=now() FROM ranked r WHERE t.id=r.id AND r.rn>1;
```
Newest+most-run is canonical because the installer recreates with the current template grammar and the old stragglers sit at run_count 1.

**Reset stale-lease failures** - clear the dead lease and return to active, EXCLUDING financial crons (billing/invoice need a logic check before they fire again):
```sql
UPDATE os_scheduled_tasks SET status='active', leased_by=NULL, leased_at=NULL, retry_count=0, last_error=NULL
  WHERE type='cron' AND status='failed' AND last_error ILIKE '%stale lease%' AND name NOT ILIKE '%billing%';
```

## How to apply

- Always dry-run the SELECT first and eyeball that the KEEP row is the one actually firing (higher run_count, valid cron_expression). Broken-expression stragglers like `0 */2160 * * *` are the ones to cancel.
- Do it in Postgres direct (the Supabase mgmt query API with the local PAT), not the scheduler MCP, which is the thing that failed to cancel in the first place.
- Both operations are reversible (status flips, no deletes).
- Never blind-reset financial crons or never-fired (run_count 0) rows; those need intent review.

## The durable guard (proposed, not yet shipped)

Dedupe regrows on the next install until the producer stops leaking. Two options, ship one: (a) make `cron_corpus_installer.py` cancel via Postgres-direct so the cancel cannot silently no-op; (b) add a partial unique index `(name) WHERE status='active' AND type='cron'` so a recreate-while-old-still-active fails loudly instead of duping (safe failure mode: the existing active row survives). Before adding the index, check every os_scheduled_tasks writer (installer, scheduler MCP, conductor.js, routes/scheduler.js) is cancel-before-create, or the index breaks a legitimate replace.

## Origin

2026-06-09. Tate: build the system so the cron fleet stays maintained, after flagging weeks of "orphaned or dead, lots of duplication". Audit found 23 names with duplicate active rows and 31 failed crons. Deduped 28 stale actives (0 duplicate names left) and reset 23 stale-lease failures (failed 31 to 8). Pairs with [[knowledge-health-canary-automation-2026-06-09]] (the local-canary maintenance layer) and [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] (fix the producer, not just the symptom).
