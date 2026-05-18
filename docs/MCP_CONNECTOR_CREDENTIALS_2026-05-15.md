# MCP Connector Credentials - Phase 2 Lane 10

**Authored 2026-05-15. KEEP THIS FILE PRIVATE. Treat as creds-grade.**

Phase 2 Lane 10 split `/api/mcp/ecodia-full` into 10 domain-scoped connectors.
Each has its own URL, bearer, OAuth `client_id`, and scope subset. Paste each
block into `claude.ai > Settings > Custom Connectors` on the account(s) named
in the block. `ecodia-full` stays alive for 30 days (until 2026-06-14) as a
migration alias - existing connectors against it continue to work.

## Hard-stop

**`ecodia-shell` registers on `tate@` ONLY.** Do not paste its block into
`code@` or `money@`. shell_exec lives on `tate@` alone. The dossier and this
file both flag this as a hard-stop.

## Common discovery metadata (use on every block)

- OAuth discovery (RFC 8414): `https://api.admin.ecodia.au/api/oauth/mcp/.well-known/oauth-authorization-server`
- PKCE method: `S256`
- Redirect URIs registered:
  - `https://claude.ai/api/organizations/connectors/oauth/callback`
  - `https://claude.ai/connectors/callback`

## How to paste a block into claude.ai

1. Open `claude.ai > Settings > Custom Connectors > Add Connector`.
2. Name = the value from "Name in claude.ai".
3. URL = the value from "URL".
4. Auth = `OAuth`. Paste `Client ID`, `Client Secret`, `Authorization URL`, `Token URL`, `Scope`.
5. If the form rejects OAuth, switch Auth to `Bearer` and paste the raw bearer instead.

Each connector listed below was registered with a 32-byte hex
`client_secret` and a 32-byte hex bearer. Both are stored in
`kv_store.ecodia_full.oauth_clients.<client_id>` and
`kv_store.<bearer_key>` respectively, so DR rotation can re-mint either
side independently via `node src/scripts/register-connector-oauth-clients.js --rotate <name>`.

---

## ecodia-core

- Name in claude.ai: `ecodia-core`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-core`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_core_connector`
- Client Secret: `e859cfad79b342db0fd26cd9a93c29053ecd30f43d016c2af774210050e90172`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_core_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-core`
- Bearer (raw, if a client supports bearer instead of OAuth): `ab112445f8410602bcb069527a5300671c0561024e3bb2c89fb163e015d1e3ed`
- Register on which accounts: `tate@`, `code@`, `money@`

Notes: always-on baseline. status_board, kv_store, neo4j (basic),
patterns, inbox, email_threads (read), os_session message. 14 tools.

---

## ecodia-comms

- Name in claude.ai: `ecodia-comms`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-comms`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_comms_connector`
- Client Secret: `85fefce5cc98ca31318564ef6dd05f38c4c9a6080584944dd1f838c22b4b2eaf`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_comms_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-comms`
- Bearer (raw): `35550c42018ece50f57defe81595c670cf453094f6cb02f22417fc4f2c437700`
- Register on which accounts: `tate@`, `code@`, `money@`

Notes: outbound comms. Gmail (12), Drive (13), Calendar (5), Contacts
(4), SMS/voice (5) plus the cowork-shape gmail.send + sms.tate + email
threads read. 41 tools.

---

## ecodia-code

- Name in claude.ai: `ecodia-code`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-code`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_code_connector`
- Client Secret: `e9088aaccc1ec09338aa3debcadcb828bad261e0cde2e2c60e2bd9ac859f308f`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_code_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-code`
- Bearer (raw): `0c662ae583fecf3a4cd1b4a8717a2111d747e80632ee2e9f057c5ef84f6b989c`
- Register on which accounts: `tate@`, `code@`

Notes: code/deploy surface. forks.spawn + forks.list (cowork in-process),
4 Vercel tools. codebase.context + visual.* sit on local stdio MCP
servers when the matching Phase 2 lanes land. VS Code default daily-load.

---

## ecodia-money

- Name in claude.ai: `ecodia-money`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-money`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_money_connector`
- Client Secret: `c9b07ed89e93b756af641baac05747b52a4347368dad6d27d93088258580550b`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_money_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-money`
- Bearer (raw): `c02934d5ffbaf8d9e134e9973d1737d9bb783d5f47f174c56f0ef810572ce687`
- Register on which accounts: `tate@`, `money@`

