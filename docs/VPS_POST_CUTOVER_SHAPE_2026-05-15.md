# VPS Post-Cutover Shape - 2026-05-15

**Lane:** Phase 2 / 05.5.
**Inputs:** `VPS_SERVICE_AUDIT_2026-05-15.md` (pre-tear-down state), `VPS_PRIMITIVE_DISPOSITION_2026-05-15.md` (target state).
**Status:** Forward-looking spec. Activates after `VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` reaches step 11. Until then, this document is the design target, not the live shape.

---

## 1. PM2 list (post-cutover)

```
ecodia-api               online       ~196 MB    src/server.js          fork_mode  main HTTP entry
ecodia-meetings          online       ~43 MB     src/meetingsServer.js  fork_mode  Twilio + Deepgram voice ingress
ecodia-observer-watchdog online       ~5 MB      src/workers/observerWatchdog.js  fork_mode  failure-domain probe (1 target post-cutover)
```

**Three processes. Total RSS target: ~250 MB (vs 470 MB pre-tear-down).**

---

## 2. What `ecodia-api` owns (slimmed scope)

- HTTP route surface: `/api/health`, `/api/mcp/ecodia`, `/api/mcp/ecodia-full`, `/api/mcp/cowork` (30-day alias), `/api/oauth/mcp/*`, all `/api/webhooks/*` ingress, all `/api/voice/*` and `/api/sms/*` routes.
- `/api/os-session/message` endpoint downgraded to "enqueue into messageQueue" semantics. Returns `{ ok: true, queued: true, drain_via: "corazon-conductor-poll" }` instead of bridging to a 3002 loopback.
- WebSocket server (carve-out: only the meeting-transcription channel survives; OS-chat broadcast is dead).
- Capability registry, secret safety service, untrusted input wrapping.
- Perception bus + perception dispatcher (migrated from conductor process at tear-down step 7).
- All listeners (`src/services/listeners/*`) - they subscribe to perceptionBus which is now in-process.
- All matchers (`src/services/matchers/*`).
- All observers (`src/services/observers/*`) emit observer_signals via observerSignalsService.
- Substrate gateways: Postgres pool (DB_POOL_MAX=3 unchanged), Neo4j Aura client.
- Sync entry points exposed via MCP tools to Corazon-conductor and Routines.

---

## 3. What `ecodia-meetings` owns (unchanged)

- `/api/meetings/*` route surface on port 3003.
- Twilio Media Streams handler.
- Deepgram Nova-3 STT + Aura-2 TTS (per `[[project_voice_engine_may2026]]`).
- Live-meeting transcript chunking + Supabase Storage upload.
- meetingsLiveTranscription pub-to-perceptionBus stream.

---

## 4. What `ecodia-observer-watchdog` owns

- Probe `http://127.0.0.1:3001/api/health` every 10s.
- Probe `http://127.0.0.1:3003/api/meetings/health` every 10s (NEW post-cutover - meetings becomes a probe target since conductor is gone).
- Threshold: 4 consecutive failures (40s) = write P1 observer_signals row + optional SMS to Tate.
- Direct pg + https only, zero app-module dependencies.

---

## 5. systemd timers (KEEP-VPS direct-exec crons)

Authored under `/etc/systemd/system/`:

```
ecodia-telemetry-dispatch.service + .timer    every 30m  -> node scripts/telemetry-dispatch-consumer.js
ecodia-telemetry-perf.service + .timer        every 30m  -> node scripts/telemetry-perf-consumer.js
ecodia-kg-embedding.service + .timer          every 30m  -> node scripts/kg-embedding.js
ecodia-nightly-restart.service + .timer       daily 03:00 AEST  -> bash scripts/nightly-restart.sh
```

Each `.service` runs as user `tate`, working directory `/home/tate/ecodiaos`, env file `/home/tate/ecodiaos/.env`.

`scripts/nightly-restart.sh` post-cutover content:
```bash
#!/usr/bin/env bash
set -e
source /home/tate/.nvm/nvm.sh
pm2 restart ecodia-api ecodia-meetings ecodia-observer-watchdog
pm2 save
```

---

## 6. Disk shape (post-tear-down)

