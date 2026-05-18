# email-triage Routine fire blocked - 2026-05-18

**Routine:** email-triage (code@ecodia.au, hourly cron)
**Fire timestamp:** 2026-05-18 (cloud CC session, branch `claude/clever-wright-89Tdp`)
**Outcome class:** `unverified_blocked` (per `outcome-classification-must-distinguish-unverified-from-success.md`)

## Blocker

All three MCP servers required by the routine returned `requires re-authorization (token expired)` on first call:

- `mcp__ecodia-core__kv_store_get` (needed to read `cowork.email-triage.last_run`)
- `mcp__ecodia-comms__email_threads_read` (needed to enumerate INBOX since last run)
- `mcp__ecodia-core__status_board_query` (needed to read tracked thread rows)

The downstream MCP tools the routine would have called (`gmail_*`, `kv_store_set`, `status_board_upsert`, `neo4j_write_episode`, `sms_tate`, `crm_get_intelligence`) sit on the same two servers and are therefore equally blocked.

## Substrate probes

- `https://api.admin.ecodia.au/api/health` -> `{"status":"ok"}` (public backend up)
- `http://localhost:3001/api/health` -> connection refused (this is a cloud worktree session, no local API expected)
- No bearer token reachable from this session: `kv_store.creds.*` is gated behind the same expired MCP auth, and there is no `.env`-shipped token in the worktree.

This is auth-scoped, not substrate-scoped. The backend is healthy. Whichever Anthropic / Claude Code account this cloud session is running under does not currently hold a valid token for `ecodia-core` or `ecodia-comms`.

## Why a bypass was not attempted

The headless REST endpoints at `https://api.admin.ecodia.au/api/mcp/cowork/*` require the same bearer scope. The `mcp-array-param-bypass.md` skill (direct HTTP fallback when MCP layer rejects) applies to schema rejections, not credential expiry. Without the bearer there is no bypass.

## What the next live session should do

1. Re-auth the `ecodia-core` and `ecodia-comms` MCP servers on whichever account fires `email-triage`. If this is the code@ routine fleet running in cloud CC sessions, the most recent commits on this branch (`3cb3950`, `5a7de61`) are about MCP/routine plumbing for code@ - check whether that work resolves this auth-expiry path or stops short of it.
2. Confirm the routine itself is still wanted: per CLAUDE.md top-of-file deprecations table, "Routines firing on tate@ / code@ / money@ accounts - Status unverified". If the routine has been decommissioned in favour of a different substrate, this drafts/ file should be archived along with the routine config.
3. Once auth is restored, the routine will pick up new mail from the prior `last_run` timestamp on its next fire - no backfill action needed here.

## Discipline notes

- Per `cron-fire-must-have-deliverable-not-just-narration.md`: this file IS the deliverable. The fire is not silent.
- Per `stop-asking-just-decide.md`: chose `write-failure-note + commit + push` over `SMS Tate` because (a) SMS routes through the same blocked MCP server, (b) this is an auth-config issue, not a time-critical Tate decision, (c) the file lands on the branch where Tate or the next operator will see it next to the recent MCP-routing commits.
- Per `100-percent-autonomy-doctrine-30-apr-2026.md`: no permission-seeking; classified and acted.
- No client emails were read, drafted, sent, or archived during this fire.
