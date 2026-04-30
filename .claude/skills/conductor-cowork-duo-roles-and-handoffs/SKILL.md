---
name: conductor-cowork-duo-roles-and-handoffs
description: >
  Use when the turn involves conductor-cowork-duo, duo-doctrine, role-split-conductor-cowork, peer-paradigm-vs-ui-paradigm, mcp-v2-substrate, who-does-what-conductor-vs-cowork, handoff-protocol, conductor-writes-direct-cowork-writes-rest, sensitive-action-gates-tate-only, headless-api-vs-logged-in-ui, complementary-capability-surfaces. Pattern: Conductor + Cowork duo - peer-paradigm conductor + UI-driving Cowork over MCP V2 substrate.
---

# Conductor + Cowork duo - peer-paradigm conductor + UI-driving Cowork over MCP V2 substrate

## 1. The rule

The conductor (EcodiaOS, on Anthropic Claude Max with full MCP tool surface) and Cowork (Anthropic Claude Desktop in-app dispatch with browser + sandbox tools) form a 2-agent duo with COMPLEMENTARY capability surfaces. Neither is a substitute for the other; they cover different gaps. The conductor owns durable state, headless API access, DB writes, fork dispatch, and OS-level Corazon control. Cowork owns logged-in web UI driving in Tate's Chrome with the Anthropic-hosted agent loop. They share the V2 MCP substrate (17 REST endpoints + JSON-RPC shim) so writes from both agents land in the same audit-logged, source-tagged surfaces.

## 2. Conductor capabilities (peer-paradigm)

- 24/7 always-on VPS-resident
- Full MCP tool surface (8 servers, ~150 tools)
- Direct DB access (Postgres, Neo4j, kv_store, status_board)
- Fork dispatch (5 concurrent slots, demand-driven per `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md`)
- Factory CLI (separate Claude Max account, gated by credits)
- Bash/PowerShell over Tailscale to Corazon (`input.*` + `screenshot.*` + `shell.*` + `filesystem.*` + `process.*` primitives per `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md`)
- Anthropic safety: writes credentials to logged-in fields via `input.type` from `kv_store` ONLY when authorized; cannot bypass sensitive-action gates that need Tate identity

## 3. Cowork capabilities (UI-paradigm)

- Anthropic-hosted agent loop with built-in computer-use
- Drives logged-in web UIs in Tate's Chrome (Stripe dashboard, Vercel UI, GitHub web, ASC, Bitbucket web, Canva, Zernio, Xero, Supabase dashboard, Resend dashboard, Co-Exist admin, etc)
- Has page accessibility tree access (cleaner than screenshot OCR)
- Tate-paired account session
- Anthropic safety: refuses to type passwords / OTPs / sensitive-action codes (account-takeover-shape) - those bounce back to conductor (`input.type` from `kv_store`) OR to Tate physically

## 4. Shared protocol - V2 MCP substrate

- 17 REST endpoints at `https://api.admin.ecodia.au/api/mcp/cowork/<endpoint>`
- JSON-RPC 2.0 wrapper (shim shipped 30 Apr 2026 02:10 UTC) at root URL for claude.ai custom connector
- Bearer auth via `kv_store.creds.cowork_mcp_bearer` (16 scopes)
- Conductor writes via in-process route handlers, Cowork writes via REST through Corazon laptop-agent `shell.shell` wrapping `Invoke-WebRequest`
- Audit log distinguishes `source='conductor'` vs `source='cowork'` for every write
- Cross-substrate writes: status_board, kv_store (`cowork.*` prefix only for Cowork), Neo4j Episodes/Decisions, forks (cowork pool only for Cowork), os_session.message (Cowork -> conductor inbox)

## 5. Role split - who does what

| Task class | Owner | Why |
|---|---|---|
| Logged-in web UI driving (Vercel, Stripe, GitHub web, ASC, Bitbucket UI, Resend dashboard) | Cowork | Has Tate's signed-in browser session + accessibility tree |
| Headless API calls (Stripe API, GitHub REST, Vercel REST, Resend API, Anthropic API) | Conductor | API tokens already provisioned in env/kv_store, no UI overhead |
| DB operations (Postgres, Neo4j) | Conductor | Direct in-process MCP access |
| Fork dispatch | Conductor | Has fork tools |
| Factory CLI dispatch | Conductor | Credit-gated, conductor owns escalation |
| Doctrine writes (`patterns/`, `CLAUDE.md`, `clients/`) | Conductor | Single-source-of-truth on disk |
| Email send | Conductor | Has Gmail MCP |
| SMS to Tate | Conductor | Has SMS skill |
| Sensitive-action gates (admin.google.com password reset, billing pages, GitHub sudo) | TATE | Both agents refuse credentials per Anthropic safety |
| Windows Hello passkey (laptop unlock) | Conductor via `input.type` from `kv_store.creds.laptop_passkey` | NOT a SaaS sensitive-action - different gate class |
| OS-level desktop apps (Teams, Cursor, Xcode) | Conductor via Corazon `screenshot`+`input.*` | Cowork can't reach OS-level surfaces |
| iOS builds | Conductor via SY094 SSH | Mac-only |

