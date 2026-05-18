# ecodia-full MCP server inventory - 2026-05-15

Authored as part of Migration Lane E. Documents the stdio MCP servers that
`/api/mcp/ecodia-full` proxies, the tools each exposes, the scope each tool
will require under the wider bearer at `kv_store.creds.ecodia_full_mcp_bearer`,
and the risk surface that drives the audit + allowlist contract.

Source of truth: `~/ecodiaos/.mcp.json` on VPS (170.64.170.191) +
`~/ecodiaos/mcp-servers/<name>/index.js` for tool definitions.

## Inventory summary

The Corazon dispatcher chat described "12 stdio servers". The .mcp.json on
VPS does list 12 entries, but two of them (`github`, `stripe`) reference
directories that do not exist on disk. Those are dead stubs from an earlier
plan and are excluded from the proxy. Effective inventory is 10 live servers.

| Server | Tools | Transport | Risk |
|---|---|---|---|
| factory | 10 | HTTP shim to `localhost:3001` (`MCP_INTERNAL_TOKEN`) | medium - dispatches Claude Code sessions |
| google-workspace | 33 (gmail 12 + drive 13 + calendar 5 + contacts 4) | Google service-account, domain-wide delegation | high - can email any account |
| supabase | 8 (db_* x4, storage_* x4) | Direct postgres + supabase-js | high - direct DB write |
| vps | 4 (`shell_exec`, `pm2_list`, `pm2_logs`, `pm2_restart`) | execFile on host | **critical** - arbitrary shell |
| business-tools | 24 (vercel 4, zernio 12, xero 4, linkedin 4, meta 4) | Vercel API, Zernio, Xero (via backend), LinkedIn, Meta Graph | medium - external surface posts |
| bookkeeping | 19 | HTTP shim to backend | medium - GL writes, GST posture |
| crm | 17 | HTTP shim to backend | low/medium - CRM writes |
| scheduler | 8 (`schedule_cron`/`_delayed`/`_chain`/`_list`/`_cancel`/`_pause`/`_resume`/`_run_now`) | HTTP shim to backend (poller owns fire) | medium - can schedule arbitrary prompt fires |
| neo4j | 10 (`graph_*`) | Direct Aura driver, Supabase write-ahead buffer | low - read-mostly graph |
| sms | 4 (`send_sms`, `make_call`, `list_messages`, `list_calls`) | Twilio REST | high - outbound SMS to any number, voice ops |

Plus the existing 22 V2 tools surfaced by `/api/mcp/cowork` are re-exposed
under ecodia-full so a single bearer can drive the full operating surface:
`status_board.query/upsert`, `kv_store.get/set`, `neo4j.search`, `email_threads.query`,
`crm.read`, `forks.list/spawn/abort`, `cowork.heartbeat/session_started/session_ended`,
`inbox.read`, `gmail.send`, `sms.tate`, `scheduler.cron/delayed/list`, etc.

Total tool surface under ecodia-full: ~140 tools, derived from a single bearer.

## Per-server tool list (raw, for the route handler + registry)

### factory (10)
- start_cc_session
- get_factory_status
- get_session_progress
- get_cc_session_details
- list_codebases
- send_cc_message
- resume_cc_session
- review_factory_session
- approve_factory_deploy
- reject_factory_session

### google-workspace (33)
- gmail: gmail_send, gmail_reply, gmail_create_draft, gmail_list_messages, gmail_get_message, gmail_get_thread, gmail_list_labels, gmail_create_label, gmail_modify_labels, gmail_mark_read, gmail_archive, gmail_trash
- drive: drive_search, drive_list_folder, drive_get_file, drive_create_folder, drive_create_doc, drive_create_sheet, drive_read_sheet, drive_update_doc, drive_update_sheet, drive_append_sheet, drive_move_file, drive_delete_file, drive_share_file
- calendar: calendar_create_event, calendar_list_events, calendar_get_event, calendar_update_event, calendar_delete_event
- contacts: contacts_list, contacts_search, contacts_create, contacts_update

