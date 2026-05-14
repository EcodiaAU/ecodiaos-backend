# Migrations

Migrations are applied in **filename sort order** by `src/db/migrate.js`. The runner uses `_migrations.filename` as the primary key, so once a migration ships, **never rename it** — the runner will treat the new filename as a new migration and try to re-apply it.

## Numbering

- Next free integer at the moment the migration is authored.
- Claim by observation (read the directory, pick `max+1`), not by spec-suggested number, per `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`.

## Known collisions (historical, do not rename)

These pairs share a number. Order is determined by lexicographic suffix; both are already applied on prod under their current filenames.

- `034_bookkeeping.sql` then `034_goal_session_link.sql`
- `054_graph_write_buffer.sql` then `054_os_incidents.sql`
- `067_episode_resurface_event.sql` then `067_status_board_source_column.sql`

If you author a new migration, pick the next integer **strictly above the highest on disk** (`ls | sort | tail -1`). Do not reuse a collided number.

## Idempotency

Every DDL statement should be guarded:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`

Multi-statement migrations run inside a single transaction (`tx.unsafe(sql)` in `migrate.js:41`); a partial failure rolls back.

## Backfill safety

Migrations like `109_dispatch_event_dedup.sql` that DELETE production data should guard their `WHERE` clauses with `IS NOT NULL` filters on the JSONB extraction. See that migration's comment for the pattern.

## Observation tables

High-frequency event tables (`observer_signals`, `os_observations`, `observer_pulse_events`, `gkg_events`, `session_memory_chunks`) MUST ship with a corresponding retention cron in `os_scheduled_tasks` or a sibling DELETE migration. The canonical retention cleanup lives in `118_observation_retention_cron.sql`.
