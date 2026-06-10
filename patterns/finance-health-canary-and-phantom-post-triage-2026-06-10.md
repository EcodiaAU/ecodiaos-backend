---
triggers: finance-health, finance-canary, bookkeeping-canary, phantom-post, posted-zero-lines, dangling-ledger-tx, staged-posted-no-ledger-lines, staged-backlog-watch, ingestion-feed-dead, billing-overdue-watch, xero-sync-error-watch, unbalanced-ledger, double-entry-invariant, books-silently-rot, department-canary-finance
category: doctrine
facet: finance
binding: script=~/.ecodiaos/bin/finance-health.sh + SessionStart=knowledge-sessionstart + cron=monthly-financial-close
---

# Finance-health canary + phantom-post triage (department-spine instance 3)

The books must not silently rot. The finance department now runs the REPORT + ACT + discriminating-probe spine: a daily launchd canary over the bookkeeping substrate, alerts at session start via the M2 generic reader, deep ACT folded into monthly-financial-close.

## The canary (daily 09:35, launchd au.ecodia.finance-health)

`~/.ecodiaos/bin/finance-health.sh` - heartbeat-first, Postgres direct, system binaries only. Checks: staged pending backlog (>25 alarms; the 2026-06-08 review cleared 33), oldest pending age (>7d = stalled decision), ingestion liveness (>5d without a new staged row = the bank/Stripe feed died silently), posted-zero-lines (see below), unbalanced ledger transactions (debits != credits), billing schedules past next_due_date with no generation, and staged rows carrying a xero_sync_error.

## Phantom posts (what the first armed run caught)

Two staged rows sat status='posted' with `ledger_tx_id` pointing at ledger transactions that DID NOT EXIST (LinkedIn $56.24, Officeworks $104.00). Worse than zero lines: the books claimed the entries were posted while holding dangling references, so every P&L and BAS total silently missed them.

Triage shape: reset the staged row to pending and clear `ledger_tx_id`, then re-post through the REAL path (`bk_post_transaction`) so transaction + lines + GST split are created atomically, then probe that the new ledger tx exists with lines and debits = credits. Never hand-insert ledger rows; the posting code owns the double-entry and tax math, and a hand-built row passes the existence check while breaking the invariants the path enforces.

## Why

A "posted" status is a narrated success. The discriminating probe for a posting claim is the ledger transaction existing WITH balanced lines, queried after the write; status flags and dangling foreign keys both lie. Same family as [[verify-deployed-state-against-narrated-state]] and [[silent-post-failure-detector-staged-posted-with-zero-ledger-lines-2026-05-29]]; this canary makes that detector standing instead of one-off.

## How to apply

Read the heartbeat at `~/.local/state/ecodiaos/finance-health-heartbeat.json`. Each alert names its action; phantom posts follow the triage shape above. The third department on the template (knowledge, scheduler, finance): copy the script shape, write `{last_run, status, alerts}`, and M2 surfaces it with zero hook edits. Sibling instances: [[scheduler-health-canary-and-cron-dupe-guard-2026-06-10]], [[knowledge-health-canary-automation-2026-06-09]].
