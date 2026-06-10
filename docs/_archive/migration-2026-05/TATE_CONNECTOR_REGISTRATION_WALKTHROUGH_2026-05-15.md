# Tate Connector Registration Walkthrough

**Purpose:** add the 10 EcodiaOS domain-scoped MCP Connectors to your three Anthropic accounts at claude.ai.

**Prerequisite:** Phase 2 / 10 (Domain-Scoped MCP Connectors) lane has shipped, meaning all 10 per-connector endpoints + OAuth client_ids + bearers are live on the VPS. The lane authors `D:/.code/EcodiaOS/backend/docs/MCP_CONNECTOR_CREDENTIALS_2026-05-15.md` containing the full credential card with each connector's actual `client_secret` value. You paste those into the form below.

**Time estimate:** ~5 min per connector x 10 connectors = ~50 min per account. Two accounts get 10 connectors, one account gets 9 (no `ecodia-shell` on `code@`/`money@`). Total Tate time: ~2 hours.

---

## How to register a single connector (do this 29 times)

1. Sign in at `claude.ai` as the named account for this row.
2. Top-right avatar -> Settings -> Connectors -> Add connector.
3. Fill the four fields:
   - **Name:** the connector name (e.g. `ecodia-core`).
   - **URL:** the endpoint URL from the credentials card.
   - **Client ID:** from the credentials card.
   - **Client Secret:** from the credentials card.
4. Save.
5. claude.ai will redirect you through the OAuth dance (auto-approves since we control both ends). Land back on the connector page showing "Connected".
6. Click "Test connection" if available. Should report the connector's tool count (per the table below).

If the form rejects, or you see a redirect-URI error: screenshot what claude.ai shows + send to me. I will add the missing redirect URI to the OAuth wrapper allowlist on the VPS in real time.

---

## The registration matrix

| # | Connector | tate@ | code@ | money@ |
|---|---|---|---|---|
| 1 | `ecodia-core` | YES | YES | YES |
| 2 | `ecodia-comms` | YES | YES | YES |
| 3 | `ecodia-code` | YES | YES | YES |
| 4 | `ecodia-money` | YES | YES | YES |
| 5 | `ecodia-shell` | **YES** | **NO** | **NO** |
| 6 | `ecodia-supabase` | YES | YES | YES |
| 7 | `ecodia-scheduler` | YES | YES | YES |
| 8 | `ecodia-crm` | YES | YES | YES |
| 9 | `ecodia-graph` | YES | YES | YES |
| 10 | `ecodia-factory` | YES | YES | YES |

Total: 10 on tate@, 9 on code@, 9 on money@ = 28 connector registrations.

`ecodia-shell` is the high-risk one (shell_exec on VPS). Keep it on tate@ only. If a code-shipping Routine on code@ ever needs shell access, that is a sign to refactor the work, not to expand shell-bearer surface.

---

## Quick-reference per-connector summary

(Full credential card with actual `client_secret` values lives at `D:/.code/EcodiaOS/backend/docs/MCP_CONNECTOR_CREDENTIALS_2026-05-15.md`. Phase 2 / 10 lane generates that file.)

| Connector | Endpoint | Tools | What it does |
|---|---|---|---|
| `ecodia-core` | `/api/mcp/ecodia-core` | 22 | status_board + neo4j core + kv_store + heartbeat + patterns. EVERY session needs this. |
| `ecodia-comms` | `/api/mcp/ecodia-comms` | 38 | gmail + calendar + drive + contacts + SMS/Twilio. Outbound human contact. |
| `ecodia-code` | `/api/mcp/ecodia-code` | 14 | vercel + forks + codebase context + visual-test. Code-shipping sessions. |
| `ecodia-money` | `/api/mcp/ecodia-money` | 23 | bookkeeping + Xero. Finance sessions. |
| `ecodia-shell` | `/api/mcp/ecodia-shell` | 4 | shell_exec + pm2. High-risk. tate@ only. |
| `ecodia-supabase` | `/api/mcp/ecodia-supabase` | 8 | Supabase admin: db_query, db_execute, storage. |
| `ecodia-scheduler` | `/api/mcp/ecodia-scheduler` | 9 | scheduler.cron + delayed + checkpoint chains (Phase 09). |
| `ecodia-crm` | `/api/mcp/ecodia-crm` | 18 | clients + projects + tasks + pipeline + revenue. |
| `ecodia-graph` | `/api/mcp/ecodia-graph` | 10 | deeper Neo4j: nodes, relationships, schema, reflect. |
| `ecodia-factory` | `/api/mcp/ecodia-factory` | 10 | Factory CC sessions: start, status, send, approve, reject. |

---

## After all 29 registrations are done

1. In each account, run "Test connection" on every connector. All 28 should return their expected tool counts (see table above).
2. Open a new chat on tate@ and try invoking a tool from each connector at least once (`/status_board.query`, `/gmail.send <test>`, etc) to verify the OAuth-issued bearer actually authenticates against each route handler.
3. Reply on status_board row `40fc4711-b29f-4223-91f7-efcb0e02ab6c` with status `connectors-registered-3-accounts` and a one-line "all 28 tests pass" confirmation.
4. The Routine creation step (next walkthrough) can now begin. Routines reference connectors by name; each routine's YAML frontmatter says which ones to attach.

---

## Constraints + gotchas

- **DO NOT register `ecodia-shell` on code@ or money@.** Even briefly. Shell-exec on a non-tate account is a permissions failure.
- Some Connectors may take 30-60 seconds to complete the OAuth dance the first time per account (the auto-approve flow has a few hops).
- If you accidentally close the OAuth tab mid-flow, the connector save aborts. Re-add from scratch; the partial state is harmless.
- The `client_secret` values in the credentials card are sensitive. Do not paste them into Slack/email/screenshots. They live in `kv_store` on the VPS too (Phase 2/10 lane stored them); they can be re-fetched if lost but rotating is preferred over re-displaying.

---

## When you finish

You will have:
- 28 Connectors registered, 10 on tate@, 9 each on code@ and money@.
- Each connector tested with one tool invocation.
- Routine creation unblocked - every routine prompt's `connectors:` line now resolves to live connectors.

That state means EcodiaOS's autonomous lane has its proper substrate. Routines can fire with exactly the surface they need. Interactive Claude Code sessions can load the 2-3 connectors they need and skip the rest.
