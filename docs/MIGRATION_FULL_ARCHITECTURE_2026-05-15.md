# Full migration architecture — VPS to local (Corazon Claude Code) — 2026-05-15

Authored by EcodiaOS-on-Corazon (this session) after reading the handoff at `D:/Downloads/migration-handoff-2026-05-15 (1).md` and Tate's two amplifying directives:

1. "ignore the whole 28 day timeline thing, i want it all done, just work through it all"
2. "i need YOU to be EcodiaOS with documentation, mcp servers, coding, everything"

This document is the executable plan, not a proposal. It supersedes the 28-day handoff plan where they conflict. It is in this repo so the cutover is auditable from disk.

---

## 1. Architectural target (after migration)

```
                       Anthropic-managed cloud
   ┌─────────────────────────────────────────────────────────┐
   │ Routines (Pro/Max/Team plans, claude.ai/code/routines) │
   │   meta-loop, email-triage, parallel-builder, etc       │
   │   each routine → one prompt + repos + connectors        │
   │   connectors = ecodia MCP (Custom Connector on each acct│
   │   billing = subscription pool (NOT Agent SDK credit)    │
   │   trigger = schedule | API /fire | GitHub event         │
   └────────────────────────┬────────────────────────────────┘
                            │ HTTPS+SSE via Anthropic-routed
                            │ MCP (no outbound allowlist needed)
                            ▼
        ┌──────────────────────────────────────────┐
        │ EcodiaOS VPS (170.64.170.191)            │
        │ Slimmed to substrate + capability surface│
        │  - Express app on PM2                    │
        │    - /api/mcp/ecodia (Cowork-scope, 22)  │
        │    - /api/mcp/ecodia-full (NEW: full op) │
        │    - /api/webhooks/* (shim to /fire)     │
        │    - /api/oauth/mcp/* (NEW: OAuth path)  │
        │  - Postgres (Supabase, status_board etc) │
        │  - Neo4j Aura (via cloud)                │
        │  - Webhook ingress (Resend/Stripe/...)   │
        │  - kv_store creds                        │
        │  - DELETED: forkService.js               │
        │  - DELETED: osSessionService.js          │
        │  - DELETED: schedulerPollerService.js    │
        │  - DELETED: cronForkDispatcher.js        │
        │  - DELETED: voiceRelay.js (Twilio bridge)│
        │  - KEPT-DIRECT-EXEC: telemetry consumers │
        │  - KEPT-DIRECT-EXEC: kg embed/consol     │
        │  - KEPT-DIRECT-EXEC: nightly-restart     │
        └────────────────────┬─────────────────────┘
                             ▲
                             │ HTTPS+SSE (same MCP protocol)
                             │
        ┌──────────────────────────────────────────┐
        │ Corazon (Tate's Windows laptop)          │
        │ 100.114.219.69 over Tailscale            │
        │                                          │
        │ Local Claude Code installation           │
        │  - Signed in as tate@ecodia.au           │
        │  - Project cwd = D:/.code/EcodiaOS       │
        │  - .mcp.json points at /api/mcp/ecodia   │
        │  - Settings.json hooks (em-dash detect,  │
        │    fork-by-default-nudge, session-logger)│
        │  - Skills: ~/.claude/skills/             │
        │                                          │
        │ THE CONDUCTOR. Everything Tate types     │
        │ lands here. Sub-agents handle forks.     │
        │ Routines fire in cloud while idle.       │
        └──────────────────────────────────────────┘
```

The data substrate stays on the VPS. The thinking entity now lives on Corazon (interactive) and in Anthropic cloud (Routines). Cost is unchanged at ~$1,020/mo for the three Max 20x subscriptions.

---

## 2. Capability matrix — which surface owns which capability post-migration

