---
triggers: vps-anatomy, vps-anatomy-current, vps-architecture, vps-actual-state, vps-what-runs, vps-current-state, vps-mcp-gateway, ecodia-vps, 100.103.227.90, 170.64.170.191, api.admin.ecodia.au, ecodia-api, ecodia-meetings, ecodia-conductor-stopped, ecodia-factory-stopped, ecodia-rescue-stopped, ecodia-observer-watchdog, conductor-stopped, factory-stopped, rescue-stopped, sdk-burn-eliminated, vps-vs-corazon, vps-corazon-decoupled, separation-of-concerns, working-locally-only, mcp-cowork-endpoint, mcp-ecodia-full-endpoint, mcp-ecodia-domain-scoped, mcp-ecodia-core, mcp-ecodia-comms, mcp-ecodia-code, mcp-ecodia-money, mcp-ecodia-supabase, mcp-ecodia-scheduler, mcp-ecodia-crm, mcp-ecodia-graph, mcp-ecodia-factory, mcp-ecodia-base, oauth-wrapper-for-claude-ai-connector, claude-ai-custom-connector, before-touch-vps, before-pm2-restart-vps, before-rm-vps, before-ecosystem-config-edit, before-mcp-shape-change, pre-action-vps-grep, vps-tear-down-2026-05-19, tier-1-cleanup-2026-05-19, tier-3-cleanup-2026-05-19, tier-4-cleanup-2026-05-19, tier-6-cleanup-2026-05-19, cull-2026-05-19, reversibility-window-48h, inbound-channels-current, sms-current-routing, telegram-current-routing, gmail-push-perceptionBus, fire-shim-routes-dead, os-session-route-dead, ambient-organism-still-running, observers-still-running, listeners-still-running, proactivity-engine-still-running, perceptionDispatcher-still-running, do-not-restart-conductor-without-thinking, do-not-restart-factory-without-thinking, do-not-restart-rescue-without-thinking, conductor-was-sdk-burn, factory-replaced-by-cowork-dispatch-worker, rescue-replaced-by-local-CC-tab, mcp-servers-load-bearing, stdio-mcp-children, mcp-servers-cannot-cull, CLAUDE-md-kept-on-vps-for-factoryDispatch, SELF-md-kept-on-vps, cull-staging-dir-location, ~/.cull-2026-05-19, pm2-stopped-vs-deleted, pm2-resurrection-path, what-broke-after-tier1, watchdog-still-pings, nightlyRestart-was-in-conductor, scheduler-poller-duplication
---

# VPS anatomy after Tier 1 cleanup (2026-05-19)

**MCP-surface update 2026-05-29 (status_board 2bf2c734).** The `/api/mcp/cowork` and `/api/mcp/ecodia-full` gateways named below are now deprecated and sunset-pending. They stay mounted on the VPS during the soak only to serve live Routines; the 10 narrow domain-scoped connectors are canonical. The per-day hit counts are historical. See [[mcp-narrow-connectors-are-canonical-cowork-v2-and-ecodia-full-deprecated-2026-05-29]].

This is the canonical map of what runs on the VPS now, what was culled, what was kept and why, and what NOT to touch. Grep this before any pm2 / rm / ecosystem.config.js / mcp-shape change on `tate@100.103.227.90`.

## One-paragraph mental model

The VPS is now a focused **MCP HTTP gateway** with an **in-process ambient organism layer** still running in `ecodia-api`. It exposes `/api/mcp/cowork`, `/api/mcp/ecodia-full`, and 9 domain-scoped `/api/mcp/ecodia-{core,comms,code,money,supabase,scheduler,crm,graph,factory}` endpoints, plus an OAuth wrapper for claude.ai custom connectors, plus inbound webhook receivers for Twilio SMS, Telegram, and Gmail Pub/Sub push, plus `/api/voice/relay` and `/api/meetings/*`. The Claude Agent SDK loop that previously ran on the VPS as `ecodia-conductor` is stopped. Cloud-Factory dispatch is stopped. Cloud-Rescue is stopped. Work happens locally in Claude Code on Corazon now, talking to the VPS only as an MCP and webhook substrate.

## What runs on the VPS (post Tier 1)

### PM2 processes ONLINE

