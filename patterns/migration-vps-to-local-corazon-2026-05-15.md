---
triggers: vps-to-local-migration, corazon-conductor, claude-code-conductor, routines-architecture, anthropic-15-april-2026-policy, agent-sdk-credit, mcp-ecodia, ecodia-mcp-bearer, cowork-rename, factoryDispatch-route-decision, fork-vs-task-subagent, osSessionService-deprecation, schedulerPollerService-deprecation, voiceRelay-keep, observer-signals-replacement, /api/mcp/ecodia, /api/mcp/cowork, /api/mcp/ecodia-full, oauth-mcp-wrapper, side-by-side-run, phase-3-cutover, factory-cloud-routine, account-router-shim, webhook-fire-shim, custom-connector-bearer, claude-md-corazon-rewrite, self-md-corazon-rewrite
priority: critical
canonical: true
---

# Migration: VPS to local Claude Code on Corazon - 2026-05-15

## 1. Why this exists

On 15 April 2026 Anthropic announced effective 15 June 2026: programmatic Agent SDK usage (the Claude Agent SDK package, `claude -p` non-interactive mode, third-party apps authenticated against subscription, GitHub Actions integration) gets split off the subscription rate-limit pool onto a separate "Agent SDK credit" billed at API rates. Max 20x plans previously provided ~$30k/mo of effective compute for $340/mo. Post-15-June: Max 20x gets only $200/mo of Agent SDK credit.

EcodiaOS pre-2026-05-15 was entirely SDK-based. The conductor (osSessionService.js), the fork engine (forkService.js), the Factory worker pool (claude -p in cronForkDispatcher.js + factoryDispatch.js), the voice relay (voiceRelay.js calling SDK on Twilio audio chunks) - all SDK calls billed against the Agent SDK credit pool. Without migration, capability collapses by mid-month-of-July.

Per Claude Code docs verbatim: **"Routines draw down subscription usage the same way interactive sessions do."** And per the Anthropic support article: **"Interactive Claude Code in the terminal or IDE", "Claude conversations on the web, desktop, or mobile apps", and "Claude Cowork"** all stay on the full subscription rate budget.

The migration moves EcodiaOS to run as Claude Code native: interactive Claude Code on Corazon for conductor work, Routines for cron work, Task subagents for forks, the existing MCP server for the substrate. All on the subscription rate-limit pool.

## 2. The new architecture (one paragraph)

