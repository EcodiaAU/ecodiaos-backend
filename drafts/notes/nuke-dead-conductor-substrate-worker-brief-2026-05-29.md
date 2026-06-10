# WORKER BRIEF: Audit + Nuke Dead EcodiaOS Conductor Substrate

**task_id:** `nuke-dead-conductor-substrate-2026-05-29`
**status_board row:** `367c1a79-771f-40ba-a755-92cf230d9c53`
**branch:** `chore/nuke-dead-conductor-substrate-2026-05-29`

## Mission

Audit every file in the EcodiaOS backend services + routes + listener tree. Classify each as ALIVE, DEAD, or UNCERTAIN against a strict consumer-surface probe protocol below. Delete the DEAD set on a feature branch. Document the UNCERTAIN set for conductor review. Leave ALIVE alone. Everything earns its spot. The cost of leaving a dead file is small (clutter, lint, occasional doctrine drift). The cost of deleting a load-bearing file is catastrophic (silent SMS outage, voice route dark, scheduled crons silently dropping, MCP gateway losing a tool surface). Bias toward keeping when probes are inconclusive.

## The "earns its spot" rule

A file earns its spot only by having at least one LIVE consumer surface that you have empirically verified, not just inferred from grep. Inference says a route is alive because the express router imports it. Empirical says the route returned a non-404 to a probe in the last hour OR a webhook landed on it in the last 7 days OR a cron prompt body explicitly POSTs to it. Trust empirical over inference.

## Substrate map

The EcodiaOS backend lives in two mirrored locations. Probe both:
- Corazon-side: `D:/.code/EcodiaOS/backend/` (this is the git working tree)
- VPS-side: `~/ecodiaos/` on `tate@100.103.227.90` over Tailscale (the live PM2 runtime, deployed via `git pull` from the GitHub repo `EcodiaTate/ecodiaos-backend` or similar)

These are NOT git remotes of each other. The VPS pulls from GitHub. Local changes ship via `git push` then `ssh tate@100.103.227.90 'cd ~/ecodiaos && git pull'`. For THIS work you do NOT push to the VPS and you do NOT pull on the VPS. Local changes stay on a feature branch.

## Consumer-surface probe targets

For each candidate file, you must probe every relevant target below. A file is DEAD only if every probe comes back negative.

1. **Express routes that import the module.** `grep -rn "require.*<modulename>\|from.*<modulename>" D:/.code/EcodiaOS/backend/src/routes/`
2. **Other services that import the module.** Same grep across `src/services/`.
3. **Tests that exercise the module.** Same grep across `tests/`, `__tests__/`, `*.test.js`, `*.spec.js`.
4. **PM2 process scripts** on the VPS. SSH and run `pm2 list` plus `cat ~/.pm2/dump.pm2 | grep <modulename>`.
5. **Cron jobs.** `mcp__ecodia-full__schedule_list` to see active scheduled tasks. Then read `backend/routines/*.md` and grep every prompt body for any reference to the module, any `/api/<path>` it owns, or any concept it implements.
6. **Postgres triggers and pg_notify channels.** `SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal;` and grep results for the module name or the routes it owns.
7. **Twilio inbound webhooks.** Check `src/routes/twilio*`, `src/routes/sms*`, and `src/routes/webhooks/twilio*`. Look at Twilio webhook URL config in `kv_store.creds.twilio*` or via the live Twilio dashboard if needed.
8. **Voice route** (the away_fetch, Pushcut, voice-to-Tate channel). Likely lives in `src/routes/voice*`, `src/routes/away*`, or `src/services/voice*`. Trace.
9. **Telegram** if it exists. `src/routes/telegram*` or similar.
10. **Stripe webhooks.** `src/routes/stripe*`, `src/routes/webhooks/stripe*`.
11. **Vercel deploy webhooks.** `src/routes/webhooks/vercel*`.
12. **Apple ASN webhooks.** `src/routes/webhooks/apple-asn*`.
13. **GitHub webhooks.** `src/routes/webhooks/github*`.
14. **iOS-native conductor app.** Status board row `c80b1241` tracks the native rewrite arc on branch `feat/ios-native-foundation`. Search the iOS Swift codebase for any HTTP client that points at `api.admin.ecodia.au` or `/api/os-session` or any of the candidate routes. Worktree at the GitHub repo URL stored under that project.
15. **Laptop-agent at `D:/.code/eos-laptop-agent/`.** Grep for any HTTP call back to the VPS that hits one of the candidate routes.
16. **claude.ai routine prompts at `backend/routines/*.md`.** 20 routine prompt bodies. Grep every prompt body for: (a) the module name, (b) every `/api/<path>` the module owns, (c) any concept the module implements (e.g. "checkpoint", "working_set", "outcome_verification", "claim", "escalate").
17. **MCP server tool implementations.** `src/routes/mcp/cowork.js` and `src/routes/mcp/ecodia-full.js` and similar. Does the MCP layer expose a tool that wraps this service? If yes, the tool is live (people use the MCP) and the service is alive.
18. **Documentation that names the module as live.** Grep `backend/docs/` and `backend/clients/` for the module name. Documentation can be wrong but it is a hint.

