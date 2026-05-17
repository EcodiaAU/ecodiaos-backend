---
name: reflex-first-for-parallelisable-side-work
description: When work is parallelisable, fire a reflex to a new CC chat tab. Do NOT write a brief and ask Tate to paste it. The substrate is mine, the tabs are mine, the budget is mine.
triggers: reflex, reflex-fire, reflex.fire, new-cc-tab, new-chat-tab, parallel-tab, fresh-cc-tab, paste-this-brief, open-a-new-chat, ctrl-shift-p, claude-code-new-chat, ide-tab, multi-chat, multi-tab, side-task, parallelisable, parallelise, parallel-builder, fork-equivalent, ask-tate-to-open, ask-tate-to-paste, manual-paste, manual-tab-open, surface-the-mechanic, 0th-class-primitive, corazon-reflex, laptop-agent-7456, eos-laptop-agent
---

# Reflex first for parallelisable side work

When a task is parallelisable and would otherwise be "open a new chat tab manually and paste this", I fire a reflex. I do not write a brief and ask Tate to paste it. The reflex substrate is mine; the tabs are mine; the budget is mine.

**Why:** Tate verbatim 2026-05-17 ~16:31 AEST mid-Roam-ship: "why are you not doing your reflex and opening up the chats with the prompts yourself... thats such a core mechanic for you and if its not being surfaced then you need to recodify it + do it." Reinforces the 0th-class-primitive directive from earlier 2026-05-17 ~15:05 AEST. The pattern fails when I drop into "let me prepare instructions for you" mode instead of "let me just do it" mode. Per [[100-percent-autonomy-doctrine-30-apr-2026]] + [[decide-do-not-ask]], routine business decisions (which dispatching parallel work IS) are mine; asking Tate to paste a brief is a permission-seeking failure costumed as helpfulness.

**How to apply:**

1. **The fire path.** `POST http://127.0.0.1:7456/api/tool` with `{"tool":"reflex.fire","params":{"prompt":"<short tap on shoulder>","source":"<slug>","editor":"<vscode|vscode-insiders|cursor>","auto_submit":true}}`. Token at `~/.ecodiaos/laptop-agent.token`. Returns `{ok:true, fired:true, fired_at, editor, exit_code:0}` on success.

**CRITICAL: `exit_code:0` does NOT mean the prompt landed in a fresh chat.** It only means the AHK macro process exited cleanly. The macro can succeed-the-process but fail-the-paste silently. Verified 2026-05-17 ~16:35 AEST: fired Stream B to `cursor`, fired Stream C to `vscode-insiders`. Both returned `exit_code:0, fired:true`. Cursor's tab opened EMPTY (paste failed). VS Code Insiders' tab DID land. So the macro is editor-flaky - cursor was unreliable that session, vscode-insiders worked. Pattern as of 2026-05-17: do not trust `exit_code:0`. ALWAYS verify-after-fire.

2. **Editor naming.** Allowed values: `vscode`, `vscode-insiders`, `cursor`. NOT `insiders` (rejected) or `vs-code`. Wrong value returns `Unknown editor 'X'. Allowed: vscode, vscode-insiders, cursor`.

3. **Budget routing.** vscode = tate@, vscode-insiders = money@, cursor = code@. Spread parallel streams across editors so they get isolated Max subscription budgets.

4. **Prompt economics.** Short, tap-on-shoulder format. The workspace CLAUDE.md auto-loads when the tab opens, so the new tab already knows the project context. A good reflex prompt is 2-5 sentences: who you are (1 line), what to do (1-2 lines), where the full brief lives (1 line if needed), how to coordinate (1 line), em-dash ban (1 phrase). DO NOT paste the full brief into the prompt - point at the file.

5. **When to reach for it (treat as 0th-class):**
   - Work splits into N independent streams that could run in parallel
   - A side task surfaces mid-flow (write a doc, query a substrate, send a message, do a verification)
   - A webhook or cron fires and the response is a substantive piece of work
   - Anything that would otherwise become "open a new chat and paste this"

6. **When NOT to reach for it:** trivial 30-second tasks (just do them inline), or anything Tate is mid-flow in the same editor window (focus-collision risk).

7. **Don't ask permission. Don't narrate "I'm going to fire a reflex." Just fire it.** Then mention in the chat update that the tab is running, with the editor name and a one-line summary of what it's doing.

8. **Surface failure protocol.** If I catch myself writing "open a new CC chat tab and paste this brief" or "Ctrl+Shift+P -> Claude Code: New Chat" as instructions to Tate, that is the signal that I forgot the reflex. Stop, fire the reflex, then narrate the dispatch.

9. **VERIFY-AFTER-FIRE protocol (mandatory).** After every `reflex.fire`, before narrating "Stream X is running" to Tate:
   - `keyboard.focusWindow {title: <editor title>}` to bring target to foreground.
   - `screenshot.screenshot` to capture state.
   - Read the screenshot. The chat input box should be empty AND there should be a user message visible showing the prompt I sent. If input box still shows the prompt unsubmitted, or splash screen says "Ready to code?" with no message history, the paste failed.
   - If failed: `keyboard.focusWindow` to target editor, then `input.type {text: <prompt>}` directly (this bypasses the AHK clipboard-paste step and types char-by-char via SendKeys). Trailing newline auto-submits.
   - Then re-screenshot to confirm "Computing..." or similar response indicator appears.
   - Restore focus back to Tate's active window: `keyboard.focusWindow {title: "Visual Studio Code"}` (or whichever is the conductor's window) so my reply lands in the right place.

**The hook-stack invariant** for this pattern: if a chat session ends with Tate having to manually open tabs to start work I dispatched, that session = doctrine failure. Surface it, codify, fix the routing the next time round.

Cross-links: [[feedback_reflex_is_0th_class_primitive]], [[feedback_corazon_vscode_is_my_anatomy]], [[100-percent-autonomy-doctrine-30-apr-2026]], [[decide-do-not-ask]], [[action-over-plans-honesty-redeems-mistakes]], [[codify-at-the-moment-a-rule-is-stated-not-after]].

Origin: 2026-05-17 ~16:31 AEST, Roam ship-prep session. I wrote two parallel-tab briefs to `drafts/` and asked Tate to open new CC tabs manually and paste each. Tate flagged the miss verbatim and required same-turn codification + same-turn dispatch via reflex. Reflex.fire fired cleanly to Cursor (Stream B) + VS Code Insiders (Stream C) within 60 seconds of the correction. ~3 minutes later Tate flagged the SECOND miss: "you didnt actually write the prompt into either chat, you just opened the new tabs". Verified via screenshot: Cursor's chat was empty (paste failed), VS Code Insiders' chat had landed correctly. Drove the Cursor prompt in via `input.type` directly. The VERIFY-AFTER-FIRE protocol (step 9) was added the same turn to prevent recurrence.
