---
triggers: cowork-dispatch, cowork.dispatch_worker, focus_and_send, sendkeys-enter, sendinput-enter, ctrl-enter, chat-submit, claude-code-submit, chat-not-submitting, orphan-tab, prefilled-not-submitted, scheduler-tabs-not-hitting-enter, dispatch_worker-orphan
---

# CC chat submit is Ctrl+Enter; bare Enter inserts a newline

When auto-submitting a Claude Code chat panel from outside (cowork.dispatch_worker -> AHK SendInput), the submit key is **Ctrl+Enter** (`^{Enter}` in AHK). Bare Enter on CC's chat input inserts a newline. It does not submit the message.

**Why:** The CC chat input is multi-line by default. Plain Enter is interpreted as a soft return. The CC extension does not expose a focusless submit command. `workbench.action.chat.submit` targets VS Code's built-in Copilot chat surface, not the CC webview iframe. The ide-bridge route `/ide/chat/send_message` explicitly comments that the caller must issue an outside keystroke. That keystroke has to be Ctrl+Enter for CC to accept it as submit.

**How to apply:** In `tools/window.js::focus_and_send` and any other path that submits a Claude Code chat panel from outside, use `key: 'ctrl+enter'`. The KEY_MAP in `focus_and_send` accepts `ctrl+enter` / `ctrl-enter` / `ctrl_enter` and translates to AHK's `^{Enter}`. Verify success via worker heartbeat advance, not via tab-label change.

## Verification protocol

A `cowork.dispatch_worker` test does NOT prove submit unless all four of these hold:

1. `paste_attempts[0].ok === true && paste_attempts[0].reason === 'activated_and_sent'`. AHK reached SendInput.
2. `foreground_at_paste.exe === 'Code'` (or Cursor / Code - Insiders for those variants). The foreground was the right IDE process at the moment of keystroke.
3. The worker registry row at `D:/.code/EcodiaOS/coordination/workers/<tab_id>.json` shows `last_heartbeat_at` ADVANCED past `registered_at`. The model called `coord.heartbeat` after receiving the brief.
4. The dispatched chat tab's label transitions to a CC-auto-summarised title AFTER the model responds (not just on the prefilled input changing).

A tab label that matches the brief's first line does not prove submission on its own. CC sometimes uses input box content as the label even before submit happens. Heartbeat advance is the canonical signal.

## Layers that looked broken but were not load-bearing

These were real issues that needed code changes, but none were the root cause of "scheduler tabs aren't hitting Enter":

1. **Agent in Session 0 under the eos-pm2 NSSM service.** SendKeys from Session 0 are invisible to the user's Session 1 desktop. Substrate change: relaunch agent as a direct `node` process from the user's logged-in session.
2. **Two-call submit dance with a 300ms sleep between focus_window and input.key.** Focus could drift in the Node-side window. Substrate change: collapse into a single atomic AHK script in `window.focus_and_send`.
3. **AHK's plain WinActivate denied by Windows ForegroundLock.** Substrate change: WinActivate -> AttachThreadInput -> Alt-as-last-resort ladder in the same AHK script.
4. **spawnSync for AHK without CREATE_NO_WINDOW.** PowerShell consoles flashed briefly and stole focus mid-dispatch. Substrate change: add `creationFlags: 0x08000000` to all AHK spawn sites in `tools/` and to the ps-daemon spawn in `lib/ps-daemon.js`.

Each of those was a genuine improvement and reduced the symptom rate. The dispatched chat still did not submit on dispatch G's predecessors. The actual load-bearing layer is the wrong submit key. After switching to Ctrl+Enter, dispatch F's worker model called `coord.heartbeat` at registered_at + 2:15s, ran `signal_done`, then `close_my_tab`. Dispatch G then confirmed clean ok=true with ack_via=heartbeat at +2:53s under the 180s default timeout.

## Anti-patterns

- Using `key: 'enter'` in `cowork.dispatch_worker` or any focus_and_send call meant to submit a CC chat.
- Inferring "submit happened" from tab-label change alone. Tab labels can reflect input box content pre-submission. Always verify via worker heartbeat advance.
- Bumping `worker_acknowledgment_timeout_ms` below 180s. CC workers take 60-150s to boot through skills + auto-memory + MCP servers before the first tool call. Anything under 180s default produces false-orphan reports for dispatches that submitted correctly.
- Running the laptop-agent as a Windows service (NSSM / PM2 / Scheduled Task at boot). Services run in Session 0 by default and cannot inject keystrokes into the user's Session 1 desktop. The agent must launch from the user's interactive session.

## Substrate map

- `tools/window.js::focus_and_send`: atomic AHK script with foreground-transfer ladder. Accepts `key: 'ctrl+enter'`.
- `tools/cowork.js::dispatch_worker`: submit path uses `key: 'ctrl+enter'` in initial attempts and recovery re-Enter. Default `DEFAULT_WORKER_ACK_TIMEOUT_MS` is 180000 (180s).
- `~/.vscode/extensions/ecodia.preview-0.1.0/ide-bridge.js`: bridge route `/ide/chat/send_message` documents that submit must come from caller-side keystroke. The bridge's `workbench.action.chat.submit` call is a Copilot-targeted no-op for CC.
- `D:/.code/EcodiaOS/coordination/workers/<tab_id>.json`: `last_heartbeat_at` advance is the canonical submission-success signal.

## Origin

2026-05-31. Multi-hour debugging session with Tate at the keyboard watching dispatches in real time. Hypothesis flow: Session 0, then focus race, then ForegroundLock, then console flash, then tab refocus, then wrong submit key. The first four were real but not load-bearing. The fifth (Ctrl+Enter) was the actual cause. Worker F at 06:56:19 UTC registered, heartbeat at 06:58:34 UTC, terminated 06:58:55 UTC cleanly. Worker G dispatched at 06:58:39 UTC with 180s default timeout as final confirmation, still pending at time of authorship.

Cross-refs: [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]], [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]], [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]], [[windows-spawn-must-use-spawnSync-with-create-no-window-not-execSync-with-windowsHide]].
