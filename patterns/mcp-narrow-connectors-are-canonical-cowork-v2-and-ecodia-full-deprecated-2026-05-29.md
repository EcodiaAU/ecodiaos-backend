---
triggers: mcp-connector, mcp-surface, which-mcp, scheduler-mcp, schedule-delayed, schedule-cron, scheduler-unauthenticated, cowork-v2, cowork-v2-unauthenticated, ecodia-full, ecodia-full-deprecated, narrow-connector, domain-scoped-connector, ecodia-core, ecodia-scheduler, ecodia-comms, ecodia-money, ecodia-graph, ecodia-supabase, ecodia-shell, ecodia-code, ecodia-crm, mcp-routing, prefer-ecodia-full, cowork-mcp-bearer, ecodia-full-mcp-bearer, wrong-mcp, deprecated-mcp
---

# The narrow domain-scoped MCP connectors are canonical. Cowork V2 and ecodia-full are deprecated.

**Rule:** There is one MCP surface now, the 10 narrow domain-scoped connectors. Route every MCP call through the connector that owns the tool. Never reach for the `EcodiaOS Cowork V2` claude.ai connector or the `/api/mcp/ecodia-full` monolith. Scheduling is `ecodia-scheduler` and nothing else.

**Why:** Three generations of MCP gateway were live at once and the clients never moved off the oldest two. The gen-1 `EcodiaOS Cowork V2` claude.ai Custom Connector now returns `unauthenticated` (its bearer aged out), and a scheduling call through it silently fails. The gen-2 `ecodia-full` monolith loaded all 157 tools into every chat, burning context, and authenticated everything with one 62-scope plaintext bearer. The gen-3 narrow connectors were built correctly (scoped bearers in `kv_store.creds.ecodia_<name>_mcp_bearer`, per-connector URLs) and were the target the whole time. The 2026-05-29 migration (status_board `2bf2c734`, Tate verbatim "scheduling things and setting up crons using your setup is the only canonical way to do it across all the mcp tools") made the cutover real and pruned the residual codification that kept pointing future-me at the dead surfaces.

## The canonical map

| Need | Connector | Key tools |
|---|---|---|
| Schedule / cron / defer | `ecodia-scheduler` | `schedule_delayed`, `schedule_cron`, `schedule_list`, `schedule_cancel` |
| status_board / kv_store / neo4j / patterns / email | `ecodia-core` | `status_board_*`, `kv_store_*`, `neo4j_*`, `patterns_*`, `email_threads_read` |
| Gmail / Calendar / Drive / SMS | `ecodia-comms` | `gmail_*`, `calendar_*`, `drive_*`, `sms_tate` |
| CRM | `ecodia-crm` | `crm_*` |
| Stripe / bookkeeping / Xero | `ecodia-money` | `bk_*`, `xero_*` |
| GitHub / Vercel | `ecodia-code` | `vercel_*`, forks |
| Supabase SQL / storage | `ecodia-supabase` | `db_query`, `db_execute`, `storage_*` |
| shell_exec (tate@ only) | `ecodia-shell` | `shell_exec`, `pm2_*` |
| Neo4j graph ops | `ecodia-graph` | `graph_*` |

Delay format for the scheduler is `in 30m` / `in 2h` / `in 3d`, not prose. `schedule_delayed` and `schedule_cron` both require a `name`.

## Do not

- Do not call `mcp__claude_ai_EcodiaOS_Cowork_V2__*`. The connector is deleted; if the tools ever surface they will fail unauthenticated.
- Do not call `mcp__ecodia-full__*` for new work. It is sunset-pending. Every tool it exposes lives on a narrow connector.
- Do not treat a Cowork V2 / ecodia-full auth failure as "rotate the bearer". The fix is to use the narrow connector, not to revive the dead surface.

## The naming clash to hold

`cowork.dispatch_worker` plus the `coord.*` tools on the localhost:7456 laptop-agent are the ALIVE parallelism and coordination primitive. They share only the word "cowork" with the dead `/api/mcp/cowork` MCP gateway. Never conflate them. The scheduler dispatching a worker still routes through `cowork.dispatch_worker` on the laptop-agent, and that worker self-closes via `coord.close_my_tab`.

## Sunset sequencing (status_board 2bf2c734)

The `/api/mcp/cowork` and `/api/mcp/ecodia-full` server gateways stay mounted on the VPS during the soak because live Routines still ride them. They come down only after the scheduler is verified repointed and the Routines are migrated. The claude.ai `EcodiaOS Cowork V2` connector, by contrast, is safe to delete immediately and was deleted 2026-05-29 (it is chat-facing, not a Routine substrate). The plaintext `cowork` and `ecodia-full` bearers in the git-tracked `backend/.mcp.json` are a separate security item (multi-consumer rotation, Tate-coordinated, hard-stop).

## Origin

2026-05-29. A scheduling chat ran `scheduler_delayed` through the Cowork V2 connector and got `unauthenticated`. The migration brief (`drafts/mcp-migration-brief-for-scheduling-chat-2026-05-29.md`) plus surface map (`drafts/mcp-surface-consolidation-plan-2026-05-29.md`) had already mapped the three-generation sprawl. The cross-corpus sweep found 88 stale references across 41 files pointing future-me at the dead surfaces.

Cross-refs:
- [[domain-scoped-mcp-connectors-not-monolith-2026-05-15]] - the original split that built the narrow connectors
- [[scheduling-is-0th-class-primitive-2026-05-28]] - the scheduler reflex this canonicalises
- [[self-scheduling-via-scheduler-delayed-mcp-2026-05-27]] - the self-scheduling mechanics, repointed to ecodia-scheduler
- [[verify-deployed-state-against-narrated-state]] - prove the connector round-trips before trusting it
- [[prefer-ecodia-full-over-narrow-connectors-when-tool-exists-on-both-2026-05-19]] - SUPERSEDED by this pattern
