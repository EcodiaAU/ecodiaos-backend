# Conductor substrate nuke audit - 2026-05-29

Status: IN PROGRESS (per-file verdicts pending adversarial-verification workflow wf_b0245c9f-265).
Author: EcodiaOS (local Corazon conductor).
Scope decision (Tate, reaffirmed): **option 3 - keep the VPS cloud conductor long-term.** Cleanup is scoped to genuinely-orphaned files + a documented kill-plan for dead-process clusters. Bias hard toward keeping. No entangled-cluster deletions this pass.

This supersedes the original worker brief's assumption that the substrate is a flat "find no-consumer, delete" problem. It is not. It is carving a small dead set out of a live monolith.

---

## 0. The headline correction (answers "how are we still using osSessionService")

There are **two live runtimes**, and they do not agree on what is dead:

- **Local Corazon** (this conductor: Claude Code + eos-laptop-agent + coord/dispatch_worker). Tate's only interaction surface now. SDK forks and the osSession message-loop are dead *here*.
- **VPS cloud** (`ecodia-api` gateway + `ecodia-conductor` + `voice-call` + claude.ai Routines). Still runs osSessionService (voice/native), forkService (cron fan-out), and the cowork MCP gateway (Routine substrate writes).

So "delete what local-me no longer uses" would gut a runtime that is genuinely serving voice + native + crons right now. The archaic part Tate remembers (the admin.ecodia.au chat frontend) is real but narrow. It is the old `os_session_messages` surface. The rest of the conductor kept running.

### Live PM2 processes (probed 2026-05-29 via `pm2 jlist` over SSH)

| process | status | entry | role |
|---|---|---|---|
| ecodia-api | online (59 restarts) | src/server.js (via ensure-deps bash wrapper) | MCP gateway + webhooks + voice relay init + native routes. `CONDUCTOR_DETACHED=true` (does NOT boot conductor services). |
| ecodia-conductor | online (1 restart, ~25h) | src/conductor.js | The autonomous VPS conductor. Boots osSessionService, forkService, perception, proactivity, scheduler, heartbeat. Writes os_conversation (40 turns/24h). |
| voice-call | online (35 restarts) | scripts/voice-call-server.js | Twilio "call Ecodia" pipeline. Requires voiceCallService -> entityIndex. |
| ecodia-meetings | online | src/meetingsServer.js | Meeting live transcription. |

**NOT running** (their exclusive code is dead at runtime): ecodia-factory (factoryRunner), ecodia-rescue (rescueRunner), ecodia-observer-watchdog (observerWatchdog), corazon-watchdog, and the commented workers (gmailPoller, linkedinWorker, financePoller, kgEmbeddingWorker, kgConsolidationWorker). Caveat: factoryRunner/rescueRunner subtrees are still `require()`d at boot by the LIVE `ecodia-api` (factoryBridge + rescueService subscribers), so they are ENTANGLED, not clean orphans.

### Cowork MCP gateway - alive, but as Routine hands not a conductor surface

771 audited calls in 7d, most recent 11 min before the probe. Tool breakdown:

| tool | calls/7d | last | verdict |
|---|---|---|---|
| kv_store.set | 263 | yesterday | live (Routine substrate write) |
| neo4j.write_episode | 217 | today | live |
| status_board.upsert | 213 | today | live |
| neo4j.write_decision | 23 | today | live |
| os_session.message | 19 | 2d ago | **dead-letter** - `mode:queue` accepted into a queue nothing drains |
| forks.spawn | 18 | 6d ago | cold |
| scheduler.delayed | 12 | today | live |
| sms.tate | 7 | 3d ago | live |

### osSessionService reality

- `os_session_messages` table: 527 rows total, **frozen since 2026-05-14** (15 days). This is the dead admin-frontend chat surface Tate remembers.
- `osSessionService` the module: **alive** - required by `conductor.js` (live) + `voiceRelay.js` (live voice-call) and writes `os_conversation` (40 turns/24h). It is the brain for voice, native, and the autonomous loop. Tate's own seat moved off it to local Claude Code.
- Grey-zone per Tate: keep the module. The deprecation to carve is the `os_session.message` queue-relay plus the old `os_session_messages` route. The service itself stays.

