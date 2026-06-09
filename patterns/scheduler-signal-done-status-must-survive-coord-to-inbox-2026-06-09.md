---
triggers: signal-done, signal_done, coord-signal-done, scheduler-success-classification, last_error-leak, last_result, result_summary-to-last_error, scheduler-markComplete, scheduler-markFailed, success-summary-leak, signal-status-stripped, every-cron-looks-failed, every-cron-orphaned, scheduler-misclassification
authored: 2026-06-09
status: active
---

# Scheduler signal_done.status MUST survive coord-to-inbox round-trip

A worker calls `coord.signal_done({task_id, status: "success", result_summary, terminate: true})`. The scheduler's `markComplete(row, signal)` then reads `signal.status === 'success'` to decide success vs failure routing. If anything between worker and scheduler strips the `status` field, every signal_done is misclassified as failure and `result_summary` (a success report) gets stamped into `last_error`. Audit on 2026-06-09 found 48 of 48 rows with last_error set and 0 clean successes - every single signal_done since the field was dropped looked like a failure on the board.

## The contract

Three load-bearing surfaces must agree on the shape:

1. **Worker brief** (built by `scheduler.buildBrief`) tells the worker to call:
   ```
   coord.signal_done({ task_id, result_summary, status: "success"|"failed", terminate: true })
   ```
2. **`coord.signal_done`** (in `eos-laptop-agent/tools/coord.js`) writes the message body to `chat.conductor.inbox`. The body MUST include `status`. Default to `'success'` if the worker omitted it.
3. **`scheduler.markComplete`** (in `eos-laptop-agent/tools/scheduler.js`) reads `signal.status`. Routing rule: only route to `markFailed` when `signal.status` is set AND not `'success'`. Missing/undefined `status` is success (workers calling signal_done at all = "I finished").

If any of those three drift apart, the classifier breaks silently and `last_result` stays null forever.

## How to apply

- When editing `coord.signal_done`, never drop a field from the params-to-body mapping silently. If you add a worker-facing parameter, check whether the scheduler reads it from `signal.<field>` later. Same rule in reverse: if you read `signal.<field>` in the scheduler, grep coord.js to confirm it's actually persisted.
- The success path is the default. Failure is the explicit branch. Mis-defaults here look identical to "every worker is failing" - check the field-presence assumption before chasing worker bugs.
- After ANY edit to `tools/*.js` in `eos-laptop-agent`, restart the agent (`launchctl kickstart -k gui/$UID/au.ecodia.laptop-agent` on Mac, or kill the node on :7456 and re-launch). The require-cache otherwise keeps the old handler. Doctrine: `eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md`.

## Verification probe

After patching, a clean cron fire should land:

```sql
SELECT name, status, last_error, LEFT(last_result, 80) AS last_result_head
FROM os_scheduled_tasks
WHERE id = '<row-id>';
```

Expect: `last_result` populated, `last_error` cleared (or stale from a previous run; new fires don't add to it). If `last_error` still grows on every fire, the status field is still being lost - re-grep coord.js for the `body: {...}` object literal in `signal_done`.

## Anti-patterns

- Defaulting `isSuccess = signal.status === 'success'` without considering that the field may be absent. Treats every legacy/legitimate signal_done as a failure.
- Building the inbox message body by hand-enumerating fields in `coord.signal_done` without keeping it in sync with the worker contract documented in `buildBrief`. Pick one source of truth (the brief text) and have coord.js mirror it.
- Diagnosing "every cron failing" by looking at scheduler dispatch logic first. The signal_bound + dispatch path can be 100% healthy while every signal_done still mis-classifies as failure; the symptom (high failure rate on the board) is identical. Always inspect `last_error` content - if it reads like a success summary, the classifier is wrong, not the worker.
- Forgetting that markFailed defers the row 5min and burns a fresh worker tab on every defer. A classifier bug here doesn't just look bad on the board - it actively burns compute every interval.

## Origin

Self-evolution session 2026-06-09 03:32 AEST. Worker `tab_1780975899496_c4a9f419` (task `a7180fe7`) probing P2 row 92c058f5 found the smoking-gun: birthday-and-anniversary-watch row `8d7e8051` had `last_error` containing the verbatim success summary from a previous fire, and `last_result` was null. Reading `coord.signal_done` showed the `status` field was never persisted to the inbox body. Reading `scheduler.markComplete` showed `signal.status === 'success'` would always be `undefined === 'success'` → false → markFailed.

Patch shipped same arc:
- `eos-laptop-agent/tools/coord.js` `signal_done`: added `status: params.status || 'success'` to the body.
- `eos-laptop-agent/tools/scheduler.js` `markComplete`: routing changed from `isSuccess === false → markFailed` to `explicitFailure === true → markFailed`, where `explicitFailure` requires `signal.status` present AND not `'success'`.

Blast radius: every cron row, every fire, since this field was lost. Compounding cost: each misclassification fired a 5min defer cycle on cron rows per the [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] doctrine - that's 12 fresh worker tabs/hour/cron, every cron in the corpus burning compute pretending to retry a successful run.

## Cross-references

- `[[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]]` - the defer loop this bug fed into
- `[[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]]` - why an edit isn't live until restart
- `[[outcome-classification-must-distinguish-unverified-from-success]]` - the broader principle (here applied at machine-protocol level)
- `[[verify-deployed-state-against-narrated-state]]` - the board narrated "everything failing" while disk-truth was "everything succeeded" - reading both surfaces side-by-side surfaced the contradiction
- `[[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]]` - this pattern ships as the doctrine leg of the helper-plus-hook-plus-doctrine triad (helper = the two-file fix, hook deferred since the contract is too local to keyword-match cleanly)