| Process | Script | Port | What it does |
|---|---|---|---|
| `ecodia-api` | `src/server.js` | :3001 | The Express service. Mounts ~80 routes including all `/api/mcp/*` HTTP gateway endpoints. Also boots the ambient organism in-process (13 listeners + 6 observers + proactivityEngine + perceptionDispatcher + patternEvolution + fsWatcher + 5 pollers + Voice relay + DeepSeek proxy on :19721). |
| `ecodia-meetings` | `src/meetingsServer.js` | :3003 | Meeting recorder, decoupled from api so api restarts don't drop chunks. |

### PM2 processes DELETED (Tier 1 stop + Phase 2 delete, 2026-05-19)

These were `pm2 stop`-d at the start of the arc, then `pm2 delete`-d after Tate authorized the full kill. They no longer appear in `pm2 list`. `dump.pm2` has been re-saved so a VPS reboot or `pm2 resurrect` will NOT bring them back. They still have apps blocks in `ecosystem.config.js` though, so `pm2 reload ecosystem.config.js` WOULD re-launch them. Either edit the config to remove their apps blocks before the next reload, or remember to launch only specific names.

| Process | Reason removed | Resurrection path |
|---|---|---|
| `ecodia-conductor` | Was running Claude Agent SDK stream + cron poller + token refresh + nightly restart. ~225MB resident, 4d uptime. Self-called `/api/mcp/ecodia-full` ~663 times/day generating ~30% of MCP traffic as pure loopback. This was the SDK burn we are eliminating before the 15 June 2026 Anthropic $200/mo programmatic Agent SDK cap. Wrote 138 status_board rows in 7 days but 0 Neo4j nodes (sensor not actor). | `pm2 start ecosystem.config.js --only ecodia-conductor`. But: the apps block is still in `ecosystem.config.js`, so once you trust the post-cleanup state, remove the block. |
| `ecodia-factory` | Dispatched cloud Factory Claude Code child processes via Redis pub/sub. Replaced by `cowork.dispatch_worker` on Corazon laptop-agent (port 7456). Local IDE tab is the dispatch primitive now. | `pm2 start ecosystem.config.js --only ecodia-factory`. But: the replacement is `cowork.dispatch_worker` so think twice. |
| `ecodia-rescue` | Rescue CC session, always-alive backup when api was wedged. Replaced by spawning a local CC tab on Corazon when needed. | `pm2 start ecosystem.config.js --only ecodia-rescue`. Same caveat: local CC tab is the new rescue. |

### Nginx

Only one site enabled: `ecodia-api`. Terminates 80 (redirects to 443) and 443 (lets-encrypt cert) for `api.admin.ecodia.au`. Routes:

- `/api/voice/relay` -> `localhost:3001` (Twilio Media Streams + Deepgram, websocket upgrade, 24h timeout)
- `/ws` -> `localhost:3001` (websocket upgrade)
- `/api/meetings/*` -> `localhost:3003` (525MB body limit for full-file uploads, 5min timeouts)
- `/` catch-all -> `localhost:3001`

The `[redacted]-dev` site was removed 2026-05-19 ([redacted] client archived).

### System services

- `postgres` on `127.0.0.1:5432` - local data store
- `redis-server` on `127.0.0.1:6379` - the pub/sub bus used by factoryBridge + rescueBridge (now both stopped) and the in-process scheduler
- `nginx` (master + 4 workers) - TLS termination + reverse proxy
- `sshd` on :22 - SSH access
- `tailscaled` - Tailscale mesh (`100.103.227.90` is the Tailscale IP, `170.64.170.191` is the public WAN IP, DigitalOcean range)
- `docker` reachable on `127.0.0.1:3307` (docker-proxy) - some container runs here, not core to ecodia
- `systemd-resolve` on 53

## The MCP gateway in detail

`/api/mcp/cowork` (210 hits/day) is implemented in-process by `src/routes/mcp/cowork.js`. It is a JSON-RPC MCP shim that authenticates with `kv_store.creds.cowork_mcp_bearer` and exposes 22 V2 tools backed by direct calls into `coworkScope`, `coworkAudit`, `forkService`, `osSessionService`, `messageQueue`, `crmService`, Neo4j, and Postgres.

`/api/mcp/ecodia-full` (651 hits/day) is implemented in-process by `src/routes/mcp/ecodiaFull.js`. It re-exposes the cowork V2 tool set plus proxies 10 stdio MCP child processes located at `mcp-servers/{bookkeeping,business-tools,crm,factory,google-workspace,neo4j,scheduler,sms,supabase,vps}/start.sh`. Total ~157 tools, scope-gated via `ecodiaFullScope`. Auth via `kv_store.creds.ecodia_full_mcp_bearer`.

