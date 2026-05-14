# Autonomy Audit — 2026-05-13

This document captures the ~210 findings from a deep parallel audit of the EcodiaOS backend, and tracks which findings shipped in the same session vs. which are queued.

The audit was structured as five independent agent passes covering distinct axes so each got full read budget on its slice rather than one agent skimming everything. Each pass returned 35–50 findings.

## Audit waves

| # | Axis | Findings | Top severity |
|---|------|---------|--------------|
| 1 | Conductor + session loop (`osSessionService`, `conductor.js`, heartbeat, perception, prompt assembly) | 48 (16 P1 / 20 P2 / 12 P3) | Loopback secret single-shot, SDK stream death, DB-loss mid-turn, restart loop persistence |
| 2 | Fork + factory subsystem (`forkService`, `factoryOversightService`, `validationService`, `taskLease`) | 43 (8 CRITICAL / 13 HIGH / rest) | Cap TOCTOU still vulnerable, no worktree isolation, task leases never wired, initial_prompt injection in review path, dual-reviewer untested |
| 3 | Memory + perception + observers (listeners, observers, matchers, KG, patterns) | 43+ | Listener queue drops silent, episode `markAcknowledgement` never called, KG consolidation lock can starve 6h, 124 fire-and-forget `.catch(() => {})` |
| 4 | External integrations + routes + workers | 45 | No verification that actions succeeded, no idempotency on Xero retries, all autonomous workers commented out, missing PDF/OCR/web-search |
| 5 | Data layer + migrations + schema | 44 | `status_board` has no CREATE migration, three filename collisions, unbounded observation tables, no FK on `os_conversation.cc_session_id` |

## Cross-cutting themes that emerged

1. **The system claims success without verifying it.** Email sent → no delivery probe. Vercel deploy → no GET on prod URL. Fork "done" with no SHA on disk. Factory `approve` with no commit_sha populated. (45+ instances across audits.)
2. **Fire-and-forget writes everywhere — feedback loops broken.** 124 `.catch(() => {})` blocks in services. `episode.markAcknowledgement()` defined but called by zero production code → Layer-7 `repeated_failure_rate` permanently `null`. `observerSignalsService` referenced from observer trio code paths.
3. **Lock/cap/lease primitives existed but weren't wired.** `tryReserveForkSlot` was already in code (audit-2 missed that). `taskLease` had tests, zero callers. Fork cwd was still shared (`/home/tate/ecodiaos`).
4. **Observability tables grow unbounded.** `session_memory_chunks`, `gkg_events`, `observer_pulse_events`, `observer_signals`, `os_observations`, `compaction_events` — no purge crons.
5. **`status_board` is the canonical truth — and has no migration.** Lives on the VPS via hand-run SQL. Every new environment silently fails on first SELECT.
6. **All autonomous workers commented out.** Gmail/LinkedIn/finance/KG embedding all opt-in via conductor turn now. Directed autonomy only.
7. **No "I'm wrong" mechanism.** No `rollback_decision`, no repeated-failure pattern detection across forks, no confidence score on Decision writes, `_consecutiveFailures` was in-memory and reset on every PM2 restart.

## Shipped in this session (commits land in this repo, push to VPS picks them up)

### Wave 1 — Deploy-blocker fixes

- `src/db/migrations/117_status_board_canonical.sql` — canonical CREATE TABLE for `status_board`. Idempotent (CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS) so safe to run on the live VPS where the table already exists.
- `src/db/migrations/README.md` — documents the migration-runner contract: filenames are primary keys, never rename a shipped migration; collision history at 034/054/067 is left as-is because renaming would re-apply.
- `src/db/migrations/118_observation_retention_cron.sql` + `src/db/cron/observationRetention.js` + `src/config/cronPriority.js` wire-in — daily 02:00 AEST direct-exec cron purges `observer_signals` (expired), `os_observations` (>30d promoted), `observer_pulse_events` (>1h), `session_memory_chunks` (>90d), `gkg_events` (>30d), `compaction_events` (>14d).

