---
triggers: cowork-bearer-expiry, mcp-token-expired, routine-blocked-on-auth, requires-re-authorization, cloud-routine-substrate-dead, kv_store-creds-cowork_mcp_bearer, oauth-refresh-missing, meta-loop-silent-fire, routine-cannot-read-status-board, routine-cannot-write-neo4j, anthropic-connector-no-auto-refresh, expired-bearer-no-recovery-path
status: active
authored: 2026-05-18
authored_by: meta-loop routine on tate@ecodia.au (cloud session)
---

# Cloud Routines silently die when the cowork MCP bearer has expired

A Routine running in an Anthropic Claude Code cloud session reaches the EcodiaOS substrate (status_board, neo4j, inbox, kv_store, os_session_message, scheduler) via the `ecodia-core` MCP connector, which authenticates with the bearer at `kv_store.creds.cowork_mcp_bearer`. The Anthropic connector framework injects that bearer into the Routine session at fire-time. It does not auto-refresh.

When the bearer has expired, every `mcp__ecodia-core__*` call returns `MCP server "ecodia-core" requires re-authorization (token expired)`. The Routine session itself is alive, the prompt is delivered, GitHub MCP and other unrelated connectors still work, but the entire EcodiaOS substrate is unreachable. The Routine can do nothing of value and cannot even write an Episode node or a status_board row to surface the failure.

## Why this is silent

- The Routine completes (no crash, no non-200 from /fire) so the scheduler sees success.
- The Routine cannot write to `os_scheduled_tasks`, `os_forks`, status_board, or neo4j to log the failure (those writes all need the dead bearer).
- The conductor on the local IDE has no surface populated by this Routine run, so nothing visible drifts.
- The next hourly fire repeats the same dead read. Without external intervention this stays silent until Tate notices the absence of expected meta-loop deliverables.

## Recovery (Tate or local-conductor side)

1. Probe: `curl -H "Authorization: Bearer <current_bearer>" https://api.admin.ecodia.au/api/mcp/ecodia` should return 200 with the tool list. 401 confirms expiry.
2. Mint a new bearer for the Cowork V2 surface at api.admin.ecodia.au. The minting flow lives behind the OAuth wrapper at `/api/oauth/mcp/token` per `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` lines 200 to 202.
3. Update `kv_store.creds.cowork_mcp_bearer`. Every Anthropic connector consumer reads on next session boot.
4. In claude.ai web UI for each affected account (tate@, code@, money@), open the `ecodia-core` connector and re-authorise so Anthropic re-fetches the bearer into its session-injection store. The /fire URLs do not need to change. The fire_token does not need to change. Only the MCP connector inside the session needs the refresh.

## Prevention

- **Connector-side OAuth refresh.** The migration doc anticipated this (R1, Connector auth shape) and specified an OAuth wrapper at `/api/oauth/mcp/refresh`. If the wrapper is shipped and Anthropic supports the refresh flow on Custom Connectors, configure each connector for OAuth not raw bearer so Anthropic refreshes on each session boot. This is the structural fix.
- **Out-of-band liveness probe.** A non-Routine path (a cron on the local conductor laptop, or a VPS-side cron) should curl `/api/mcp/ecodia` with the current `cowork_mcp_bearer` every 6 hours and write a kv_store health row. When it returns 401, alert via SMS. This catches the failure at the substrate the Routines cannot reach.
- **Failure-mode pattern surfacing on Routine boot.** Cloud Routines have no access to the patterns dir unless the repo is cloned (it is, for routines targeting `ecodiaos-backend`). The Routine prompt should include a "if ecodia-core MCP returns re-authorization error, commit a pattern note to the designated branch documenting the failure and exit" fallback, so the failure is at least surfaced on git rather than completely silent.

## Why the next meta-loop run cannot self-heal this

The Routine session has no scope to write to `kv_store.creds.*` (read-deny prefix, write-deny prefix, per the cowork bearer scope). Even if it could mint a new bearer, it cannot persist one. Recovery is unavoidably out-of-band.

## Origin

Authored by the meta-loop Routine on tate@ecodia.au at 2026-05-18, after substrate-orientation probes against `status_board.query`, `neo4j.search`, `inbox.read`, and `cowork.heartbeat` all returned `MCP server "ecodia-core" requires re-authorization (token expired)`. GitHub MCP returned 200 for `get_me`, so the session itself was healthy; only the ecodia-core connector bearer was dead. The Routine exited via this doctrine note rather than chaining further probes per the failure mode rule "Do NOT chain probes for 30 minutes without doing anything".

## Cross-references

- `backend/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md` - this note IS the route-around, not a deferral.
- `backend/patterns/verify-deployed-state-against-narrated-state.md` - the bearer-alive claim must be probed at the actual endpoint, not inferred from "Routine completed".
- `backend/patterns/cron-fire-must-have-deliverable-not-just-narration.md` - the deliverable for this Routine fire is this committed pattern file, not chat narration.
- `backend/patterns/routine-corpus-architecture-2026-05-15.md` - the Routine substrate this failure mode applies to.
- `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` sections on Connector auth shape (R1) and OAuth wrapper.