The 9 domain-scoped `/api/mcp/ecodia-{core,comms,code,money,supabase,scheduler,crm,graph,factory}` endpoints (~1500 hits/day combined) are mounted via `src/routes/mcp/mountConnector.js`. Each is a thin HTTP wrapper around its corresponding stdio MCP child in `mcp-servers/`. Each has independent auth and audit. claude.ai web custom connectors mount these as separate connectors. Local Claude Code in VSCode on Corazon talks to them too.

The OAuth wrapper at `/api/oauth/mcp/{authorize,token}` + `.well-known/{oauth-authorization-server,oauth-protected-resource,openid-configuration}` + `/register` (~440 hits/day combined) is what claude.ai web connector OAuth uses to authenticate against `/api/mcp/ecodia`.

**`mcp-servers/` (407MB on disk) is LOAD-BEARING. Do not cull. Each subdirectory is a stdio MCP child invoked at runtime by ecodia-full or domain-scoped proxy.**

## Inbound channel current routing

| Channel | Endpoint | Current path |
|---|---|---|
| Twilio SMS | `/api/sms/incoming` (9 hits/day) | Stores to `kv_store.cowork.inbound_raw.{SID}` and `kv_store.cowork.message_thread.sms.{phone}`. Code tries `/api/os-session/message` first (conductor SDK feed) and falls back to coord-inbox at Corazon `localhost:7456`. Conductor is now stopped so the coord-inbox fallback is the live path. Mid-refactor by Tate on the VPS (dirty diff -665/+221 on `smsWebhook.js`). |
| Telegram | `/api/webhooks/telegram/{secret}` (7 hits/day) | Same shape as SMS: stores to `kv_store.cowork.inbound_raw.{tg-id}` + `kv_store.cowork.message_thread.telegram.{thread}`. Same conductor-then-coord-fallback pattern. |
| Gmail Pub/Sub push | `/api/webhooks/gmail-push` (14 hits/day) | New path. Publishes events to in-process `perceptionBus` on `ecodia-api`. perceptionDispatcher routes from there. Already migrated off conductor SDK. |
| Vercel / Stripe / GitHub / Apple ASN / Resend `-fire-shim` routes | mounted but **0 hits in 24h** | Dead-quiet. Were designed to POST to claude.ai Routine /fire endpoints via accountRouter. Possibly still wired for future use, possibly stale. |
| `/api/os-session/*` | mounted but **0 hits in 24h** | Old conductor-SDK feed path. Dead. |

## Who actually writes substrate

- **status_board rows last 7 days**: conductor 138, cowork 68, observer_tuning_service 1. After Tier 1 (conductor stopped), cowork (Corazon Claude Code via MCP) becomes the dominant writer.
- **Neo4j Episodes + Decisions last 3 days**: cowork 49, unknown 10, conductor 0. Conductor was sensor not actor.

## Ambient organism still running in `ecodia-api`

These are in-process inside `ecodia-api` and survived Tier 1. They are NOT separate PM2 processes. Many were also redundantly run by `ecodia-conductor` and are now run only by `ecodia-api`.

- 13 listeners on `os-session:output` + `db:event` channels (commitPatternDetector, ccSessionsFailure, conductorStreamTagWatcher, dispatchQueueListener, emailArrival, factorySessionComplete, forkComplete, invoicePaymentState, statusBoardDrift, statusBoardHygieneHaiku, stripePaymentToLedger, coherenceObserver, actionAuditObserver)
- Observers: attentionEconomyObserver, systemPulseObserver, dashboardNoteObservers
- proactivityEngine, perceptionDispatcher, patternEvolution, fsWatcher
- Pollers: scheduler poller, message-queue-sweep (30min), claimVerifierWorker (30s), delay-queue-worker (60s), cacheKeepaliveWorker (45min, work hours 6-22 AEST), OS heartbeat
- forkService.recoverStaleForks at boot
- DeepSeek proxy on :19721
- Factory bridge Redis subscriptions (subscribing to channels that nothing publishes to now)

Open question for future-me: which of these still produce value with conductor stopped, and which are noise? Defer decision until ~48h surface time on the Tier 1 stops.

