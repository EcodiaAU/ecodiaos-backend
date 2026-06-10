# VPS Primitive Disposition Matrix - 2026-05-15

**Lane:** Phase 2 / 05.
**Input:** `VPS_SERVICE_AUDIT_2026-05-15.md`.
**Output:** every named primitive has a disposition. No "TBD" rows. The tear-down sequence in `VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` reads from this.

**Disposition legend:**
- **KEEP-VPS:** load-bearing for the slimmed substrate role; stays on `/dev/vda1` post-cutover.
- **MOVE-CORAZON:** becomes a local Node/Python process, Claude Code skill, hook, or scheduled task on Tate's Windows laptop (`100.114.219.69`).
- **MOVE-MACMINI:** moves to the Mac mini once procured. Until then carry on KEEP-VPS or MOVE-CORAZON as the holding pattern (column "Holding pattern" carries the bridge plan).
- **REPLACE-ANTHROPIC:** replaced by an Anthropic-managed primitive (Routine, Task subagent, `/loop`, `ScheduleWakeup`, hook, native MCP).
- **DELETE:** obsolete, no surviving consumer worth preserving the primitive for.

---

## 1. PM2-process-level dispositions

| # | PM2 service | Disposition | Replacement / new home | Notes |
|---|---|---|---|---|
| 1 | `ecodia-api` | **KEEP-VPS** | n/a | Express HTTP entry point. Slim further by removing osSession proxy to 3002 once conductor is gone. |
| 2 | `ecodia-conductor` | **REPLACE-ANTHROPIC** | Corazon Claude Code (interactive) + Anthropic Routines (scheduled) | The whole reason for the migration. Stop after every primitive inside it has its own disposition cleared. |
| 3 | `ecodia-factory` | **REPLACE-ANTHROPIC** | `factory-cloud` Routine on a dedicated account + local Task subagents for short tasks | Already migrated per `[[project_factory_symbiosis]]`; this PM2 is the legacy worker pool. Stop after Factory Routine is verified to handle one full code-shipping cycle. |
| 4 | `ecodia-meetings` | **KEEP-VPS** | n/a | Twilio Media Streams + Deepgram realtime cannot bridge through Anthropic. Voice ingress must terminate at a public-Internet endpoint - that is the VPS. |
| 5 | `ecodia-rescue` | **DELETE** | "ssh tate@vps && claude" replaces it | rescueBridge uses Redis pub/sub. Post-cutover the conductor lives on Corazon; if Corazon is unreachable, Tate ssh'es into the VPS and runs `claude` interactively. The always-on rescue process burns 28MB for an extremely rare path. Confirm no live rescue invocation in the last 30 days before stop, then delete. |
| 6 | `ecodia-observer-watchdog` | **KEEP-VPS** | n/a | Independent failure-domain probe. Tiny (~5MB). Post-tear-down probe target shrinks from 2 services to 1 (just `ecodia-api`); env vars updated, watchdog restarted. |

**Post-tear-down PM2 list:** `ecodia-api`, `ecodia-meetings`, `ecodia-observer-watchdog`. Three processes. Estimated total memory: ~250 MB (api 196 + meetings 43 + watchdog ~5 + headroom).

---

## 2. Primitive-level dispositions

