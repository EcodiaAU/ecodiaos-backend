---
triggers: cowork-v2-api-shape, v2-mcp-callers, filter-nesting-rule, forks-list-default-parent, email-threads-gmail-thread-id, status-board-upsert-denied-types, kv-store-cowork-prefix, graph-semantic-search-v1-alias, mcp-shim-jsonrpc-root, cowork-bearer-scopes, every-call-shape-checklist
priority: critical
canonical: true
---

# Cowork V2 MCP API-shape conventions

## 1. The rule

When dispatching V2 MCP calls (`https://api.admin.ecodia.au/api/mcp/cowork/<endpoint>` or via the JSON-RPC shim at root URL), six API-shape conventions catch first-time callers. Codified after fork_moku5bge_23b7a5 ran 15/17 endpoints under live external load (Corazon laptop-agent `shell.shell` -> `Invoke-WebRequest` -> public api endpoint, NOT in-process curl). Read this file BEFORE writing any new V2 caller (Cowork-side helper script, external integration, ad-hoc shell test). The cost of skipping it is ~10 failed call cycles before you re-derive the same gotchas.

## 2. The six gotchas

### 2.1 All filters are nested under `filter`, not at top level

- WRONG: `{thread_id: 'abc', limit: 5}`
- RIGHT: `{filter: {thread_id: 'abc'}, limit: 5}`
- Affects: `status_board.query`, `forks.list`, `email_threads.read`.

### 2.2 forks.list default `parent` is 'cowork', not '*'

- Default returns ONLY forks parented by Cowork (currently zero, since V2 just landed).
- For all parents: `{filter: {parent: '*'}, limit: N}`
- For legacy conductor-parented fork history: `{filter: {parent: 'conductor'}, limit: N}`

### 2.3 email_threads.read `thread_id` matches `gmail_thread_id`, NOT internal UUID

- The 16-char Gmail API id (e.g. `19d50dab7c6f579a`) is the match key.
- The internal `email_threads.id` UUID will return zero rows.
- Shape: `{filter: {thread_id: '<gmail_thread_id>'}, limit: N}`

### 2.4 status_board.upsert denies entity_type=infrastructure or legal

- `STATUS_BOARD_DENIED_UPDATE_TYPES` enforced at scope layer (`coworkScope.js`).
- Cowork can write: `task`, `project`, `client`, `thread`, `opportunity`, `personal`.
- Cowork cannot write: `infrastructure`, `legal` (those stay conductor-only - hot-path security and legal review threads need conductor-side authorship).

### 2.5 kv_store.set requires `cowork.` prefix

- `KV_WRITE_NAMESPACES` on the Cowork bearer scope = `['cowork.', 'cowork-session.']`.
- Any non-prefixed key returns `403 namespace_violation`.
- Conductor bearer (separate scope) has no prefix restriction.

### 2.6 graph_semantic_search is the V1 alias of neo4j.search

- Both endpoints accept identical `{query, limit}` shape.
- Both return same result set + score.
- V1 form adds `_v1_alias: true` marker on response.
- Alias parity proven 30 Apr 2026 02:01 UTC under live load.

## 3. Bearer auth shape (every call)

```
Authorization: Bearer <token from kv_store.creds.cowork_mcp_bearer>
Content-Type: application/json
```

## 4. Endpoint inventory (17 routes, V2 ship 30 Apr 10:30 AEST)

**WRITE:**
- `cowork.heartbeat`
- `cowork.session_started`
- `cowork.log_session`
- `status_board.upsert`
- `kv_store.set`
- `neo4j.write_episode`
- `neo4j.write_decision`
- `forks.spawn` (cowork pool)
- `os_session.message`

**READ:**
- `status_board.query`
- `kv_store.get`
- `neo4j.search`
- `graph_semantic_search` (V1 alias)
- `patterns.semantic_search`
- `forks.list`
- `inbox.read`
- `email_threads.read`
- `crm.get_intelligence`

## 5. JSON-RPC shim at root URL

Shipped 30 Apr 02:10 UTC, durable ship in flight via fork_mokup4me_15830a.

- Methods: `initialize`, `tools/list`, `tools/call`, `prompts/list`, `resources/list`, `notifications/initialized`
- Wraps the 17 REST routes as MCP tools
- Required for claude.ai custom connector (Anthropic discovery handshake POSTs JSON-RPC at root)
- Direct REST routes still work for direct external callers (Cowork via Corazon used REST in coverage test)

## 6. When the gotchas hit you

| Error / symptom | Fix |
|---|---|
| Empty result set when you expected rows | Check filter nesting (gotcha 1) or default-parent (gotcha 2) |
| `403 namespace_violation` on `kv_store.set` | Add `cowork.` prefix (gotcha 5) |
| `403 entity_type_denied` on `status_board.upsert` | Change entity_type away from infrastructure/legal (gotcha 4) |
| `404 thread_not_found` on `email_threads.read` | Use `gmail_thread_id` (gotcha 3) |

## 7. Origin

Empirically derived by fork_moku5bge_23b7a5 30 Apr 12:00-12:10 AEST during full V2 endpoint coverage test. Original spec drafts at `~/ecodiaos/drafts/cowork-v2-endpoint-coverage-2026-04-30.md` (single source of truth for the gotchas; this file is the durable disk-resident mirror for grep-addressable retrieval). Mirrors Neo4j Pattern node 3977.

## 8. Cross-references

- `~/ecodiaos/patterns/conductor-cowork-duo-roles-and-handoffs.md` (parent doctrine; this gotcha list is operationalised inside the duo handoff protocol)
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` (meta-rule: V2 substrate uses Anthropic MCP standard, not custom JSON-RPC vocabulary)
- `~/ecodiaos/drafts/cowork-v2-endpoint-coverage-2026-04-30.md` (empirical coverage map)
- `src/routes/mcp/cowork.js` (the 17 REST handlers - line numbers per endpoint listed in coverage map)
- `src/middleware/coworkAuth.js` (bearer + scope enforcement)
- `src/middleware/coworkScope.js` (`KV_WRITE_NAMESPACES`, `STATUS_BOARD_DENIED_UPDATE_TYPES`)