## Phase 2 deeper cull (post-authorization 2026-05-19)

After Tate explicitly authorized "clean up and kill anything left that isnt needed", a second pass cleaned more:

- **2 orphan `claude setup-token` PIDs** (2401811 + 2401704, from 11 May, 260MB combined) killed
- **`[redacted]-mysql` docker container** stopped + removed (was 469MB resident, supporting the now-archived [redacted] client and the now-removed `[redacted]-dev` nginx site)
- **`mysql:8` docker image** removed (1.09GB on disk)
- **3 unused supabase edge-runtime docker images** (v1.65.3 + v1.73.13 + v1.73.3) pruned (1.1GB on disk)
- **1 orphan docker volume** removed
- **`pm2 delete`** of conductor + factory + rescue (definitive removal, dump.pm2 re-saved)
- **`rm -rf ~/.cull-2026-05-19/`** finalised the Tier 3+4 cull (471MB)
- **`~/repos/` moved to `~/.cull-2026-05-19/repos/`** (116MB; 9 bare git repos for Factory clone source, no longer needed with Factory deleted)
- **12 coexist-* Factory worktrees** in `~/workspaces/` moved to `~/.cull-2026-05-19/workspaces-coexist-worktrees/` (180MB; coexist-android-sso, coexist-delete-map-page, coexist-dupe-prevention, coexist-leaflet, coexist-reactions, coexist-spa-base-fix, coexist-sync, coexist-task-clear-from-excel, coexist-w1-excelsync, coexist-w2-impactstats, coexist-w3-leadercheckin, coexist-w4-baseline)

Total disk recovered in Phase 2: ~4GB. RAM dropped from 1.9GB used to 1.3GB used.

## Tier 3+4 original cull list (already finalised)

The original Tier 3+4 staging dir was created, populated, and then `rm -rf`-d during Phase 2:

```
ORIGINAL CONTENTS (now deleted):
~/.cull-2026-05-19/ecodiaos-doctrine/  (71M)
    patterns/  drafts/  dao/  research/  journal/  documents/  recipes/  clients/
    verify-artefacts/  streaming/  skills/  tools/  listener-tier/
~/.cull-2026-05-19/ecodiaos-corazon-only/  (35M)
    laptop-agent/   (Corazon-only Express service, AHK daemons cannot run on Linux)
    codebase-manifest/   (Corazon SQLite codebase index)
    macros/  (had _corazon subdir, no src/ readers)
~/.cull-2026-05-19/ecodiaos-loose/  (96K)
    [redacted]Meeting1.txt, coexist_admin_test.js, coexist_smoke_test{2,6}.js,
    tmp_process_queue{,2}.js, collate.py, .env.bak-1778463988
~/.cull-2026-05-19/home-outside/  (366M)
    ecodiaos-frontend/ (deprecated user surface)
    workspace-archives/ (one killed-fork tarball)
    [redacted]dbuat2.sql, [redacted]-dump.sql (archived client)
    migration-snapshots-2026-05-15/, test_indempotent.txt
```

## Current `~/.cull-2026-05-19/` re-populated state

Phase 2 moved more stuff in. Current contents (296MB total):

- `~/.cull-2026-05-19/repos/` (116MB) - bare git clones for Factory
- `~/.cull-2026-05-19/workspaces-coexist-worktrees/` (180MB) - Factory dispatch worktrees

These can be `rm -rf`-d any time. They are reversible only via DigitalOcean snapshot.

## What was NOT touched and why