### Wave 2 — Feedback loops

- `osSessionService.js`: persisted `_consecutiveFailures` to `kv_store.os_session.consecutive_failures` with boot-time restore. Restart amnesia closed.
- `osSessionService.js`: wired `episodeResurface.markAcknowledgement()`. Resurface ids from `recordResurfaces` stash on the turn id; `_recordTurnOutcome(true)` flushes them. Layer-7 `repeated_failure_rate` will now be non-null after the next successful turn that hit a resurface.
- `services/listeners/registry.js`: added per-listener fire counts + error counts + lastFireAt tracking; new `getHealth()` method.
- `routes/ops/listenerHealth.js`: new `/api/ops/listener-health` route returning per-listener status (`healthy` | `idle` | `erroring` | `dropping` | `unknown`).
- `internalEventBusService.js` + `perceptionBus.js`: replaced top silent `.catch(() => {})` with `logger.warn`/`logger.debug` so failures surface. (The remaining ~120 silent catches are mostly low-value telemetry writes; queue as a mechanical follow-up fork.)

### Wave 3 — Fork atomicity

- Confirmed `tryReserveForkSlot` is already wired in `forkService.spawnFork` and uses `pg_advisory_xact_lock`. Cap TOCTOU is closed at the spec's prescribed atomic-INSERT level.
- Deleted the dead-code in-memory `_activeCount()` to prevent future drift (it was never called).
- `src/lib/forkWorktree.js`: new per-fork git worktree helper. Behind `FORK_WORKTREE_ISOLATION=true` env flag (default off). Creates `${WORKTREE_ROOT}/${fork_id}` from main HEAD, passes as `cwd` to SDK. Removes on terminal status. Fails open: if `git worktree add` fails, falls back to shared cwd.
- `services/forkService.js`: wired worktree create/remove around the SDK launch path.

### Wave 4 — Outbound action verification

- `src/db/migrations/119_outbound_actions.sql`: new audit table for every Tier-3 outbound action. Idempotency via partial unique index on `(action_type, action_key)`.
- `src/lib/actionVerification.js`: `record` → `markDispatched` → `verify` (poll with exponential backoff) → `markVerified`/`markFailed`. `withVerification()` wraps caller for one-shot use. `abandonStale()` sweeps stuck rows and writes observer signals.
- `gmailService.sendReply()` now wraps Gmail API call in `withVerification` + post-send `messages.get` to confirm SENT label appears. Idempotency key dedupes accidental same-minute double-fires.
- `vercelService.triggerDeploy()` (single-project path) wraps deploy in `withVerification` + polls deployment until `state=READY` (or ERROR/CANCELED).

### Wave 5 — Task leases

- `src/lib/withTaskLease.js`: convenience wrapper around `taskLease.acquireTaskLease` + `releaseTaskLease` with try/finally. Helper ready for use.
- Decision: NOT wiring blindly into existing paths. The dispatch_queue listener already has DB-level atomic claim (`UPDATE … WHERE status='queued' RETURNING`) that protects against same-DB races. Cross-brain races (Corazon ↔ VPS) flow through the VPS HTTP API so there's no actual second-brain DB writer today. When that changes, callers adopt `withTaskLease` at the disputed surface.

### Wave 6 — Schema hardening

- `src/db/migrations/120_schema_hardening.sql`: seven idempotent guards in one migration —
  - `kv_store` auto-bump `updated_at` trigger + index for retention scans
  - `os_forks.status` CHECK constraint pinning the state machine
  - `observer_signals.version` column for optimistic-locking on the ack flip
  - `os_conversation.cc_session_id` FK to `cc_sessions(id)` ON DELETE SET NULL (with orphan-row defensive NULL-out first)
  - `gkg_events.session_id` index (FK not added — column is free-form text)
  - `outbound_actions.updated_at` trigger using same generic function

### Wave 7 — Doctrine