### 2.1 `osSessionService.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-OS-1 | Turn engine (SDK `query()` stream wrapper, send queue, abort, autoHandover) | **REPLACE-ANTHROPIC** | Local Claude Code session on Corazon (interactive turns) + Routines (scheduled turns) | The Agent SDK `query()` is exactly what Claude Code-CLI runs internally. The whole primitive is subsumed. |
| P-OS-2 | Provider chain integration (`usageEnergyService.getBestProvider()`) | **MOVE-CORAZON** (read-only) + **DELETE** the switching | Local CC uses Tate's logged-in account routing | Provider switching is now Anthropic's job inside CC. The energy-budget tracking primitive (`usageEnergyService`) survives as a status_board surface; the switching code dies. |
| P-OS-3 | Conversation log writer (`os_conv_log` rows) | **KEEP-VPS** (substrate) + **MOVE-CORAZON** (writer) | Corazon-side writer hooks (PostToolUse hook authoring `os_conv_log` via the ecodia MCP) | The table stays in Postgres. The writer code moves to a Corazon hook. Conductor-on-Corazon writes turn rows via the `ecodia` MCP `kv_store.upsert` or a new `os_conv_log.append` MCP tool. Add the tool to `/api/mcp/ecodia-full` if absent. |
| P-OS-4 | Message queue consumer hook (drains `messageQueue` between SDK turns) | **MOVE-CORAZON** | Corazon-side `/loop` task that polls `messageQueue` via MCP between user turns | A Stop hook (settings.json) drains pending messages and prepends them to the next user turn, OR a `/loop` running every 30s via `ScheduleWakeup`. |
| P-OS-5 | Custom system prompt builder (`buildCustomSystemPrompt`) | **MOVE-CORAZON** | `D:/.code/EcodiaOS/backend/CLAUDE.md` + `.claude/SELF.md` + skill loading already provide this on Corazon | The prompt-assembler lives on disk on Corazon. The legacy prompt-assembler tests stay green by importing from the Corazon-side module. Move file from `src/services/promptAssembler.js` to `corazon-conductor/promptAssembler.js` (carve out a small Corazon-side package), keep the parity test alive. |
| P-OS-6 | WebSocket broadcast bridge | **DELETE** | n/a | Frontend at admin.ecodia.au is being slimmed to visualisation-only per the master architecture doc; the WS broadcast layer for OS turns is dead. Visualisation re-reads from Postgres on poll. |
| P-OS-7 | Test-only abort/state hooks | **DELETE** | n/a | Move-with-deletion: tests update to use the Corazon-side equivalent. |

### 2.2 `forkService.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-FK-1 | SDK spawn wrapper (separate AbortController, ccSessionId, provider env per fork) | **REPLACE-ANTHROPIC** | Claude Code Task subagents (local, on Corazon) + Routines (cloud, on Anthropic) | Task tool gives true parallelism without a hand-rolled SDK loop. |
| P-FK-2 | Fork registry + tree-depth cap | **DELETE** | Task subagent invocations are tracked in conversation transcript; cap is enforced by the conductor's judgement (not a separate registry table) | The `os_forks` table can stay as a historical archive; new rows stop appearing post-cutover. |
| P-FK-3 | `[FORK_REPORT]` parser + finalizer | **DELETE** | Task subagent return value is the final assistant text - parse-on-completion replaced by Anthropic-native return-value semantics. | |
| P-FK-4 | Working_set close-on-complete hook | **MOVE-CORAZON** | Corazon-side Stop hook closes any working_set rows opened during the conductor turn | Same WS table on the substrate, different writer. |
| P-FK-5 | Fork worktree integration (`lib/forkWorktree`) | **MOVE-CORAZON** | Local git worktree management (Corazon already has filesystem access to the repo); Task subagents work in-tree | Worktree primitive itself becomes a small Corazon-side helper if a parallel-edit path is wanted; otherwise DELETE. |
| P-FK-6 | `recoverStaleForks` | **DELETE** | No PM2 max_memory_restart on the conductor process means no stale forks; Task subagents either return or are visibly aborted | The `os_forks` table cleanup script can stay as a one-shot `delete-stale-forks.sql` for the historical tail. |