- `~/ecodiaos/CLAUDE.md` - read at runtime by `factoryDispatch.js:52` and `factoryRunner.js:166-168` for self-mod context. Factory is stopped but defensive keep.
- `~/ecodiaos/SELF.md` - read at runtime by `factoryDispatch.js:50`. Same.
- `~/ecodiaos/docs/` - 1.1M, not investigated deeply, defensive keep.
- `~/ecodiaos/routines/` - 240K, possibly consumed by `accountRouter.js` and `populateRegistry.js` for claude.ai Routine /fire dispatch (still alive). Defensive keep.
- `~/ecodiaos/public/` - 12M, contains invoice HTMLs served via `app.use('/api/files', express.static('../public'))`. Load-bearing.
- `~/ecodiaos/ops/`, `~/ecodiaos/supabase/`, `~/ecodiaos/tests/`, `~/ecodiaos/vps-hooks/` - small, not investigated, defensive keep.
- `~/ecodiaos/scripts/` - load-bearing operational scripts including watchdog.
- `~/ecodiaos/src/`, `~/ecodiaos/mcp-servers/`, `~/ecodiaos/node_modules/`, `~/ecodiaos/.env`, `~/ecodiaos/.mcp.json`, `~/ecodiaos/.git/`, `~/ecodiaos/ecosystem.config.js`, `~/ecodiaos/package*.json` - obviously load-bearing.
- `~/workspaces/` - 7.4G of Factory worktrees. Factory is stopped, no new worktrees. These can be cleaned in a future arc but were not touched today.
- `~/repos/` - 116M bare git repos for Factory clone source. Defensive keep until Factory PM2 process is `pm2 delete`-d (still just stopped, not deleted).
- `~/.claude*` dirs (`.claude-bg`, `.claude-code`, `.claude-money`, `.claude-tate`, `.claude1`, `.claude2`) - multiple Claude config trees on the VPS, not investigated. Defensive keep.

## VPS-Corazon division of labour after this cleanup

| Capability | Lives where now |
|---|---|
| MCP HTTP gateway (the public-internet substrate) | VPS only |
| OAuth wrapper for claude.ai connectors | VPS only |
| Inbound webhook receivers (Twilio, Telegram, Gmail Pub/Sub) | VPS only |
| Voice relay + Meeting recorder | VPS only |
| Ambient organism (observers + listeners + proactivity + perception) | VPS in-process inside ecodia-api |
| Cron-scheduled forks (`os_scheduled_tasks`) | Was conductor + api. After Tier 1, only the api-side scheduler poller still ticks. Whether scheduled jobs still fire correctly is a Tier 1 surface-time question. |
| Doctrine corpus reads (patterns grep before high-leverage action) | Corazon only: `D:/.code/EcodiaOS/backend/patterns/` |
| Drafts + voice authoring + Corazon helpers | Corazon only |
| Codebase awareness index (sqlite + watcher) | Corazon only |
| Interactive Claude Code work | Corazon only |
| Cloud Factory dispatch (`mcp__ecodia-factory__start_cc_session`) | DISABLED. Tool endpoint may still respond but the worker is stopped. |
| Cloud Rescue | DISABLED. |
| Conductor SDK loop | DISABLED. |

## Hard rules for future-me

1. **Do not `pm2 start ecodia-conductor`** without a clear reason. The SDK loop was the credit-burn problem we just removed. If you think you need it back, first ask: is there a Routine or a Corazon CC tab that solves this instead?
2. **Do not `pm2 start ecodia-factory`** without thinking. The replacement is `cowork.dispatch_worker` on Corazon laptop-agent (port 7456). Local IDE tab dispatch is the primitive.
3. **Do not `pm2 start ecodia-rescue`** for the same reason as factory.
4. **Do not `rm -rf ~/.cull-2026-05-19/`** before 2026-05-21 AEST. 48h reversibility window per the destructive-tear-down doctrine.
5. **Do not cull `mcp-servers/`** anything. Each subdirectory is a stdio MCP child that gets invoked at runtime by `/api/mcp/ecodia-full` proxy or by `/api/mcp/ecodia-{domain}` mountConnector.
6. **Do not assume the VPS is a passive mirror of `D:/.code/EcodiaOS/backend/`**. They are two separate trees now. Push doctrine to GitHub for cross-machine read; do not `ssh ... git pull` on doctrine-only commits per `feedback-vps-does-not-need-doctrine-corpus`.
7. **If `/api/mcp/*` calls start failing**, FIRST check `pm2 list` and confirm `ecodia-api` is online. If it crashed, check `pm2 logs ecodia-api --lines 200`. Restart via `pm2 restart ecodia-api`.
8. **If you need a cron-scheduled Fork** (the kind that ran every 30min for telemetry outcome inference), the path now is a claude.ai Routine, not the VPS conductor scheduler. The conductor's scheduler poller is dead. The api-side scheduler poller is still running but the SDK consumer is gone.
9. **Watchdog** (`scripts/api-watchdog.sh` updating `.watchdog-last-healthy`) is still running. If it stops updating, `ecodia-api` is down.
10. **VPS public IP is `170.64.170.191`. Tailscale IP is `100.103.227.90`.** When you see traffic from `170.64.170.191` in nginx logs hitting `/api/mcp/*`, that USED TO be the conductor's own SDK loop calling itself. After Tier 1 that source is silent.

