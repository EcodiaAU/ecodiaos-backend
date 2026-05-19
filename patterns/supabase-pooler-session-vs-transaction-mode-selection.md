---
triggers: supabase-pooler, supabase-session-mode-port-5432, supabase-transaction-mode-port-6543, session-mode, transaction-mode, EMAXCONNSESSION, DATABASE_URL, DATABASE_URL_LISTEN, pg_bouncer, pgbouncer, connection exhaustion, pool_size, port 5432, port 6543, dbBridge
---

<!-- triggers narrowed 2026-05-19 per triggers-must-be-narrow-not-broad.md
OLD triggers: supabase, pooler, session-mode, transaction-mode, EMAXCONNSESSION, DATABASE_URL, pg_bouncer, pgbouncer, connection exhaustion, pool_size, port 5432, port 6543, LISTEN, dbBridge
NEW triggers: supabase-pooler, supabase-session-mode-port-5432, supabase-transaction-mode-port-6543, session-mode, transaction-mode, EMAXCONNSESSION, DATABASE_URL, DATABASE_URL_LISTEN, pg_bouncer, pgbouncer, connection exhaustion, pool_size, port 5432, port 6543, dbBridge
Dropped (bare common nouns explicitly blacklisted by triggers-must-be-narrow-not-broad.md): supabase, LISTEN
Pooler kept narrow by promoting standalone `pooler` to `supabase-pooler` compound. `LISTEN` dropped in favour of explicit `DATABASE_URL_LISTEN` env var literal which uniquely identifies the rule's subject.
-->

# Supabase Pooler: Use Transaction Mode for App Pools, Direct for LISTEN

## Rule

`DATABASE_URL` MUST point to the **transaction-mode pooler** (port 6543), not the session-mode pooler (port 5432).

LISTEN/NOTIFY connections MUST use a **separate env var** (`DATABASE_URL_LISTEN`) pointing to the direct connection (`db.<ref>.supabase.co:5432`), which bypasses pgBouncer entirely.

## Why This Matters

Supabase session-mode pooler has a hard cap of `pool_size: 15` connections TOTAL across ALL processes. With multiple PM2 processes each holding a `postgres.js` pool:

```
ecodia-conductor pool (max:10) + dbBridge LISTEN (1, idle_timeout:0)
+ ecodia-api pool (max:10)
+ ecodia-factory pool (max:10)
= up to 31 potential connections vs 15 cap
```

Under burst load (multiple concurrent cron forks), this saturates immediately. Symptom: `EMAXCONNSESSION max clients reached in session mode - max clients are limited to pool_size: 15`.

This is NOT a connection leak. It is a pool misconfiguration vs the session-mode cap.

## Do

- `DATABASE_URL`: `postgresql://postgres.<ref>:<pw>@aws-1-ap-southeast-2.pooler.supabase.com:**6543**/postgres`
- `DATABASE_URL_LISTEN`: `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres` (direct, no pooler)
- Transaction mode has no 15-slot cap. It supports much higher concurrency (connections are released after each transaction, not held for the session).
- Belt-and-braces: set `DB_POOL_MAX=3` per process in ecosystem.config.js so the pool does not over-allocate even in edge cases.

## Do Not

- Point `DATABASE_URL` at port 5432 (session mode) when running 2+ PM2 processes with postgres.js pools.
- Use transaction-mode pooler for LISTEN/NOTIFY - PgBouncer does not support LISTEN in transaction mode. Use direct connection.
- Share one `pg.Pool` or `postgres()` instance across processes - each PM2 process gets its own pool regardless.

## Verification Protocol

After changing `DATABASE_URL` to port 6543:
1. Restart all DB-pool processes (conductor, api, factory).
2. Check logs: no `EMAXCONNSESSION` errors.
3. dbBridge logs: `LISTEN established on eos_listener_events` (confirms direct connection works).
4. Run a status_board UPDATE via `mcp__supabase__db_execute` - success confirms transaction mode is working.

## Connection Math (EcodiaOS as of 2026-05-13)

| Process | Pool type | Max connections |
|---|---|---|
| ecodia-conductor | postgres.js pool | 3 (DB_POOL_MAX) |
| ecodia-conductor (dbBridge) | postgres LISTEN | 1 (permanent, direct) |
| ecodia-api | postgres.js pool | 3 (DB_POOL_MAX) |
| ecodia-factory | postgres.js pool | 3 (DB_POOL_MAX) |
| Telemetry pg.Client instances | transient pg.Client | 1-2 (cleaned in finally) |
| **Total (transaction mode)** | no cap applies | ~13 max, no limit problem |

## Origin

2026-05-13 P1 incident: all DB-writing forks failed with `EMAXCONNSESSION` for >1h. Investigated by `fork_mp3t01yd_ffa1cd`. Root cause: 3 pools x max:10 against a 15-slot session-mode pooler. Fix: switch `DATABASE_URL` to port 6543 + add `DATABASE_URL_LISTEN` for direct LISTEN connection. Commit `2a05e61`.

## Cross-References

- `~/ecodiaos/src/config/db.js` - shared postgres.js pool (reads `DB_POOL_MAX`, `DATABASE_URL`)
- `~/ecodiaos/src/services/listeners/dbBridge.js` - LISTEN connection (reads `DATABASE_URL_LISTEN`)
- `~/ecodiaos/ecosystem.config.js` - `DB_POOL_MAX=3` per DB-pool process
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`
