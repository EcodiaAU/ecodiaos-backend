---
triggers: composebrief, dispatcher-wrapper, cron-agency-contradiction, restrictive-brief-wrapper, do-not-orchestrate, do-not-spawn-workers, agentic-cron-template-contradiction, worker-restrictive-instructions, brief-plumbing-vs-policy, dispatcher-stays-out-of-policy
status: active
---

# The dispatcher's brief wrapper carries plumbing only — never policy that contradicts the cron's AGENCY block

**Rule.** `composeBrief` in `mac-dispatcher.js` / `cowork.js` wraps the cron's prompt with worker identity (tab_id, task_id, tab_credential), the MCP coord calling convention, the verify_paste recovery instruction, and the mandatory closing actions (signal_done + close_my_tab). It MUST NOT add policy lines that contradict the cron's own AGENCY block. The cron's AGENCY block is authoritative on what the worker may do; the dispatcher's wrapper is authoritative on how the worker plumbs back to coord.

**Why.** Every cron in the 75-cron corpus is built by `scripts/cron_prompt_builder.py` from the 7-section agentic template (`patterns/cron-worker-prompt-template.md`). The AGENCY section explicitly says workers MAY schedule follow-ups via `mcp__ecodia-scheduler__schedule_delayed`, spawn immediate siblings via `delay: "in 0m"` (max 3), expand scope when warranted, write durable substrate, escalate to status_board P1 with sms-tate. The dispatcher's wrapper had restrictive lines from the pre-2026-06-03 era:
- "You are NOT the conductor. Do not orchestrate. Do not spawn workers."
- "You can only emit messages TO chat.conductor.inbox or chat.<tab_id>.scratch."

These directly contradict the cron's AGENCY. Workers read both, see the contradiction, and follow the more restrictive line by default. Result: the corpus ships agentic prompts but workers behave like narrow polling scripts. Same slave-vs-autonomy failure the corpus design was built to fix.

**How to apply.** `composeBrief` keeps only:
1. **Header**: `<dispatched ... />` identity attributes for the verify_paste audit.
2. **Identity block**: tab_id, task_id, tab_credential. The MCP coord calling convention (identity-in-args is mandatory because the connector is workspace-wide).
3. **First action**: `coord.verify_paste(...)` as recovery against clipboard-race truncation.
4. **Task block**: the cron prompt verbatim (or pointer to brief file if oversized).
5. **Closing actions**: `signal_done({status, result_summary, terminate:true})` and `close_my_tab` as mandatory exit steps.

That is it. No scope restrictions. No "do not spawn." No conductor / worker framing beyond identifying the role for coord routing. Agency and hard constraints are the cron's job, not the dispatcher's.

**Anti-patterns.**
- "You are not the conductor. Do not orchestrate." — wrong framing. The worker IS responsible for the fire; routing through schedule_delayed is part of that, not orchestration.
- "Do not spawn workers." — contradicts AGENCY's `delay: "in 0m"` permission.
- "You can only emit to chat.conductor.inbox or chat.<tab_id>.scratch." — too narrow; workers need broader coord write access in some scenarios (escalation, status_board, kv_store).
- "Heartbeat at start + end of every turn" — load-bearing-sounding but the coord MCP server auto-heartbeats on any tool call. Redundant instruction.

**Origin.** Mac mini day-1, 2026-06-08, ~10:00 AEST. After the mac-dispatcher first-light, Tate observed: "the prompts being sent are the shitty old restrictive ones which dont align with our new style for the 74 prompts we were going with." The cron prompt bodies WERE the new agentic template. The wrapper was the contradiction layer. Stripped to plumbing-only in the same arc.

**Cross-refs.**
- [[cron-worker-prompt-template]]
- [[mac-dispatcher-via-set-dispatcher-injection-seam-2026-06-08]]
- [[100-percent-autonomy-doctrine-30-apr-2026]]
- [[scheduling-is-0th-class-primitive-2026-05-28]]
- [[no-self-prompting-from-queued-kv-store-plans]]