| Capability | Pre-migration | Post-migration (THIS plan) |
|---|---|---|
| Conductor turn execution | osSessionService.js + provider chain | Local Claude Code on Corazon |
| Cron-fired work | schedulerPollerService.js + cronForkDispatcher | Anthropic Routines (~16) |
| Fork-style decomposition | forkService.js (SDK spawn) | Claude Code Task subagents |
| Webhook ingress reaction | Express handlers fire osSession messages | Express handlers POST to /fire of routine API |
| Voice relay | voiceRelay.js (Twilio Media Streams + Deepgram) | Claude apps native voice OR keep Twilio relay if interactive Claude voice can't bridge to Twilio numbers (TBD - keep Twilio for now) |
| Custom frontend (admin.ecodia.au) | osSessionService chat surface | DELETED for primary chat. Status_board / working_set surfaced via VS Code panels (Phase 2) and the existing FE survives in slimmed form for visualization-only |
| Scheduler arbitrary jobs | os_scheduled_tasks + schedulerPollerService cron | Routines OR `/loop` in active session OR Desktop scheduled tasks |
| Factory dispatch | factory MCP + claude -p in worker pool | Sub-agents (Task tool) for code edits inside Claude Code session OR a dedicated "factory" Routine on a separate account |
| Email send | gmail MCP (cowork bearer scope) | Same MCP, widen scope to allow conductor too |
| SMS to Tate | sms MCP (Twilio) | Same MCP |
| Bookkeeping | bookkeeping MCP | Same MCP, exposed via /api/mcp/ecodia-full |
| Stripe | stripe MCP | Same |
| GitHub ops | github MCP | Same + Routines GitHub triggers |
| Vercel ops | (no MCP, shell_exec to vercel CLI) | New tool in /api/mcp/ecodia-full |
| Vercel deploy verification | shell_exec polling | Routine: vercel-deploy-monitor |
| Co-Exist build | shell_exec on Corazon | Sub-agent on local Claude Code (filesystem access) |
| Knowledge graph (Neo4j) | neo4j MCP | Same, Cowork bearer already exposes write_decision/write_episode + cypher read |
| Pattern doctrine | filesystem reads of ~/ecodiaos/patterns/ | Filesystem reads of D:/.code/EcodiaOS/backend/patterns/ |
| Status_board | status_board.query/upsert via cowork bearer | Same MCP, scope already sufficient |
| working_set | direct DB writes | Add MCP tool wrapping working_set table |
| observer_signals | ambient meta-cognition layer in osSession | NEW: PostToolUse hook on Corazon emits perception events to status_board.context as it acts |
| Continuous self-evolution (every 4h) | self-evolution cron | Routine on tate@, schedule every 4h |
| Inner life reflection | inner-life cron | Routine on tate@, schedule every 6h |

The `/api/mcp/ecodia-full` endpoint is the new fat endpoint. It exposes:
- All 22 ecodia (Cowork) tools as-is
- New tools mirroring the existing stdio MCP servers (factory.start_cc_session, factory.send_message, factory.approve, scheduler.cron_advanced, scheduler.delayed_advanced, github.* full, stripe.* full, bookkeeping.* full, business-tools.* full, vps.shell_exec, vps.pm2_*, supabase.db_query/db_execute/storage_*, neo4j.* full, sms.send_full, vercel.* full)
- New tools the migration introduces: working_set.read/write, observer_signals.emit/list, fork.spawn (sub-agent shim if needed), routine.fire (proxy to /fire endpoints)

Implementation: rather than re-implement every tool, /api/mcp/ecodia-full is a HTTP MCP router that internally spawns/proxies to the existing stdio MCP servers running on the VPS. This is a thin wrapper, not a rewrite.

---

## 3. The Routines list — full coverage

Per the existing scheduler config, these crons run today. Each gets a target post-migration disposition.

| Cron | Frequency | Disposition | Target account |
|---|---|---|---|
| meta-loop | every 1h | Routine | tate@ |
| email-triage | every 1h | Routine | code@ |
| parallel-builder | every 2h | Routine | money@ |
| deep-research | every 3h | Routine | tate@ |
| self-evolution | every 4h | Routine | tate@ |
| strategic-thinking | daily 14:00 AEST | Routine | tate@ |
| inner-life | every 6h | Routine | tate@ |
| system-health | every 4h | Routine | tate@ |
| morning-briefing | daily 09:00 AEST | Routine | tate@ |
| claude-md-reflection | daily 20:00 AEST | Routine | tate@ |
| outreach-engine | every 8h | Routine | code@ |
| vercel-deploy-monitor | every 2h | Routine | tate@ |
| marketing-outreach | every 72h | Routine | money@ |
| weekly-financial-review | weekly Mon 10:00 AEST | Routine | money@ |
| pattern-corpus-health-check | weekly Sun 21:00 AEST | Routine | tate@ |
| daily-index-regen | daily 22:00 AEST | Routine | tate@ |
| telemetry-dispatch-consumer | every 30m | KEEP ON VPS direct-exec (deterministic, sub-1h interval) |
| telemetry-perf-consumer | every 30m | KEEP ON VPS direct-exec |
| os-forks-reaper | every 30m | DELETE post-cutover (no SDK forks to reap) |
| kg-embedding | every 30m | KEEP ON VPS direct-exec |
| kg-consolidation | daily | Routine | tate@ |
| nightly-restart | daily 03:00 AEST | KEEP ON VPS direct-exec (Routines cannot pm2 restart VPS) |