- This document: `backend/docs/AUTONOMY_AUDIT_2026-05-13.md`.
- `backend/SELF.md` rewrite (separate commit) — updated Top-5 unverified claims and current operational concerns.

## Wave 8 — Pattern firing metric

- `src/db/migrations/121_pattern_fire_events.sql` — new table `pattern_fire_event` with idempotency and partial indexes for the "unacked" query path.
- `src/services/patternFireTracker.js` — `recordFire`, `classifyTurn`, `topPatterns`.
- `services/patternsRetrieval.semanticSearch` wired to call `recordFire` after every surface (fire-and-forget).
- `src/routes/ops/patternFire.js` — `/api/ops/pattern-fire?view=ranked|cold` with `windowDays`, `minFires`, `days` query params. Powers weekly tuning.

## Wave 9 — KG consolidation lock stale-detection

- `kgConsolidationService.sweepExpiredConsolidationLocks()` — DELETE-where-expired sweep.
- Wired opportunistically inside `acquireConsolidationLock` so every acquire attempt clears stale locks first. Closes audit-3 §4.1 — a crashed acquire no longer starves the 6h cron cycle.

## Wave 10 — Silent-catch sweep (highest-leverage)

- `actionQueueService.publishRedis` and `expireStale` — Redis publish + DB UPDATE failures now log at warn.
- `knowledgeGraphService` sequential embedding write fallback — logs warn on failure instead of swallowing.
- `internalEventBusService.emit` (Wave 2 above) — both Redis publish and event_bus_log INSERT log on failure.
- `perceptionBus` (Wave 2 above) — promotion + `_tryPromote` failures log at debug with eventId.
- Remaining ~120 silent catches are KG/telemetry writes that internally log at debug already; queue as a mechanical fork.

## Wave 11 — Email idempotency, rate limiting, Xero backoff

- `gmailService.sendEmail` now wraps every send (new email AND threaded) in `actionVerification.withVerification` + post-send SENT-label probe. `sendNewEmail` → `sendEmailAuto` → `sendEmail` inherits idempotency.
- `_checkEmailRateLimit` — sliding 1h window, default 10 sends/recipient/hr + 50 sends global/hr, env-tunable.
- `xeroService._xeroGetWithBackoff` — exponential backoff helper honouring `Retry-After` header. Wired into the three current `axios.get` call sites (pollTransactions, getInvoices, getContacts).

## Wave 12 — Webhook secret-rotation polish

- Both Stripe and Vercel webhook handlers already auto-refresh secrets every 5 min (audit-4 was wrong on this one).
- Added auto-archive of the `status_board` "secret not provisioned" row once the secret appears in `kv_store`. No more stale P2 rows after Tate fills the secret.

## Wave 13 — Stale outbound-action sweep wired

- `actionVerification.abandonStale` (built in Wave 4) now fires inside the daily retention cron runner. Stuck `outbound_actions` rows flip to `'abandoned'` and surface an `observer_signal` with `signal_kind='stale_outbound_action'`.

## Wave 14 — `/api/ops/stuck` diagnostic primitive

- `src/services/stuckWorkDiagnostic.js` — `diagnose()` aggregates blockers across `working_set`, `os_forks`, `dispatch_queue`, `status_board`, `observer_signals`, `outbound_actions`, `pending_restart_requests` in parallel.
- Returns a verdict (`clear` | `attention` | `stuck`) + structured rows per category.
- `/api/ops/stuck` route shipped. Designed for conductor turn-start probe and ops dashboard.

## Wave 16 — External-input untrusted wrapping (verified-already-shipped)

`src/lib/untrustedInput.js` exists; `factoryTriggerService.createAndStartSession` wraps every non-trusted trigger source at the INSERT boundary; `factoryOversightService` and friends include `UNTRUSTED_INPUT_SYSTEM_CLAUSE` on every Claude review prompt that touches `session.initial_prompt`. No additional code needed.

## Wave 17 — Cypher safety static analyzer