| Pre | Post | Delta |
|---|---|---|
| `/dev/vda1` 32G used / 48G total (67%) | est. 22-24G used / 48G total (~48%) | ~10G freed |
| `~/ecodiaos/node_modules` 1.1G | est. 0.7-0.8G | ~0.3G freed (deps for forkService SDK, factory bridge, rescue runner, deleted workers) |
| `~/ecodiaos` 660M (incl node_modules) | est. 350-400M | ~260M freed (deleted services + workers + bak files) |
| Lane A snapshot at `~/migration-snapshots-2026-05-15/` ~5G | retained 30 days then deleted | -5G after 2026-06-15 |
| PM2 logs (pm2 logrotate already on) | unchanged | no change |
| Factory artifacts in `~/ecodiaos/.factory-tmp/` (if present) | DELETE in step 10 cleanup | freed varies |

---

## 7. Cost shape (post-tear-down)

**Current VPS plan:** DigitalOcean droplet 8GB RAM / 4 vCPU / 160GB SSD, ~$48/mo (estimated based on standard DigitalOcean pricing).

**Post-cutover plan target (executed 2026-05-19):** DigitalOcean 2vCPU / 2GB / 60GB at $18/mo. Saves ~$360/yr vs original $48/mo tier. Tate's framing 2026-05-19: the box that runs api.admin.ecodia.au MCP gateway substrate is now spec-comparable to a 2017 grade-7 school laptop. Pre-resize prep: 1GB swap added, ecodia-api max_memory_restart lowered from 3G to 1G, redis maxmemory capped at 256MB. See [[vps-anatomy-current-state-2026-05-19]] for full anatomy.

**Headroom check:**
- ~250 MB RSS for 3 processes leaves 1.75GB free on a 2GB plan.
- Postgres (NOT on VPS - Supabase cloud).
- Neo4j (NOT on VPS - Aura cloud).
- Express + Deepgram audio buffer + watchdog easily fit 1 vCPU.
- Disk: post-cleanup ~24GB used; the 60GB SSD has 36GB headroom.

**Achieved monthly savings: ~$30/mo recurring (~$360/yr)** via 2vCPU/2GB tier at $18/mo plus the 2026-05-19 cleanup arc (pm2 delete conductor/factory/rescue + docker mysql removal + cull staging + workspaces Factory worktree purge).

---

## 8. Plan-tier migration recipe

Once post-tear-down soak shows 14 days stable on the existing 8GB box, drop to 2GB. Procedure:

1. **Snapshot the live VPS via DigitalOcean Console** (~5 min, $0 since first 5 snapshots/account are free).
2. **Provision new 2GB droplet** in same region (sgp1 / syd1 / wherever current droplet lives - same region keeps Tailscale IP semantics consistent and avoids cross-region latency to Supabase ap-southeast-2).
3. **Restore snapshot to new droplet** (~10 min from DO Console).
4. **Tailscale onboard new droplet** under name `ecodia-hub-2gb` (provisional). Keep `ecodia-hub` (the old name) until DNS flip.
5. **Verify all 3 PM2 processes start cleanly** on new droplet. Run smoke probes: `curl /api/health`, send test SMS, fire one Routine /fire, observe ecodia-api logs for first inbound webhook.
6. **DNS flip:** update `api.admin.ecodia.au` A record to new droplet's IPv4 (or update Tailscale routing if internal-only). TTL set to 60s before the flip.
7. **Soak 24h on new droplet.** Old droplet kept running but not advertised via DNS.
8. **Tear down old droplet** after 24h clean. Tag the old droplet ID + last-seen timestamp in a Decision node.

Risk: Tailscale `ecodia-hub` name collision if both droplets are online and the Tailscale node persists across reboots. Mitigation: rename the old droplet to `ecodia-hub-old` BEFORE provisioning the new one, then provision new as `ecodia-hub`.

---

## 9. Frontend shape (post-cutover, deferred to a separate Phase)

Per the master architecture doc, `admin.ecodia.au` is being slimmed to visualisation-only. Out of scope for Phase 2 / 05; covered by Phase 2 / 02 (VS Code as Canvas). Carry-forward note: any route in `ecodia-api` that exists ONLY for the OS-chat surface can be deleted once Phase 2 / 02 lands.

