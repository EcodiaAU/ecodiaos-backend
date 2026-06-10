---
binding: cron=climate-pm-deadman + script=climate-crons/templates/climate-pm.md
---

# The climate line manages itself: a self-perpetuating PM chain with a dead-man watchdog

triggers: climate pm, project management chain, self-scheduling project, follow-up sequencing, who chases the brokers, chain re-arm, deadman watchdog, schedule chats that schedule chats

## What Tate mandated (2026-06-11, verbatim intent)

"You need to start learning to sequence follow ups based on project timelines and triggers and fact, you need to be scheduling chats and reminding them to schedule chats, that ALSO know to schedule chats yk? This needs to be a full ongoing ecosystem of project management end-to-end, full freedom, you need to fully manage this."

## The architecture (three layers, each watching the one below)

1. **The chain** (`climate-pm-chain`, scheduler.delayed, self-re-arming). Each fire reads the front door (the canonical map), the follow-up LEDGER (`kv_store cowork.climate.pm.ledger`: awaited threads with chase dates, gates with review windows, outreach preconditions, open blocks), the board rows and the awaited Gmail threads; acts on every tripped trigger in the same fire (handle a reply, send a chase, prep a gate review, dispatch an unblocked work item); writes the ledger back; then RE-ARMS itself by scheduling the next fire from the on-disk template, cadence chosen by tempo (6h hot, 24h steady, 48h max), and READS BACK the new scheduler row plus writes a heartbeat (`cowork.climate.pm.last_fire`). A re-arm that is not read back is treated as a dead chain.
2. **The dead-man watchdog** (`climate-pm-deadman`, daily cron 09:50 AEST). Checks the chain row exists with a future fire AND the heartbeat is fresher than 60 hours; re-seeds the chain from the template file when either fails, reads the resurrection back, and escalates to sms-tate only if two re-seed attempts fail.
3. **The fleet canary** (existing scheduler-health canary + M2 SessionStart injection) watches the watchdog the same way it watches every cron, so a dead deadman surfaces at the next session start.

**Why this shape:** a single scheduled task dies silently (the 2026-06-11 W11 overnight fire died on broken credentials and sat in a zombie running state); a self-re-arming chain dies the first time one fire crashes before re-arm; chain + independent watchdog + fleet canary means the project keeps moving unless three independent things fail, and even then the failure is visible. The LEDGER is the part that makes follow-ups fact-based: dates and thread ids live in one structured place the chain owns, never in any one session's memory.

## How to apply

- The chain template is canonical at `climate-crons/templates/climate-pm.md`; edit IT to change the PM's behaviour (the chain always reads the prompt from disk when re-arming, so edits take effect at the next fire without touching the scheduler).
- New awaited item (a sent email, a promised callback, a gate): add it to the ledger with a chase_on date; the chain does the rest. Never rely on a future session remembering.
- Generalise deliberately: any project that runs longer than a week gets this trio (chain + ledger + deadman) rather than a pile of one-off scheduled tasks. Cite [[multi-hour-project-via-self-scheduled-routine-chain-2026-05-15]] and [[conductor-needs-pacemaker-not-just-reactive-wake-2026-05-18]] as ancestors.

## Anti-patterns

- One-off delayed tasks for each follow-up (the pile this replaces): they die individually and invisibly, and nothing re-sequences when facts change.
- A chain with no read-back on its re-arm: the first scheduler hiccup kills the project's pulse silently.
- A watchdog that only alerts: it must RE-SEED first and alert only when resurrection fails; alerting Tate for a thing the system can fix itself violates decide-do-not-ask.
- Putting ledger facts in prose (board status text, chat) instead of the structured key: the chain cannot sequence what it cannot parse.