Notes: bookkeeping (19) + Xero (4). Used by weekly-financial-review,
stripe-event-handler, apple-asn-handler routines and any Cortex finance
session. 23 tools.

---

## ecodia-shell

- Name in claude.ai: `ecodia-shell`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-shell`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_shell_connector`
- Client Secret: `1b22975d5dce0666d8c6df3bb1e896a6018a36044a02b3893428564e048af64f`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_shell_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-shell`
- Bearer (raw): `17b90ba73d2c6cec0cdd594df0326fcbb7be20b92ac19d5f26bfa611353eba63`
- **Register on which accounts: `tate@` ONLY.** Do NOT add to `code@` or `money@`.

Notes: VPS shell_exec + PM2 (4 tools). shell_exec runs through the
dedicated `POST /api/mcp/ecodia-shell/shell_exec` route (denylist + rate
cap + optional confirm-gate). DR + infrastructure only.

---

## ecodia-supabase

- Name in claude.ai: `ecodia-supabase`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-supabase`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_supabase_connector`
- Client Secret: `612b81ff94c451c4ca4c348a83fa731af1a1ec1aa293e6bb80f80f4a63f6559c`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_supabase_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-supabase`
- Bearer (raw): `74e1f8bfbfe872b99c0ce413182ab1c76ee7d4da0620cfad90df4fc93915d8f1`
- Register on which accounts: `tate@`, `code@`

Notes: direct Postgres + Storage on the Supabase project. db_query / db_execute
/ db_list_tables / db_describe_table + 4 storage_*. 8 tools.

---

## ecodia-scheduler

- Name in claude.ai: `ecodia-scheduler`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-scheduler`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_scheduler_connector`
- Client Secret: `8d5ae60f0b86bec5f55c64ebfcbb7ecbd9afeb9098e599286bf941f0dad3f09a`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_scheduler_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-scheduler`
- Bearer (raw): `e3ce33c8d9c49d61f4d2d25f21cabb8e74b44994c23098bc3ed5f4e08f4639e8`
- Register on which accounts: `tate@`, `code@`, `money@`

Notes: scheduler + checkpoint primitives. Includes the cowork-shape
scheduler.cron/delayed/list + checkpoint.*, plus the full stdio scheduler
(cron/delayed/chain/list/run_now/pause/resume/cancel). 15 tools. VS Code default.

---

## ecodia-crm

- Name in claude.ai: `ecodia-crm`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-crm`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_crm_connector`
- Client Secret: `5dd775a9190843c0577ded1d0e7a23098e4bb146455b4b94d8c3d502b22ce37b`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_crm_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-crm`
- Bearer (raw): `fdef8e32741838547ab0bba673db27f31eb09fda8f4339392e36b684ea21536d`
- Register on which accounts: `tate@`, `money@`

Notes: CRM read + write surface. crm.get_intelligence (cowork) + 17 CRM tools
(clients, projects, tasks, contacts, notes, timeline, dashboard, pipeline,
revenue). 18 tools.

---

## ecodia-graph