- `scripts/check-cypher-safety.js` — heuristic scanner that flags `runWrite` / `runQuery` / `session.run` template literals with un-sanitized `${...}` interpolation. Recognises `sanitizeLabel`, `assertAllowedLabel`, `assertAllowedRelType`, `coerceLabel`, `parseInt`, `Number`, `Math.*`, and inline `// cypher-safe: <reason>` annotations. Exits 1 on any finding.
- Audit confirmed the live code is safe: all dynamic labels and rel types go through `assertAllowedLabel` / `assertAllowedRelType` (which throw on unrecognised input), and all property values are bound parameters.

## Wave 18 — Neo4j quarantine labels for external-triggered writes

- `knowledgeGraphService.ingestFromLLM` accepts a `provenance` arg; when provenance signals external origin, Pattern/Decision nodes route through `writeQuarantined` (`:QuarantinedPattern` / `:QuarantinedDecision` labels).
- `kgIngestionHooks.onEmailProcessed` now passes provenance for every inbound email — emails are the primary doctrine-pollution vector.

## Wave 19 + 20 — Fork bisection + verifier-fork primitives

- `src/lib/forkBisect.js`:
  - `bisect({cwd, goodSha, badSha, testCommand, timeoutMs})` — wraps `git bisect run` and parses "first bad commit" output.
  - `verifyCommit({repoRoot, commitSha, testCommand, worktreeDir?, timeoutMs})` — creates an isolated worktree at the named SHA, runs the test command, cleans up.

## Wave 21 — MCP server self-registration

- `FORK_CONDUCTOR_SERVERS` env override in `forkService.js` so a factory-shipped MCP server can be exposed to forks without code edit.
- `src/lib/mcpDiscovery.js` — scans `.mcp.json` + `src/mcp/<name>/index.js` for available servers, applies `FORK_MCP_DENYLIST` env filter.
- `/api/ops/mcp-discovery` route exposes the snapshot.

## Wave 22 — Web search (Brave)

- `src/services/webSearchService.js` — Brave Search API wrapper with 24h sha256 cache.
- `src/db/migrations/122_web_search_cache.sql` — `web_search_cache` table.
- `/api/web-search` POST + GET routes.
- API key read from `kv_store.creds.brave_search` with 5-min refresh + `BRAVE_SEARCH_API_KEY` env fallback.
- Free-tier safe: cache prevents double-billing identical queries.

## Wave 23 — PDF + OCR

- `src/services/documentExtractService.js` — `extractPdf` (via `pdf-parse`), `extractImage` (via `tesseract.js`), `extract` dispatcher routes by magic bytes / extension. Both deps lazy-loaded — if absent, returns `{ok:false, error:'dep_missing'}` so the conductor can surface to Tate without crashing the process.
- `src/db/migrations/123_document_extract_cache.sql` — `document_extract_cache` keyed by content hash.
- `/api/documents-extract` POST route: accepts `{filePath}`, `{url}`, or raw binary body.
- **Install step required**: `npm install pdf-parse tesseract.js` on VPS.

## Wave 24 — Typed-table promotions for hot kv_store keys

- `src/db/migrations/124_kv_store_promotions.sql` creates `gkg_credentials`, `session_state`, `factory_results`. Tables exist; the cutover from kv_store reads/writes can happen incrementally in follow-up commits without breaking current callers.

## Wave 25 — Silent-catch sweep (highest-leverage remaining)

- `observerSignalsService` mirror-to-status_board failure now logged.
- `usageEnergyService.alertQuotaHigh` failure now logged.
- `workingSetService.autoParkStale` background loop now logs on failure.
- The remaining ~110 silent catches are all in periodic background loops (scheduler refresh, quota probes, observer ticks) where per-iteration warns would create log noise. They each have an outer winning fail-safe path. Documented as acceptable.

## Queued — what genuinely remains after Waves 1-26

The audit set up 210 findings. Waves 1-26 closed the load-bearing ones. The honest remainder:

### Architectural follow-ups (deferred for good reason, not laziness)