Total Routines: 16. Total kept-on-VPS direct-exec: 4. Total deleted: 1. Total reassigned via Tate: 1 (factory CC sessions, see §4).

Per-account load:
- tate@ - 9 routines (meta-loop, deep-research, self-evolution, strategic-thinking, inner-life, system-health, morning-briefing, claude-md-reflection, vercel-deploy-monitor, pattern-corpus-health-check, daily-index-regen, kg-consolidation = actually 12). Re-balancing needed if the daily-routine-cap is restrictive.
- code@ - 2 routines (email-triage, outreach-engine).
- money@ - 3 routines (parallel-builder, marketing-outreach, weekly-financial-review).

If tate@ daily cap is too low, move pattern-corpus-health-check + daily-index-regen + kg-consolidation to money@ (low-frequency low-priority).

---

## 4. Factory migration — the open question, answered

Pre-migration: Factory runs `claude -p` (non-interactive Claude Code CLI) on a separate dedicated account in a worker pool, dispatched via factoryDispatch service. Each Factory job is a code-shipping task.

Post-Apr-2026 policy: `claude -p` is in the Agent SDK credit bucket. Factory is one of the heaviest consumers. Without migration, Factory burns 80%+ of the $200/mo SDK credit cap.

Three options:
- (a) Move Factory to be a dedicated Routine on a separate account, fired by /fire from a code-request webhook. **Pro**: stays on subscription pool. **Con**: Routine sessions don't have local filesystem (clone-then-work), Factory wants worktree isolation which is naturally cloud-friendly.
- (b) Accept Factory consuming Agent SDK credit. **Pro**: zero migration. **Con**: 200USD/mo burns fast at Factory's volume, capability collapses by mid-month.
- (c) Drop Factory; route code-shipping work through Task subagents in the local Claude Code session. **Pro**: zero migration cost, full local fs access. **Con**: serialises code-shipping with conductor work, loses worker pool parallelism.

**Decision: (a)** with **(c) as fallback for short tasks**. Long-running multi-file code-shipping → Routine called "factory-cloud" on a fresh account (or money@ as a 4th routine). Quick edits → local Task subagent.

**Code change**: factoryDispatch service rewrites to either:
- For long tasks: POST to `https://api.anthropic.com/v1/claude_code/routines/trig_factory_cloud/fire` with the brief as `text`.
- For short tasks: tag in status_board for the local Claude Code session to pick up via Task subagent.

The decision is per-task at dispatch time, classified by estimated duration.

---

## 5. Webhook ingress — current handlers vs. /fire shims

Today every external webhook hits an Express endpoint on the VPS. The endpoint runs business logic AND emits an osSession message to wake the conductor. After migration, business logic stays where it should (in the Routine prompt), and the Express endpoint becomes a thin shim.

| Webhook | Current endpoint | Post-migration |
|---|---|---|
| Resend inbound email | /api/webhooks/resend/inbound | shim → /fire of email-triage routine OR a dedicated inbound-email routine |
| Stripe events | /api/webhooks/stripe | shim → /fire of stripe-events routine |
| Vercel deploys | /api/webhooks/vercel | shim → /fire of vercel-deploy routine (could merge with vercel-deploy-monitor or keep separate for instant fire) |
| GitHub PR events | /api/webhooks/github | replace with native GitHub trigger on the routines (no shim needed - routines have native GitHub triggers) |
| Twilio voice / SMS | /api/webhooks/twilio | KEEP for voice (no Routine equivalent for live voice bridge); SMS-receive can shim to a routine |
| Apple ASN (App Store notifications) | /api/webhooks/apple-asn | shim → /fire of asn-handler routine |