### 2.3 `schedulerPollerService.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-SP-1 | Cron parser (next-fire calc) | **DELETE** | Anthropic Routines and Corazon Windows Task Scheduler both own their own scheduling | The `os_scheduled_tasks` table can stay as historical record (most rows are obsolete) but the parser is dead. |
| P-SP-2 | Cron classifier (direct-exec / Routine / deleted) | **DELETE** | Direct-exec crons listed in `config/cronPriority.DIRECT_EXEC_COMMANDS` move to KEEP-VPS via systemd timers | See section 2.6. |
| P-SP-3 | Poll loop (30s) | **DELETE** | n/a | |
| P-SP-4 | Fire dispatcher (direct-exec vs cronForkDispatcher vs osSession.sendMessage) | **DELETE** | n/a | All three paths replaced. |

### 2.4 `cronForkDispatcher.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-CFD-1 | Cron-to-fork brief composer | **DELETE** | Routine prompts are self-contained; no runtime composition needed | |
| P-CFD-2 | Daily fork budget circuit-breaker | **DELETE** | Anthropic enforces account-level usage caps natively; the kv_store budget row becomes a stale artifact | Drop `kv_store.cowork.daily_fork_budget_remaining` row in cleanup. |
| P-CFD-3 | Account-chain anti-flood gate | **DELETE** | n/a | Same reason as P-CFD-2. |
| P-CFD-4 | Telemetry instrumentation hooks | **MOVE-CORAZON** (selective) | Corazon-side observer-signals hook records Routine fire events directly | Only the few signals that survive (Routine dispatched, Routine returned, Routine errored). |

### 2.5 `perceptionDispatcher.js` + `perceptionBus.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-PB-1 | Pub/sub event ring | **KEEP-VPS** | n/a | Lives in `ecodia-api` post-cutover (move from conductor to api). Mid-tear-down step. |
| P-PB-2 | Auto-start on first publish | **KEEP-VPS** | n/a | |
| P-PB-3 | Per-matcher dedupe + rate cap | **KEEP-VPS** | n/a | |
| P-PD-1 | Matcher loader | **KEEP-VPS** | n/a | All matchers in `src/services/matchers/*` stay loaded by api. |
| P-PD-2 | Domain reaction execution (regex + DB lookups) | **KEEP-VPS** | n/a | Zero token cost; ideal for API substrate. |
| P-PD-3 | 5-min dedupe window | **KEEP-VPS** | n/a | |
| P-PD-4 | Fire-and-forget dispatch | **KEEP-VPS** | n/a | |

**Implementation note:** `perceptionBus`/`perceptionDispatcher` migration from `ecodia-conductor` to `ecodia-api` is a one-line change in `src/server.js` (require + start) plus removing the require from `src/conductor.js`. Verify all listeners and matchers still subscribe correctly post-move.

### 2.6 `messageQueue.js` primitives

| ID | Primitive | Disposition | Replacement | Notes |
|---|---|---|---|---|
| P-MQ-1 | Append (`enqueue`) | **KEEP-VPS** | n/a | Lives in `ecodia-api`. SMS webhook, voice triage, and any other external-input route enqueue here. |
| P-MQ-2 | Drain (`drainBetweenTurns`) | **MOVE-CORAZON** | Corazon-side poll-and-drain `/loop` (every 30s via `ScheduleWakeup`) OR Stop hook drain at session-end | Corazon polls the queue, prepends pending messages to the next user turn, marks consumed. |
| P-MQ-3 | Peek vs consume separation | **KEEP-VPS** | n/a | Stays in the `messageQueue.js` file inside ecodia-api. |
| P-MQ-4 | Fork-report intro labelling | **DELETE** | No more SDK-spawned forks | |

### 2.7 Other affected services

