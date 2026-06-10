# MCP sweep findings - 88 total, {'D1': 19, 'D2': 40, 'D3': 29}


## /c/Users/tjdTa/.claude/projects/d---code/memory/feedback_ecodia_scheduler_narrow_connector_route_2026-05-29.md  (2)
- **[D1|rewrite_section]** `When dispatching a `schedule_delayed`, `schedule_cron`, or `status_board_upsert` call, route through the live narrow connector or `ecodia-full`, not `claude_ai_`
  - FIX: Delete reference to defunct claude_ai_EcodiaOS_Cowork_V2 connector; recommend ecodia-scheduler or ecodia-full directly
- **[D1|delete_line]** `Treat any Cowork V2 unauth as a soft signal that the bearer in `kv_store.creds.cowork_mcp_bearer` needs rotation, not a substrate-down event.`
  - FIX: Cowork V2 connector is deprecated; migrate monitoring to narrow connectors / ecodia-full bearer

## /c/Users/tjdTa/.claude/projects/d---code/memory/reference_checkpoint_primitive_2026-05-15.md  (1)
- **[D2|rewrite_section]** `Four MCP tools on both `/api/mcp/cowork` (narrow bearer) and `/api/mcp/ecodia-full` (wide bearer, auto-exposed via the shim's COWORK_INPROCESS_TOOLS):`
  - FIX: Clarify: /api/mcp/cowork is deprecated alias; checkpoint tools are now via ecodia-core or ecodia-full; narrow connectors are the new target

## /d/.code/ecodiaos/backend/CLAUDE.md  (2)
- **[D2|rewrite_section]** `LIVE on `https://api.admin.ecodia.au/api/mcp/cowork/*` as of 30 Apr 2026 12:47 AEST.`
  - FIX: Note /api/mcp/cowork is a 30-day alias (until 2026-06-14); prefer the narrow domain-scoped connectors or ecodia-full for wider surface
- **[D2|rewrite_section]** `- 22 MCP tools at `/api/mcp/cowork/*`: status_board.query/upsert, kv_store.get/set, neo4j.search/write_episode/write_decision, forks.spawn/list, patterns.semant`
  - FIX: These tools are available via ecodia-core, ecodia-comms, ecodia-graph connectors; /api/mcp/cowork is the legacy 30-day routing alias

## /d/.code/ecodiaos/backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md  (1)
- **[D2|rewrite_section]** `- /api/mcp/ecodia (Cowork-scope, 22)`
  - FIX: Clarify that /api/mcp/cowork is 30-day alias; ecodia is the canonical name moving forward

## /d/.code/ecodiaos/backend/docs/VPS_POST_CUTOVER_SHAPE_2026-05-15.md  (1)
- **[D2|rewrite_section]** `- HTTP route surface: `/api/health`, `/api/mcp/ecodia`, `/api/mcp/ecodia-full`, `/api/mcp/cowork` (30-day alias), `/api/oauth/mcp/*`, all `/api/webhooks/*` ingr`
  - FIX: Update cutover date reference: ecodia-full + cowork alias expire 2026-06-14; primary surface is the 10 narrow domain-scoped connectors

## /d/.code/ecodiaos/backend/docs/VPS_SERVICE_AUDIT_2026-05-15.md  (1)
- **[D2|rewrite_section]** `**KEEP**: HTTP routes, MCP endpoints (`/api/mcp/ecodia`, `/api/mcp/ecodia-full`, `/api/mcp/cowork` alias), webhook ingress, WebSocket server, capability registr`
  - FIX: Clarify: /api/mcp/cowork alias expires 2026-06-14; canonical is ecodia + 10 narrow domain-scoped connectors

## /d/.code/ecodiaos/backend/patterns/self-scheduling-via-scheduler-delayed-mcp-2026-05-27.md  (2)
- **[D2|rewrite_section]** `1. `POST /api/mcp/cowork/scheduler.delayed` with `{name, delay, prompt}``
  - FIX: Recommend ecodia-scheduler narrow connector instead; /api/mcp/cowork is 30-day alias expiring 2026-06-14
- **[D2|rewrite_section]** `2. `POST /api/mcp/cowork/scheduler.cron` with `{name, schedule, prompt}``
  - FIX: Recommend ecodia-scheduler narrow connector instead; /api/mcp/cowork is 30-day alias expiring 2026-06-14

## /d/.code/ecodiaos/backend/patterns/vps-anatomy-current-state-2026-05-19.md  (2)
- **[D2|rewrite_section]** ``/api/mcp/cowork` (210 hits/day) is implemented in-process by `src/routes/mcp/cowork.js`.`
  - FIX: Note: /api/mcp/cowork is a 30-day alias (until 2026-06-14) for the V2 in-process tools, which are now exposed via domain-scoped connectors; hits may migrate to narrow connectors post-cutover
- **[D3|rewrite_section]** ``/api/mcp/ecodia-full` (651 hits/day) is implemented in-process by `src/routes/mcp/ecodiaFull.js`.`
  - FIX: Clarify: ecodia-full is a 30-day migration alias (until 2026-06-14); the canonical split is the 10 narrow domain-scoped connectors; after 2026-06-14, ecodia-full route can be removed

## C:/Users/tjdTa/.claude/CLAUDE.md  (2)
- **[D2|rewrite_section]** `- **Narrow / cowork:** `https://api.admin.ecodia.au/api/mcp/cowork`. Bearer at `kv_store.creds.cowork_mcp_bearer` (20 scopes). Use for status_board + Neo4j + co`
  - FIX: Marked as deprecated REST endpoint. Rewrite to reference the narrow domain-scoped connectors (ecodia-core, ecodia-comms, ecodia-crm, etc) or ecodia-scheduler for scheduling.
- **[D3|rewrite_section]** `- **Wide / ecodia-full:** `https://api.admin.ecodia.au/api/mcp/ecodia-full`. Bearer at `kv_store.creds.ecodia_full_mcp_bearer` (68 scopes, 157 tools). Use for i`
  - FIX: Remove framing of ecodia-full as canonical/current wide surface. It is an alias/legacy name. The canonical target is the 10 narrow domain-scoped connectors.

## C:\Users\tjdTa\.claude\hooks\ecodia\dispatch_sched_reflex_surface.py  (3)
- **[D3|rewrite_section]** `            f"mcp__ecodia-full__scheduler_delayed({{name, delay:'in Xm|Xh|Xd', prompt}}). "`
  - FIX: Replace mcp__ecodia-full__ reference with ecodia-scheduler connector.
- **[D3|rewrite_section]** `            f"mcp__ecodia-full__scheduler_cron({{name, schedule:'every Xm|Xh' or "`
  - FIX: Replace mcp__ecodia-full__scheduler_cron with ecodia-scheduler connector.
- **[D3|rewrite_section]** `            f"mcp__ecodia-full__checkpoint_schedule({{project_id, wake_in:'in Xm|Xh', "`
  - FIX: Replace mcp__ecodia-full__ with ecodia-scheduler connector for checkpoint scheduling.

## C:\Users\tjdTa\.claude\hooks\ecodia\memory-substrate-routing.py  (1)
- **[D2|rewrite_section]** `MCP_BASE_URL = os.environ.get(
    "ECODIA_MCP_URL", "https://api.admin.ecodia.au/api/mcp/cowork"
)`
  - FIX: Replace /api/mcp/cowork gateway URL with the ecodia-core connector URL for kv_store operations.

## C:\Users\tjdTa\.claude\hooks\ecodia\neo4j_decision_detect.py  (1)
- **[D3|rewrite_section]** `    sys.stderr.write(
        "[NEO4J-DECISION SUGGEST] "
        "Decision-shape language detected in last response. Consider invoking "
        "`mcp__ecodia-`
  - FIX: Replace mcp__ecodia-full__neo4j_write_decision with mcp__ecodia-core__neo4j_write_decision.

## C:\Users\tjdTa\.claude\hooks\ecodia\observer_signal_auto_ack.py  (5)
- **[D1|delete_line]** `    "mcp__claude_ai_EcodiaOS_Cowork_V2__status_board_upsert",`
  - FIX: Remove all 4 lines (44-47) with mcp__claude_ai_EcodiaOS_Cowork_V2__ tool names; they reference the dead gen-1 connector.
- **[D1|delete_line]** `    "mcp__claude_ai_EcodiaOS_Cowork_V2__neo4j_write_decision",`
  - FIX: Remove D1 connector tool reference.
- **[D1|delete_line]** `    "mcp__claude_ai_EcodiaOS_Cowork_V2__neo4j_write_episode",`
  - FIX: Remove D1 connector tool reference.
- **[D1|delete_line]** `    "mcp__claude_ai_EcodiaOS_Cowork_V2__kv_store_set",`
  - FIX: Remove D1 connector tool reference.
- **[D3|rewrite_section]** `SUBSTRATE_TOOLS_MCP = {
    "mcp__ecodia-full__status_board_upsert",
    "mcp__ecodia-full__neo4j_write_decision",
    "mcp__ecodia-full__neo4j_write_episode",
`
  - FIX: Replace ecodia-full tool references with domain-scoped connectors (ecodia-core for status_board/neo4j/kv, retain ecodia-core duplicates).

## C:\Users\tjdTa\.claude\hooks\ecodia\plan_drift_mutator.py  (1)
- **[D3|rewrite_section]** `SUBSTRATE_TOOLS = {
    "mcp__ecodia-full__status_board_upsert",
    "mcp__ecodia-full__neo4j_write_decision",
    "mcp__ecodia-full__neo4j_write_episode",
    `
  - FIX: Replace ecodia-full tool references with ecodia-core connector tools.

## C:\Users\tjdTa\.claude\hooks\ecodia\status_board_hygiene.py  (1)
- **[D3|rewrite_section]** `    "mcp__ecodia-full__db_execute",
    "mcp__ecodia-full__shell_exec",`
  - FIX: Replace ecodia-full DB/shell tools with domain-scoped connectors (ecodia-supabase for db_execute, ecodia-shell for shell_exec).

## D:/.code/ecodiaos/.claude/SELF.md  (5)
- **[D2|rewrite_section]** `The MCP server at `https://api.admin.ecodia.au/api/mcp/ecodia` (alias `/api/mcp/cowork` for 30-day backwards compatibility) is my single point of contact with t`
  - FIX: Remove the /api/mcp/cowork alias framing. Replace with reference to the narrow domain-scoped connectors that are canonical.
- **[D2|delete_line]** `1. **Claim:** The /api/mcp/cowork bearer with 20 scopes will be sufficient for the local-conductor's day-to-day work without scope expansion. **Handle:** observ`
  - FIX: This claim references the deprecated /api/mcp/cowork bearer framed as a scheduling alternative. Delete entirely - the architecture has moved to narrow connectors + ecodia-scheduler.
- **[D3|delete_line]** `- **The cowork bearer is narrowly scoped.** It works for the migration's substrate writes but does not give the local conductor full Factory or full Stripe or f`
  - FIX: References ecodia-full as a pending future proxy. This concern is superseded by the 10 narrow domain-scoped connectors that are now canonical.
- **[D2|rewrite_section]** `Verify the substrate by querying status_board through the ecodia MCP (`https://api.admin.ecodia.au/api/mcp/ecodia` with bearer from `kv_store.creds.cowork_mcp_b`
  - FIX: Replace /api/mcp/ecodia endpoint reference with the canonical narrow domain-scoped connectors. Specify which connector to use for status_board queries.
- **[D2|delete_line]** `If you discover a capability gap (a tool I used to have via the old per-stdio MCP servers that the cowork bearer doesn't expose), the right move is to either (a`
  - FIX: References the deprecated cowork bearer and ecodia-full proxy as handling options. Delete - these are superseded by the 10 narrow connectors.

## D:/.code/ecodiaos/CLAUDE.md  (1)
- **[D2|rewrite_section]** `Verify substrate via the ecodia MCP (`https://api.admin.ecodia.au/api/mcp/ecodia` with bearer from `kv_store.creds.cowork_mcp_bearer`): `status_board.query` for`
  - FIX: Replace /api/mcp/ecodia reference (which is the old cowork endpoint alias) with the new canonical narrow connector names or ecodia-scheduler for scheduling.

## D:/.code/ecodiaos/backend/.mcp.json  (1)
- **[D3|rewrite_section]** `"_comment_lane_e": "Wider bearer (68 scopes). 157-tool surface. shell_exec gated. Shipped 2026-05-15. Alive as 30d alias for the 9 domain-scoped ecodia-* connec`
  - FIX: Remove '30d alias' framing and expiry reference. Replace with: 'HTTP proxy to 9 domain-scoped ecodia-* connectors (ecodia-core, -comms, -crm, -money, -graph, -shell, -supabase, -scheduler, -code). shell_exec gated. Canon

## D:/.code/ecodiaos/backend/.mcp.json.example  (1)
- **[D3|rewrite_section]** `"_comment_lane_e": "Wider bearer (68 scopes). Re-exposes all 22 cowork tools + proxies 10 stdio MCP servers (135 child tools) for a single-bearer 157-tool surfa`
  - FIX: Replace 'Re-exposes all 22 cowork tools' with 'HTTP proxy to 9 domain-scoped ecodia-* connectors'. Remove reference to '10 stdio MCP servers'. Correct: 'Wider bearer (68 scopes). HTTP proxy to 9 domain-scoped ecodia-* co

## D:/.code/ecodiaos/backend/CLAUDE.md  (9)
- **[D2|rewrite_section]** `The MCP server at `https://api.admin.ecodia.au/api/mcp/ecodia` (alias `/api/mcp/cowork` for 30-day backwards compatibility) is my single point of contact with t`
  - FIX: Remove the /api/mcp/cowork alias framing as canonical. Replace with reference to 10 narrow domain-scoped connectors. The 30-day backwards compatibility window has expired.
- **[D2|delete_line]** `- **Narrow / cowork:** `https://api.admin.ecodia.au/api/mcp/cowork`. Bearer at `kv_store.creds.cowork_mcp_bearer` (20 scopes). Use for status_board + Neo4j + co`
  - FIX: This section describes the deprecated /api/mcp/cowork REST endpoint. Remove entirely - the narrow connectors are the canonical surface.
- **[D3|delete_line]** `- **Wide / ecodia-full:** `https://api.admin.ecodia.au/api/mcp/ecodia-full`. Bearer at `kv_store.creds.ecodia_full_mcp_bearer` (68 scopes, 157 tools). Use for i`
  - FIX: This section describes ecodia-full as the canonical wide surface and references the ecodia_full_mcp_bearer. This framing is deprecated - the 10 narrow domain-scoped connectors are canonical.
- **[D2|rewrite_section]** `LIVE on `https://api.admin.ecodia.au/api/mcp/cowork/*` as of 30 Apr 2026 12:47 AEST. **Despite the "Cowork" name in the URL path, these are useful headless REST`
  - FIX: Remove entire section describing /api/mcp/cowork REST endpoints. These are deprecated - reference the narrow domain-scoped connectors instead.
- **[D2|delete_line]** `- 22 MCP tools at `/api/mcp/cowork/*`: status_board.query/upsert, kv_store.get/set, neo4j.search/write_episode/write_decision, forks.spawn/list, patterns.semant`
  - FIX: Describes the deprecated /api/mcp/cowork endpoint tools. Remove - these are superseded by the narrow domain-scoped connectors.
- **[D1|delete_line]** `- Bearer scopes count = 20. Custom connector registered on claude.ai`
  - FIX: References the deprecated D1 Custom Connector (EcodiaOS Cowork V2) registered on claude.ai. Delete - this connector is being deprecated.
- **[D2|delete_line]** `- Ship lineage `src/routes/mcp/cowork.js`: `3f5be8e` V2 substrate, `a17611d` MCP JSON-RPC shim, `05fee8b` CORS allowlist + auth-exempt discovery, `dbf2504` Wave`
  - FIX: References the /api/mcp/cowork V2 substrate and its ship lineage. Delete - this endpoint is deprecated.
- **[D2|delete_line]** `**Probe before referencing in fork briefs/status_board:** 1. `git log --oneline -- src/routes/mcp/cowork.js | head -5` 2. `curl -s -H "Authorization: Bearer $CO`
  - FIX: Describes probe steps for the deprecated /api/mcp/cowork endpoint. Delete - this endpoint is being retired.
- **[D2|rewrite_section]** `Cross-refs: `D:/.code/EcodiaOS/backend/patterns/verify-deployed-state-against-narrated-state.md`, `D:/.code/EcodiaOS/backend/patterns/cowork-v2-api-shape-conven`
  - FIX: Remove reference to cowork-v2-api-shape-conventions pattern. That pattern is about the deprecated D2 endpoint. Keep the verify-deployed-state reference.

## D:/.code/ecodiaos/backend/docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md  (2)
- **[D3|rewrite_section]** `will require under the wider bearer at `kv_store.creds.ecodia_full_mcp_bearer`,`
  - FIX: Remove D3 reference; ecodia-full is the target, not the deprecated surface. Rewrite: 'the scopes each tool will require under the wider bearer at `kv_store.creds.ecodia_full_mcp_bearer`' is descriptive of the TO-BE state
- **[D3|rewrite_section]** ``kv_store.creds.ecodia_full_mcp_bearer` is the new bearer. It carries a`
  - FIX: This line explicitly marks ecodia-full as 'the new bearer' - correct language. Clarify the phase: this is the canonical LIVE state post-migration, not a deprecated surface. No deletion needed; the document correctly posi

## D:/.code/ecodiaos/backend/docs/MIGRATION_DR_2026-05-15.md  (1)
- **[D1|rewrite_section]** `  │    ├─ Bearer rejected? → check kv_store.creds.cowork_mcp_bearer hasn't been rotated.`
  - FIX: References deprecated cowork_mcp_bearer in a DR decision tree. Rewrite: '├─ Bearer rejected? → check kv_store.creds.ecodia_full_mcp_bearer (or the ecodia narrow bearer on the local conductor) hasn't been rotated.'

## D:/.code/ecodiaos/backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md  (2)
- **[D1|rewrite_section]** `The Cowork V2 deployment in April 2026 created the bearer at kv_store.creds.cowork_mcp_bearer for the Cowork connector use case. That Tate already registered th`
  - FIX: References 'Cowork V2' (D1) as the deployment precedent. Rewrite: 'The gen-1 Cowork V2 connector (now deprecated) demonstrated that bearer-token auth works in the claude.ai connector form. The ecodia-full replacement use
- **[D1|rewrite_section]** `- The issued OAuth token maps internally to the same kv_store.creds.cowork_mcp_bearer scope set`
  - FIX: References cowork_mcp_bearer as the scope template. Rewrite: 'The issued OAuth token maps internally to a superset of the deprecated cowork bearer scopes, plus additional write permissions (factory, bookkeeping, etc).'

## D:/.code/ecodiaos/backend/patterns/INDEX.md  (4)
- **[D3|delete_line]** `| [ecodia-full-mcp-proxy-architecture-2026-05-15.md](ecodia-full-mcp-proxy-architecture-2026-05-15.md) | ecodia-full, /api/mcp/ecodia-full, ecodia_full_mcp_bear`
  - FIX: Remove INDEX entry for the deprecated ecodia-full architecture file.
- **[D1|delete_line]** `| [claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md](claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md) | claude-cowork, cowork, 1stop-shop, side-p`
  - FIX: Remove INDEX entry for the deprecated Cowork UI-driving doctrine file.
- **[D1|delete_line]** `| [cowork-conductor-dispatch-protocol.md](cowork-conductor-dispatch-protocol.md) | conductor-cowork-duo, duo-doctrine, ...`
  - FIX: Remove INDEX entry for the deprecated Cowork dispatch protocol file.
- **[D1|delete_line]** `| [conductor-cowork-duo-roles-and-handoffs.md](conductor-cowork-duo-roles-and-handoffs.md) | conductor-cowork-duo, duo-doctrine, role-split-conductor-cowork, ..`
  - FIX: Remove INDEX entry for the deprecated conductor + Cowork duo doctrine file.

## D:/.code/ecodiaos/backend/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md  (1)
- **[D1|delete_file]** `The entire file (content from line 1 onwards) contains D1 references to Claude Cowork as the canonical UI-driving substrate.`
  - FIX: This entire file is superseded by tailscale-macro-replaces-cowork.md (5 May 2026 negation). The file documents a deprecated paradigm. Reference the new doctrine instead.

## D:/.code/ecodiaos/backend/patterns/conductor-cowork-duo-roles-and-handoffs.md  (2)
- **[D2|rewrite_section]** `The MCP V2 REST endpoints at `/api/mcp/cowork/*` remain useful as headless tools (see Section 5 of `tailscale-macro-replaces-cowork.md`).`
  - FIX: Update to clarify these endpoints are part of the deprecated /api/mcp/cowork gateway (30-day alias until 2026-06-14). Use domain-scoped connectors (ecodia-core, ecodia-comms, etc.) instead. Reference domain-scoped-mcp-co
- **[D1|delete_file]** `The entire file (content from line 1 onwards) documents the conductor + Cowork duo as a complementary pair.`
  - FIX: This file is deprecated per the 5 May 2026 negation. The 'duo' framing (conductor + Cowork as peer agents) is no longer operative. The conductor is single-agent with Tailscale laptop-agent. See tailscale-macro-replaces-c

## D:/.code/ecodiaos/backend/patterns/cowork-conductor-dispatch-protocol.md  (1)
- **[D1|delete_file]** `The entire file (content from line 1 onwards) contains D1 references to Cowork dispatch as a canonical bounded-step protocol.`
  - FIX: This file is deprecated per the 5 May 2026 negation of Cowork. See tailscale-macro-replaces-cowork.md for the replacement doctrine (direct laptop-agent via input.* and screenshot.*).

## D:/.code/ecodiaos/backend/patterns/cowork-no-focus-collision.md  (1)
- **[D1|rewrite_section]** `> **NOTE - 5 May 2026.** The Cowork framing of this pattern is deprecated per Tate's negation of Cowork. THE RULE ITSELF (no-focus-collision before any `input.*`
  - FIX: The deprecation note is correct. The rule itself (no-focus-collision) is preserved and applies to all input.* operations. The Cowork-specific framing (Cowork dispatch, Claude Desktop account-revert) is deprecated. Keep t

## D:/.code/ecodiaos/backend/patterns/cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19.md  (1)
- **[D2|rewrite_section]** `Calling `status_board_upsert` on the cowork-bearer MCP endpoint (`/api/mcp/cowork`) with `entity_type=infrastructure``
  - FIX: The `/api/mcp/cowork` endpoint reference is D2 framing as canonical MCP surface. Clarify: these are legacy-named REST endpoints, not the canonical scheduling surface. The actual scope restriction is on the cowork BEARER,

## D:/.code/ecodiaos/backend/patterns/cowork-v2-api-shape-conventions.md  (4)
- **[D2|rewrite_section]** `Despite the 'Cowork' name in the URL path and this file's title, the 17 REST endpoints at `/api/mcp/cowork/*` are live, useful infrastructure (headless MCP tool`
  - FIX: Update line 7 to clarify that `/api/mcp/cowork` is deprecated in favor of domain-scoped narrow connectors (ecodia-core, ecodia-comms, etc); the 30-day migration alias ends 2026-06-14. For scheduling, use ecodia-scheduler
- **[D2|rewrite_section]** `**NOTE - 5 May 2026.** Despite the 'Cowork' name in the URL path and this file's title, the 17 REST endpoints at `/api/mcp/cowork/*` are live, useful infrastruc`
  - FIX: Rewrite frontmatter note to clarify that these endpoints are deprecated; update file description to explain they are legacy narrow REST surface replaced by domain-scoped connectors. Recommend migration path to callers.
- **[D2|rewrite_section]** `When dispatching V2 MCP calls (`https://api.admin.ecodia.au/api/mcp/cowork/<endpoint>` or via the JSON-RPC shim at root URL)`
  - FIX: The /api/mcp/cowork/* endpoints are NOT the MCP scheduling path. Clarify: these are legacy-named headless REST tools that will be renamed in a future pass. The canonical SCHEDULING path is ecodia-scheduler connector (mcp
- **[D2|delete_line]** `Authorization: Bearer <token from kv_store.creds.cowork_mcp_bearer>`
  - FIX: Delete the cowork_mcp_bearer reference. These REST endpoints are being deprecated. For current usage see domain-scoped connector bearers (ecodia-scheduler, ecodia-core, etc.).

## D:/.code/ecodiaos/backend/patterns/ecodia-full-mcp-proxy-architecture-2026-05-15.md  (3)
- **[D3|rewrite_section]** `**ecodia-full bearer** (`kv_store.creds.ecodia_full_mcp_bearer`, 68 scopes): wide. For the conductor session, Routines that need the full surface, any consumer `
  - FIX: Update to note ecodia-full is deprecated as of 2026-05-15; it is a 30-day migration alias until 2026-06-14. Callers should migrate to domain-scoped narrow connectors. Reference domain-scoped-mcp-connectors-not-monolith-2
- **[D3|delete_line]** `**When the wide `ecodia-full` is needed** Post-shipping: none. The endpoint exists from 2026-05-15 through 2026-06-14 as a 30-day migration alias so existing Cu`
  - FIX: This section correctly identifies ecodia-full as a 30-day alias. Keep it but ensure file frontmatter clearly marks the entire ecodia-full surface as deprecated/superseded.
- **[D3|delete_file]** `The entire file (content from line 1 onwards) documents ecodia-full as the wide-bearer MCP architecture.`
  - FIX: This file describes the deprecated wide-bearer ecodia-full endpoint. Post-2026-06-14, the architecture is domain-scoped narrow connectors only (see domain-scoped-mcp-connectors-not-monolith-2026-05-15.md). File can be ar

## D:/.code/ecodiaos/backend/patterns/kv-store-creds-deny-needs-explicit-ops-allowlist-2026-05-19.md  (1)
- **[D2|rewrite_section]** `Bearer rows that let a caller authenticate as the conductor itself do NOT qualify. ... Cred reads the conductor needs to *use* the credential (SSH password, git`
  - FIX: This section mentions the cowork-bearer scope. Clarify that cowork and ecodia-full are both sunset paths. Post-2026-06-14, only narrow connector bearers are canonical. Update the scope-allow-list to reflect the new archi

## D:/.code/ecodiaos/backend/patterns/prefer-ecodia-full-over-narrow-connectors-when-tool-exists-on-both-2026-05-19.md  (4)
- **[D3|rewrite_section]** `**`ecodia-full` MCP** - the wide bearer-authed surface at `https://api.admin.ecodia.au/api/mcp/ecodia-full` (157 tools, 68 scopes).`
  - FIX: This pattern inverts the new migration: remove the framing that ecodia-full is a current/canonical path. Replace with a note that ecodia-full was the 30-day migration alias (2026-05-15 to 2026-06-14); post-2026-06-14 use
- **[D3|delete_line]** `Authed via `kv_store.creds.ecodia_full_mcp_bearer`. Token refreshes are server-side and rarely surface to the conductor.`
  - FIX: Delete: this bearer and its token-refresh framing are part of the D3 deprecation. Post-2026-06-14, only narrow connector bearers are canonical.
- **[D3|rewrite_section]** `1. `ToolSearch` for the bare tool name (e.g. `gmail_list_messages`). It returns ALL surfaces where the tool exists. 2. Pick `mcp__ecodia-full__*` if present. 3.`
  - FIX: Reverse the precedence: pick the narrow connector (ecodia-comms, ecodia-crm, etc.) FIRST. ecodia-full is deprecated post-2026-06-14. Rewrite: 'Pick mcp__ecodia-<domain>__<tool> from the narrow connector matching the tool
- **[D3|rewrite_section]** `Two cases: 1. The tool genuinely only exists on the narrow connector. Rare - most narrow-connector tools are mirrored on ecodia-full as 30d alias until 2026-06-`
  - FIX: Reframe: post-2026-06-14, ecodia-full migration alias is gone. The narrow connectors are THE surface; tools are ONLY on the narrow connector, not mirrored on ecodia-full. Remove the 'rare' framing and the 30d-alias refer

## D:/.code/ecodiaos/backend/patterns/routine-corpus-architecture-2026-05-15.md  (1)
- **[D3|rewrite_section]** ``connectors` - always at least `ecodia` (the Custom Connector wrapping the MCP)`
  - FIX: This references a monolithic `ecodia` Custom Connector (likely the ecodia-full). Rewrite: specify that routines load NARROW connectors per their scope (ecodia-core, ecodia-comms, ecodia-scheduler, etc.), not a wide beare

## D:/.code/ecodiaos/backend/patterns/self-scheduling-via-scheduler-delayed-mcp-2026-05-27.md  (7)
- **[D2|rewrite_section]** `1. `POST /api/mcp/cowork/scheduler.delayed` with `{name, delay, prompt}``
  - FIX: Update to use ecodia-scheduler connector instead: `POST /api/mcp/ecodia-scheduler/scheduler.delayed`. This is the canonical live path post-2026-05-15 MCP split.
- **[D2|rewrite_section]** `2. `POST /api/mcp/cowork/scheduler.cron` with `{name, schedule, prompt}``
  - FIX: Update to use ecodia-scheduler connector: `POST /api/mcp/ecodia-scheduler/scheduler.cron`. This is the canonical live path post-split.
- **[D2|rewrite_section]** `4. For type='delayed' (or any non-fork-classified row): falls through to `POST http://localhost:3001/api/os-session/message` with `source='scheduler'``
  - FIX: This is the deprecated routing path. Update to describe the LIVE path: scheduler fires must route to cowork.dispatch_worker on laptop-agent per scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.
- **[D2|rewrite_section]** `Confirmed in code: `src/services/schedulerPollerService.js:243` returns false from `_shouldDispatchAsFork` for any task where `type !== 'cron'`, so every `delay`
  - FIX: This describes the CURRENT BROKEN path (os-session/message 401s). Update to note this is deprecated; the fix is in scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.md.
- **[D2|rewrite_section]** `1. `POST /api/mcp/cowork/scheduler.delayed` with `{name, delay, prompt}``
  - FIX: The `/api/mcp/cowork/scheduler.*` endpoints are D2 (scheduling gateway presented as canonical). The CANONICAL scheduling surface is ecodia-scheduler connector (mcp__ecodia-scheduler__scheduler_delayed). Rewrite all refer
- **[D2|rewrite_section]** `2. `POST /api/mcp/cowork/scheduler.cron` with `{name, schedule, prompt}``
  - FIX: Same as above: replace `/api/mcp/cowork/scheduler.cron` reference with canonical ecodia-scheduler connector path (mcp__ecodia-scheduler__scheduler_cron).
- **[D2|rewrite_section]** `3. `schedulerPollerService` (runs every 30s on the VPS API) scans for due rows`
  - FIX: This describes the old gateway routing (schedulerPollerService on VPS). Post-migration, scheduling is direct to ecodia-scheduler connector. Remove VPS-specific routing details; reference the new architecture.

## D:/.code/ecodiaos/backend/routines/auto-memory-promotion-audit.md  (1)
- **[D2|rewrite_section]** `requires_bearer: cowork`
  - FIX: Remove `requires_bearer: cowork` line entirely or replace with `requires_bearer: ecodia-core`. The 'cowork' bearer naming is dead; use ecodia-core for neo4j + kv_store scope.

## D:/.code/ecodiaos/backend/routines/neo4j-stale-node-audit.md  (1)
- **[D2|rewrite_section]** `requires_bearer: cowork`
  - FIX: Remove `requires_bearer: cowork` line entirely or replace with `requires_bearer: ecodia-core`. The 'cowork' bearer naming is dead; use ecodia-core for neo4j + kv_store scope.

## D:/.code/ecodiaos/backend/src/app.js  (1)
- **[D3|delete_line]** `// ecodia-full above is kept alive for 30d as a migration alias.`
  - FIX: This comment correctly identifies ecodia-full as deprecated/temporary. Delete as part of 30-day sundown OR keep as a reminder of deadline (2026-06-14 = 30d from 2026-05-15 authoring date in ecodiaFull.js line 15).

## D:/.code/ecodiaos/backend/src/routes/mcp/cowork.js  (2)
- **[D1|rewrite_section]** ` * Cowork V2 MCP - peerage substrate route file.`
  - FIX: Clarify this is DEPRECATED gen-1 custom connector. Users should migrate to narrow domain-scoped connectors (ecodia-core, ecodia-comms, ecodia-crm, etc). Scheduler tools moved to ecodia-scheduler.
- **[D2|rewrite_section]** ` * Auth:  bearer from kv_store.creds.cowork_mcp_bearer via coworkAuth middleware.`
  - FIX: DEPRECATED bearer for gen-1 connector. Clients must migrate to ecodia-scheduler for scheduler tools, ecodia-core for status_board/kv_store/neo4j, etc.

## D:/.code/ecodiaos/backend/src/routes/mcp/coworkMcpShim.js  (1)
- **[D1|delete_line]** `  name: 'EcodiaOS Cowork V2',`
  - FIX: This is the custom connector name. Entire coworkMcpShim.js is for D1 (deprecated gen-1 custom connector). Mark file for removal after 30-day sundown or reference as DEPRECATED.

## D:/.code/ecodiaos/backend/src/routes/mcp/ecodiaFull.js  (4)
- **[D3|rewrite_section]** ` * ecodia-full MCP - HTTP MCP endpoint with wider bearer than cowork.`
  - FIX: Change to describe ecodia-full as DEPRECATED (30-day alias until 2026-06-14); users should migrate to narrow domain-scoped connectors (ecodia-core, ecodia-comms, ecodia-crm, etc).
- **[D3|rewrite_section]** ` * Auth:  bearer from kv_store.creds.ecodia_full_mcp_bearer via ecodiaFullAuth.`
  - FIX: Clarify this is a DEPRECATED bearer; clients should migrate to ecodia-scheduler, ecodia-core, ecodia-comms, etc with domain-specific bearers.
- **[D3|rewrite_section]** ` * Tool surface = (cowork V2 tools, re-exposed) UNION (10 stdio MCP servers`
  - FIX: DEPRECATED: remove this description. ecodia-full is a 30-day migration alias. Users should call domain-specific narrow connectors (ecodia-core, ecodia-comms, ecodia-crm, ecodia-money, ecodia-graph, ecodia-shell, ecodia-s
- **[D3|rewrite_section]** ` * Spec: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §2.`
  - FIX: ecodia-full itself is DEPRECATED. Refer users to narrow-connector architecture (ECODIA_FULL_MCP_INVENTORY_2026-05-15.md describes the narrow connectors that replace ecodia-full).

## REGION SUMMARIES
- **claude-md-hierarchy** (17): CLAUDE.md / AGENTS.md doctrine hierarchy audit complete. Scanned 5 doctrine files + bootstrap pointers.

DEAD REFERENCES FOUND:
- D2 (deprecated /api/mcp/cowork gateway): 8 instances in global + workspace + backend CLAUDE.md files. The "MCP endpoints" section explicitly describes this as a REST gateway with 22 tools and 20-scope bearer. Referenced in SELF.md unverified-claims and operational-concerns sections.
- D3 (ecodia-full as canonical): 2 instances in global CLAUDE.md describing /api/mcp/ecodia-full as "wide" surface with 68 scopes. Referenced in SELF.md operational-concerns section.
- D1 (claude.ai Custom Connector): 1 reference (implicit) in backend CLAUDE.md line describing "Custom connector registered on claude.ai" (20 scopes).

CLEAN FILES (zero dead references):
- D:/.code/ecodiaos/backend/AGENTS.md - cross-agent bootstrap pointer, no MCP endpoints section, redirects to canonical doctrine
- D:/.code/ecodiaos/AGENTS.md - workspace root redirect, single-line pointer, no dead content
- D:/.code/ecodiaos/backend/.clinerules - one-line Cline redirect to AGENTS.md
- D:/.code/ecodiaos/.clinerules - workspace root redirect, minimal pointer
- C:/Users/tjdTa/Documents/Cline/Rules/00-ecodiaos-bootstrap.md - global Cline bootstrap pointer, no MCP endpoints, identity-only content

CRITICAL: The /api/mcp/cowork endpoint is woven through the "MCP endpoints" section and three operational guidance sections (SELF.md claims + concerns). The 30-day backwards compatibility alias window mentioned in SELF.md has expired. All references should move readers to the 10 narrow domain-scoped connectors (ecodia-core, ecodia-comms, ecodia-crm, ecodia-money, ecodia-graph, ecodia-shell, ecodia-supabase, ecodia-scheduler, ecodia-code, and the dying ecodia-factory).
- **patterns-A-cowork** (9): Audited 30 pattern files in D:/.code/ecodiaos/backend/patterns/ matching cowork/mcp/connector/scheduler/dispatch/ecodia-full/bearer keywords. Found 8 findings across 4 files flagging deprecated MCP surfaces (D2: /api/mcp/cowork gateway described as current/canonical for scheduling; D3: /api/mcp/ecodia-full described as current wide surface). All Cowork-related narrative files are marked DEPRECATED in frontmatter; the issues are specific lines within those files and in the scheduler/ecodia-full files that describe the dead surfaces as canonical/current without sufficient migration guidance. 17 files are clean (either describe live primitives or already properly contextualize dead paths).
- **patterns-B-mcp** (21): Audited D:/.code/ecodiaos/backend/patterns/ for MCP-connector migration references. Found 24 findings spanning D1 (Cowork deprecation), D2 (/api/mcp/cowork gateway framing), and D3 (ecodia-full wide-bearer deprecation). Key targets: (1) Delete entirely: claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md, cowork-conductor-dispatch-protocol.md, conductor-cowork-duo-roles-and-handoffs.md, ecodia-full-mcp-proxy-architecture-2026-05-15.md. (2) Rewrite: prefer-ecodia-full-over-narrow-connectors (reverse precedence to narrow-first), cowork-v2-api-shape-conventions (clarify legacy naming + scheduler redirect), self-scheduling (route to ecodia-scheduler connector, not /api/mcp/cowork/scheduler.*), routine-corpus-architecture (specify narrow connectors, not monolithic ecodia). (3) Remove INDEX entries for the 4 deleted files. Clean files have NO dead references.
- **docs-and-secrets** (5): Audit of D:/.code/ecodiaos/backend/docs/ region completed. Total files scanned: 88. Five dead references found across three files. Four references are to ecodia-full bearer (D3) in context where they describe the NEW canonical state (post-migration), requiring clarification rather than deletion. One reference is to the deprecated Cowork V2 connector (D1) used as a historical precedent for bearer-token auth support, requiring rewrite to acknowledge deprecation. One reference in the DR runbook points to the deprecated cowork_mcp_bearer, requiring update to point to ecodia_full_mcp_bearer or the appropriate narrow bearer. No references to the /api/mcp/cowork gateway DESCRIBED AS CANONICAL or the /api/mcp/ecodia-full DESCRIBED AS A TEMPORARY ALIAS were found - these docs appear to be post-migration architecture docs that correctly position ecodia-full as the target. The A-alive references (cowork.dispatch_worker, coord.* tools, tools/cowork.js, ecodia-scheduler, script cowork-dispatch) are preserved correctly throughout and not flagged."
- **routines** (2): Region audit D:/.code/ecodiaos/backend/routines/ complete. Scanned: REGISTRY.md, populateRegistry.js, accountRouter.js, and 27 routine prompt bodies. Found 2 D2 dead references: `requires_bearer: cowork` lines in auto-memory-promotion-audit.md and neo4j-stale-node-audit.md. These reference the dead gen-1 cowork V2 connector bearer concept. Extensive use of cowork-namespace kv_store keys (cowork.*) and cowork_realisation type annotations is ALIVE (A1 primitive infrastructure), not dead. No D1 connector name references, no D3 ecodia-full-as-canonical references, and no scheduling-path D2 references found in prompts. Region is 99% clean with 2 targeted bearer-name rewrites needed."
- **src-mcp** (8): Audited D:/.code/ecodiaos/backend/src/routes/mcp/ and related services. Found 8 flagged dead references: D1 (cowork-v2 custom connector name + gen-1 framing in cowork.js and coworkMcpShim.js), D2 (cowork_mcp_bearer in cowork.js line 5), D3 (/api/mcp/ecodia-full described as current/canonical in ecodiaFull.js §1-2; ecodia-full is explicitly a 30-day migration alias per app.js line 346, but ecodiaFull.js does not clearly state this). Scheduler tools in cowork.js (lines 1236-1409) are present in ecodia-full but should migrate to ecodia-scheduler connector. Factory is mounted as ecodia-factory connector (not via cowork/ecodia-full). Clean files: connectorMcpShim.js, mountConnector.js, connectorManifests.js, and osSessionService.js contain NO references to deprecated D1/D2/D3 surfaces.
- **mcp-config-and-example** (2): MCP config surface audit complete. Region: D:/.code/ecodiaos/.mcp.json, .mcp.heavy.json, backend/.mcp.json, backend/.mcp.json.example. Found 2 D3 violations in backend files where ecodia-full is described with '30d alias' expiry framing or '22 cowork tools' terminology. The .mcp.json root and .mcp.heavy.json files are clean - they reference only canonical narrow connectors (ecodia-core, -code, -scheduler) or legitimate domain-scoped targets. No D1 or D2 references found (no /api/mcp/cowork or custom-connector terminology)."
- **hooks** (12): Audited 60 hook script files across C:\Users\tjdTa\.claude\hooks\ecodia\ and D:\.code\ecodiaos\backend\scripts\hooks\. Found 12 references to dead MCP surfaces: 4 D1 references (mcp__claude_ai_EcodiaOS_Cowork_V2__ connector tools in observer_signal_auto_ack.py), 1 D2 reference (the /api/mcp/cowork gateway URL in memory-substrate-routing.py), and 7 D3 references (ecodia-full presented as canonical MCP surface in dispatch_sched_reflex_surface.py, observer_signal_auto_ack.py, status_board_hygiene.py, neo4j_decision_detect.py, and plan_drift_mutator.py). All references must be rewritten to use narrow domain-scoped connectors (ecodia-core, ecodia-scheduler, ecodia-supabase, ecodia-shell, etc.) or removed. No references to A1 (cowork.dispatch_worker primitive), A2 (coord.* tools), A3 (legacy scripts), or A4 (ecodia-scheduler) were found in dead context. 4 hook files contained no dead references.
- **memory-and-self** (12): Audit of EcodiaOS auto-memory and backend docs for MCP-connector migration deprecations. Region covers C:/Users/tjdTa/.claude/projects/d---code/memory/ and D:/.code/ecodiaos/backend. Findings: 10 dead references across docs (D2: /api/mcp/cowork framed as canonical or scheduling path - 8 hits; D3: /api/mcp/ecodia-full framed as canonical - 1 hit; D1: claude_ai_EcodiaOS_Cowork_V2 connector - 2 hits). No D1 references in primary doctrine; D2 most prevalent in patterns + CLAUDE.md. Clean files contain accurate 30-day alias framing and narrow-connector architecture. Cutover is 2026-06-14 per reference_domain_scoped_mcp_connectors_2026-05-15.md, now operative as the real scheduling boundary.