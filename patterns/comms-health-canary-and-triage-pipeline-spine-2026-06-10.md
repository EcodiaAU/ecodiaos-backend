---
triggers: comms-health, comms-canary, email-triage-canary, untriaged-backlog, stuck-reply, gmail-inbox-poll-dead, triage-attempts-stuck, department-canary-comms, comms-department-spine, email-threads-pipeline-jam
category: doctrine
facet: comms
binding: script=~/.ecodiaos/bin/comms-health.sh + SessionStart=knowledge-sessionstart + cron=gmail-inbox-poll
---

# Comms-health canary + triage-pipeline spine (department-spine instance 5)

The comms department now runs the REPORT-canary spine. The first armed run found the pipeline healthy - which is itself a finding, because the four checks each name a different failure shape the comms substrate can rot through silently.

## The canary (daily 09:55, launchd au.ecodia.comms-health)

`~/.ecodiaos/bin/comms-health.sh` - heartbeat-first, Postgres direct, system binaries only. Four checks, one per failure shape:

1. `untriaged_backlog` - `email_threads` with `triage_status != 'complete'` arrived >6h ago. The triage pipeline is jammed: the cron is paused, the triager is dead, or the LLM cap is exhausted. >0 means a thread is sitting unread on substrate the conductor consults.
2. `stuck_reply` - threads with `triage_action IN ('reply','send_reply')`, no `draft_gmail_id`, received >48h ago. We decided to reply, we didn't draft, the thread is getting cold. >0 means an inbound is rotting.
3. `poll_hours_since_fire` - hours since any `gmail-inbox-poll` row last fired. The job is hourly; >3h means the poller is dead, the laptop-agent is down, or every `gmail-inbox-poll` row is paused (which, on 2026-06-10, is the live state during the cap defer).
4. `triage_stuck` - threads with `triage_attempts >= 3` still incomplete. The triager is failing on this shape; read the last `triage_summary` and fix the prompt, do not just retry.

## What the first armed run caught

All four metrics zero on 2026-06-10. The triage pipeline cleared (the dispatch fact-gate work landed the same day), `gmail-inbox-poll` had fired 1h prior, no stuck replies, no triage retry loops. The dispatch is the first one of the five spine instances whose first run came back clean - that is informative, not anticlimactic; it means the existing comms hygiene is real, not narrated.

## How to apply

Read the heartbeat at `~/.local/state/ecodiaos/comms-health-heartbeat.json`. The `gmail-inbox-poll` cron carries the standing OBJECTIVE to glance at it (and to alarm on itself if `poll_hours_since_fire>3` - it is the cron, so its absence IS the alarm).

## Gaps (no queryable substrate today; not faked)

- Outbound send failures (no `outbound_sends` / `gmail_outbound` table on this substrate). If/when an outbound send log lands, fold a `send_failures` check here.
- SMS delivery failures (no `sms_messages` failure table). Same fold path when the schema lands.

## Why

Triage-pipeline jam is the silent comms rot: every metric individually looks fine until you compare it against the rate the pipeline should be working at. Heartbeat-first surfacing means session start always reflects the latest pipeline reality without manual probing. Sibling instances: [[scheduler-health-canary-and-cron-dupe-guard-2026-06-10]], [[finance-health-canary-and-phantom-post-triage-2026-06-10]], [[clients-health-canary-and-going-quiet-write-gap-2026-06-10]], [[knowledge-health-canary-automation-2026-06-09]].
