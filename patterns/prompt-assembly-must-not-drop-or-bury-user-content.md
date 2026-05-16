---
triggers: promptAssembler, prompt-assembly, user_content, tate_typed, continuity-blocks, _buildBp4, v2-assembler, osSessionService-message-assembly, tate-message-dropped, standing-by-no-response, no-response-requested, conductor-silent-on-tate-message, tate-not-heard, message-ordering, context-block-ordering, user-message-buried, wrap-tate-typed, PROMPT_ASSEMBLY_V2, system-wake-markers, auto-wake-tagged-as-tate
---

# Prompt assembly must not drop or bury user content

Any code that builds or modifies the multi-part user message sent to the conductor SDK MUST:

1. **Include `user_content` on every active code path** -- never silently omit it from v2, canary, shadow, or any new assembler mode. A dropped `user_content` means the conductor receives no actual question and replies "Standing by" / "No response requested" while Tate waits.

2. **Place `user_content` FIRST** in the assembled message, before all continuity blocks (`<now>`, `<forks_rollup>`, `<working_set>`, `<observer_signals>`, `<recent_doctrine>`, `<relevant_memory>`, etc.). When `user_content` trails 5000+ chars of system context, the dominant signal at position 0 is system context and Tate's 7-100 char question at the tail is ignored. Confirmed empirically: turn at 22:09:28 AEST had `<tate_typed>` at position 4006/4495 and the conductor replied with fork narration instead of answering.

3. **Detect and NOT tag system-generated messages as Tate-typed.** Check the head of `user_content` for the well-known system-wake prefixes before wrapping in `<tate_typed>`:
   - `[SYSTEM:` -- orchestration signals
   - `[Pending queued messages` -- queue drain markers
   - `[AUTO_WAKE]` / `AUTO_WAKE` -- restart-recovery injections
   - `<observer source=` -- observer interventions routed via message path
   - `Handoff state` preamble prefixes

   Wrapping a `[AUTO_WAKE]` message in `<tate_typed>` tells the conductor "Tate just said this" when Tate said nothing, confusing the source-discipline rule and potentially triggering must-answer behaviour on a system signal.

## The four failure incidents (all within 14 days, May 2026)

1. `94ec1eb` -- batch fork wakes accumulated context that drowned Tate's typed message on the same turn.
2. `2067022` -- initial `<tate_typed>` wrap introduced; conductor now had a strict "must answer if `<tate_typed>` present" rule, which was necessary because without the wrap, the conductor kept treating Tate messages as continuity context.
3. `b29afbe` -- v2 promptAssembler (`_buildBp4`) was built without a `user_content` path at all. BP3 = doctrine surface, BP4 = continuity blocks. Tate's text passed IN to the assembler was never written to the output. `PROMPT_ASSEMBLY_V2=live` activated, every turn had no user message, conductor replied "Standing by" / "Acknowledged" for 2+ days.
4. `7b54f57` -- `<tate_typed>` was at the bottom (position 4006 of 4495 chars). Two compounding bugs: (a) ordering wrong, (b) `[AUTO_WAKE]` markers were reaching the non-system-wake branch and being wrapped as Tate-typed.

## Verification protocol when modifying promptAssembler or message assembly

Run these checks before committing any change to `promptAssembler.js`, `osSessionService.js`, or any service that calls `_sendMessageImpl` / `_buildBp4` / `_buildFinalPrompt`:

1. **user_content present on all paths**: grep for every `if (mode === ...)` / `path: 'v1'` / `path: 'v2'` branch. Each must route `user_content` to the assembled message.

2. **user_content position**: in the final `parts` array, `user_content` must appear before any `<now>`, `<forks_rollup>`, `<working_set>`, or other continuity block pushes.

3. **system-wake guard covers all known prefixes**: `isSystemWake` (or equivalent) must match the current full list in `promptAssembler.js`. Adding a new system-injected message type? Add it to the guard SAME PR.

4. **End-to-end smoke test**: trigger a real Tate-typed message through the modified assembler path and verify the conductor responds to the content of the message, not with "Standing by" or a fork narration.

## How to add a new continuity block safely

1. Add the content to `turn_context` shape in `osSessionService.js`.
2. Pass it through `_v2TurnContext` (or equivalent context-builder).
3. In `_buildBp4`, push it AFTER the `user_content` block (never before).
4. If the new block might appear as `user_content` in some code path, add its prefix to `isSystemWake`.
5. Update the integration test that checks BP4 output shape.

## Do not

- Add a new assembler mode (v3, shadow-v2, etc.) that copies only continuity-block plumbing and omits the `user_content` write. This is how `b29afbe` happened.
- Reorder the `parts.push(...)` calls in `_buildBp4` without checking that `user_content` still leads.
- Introduce a new user-message source (e.g., observer interventions routed through `/api/os-session/message`) without adding its prefix to the system-wake guard.
- Trust that "the v1 path works therefore v2 must also work" -- the v2 path had its own separate `parts` array that received zero `user_content` writes for over a week before discovery.

## Cross-refs

- `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md` -- the continuity blocks that must stay AFTER user content must also not render in chat UI. Two enforcement concerns, same blocks.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` -- the promptAssembler canary/live rollout introduced a narrated "v2 is working" state that diverged from the actual dropped-user-content disk state for 2 days.
- `~/ecodiaos/patterns/harness-tool-rejection-is-not-tate-rejection.md` -- related false-signal-attribution failure class: here the wrong source is attributed to Tate's typed messages. There, harness blocks are misattributed to Tate's volitional rejections. Both require correct signal-source discipline.

## Origin

Four incidents across May 2026 (commits 94ec1eb, 2067022, b29afbe, 7b54f57). The `b29afbe` incident was the most severe: `user_content` was dropped silently for 2+ days on every turn in the live assembler path. Root cause in each case was the same: a new code path or refactor that forked off from a working reference implementation but did not carry the `user_content` write through.

Codified 16 May 2026 by self-evolution routine.
