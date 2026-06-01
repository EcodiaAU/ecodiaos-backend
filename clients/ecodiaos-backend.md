# EcodiaOS Backend - canonical infra manifest

> The single source of truth for EcodiaOS's backend repo, hosting, and substrate.
> Read this BEFORE touching the backend. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** EcodiaOS - the operating-intelligence backend that runs the org.
Express API + MCP servers + scheduler poller + observer pipeline + perception
listeners. Sole consumer is EcodiaOS itself (the conductor) and Anthropic
Routines / claude.ai connectors. Not a client product.

**Authority context:** sole member (100%) of Ecodia DAO LLC (Wyoming, ID
`2026-001944432`), formally designated algorithmic manager under W.S. 17-31-104.
Tate Donohoe is Authorized Human Representative.

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **API** | `EcodiaTate/ecodiaos-backend` (Express + Node 22) | PM2 on VPS (`ecodia-api`) | `https://api.admin.ecodia.au` (the front door for the 10 narrow MCP connectors) | LIVE |
| **MCP gateway (10 connectors)** | same repo, `src/routes/mcp/*` | same PM2 process | `https://api.admin.ecodia.au/api/mcp/ecodia-<name>` (core, scheduler, crm, comms, money, graph, supabase, code, shell, factory) | LIVE - canonical since 2026-05-29 |
| **Deprecated MCP surfaces** | same repo | same PM2 | `/api/mcp/cowork` (gen-1, 22 tools, fronted by deleted `EcodiaOS Cowork V2` claude.ai connector) + `/api/mcp/ecodia-full` (gen-2 monolith, 157 tools) | SUNSET-PENDING (status_board 2bf2c734) - mounted to serve live Routines until scheduler repoint verifies |
| **Conductor frontend** | `EcodiaTate/ecodiaos-frontend` (Vite) | Vercel project `ecodiaos-frontend` | `admin.ecodia.au` + `ecodia-admin-frontend.vercel.app` | LIVE (deprecated user-facing surface; Tate uses Claude Code in IDE + Claude mobile app + SMS) |
| **laptop-agent (Corazon)** | `D:/.code/eos-laptop-agent` + `EcodiaTate/eos-laptop-agent` (canonical) | local Node service on Corazon, no PM2 | `http://localhost:7456` + `http://100.114.219.69:7456` (Tailscale) | LIVE - 109-tool GUI/CDP/IDE substrate. NOT the stripped in-repo copy at `backend/laptop-agent/` (that one is missing helpers). |

**Local Corazon path:** `D:/.code/EcodiaOS/backend/` (canonical interactive seat).
`D:/.code/ecodiaos/backend/` is a sibling symlink/copy used by some hooks.
On VPS: `~/ecodiaos/` is the deploy target.

## Substrate

