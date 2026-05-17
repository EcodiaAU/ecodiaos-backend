# Email Triage Failure Report

**Timestamp:** 2026-05-17T12:10:03Z (22:10 AEST)
**Session:** email-triage cron on code@ecodia.au
**Branch:** claude/gifted-planck-o31db

## What Happened

The hourly email-triage cron fired but could not execute. All three ecodia MCP servers returned "requires re-authorization (token expired)":

- `ecodia-comms` -- expired (Gmail, calendar, contacts inaccessible)
- `ecodia-core` -- expired (kv_store, status_board, neo4j inaccessible)
- `ecodia-scheduler` -- expired (scheduler inaccessible)

The local EcodiaOS API (`http://localhost:3001`) is also unreachable -- this is a managed remote execution environment with a fresh repo clone, no local services running.

## Impact

- Inbox not triaged since last successful run
- `cowork.email-triage.last_run` kv_store key not updated
- No Neo4j Episode written for this run
- No status_board rows created/updated

## Required Action

**Tate:** Re-authorize the three ecodia MCP servers at code.claude.com. Once re-authorized, the next hourly email-triage cron will pick up all mail since the last successful `cowork.email-triage.last_run` timestamp (it reads `since:` that value).

## Next Triage

The next cron fire will read `cowork.email-triage.last_run` and process all mail since that timestamp -- no backlog will be lost as long as Gmail retains the messages in INBOX.