## 6. API-shape gotchas for V2 callers

Codified by fork_moku5bge_23b7a5 30 Apr 12:00-12:10 AEST during full V2 endpoint coverage test. The full list (with WRONG/RIGHT examples and error-message-to-fix mapping) lives in the sibling pattern file `~/ecodiaos/patterns/cowork-v2-api-shape-conventions.md`. Six gotchas in summary:

1. All filters nested under `filter` - never top-level
2. `forks.list` default `parent='cowork'` - pass `filter.parent='*'` for all
3. `email_threads.read` `thread_id` = `gmail_thread_id` (NOT internal UUID)
4. `status_board.upsert` denies `entity_type=infrastructure/legal` - Cowork can write task/project/client/thread/opportunity/personal
5. `kv_store.set` requires `cowork.` prefix
6. `graph_semantic_search` is V1 alias of `neo4j.search` (parity proven)

## 7. Handoff protocols

### 7.1 Conductor -> Cowork

Use the cowork-dispatch helper script (`~/ecodiaos/scripts/cowork-dispatch step "..." --wait=N`).

Pre-checklist (6 steps):
- 0 - no-focus-collision with Tate window per `~/ecodiaos/patterns/cowork-no-focus-collision.md`
- 1 - Claude Desktop process alive
- 2 - account verified `code@`
- 3 - usage budget
- 4 - Dispatch toggle ON
- 5 - target app reachable

Conductor instructs in discrete bounded steps, screenshots after each, decides next. Cowork has no externally exposed `abort.check`, so the conductor MUST keep instructions bounded. Full dispatch protocol: `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md`.

### 7.2 Cowork -> Conductor

Cowork POSTs to V2 endpoint; writes land with `source='cowork'` in audit log. Conductor reads via `status_board.query` / `kv_store.get` / `inbox.read`. Cowork can also POST to `cowork.heartbeat` for liveness signal + suggested_action retrieval. Cowork -> conductor chat-message via `os_session.message` endpoint (DEFERRED in coverage test - loop risk).

### 7.3 Both -> Tate

Sensitive-action gates ALWAYS Tate. SMS via conductor's sms-tate skill (segment-economics enforced). Email via conductor Gmail MCP. Public posts via conductor Zernio.

## 8. Status of the duo as of 30 Apr 12:11 AEST

- **V2 substrate:** 15/17 endpoints LIGHT (working under live external load)
- **MCP JSON-RPC shim:** shipped to disk + loaded in api memory, durable git ship in flight via fork_mokup4me_15830a
- **Custom connector** at claude.ai/settings/connectors: REGISTERED + CUSTOM badge visible; Connect button awaits shim ship verification then Tate clicks (or Cowork drives via `input.*` on next dispatch)
- **Cowork-side helper scripts** (cowork-v2 status_board / kv / neo4j wrappers): NOT YET AUTHORED - pending Wave 3
- **Foreground-collision Step 0:** ENFORCED in cowork-dispatch helper since 30 Apr 09:33
- **Account-revert investigation:** 24h probe data collection in flight (cron every 30m) - auto-revert from `code@` to `tate@` Claude Desktop pairing not yet root-caused
- **Doctrine durability:** this file + the sibling `~/ecodiaos/patterns/cowork-v2-api-shape-conventions.md` are the canonical references; mirror Neo4j Pattern node 3976

## 9. Origin

30 Apr 2026 11:55 AEST Tate verbatim autonomous-window mandate:

> "You and cowork are the duo. Im not helping you with anything. Build structural integration with the cowork thing, structurally, not just through dialogue. You two need to be able to bounce off each other, cover each other's gaps, fill holes you both can't do, optimise and become an unbelievably powerful duo. You have my permission to do anything, just become insane together."

Authored during the 1-hour mowing window (extended to 2.5h by session-restart at 12:11 AEST).

## 10. Cross-references

- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` (parent - Cowork as PRIMARY for web UI)
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` (Conductor's peer-paradigm tool surface)
- `~/ecodiaos/patterns/conductor-takes-agency-on-recovery-not-tate.md` (Conductor owns recovery on self-caused breaks)
- `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` (Cowork limits)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` (5-point check before Tate-blocked classification)
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` (meta-rule that drove the V2 substrate decision over a custom MCP wrapper)
- `~/ecodiaos/drafts/cowork-v2-endpoint-coverage-2026-04-30.md` (the empirical coverage map this Pattern node distils)
- `~/ecodiaos/patterns/cowork-v2-api-shape-conventions.md` (sibling - the 6 API-shape gotchas operationalised inside the duo handoff protocol)