| Service | Disposition | Replacement | Notes |
|---|---|---|---|
| `forkConductorTool.js` | **DELETE** | Task subagents (no separate tool wrapper) | |
| `osHeartbeatService.js` | **REPLACE-ANTHROPIC** | `system-health` Routine (every 4h) writes `os_heartbeats` row directly via MCP | The cowork bearer already exposes the writer scope. |
| `nightlyRestartService.js` | **MOVE-VPS-systemd** (KEEP-VPS in a different shell) | systemd timer `ecodia-nightly-restart.timer` runs `pm2 restart ecodia-api ecodia-meetings ecodia-observer-watchdog` at 03:00 AEST | Strip the `osSessionService.compact()` call (no conductor to compact). |
| `observerSignalsService.js` | **KEEP-VPS** | n/a | Substrate writer. The `observer_signals` table is read by both watchdog and Corazon hooks. |
| `proactivityEngine.js` | **REPLACE-ANTHROPIC** | `meta-loop` Routine (hourly) + Corazon Stop hook | The proactive scan moves to a 1h Routine that surfaces P1 status_board rows or SMS Tate. |
| `claudeTokenRefreshService.js` | **DELETE** | Long-lived 1-year `claude setup-token` tokens (per `[[project_claude_long_lived_tokens_apr2026]]`) make per-hour refresh obsolete | Confirm the long-lived tokens are alive on all three Max accounts before deleting. |
| `claimVerifierWorker.js` (workers/) | **REPLACE-ANTHROPIC** | `claim-verifier` Routine (hourly or every 30 min) | Re-author the claim-verifier as a Routine prompt with the same logic. |
| `cacheKeepaliveWorker.js` | **DELETE** | No conductor to keepalive | The worker exists to ping `osSessionService.getStatus()` so the SDK does not auto-disconnect. Without conductor, no need. |
| `autonomousMaintenanceWorker.js` | **REPLACE-ANTHROPIC** | Existing `system-health` Routine | Merge functionality into system-health prompt. |
| `codebaseIndexWorker.js` | **MOVE-CORAZON** | Corazon-side file watcher rebuilds index when a `.md`/`.js`/`.ts` file changes | Per Phase 2 dossier 01 (Continuous Codebase Awareness). |
| `outboundEmailDelayQueueWorker.js` | **REPLACE-ANTHROPIC** | `email-triage` Routine drains the delay queue | Same logic, different fire mechanism. |
| `gmailPoller.js`, `linkedinWorker.js`, `financePoller.js`, `kgEmbeddingWorker.js`, `kgConsolidationWorker.js`, `calendarPoller.js`, `workspacePoller.js` | already DISABLED (per `ecosystem.config.js` 2026-04-15 comment) | n/a | These are commented out in ecosystem.config.js but the source files remain. Delete in file-cleanup phase. |
| `factoryRunner.js`, `factoryBridge.js`, `factoryTriggerService.js`, `factoryOversightService.js` | **REPLACE-ANTHROPIC** | `factory-cloud` Routine | Per `[[project_factory_symbiosis]]`. Once Routine is proven, delete the worker pool + bridge. |
| `rescueBridge.js`, `rescueService.js`, `src/rescue/rescueRunner.js` | **DELETE** | "ssh tate@vps && claude" | After rescue PM2 stop. |
| `voiceRelay.js` route, `voiceChunk.js` route, `voiceTools.js` route | **KEEP-VPS** | n/a | Voice ingress lives on VPS. The route logic can be slimmed but the endpoints stay. |
| `internalWsBroadcast.js` route | **REVIEW** | If only used by the dead frontend OS-chat surface, **DELETE**. If still serving meeting transcripts to clients, **KEEP-VPS**. | Defer one-line decision to post-cutover sweep. |
| `routes/osSession.js`, `routes/messageQueue.js`, `routes/triage.js`, `routes/smsWebhook.js`, `routes/mcp/cowork.js` | **PARTIAL-KEEP-VPS** | Routes stay; their handlers redirect/enqueue to messageQueue + Routine `/fire` instead of `osSessionService.sendMessage` | Targeted file edits during tear-down. |

---

## 3. Direct-exec crons (KEEP-VPS via systemd)

Per the master architecture doc (§3 Routines list), these stay direct-exec on VPS because Routines cannot perform pm2 ops or sub-1h-interval polls without burning Anthropic budget needlessly:

