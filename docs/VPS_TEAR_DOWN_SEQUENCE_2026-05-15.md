# VPS Tear-Down Sequence - 2026-05-15

**Lane:** Phase 2 / 05.3.
**Inputs:** `VPS_SERVICE_AUDIT_2026-05-15.md`, `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md`.
**Companion pattern:** `backend/patterns/destructive-tear-down-requires-tate-gate-per-step-2026-05-15.md`.

This document IS the tear-down. Each step is reversible until the next step is taken. Each destructive substep (`pm2 stop`, `pm2 delete`, `git rm`) is gated: a status_board row is written addressed to `next_action_by=tate` BEFORE the substep runs, and waits for Tate's explicit `proceed` reply (or his manual status flip on the row). Decide-do-not-ask is OVERRIDDEN here; this is the lane where `[[feedback_freedom_philosophy]]` yields to safety.

---

## 0. Preflight (no destructive ops, no gate)

Before step 1, the executor confirms:

- [x] DR snapshot exists at `D:/.code/migration-snapshots/2026-05-15/`. Manifest verified. Postgres dump 372MB, sha256 `e70de9b3...`. (Lane A complete.)
- [x] Git tag `pre-migration-cutover-2026-05-15` at commit `ae1c463` (verified via `git rev-parse`).
- [x] Lane E `/api/mcp/ecodia-full` is `live` (status_board row `4c8e870c`).
- [x] Lane G hygiene shipped (status_board row `5f744add`).
- [ ] **DR drill (05.6)** - restore postgres dump to a fresh Supabase branch, run smoke test, confirm restorability. **THIS GATES STEP 1.**

If any preflight check fails, abort and surface to Tate. Do not proceed.

---

## 1. Tear-down sequence

Format per step:
- **Action:** the destructive op.
- **Reversible by:** how to undo within the same window.
- **Gate:** the exact status_board row written + the proceed condition.
- **Verify (post-action):** what to probe to confirm the action took effect cleanly.

### Step 1 - Stop traffic to the conductor (rename + pm2 stop)