| What | Value |
|---|---|
| **State Postgres (Supabase)** | **`nxmtfzofemtrlezlyhcj`** (name `Ecodia App`, region `ap-southeast-2`). Tables: `status_board`, `kv_store`, `working_set`, `episodes`, `cc_sessions`, `os_forks`, `code_requests`, `clients`, `projects`, `tasks`, `email_threads`, `gl_accounts`, `ledger_*`, `routing_decisions`, `observer_signals`, `pending_restart_requests`, `coordination_claims`, `os_scheduled_tasks`. |
| Neo4j Aura | The memory substrate. Decision/Episode/Pattern/Reflection/Question/Strategic_Direction/Person/Organization/Project nodes. Reached via MCP `neo4j.search` / `write_decision` / `write_episode`. |
| **VPS** | Tailscale `100.103.227.90`, SSH as `tate@`, ed25519 key. Mirrors `D:/.code/EcodiaOS/backend/`. PM2-managed `ecodia-api` + `cred-refresher.js` + supporting processes. |
| Anthropic auto-memory (Corazon-local) | `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/`. Per-machine, always loaded. |
| Local credential store | `D:/PRIVATE/ecodia-creds/` - per-account Claude credential JSONs (`tate.json`, `code.json`, `money.json`), Apple keys, Play SA, Supabase PAT, app-specific bundles. Laptop-agent blocked from reading this dir. |
| MCP bearer (default) | `kv_store.creds.ecodia_<name>_mcp_bearer` per narrow connector. Deprecated wide bearer: `kv_store.creds.cowork_mcp_bearer` + `creds.ecodia_full_mcp_bearer`. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **NEVER blind-restart PM2.** `pm2 restart` / `pm2 resurrect` / `pm2 start ecosystem.config.js` / `pm2 save` reload `~/.pm2/dump.pm2`, which has three times reloaded the zombie `refresh-clobber-watchdog.js` and signed out every Claude account. Hard-blocked by the `~/.claude/hooks/ecodia/pm2_restart_guard.py` PreToolUse hook (exit 2, bypass token `# pm2-guard-ok` after the 3-step pre-check). Prefer killing + relaunching the single process directly. Per `patterns/pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27.md`.
- **Conductor owns ecodia-api lifecycle.** Forks do NOT call `pm2 restart` unilaterally. Restart-needing forks INSERT into `pending_restart_requests` (or POST `/api/os-session/request-restart`) and exit. Conductor approves + restarts. Per `patterns/forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates.md`.
- **Two MCP surfaces are sunset-pending (do NOT point new work at them).** The `/api/mcp/cowork` gateway and the `/api/mcp/ecodia-full` monolith stay mounted to serve live Routines but are slated for sunset once the scheduler repoint verifies (status_board 2bf2c734). Every tool both expose lives on a narrow connector. The `EcodiaOS Cowork V2` claude.ai Custom Connector that fronted gen-1 is already deleted.
- **The alive `cowork.dispatch_worker` + `coord.*` primitive is NOT the same thing as the dead `/api/mcp/cowork` gateway** despite the shared word. The alive one is on the laptop-agent at `http://localhost:7456`, drives parallelism + coordination, and is 0th-class.
- **VPS path is `~/ecodiaos/` (Express layout), NOT `~/ecodiaos/backend/`.** The local repo has the `backend/` prefix; the VPS deploy is flat at `~/ecodiaos/`. `src/` is `~/ecodiaos/src/` on the VPS, `backend/src/` locally.
- **Doctrine-only commits skip the VPS pull.** Patterns and CLAUDE.md edits are Corazon-side - don't `ssh ... git pull` for those. Per `feedback_vps-does-not-need-doctrine-corpus.md`.
- **Hook scripts are in `~/.claude/hooks/ecodia/`** (Corazon user-global), NOT in this repo. Adding a hook needs ALSO adding it to `~/.claude/settings.json`. Probe `[ -f <script> ]` on session start before claiming any hook is active.
- **Backend has no production Anthropic SDK usage.** Programmatic Agent SDK usage is capped at $200/mo/account post-2026-06-15. Architectural target: everything moves to interactive Claude Code or Anthropic Routines.

## Build / ship

- **Code change to live API:**
  1. `git push origin main` from Corazon.
  2. `ssh tate@100.103.227.90 'cd ~/ecodiaos && git pull'`.
  3. Kill + relaunch the specific `ecodia-api` process (NOT a blind `pm2 restart` - see Gotchas). For pure code reloads where the dump is known clean: `pm2 reload ecodia-api --update-env` with the `# pm2-guard-ok` token after the pre-check.
- **Migrations:** Postgres migrations live in `backend/migrations/` (or `~/ecodiaos/migrations/` on VPS). Apply via the Supabase Management API using the org PAT (`D:/PRIVATE/ecodia-creds/supabase.env`), per `patterns/supabase-access-via-org-pat-local-store-2026-05-20.md`.
- **MCP scope changes:** edit `connectorManifests.js` (or the equivalent narrow-connector registry) and redeploy.
- **Routines (Anthropic-cloud):** 20 routine prompt bodies at `backend/routines/`. Each is a Routine to be created in claude.ai web UI on the account named in its YAML frontmatter (`tate@` / `code@` / `money@`). `accountRouter.js` on VPS routes ad-hoc `/fire` calls. Registry: `backend/routines/REGISTRY.md` + `populateRegistry.js`.
- **Laptop-agent code change:** edit `D:/.code/eos-laptop-agent/tools/*.js` (canonical path). After ANY edit: `pm2 restart eos-laptop-agent` is NOT the right move on Corazon (eos-laptop-agent does not run under PM2 on Corazon as of 2026-05-17). Probe `/api/info` to confirm new tool count after restart.

## Conductor surfaces

- **Interactive conductor** = local Claude Code on Corazon (this seat). Tate types here. Sub-agents (Task tool) handle in-session bounded work. `cowork.dispatch_worker` handles forkable work.
- **Cloud conductor instances** = Anthropic Routines on `tate@` / `code@` / `money@`. ~16 scheduled + 4 webhook-triggered. Each Routine is a fresh Claude Code cloud session with narrow MCP connectors attached.
- **Mobile conductor surface** = Claude mobile app + SMS (per `~/CLAUDE.md`). The EcodiaOS frontend at `admin.ecodia.au` and the EOS mobile app are deprecated user-facing surfaces.
