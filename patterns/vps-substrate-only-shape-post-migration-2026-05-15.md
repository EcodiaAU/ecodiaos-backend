---
triggers: vps-substrate-only, post-migration-vps-shape, ecodia-api-only, vps-slimmed, vps-post-cutover, three-pm2-services, vps-role-after-corazon, conductor-not-on-vps, vps-substrate-vs-conductor, vps-shape-2026-05-15, ecodia-meetings-keep, ecodia-observer-watchdog-keep, voice-stays-on-vps, perception-bus-on-api, message-queue-on-api-corazon-drains, systemd-timers-not-cron-poller
priority: high
---

# VPS substrate-only shape post-migration - 2026-05-15

## The rule

After the Phase 2 / 05 cutover, the EcodiaOS VPS at `tate@100.103.227.90` runs THREE PM2 processes - `ecodia-api`, `ecodia-meetings`, `ecodia-observer-watchdog` - and four systemd timers. NO conductor process. NO factory worker pool. NO rescue runner. NO scheduler poller. NO cron-fork dispatcher. NO osSessionService anywhere on the VPS.

The conductor lives on Corazon (interactive Claude Code) and on Anthropic cloud (Routines). The VPS is the substrate floor + capability surface, not the thinking entity.

If a future session finds the VPS running 4+ PM2 processes, or finds osSessionService.js back on disk, or finds the conductor proxying to a 3002 loopback - the cutover has regressed and the priority action is to re-converge to the three-process shape per `backend/docs/VPS_POST_CUTOVER_SHAPE_2026-05-15.md`.

## What stays on VPS, by category

**Process layer:**
- `ecodia-api` - HTTP entry point, MCP endpoints (`/api/mcp/ecodia`, `/api/mcp/ecodia-full`, `/api/mcp/cowork` 30-day alias), webhook ingress, OAuth wrapper, capability registry, perception bus + dispatcher (migrated from conductor), all listeners + matchers + observers, secret safety, untrusted-input wrapping.
- `ecodia-meetings` - Twilio Media Streams + Deepgram realtime voice. The voice path cannot bridge through Anthropic cloud, so the audio termination point is the VPS.
- `ecodia-observer-watchdog` - independent failure-domain probe. Probes `ecodia-api` + `ecodia-meetings` health. Writes P1 observer_signals + optional SMS to Tate on persistent unreach.

**Substrate layer (not on VPS but reached via VPS):**
- Postgres (Supabase project `nxmtfzofemtrlezlyhcj` - "Ecodia App", 217 public tables).
- Neo4j Aura cloud.
- kv_store, status_board, working_set, observer_signals, messageQueue, all critical tables.

**systemd timer layer (KEEP-VPS direct-exec crons):**
- `ecodia-telemetry-dispatch.timer` - every 30m
- `ecodia-telemetry-perf.timer` - every 30m
- `ecodia-kg-embedding.timer` - every 30m
- `ecodia-nightly-restart.timer` - daily 03:00 AEST, restarts the 3 PM2 processes

**Voice ingress paths (KEEP):**
- `/api/voice/*`, `/api/sms/*`, `/api/webhooks/twilio/*`. These all live in `ecodia-api` post-cutover.

**Perception bus is NOT removed.** It moves from `ecodia-conductor` to `ecodia-api` as a one-line require change in `src/server.js`. All listeners and matchers KEEP. Domain-reactive intelligence stays VPS-side because it is zero-token-cost regex + DB lookups.

## What does NOT stay on VPS

- osSessionService.js (turn engine): conductor on Corazon owns this.
- forkService.js: Task subagents own this.
- schedulerPollerService.js: Anthropic Routines + systemd timers own this.
- cronForkDispatcher.js: subsumed.
- factoryRunner.js, factoryBridge.js, factoryTriggerService.js, factoryOversightService.js: factory-cloud Routine owns this.
- claudeTokenRefreshService.js: long-lived `claude setup-token` tokens make refresh obsolete.
- proactivityEngine.js: meta-loop Routine owns this.
- claimVerifierWorker.js: claim-verifier Routine owns this.
- cacheKeepaliveWorker.js, autonomousMaintenanceWorker.js, outboundEmailDelayQueueWorker.js: REPLACE-ANTHROPIC.
- All `src/rescue/*`, `rescueBridge.js`, `rescueService.js`: "ssh tate@vps && claude" replaces.
- All disabled pollers (gmail / linkedin / finance / kg-cons-worker / calendar / workspace).

## How input now reaches the conductor

Pre-cutover: SMS / voice / triage routes -> `osSessionService.sendMessage` -> SDK turn -> response.

Post-cutover: SMS / voice / triage routes -> `messageQueue.enqueue` -> Corazon-side poll-and-drain prepends pending messages to next user turn, OR a Stop hook drains at session-end. Tate sees pending messages on his next interactive turn. For genuine emergency (Corazon offline + must-respond-now), Tate runs `claude` on the VPS itself.

## Memory, disk, cost shape

| Metric | Pre | Post |
|---|---|---|
| PM2 process count | 6 (api, conductor, factory, meetings, rescue, watchdog) | 3 (api, meetings, watchdog) |
| RSS total | 470 MB | ~250 MB |
| Disk used / total | 32 GB / 48 GB (67%) | est. 22-24 GB / 48 GB (~48%) |
| VPS plan tier | DigitalOcean ~8GB/4vCPU ~$48/mo | DigitalOcean Premium 2GB/1vCPU ~$21-24/mo |
| Annualised saving | - | ~$300/yr |

## Reversibility

Lane A safety tag `pre-migration-cutover-2026-05-15@ae1c463` + snapshot at `D:/.code/migration-snapshots/2026-05-15/` constitute the rollback substrate. R1 (Postgres restore), R4 (git tag checkout), R7 (PM2 replay) all drilled and proven. R2/R5/R6 documented and Tate-gated. See `backend/docs/MIGRATION_DR_2026-05-15.md` for procedures and `backend/docs/VPS_DR_DRILL_2026-05-15.md` for drill evidence.

## Cross-references

- `backend/docs/VPS_SERVICE_AUDIT_2026-05-15.md` - the audit input.
- `backend/docs/VPS_PRIMITIVE_DISPOSITION_2026-05-15.md` - per-primitive dispositions.
- `backend/docs/VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` - the gated tear-down sequence.
- `backend/docs/VPS_POST_CUTOVER_SHAPE_2026-05-15.md` - the operational target.
- `backend/docs/VPS_DR_DRILL_2026-05-15.md` - DR drill evidence.
- `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` - the master architecture.
- `backend/patterns/migration-vps-to-local-corazon-2026-05-15.md` - the master cutover pattern.
- `backend/patterns/destructive-tear-down-requires-tate-gate-per-step-2026-05-15.md` - tear-down sequencing gate (sibling).
- `backend/patterns/perception-bus-is-the-universal-substrate-for-domain-reactive-intelligence.md` - why perception bus stays VPS-side.

## Origin

Authored 2026-05-15 by EcodiaOS-on-Corazon under Tate's gated-autonomy mandate for Phase 2 Lane 05. The shape codified here is the design target after the 11-step gated tear-down completes; it becomes the live shape on tag `post-migration-cutover-completed-2026-05-15`.
