# VPS Service Audit - 2026-05-15

**Lane:** Phase 2 / 05 (VPS Substrate-Only Redesign + Service Tear-Down).
**Author:** EcodiaOS-on-Corazon under Tate's full-autonomy mandate, gated on destructive steps.
**cowork_session_id:** `phase2-05-vps-redesign-2026-05-15`.
**Safety tag:** `pre-migration-cutover-2026-05-15` at commit `ae1c463e5ed916340da6dd3b0ccbcb24f7778310`.
**DR snapshot:** `D:/.code/migration-snapshots/2026-05-15/` (Lane A, manifest verified).

This audit is the input to `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md` and the gated tear-down sequence.

---

## 1. Dossier-vs-reality reconciliation

The lane dossier (`migration-lanes/phase2/05-vps-substrate-redesign.md`) names 5 PM2 services. The live VPS state has **6 PM2 services**. Two architectural changes shipped between the dossier authorship and audit time:

1. **`ecodia-observer-watchdog`** added 2026-05-13 (Observer Framework v2). Independent failure-domain watchdog. ~5MB resident, ~10s probe interval. Probes `ecodia-api` (3001/api/health) + `ecodia-conductor` (3002/health). Writes P1 `observer_signals` rows + optional SMS to Tate on persistent unreach. Was never a tear-down candidate; flag here so tear-down does not accidentally stop it.
2. **Phase 3 conductor-detached activation** shipped 2026-05-12 (`fork_mp1wwwl0_6d2263`). `CONDUCTOR_DETACHED=true` on `ecodia-api` + `CONDUCTOR_OWNS_WORKERS=true` on `ecodia-conductor` mean **the conductor process now owns**: SDK stream (osSessionService), scheduler poller, os-session message queue sweeper, OS heartbeat, Claude token refresh, nightly restart, claim verifier, proactivity engine, listener subsystem, fork dispatch surface. `ecodia-api` proxies session calls to 127.0.0.1:3002 loopback. **Implication:** the four "deprecated" services in the original Phase 1 dossier (`forkService`, `osSessionService`, `schedulerPollerService`, `cronForkDispatcher`) are now load-bearing modules INSIDE `ecodia-conductor`, not their own PM2 processes. Tear-down is at the file-and-module level inside conductor, then `pm2 delete ecodia-conductor` itself, in that order.

The dossier's `voiceRelay.js` is also stale: there is no `src/services/voiceRelay.js`. The voice path is now `src/services/deepgramVoiceService.js` + `voiceBuffer.js` + `voiceTranscription.js` + `meetingsLiveTranscription.js`, plus `src/routes/voiceRelay.js` (HTTP route, not service). Voice is the Deepgram realtime engine shipped 2026-05-12 (`[[project_voice_engine_may2026]]`). **Voice is a kept feature, not a tear-down target.**

---

## 2. Live PM2 inventory (probed 2026-05-15)

| # | Service | Status | Mem MB | CPU % | Restarts | Uptime h | Created | Script | Disposition (preview) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `ecodia-api` | online | 196.1 | 1.2 | 27 | 1.04 | 2026-05-15T04:04Z | `src/server.js` | **KEEP**: HTTP routes, MCP endpoints (`/api/mcp/ecodia`, `/api/mcp/ecodia-full`, `/api/mcp/cowork` alias), webhook ingress, WebSocket server, capability registry, OAuth wrapper. Slim further by routing osSession traffic to Corazon-conductor instead of 3002 loopback. |
| 2 | `ecodia-conductor` | online | 151.2 | 0.3 | 30 | 7.87 | 2026-05-14T05:53Z | `src/conductor.js` | **TEAR DOWN** (post-cutover). Currently the SDK stream owner, scheduler poller, message queue sweeper, OS heartbeat, Claude token refresh, nightly restart, claim verifier, proactivity engine, listener subsystem, fork dispatch. The post-migration vision is for the conductor to live on Corazon (interactive) + Anthropic Routines (cloud), not on the VPS. |
| 3 | `ecodia-factory` | online | 52.6 | 0.3 | 14 | 28.50 | 2026-05-14T00:36Z | `src/workers/factoryRunner.js` | **TEAR DOWN** (post-Factory-routine confirmation). Per `[[project_factory_symbiosis]]` Factory was migrated to dispatch-via-Routine; this PM2 process is the legacy CC-session worker pool. Confirm Factory-routine is live and proven before stopping. |
| 4 | `ecodia-meetings` | online | 42.6 | 0.2 | 9 | 28.50 | 2026-05-14T00:36Z | `src/meetingsServer.js` | **KEEP**: Twilio + Deepgram realtime voice, `/api/meetings/*` ingress on 3003. Decoupled from api so api restarts do not drop in-flight chunk uploads. |
| 5 | `ecodia-rescue` | online | 28.0 | 0.2 | 15 | 28.50 | 2026-05-14T00:36Z | `src/rescue/rescueRunner.js` | **TEAR DOWN OR REPURPOSE** (decision deferred to disposition matrix). Was the always-alive narrow CC session that survives `ecodia-api` wedging. Post-migration the equivalent is "ssh into VPS and run claude," so the always-on cost is questionable. Keep as smallest carve-out only if the SMS-to-rescue bridge has live consumers; otherwise delete. |
| 6 | `ecodia-observer-watchdog` | online | (added post-list) | - | - | - | 2026-05-13 | `src/workers/observerWatchdog.js` | **KEEP**: independent failure-domain probe of ecodia-api + ecodia-conductor health. Post-tear-down it shrinks to probing `ecodia-api` only (and possibly `ecodia-meetings`). Tiny footprint (~5MB), tiny dependency surface. Carve-out winner. |

