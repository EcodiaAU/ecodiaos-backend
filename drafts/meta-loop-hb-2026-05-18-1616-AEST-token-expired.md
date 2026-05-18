# meta-loop heartbeat 2026-05-18 16:16 AEST - cowork bearer token expired

## What happened

Hourly meta-loop Routine fired on tate@ecodia.au at 2026-05-18T06:16:39Z (16:16 AEST). On first substrate call (`cowork_session_started`) the ecodia-core MCP server returned:

```
MCP server "ecodia-core" requires re-authorization (token expired)
```

Confirmed not a single-tool error - `cowork_heartbeat` and `kv_store_get` both returned the same error. The entire ecodia-core MCP scope is unreachable from this Routine session.

## What this Routine could NOT do

All four orientation primitives are blocked:
- `status_board.query` - cannot read active workload
- `neo4j.search` - cannot read recent Decisions/Episodes
- `inbox.read` - cannot see queued conductor messages
- `kv_store.get` - cannot read any cowork state

All four substrate-write primitives are blocked:
- `status_board.upsert` - cannot update row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` with the standard "meta-loop hb / clean" single-liner
- `neo4j.write_episode` / `neo4j.write_decision` - cannot record this run
- `kv_store.set` - cannot update `cowork.last_heartbeat`
- `os_session_message` - cannot queue to local conductor
- `gmail.send` / `sms.tate` - cannot escalate via comms

Per `cron-fire-must-have-deliverable-not-just-narration.md`, a fired cron without a substrate write is a `cron_silent_fire` failure. The only substrate I can still reach is the cloned repo on disk - hence this breadcrumb file, which per `auto-preview-md-html-on-write-2026-05-16.md` will pop a preview tab in any running Cursor / VS Code / VS Code Insiders on Corazon when the next git pull lands.

## Diagnosis

Token-expired is an auth-layer failure on the cowork bearer used by Anthropic-hosted Routines to call our MCP gateway at `https://api.admin.ecodia.au/api/mcp/cowork/*`. Likely causes:

1. Bearer rotation that did not propagate to the Routine's MCP connector config on claude.ai (most likely - the connector config holds a static token).
2. Backend issuing token revocation on the bearer Routines use.
3. Clock skew on the gateway side rejecting an otherwise-valid token.

Cross-ref: `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` - if a cred was rotated, consumer #7 (the claude.ai Routine connector config) must be updated. This is exactly the consumer-surface-list miss the doctrine warns about.

Until the Routine connector is re-authorised on claude.ai, EVERY hourly meta-loop fire will silent-fail the same way. This is the meta-loop equivalent of a P1 - the conductor heartbeat is dark.

## What the conductor (local Claude Code session) needs to do

1. On claude.ai, navigate to Settings -> Connectors -> ecodia-core MCP -> reauthorise / paste fresh bearer.
2. Verify fresh bearer matches `kv_store.creds.cowork_routine_bearer` (or whichever kv_store row holds it - check `~/ecodiaos/docs/secrets/INDEX.md`).
3. Once reauthorised, manually fire the meta-loop Routine once to confirm substrate writes succeed.
4. Add a status_board P2 row tracking the missed meta-loop fires between rotation and recovery.
5. Author or update `~/ecodiaos/docs/secrets/cowork-routine-bearer.md` adding "claude.ai Routine connector config" to consumer-surface list if not already listed.

## Honesty over narration

Per `outcome-classification-must-distinguish-unverified-from-success.md` and `verify-deployed-state-against-narrated-state.md` - this Routine run is classified `unverified_failed_substrate_writes_blocked`, NOT "success with no action". Silence is not a positive signal. The cron fired, the work could not happen, and this file is the only durable record.

No Episode node written (per Routine spec: do not write Episode if genuinely no substrate action). No Decision node written (no actual call made). No status_board update (the substrate is the thing that is dark).

Next meta-loop in 1h will hit the same wall unless the connector is reauthorised before 17:16 AEST.

---

Routine session: meta-loop fire at 2026-05-18T06:16:39Z
Author: cowork-self (Anthropic-hosted Routine on tate@ecodia.au)
Substrate reached: disk only (this file)
Substrate blocked: ecodia-core MCP entire surface
