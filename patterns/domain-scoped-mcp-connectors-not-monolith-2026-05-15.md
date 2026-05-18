---
name: domain-scoped-mcp-connectors-not-monolith-2026-05-15
triggers:
  - ecodia-core
  - ecodia-comms
  - ecodia-code
  - ecodia-money
  - ecodia-shell
  - ecodia-supabase
  - ecodia-scheduler
  - ecodia-crm
  - ecodia-graph
  - ecodia-factory
  - domain-scoped-mcp-connectors
  - 10-connector-taxonomy
  - mcp-connector-split
  - per-connector-bearer
  - per-connector-oauth-client
  - per-connector-scope
  - tools-list-deferred-load
  - tools-describe
  - mcp-token-cost
  - mcp-permission-compartmentalisation
  - blast-radius-narrow-bearer
  - mountConnector
  - connector-manifests
  - ecodia-full-migration-alias
  - 30-day-migration-alias
authored: 2026-05-15
status: live
authors: Corazon Claude Code (Phase 2 Lane 10 conductor)
---

# Domain-scoped MCP connectors, not a monolith

`/api/mcp/ecodia-full` was a single endpoint exposing all 157 tools across
10 stdio MCP servers + the cowork V2 in-process surface. Two costs:

1. **Token cost.** Every session loading the connector paid ~22k tokens
   for tool-definition overhead alone (11% of a 200k context window).
2. **Permission compartmentalisation absent.** One bearer leaked = the
   entire surface compromised: shell_exec, live Stripe, Vercel project
   deletion, Gmail to any address, direct Postgres writes.

Phase 2 Lane 10 (2026-05-15) split it into 10 narrow connectors. Each has
its own URL, bearer, OAuth `client_id`, scope subset, and audit log mirror.

## The 10-connector taxonomy

| Connector | Mount | Tools | Bearer key | OAuth client_id |
|---|---|---|---|---|
| `ecodia-core` | `/api/mcp/ecodia-core` | 14 | `creds.ecodia_core_mcp_bearer` | `ecodia_core_connector` |
| `ecodia-comms` | `/api/mcp/ecodia-comms` | 41 | `creds.ecodia_comms_mcp_bearer` | `ecodia_comms_connector` |
| `ecodia-code` | `/api/mcp/ecodia-code` | 6 | `creds.ecodia_code_mcp_bearer` | `ecodia_code_connector` |
| `ecodia-money` | `/api/mcp/ecodia-money` | 23 | `creds.ecodia_money_mcp_bearer` | `ecodia_money_connector` |
| `ecodia-shell` | `/api/mcp/ecodia-shell` | 4 | `creds.ecodia_shell_mcp_bearer` | `ecodia_shell_connector` |
| `ecodia-supabase` | `/api/mcp/ecodia-supabase` | 8 | `creds.ecodia_supabase_mcp_bearer` | `ecodia_supabase_connector` |
| `ecodia-scheduler` | `/api/mcp/ecodia-scheduler` | 15 | `creds.ecodia_scheduler_mcp_bearer` | `ecodia_scheduler_connector` |
| `ecodia-crm` | `/api/mcp/ecodia-crm` | 18 | `creds.ecodia_crm_mcp_bearer` | `ecodia_crm_connector` |
| `ecodia-graph` | `/api/mcp/ecodia-graph` | 10 | `creds.ecodia_graph_mcp_bearer` | `ecodia_graph_connector` |
| `ecodia-factory` | `/api/mcp/ecodia-factory` | 10 | `creds.ecodia_factory_mcp_bearer` | `ecodia_factory_connector` |

A typical session now loads 2-4 connectors totalling 30-80 tools instead
of 157. VS Code default daily-driver is `ecodia-core + ecodia-code + ecodia-scheduler`
(~6k tokens, was ~22k). Heavy-lift sessions swap in `.mcp.heavy.json` for
+comms/+money/+shell/+supabase/+graph.

