---
triggers: AllAccountsCappedError, all-accounts-capped, usage-cap-constants, cap_weekly, headroom-score-zero, dispatcher-self-block, self-inflicted-outage, capacity-model-drift, fictional-cap, usage-poller-caps, weekly-cap-vs-5h-cap, deferred-1min-every-cron, thundering-herd-after-cap
category: doctrine
facet: scheduler
binding: script=~/.ecodiaos/bin/scheduler-health.sh + SessionStart=knowledge-sessionstart
---

# Usage-cap constants must track observed reality, or the model becomes the outage

A capacity model with a constant below the real ceiling produces a self-inflicted outage that wears the costume of vendor throttling. When every account reads capped but a live session on one of them works fine, the MODEL is broken, not the capacity.

## What happened (2026-06-10)

`eos-laptop-agent/tools/usage.js` shipped `DEFAULT_CAP_WEEKLY = 1_000_000_000`. All three accounts crossed 1B weekly tokens, `headroom_score = min(5h_fraction, weekly_fraction)` pinned 0 for every account, and the dispatcher deferred EVERY cron on `AllAccountsCappedError` at 1-minute retries, permanently for the rest of the weekly window. Meanwhile money@ had a completely fresh 5h window and was serving Tate's live interactive chat at 2.49B weekly tokens without complaint. The org budget is 20B/week; the constant was fiction at one twentieth of it.

The tell that broke the case: Tate asked "we have an account that isn't capped, I'm talking to you on it right now?" A single working session on a "capped" account falsifies the whole capped-state claim.

## The rule

- Any constant that gates dispatch (caps, timeouts, thresholds) needs an evidence anchor: the observed value at which the real system actually degrades, not a number that felt safe at authoring time. Cite the anchor in a comment beside the constant.
- A min() across windows means ONE wrong window constant poisons the whole score. Check each input fraction separately when a score reads 0.
- When every member of a pool reads exhausted simultaneously and indefinitely, suspect the model before the vendor. Real caps reset on windows; a fictional cap below current usage never unblocks.
- Fix order: correct the constant, restart every process holding the module in cache (the standalone poller AND the laptop-agent both compute scores; `coord.poll_now` rides the laptop-agent), then probe the consumer side (deferred rows must lease + dispatch, not defer another cycle).

## How to apply

`coord.get_usage_state` shows the live model. If `headroom_score` is 0, read the two fractions: 5h exhausted is normal and rolls off; weekly exhausted against `cap_weekly` deserves the falsification test (does a session on that account work?). Cap constants live in `eos-laptop-agent/tools/usage.js` (`DEFAULT_CAP_5H` / `DEFAULT_CAP_WEEKLY`, env overrides `CAPS_5H_TOKENS` / `CAPS_WEEKLY_TOKENS`). The scheduler-health canary's `capped_churn` metric counts tasks deferring on this error and alarms above 8.

## Anti-patterns

- Treating `AllAccountsCappedError` as ground truth because it comes from the substrate. The substrate was reporting its own wrong constant.
- Restarting only one of the two processes that cache the module, then trusting a poll that rode the stale one.
- Watching the backlog "self-heal at cap reset" when the cap is fictional: it never resets, and the deferral runs silently for days.
