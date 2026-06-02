---
name: scheduler-no-ide-defer-and-cron-rows-never-permanently-fail
description: The scheduler must classify transient errors (no IDE bridge, all accounts capped, network blip) as defer-not-retry, and cron rows must never permanently transition to status=failed. Both invariants together let the cron survive any gap window in the dispatch chain and self-recover at the next interval.
triggers: scheduler-no-ide-defer, cron-rows-never-permanently-fail, scheduler-error-classification, dispatch-worker-no-ide-instances-registered, markFailed-cron-defer, transient-vs-permanent-classification, scheduler-resilience-invariant, populate-failed-editor-open
status: active
load_bearing: true
authored: 2026-06-02
related_commit: 2733bfa
status_board: 957bddcc-6fde-41f0-b230-dd123312cbcb
---

# Scheduler classifies transient errors as defer-not-retry, and cron rows never permanently fail

Rule stated generally: the laptop-agent scheduler (`tools/scheduler.js`) MUST classify any error that is structurally recoverable as transient (defer the row, leave retry_count alone, status stays active), and MUST NOT permit a cron row to terminate at status=failed regardless of retry history. Cron failure recovery is "defer to the next cron interval and reset retry_count," never "mark this row dead forever."

Examples of transient errors that MUST defer (not retry):

- `dispatch_worker editor.open failed: no IDE instances registered` (Tate closes VS Code, machine reboots, extension reloads).
- `AllAccountsCappedError` (all Max-20x accounts at usage cap; resets within hours).
- Network blips at the database layer (caught higher up by Postgres connection pool retries).

Examples of permanent errors that consume retry budget:

- Malformed brief (missing prompt, invalid task_id reference).
- Bad credentials on every available account.
- Cron expression that fails to parse.

The dispatchOne catch block branches on error class:

```javascript
if (err.name === 'AllAccountsCappedError') {
  // defer to soonest reset + 1min
} else if (err.message.includes('no IDE instances registered')) {
  // defer 5min
} else {
  // markFailed (consume retry budget)
}
```

The markFailed handler branches on row.type when retry budget is exhausted:

```javascript
if (newRetryCount >= MAX_RETRY_COUNT) {
  if (row.type === 'cron') {
    // defer to next cron interval, reset retry_count to 0
  } else {
    // one-shot work: status='failed' (genuinely done)
  }
}
```

**Why:** the scheduler is the sole substrate that keeps EcodiaOS running when Tate is not at the keyboard. Africa Oct-Dec 2026 is the forcing function: any cron row that lands at status=failed during the trip loses every future interval of that recurring work until manually re-armed. A morning briefing cron that hits one bad day silently goes dark for the whole trip. Recovery has to be automatic, not Tate-flagged.

The 31 May 23:00 to 1 Jun 05:09 UTC editor.open cascade orphaned 100% of scheduled fires because the IDE bridge was not registered after a reboot. Pre-patch, every fire incremented retry_count, hit MAX_RETRY_COUNT=3 within 90s, and marked the cron row 'failed' permanently. The same cascade would now defer 5min per fire and recover the instant the IDE bridge re-registers.

**How to apply:**

- Every new error class surfaced from dispatch_worker (or any downstream call) gets explicit classification: transient (defer) or permanent (retry). Do not let an error fall through to the generic markFailed branch by default.
- When extending dispatchOne with a new error handler, ALWAYS write the defer branch BEFORE the markFailed branch, and ALWAYS leave retry_count alone in the defer case.
- When adding a new row type to os_scheduled_tasks (currently cron / delayed / chained), revisit markFailed's MAX_RETRY_COUNT branch and decide whether the new type is "recurring like cron" (defer to next interval) or "one-shot like delayed" (permanently fail).
- Defer windows are intentional, not arbitrary. No-IDE = 5min (IDE comes up fast on reboot). AllAccountsCapped = soonest reset + 1min (defer until creds actually unblock). Network = let Postgres pool retry handle it (defer not needed).
- Tests for both invariants live in `tools/scheduler.test.js` (search for "no-IDE error" and "cron-maxed"). Any future change to dispatchOne or markFailed must add or update the corresponding test.

Cross-refs:

- [[24x7-autonomy-architecture-invariants-2026-05-27]] (this rule is invariant 11)
- [[scheduling-is-0th-class-primitive-2026-05-28]] (the reflex that produces the rows this patch protects)
- [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]] (sibling reliability tuning)
- [[verify-deployed-state-against-narrated-state]] (the audit method that surfaced the editor.open cascade)
- Spec: `D:/.code/EcodiaOS/backend/docs/scheduler-substrate-unification-spec-2026-06-02.md`
- Origin: status_board row 957bddcc audit synthesis 2026-06-02; commit `2733bfa` on eos-laptop-agent main.