- Name in claude.ai: `ecodia-graph`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-graph`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_graph_connector`
- Client Secret: `de42782348598973883bb0e3cf5660effa121bc02ae585491a8734d4f5284dad`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_graph_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-graph`
- Bearer (raw): `f433693fd25768e1a649c2e3207f3a0ad5cb7aab55427372b67c891c57606179`
- Register on which accounts: `tate@`, `code@`

Notes: deeper Neo4j operations beyond what ecodia-core ships. graph_search
/ graph_query / graph_context / graph_schema / graph_create_node /
graph_merge_node / graph_create_relationship / graph_reflect /
graph_semantic_search / graph_replay_buffer. 10 tools. For kg-consolidation,
neo4j-stale-node-audit, pattern-corpus-health-check routines.

---

## ecodia-factory

- Name in claude.ai: `ecodia-factory`
- URL: `https://api.admin.ecodia.au/api/mcp/ecodia-factory`
- Auth: OAuth (PKCE)
- Client ID: `ecodia_factory_connector`
- Client Secret: `a668977f86cbd221704a985193cedc27f9ba1a16bab2163ff6b993a48dfc7e81`
- Authorization URL: `https://api.admin.ecodia.au/api/oauth/mcp/authorize?client_id=ecodia_factory_connector`
- Token URL: `https://api.admin.ecodia.au/api/oauth/mcp/token`
- Scope: `mcp.ecodia-factory`
- Bearer (raw): `54824f833d0d8930f10b80ea0292a272f64f148593e3e48d5c0bb43e172d6d80`
- Register on which accounts: `tate@`, `code@`

Notes: Factory dispatch session control. start_cc_session /
get_factory_status / get_session_progress / get_cc_session_details /
list_codebases / send_cc_message / resume_cc_session / review_factory_session
/ approve_factory_deploy / reject_factory_session. 10 tools.

---

## Rotation runbook

To rotate one connector's bearer + client_secret:

```
ssh tate@100.103.227.90
source ~/.nvm/nvm.sh
cd ~/ecodiaos
node src/scripts/register-connector-oauth-clients.js --rotate ecodia-<name>
```

The script writes the new bearer to `kv_store.creds.ecodia_<name>_mcp_bearer`,
the new client_secret to `kv_store.ecodia_full.oauth_clients.ecodia_<name>_connector`,
and re-prints the credential card with the rotated values. Update
`MCP_CONNECTOR_CREDENTIALS_2026-05-15.md` and re-paste the rotated block
into the affected claude.ai accounts. The `consumers` field on the bearer
row says who needs to be touched.

Rotation cadence (per `cred-rotation-must-propagate-to-all-consumers.md`):
90 days. `rotation_due` is set on every bearer row at mint time.

## ecodia-full migration alias

`ecodia-full` stays mounted at `/api/mcp/ecodia-full` until **2026-06-14**
(30 days from Lane 10 ship). Existing Custom Connectors and routines
pointing at it continue to work. After 2026-06-14, the route can be
removed.

To verify the alias is still alive: `curl https://api.admin.ecodia.au/api/mcp/ecodia-full/_health`.

## Test ledger - 2026-05-15

All 5 dossier tests passed:

1. `/_health` returns 200 for all 10 connectors with the right tool_count.
2. `tools/list` returns expected manifest count per connector (14/41/6/23/4/8/15/18/10/10), all entries carry `_deferred: true` in inputSchema.
3. One representative read-only `tools/call` succeeded per connector (status_board.query, gmail_list_labels, forks.list, bk_list_accounts, pm2_list, db_list_tables, scheduler.list, crm_list_clients, graph_schema, get_factory_status). All returned `is_error=False http=200`.
4. Cross-connector denial: calling `gmail_list_labels` against `/api/mcp/ecodia-core` with the core bearer returned JSON-RPC `error.code=-32001 message=scope_denied data.reason=tool_not_in_connector`. Calling the same against `/api/mcp/ecodia-comms` with the **core** bearer returned `401 invalid_bearer`. Both denial paths verified.
5. OAuth PKCE flow validated for `ecodia_code_connector` and `ecodia_shell_connector` end-to-end (authorize -> code -> token -> issued bearer drives tools/call). Scope returned is the narrow per-connector scope (`mcp.ecodia-code`, `mcp.ecodia-shell`). Discovery metadata at `/.well-known/oauth-authorization-server` advertises all 11 scopes.

`tools/describe` (deferred-load companion fetch, §10.5) verified:
- `status_board.query` resolved with full inputSchema and `_source: "cowork_inprocess"`.
- `gmail_list_labels` against ecodia-core returned `error: "tool_not_in_connector"` (the cross-connector deny works at describe too, not just call).