- **Action:** rename `ecodia-conductor` to `ecodia-conductor-deprecated` in `ecosystem.config.js`, run `pm2 reload ecosystem.config.js`, then `pm2 stop ecodia-conductor-deprecated`. Do NOT `pm2 delete` yet.
- **Reversible by:** `pm2 start ecodia-conductor-deprecated` (process metadata still in PM2 registry); rename back in ecosystem.config.js; `pm2 reload`.
- **Gate:** status_board row entity_type=`infrastructure` entity_ref=`phase2-05-step-1` name=`Tear-down step 1: stop ecodia-conductor (rename to deprecated, pm2 stop, no delete)` next_action=`Reply "proceed" to authorise pm2 stop. Reversible via pm2 start ecodia-conductor-deprecated. Resolution criteria: ecodia-api still serving HTTP, ecodia-meetings still serving voice, ecodia-observer-watchdog still probing, message_queue can still be appended to via SMS webhook (ecodia-api owns that), no HTTP 5xx storm in /home/tate/.pm2/logs/ecodia-api-error.log within 24h after stop.` next_action_by=`tate` priority=`1`.
- **Verify (post-action):**
  1. `pm2 list` shows `ecodia-conductor-deprecated` status=`stopped`.
  2. `curl http://127.0.0.1:3001/api/health` returns 200.
  3. `curl http://127.0.0.1:3003/api/meetings/health` (or equivalent) returns 200.
  4. `tail -200 /home/tate/.pm2/logs/ecodia-api-error.log` shows no error spike attributable to conductor loopback being unreachable. NOTE: ecodia-api proxies session calls to 127.0.0.1:3002 - a 502 from `/api/os-session/message` is EXPECTED post-stop. The pre-cleanup before step 1 is to land a tiny `app.js` patch that returns `{ ok: false, reason: "conductor migrated to corazon - use messageQueue.enqueue" }` for /api/os-session/* routes when CONDUCTOR_DETACHED is true and conductor loopback is unreachable.
  5. After 24h, `SELECT count(*) FROM message_queue WHERE created_at > now() - interval '24 hours'` shows the SMS/voice/triage paths still write rows.

### Step 2 - Re-test Lane G hygiene routine

- **Action:** trigger the Lane G `status_board_hygiene` Routine manually. Confirm it archives stale rows cleanly without depending on the conductor.
- **Reversible by:** n/a (read-only run).
- **Gate:** none (read-only).
- **Verify:** `SELECT id, name, archived_at FROM status_board WHERE entity_ref ILIKE '%hygiene%' AND archived_at > now() - interval '1 hour'` returns rows. The Routine's stdout (visible in claude.ai/code/routines run history) shows the same archive pattern as pre-step-1 runs.

### Step 3 - Stop `cronForkDispatcher` (replaced by Routines)

- **Action:** `cronForkDispatcher` is a module inside ecodia-conductor (already stopped at step 1). Confirm by grep: no other PM2 service requires it. Therefore step 3 is a NO-OP in PM2 terms; the gate exists to formally retire the primitive in code.
- **Reversible by:** revert step 1.
- **Gate:** status_board row entity_ref=`phase2-05-step-3` name=`Tear-down step 3: confirm cronForkDispatcher dead (subsumed by step 1)` next_action=`Reply "proceed" to acknowledge cronForkDispatcher is dead post-step-1. No live PM2 service requires it. Refactor-eligible cron paths now route through Routines. Resolution criteria: no row inserted into os_forks with origin='cron-fork-dispatcher' in last 24h.` next_action_by=`tate` priority=`2`.
- **Verify:** `SELECT count(*) FROM os_forks WHERE created_at > now() - interval '24 hours' AND metadata->>'origin' = 'cron-fork-dispatcher'` returns 0.

### Step 4 - Stop `schedulerPollerService` (replaced by Routines + systemd timers)

- **Action:** like step 3, this is a NO-OP in PM2 terms (subsumed by step 1). Author the systemd timers for `telemetry-dispatch-consumer`, `telemetry-perf-consumer`, `kg-embedding`, `nightly-restart` BEFORE acknowledging this step (otherwise those crons silently die). Timers go in `/etc/systemd/system/ecodia-<name>.timer` + `.service`. Enable + start.
- **Reversible by:** stop and disable the systemd timers; revert step 1.
- **Gate:** status_board row entity_ref=`phase2-05-step-4` name=`Tear-down step 4: schedulerPollerService dead, systemd timers armed for direct-exec crons` next_action=`Reply "proceed" once: (a) systemd timers for telemetry-dispatch, telemetry-perf, kg-embedding, nightly-restart are installed and "systemctl list-timers" shows next fire times within their normal window, (b) one telemetry-dispatch fire is captured in journalctl. Resolution criteria: os_scheduled_tasks rows for these 4 crons show last_fired_at advancing in the systemd window, not the schedulerPoller window.` next_action_by=`tate` priority=`2`.
- **Verify:** `systemctl list-timers ecodia-*.timer` shows all 4 with NEXT < 30min from now; one full cycle of `journalctl -u ecodia-telemetry-dispatch.service` shows successful run.

### Step 5 - Stop `ecodia-rescue` (no conductor to rescue)

- **Action:** `pm2 stop ecodia-rescue`. Do NOT delete yet.
- **Reversible by:** `pm2 start ecodia-rescue`.
- **Gate:** status_board row entity_ref=`phase2-05-step-5` name=`Tear-down step 5: stop ecodia-rescue` next_action=`Reply "proceed" to stop ecodia-rescue. The rescue path was: ssh to VPS -> rescueBridge Redis pub/sub -> rescueRunner CC session. Post-conductor-on-corazon, the equivalent is: ssh tate@vps && claude. If you need the always-on rescue runner for any reason (recent invocation in last 30d?), say so and I will keep it. Resolution criteria: no SMS or any external trigger fires rescueBridge in 24h after stop.` next_action_by=`tate` priority=`2`.
- **Verify:** `pm2 list` shows rescue=stopped; no Redis pub/sub error logs in ecodia-api.

### Step 6 - Stop `ecodia-factory` (after factory-cloud Routine verified)

- **Action:** `pm2 stop ecodia-factory`. Do NOT delete yet.
- **Reversible by:** `pm2 start ecodia-factory`.
- **Gate:** status_board row entity_ref=`phase2-05-step-6` name=`Tear-down step 6: stop ecodia-factory (legacy worker pool)` next_action=`Reply "proceed" once factory-cloud Routine has shipped one full code cycle (brief in -> code committed -> status_board row updated) and last_fired_at is recent. Per [[project_factory_symbiosis]] this PM2 process is the legacy CC-session pool; the new path is the factory-cloud Routine on a dedicated account. Resolution criteria: no factory_session row created in the last 24h with origin='legacy-pool'.` next_action_by=`tate` priority=`2`.
- **Verify:** `pm2 list` shows factory=stopped; `SELECT count(*) FROM cc_sessions WHERE created_at > now() - interval '24 hours' AND source='factory-runner'` is 0.

### Step 7 - Migrate perception bus to ecodia-api, then no-op the conductor

- **Action:** edit `src/server.js` to require + start `perceptionBus` and `perceptionDispatcher` at api boot (currently they boot in `src/conductor.js`). Run `pm2 restart ecodia-api`. Verify perception events still flow.
- **Reversible by:** revert the server.js edit; restart api.
- **Gate:** status_board row entity_ref=`phase2-05-step-7` name=`Tear-down step 7: move perceptionBus + perceptionDispatcher from conductor process to api process` next_action=`Reply "proceed" to ship the perception-bus migration patch. Smallest possible diff: add 'require + start' in src/server.js, remove from src/conductor.js, restart ecodia-api. Resolution criteria: insert one synthetic perception event after the restart, confirm a matcher reaction lands in the expected substrate within 5s. The 20+ listener and matcher requires resolve to the same instance because the bus is in-process to api now.` next_action_by=`tate` priority=`2`.
- **Verify:** Insert a synthetic event via `node -e "require('./src/services/perceptionBus').publish('test:teardown-step-7', {ts: Date.now()})"`. Confirm a known matcher reacts. Check the listener registry health endpoint.

### Step 8 - Delete the stopped services from PM2 registry

- **Action:** `pm2 delete ecodia-conductor-deprecated ecodia-rescue ecodia-factory`. Then `pm2 save` to update the resurrect file.
- **Reversible by:** `pm2 start /home/tate/migration-snapshots-2026-05-15/pm2-state.json` to bring all 5 pre-cutover processes back. (Lane A snapshot.)
- **Gate:** status_board row entity_ref=`phase2-05-step-8` name=`Tear-down step 8: pm2 delete the 3 stopped processes` next_action=`Reply "proceed" to remove ecodia-conductor-deprecated + ecodia-rescue + ecodia-factory from PM2 registry. Reversible via pm2 start with Lane A's pm2-state.json snapshot. Resolution criteria: pm2 list shows only ecodia-api, ecodia-meetings, ecodia-observer-watchdog. pm2 save persists the new shape.` next_action_by=`tate` priority=`2`.
- **Verify:** `pm2 list` shows exactly 3 processes; `cat ~/.pm2/dump.pm2 | jq '.[].name'` shows the same 3 names.

### Step 9 - 7-day soak

- **Action:** wait. Do nothing destructive. Heartbeat continues. Re-probe each KEEP-VPS service is still healthy on day 1, 3, 7. Re-probe each REPLACE-ANTHROPIC Routine has fired its expected windows on day 1, 3, 7.
- **Reversible by:** any anomaly triggers Lane A rollback per `MIGRATION_DR_2026-05-15.md`.
- **Gate:** none for the wait. Step 10 is gated.
- **Verify:** by day 7, no P1 observer_signals row attributable to a missing service. `SELECT count(*) FROM observer_signals WHERE created_at > now() - interval '7 days' AND priority=1`.

### Step 10 - Remove the deleted service files from disk

- **Action:** `git rm` the following files in a single commit on a tear-down branch:
  - `src/services/osSessionService.js`
  - `src/services/forkService.js`
  - `src/services/schedulerPollerService.js`
  - `src/services/cronForkDispatcher.js`
  - `src/services/forkConductorTool.js`
  - `src/services/cacheKeepaliveWorker.js` -> wait, that one's in `src/workers/`. Adjust path.
  - `src/services/claudeTokenRefreshService.js`
  - `src/services/proactivityEngine.js`
  - `src/services/rescueService.js`, `src/services/rescueBridge.js`, `src/rescue/rescueRunner.js`
  - `src/workers/factoryRunner.js`, `src/services/factoryBridge.js`, `src/services/factoryTriggerService.js`, `src/services/factoryOversightService.js`
  - `src/workers/cacheKeepaliveWorker.js`, `src/workers/claimVerifierWorker.js`, `src/workers/autonomousMaintenanceWorker.js`, `src/workers/outboundEmailDelayQueueWorker.js`
  - Already-disabled: `src/workers/gmailPoller.js`, `src/workers/linkedinWorker.js`, `src/workers/financePoller.js`, `src/workers/kgEmbeddingWorker.js` (replaced by direct-exec script), `src/workers/kgConsolidationWorker.js`, `src/workers/calendarPoller.js`, `src/workers/workspacePoller.js`
  - Stale `.bak` files: `src/app.js.bak-lane-e-1778774624`, `src/app.js.bak.lane-d-2026-05-15`
  - `src/services/listeners/dispatchQueueListener.js` (depended on forkService)
  - `src/services/conductor.js` (the PM2 entry point itself)
- **Reversible by:** `git revert <tear-down-commit>` on the same branch; redeploy.
- **Gate:** status_board row entity_ref=`phase2-05-step-10` name=`Tear-down step 10: git rm the deleted service files` next_action=`Reply "proceed" to commit the file deletions. The exact list is in VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md step 10. Reversible via git revert. Files are git-tracked so the safety tag pre-migration-cutover-2026-05-15 still has them at ae1c463. Resolution criteria: pnpm/npm build succeeds, ecodia-api boots cleanly post-deploy, perception bus still loads, message queue still appends from SMS webhook.` next_action_by=`tate` priority=`2`.
- **Verify:** `pm2 logs ecodia-api --lines 50 --nostream` post-restart shows clean boot; one SMS test, one perception event, one MCP query all succeed.

### Step 11 - Final commit + tag

- **Action:** push tear-down branch, merge to main, tag `post-migration-cutover-completed-2026-05-15`.
- **Reversible by:** revert the merge; checkout the safety tag.
- **Gate:** status_board row entity_ref=`phase2-05-step-11` name=`Tear-down step 11: tag post-migration-cutover-completed-2026-05-15` next_action=`Reply "proceed" to tag and push. This is the formal seal of the cutover. Reversible via git checkout pre-migration-cutover-2026-05-15. Resolution criteria: tag pushed to origin, Decision node "VPS substrate-only redesign cutover complete" written to Neo4j with before/after PM2 + memory + disk numbers, lane execution status_board row 72a4cd21 marked archived.` next_action_by=`tate` priority=`2`.
- **Verify:** `git ls-remote origin refs/tags/post-migration-cutover-completed-2026-05-15` returns the commit; Neo4j Decision node exists with the right name.

---

## 2. Decisions deferred to in-flight (asked at gate, not now)

- **Whether `internalWsBroadcast.js` route is still serving meeting transcripts to the slimmed frontend.** If yes: KEEP-VPS, route stays. If no: DELETE in step 10. I will probe traffic on this route during the 7-day soak (step 9) and surface the answer at step 10's gate.
- **Whether the `OS_CONV_LOG_ENABLED` env var should stay true** post-cutover (no conductor writing to it on this VPS). Probe + decide at step 10's gate.

---

## 3. Rollback paths

| Rollback target | Procedure | Time |
|---|---|---|
| Step 1 (conductor stopped) | `pm2 start ecodia-conductor-deprecated` (rename back if needed) | 30s |
| Steps 1-7 (services stopped, perception migrated) | revert any code commits in this tear-down + `pm2 start <name>` for each stopped process | 5-10 min |
| Step 8 (PM2 deleted) | `pm2 start /home/tate/migration-snapshots-2026-05-15/pm2-state.json` (Lane A snapshot) | 2 min |
| Step 10 (files deleted) | `git revert <tear-down-commit>` + redeploy | 5 min |
| Catastrophic (state corruption) | full Lane A DR per `MIGRATION_DR_2026-05-15.md` | 30-90 min |

---

## 4. Coordination notes

- Heartbeat to `cowork_session_id=phase2-05-vps-redesign-2026-05-15` every 30 min throughout, including the 7-day soak (lighter heartbeat: every 6h during soak).
- Em-dashes BANNED in every status_board row, every commit message, every doctrine file written during this lane.
- Each gate row uses the exact next_action template above so Tate can read consistently.
- Decide-do-not-ask is OVERRIDDEN per dossier; this is the only lane where that override applies.

---

## 5. Author seal

Authored 2026-05-15 by EcodiaOS-on-Corazon (local Claude Code) under Tate's gated-autonomy mandate for Phase 2 Lane 05. Sequence reflects the actual VPS state probed at audit time, not the original Phase 1 dossier framing. Where the two conflict, this sequence and `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md` are authoritative.
