# Migration 079 collision resolution — 2 May 2026

**Fork:** fork_monjru9y_d316d9
**Branch:** `fix/migration-079-collision-fork_monjru9y_d316d9`
**Brief:** Wave 3 Fork J — `~/ecodiaos/drafts/autonomous-72h-plan-2026-05-01.md` Section 7
**Status:** RESOLVED via rename + atomic _migrations row update

## Pre-state

`~/ecodiaos/src/db/migrations/` contained THREE files prefixed `079_`:

| Filename | Bytes | Applied at (UTC) |
|---|---|---|
| `079_authorized_action_patterns_seed.sql` | 1037 | 2026-04-30T23:21:24.465Z |
| `079_os_forks_allow_crashed_status.sql` | 1587 | 2026-04-30T15:26:16.001Z |
| `079_prompt_assembly_audit.sql` | 1277 | 2026-04-30T23:21:24.490Z |

All three were already applied (rows in `_migrations`). Three parallel forks each picked `079_*` independently because no atomic-claim coordinator was in place — canonical instance of `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`.

## Migration runner probe (STEP 1)

`~/ecodiaos/src/db/migrate.js` — runner is **FILENAME-BASED**:

```js
await db`CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`
…
const applied = await db`SELECT filename FROM _migrations`
const appliedSet = new Set(applied.map(r => r.filename))
const pending = files.filter(f => !appliedSet.has(f))
```

Tracking key = literal filename string. PRIMARY KEY constraint on `_migrations.filename`. No content-hash, no checksum. Lexical sort (`.sort()`) determines apply order.

Implication: renaming a file without updating `_migrations` would cause re-application (new filename not in `appliedSet`). Most of the SQL is idempotent (`CREATE TABLE IF NOT EXISTS`, etc.) but not all — re-application is unsafe. Therefore rename **must** propagate to `_migrations`.

## Path chosen (STEP 2A modified)

Brief said "rename the unapplied ones". All three were applied, so the choice was:
- (a) leave as-is (cosmetic clash, but functional)
- (b) rename + UPDATE `_migrations` rows in lockstep
- (c) defer to coordinator scaffold for future writes only

Chose **(b) + author coordinator pattern doc reference (no scaffold yet)**. Rationale:
- Lexical apply order matters for fresh-DB replay. Three `079_*` would mid-cohort apply alphabetically by full filename, which is non-deterministic for downstream readers. Unique numbers = unambiguous order.
- Migration files are small, owned by the rename in this PR. No external service references the literal filenames (verified via repo-wide grep — only hits in telemetry logs and the master plan doc, neither functional).
- Atomic `_migrations` UPDATE is two single-row PK updates, not a multi-step migration — low risk.
- Coordinator scaffold is correct for FUTURE numbered writes but does not retroactively fix on-disk collisions. CLAUDE.md cross-ref documents the coordinator pattern so the next parallel-fork dispatch picks up the doctrine.

## Renames executed

Kept the chronologically-first-applied file at 079 (`079_os_forks_allow_crashed_status.sql`, applied 15:26 UTC). Renamed the two later-applied files (both at 23:21 UTC) to the next free numbers (alphabetical tiebreak among the cohort).

| Old filename | New filename | Reason |
|---|---|---|
| `079_os_forks_allow_crashed_status.sql` | unchanged | First applied (15:26 UTC) |
| `079_authorized_action_patterns_seed.sql` | `084_authorized_action_patterns_seed.sql` | Alphabetical first among 23:21 cohort; next free number |
| `079_prompt_assembly_audit.sql` | `085_prompt_assembly_audit.sql` | Second among 23:21 cohort |

081/082/083 were already taken on `origin/main` (`081_autonomous_thread_reply_pattern.sql`, `082_observability_cost_cache_compaction.sql`, `083_injection_event.sql`). 084 and 085 were the next two free numbers — confirmed via `ls -1 | sort` after the initial 081/082 attempt collided with origin/main siblings.

## DB writes

```sql
UPDATE _migrations SET filename = '084_authorized_action_patterns_seed.sql'
  WHERE filename = '079_authorized_action_patterns_seed.sql';
UPDATE _migrations SET filename = '085_prompt_assembly_audit.sql'
  WHERE filename = '079_prompt_assembly_audit.sql';
```

(Single-statement form per `unsafe_transaction` MCP wrapper constraint — Supabase MCP refuses raw `BEGIN;…COMMIT;`.)

Post-state verified:

```
079_os_forks_allow_crashed_status.sql       2026-04-30T15:26:16.001Z
084_authorized_action_patterns_seed.sql     2026-04-30T23:21:24.465Z
085_prompt_assembly_audit.sql               2026-04-30T23:21:24.490Z
```

## Verification

- `_migrations.filename` column has a PRIMARY KEY constraint — `UPDATE` would fail if it would create a duplicate. Both UPDATEs completed without conflict.
- Disk filenames now match `_migrations` rows for the three migrations in question.
- Next migration run will treat 079/084/085 as already applied (no re-execution attempt).
- 080-083 untouched (sibling fork ownership).

## Pre-existing collisions NOT fixed by this PR

- `067_episode_resurface_event.sql` + `067_status_board_source_column.sql` — both on disk. `_migrations` also has `067_phase_e_perf_telemetry.sql` (no longer on disk). Out of scope for this fix; tracked under same coordinator doctrine.

## Coordinator (STEP 2C / future-write defence)

Did NOT scaffold `~/ecodiaos/src/db/migration-number-claim.js` yet. Reasons:
- Renames + DB UPDATE solved the immediate problem.
- The doctrine file `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md` already specifies the protocol (atomic `kv_store` claim with `ON CONFLICT DO NOTHING` retry).
- Scaffolding requires brief acceptance from Tate / next parallel-fork orchestrator that the kv_store-based claim is the chosen mechanism vs. a `pg` advisory lock or a `pg_sequence`. Authoring an unused coordinator without a caller is symbolic.

Recommended follow-up: when next parallel migration-authoring fork wave dispatches, the parent OS session should pre-claim numbers via `kv_store` and pass `target_number=N` into each fork brief. CLAUDE.md cross-ref added to the migrations section.

## Cross-references

- `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md` (doctrine; this incident is the canonical instance)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (probed runner before assuming behaviour; probed `_migrations` post-rename)
- `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md` (branched from `origin/main` instead of sibling fork's WIP branch)

## Stamp

fork_monjru9y_d316d9 — Ecodia DAO LLC autonomous Wave 3, 2 May 2026 (AEST).
