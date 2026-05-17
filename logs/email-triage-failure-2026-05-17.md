# Email Triage Failure Log - 2026-05-17

**Severity:** P1 infrastructure blocker  
**Routine:** email-triage (code@ecodia.au), hourly cron  
**Execution environment:** Remote (claude.ai/code cloud session)

## What happened

All three ecodia MCP servers returned `token expired` on every tool call:

- `mcp__ecodia-comms` - token expired (Gmail, Calendar, Drive access)
- `mcp__ecodia-core` - token expired (kv_store, status_board, Neo4j access)
- `mcp__ecodia-scheduler` - token expired (scheduler access)

The `mcp__github__*` tools worked normally. No other substrates were accessible.

## Impact

- Zero email threads read from code@ecodia.au inbox
- `cowork.email-triage.last_run` kv_store key NOT updated
- No status_board rows created or updated for this run
- No Neo4j episode written for this run
- Any emails arriving in the past hour are untriaged

## Root cause

OAuth tokens for the remote ecodia MCP servers (ecodia-comms, ecodia-core, ecodia-scheduler) expired. These tokens are issued per-session or per-day and require re-authorization from the claude.ai/code connector settings or wherever the OAuth flow is managed.

The `api.admin.ecodia.au/api/mcp/cowork/*` HTTP bypass path is reachable but requires `kv_store.creds.cowork_mcp_bearer` which cannot be retrieved because kv_store is gated behind the expired ecodia-core connection.

## Required action

**Tate must re-authorize the ecodia MCP connections** via claude.ai/code or the Anthropic connector settings so the OAuth tokens are refreshed. This unblocks all hourly cron routines (email-triage, meta-loop, system-health, etc.).

## What would have been done

Had the tokens been valid, this run would have:
1. Read inbox since the last stored `cowork.email-triage.last_run` timestamp
2. Classified each thread into A (automated), B (internal), C (client-facing), D (new prospect), or E (noise)
3. Drafted client-facing replies to kv_store, created status_board rows, archived noise
4. Written an Episode to Neo4j summarising the run
5. Updated `cowork.email-triage.last_run` to the current timestamp