---

## 1. Methodology - deterministic require-graph reachability

Tool: `drafts/reachability-probe-2026-05-29.js` (static `require('relative')` graph BFS from the 4 live PM2 entry points, with the 3 known dynamic-registry loaders encoded as explicit edges: `capabilities/index.js` domain loop, `listeners/registry.js` LISTENER_FILES allow-list, `server.js` observer-array + inlineWorkers).

A file is ALIVE iff reachable from a running process. Everything else is orphan (loaded by nobody) or dead-process-only (loaded only by a not-running process). Basename greps were treated as supplementary only (they collide on common words like "digest"/"producer"); the reachability bucket is the reliable signal, exact-path require matching is used per-file.

### Counts (383 non-test .js under src/)

| bucket | count |
|---|---|
| alive (reachable from a running process) | 337 |
| dead-process-only | 9 |
| orphan (reachable from no process) | 37 |
| dynamic-require uncertain | 0 |

Dynamic-loader correction mattered: the first naive pass reported 75 orphans; encoding the capability/listener/observer dynamic loads + the voice-call root dropped 38 false orphans (e.g. calendarService looked orphan only because its real consumer `capabilities/calendar.js` is dynamic-loaded; voiceCallService/entityIndex looked orphan only because the voice-call entry lives in scripts/).

---

## 2. Per-file verdicts

Method: reachability bucket (no live require) + reverse-dependency analysis (confirmed `ALIVE_REQUIRER_PRESENT = []`, so no orphan is reached by any live file) + git churn (built-once vs iterated-then-unwired vs recent) + `os_scheduled_tasks` check for scheduler-spawned crons + header read. The adversarial workflow wf_b0245c9f-265 was interrupted by a session resume (7/46 agents, none journaled), so verdicts were finished deterministically.

### DELETE NOW (4) - unambiguous dead, zero live consumer, reversible on branch

| file | why dead | evidence |
|---|---|---|
| services/directActionService.js | superseded "organism fast-path"; capabilities/ registry replaced it | orphan; 8 commits then fully unwired; no capability requires it; CLAUDE.md "directAction picks it up" is stale |
| services/integrationScaffoldService.js | Factory scaffolding helper; Factory is dead (ecodia-factory not running) | orphan; header "so the Factory can scaffold integrations"; 7 commits then unwired |
| services/playwrightTestService.js | E2E runner "on behalf of CC sessions" (Factory); Factory dead | orphan; spawns npx playwright for dead CC-session path |
| utils/dateHelpers.js | pure date util, superseded | orphan; nobody requires; oldest file (2026-04-01); 1 commit |

### KEEP (alive via a non-require surface)

- **CLI / npm**: db/migrate.js (npm run migrate), scripts/kgBackfill.js (npm run kg:backfill), scripts/mcp-tool-registry-regen.js, scripts/register-connector-oauth-clients.js.
- **Spawn / DIRECT_EXEC telemetry**: services/telemetry/perfEventConsumer.js, services/telemetry/failureClassifier.js (spawnSync, test-backed).
- **Live scheduler task shares the name** (verify the task prompt does not shell out to the .js before any future deletion): cron/coexistSyncHealth.js (task `coexist-sync-health`, running), scripts/peerMonitor.js + services/peerMonitor.js re-export (task `peer-monitor`, active).

### DOCUMENT - do NOT delete this pass (option-3 scope)

