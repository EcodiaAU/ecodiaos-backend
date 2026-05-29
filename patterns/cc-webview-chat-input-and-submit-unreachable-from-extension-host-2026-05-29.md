---
triggers: cc-webview, claude-vscode, chat-input-focus, chat-submit, programmatic-submit, focusless-paste, bridge-route, ide-bridge, editor-open, workbench-chat-submit, dispatch-worker-focus, cc-webview-iframe, extension-host-webview-boundary, vscode-chat-surfaces, claude-vscode-focus-misnamed, focusless-spawn, focus-window
---

# Claude Code's chat input is unreachable from the VS Code extension host - no programmatic focus, no programmatic submit

There are TWO things you cannot do to a CC chat panel from the VS Code extension host, no matter what API you reach for:

1. **Focus the chat input textbox programmatically.** No `claude-vscode.*` command focuses the input. The closest-named candidate `claude-vscode.focus` fires an **@-mention event from the active TEXT EDITOR's selection**, NOT an input-focus event. Same with `claude-vscode.editor.open(session, prompt)` and `claude-vscode.primaryEditor.open(session, prompt)` - they open + populate the input with the `prompt` arg, but focus lands on the editor area or sidebar tree, NOT inside the webview's input textarea.

2. **Submit a populated chat input.** `workbench.action.chat.submit` and its `submitWithoutDispatching` / `submitWithCodebase` siblings target VS Code's built-in chat surface (Copilot chat), NOT CC's webview. Calling these against a CC chat is a silent no-op. CC's URI handler `vscode://anthropic.claude-code/open?prompt=...&session=...` also has no `submit` param.

The CC chat panel is a webview (`viewType: mainThreadWebview-claudeVSCodePanel`). Its input textarea lives inside the webview's iframe. VS Code's extension API sandboxes webviews from other extensions - the extension host cannot inject DOM events, dispatch keyboard events, or call methods inside another extension's webview without that extension exposing an explicit `webview.postMessage` channel. CC does not.

## The implication

Any "focusless paste" attempt from outside CC's own webview ends at the same wall:
- `claude-vscode.editor.open(null, brief)` opens the chat + drops the brief into the input box (good, no clipboard race)
- Then... nothing. The brief sits in the input textarea. No submit happens.
- A subsequent OS-level `input.key('enter')` only submits IF the input textarea has keyboard focus at that moment - and the input does NOT have focus after editor.open (the editor area or sidebar tree does).

The 2026-05-29 bridge experiment (`/ide/chat/send_message` route + `ide.chat_send_message` agent wrapper) shipped the open + populate half cleanly. The submit half never worked. Workers spawned + brief populated + Enter landed on whatever else had focus + worker never received the brief + 180s ack timeout fired = orphan.

## The path that DOES work

`claude-vscode.newConversation` + `claude-vscode.focus` + clipboard.write + `Ctrl+V` + Enter. The `newConversation` command (Ctrl+Alt+Shift+C-equivalent) opens a fresh chat AND naturally focuses the chat input - the only known path that puts keyboard focus inside the input textarea. The Ctrl+V then lands in the right place, Enter submits.

Cost: a ~2.5s focus-dependent window from `newConversation` through `Ctrl+V` execution. Any focus change in that window (the user clicks another window, a parallel chat steals focus via gui.focus_chrome, a notification grabs the foreground) causes the paste to land in the wrong window - including the wrong-prompt-to-friend incident class.

## When you'll be tempted to chase focuslessness again

Whenever the 2.5s focus window bites someone. The shape of the problem:
- You'll find `workbench.action.chat.submit` in the command palette and assume it submits the active chat. It doesn't (Copilot, not CC).
- You'll find `claude-vscode.focus` and assume it focuses the chat input. It doesn't (@-mention event).
- You'll think "bridge route runs everything synchronously, no race" - correct for the bridge call itself, but the SUBMIT step still needs an OS keystroke against a focused input.

The only real fix paths:
- **CC exposes a programmatic submit command.** Hopeful, unowned.
- **We ship our own VS Code extension that owns a chat-like webview surface AND its input lifecycle.** Big build, displaces CC's UX.
- **OS-level injection that targets the specific webview window.** Possible via Windows UI Automation framework if we can identify the textarea's automation element; experimental.

Until one of those lands, the 2.5s focus window is the cost of doing business.

## Verification

The bridge route `ide.chat_send_message` stays in the agent's tool surface (committed in eos-laptop-agent 92add39, ide-bridge.js commit backend 471fd338). It's useful for any caller that wants to OPEN a chat + POPULATE the input without firing a submit - e.g. drafting a message for the user to review then send manually. Just do not assume it submits.

## Anti-patterns

- Calling `claude-vscode.focus` thinking it focuses the chat input. It fires an @-mention event from the active text editor. The name is misleading.
- Calling `workbench.action.chat.submit` thinking it submits CC chats. It targets Copilot's chat surface. Silent no-op against CC.
- Building a bridge route that "opens + submits in one call" without testing whether the submit primitive actually targets CC's webview. The open works, the submit silently doesn't.
- Adding a small `sleep` between bridge-return and Enter keystroke and assuming the input is now focused. It isn't.

## Origin

2026-05-29 evening. Bridge route experiment shipped + tested via two e2e dispatches that both orphaned despite the chat opening with the prompt populated. Reverted dispatch_worker to the legacy newConversation + clipboard + Ctrl+V + Enter path same arc. The bridge route + wrapper stay shipped for future-use when CC unifies chat surfaces.

Cross-refs:
- [[scheduling-is-0th-class-primitive-2026-05-28]] - the substrate this paste step is part of
- [[vs-code-webview-tabs-have-no-stable-id-pin-label-or-leak-2026-05-28]] - sibling webview-boundary doctrine
- [[cleanup-orphan-workers-validates-leak-then-sweep-substrate-2026-05-29]] - the close path that catches orphans the paste produces
- [[corazon-is-a-peer-not-a-browser-via-http]] - drive-Chrome-via-input doctrine; the chat-input case is the not-Chrome variant of the same problem