**Total RSS pre-tear-down:** 470.5 MB (vs dossier target <250 MB post). Disk: 32GB used of 48GB on `/dev/vda1` (67%); `node_modules` 1.1G + repo 660M.

---

## 3. Per-service primitive map

For each tear-down candidate, the primitives within and the load-bearing consumers. Disposition decisions move into `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md`; this section is descriptive.

### 3.1 `src/services/osSessionService.js` (4464 LOC, exports 21 functions)

Loaded by `ecodia-conductor` since 2026-05-12 (Phase 3). Previously loaded by `ecodia-api`.

**Public exports:** `sendMessage, getStatus, restart, getHistory, compact, getTokenUsage, recoverResponse, getMessagesSinceTimestamp, autoHandover, abort, buildCustomSystemPrompt, currentDbSessionId, currentTurnId, _isQueueBusy, _abortActiveQuery, _getAbortGraceTimerForTest, _isAbortInProgressForTest, _setActiveAbortForTest, _setActiveQueryForTest, _resetAbortStateForTest`.

**Primitives within:**
- **P-OS-1:** Turn engine (Agent SDK `query()` stream wrapper, send queue, abort controller, autoHandover/compact, recoverResponse).
- **P-OS-2:** Provider chain integration (`usageEnergyService.getBestProvider()` switching across Claude Max accounts + DeepSeek fallback).
- **P-OS-3:** Conversation log writer (`os_conv_log` rows + `osConversationLog` service).
- **P-OS-4:** Message queue consumer hook (drains `messageQueue.js` between SDK turns).
- **P-OS-5:** Custom system prompt builder (`buildCustomSystemPrompt`, the prompt-assembler entry point used by both production and `__tests__/promptAssembler.parity.test.js`).
- **P-OS-6:** WebSocket broadcast bridge (`flushDeltasForTurnComplete`, `resetSessionSeq`).
- **P-OS-7:** Test-only abort/state hooks (`_setActive*`, `_reset*`).

**Consumer surface (16 importers):** `src/conductor.js`, `src/workers/cacheKeepaliveWorker.js`, `src/services/osHeartbeatService.js`, `src/services/listeners/registry.js`, `src/services/messageQueue.js`, `src/services/observerMcpTool.js`, `src/services/nightlyRestartService.js`, `src/services/scratchpadTool.js`, `src/services/schedulerPollerService.js`, `src/routes/voiceRelay.js`, `src/routes/osSession.js`, `src/routes/mcp/cowork.js`, `src/routes/triage.js`, `src/routes/smsWebhook.js`, `src/server.js`, plus `__tests__/promptAssembler.parity.test.js`.

**Git history:** First touched 2026-04-06, last touched 2026-05-14 (`6ce1fd8`). Heavy change cadence.

### 3.2 `src/services/forkService.js` (2058 LOC)

**Primitives within:**
- **P-FK-1:** SDK spawn wrapper (Agent SDK `query()` per fork, separate AbortController, separate ccSessionId, separate provider env).
- **P-FK-2:** Fork registry + fork-tree depth cap (`tryReserveForkSlot` from `lib/forkCapAtomic`).
- **P-FK-3:** `[FORK_REPORT]` parser + finalizer (delegates to `forkFinalizer.js`).
- **P-FK-4:** Working_set close-on-complete hook.
- **P-FK-5:** Fork worktree integration (`lib/forkWorktree`).
- **P-FK-6:** `recoverStaleForks` (auto-recovery of forks killed by api/conductor `max_memory_restart`).