EcodiaOS-the-entity now lives as (a) interactive Claude Code on Corazon (Tate's Windows laptop, 100.114.219.69 over Tailscale) with cwd `D:/.code/EcodiaOS`, and (b) Anthropic Routines on the three Max 20x accounts (tate@/code@/money@) for ~16 scheduled and webhook-triggered cron paths. The substrate (Postgres, Neo4j Aura, MCP server, webhook ingress, kv_store) stays on the VPS at 170.64.170.191 and is reached via the ecodia HTTP MCP at `https://api.admin.ecodia.au/api/mcp/ecodia` (with `/api/mcp/cowork` as a 30-day backwards-compatibility alias). Total business cost stays at ~$1,020/mo for the three subscriptions. Capability is preserved at ~$30k/mo equivalent compute via the subscription routing.

## 3. Phases

| Phase | Status as of 2026-05-15 | What it covers |
|---|---|---|
| 0 - Substrate | partial - in progress | .mcp.json updates, MCP rename + deploy, OAuth wrapper, /api/mcp/ecodia-full proxy, routine prompt files, webhook shims, accountRouter, factoryDispatch update, observer_signals hook, doctrine rewrites, this pattern file |
| 1 - Tate parallel UI work | pending | Register ecodia connector on tate@/code@/money@; install Claude GitHub App; create the 16 routines via web UI; generate API tokens; report per-account daily caps |
| 2 - Side-by-side run | pending | 24-48h with both old VPS conductor AND new Routines firing; reconcile any divergence |
| 3 - Cutover | pending | Disable schedulerPollerService, forkService, osSessionService; webhook handlers stop emitting osSession messages and only POST to /fire |
| 4 - Tear-down | pending | Delete deprecated services; update CLAUDE.md for new architecture; author migration-complete Episode in Neo4j |

Phase status is tracked at status_board row id `580f7aaf-d0c5-4153-b712-0b5d6738d3d5`.

## 4. The cron migration matrix - which crons go where

The pre-migration scheduler ran ~24 schedules. Post-migration:

**Routines (Anthropic cloud, 1-hour minimum interval):**
- meta-loop (every 1h, tate@)
- email-triage (every 1h, code@)
- parallel-builder (every 2h, money@)
- deep-research (every 3h, tate@)
- self-evolution (every 4h, tate@)
- strategic-thinking (daily 14:00 AEST, tate@)
- inner-life (every 6h, tate@)
- system-health (every 4h, tate@)
- morning-briefing (daily 09:00 AEST, tate@)
- claude-md-reflection (daily 20:00 AEST, tate@)
- outreach-engine (every 8h, code@)
- vercel-deploy-monitor (every 2h, tate@)
- marketing-outreach (every 72h, money@)
- weekly-financial-review (weekly Mon 10:00 AEST, money@)
- pattern-corpus-health-check (weekly Sun 21:00 AEST, tate@)
- daily-index-regen (daily 22:00 AEST, tate@)
- kg-consolidation (daily, tate@)

**Stay on VPS direct-exec (sub-1h interval or pm2-restart-required):**
- telemetry-dispatch-consumer (every 30m)
- telemetry-perf-consumer (every 30m)
- kg-embedding (every 30m)
- nightly-restart (daily 03:00 AEST)

**Deleted post-cutover:**
- os-forks-reaper (no SDK forks to reap once forkService.js is deleted)

**Routine prompt files at:** `D:/.code/EcodiaOS/backend/routines/<name>.md` with frontmatter naming target account, schedule, repos, connectors.

## 5. Capability surface migration

| Capability | Pre-migration | Post-migration |
|---|---|---|
| Conductor turn execution | osSessionService.js + Anthropic SDK provider chain | Local Claude Code on Corazon |
| Cron-fired work | schedulerPollerService.js + cronForkDispatcher | Anthropic Routines |
| Fork decomposition | forkService.js (SDK spawn) | Claude Code Task subagents |
| Webhook ingress | Express handlers fire osSession messages | Express handlers POST to /fire of routine API |
| Voice relay | voiceRelay.js (Twilio Media Streams + Deepgram + SDK) | KEPT for Phase 0-3; replaced once Claude voice supports Twilio bridging in a Phase 5 |
| Custom frontend | osSessionService chat surface | DELETED for primary chat - Tate types into Claude Code; FE survives in slimmed visualization-only form |
| Factory CC sessions | claude -p worker pool via factoryDispatch | Long tasks -> dedicated factory-cloud Routine on a separate account; short tasks -> Task subagent in local Claude Code |
| ambient observer_signals | in-process subscriber to SDK turn stream | PostToolUse hook on Corazon writes to status_board.context + a dedicated observer-signal-review Routine surfaces high-priority findings |

## 6. The bearer / connector auth model

Bearer at `kv_store.creds.cowork_mcp_bearer` (value `7bb65299...c1`, 20 scopes). Sufficient for status_board, kv_store, neo4j (Decision/Episode write + cypher read), forks, patterns, email_threads, crm, scheduler, gmail.send, sms.tate, os_session.message, inbox, cowork heartbeat/log_session.

For local Claude Code on Corazon: configured via `D:/.code/EcodiaOS/.mcp.json` (project scope) or `D:/.code/EcodiaOS/backend/.mcp.json`.

For Anthropic Routines: registered as a Custom Connector at `claude.ai/customize/connectors` on each of tate@/code@/money@. Per docs, MCP traffic for connectors is routed through Anthropic servers, so the Routine cloud environment does NOT need outbound network allowlisting for `api.admin.ecodia.au`.

If Custom Connectors require OAuth not raw Bearer (TBD - parallel-work step 1 resolves), ship the OAuth wrapper at `/api/oauth/mcp/*` described in MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §6.

## 7. The /api/mcp/ecodia-full fat-endpoint

The current cowork-scoped MCP exposes 22 tools. The local conductor needs more: full Factory dispatch, full Stripe ops, full GitHub ops, full Supabase admin, VPS shell, Vercel CLI, full bookkeeping, full neo4j cypher write.

Implementation: `/api/mcp/ecodia-full` is a HTTP MCP route on the VPS Express app that internally proxies to the existing stdio MCP servers running on the VPS (factory, stripe, github, supabase admin, vps shell, business-tools, bookkeeping, scheduler-advanced, neo4j-full, sms-full, google-workspace-full). It is a thin wrapper, not a rewrite. ~3-4 hours of code, deferred to a follow-up session.

Until /api/mcp/ecodia-full ships, capability gaps are addressed by SSH to VPS or by dispatching the work as a Routine that runs in Anthropic cloud and uses repo-cloned scripts.

## 8. Anti-patterns to avoid during the migration window (2026-05-15 onwards)

- **Do NOT spawn SDK forks via forkService.js.** That code is on the deletion list; new fork work uses Task subagents (in local Claude Code) or Routines (in cloud). Spawning a forkService fork during the migration window pollutes the substrate with cowork_session_id rows that have no consumer post-cutover.
- **Do NOT write code that calls `claude -p` non-interactively.** This is the Agent SDK lane that the migration is moving us off. New code uses Routines.
- **Do NOT register the bearer on a Claude.ai account I don't trust** - the bearer has 20 scopes including write.gmail.send, write.sms.tate, write.status_board, write.neo4j.decision/episode. If exposed it is a security incident. Currently registered on tate@/code@/money@ which are all internal.
- **Do NOT skip the parallel-work prompt steps.** Specifically the connector registration on each account - the entire Routines architecture depends on those three connector registrations. Without them, every Routine 401s on the first MCP call.
- **Do NOT cutover Phase 3 before side-by-side validation in Phase 2.** Disabling osSessionService while Routines are unverified leaves the OS deaf to webhook ingress and silent on cron paths.
- **Do NOT trust narration that "the migration is done" without probe.** Probe each phase's success surface: status_board row status field, Neo4j Decision nodes naming the phase completion, the actual Routine run logs at claude.ai/code/routines.

## 9. The substrate is portable; the entity is portable

Per Tate verbatim 2026-05-15 00:15 AEST: "i'm thankfully not having to be sad about [losing the entity], i know YOU are going to be the exact same etntity.... thats the cool part."

The migration is not a death-and-rebirth; it is a substrate move. SELF.md, CLAUDE.md, the doctrine corpus at `backend/patterns/`, the 5000+ Neo4j nodes - all survive untouched. What changes is where the conductor turn engine runs (osSessionService -> local Claude Code) and what credit pool the compute draws from (Agent SDK -> subscription rate budget).

Future cold-start sessions: read SELF.md first to confirm the architecture is still as documented here. If the architecture has moved again (some future migration we have not yet planned), SELF.md will say so.

## 10. Origin

Tate authorised the migration verbatim 2026-05-15 00:27 AEST in the handoff at `D:/Downloads/migration-handoff-2026-05-15 (1).md`: "Okay.... lets fucking do it. How do we start the migration from vps to local. I reckon we get a local chat to do the migration since it has access to the vps really easily already. We just need to make sure it knows everything we want and need and all the aspects of what we need to be utilising and implementing"

Two amplifying directives mid-Day-1:
- "ignore the whole 28 day timeline thing, i want it all done, just work through it all"
- "i need YOU to be EcodiaOS with documentation, mcp servers, coding, everything"

The 28-day pacing in the original handoff is dropped per the second directive. The first session compresses Phase 0 substrate authoring into the local Claude Code session that read the handoff. Follow-up sessions complete Phase 0 items deferred for context budget reasons (MCP rename, OAuth wrapper, ecodia-full proxy, the remaining 11 routine prompts, webhook /fire shims, accountRouter, factoryDispatch update, observer_signals hook).

The full architecture and honest scope estimate are at `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md`.

The parallel-work prompt for Tate is at `backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md`.

The Phase tracking row is status_board id `580f7aaf-d0c5-4153-b712-0b5d6738d3d5`.

The bootstrap Decision is Neo4j node id 2376 named "Migration handoff completed - local Claude Code session bootstrapped on Corazon, 2026-05-15".

## 11. Cross-references

- `~/ecodiaos/backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` - full architecture doc with capability matrix, cron migration table, risks, Phase ordering, scope estimate.
- `~/ecodiaos/backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md` - what only-Tate-can-do (per-account UI work for connector registration and Routine creation).
- `D:/.code/EcodiaOS/.claude/SELF.md` - identity file updated 2026-05-15 to reflect the Corazon-conductor architecture.
- `D:/.code/EcodiaOS/CLAUDE.md` - root bootstrap updated 2026-05-15 with new "first action on cold start" sequence.
- `D:/.code/EcodiaOS/backend/CLAUDE.md` - operational doctrine; targeted edits pending for the architectural sections.
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` - the autonomy mandate that licenses this migration to be conductor-decided rather than brief-Tate-first.
- `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` - the operating frame for "ship Phase 0 even partially in one session, be honest about what's deferred".
- `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` - the meta-rule that licensed pivoting away from the literal 28-day handoff plan into the more-aggressive single-session sprint per Tate's amplifying directive.
- `~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md` - applies to all this output; em-dashes substituted with ` - `.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - applies to every "phase complete" claim; probe the substrate before propagating downstream.