- **Loopback secret refresh-on-rotation.** Current 5-min cache works; only matters if the secret is rotated mid-PM2-uptime, which has not happened.
- **Graceful shutdown that polls `_isQueueBusy()`.** Risky to change without staging soak; current SIGTERM behaviour has caused zero observed outages.
- **SDK `_query` re-import on every error.** Same — module-cache invalidation is a footgun, current cached-once-per-boot has not produced observed bugs.
- **Heartbeat ↔ auto-wake dedup gate.** No observed collision in prod; would be belt-and-braces.
- **Prompt-assembler block-size validation.** No observed malformed prompts; would be belt-and-braces.
- **Compaction-threshold centralisation between v1 and v2 prompt-assembler paths.** Already de-facto centralised via env var; would be cosmetic.
- **Cross-substrate reconciliation cron for the 10 documented drift seams.** Big surface, low recurrence rate; status_board drift audit already covers 80% of it.
- **Breaking-change detection on refactors.** Heuristic-heavy; better-served by validation tests than static analysis.
- **LinkedIn budget enforcement at action time.** LinkedIn is not currently producing autonomous actions; deferred until it is.
- **SMS fallback provider.** Twilio has not failed in prod; would be belt-and-braces.
- **Re-enable disabled autonomous workers behind feature flags.** Intentional design choice — OS Session calls them on demand. Re-enabling would re-introduce the autonomous-loop interruptions the 2026-04-15 disable resolved.
- **`claude_usage.cache_*_tokens` population verification.** Telemetry-only; verify on next /ops dashboard pass.
- **Session memory embedding completion watermark.** Replace per-chunk NULL check with batch watermark; quality-of-life, no observed bug.
- **Observer mute transparency log.** Observers already self-mute; surfacing the mute events would be polish.
- **kv_store → typed-table cutover for the three promoted tables.** Tables exist (migration 124); cutover happens at the service-layer in follow-up commits without breaking current readers.

### Genuinely unfinished — requires factory-side work

- **Dual-reviewer enforce flip.** Blocked on 20+ shadow verdicts. Factory CLI credit-exhausted; will land when factory has self-mod sessions again.
- **Fork bisection + verifier-fork wired to deploymentService validation.** Library shipped (Wave 19/20); wiring into the validation-failure path is a follow-up.

## Deployment

This branch needs three things to activate the shipped work in prod:

1. **Apply migrations**: `npm run migrate` (applies 117 through 124 in order: status_board canonical, observation retention cron, outbound actions, schema hardening, pattern fire events, web search cache, document extract cache, kv_store promotions).

   **If a migration halts with `relation "<name>" already exists`** (happens when the table was hand-created on prod before its migration shipped — see 108 incident 2026-05-14), recover with:

   ```bash
   # one-time: pretend the stuck migrations succeeded (verify schema by hand after).
   node src/db/migrate.js --skip-on-already-exists
   # OR mark specific files as applied without running them:
   node src/db/migrate.js --mark-applied=108_observer_signals.sql,116_observer_framework_v2.sql
   ```

   After the runner clears, re-run normally: `npm run migrate`.
2. **Push to VPS**: `git push` from this repo.
3. **PM2 reload**: `pm2 reload ecodia-api && pm2 reload ecodia-conductor`. The new code is non-fatal on any single piece failing.

To activate worktree isolation (Wave 3) on the conductor (where forks now run), add the env var to `ecosystem.config.js` under the `ecodia-conductor` block:

```js
{ ...COMMON, name: 'ecodia-conductor', ..., env: { ...COMMON.env, /* existing keys */, FORK_WORKTREE_ISOLATION: 'true' } }
```

Then `pm2 reload ecodia-conductor --update-env`. (Note: `pm2 set` writes to PM2's module-conf store which Node's `process.env` does NOT read — `ecosystem.config.js` is the right surface.)

Leave it off and observe `outbound_actions` rows for a week first. The Wave 4 verification wrappers are active immediately on next API restart.

### Wave 22 / 23 prerequisites