**Consumer surface (13 importers):** `src/conductor.js`, `src/services/cronForkDispatcher.js`, `src/services/listeners/dispatchQueueListener.js`, `src/services/forkConductorTool.js`, `src/services/osSessionService.js`, `src/services/nightlyRestartService.js`, `src/routes/osSession.js`, `src/routes/mcp/cowork.js`, `src/server.js`, plus 4 test files.

**Git history:** First touched 2026-04-27, last touched 2026-05-14 (`98cf293` synthesise [FORK_REPORT] from final assistant turn).

### 3.3 `src/services/schedulerPollerService.js` (512 LOC, exports `start, stop, fireTask`)

**Primitives within:**
- **P-SP-1:** Cron parser (next-fire calculation off `os_scheduled_tasks.cron`).
- **P-SP-2:** Cron classifier (delegates to `config/cronPriority.js`: direct-exec vs Routine vs deleted).
- **P-SP-3:** Poll loop (30s interval).
- **P-SP-4:** Fire dispatcher (decides: direct-exec via `spawnSync` for telemetry consumers / kg-embedding / nightly-restart, vs `cronForkDispatcher.maybeDispatch` for refactor-eligible crons, vs `osSessionService.sendMessage` legacy).

**Consumer surface (2 importers):** `src/conductor.js`, `src/server.js`. Narrow.

**Git history:** First touched 2026-04-08, last touched 2026-05-12 (`a5a7079` move telemetry consumers to direct-exec).

### 3.4 `src/services/cronForkDispatcher.js` (815 LOC)

**Primitives within:**
- **P-CFD-1:** Cron-to-fork brief composer (reads `os_scheduled_tasks.prompt`).
- **P-CFD-2:** Daily fork budget circuit-breaker (`kv_store.cowork.daily_fork_budget_remaining`).
- **P-CFD-3:** Account-chain anti-flood gate (added 2026-05-12, `6f62dde`).
- **P-CFD-4:** Telemetry instrumentation hooks (Phase D + Phase E H1-A, May 11).

**Consumer surface (1 importer + 1 test):** `src/services/schedulerPollerService.js`. Narrowest of all candidates.

### 3.5 `src/services/perceptionDispatcher.js` (627 LOC) + `src/services/perceptionBus.js` (350 LOC)

**Reframe vs dossier:** the dossier flagged "perceptionDispatcher subscriber bus" as a primitive worth preserving. Reality: `perceptionBus`/`perceptionDispatcher` is the **universal perception dispatcher** shipped 2026-05-12 (`[[project_perception_dispatcher_may2026]]`) - zero-token-cost domain reactions serving all streams via one in-process subscriber. **It is load-bearing infrastructure, not a tear-down candidate.**

**Primitives within `perceptionBus`:**
- **P-PB-1:** Pub/sub event ring (publish + subscribe, in-process EventEmitter-style).
- **P-PB-2:** Auto-start dispatcher on first publish.
- **P-PB-3:** Per-matcher dedupe + Promise.all parallelism + rate cap + pre-tokenise.

**Primitives within `perceptionDispatcher`:**
- **P-PD-1:** Matcher loader (loads everything in `src/services/matchers/`).
- **P-PD-2:** Domain reaction execution (regex + DB lookups, no LLM calls).
- **P-PD-3:** Dedupe window (5min per event pattern).
- **P-PD-4:** Fire-and-forget dispatch (failures never block publishing).

**Consumer surface (20+ importers):** `fsWatcher`, `meetingsLiveTranscription`, 6 listeners, 2 observers, `securityIncidentResponse`, `osSessionService`, `forkService`, all matchers in `src/services/matchers/`. Pulling this apart breaks the entire ambient-intelligence layer.

### 3.6 `src/services/messageQueue.js` (351 LOC)

**Reframe vs dossier:** the dossier listed "message_queue" as a primitive worth preserving from osSessionService. Reality: `messageQueue` is its own service file, was always its own thing, and is the **inbox between Tate (or any external caller: SMS, voice, triage routes, factory completion notices) and the OS**.

