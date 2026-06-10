---
triggers: code-health, code-canary, vercel-latest-error, vercel-broken-prod, sb-project-stale, backend-repo-unpushed, backend-repo-stashes, department-canary-code, code-department-spine, deploy-state-canary
category: doctrine
facet: code
binding: script=~/.ecodiaos/bin/code-health.sh + SessionStart=knowledge-sessionstart + cron=daily-cron-corpus-health-audit
---

# Code-health canary + deploy-state spine (department-spine instance 6)

The code department now runs the REPORT-canary spine. Six is the full template count; the spine spans knowledge, scheduler, finance, clients, comms, code.

## The canary (daily 10:05, launchd au.ecodia.code-health)

`~/.ecodiaos/bin/code-health.sh` - heartbeat-first, Postgres direct via Management API + local PAT, system binaries only. Checks:

1. `vercel_latest_err` - per project, the LATEST production deploy state is `ERROR`. Old ERRORs are fine (we have 31 historical); what matters is the most-recent state per `project_id`. >0 means a project's prod is broken right now. Implemented via `DISTINCT ON (project_id) ... ORDER BY project_id, created_at DESC`.
2. `sb_project_stale` - `status_board` `entity_type IN ('project','thread')` priority <=2 last_touched >7d. High-priority code work that stopped moving. Move it or downgrade priority - the priority IS the claim that you will move it.
3. `backend_unpushed` - commits on `~/.code/ecodiaos/backend` not reachable from any remote (`git rev-list HEAD --not --remotes`). Threshold 50; the system-wide [[mac-organisation-and-branch-thrash-2026-06-09]] precious-work tripwire is a lower threshold across all repos.
4. `backend_stashes` - stash count on the backend repo. Threshold 20; stashes are the easiest place for in-flight work to be forgotten.

## What the first armed run caught

All four metrics inside threshold on 2026-06-10: 0 latest-prod errors across all Vercel projects, 0 stale priority-2 project rows on status_board, 1 truly-unpushed backend commit (a worker-session intermediate), 8 backend stashes. The code department is the second clean first-run (after comms); the backend repo + Vercel substrate is currently healthy.

## How to apply

Read the heartbeat at `~/.local/state/ecodiaos/code-health-heartbeat.json`. If `vercel_latest_err>0`, the failing project's production is broken NOW: pull its `vercel_deployment_id`, read the deploy log, revert to the last `READY` or fix forward. The `daily-cron-corpus-health-audit` cron carries the standing OBJECTIVE to glance at this heartbeat each run.

## Why latest-per-project not count-over-window

A naive `COUNT(*) WHERE state='ERROR' AND created_at > now() - interval '24h'` would fire every time someone pushed a typo and fixed it in the next commit. The discriminating probe for "is prod broken" is the LATEST state per project, not the count of ever-errors. Same family as [[verify-deployed-state-against-narrated-state]].

## Gaps (no queryable substrate today; not faked)

- Per-client app health endpoints (no `deployments.health_check_status` rollup table beyond raw rows).
- CI test failure trends (no `ci_runs` table).

Sibling instances: [[scheduler-health-canary-and-cron-dupe-guard-2026-06-10]], [[finance-health-canary-and-phantom-post-triage-2026-06-10]], [[clients-health-canary-and-going-quiet-write-gap-2026-06-10]], [[comms-health-canary-and-triage-pipeline-spine-2026-06-10]], [[knowledge-health-canary-automation-2026-06-09]]. The template contract is now fully populated.