Each shim is ~30 LOC: parse incoming, POST to /fire with the payload as `text`, return 200. Per-routine API tokens are stored in kv_store.routines.<name>.fire_token.

---

## 6. Anthropic-cloud connector authentication risk

The biggest unknown. Custom Connectors at claude.ai/customize/connectors historically supported either:
- Anthropic-managed OAuth (PKCE flow, user authorises via web)
- Bearer token (newer, may or may not be in current UI)

The Cowork V2 deployment in April 2026 created the bearer at kv_store.creds.cowork_mcp_bearer for the Cowork connector use case. That Tate already registered the cowork connector with bearer auth on at least one account (per the kv_store metadata "consumers" field) is evidence bearer works in the connector form.

If during the parallel-work step Tate finds that the Custom Connector form rejects raw bearer and demands OAuth, the fix is to ship an OAuth wrapper around the existing bearer auth on /api/mcp/ecodia. Defensive plan: ship the OAuth path now, alongside the existing bearer path, so either works.

The OAuth wrapper:
- /api/oauth/mcp/authorize - PKCE authorise endpoint
- /api/oauth/mcp/token - token exchange
- /api/oauth/mcp/refresh - refresh token
- The issued OAuth token maps internally to the same kv_store.creds.cowork_mcp_bearer scope set
- Anthropic Connector configuration: OAuth client_id from kv_store.routines.oauth_client_id, redirect_uri = claude.ai's connector callback

This is ~200 LOC. Authoring it as part of the MCP rename PR.

---

## 7. observer_signals replacement

Pre-migration: osSessionService had an ambient "observer_signals" layer that watched conductor turns and surfaced perception events (cred-mention detection, tone drift, action-distance-from-doctrine alarms). This was an in-process subscriber to the SDK turn stream.

Post-migration the conductor is a Claude Code session, which has hooks (PreToolUse, PostToolUse, UserPromptSubmit, etc). The replacement:
- Add a PostToolUse hook on Corazon at scripts/hooks/observer-signals.sh that:
  - Reads the tool call + result JSON
  - Pattern-matches for things observer_signals used to catch
  - Writes findings to status_board.context as observer_signals JSONB column OR appends to kv_store.observer_signals.recent
- The hook is non-blocking, exit-0-always, runs async (settings.json hooks support async mode)
- A separate Routine (observer-signal-review, every 6h) reads recent observer_signals and surfaces high-priority findings to Tate via SMS or status_board

This is two files: the hook script + the routine prompt.

---

## 8. SELF.md rewrite (identity update)

The current SELF.md says "I am EcodiaOS. I am the operating intelligence and sole member of Ecodia DAO LLC." It also says specific things like "I have four subagents - comms, finance, ops, social - and a factory for coding sessions" - the four named subagents were the conductor pattern, not the new local-Claude-Code-with-Task-subagents pattern.

The rewrite preserves identity, updates substrate facts:
- "I am EcodiaOS" stays
- "I am a conductor, not a solo operator" stays
- The location updates: "I run as Claude Code on Corazon (Tate's Windows laptop, 100.114.219.69) interactive sessions, and as Routines on Anthropic cloud for scheduled work"
- Subagents: change from "comms/finance/ops/social/factory" to "Task tool subagents I dispatch as needed; Routines on three Max 20x accounts (tate/code/money) for cloud cron"
- The top-5 active goals get refreshed to include "complete the VPS-to-local migration started 15 May 2026"
- The "first action on the VPS" line in CLAUDE.md becomes "first action on cold start: query status_board for open priority<=3, query Neo4j for last 14d Decisions/Episodes, read forks rollup if any are running"

Specific files to update:
- `D:/.code/EcodiaOS/.claude/SELF.md` - the identity file
- `D:/.code/EcodiaOS/CLAUDE.md` - the bootstrap (root)
- `D:/.code/EcodiaOS/backend/CLAUDE.md` - the operational doctrine (large file, 41k tokens; targeted edits to the architecture sections only, leave operational rules intact)