**Primitives within:**
- **P-MQ-1:** Append (`enqueue`).
- **P-MQ-2:** Drain (`drainBetweenTurns`, called by `osSessionService` between SDK turns).
- **P-MQ-3:** Peek vs consume separation (added 2026-04-27, `5e97945`).
- **P-MQ-4:** Fork-report intro labelling (added 2026-04-28, `4a34fb6`).

**Consumer surface (10 importers):** `src/app.js`, `src/conductor.js`, `src/services/listeners/forkComplete.js`, `src/services/osSessionService.js`, `src/services/forkService.js`, `src/routes/osSession.js`, `src/routes/messageQueue.js`, `src/routes/mcp/cowork.js`, `src/server.js`. **Plus the still-deployed `src/app.js.bak-lane-e-1778774624` and `src/app.js.bak.lane-d-2026-05-15` - clean these up in tear-down.**

### 3.7 Other services worth flagging (not deletion candidates but state-coupled)

- **`src/services/forkConductorTool.js` (306 LOC):** the conductor's tool exposing `fork.spawn` to itself via the SDK MCP. Disappears with `forkService.js` deletion.
- **`src/services/osHeartbeatService.js` (407 LOC):** OS-level heartbeat (separate from cowork heartbeat). Owner of `os_heartbeats` rows. May be relocatable to a Routine.
- **`src/services/nightlyRestartService.js` (245 LOC):** orchestrates the daily 03:00 AEST restart. Writes `osSessionService.compact()` + restart sequencing. Direct-exec cron from `cronPriority.DIRECT_EXEC_COMMANDS`. Surviving past cutover under "KEEP-DIRECT-EXEC" per the master architecture doc.
- **`src/services/observerSignalsService.js` (576 LOC):** the substrate for `observer_signals` table. Added 2026-05-13 with the "interventions to observer_signals substrate (no chat pollution)" refactor. KEEP - this is the substrate read by `ecodia-observer-watchdog` and the corazon-side observer-signals hook.
- **`src/services/listeners/*` (12 listeners):** all consume `perceptionBus`. KEEP as a unit.
- **`src/services/observers/*` (10 observers, _haikuClient.js + _observerBase.js):** ambient meta-cognition observers. KEEP.
- **`src/services/matchers/*`:** perceptionBus matchers. KEEP.

---

## 4. Em-dash drift in tear-down candidates

Per the May 6 sweep, em-dashes were supposed to be expunged. Re-probe: 5 of the 7 candidate files still contain em-dashes (`osSessionService`, `forkService`, `schedulerPollerService`, `perceptionDispatcher`, `perceptionBus`). This is non-blocking for tear-down (deleted code does not need to be em-dash clean), but flag for the post-cutover wave: any primitive that survives a MOVE-to-Corazon disposition gets re-authored, which is the natural moment to enforce em-dash cleanliness.

---

## 5. Open questions surfaced by the audit

1. **`src/app.js.bak.lane-d-2026-05-15` and `src/app.js.bak-lane-e-1778774624`** still exist in the live tree. Lane D and E completed and these `.bak` files are now noise. Delete in the file-cleanup phase of tear-down.
2. **`ecodia-rescue` decision:** is the SMS-to-rescue bridge (`src/services/rescueBridge.js`) actually used? If yes, rescue stays as the smallest possible survivor. If no, delete. Resolve in the disposition matrix.
3. **`ecodia-conductor` proxies session calls from `ecodia-api`** via 127.0.0.1:3002 loopback. Once the conductor lives on Corazon, what does `ecodia-api` do with `/api/os-session/message` POSTs from external (SMS, voice, triage)? Two options: (a) the route returns a 410 Gone redirect to a new ingress endpoint that wakes the Corazon conductor via a Routine `/fire`; (b) the route POSTs to `messageQueue.enqueue` and a Corazon-side poll-and-drain process picks it up. **Decision deferred to disposition matrix.**
4. **VPS plan tier:** with memory <250MB and disk well below 32GB, the DigitalOcean droplet can shrink. Estimate post-tear-down on the smallest plan that comfortably hosts Postgres-NOT (Supabase is cloud), Neo4j-NOT (Aura is cloud), Express + Deepgram audio + watchdog.

---

## 6. Audit completion attestation

This audit was probed live against `tate@100.103.227.90` (Tailscale) on 2026-05-15. Source files were read on the VPS (not from the Corazon mirror) to ensure currency. PM2 state, ecosystem.config.js, git history, and consumer-surface greps were all run on the VPS at audit time. The dossier-vs-reality reconciliation in section 1 is the most important output: the disposition matrix and tear-down sequence both depend on it.

**Next deliverable:** `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md`.