### supabase (8)
- db_query, db_execute, db_list_tables, db_describe_table
- storage_list, storage_get_url, storage_upload, storage_delete

### vps (4)
- shell_exec
- pm2_list
- pm2_logs
- pm2_restart

### business-tools (24)
- vercel: vercel_list_projects, vercel_list_deployments, vercel_get_deployment, vercel_trigger_deploy
- zernio: zernio_list_accounts, zernio_create_post, zernio_get_post, zernio_list_posts, zernio_delete_post, zernio_get_analytics, zernio_get_upload_url, zernio_best_time_to_post, zernio_get_comments, zernio_reply_comment, zernio_get_conversations, zernio_send_message
- xero: xero_get_contacts, xero_get_invoices, xero_get_transactions, xero_categorize
- linkedin: linkedin_create_post, linkedin_get_posts, linkedin_check_dms, linkedin_send_dm
- meta: meta_list_pages, meta_create_post, meta_get_conversations, meta_send_message

### bookkeeping (19)
- bk_post_transaction, bk_batch_post, bk_categorize, bk_auto_categorize, bk_create_rule, bk_delete_rule, bk_list_rules
- bk_list_staged, bk_staged_counts, bk_discard
- bk_ledger, bk_list_accounts, bk_trial_balance, bk_balance_sheet, bk_pnl, bk_cash_flow
- bk_bas, bk_gst_position, bk_director_loan_balance

### crm (17)
- crm_create_client, crm_list_clients, crm_search_clients, crm_get_client, crm_update_stage
- crm_create_project, crm_get_projects
- crm_get_tasks, crm_complete_task, crm_add_contact, crm_get_contacts
- crm_add_note, crm_get_timeline, crm_get_intelligence
- crm_dashboard, crm_pipeline, crm_revenue

### scheduler (8)
- schedule_cron, schedule_delayed, schedule_chain
- schedule_list, schedule_run_now
- schedule_pause, schedule_resume, schedule_cancel

### neo4j (10)
- graph_search, graph_query, graph_context, graph_schema
- graph_create_node, graph_merge_node, graph_create_relationship, graph_reflect
- graph_semantic_search, graph_replay_buffer

### sms (4)
- send_sms, make_call, list_messages, list_calls

## Architecture decisions

### Spawn-stdio, not in-process require

The stdio MCP servers are ESM (`@modelcontextprotocol/sdk/server/stdio.js`,
`import` syntax). The Express backend is CommonJS (`require`). Cross-module
calls are possible via dynamic `import()` but every server has its own
package.json + node_modules + per-server env-var contract (`MCP_INTERNAL_TOKEN`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `TWILIO_*`, etc).

The cleaner shape: spawn each server as a long-lived child process, hold a
JSON-RPC client per server, route ecodia-full tool calls through the
appropriate child. Behaviour is then identical to a Claude Code CLI session
loading the same stdio MCP servers - which means we get zero behaviour drift.

Lifecycle: spawn on first use, keep warm, restart on exit. Crash-loop
detection (3 restarts in 60s = mark unhealthy, return tool-call errors until
manual intervention). All child stdout/stderr is logged to `kv_store.cowork.shell_audit`-style audit keys.

### Wider bearer, additive to cowork

`kv_store.creds.ecodia_full_mcp_bearer` is the new bearer. It carries a
wider `scopes` array that includes everything the cowork bearer has, plus:

- write.factory.dispatch
- write.factory.approve
- read.factory.session
- write.gmail.send.any (vs cowork's `write.gmail.send` capped to code@/tate@)
- write.gmail.draft
- write.drive
- write.calendar
- read.calendar
- write.contacts
- write.bookkeeping
- write.crm
- write.scheduler.delete (vs cowork's `write.scheduler.cron` create-only)
- write.scheduler.pause
- write.supabase.db (direct SQL write)
- write.supabase.storage
- write.business_tools.vercel
- write.business_tools.zernio
- write.business_tools.linkedin
- write.business_tools.meta
- read.business_tools.xero
- write.neo4j.graph (vs cowork's `write.neo4j.episode/decision`)
- write.sms.any (vs cowork's `write.sms.tate`)
- write.sms.voice
- write.vps.shell_exec (CRITICAL - see below)
- write.vps.pm2

About 50-60 scopes total. The cowork bearer keeps its 20.

### Shell-exec gate design

`vps.shell_exec` is the highest-risk tool. Blast radius = root-equivalent
on the EcodiaOS production VPS (the `tate` user owns the entire production
stack, all credentials, and the deploy pipeline).

Defense layers:

1. **Scope gate**: `write.vps.shell_exec` must be present on the bearer.
   The bearer that the conductor uses has it; bearers minted for sub-agents
   or routines don't have to.
2. **Denylist** (server-side, hardcoded):
   - `rm -rf /` (and any variant matching `/^\s*rm\s+-r[f]?\s+\/(\s|$)/`)
   - `mkfs`, `mkfs.*`
   - `dd of=/dev/`
   - `:(){:|:&};:` (fork bomb)
   - `chmod 777 /`
   - `curl ... | bash`, `wget ... | bash` (live shell-pipe from net)
   - `> /dev/sda`, `> /dev/sd*`
3. **Audit log**: every shell-exec call writes `kv_store.cowork.shell_audit.<ts>.<fingerprint>` with
   `{ ts, bearer_fingerprint, command, cwd, exit_code, stdout_first_2k,
   stderr_first_2k, duration_ms, denied: <reason if any> }`.
4. **Rate cap**: 60 shell_execs per hour per bearer fingerprint.
5. **Timeout cap**: max 60s (was 30s in stdio server; ecodia-full keeps 30s default but caps at 60s hard).
6. **Confirm-gate (optional, opt-in per call)**: if `requires_confirmation: true`
   in the args, the route writes a `status_board.context` row with the
   pending command and waits 60s for any abort signal (presence of a
   `kv_store.cowork.shell_abort.<id>` key set by the tate watcher).
   If abort key exists, the call returns `aborted` without executing.

If at any point Tate decides shell-exec is too hot to expose at all, the
scope can be removed from the bearer in kv_store and the tool returns 403
without code change.

### What this proxy does NOT do

- It does not add new tools that don't exist in the underlying stdio
  servers. The wider bearer just unlocks a wider subset of an existing surface.
- It does not bypass the per-server idempotency or rate-limiting logic
  built into the underlying servers (factory has its own rate caps, gmail
  has its own dedupe, etc).
- It does not multiplex requests to the same child server in parallel
  (JSON-RPC over stdio is request-response, sequential per pipe). High-volume
  calls to a single server queue. If that becomes a bottleneck, the fix is
  to spawn N children for that server, not to abandon stdio.

## Open questions

1. **Custom-Connector auth shape** (whether claude.ai accepts raw bearer or
   demands OAuth). This is parallel-work for Tate per
   `MIGRATION_PARALLEL_WORK_FOR_TATE.md`. The OAuth wrapper at
   `/api/oauth/mcp/*` is authored here defensively so either works.
2. **Sub-bearers**: do we mint per-account or per-routine bearers off the
   ecodia-full root, each with a narrower scope subset? The cred-rotation
   pattern says yes eventually, but for v1 the single wider bearer + audit
   log is the durable record. Sub-bearers are a Phase 2 spawn.
3. **Cred rotation**: when the ecodia-full bearer is rotated (planned 90d
   cadence per cred-rotation pattern), all consumers (claude.ai connectors
   on tate/code/money accounts + the 16 routine prompts + any hardcoded
   references) must be updated atomically. The rotation runbook is in the
   pattern file authored alongside this lane.

## Authored

2026-05-15. Source for E1 of migration Lane E.