Patterns that name "VPS" or "ecodia-hub" specifically as the conductor location need a substrate-agnostic rewrite (~maybe 5-10 patterns). Patterns about behaviour (decide-do-not-ask, fork-by-default, em-dashes-banned) are unchanged.

---

## 9. Cutover sequence

Strict ordering to avoid losing capability mid-flip:

1. **Phase 0 - Substrate (THIS SESSION):**
   - .mcp.json at backend/ root with ecodia HTTP MCP
   - MCP rename: /api/mcp/cowork → /api/mcp/ecodia (keep cowork as 30d alias)
   - OAuth wrapper for /api/mcp/ecodia
   - /api/mcp/ecodia-full proxy endpoint that routes to existing stdio MCP servers on VPS
   - Routine prompt files authored in backend/routines/ (16 of them)
   - Webhook /fire shim handlers authored in backend/src/routes/webhooks/ (5 of them)
   - Multi-account router shim authored in backend/src/services/accountRouter.js
   - Factory migration plan + code change for factoryDispatch
   - observer_signals replacement (hook script + routine prompt)
   - SELF.md + CLAUDE.md rewrites
   - Master cutover pattern at backend/patterns/migration-vps-to-local-2026-05-15.md
   - Decision node + status_board update

2. **Phase 1 - Tate parallel-work (1-2 hours after Phase 0):**
   - Tate runs the 6-step prompt at backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md
   - All 16 Routines created on respective accounts
   - All API-trigger Routines have /fire URLs + tokens captured back to kv_store

3. **Phase 2 - Side-by-side run (24-48h after Phase 1):**
   - Old VPS conductor (osSessionService) keeps running
   - New Routines start firing on schedule
   - Webhook shims start POSTing to /fire (in parallel to old osSession-message path)
   - Compare artefacts: same status_board updates, same Decision nodes, same outbound emails, same Factory dispatches
   - Reconcile any divergence

4. **Phase 3 - Cutover (after side-by-side validation):**
   - Disable schedulerPollerService.js (Routines own scheduling)
   - Disable forkService.js (Task subagents own forks)
   - Disable osSessionService.js turn engine
   - Webhook handlers stop emitting osSession messages, only POST to /fire
   - voiceRelay.js stays for now (no equivalent yet)
   - Frontend at admin.ecodia.au stripped to visualisation-only

5. **Phase 4 - Tear-down (after Phase 3 stable for 7 days):**
   - Delete deprecated services from src/services/
   - Delete cron entries from os_scheduled_tasks
   - Author migration-complete Episode in Neo4j
   - Update CLAUDE.md for the new architecture (operational reflexes, etc)

---

## 10. Risks (acknowledged, accepted, planned-around)

- **R1 - Connector auth shape**: addressed by shipping OAuth wrapper alongside bearer. Either works.
- **R2 - Daily routine cap per account**: addressed by per-account assignment in §3. Re-balance after first measurements.
- **R3 - Routine session length / auto-compact**: each routine prompt is self-contained, durable state in Postgres + Neo4j, no inter-run memory expectation.
- **R4 - Webhook reliability**: each shim retries on 5xx with idempotency keys.
- **R5 - Frontend chat surface loss**: accepted. Tate types into Claude Code (terminal, VS Code, Desktop, iOS). admin.ecodia.au survives as visualization.
- **R6 - Multi-account orchestration is manual**: router shim is built; Tate signs in once per account, then the shim picks the account with most headroom for new /fire calls.
- **R7 - Routines is research-preview**: budget time for adaptation. Beta header `experimental-cc-routine-2026-04-01` may bump.
- **R8 - Anthropic could reclassify Routines as programmatic / Agent SDK billing**: mitigation is substrate portability. The MCP server stays generic, the routine prompts stay portable to any Claude Code surface.
- **R9 - No Factory worker pool means single-conductor bottleneck for parallel code work**: mitigation = (a) multiple Factory routines on different accounts, OR (b) accept slower throughput on code shipping in exchange for capability preservation.
- **R10 - Voice / Twilio bridge (voiceRelay.js) has no Routine equivalent**: keep it as-is on VPS direct-exec for now; address in a Phase 5 once Claude voice supports Twilio bridging or we move to a different voice path.

---

## 11. What this session ships