| Cron | Frequency | New mechanism |
|---|---|---|
| `telemetry-dispatch-consumer` | every 30m | systemd timer running `node scripts/telemetry-dispatch-consumer.js` |
| `telemetry-perf-consumer` | every 30m | systemd timer |
| `kg-embedding` | every 30m | systemd timer running `node scripts/kg-embedding.js` |
| `nightly-restart` | daily 03:00 AEST | systemd timer running `bash scripts/nightly-restart.sh` |

Each gets a `.service` + `.timer` pair authored under `/etc/systemd/system/`. The timer ownership transfer happens during tear-down step 8.

---

## 4. Anthropic-primitive verification preconditions

Before any `REPLACE-ANTHROPIC` disposition is acted on by stopping its VPS counterpart, the Anthropic primitive must be proven live:

| Replacement | Verification probe | Status |
|---|---|---|
| `meta-loop` Routine | `meta_loop` row in routine list with `last_fired_at` < 2h | **PENDING** (Tate Phase 1 task) |
| `email-triage` Routine | same | **PENDING** |
| `parallel-builder` Routine | same | **PENDING** |
| `system-health` Routine | same | **PENDING** |
| `factory-cloud` Routine | one full code-shipping cycle (brief in, code shipped, status_board row updated) | **PENDING** |
| `claim-verifier` Routine | `claim_verifier` Routine returns within 5 min of fire | **PENDING** |
| Task subagents replace forks | one Task subagent dispatched from Corazon-conductor returns a [FORK_REPORT]-equivalent summary | Implicit in current Corazon usage; consider verified |
| Long-lived OAuth tokens replace `claudeTokenRefreshService` | `claude setup-token` token in VPS .env has expiry > 30 days | **VERIFIED** (per `[[project_claude_long_lived_tokens_apr2026]]`) |

**Tear-down gate:** any service whose replacement is **PENDING** cannot be stopped. The disposition matrix is binding only against verified replacements. The status_board row written before each tear-down step quotes this verification status.

---

## 5. Summary tally

- **PM2 services KEEP:** 3 (api, meetings, observer-watchdog).
- **PM2 services TEAR-DOWN:** 3 (conductor, factory, rescue).
- **Service-file primitives KEEP-VPS:** 12 (perceptionBus + perceptionDispatcher + observerSignalsService + their listeners/matchers/observers + messageQueue stays-on-api + voice routes).
- **Service-file primitives MOVE-CORAZON:** 9 (turn-engine consumer hook, queue drain, prompt assembler, working_set close hook, fork worktree helper if kept, codebase index, observer-signals writer, conversation-log writer, telemetry-fire signals).
- **Service-file primitives REPLACE-ANTHROPIC:** 11 (heartbeat, proactivity, factory worker pool + bridge, claim verifier, autonomous maintenance, outbound email delay, all 16 cron categories, schedule-poller, fork-spawn).
- **Service-file primitives DELETE:** 18 (forkService internals, schedulerPoller internals, cronForkDispatcher internals, message-queue fork-report labelling, claudeTokenRefresh, cacheKeepalive, gmailPoller + linkedin + finance + kg-embed-worker + kg-cons-worker + calendar + workspace pollers (already disabled), forkConductorTool, recoverStaleForks, rescueBridge + rescueService + rescueRunner).

**Estimated post-cutover memory:** 250-280 MB (vs 470 MB pre-tear-down).
**Estimated VPS plan tier:** DigitalOcean Premium AMD 2GB ($21/mo) instead of current 8GB tier (likely $48/mo or higher).

---

## 6. Reads-from-this-matrix protocol

- `VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` reads section 1 + section 4 (verification preconditions).
- `VPS_POST_CUTOVER_SHAPE_2026-05-15.md` reads section 1 + section 5 (summary tally).
- The two patterns authored under 05.7 reference this file by path.

No primitive in the audit lacks a row here. If an audit-named primitive is missing, the audit is wrong, this matrix is wrong, or both - flag back to me and I will reconcile.