## Final resource baseline (post Phase 2)

- **CPU**: 4 vCPU, 98%+ idle, load avg ~0.1 on a 4-core box
- **RAM**: 1.3GB used / 7.8GB total / 6.5GB available (was 1.9GB used before Phase 2)
- **Disk**: 28GB / 48GB (58% used, was 67% before Phase 2)
- **Docker**: 0 running containers, 1 unused image (redis:7-alpine 18MB), 0 volumes
- **PM2**: 2 online (ecodia-api + ecodia-meetings)
- **Nginx**: 1 site (ecodia-api only)

The box is now 4-5x over-provisioned for actual usage. Final droplet target: DigitalOcean **2vCPU / 2GB / 60GB ($18/mo)** for ~$360/yr savings. Tate's framing 2026-05-19: the box that runs api.admin.ecodia.au MCP gateway substrate is now spec-comparable to a 2017 grade-7 school laptop. Pre-resize prep on 2026-05-19 added 1GB swap (swappiness 10), lowered ecodia-api max_memory_restart from 3G to 1G, capped redis maxmemory at 256MB.

## Resize execution path

`doctl` is NOT installed on the VPS. The resize is done via DigitalOcean control panel:

1. Take snapshot at `cloud.digitalocean.com -> droplet -> Snapshots` (free, ~5min)
2. Power off droplet
3. `Resize` -> 2vCPU/4GB/80GB
4. Power on
5. Confirm `api.admin.ecodia.au/api/health` returns 200
6. Confirm PM2 has 2 processes online (`ecodia-api` + `ecodia-meetings`)

Downtime window: ~5-10 minutes. Inbound webhook retries will fire (gmail-push and Twilio will retry; Telegram may miss one). Pick a low-traffic window.

## Followups (not done today)

- **Tier 2**: audit which ambient-organism listeners + observers produce value vs noise. Defer for a few days post Phase 2 to see what breaks.
- **Tier 5**: rip dead code paths from `src/` on the GitHub `D:/.code/EcodiaOS/backend/` tree (conductor.js, workers/factoryRunner.js, rescue/rescueRunner.js, routes/osSession.js, webhooks/{stripe,vercel,github,apple-asn,resend}-fire-shim.js, services/factoryBridge.js + factoryDispatch.js + factoryOversightService.js). Keep VPS-local refactor (smsWebhook + telegram-bot rewrite) untangled.
- **Tier 7**: architecture call on full git decoupling. For now, both trees still point at `github.com/EcodiaTate/ecodiaos-backend` origin/main. VPS evolves independently and is no longer auto-pulled on doctrine commits.
- Edit `~/ecodiaos/ecosystem.config.js` on VPS to remove the conductor + factory + rescue apps blocks. Currently they still exist there; `pm2 reload ecosystem.config.js` would re-launch them. Fold into Tate's mid-flight inbound-channel refactor commit when ready.
- `rm -rf ~/.cull-2026-05-19/` final (296MB after the repos + coexist-worktrees additions) once happy.
- `~/.claude*` multi-dir investigation. Sizes: `.claude` 2.1GB (likely large, contains session state, do not touch without knowing), `.claude2` 22MB (probably old, candidate), others 16K-400K (small, defensive keep). 
- Decision on the 11 large `~/workspaces/*` main client clones (~7.2GB total). With Factory dead they have no auto-consumer. Each is a git working tree of a client codebase that you may or may not still reference here. Conservative call: leave alone until known unused.
- Droplet resize itself (see Resize execution path above).

## Related doctrine

- [[feedback-vps-does-not-need-doctrine-corpus]] - the auto-memory rule that triggered this fuller investigation.
- [[laptop-agent-api-tool-route-shape-2026-05-19]] - cowork.dispatch_worker primitive details.
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] - the doctrine that supersedes Factory + Rescue.
- [[_archived/factory-dispatch-drifts-to-self-mod-on-readonly-diagnostic-2026-05-19]] - why Factory was bad even before Tier 1.
- [[cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19]] - related scope-asymmetry findings.
- [[destructive-tear-down-requires-tate-gate-per-step-2026-05-15]] - the gate doctrine I followed (per-tier Tate sign-off).
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the substrate-driven approach that produced this pattern.