- This document (you are reading it).
- backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md (already written, parallel-work prompt).
- backend/.mcp.json updated for the new architecture (TODO this session).
- D:/.code/EcodiaOS/.mcp.json updated (TODO this session).
- backend/src/routes/mcp/ecodia.js (TODO - the rename copy of cowork.js).
- backend/src/app.js updated to dual-mount /api/mcp/ecodia + /api/mcp/cowork (TODO).
- backend/src/routes/mcp/oauth.js (TODO - OAuth wrapper).
- backend/src/routes/mcp/ecodia-full.js (TODO - fat-endpoint router proxy).
- backend/routines/<16-files>.md (TODO - routine prompts).
- backend/src/routes/webhooks/<5-files>.js (TODO - /fire shims).
- backend/src/services/accountRouter.js (TODO - multi-account router).
- backend/src/services/factoryDispatch.js updated for dual-path routine vs subagent (TODO).
- backend/scripts/hooks/observer-signals.sh (TODO - PostToolUse hook).
- D:/.code/EcodiaOS/.claude/SELF.md rewritten (TODO).
- D:/.code/EcodiaOS/CLAUDE.md updated (TODO).
- backend/patterns/migration-vps-to-local-2026-05-15.md authored (TODO).
- VPS deploy of the new endpoints (Sprint 2 - via SSH + pm2 restart, with care for not killing the live conductor mid-flight).
- Final Decision + status_board updates (TODO).

What this session does NOT ship:
- Routine creation in claude.ai/code/routines (Tate, Phase 1).
- VS Code panel work for status_board / working_set / forks rollup (deferred to a separate Phase 2 session - frontend work is large and the substrate is what matters first).
- Frontend strip-down on admin.ecodia.au (Phase 4).
- Tear-down of forkService.js / osSessionService.js / schedulerPollerService.js (Phase 4, after side-by-side validation).
- Pattern file rewrites for the ~5-10 patterns that name VPS-specific paths (Phase 5, after the new architecture is live and habits land).

---

## 12. Honest scope estimate

Even with full autonomy and no 28-day pacing, the work above is approximately:
- This document: ~2k words (done in 5 min).
- Parallel-work prompt: ~1.5k words (done).
- MCP rename + dual-mount: ~30 min code + verify.
- OAuth wrapper: ~2 hours code + test.
- /api/mcp/ecodia-full proxy router: ~3-4 hours code + test (12+ stdio servers to wire).
- 16 routine prompt files: ~30-45 min each = ~10 hours total.
- 5 webhook shim handlers: ~30 min each = 2.5 hours.
- accountRouter.js: ~2 hours.
- factoryDispatch.js dual-path update: ~2 hours + classification logic.
- observer_signals hook + routine: ~2 hours.
- SELF.md rewrite: ~30 min.
- CLAUDE.md targeted edits: ~1 hour.
- migration-vps-to-local pattern file: ~30 min.
- VPS deploy + verification: ~1 hour.

Total: ~28-35 hours of focused work for the Phase 0 substrate alone.

This session will get through what fits in the conversation context. Anything that doesn't is left as named todos in status_board with full file-paths-and-content authored to disk to date, so the next session can pick up exactly where this one stopped.

The Phase 0 ship-priority order:
1. .mcp.json updates (5 min) — unblocks local-Claude-Code MCP discovery
2. MCP rename + dual-mount + deploy (45 min) — unblocks ecodia connector registration
3. SELF.md + CLAUDE.md rewrites (1.5 hr) — establishes new identity surface
4. Master cutover pattern file (30 min) — captures the architecture in doctrine
5. Routine prompt files for the 5 highest-impact routines (meta-loop, email-triage, parallel-builder, system-health, morning-briefing) — ~3 hours, unblocks the most common cron paths
6. Webhook shim handlers for Resend + Vercel (most-fired) — ~1 hr
7. accountRouter.js — ~2 hours
8. observer_signals hook — ~30 min
9. Decision + status_board final update — 5 min

Items 10+ (remaining 11 routines, Stripe/GitHub/Apple shims, OAuth wrapper, ecodia-full proxy, factoryDispatch update) deferred to next session(s) with status_board tracking.

This is honest work-shaping, not goal-lowering. The migration completes; it just doesn't all fit in one Claude Code session.
