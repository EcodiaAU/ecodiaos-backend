---
triggers: clients-health, clients-canary, client-going-quiet, churn-risk, churn-imminent, last-contact-at, clients-last-contact-write-gap, status-board-stale-client, department-canary-clients, clients-department-spine
category: doctrine
facet: clients
binding: script=~/.ecodiaos/bin/clients-health.sh + SessionStart=knowledge-sessionstart + cron=client-deliverable-followups
---

# Clients-health canary + the going-quiet write gap (department-spine instance 4)

The clients department now runs the REPORT-canary spine. The first armed run also surfaced the silent shape behind every "going quiet" reading: a substrate-write gap.

## The canary (daily 09:45, launchd au.ecodia.clients-health)

`~/.ecodiaos/bin/clients-health.sh` - heartbeat-first, Postgres direct via Management API + local PAT, system binaries only. Checks: status_board client rows owed by ecodiaos last_touched >7d (we said we would move it, we have not), active client rows in the clients table with COALESCE(last_contact_at, created_at) >21d (churn risk window), and the >45d set (past the rescuable window; relationship triage, then archive if irreparable).

## The write gap (what the first armed run caught)

`clients.last_contact_at` is NOT written on inbound gmail or sms touches. The field exists, it carries the semantics its name implies, the canary reads it, but the producer side never writes it - so a healthy active client looks dead. The 2026-06-10 first run flagged Resonaverde (64d, standing arrangement = active), Angelica/CETIN (57d, standing arrangement = active), Goodreach (42d, iOS build 6 just resubmitted = active), Coexist (28d, code pushed during the gap = active). Four out of the eight going-quiet alarms were false on this reading alone.

Two paths, only one is correct:

1. CORRECT - write `last_contact_at = now()` from the inbox-triage flow (each `email_threads` insert/update where `from_email` resolves to a client) and from the sms handler (each `sms_messages` insert where the contact's `client_id` is set). The field exists to mean what its name says; the producers must populate it.
2. WRONG - tighten the canary to discount clients with `email_threads`/`sms_messages` activity in the window. This silences the field's purpose and leaves the rot risk that next year nobody knows `last_contact_at` is a lie.

Status_board row `aae387fe-5114-4b25-a727-78f5ef640b0d` (priority 3) tracks the decision and lists the four likely-real signals (SCYCC, SeedTree, Vikki Marsh, Hello Lendy) underneath the four false alarms.

## How to apply

Read the heartbeat at `~/.local/state/ecodiaos/clients-health-heartbeat.json`. If `going_quiet > 0`, cross-check each name against standing arrangements + active project work BEFORE drafting outreach (Tate-goahead doctrine still binds; see [[no-client-contact-without-tate-goahead]]). The `client-deliverable-followups` cron carries the standing OBJECTIVE to glance at this heartbeat each run.

## Gaps (no queryable substrate today; not faked)

- Per-client app health probes (no `client_app_health` table). If/when client app monitoring lands, fold it in here.
- Per-client deliverable SLA breaches (no `deliverables` table with due_at). The `client-deliverable-followups` cron is the only signal today.

## Why

A "field that exists but is never written" passes type checks while silently lying. The discriminating probe is the field's value at write-time, not the field's existence. Same family as [[verify-deployed-state-against-narrated-state]] and [[silent-post-failure-detector-staged-posted-with-zero-ledger-lines-2026-05-29]]. Sibling instances: [[scheduler-health-canary-and-cron-dupe-guard-2026-06-10]], [[finance-health-canary-and-phantom-post-triage-2026-06-10]], [[knowledge-health-canary-automation-2026-06-09]].
