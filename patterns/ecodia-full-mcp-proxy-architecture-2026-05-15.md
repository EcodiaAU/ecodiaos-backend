---
name: ecodia-full-mcp-proxy-architecture-2026-05-15
triggers: ecodia-full, /api/mcp/ecodia-full, ecodia_full_mcp_bearer, wider-bearer, shell_exec-gate, mcp-proxy, stdio-proxy, tool-surface-registry, mcp-oauth-wrapper, bearer-rotation-additive
authored: 2026-05-15
status: live
authors: Corazon Claude Code (Lane E of VPS-to-local migration)
---

# ecodia-full MCP proxy architecture

`/api/mcp/ecodia-full` is the wide-bearer MCP endpoint that exposes the full
EcodiaOS operating surface through one HTTPS+SSE MCP server. It does this
by:

1. Re-exposing all 22 cowork V2 tools in-process (synthetic-request dispatch
   into the cowork router).
2. Proxying 10 stdio MCP child servers as long-lived JSON-RPC subprocesses
   (factory, google-workspace, supabase, vps, business-tools, bookkeeping,
   crm, scheduler, neo4j, sms).
3. Adding a dedicated `POST /shell_exec` route with denylist + rate cap +
   optional confirm-gate, separated from the tools/call surface so vps shell
   access is never accidentally invoked through the generic dispatch path.
4. Shipping an OAuth 2.0 PKCE wrapper at `/api/oauth/mcp/*` defensively in
   case claude.ai Custom Connectors reject raw Bearer auth.

Cowork stays. ecodia-full is additive, not a replacement. The two bearers
coexist with parallel kv_store rows and parallel audit logs.

## When to use which bearer

- **cowork bearer** (`kv_store.creds.cowork_mcp_bearer`, 20 scopes): narrow.
  For surfaces that only need status_board read, kv_store cowork.*, neo4j
  read + episode/decision writes, forks within cowork pool, gmail to
  code@/tate@ only, sms to Tate only, scheduler create only. Cannot update
  entity_type=infrastructure rows. Cannot dispatch Factory. Cannot drive
  Vercel/Stripe/shell.

- **ecodia-full bearer** (`kv_store.creds.ecodia_full_mcp_bearer`, 68 scopes):
  wide. For the conductor session, Routines that need the full surface,
  any consumer that needs Factory dispatch / Stripe full / Vercel CLI /
  Gmail to any account / SMS to any number / shell_exec / direct DB writes
  / pm2 control / status_board infrastructure updates.

Pick the narrowest bearer that does the job. The wide bearer is logged
audibly enough that every shell_exec and every infrastructure write is
recoverable from the audit log, but principle-of-least-privilege still
says: don't pass the master key to a script that needs to read one row.

## Architecture: spawn-stdio, not in-process require

The 10 stdio MCP servers are ESM (import `@modelcontextprotocol/sdk/server/stdio.js`).
The backend Express app is CommonJS. The natural way to bridge would be
`import()` the server modules in-process. We chose **not** to do this because:

- Each MCP server has its own `package.json` + `node_modules` + env-var
  contract (`MCP_INTERNAL_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `TWILIO_*`).
- Behaviour parity with the Claude Code CLI's stdio-loading path is the
  durable contract. Sub-process spawn matches that exactly. In-process
  loading would diverge over time as features land in the SDK transport.

Lifecycle is in `src/services/ecodiaFullStdioProxy.js`:

- Lazy spawn on first request to a server.
- Long-lived JSON-RPC pipe per server. Each request gets a unique id;
  responses match on id. Sequential per pipe.
- Restart on child exit (next request triggers respawn).
- Crash-loop guard: 3 restarts in 60s = mark unhealthy, fail-fast subsequent
  calls until manual reset.
- Graceful shutdown on SIGTERM (PM2 reload-safe).

If a child becomes a parallelism bottleneck, the fix is to spawn N children
for that server name, not to abandon stdio.

## shell_exec contract

shell_exec is the highest-risk tool in the surface. Blast radius is
root-equivalent on the production VPS. Defense layers:

1. **Scope gate**: `write.vps.shell_exec` must be on the bearer. Sub-bearers
   minted for narrow consumers should NOT carry this scope.
2. **Denylist** (regex, in `ecodiaFullScope.SHELL_EXEC_DENYLIST`):
   - `rm -rf /` variants
   - `mkfs*`
   - `dd of=/dev/(sd|*)`
   - `:(){:|:&};:` fork bomb
   - `chmod 777 /` / `chmod -R 777 /`
   - `curl|bash`, `wget|sh` (live shell-pipe from net)
   - `>/dev/sda*`
   - `userdel tate` / `userdel root`
   - `shutdown`, `reboot`, `halt`, `poweroff`
3. **Rate cap**: 60 calls/hour per bearer fingerprint
   (`ecodiaFullScope.RATE_CAPS.shell_exec_per_hour`).
4. **Timeout cap**: 30s default, 60s hard ceiling.
5. **Audit row**: every call writes to `ecodia_full_audit_log`
   + `kv_store.ecodia_full.shell_audit.<ts>.<fingerprint>.<call_id>` with
   command + cwd + exit_code + first 2k of stdout + first 2k of stderr +
   duration + denial reason (if any).
6. **Optional confirm-gate**: when `requires_confirmation: true`, the route
   inserts a `status_board` row of `entity_type=infrastructure` named
   `shell_exec pending confirmation <call_id>` and polls
   `kv_store.cowork.shell_abort.<call_id>` for 60s. If the abort key is set
   by anyone, the call returns aborted without executing. Otherwise it
   proceeds.

If shell_exec turns out to be too hot to expose at all, removing the
`write.vps.shell_exec` scope from the kv_store bearer row immediately gates
the entire route at 403 without any code change.

## OAuth wrapper (defensive)

`/api/oauth/mcp/*` is a minimal PKCE OAuth 2.0 dance authored alongside the
raw-bearer route. claude.ai Custom Connectors historically supported both,
but the current UI's contract is uncertain. Until Tate confirms which
auth shape the Connector accepts, the OAuth wrapper exists so the same
endpoint surface works either way.

Flow:
- `GET /authorize` - PKCE-validates the request, auto-approves (we control
  both sides), redirects with code.
- `POST /token` - exchanges code+verifier for the same bearer that's stored
  in kv_store. Also issues a refresh token (30d TTL).
- `POST /token` with `grant_type=refresh_token` - rotates refresh, re-issues
  access (which is just the kv_store bearer).
- `GET /.well-known/oauth-authorization-server` - RFC 8414 discovery for
  claude.ai to auto-find endpoints.

Client registration is stored at `kv_store.ecodia_full.oauth_clients.<client_id>`.
For v1 we seeded one client = `claude_ai_connector`.

## Bearer rotation

90d cadence. The rotation procedure:

1. Mint new bearer hex: `crypto.randomBytes(32).toString('hex')`.
2. Write new row at `kv_store.creds.ecodia_full_mcp_bearer` with the same
   scopes array. The route's cache TTL is 60s, so within a minute every
   downstream consumer that re-reads kv_store starts trusting the new token.
3. Update every consumer's stored copy of the bearer:
   - `~/.mcp.json` (Corazon and VPS root)
   - `D:/.code/EcodiaOS/.mcp.json` (local Claude Code on Corazon)
   - claude.ai Custom Connector header on each registered account
     (tate@, code@, money@) if Connectors are wired up.
   - Any Routine prompt that has the bearer baked in (avoid this; prefer
     reading from kv_store at runtime via the cowork bearer instead).
4. Watch `ecodia_full_audit_log` for 24h: every failing request that's
   using the OLD bearer surfaces as `invalid_bearer` 401s. Cross-reference
   the bearer fingerprint to identify which consumer wasn't updated.
5. After 24h clean, the old fingerprint is dead. Don't delete; archive
   the old token to `kv_store.creds.ecodia_full_mcp_bearer.archive.<ts>`
   for incident post-mortem.

## Tool surface registry

`kv_store.cowork.mcp_tool_registry` is the JSON snapshot of every tool
exposed via ecodia-full with name, source, required scopes, audit category,
rate caps. Regenerate via:

    node src/scripts/mcp-tool-registry-regen.js

Run cadence: nightly (hook into nightly-restart) or on every pm2 reload.
The regen script spawns each stdio child to introspect tools/list, then
writes the snapshot. Cold start ~5-10s for all 10.

Consumers of the registry:
- The accountRouter uses it to decide which tool calls need the wider
  bearer vs which can run on cowork.
- Routine prompts read the per-routine scope subset from the registry to
  validate they're not calling tools they don't have scope for.
- Any audit dashboard.

## When NOT to use ecodia-full

- For status_board.query / kv_store.get and other read-only narrow
  operations from a fork or sub-agent: use cowork. Smaller blast radius
  if the bearer leaks.
- For routines that only need 3 tools (e.g. inner-life only needs
  status_board.query + kv_store.get + neo4j.search): mint a per-routine
  sub-bearer with a 3-scope subset, not the master key.
- For client-facing surfaces: never. ecodia-full is internal infrastructure
  only.

## See also

- `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` §2, §6 - parent
  spec.
- `backend/docs/ECODIA_FULL_MCP_INVENTORY_2026-05-15.md` - per-server tool
  catalogue and scope mapping.
- `backend/patterns/cred-rotation-must-propagate-to-all-consumers.md` -
  rotation discipline (this file's §"Bearer rotation" is the specific
  ecodia-full instance of that general pattern).
- `backend/patterns/mcp-tool-param-schema-discipline.md` - schema rules
  for tools added under ecodia-full.
- Neo4j Decision node id 2400, "ecodia-full MCP proxy shipped - 2026-05-15"
- status_board rows: infra `4c8e870c-b00a-4f09-9a7b-01be89230883` (live)
  + task `92c51288-e6c9-422b-b14b-d5026b5a81db` (sibling-lane notification)