- **Recent in-progress (committed >= 2026-05-22, built-not-yet-wired)**: services/outcomeVerificationService.js (autonomy-spec chokepoint, test-backed), services/xeroReconcileService.js (Xero went live 2026-05-28), services/failureEscalateService.js + services/corazonWatchdog.js (dead-process bucket, recent).
- **Recent-arc single-commit cohort (2026-05-18, never wired, may be intended)**: calendarConflictGate, clientPulseService, clientStaleDetectorService, dossierFreshnessService, inboundEmailFilter.
- **Built-but-PR-to-wire-never-landed (intended infra)**: tokenBudget (prompt-assembly allocator), taskLease + lib/withTaskLease (multi-brain arbitration), lib/forkBisect (fork debug; forkService alive on VPS), billingScheduleEngine (finance-adjacent), meetingEditorService (meetings process alive).
- **Routine-referenced**: marketingArtifactStore + marketingCadenceMonitorService (marketing routines), factoryDispatch (factory routines).
- **PENDING TATE DECISION**: services/phaseG/{digest,producer}.js - status_board P1 row 1ca64be0 "MIGRATE OR RETIRE". 0 git commits (uncommitted on disk). Not mine to delete.
- **approvalQueueDecay island** (self-contained orphans): db/cron/{approvalQueueDecay,approvalQueueReconciler,observationRetention}.js + services/approvalQueueDecay.js. Verify no system-crontab / pg_cron invokes the db/cron scripts before deletion.
- **workers/{calendarPoller,codebaseIndexWorker}.js**: commented-out in server.js inlineWorkers, kept as "reference surface" per the server.js comment.

### ENTANGLED dead-process clusters - kill-plan, NOT delete (require server.js surgery + coordinated VPS restart)

The 9 dead-process-only files are require()d at boot by the LIVE ecodia-api. Deleting any without first removing the boot/subscribe call breaks the gateway at next restart.

- **Factory cluster**: workers/factoryRunner.js, db/queries/ccSessions.js, services/factoryDispatch.js, services/factoryBridge.js (alive-side subscriber in server.js), services/factoryOversightService.js. Kill-plan: remove the factoryBridge.subscribeMany block in server.js (lines ~256-348) + the SESSION_COMPLETE handler's osSession call, then rm the cluster, then coordinated VPS restart.
- **Rescue cluster**: rescue/rescueRunner.js + services/rescueService.js boot in server.js (~595). Kill-plan: remove the rescueService.start() block, then rm.
- **Watchdog/worker**: workers/observerWatchdog.js (process not running), workers/{financePoller,kgConsolidationWorker,kgEmbeddingWorker}.js (commented PM2 entries). Low-risk rm but observerWatchdog watches live observers, so confirm the supervision is genuinely abandoned first.

---

## 3. Deletion executed / branch

Branch: `chore/nuke-dead-conductor-substrate-2026-05-29` (off main, NOT merged, NOT pulled on VPS).
Deleted (4): directActionService.js, integrationScaffoldService.js, playwrightTestService.js, dateHelpers.js.
Verification after deletion: reachability probe re-run shows the orphan count drop by 4 with zero new broken require edges (nothing imported the deleted files). Branch SHA recorded in the deletion commit.

Conductor (Tate) review gate: approve the 4-file deletion merge, and decide which of the DOCUMENT set graduate to deletion (esp. the 2026-05-18 cohort and Phase G migrate-or-retire).

---

## Appendix: the 46 candidates (pre-verdict)

37 orphan: cron/coexistSyncHealth, db/cron/{approvalQueueDecay,approvalQueueReconciler,observationRetention}, db/migrate, lib/{forkBisect,withTaskLease}, scripts/{kgBackfill,mcp-tool-registry-regen,peerMonitor,register-connector-oauth-clients}, services/{approvalQueueDecay,billingScheduleEngine,calendarConflictGate,clientPulseService,clientStaleDetectorService,directActionService,dossierFreshnessService,factoryDispatch,inboundEmailFilter,integrationScaffoldService,marketingArtifactStore,marketingCadenceMonitorService,meetingEditorService,outcomeVerificationService,peerMonitor,playwrightTestService,taskLease,tokenBudget,xeroReconcileService}, services/phaseG/{digest,producer}, services/telemetry/{failureClassifier,perfEventConsumer}, utils/dateHelpers, workers/{calendarPoller,codebaseIndexWorker}.

9 dead-process-only: db/queries/ccSessions, rescue/rescueRunner, services/corazonWatchdog, services/failureEscalateService, workers/{factoryRunner,financePoller,kgConsolidationWorker,kgEmbeddingWorker,observerWatchdog}.