Until Phase 2 / 02 ships, the slimmed frontend at `admin.ecodia.au` reads:
- status_board snapshots (poll-based, no WS).
- working_set rows.
- forks rollup view (frozen post-cutover - no new SDK forks - but the historical rows render).
- Meeting transcripts (live via the surviving WS channel from `ecodia-meetings`).

---

## 10. Operational shifts post-cutover

| Pre | Post |
|---|---|
| Tate types into `admin.ecodia.au` chat -> osSessionService bridges to SDK | Tate types into local Claude Code on Corazon (terminal / VS Code / Desktop / iOS sync) |
| SMS to TATE_MOBILE -> Twilio webhook -> osSessionService.sendMessage | SMS to TATE_MOBILE -> Twilio webhook -> messageQueue.enqueue -> Corazon poll-and-drain |
| Voice call -> Twilio Media Streams -> deepgramVoiceService -> osSessionService.sendMessage | Voice call -> Twilio Media Streams -> deepgramVoiceService -> messageQueue.enqueue -> Corazon poll-and-drain |
| 16 cron entries in `os_scheduled_tasks` -> schedulerPollerService -> mix of direct-exec / fork / osSession | 16 Routines on Anthropic cloud + 4 systemd timers for direct-exec |
| Factory dispatch -> ecodia-factory worker pool -> CC sessions | Factory dispatch -> factory-cloud Routine on dedicated account (long tasks) OR Task subagents (short tasks) |
| Forks via SDK spawn -> forkService -> registry / depth-cap | Task subagents in Claude Code session, no separate registry |
| Conductor heartbeat -> osHeartbeatService writes os_heartbeats row | system-health Routine (every 4h) writes os_heartbeats row via MCP |
| Observer signals -> osSessionService inline | observerWatchdog (VPS) + Corazon-side PostToolUse hook + Routine roll-up |
| `pm2 restart ecodia-api` recovers from a wedged conductor | `pm2 restart ecodia-api` recovers from a wedged api; conductor wedge means restart Corazon Claude Code |

---

## 11. Reversibility window

The Lane A safety tag `pre-migration-cutover-2026-05-15@ae1c463` plus the 2026-05-15 snapshot at `~/migration-snapshots-2026-05-15/` and `D:/.code/migration-snapshots/2026-05-15/` constitute the reversal substrate. Per `MIGRATION_DR_2026-05-15.md` §"Snapshot freshness and rotation", these can be deleted from Corazon 30 days post-cutover; the git tag stays forever on `origin`.

If at any point during the 7-day soak (tear-down step 9) a regression appears that traces to a stopped service, the rollback is `pm2 start <name>` against the snapshot's PM2 jlist content. If the rollback is needed AFTER step 8 (PM2 deleted), re-arm via `pm2 start /home/tate/migration-snapshots-2026-05-15/pm2-state.json`.

---

## 12. Acceptance criteria for "cutover complete"

All of the following must hold for the Decision node `VPS substrate-only redesign + cutover complete - 2026-05-15` to be written:

- [ ] `pm2 list` shows exactly 3 processes (api, meetings, observer-watchdog).
- [ ] Total RSS for those 3 processes < 280 MB.
- [ ] All 16 Routines on Anthropic cloud have `last_fired_at` within their expected windows.
- [ ] All 4 systemd timers fired at least once successfully (`journalctl -u ecodia-*.service`).
- [ ] One full SMS round-trip via Tate's mobile lands in messageQueue and is drained by a Corazon Claude Code session within 1 min.
- [ ] One full voice call lands a transcript chunk in Supabase Storage.
- [ ] Lane A DR drill (this doc) re-run successfully against the post-cutover snapshot.
- [ ] Pattern files for both `vps-substrate-only-shape-post-migration-2026-05-15` and `destructive-tear-down-requires-tate-gate-per-step-2026-05-15` exist on disk and are referenced from `backend/patterns/INDEX.md`.
- [ ] Status_board lane row `72a4cd21-3b20-4858-8ff6-664bd4ac3f18` archived with outcome `complete`.
- [ ] Git tag `post-migration-cutover-completed-2026-05-15` pushed to `origin`.