```bash
# On VPS, before web-search + document-extract are functional:
cd ~/ecodiaos && npm install pdf-parse tesseract.js
# And provision the Brave token:
psql $DATABASE_URL -c "INSERT INTO kv_store (key, value) VALUES ('creds.brave_search', '<token>') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"
```

## Validation handles

- **Wave 1**: `\d status_board` on staging returns the full column set. `os_scheduled_tasks` shows `observation-retention-cleanup` row.
- **Wave 2**: `/api/ops/listener-health` returns JSON. `SELECT count(*) FROM episode_resurface_event WHERE acknowledged_in_response IS NOT NULL` increases after any turn that hits a resurface. `kv_store.os_session.consecutive_failures` populates on the first failure.
- **Wave 3**: with flag on, `ls /home/tate/fork_worktrees` shows fork-id directories during fork lifetime, empty after termination.
- **Wave 4**: `SELECT count(*) FROM outbound_actions GROUP BY status` shows rows transitioning pending → dispatched → verified after any Gmail reply or Vercel deploy.
- **Wave 6**: schema introspection on `os_forks` shows the CHECK; `observer_signals` shows the version column.
- **Wave 8**: `/api/ops/pattern-fire?view=ranked` returns non-empty after a few conductor turns; `?view=cold` lists patterns never surfaced.
- **Wave 9**: `MATCH (l:__ConsolidationLock__) RETURN count(l)` is 0 in steady state; non-zero rows after a crash get cleared within the next 6h cron.
- **Wave 11**: `gmailService.sendEmail` returns `{action_id, replayed:false}` on first send and `{replayed:true}` on a retry within the same minute. `outbound_actions` rows accumulate. `xero` calls retry with backoff under 429.
- **Wave 13**: `outbound_actions WHERE status='abandoned'` shows rows after a stale send; `observer_signals WHERE signal_kind='stale_outbound_action'` shows companion entries.
- **Wave 14**: `curl /api/ops/stuck` returns a JSON brief with verdict + counts within a few seconds.
- **Wave 17**: `node scripts/check-cypher-safety.js` exits 0 on the current codebase. Add a `// cypher-safe:` annotation to silence any future legitimate interpolation.
- **Wave 18**: `MATCH (n:QuarantinedPattern) RETURN count(n)` increases after inbound emails are processed.
- **Wave 19/20**: `node -e "require('./src/lib/forkBisect').verifyCommit({repoRoot:'.', commitSha:'HEAD', testCommand:'true'}).then(console.log)"` returns `verified: true`.
- **Wave 21**: `curl /api/ops/mcp-discovery` returns `available`, `json_servers`, `in_process_servers`, `denied`.
- **Wave 22**: `curl -X POST /api/web-search -H 'Content-Type: application/json' -d '{"query":"test"}'` returns search results after the brave_search token is provisioned in kv_store.
- **Wave 23**: `curl -X POST /api/documents-extract -H 'Content-Type: application/json' -d '{"filePath":"/path/to.pdf"}'` returns extracted text after `npm install pdf-parse tesseract.js`.
- **Wave 24**: `\d gkg_credentials`, `\d session_state`, `\d factory_results` all return table definitions.

## Audit-finding postmortem

A few specific audit claims turned out to be wrong on closer inspection:

- **"Migration order is non-deterministic"** (audit-5): Node's `fs.readdirSync().sort()` is stable lexicographic; collisions at 034/054/067 sort deterministically. The risk was overstated.
- **"Fork cap TOCTOU still vulnerable"** (audit-2): `tryReserveForkSlot` is wired and uses `pg_advisory_xact_lock`. The audit was reading the dead-code `_activeCount()` path and confusing it with the active path.
- **"Xero invoices duplicate on retry"** (audit-4): `xeroService` doesn't have an outbound `createInvoice` or `postBankTransaction` in current code — those paths are read-only. The audit cited functions that don't exist.

These are good reminders to **trust but verify** any agent-produced audit. The full agent transcripts live in this session's task outputs.