## How to add an 11th connector (do not be hasty)

The taxonomy was chosen to match how work actually decomposes, not the
underlying stdio server boundaries. Reasons to add a connector:

1. A new tool family ships that doesn't fit any existing connector AND
   exceeds ~10 tools (under 10, slot it into the closest existing connector).
2. A permission boundary tightens such that a subset of an existing
   connector needs to live behind its own bearer.

Reasons NOT to add a connector:

- "It would be cleaner to separate X from Y." Cleanliness is not the
  test. Permission boundary + token cost are.
- "Routine R only needs three tools." Three tools doesn't justify a new
  endpoint; routines specify per-connector lines that load the parent.

Process to add: extend `backend/src/services/connectorManifests.js`,
mint bearer + OAuth client via
`backend/src/scripts/register-connector-oauth-clients.js`, add the path
to `app.js` `PUBLIC_PATH_PATTERNS`, document the credential block in
`MCP_CONNECTOR_CREDENTIALS_<date>.md`, paste the block into the relevant
claude.ai accounts.

## Deferred-load discipline (always)

`tools/list` returns minimal entries: `name + 1-line description +
inputSchema={_deferred: true}`. Full inputSchema lands per-tool via the
new `tools/describe` method on each connector. Reference impl in
`backend/src/routes/mcp/connectorMcpShim.js`. Without this, a session
loading 4 connectors still pays the full inputSchema overhead even
for tools it never calls.

Companion: `tools/describe` returns `tool_not_in_connector` for any tool
outside the connector's allowlist. Cross-connector deny works at both
describe-time and call-time.

## Naming convention

Connectors are named for their **purpose**, not their underlying stdio
server. `ecodia-comms` (not `ecodia-google-workspace`) because it bundles
Gmail, Drive, Calendar, Contacts, SMS, voice. `ecodia-money` (not
`ecodia-bookkeeping`) because it includes Xero. The substring `ecodia-`
gates discovery (the public-path regexes in `app.js` look for
`/^\/api\/mcp\/ecodia-[a-z-]+/`), so any new connector matching the
prefix automatically gets public discovery treatment.

## When the wide `ecodia-full` is needed

**Post-shipping: none.** The endpoint exists from 2026-05-15 through
2026-06-14 as a 30-day migration alias so existing Custom Connectors and
routines pointing at it keep working. After 2026-06-14, the route can be
removed.

If a workflow genuinely spans many surfaces simultaneously (e.g. a DR
session that needs shell + supabase + comms + factory), load the
matching narrow connectors rather than the wide bearer. The wide bearer
should never be re-introduced as a daily-driver pattern.

## How to apply

- **Authoring new MCP work**: add tools to the matching connector's
  manifest in `connectorManifests.js`. Don't write new tools that span
  connectors.
- **Routine authoring**: declare `connectors:` per-routine, picking only
  what the routine actually uses. Routine prompts at
  `backend/routines/*.md` already do this as of Phase 2 Lane 10.
- **Session opening**: VS Code `.mcp.json` loads 3 connectors by default;
  swap `.mcp.heavy.json` over for finance/comms/DR work.
- **Bearer rotation** (90d cadence): use
  `node src/scripts/register-connector-oauth-clients.js --rotate
  ecodia-<name>` to mint a new bearer + client_secret for one
  connector, then update the credential card and re-paste the new
  block into the affected claude.ai accounts.

## Related

- [[ecodia-full-mcp-proxy-architecture-2026-05-15]] - the monolith this
  pattern superseded; its proxy code still serves the 30d migration
  alias.
- [[cred-rotation-must-propagate-to-all-consumers]] - the rotation
  runbook each connector inherits.
- [[mcp-tool-param-schema-discipline]] - tool schema rules; deferred-
  load doesn't remove the requirement that the underlying schema is
  correct, only that it's fetched lazily.
- [[em-dashes-banned-character-level-no-exceptions]].