## Suspected DEAD candidates (probe each independently, do not trust the suspicion)

The following are SUSPECTED dead per recent CLAUDE.md doctrine cleanup. Each one needs its own probe pass before deletion:

- `src/services/osSessionService.js` + `src/routes/osSession.js` + any `/api/os-session/*` route
- `src/services/cronForkDispatcher.js` + any cron-fork dispatch helpers
- `src/services/outcomeVerificationService.js`
- `src/services/failureEscalateService.js`
- `src/services/workingSetService.js`
- `src/services/conductorClaimsService.js`
- `src/services/forkService.js` (the SDK fork primitive, dead per `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md`)
- `src/services/nightlyRestartService.js`
- `src/services/sessionHandoff.js`
- `listener-tier/` daemons (the file-watcher tier per backend/CLAUDE.md "code on disk but no PM2 supervision, registry shows last_fired_ts: null fire_count: 0 for every listener")
- `frontend/` if any of it remains on disk
- `src/services/perceptionService.js`
- `src/services/schedulerPollerService.js` (if VPS-side polling is dead because scheduling moved to laptop-agent `scheduler.delayed`/`scheduler.cron` MCP tools)
- `src/services/observerSignalsService.js` (if observer signals moved to hooks under `~/.claude/hooks/ecodia/`)
- `src/services/workingSetService.js`
- `src/services/conductedRestart.js`
- Any "Director" services if they no longer fire
- Any factory CLI / Factory dispatch service code (dead per Phase 1 migration 2026-05-26 per CLAUDE.md residual-deprecations table)

This is a STARTING set. Discover others as you walk `src/services/` and `src/routes/`.

## Channels that MUST keep working

Before declaring ANYTHING dead, verify these channels are alive by SOME probe. If a channel that should be alive is dark, surface it as P1 and STOP. Do not delete anything until the dark channel is explained.

1. **MCP gateway at `https://api.admin.ecodia.au/api/mcp/ecodia-full`.** Bearer from `D:/PRIVATE/ecodia-creds/` or `kv_store.creds.ecodia_full_mcp_bearer`. POST `tools/list` and verify ~157 tools return.
2. **MCP gateway at `https://api.admin.ecodia.au/api/mcp/cowork`.** Bearer from `kv_store.creds.cowork_mcp_bearer`. POST `tools/list` and verify ~22 tools return.
3. **Twilio inbound SMS.** Send a test SMS to the EcodiaOS number, watch for a substrate write within 60 seconds (status_board, kv_store, or a log line).
4. **Voice route.** Whatever the away_fetch / Pushcut / voice channel is, probe it.
5. **Gmail webhook.** Recent activity in `email_threads` table within last 24h confirms live.
6. **Stripe webhook.** Recent activity in `kv_store.stripe.last_event_ts` or webhook log within last 7 days.
7. **Vercel deploy webhook.** Recent activity per the vercel-deploy-monitor cron.
8. **Apple ASN webhook.** Recent activity within last 14 days (TestFlight builds fire ASN).
9. **Scheduler firing.** `mcp__ecodia-full__schedule_list` shows recent fires.
10. **claude.ai routines firing.** The "Routines paused, daily limit reached" email today confirms at least some are firing.
11. **iOS-native conductor sending messages back.** If status board row `c80b1241` is in the `native_rewrite_arc_2026-05-28_foundations_committed` state, the iOS app may or may not be POSTing yet. Check the branch.

## Verification protocol per candidate file

For each suspected-dead candidate AND each file under `src/services/`, `src/routes/`, `listener-tier/` that you discover:

1. `git log --follow -- <file>` to see last-touched date and recent commits.
2. `grep -rn "require.*<basename>\|from.*<basename>" D:/.code/EcodiaOS/backend/src/`
3. `grep -rn "<routename>" D:/.code/EcodiaOS/backend/routines/`
4. `grep -rn "<routename>" D:/.code/eos-laptop-agent/`
5. SSH to VPS and `grep -rn` the same patterns under `~/ecodiaos/src/`.
6. SSH to VPS and `grep <basename> ~/.pm2/dump.pm2`.
7. Check Postgres pg_trigger for any trigger that pg_notify a payload routed to this service.
8. Check if any external system POSTs to a path this file owns. Cross-reference webhook URLs in `kv_store.creds.*.webhook_url` or third-party dashboards.
9. If NO live consumer found across all probes, mark **DEAD**.
10. If ANY live consumer found, mark **ALIVE** and document the consumer (file path + line number + what triggers it).
11. If probes are inconclusive (dynamic require, env-var-gated route, runtime registration), mark **UNCERTAIN** and document why.

## Deletion procedure

1. Cut feature branch from current `main`: `git checkout -b chore/nuke-dead-conductor-substrate-2026-05-29`
2. One commit per DEAD file or per coherent group (e.g. service + its route + its tests together). Commit message names every probe that confirmed DEAD.
3. After all DEAD files committed, push to origin: `git push -u origin chore/nuke-dead-conductor-substrate-2026-05-29`
4. Do NOT merge to main. The conductor merges after review.
5. Do NOT pull on the VPS. The conductor coordinates restart and pull.

## Output deliverables (in this order)

1. **Audit document** at `D:/.code/EcodiaOS/backend/drafts/conductor-substrate-nuke-audit-2026-05-29.md`. Sections: (a) channels-alive probe results, (b) one row per file checked with file path, verdict (DEAD/ALIVE/UNCERTAIN), probes run, evidence, (c) summary count, (d) feature-branch SHA.
2. **Feature branch** with deletion commits pushed to origin.
3. **status_board UPDATE** on row `367c1a79-771f-40ba-a755-92cf230d9c53`. Set status to `worker_audit_complete_<N>_dead_<M>_alive_<K>_uncertain_branch_<sha>` and next_action to `conductor reviews audit at <path> + branch + merges or rolls back`.
4. **coord.signal_done** with `{terminate: true, summary: "<N> dead deleted across <X> commits, <M> alive kept, <K> uncertain documented. Audit at <path>. Branch <name> at <sha>."}`
5. **coord.close_my_tab** as the final action.

## Anti-actions (do NOT under any circumstance)

- Do NOT delete files on the VPS via `shell_exec`. All file changes happen in the local Corazon working tree on the feature branch.
- Do NOT pm2 restart anything on the VPS. The conductor coordinates restart.
- Do NOT touch hooks under `C:/Users/tjdTa/.claude/hooks/ecodia/`. Hooks are alive.
- Do NOT touch `D:/.code/EcodiaOS/backend/patterns/*`. Doctrine corpus is alive.
- Do NOT touch `D:/.code/EcodiaOS/backend/voice/*`. Voice scorer is alive.
- Do NOT touch `D:/.code/EcodiaOS/backend/.claude/skills/*`. Skills are alive.
- Do NOT touch `D:/.code/eos-laptop-agent/`. Laptop-agent is alive.
- Do NOT touch `src/routes/mcp/*.js` UNLESS your probes prove a specific tool the file exposes is dead. The MCP gateway is load-bearing.
- Do NOT push to main. Feature branch only.
- Do NOT merge the feature branch yourself.
- Do NOT delete anything classified UNCERTAIN.
- Do NOT delete a file because it "looks deprecated" or "is mentioned as historical in CLAUDE.md". The probe is the verdict, not the commentary.

## Worker identity + termination

You are a dispatched worker on a Corazon-local IDE tab spawned via `cowork.dispatch_worker`. You signal back to the conductor at `localhost:7456` via `coord.*` MCP tools. When done, the final two actions in order are `coord.signal_done({terminate: true, summary: "..."})` then `coord.close_my_tab`. Without the close the tab persists and burns IDE memory.

## Timeout budget

This is a thorough audit. Take the time. The worker chat may run for hours. Use `coord.heartbeat` periodically so the conductor knows you are alive. If you hit a hard blocker (cannot reach VPS, cannot find a kv_store credential), use `coord.send_message` to ask the conductor before guessing.

## Final reminder

Everything earns its spot. Empirical verification beats inferred liveness. Bias toward keeping. When in doubt, mark UNCERTAIN and let the conductor decide. The audit document is the durable deliverable regardless of how many files get deleted in this pass.
