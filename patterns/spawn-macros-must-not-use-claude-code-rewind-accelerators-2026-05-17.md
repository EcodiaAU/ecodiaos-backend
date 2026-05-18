---
name: spawn-macros-must-not-use-claude-code-rewind-accelerators-2026-05-17
description: AHK / input-tool macros that open a new Claude Code chat tab must not press Esc-Esc as a focus-clearing prelude. Double-Esc is Claude Code's "rewind to message" accelerator and opens a modal in whichever CC chat tab is focused at the moment WinActivate lands.
triggers: spawn-macro, reflex-fire, reflex.js, claude-code-tab-spawn, ahk-spawn-tab, esc-esc, double-esc, rewind-modal, rewind-to-message, claude-code-rewind, vs-code-palette-prep, focus-clear-prelude, command-palette-macro, f1-palette, ctrl-shift-p-palette, new-chat-tab-macro, ide-tab-spawn, tab-spawn-side-effect, ide-tab-is-the-new-fork-mechanic, telegram-spawn-macro, sms-spawn-macro, cron-spawn-macro, reflex-substrate
status: active
---

# Spawn macros must not press Esc-Esc before opening the VS Code palette

## Rule

Any macro that opens a new Claude Code chat tab via the VS Code command palette MUST NOT send `Esc` twice in succession as a focus-clearing prelude. Single `Esc` is fine. Double-`Esc` triggers Claude Code's "rewind to message" feature in whatever CC chat tab is the foreground document at the moment `WinActivate` lands - which is almost always SOME existing CC tab, because that is what Tate has open when an inbound text fires the macro.

## Why

The reflex macro in `D:/.code/eos-laptop-agent/tools/reflex.js` (the firing primitive for cron / Telegram / Twilio / webhook-driven tab spawns) was authored with this prelude as a defensive focus-clearing step:

```
Send "{Esc}"
Sleep 150
Send "{Esc}"
Sleep 250
```

Intent: clear any open menu / popup / notification / input-control focus before pressing `F1` to open the command palette, so the palette keystroke is not absorbed by the active input. (Earlier failure mode: `Ctrl+Shift+P` got eaten by the chat input.)

Side-effect not caught at author time: in Claude Code chat tabs, `Esc-Esc` is the "rewind to message" accelerator. So every macro fire that lands on an existing CC chat tab opens a modal in that previous tab BEFORE the new tab spawns. Tate observed this on every Telegram-driven tab spawn on 2026-05-17.

The modal is harmless but visible, mid-spawn, in the previous chat - which is exactly the kind of UI pollution that compounds across the day as more tabs accumulate.

## How to apply

When authoring or reviewing any macro that:
- opens a new CC chat tab via VS Code / Cursor / Insiders command palette, OR
- runs `WinActivate` against an editor window before sending keystrokes, OR
- needs to clear input focus before pressing `F1` / `Ctrl+Shift+P`

Use **single `Esc`** with a settle pause. Never double-`Esc`. If a more robust focus-clear is needed, prefer one of:
- `F1` directly (function keys are rarely absorbed by input controls)
- click a neutral coordinate (e.g. tab bar) before keystroke
- `Ctrl+1` to focus the first editor group

## Verification

Probe after authoring: spawn a tab with the macro while a CC chat tab is the active document. If a "rewind to message" modal appears in the previous chat, the macro is wrong.

## Origin

Tate verbatim 2026-05-17 05:23Z via Telegram: "when a new tab is opened from an inbound text from me to you, it opens up some modal related to rewinding the chat to a certain message, thats not part of the flow so it shouldnt be happening and needsto be fixed in the macro flow."

Fix landed same turn: [reflex.js:190-197](D:/.code/eos-laptop-agent/tools/reflex.js#L190-L197). PM2 worker for eos-laptop-agent killed and respawned to clear require cache; verified fresh uptime via `GET http://100.114.219.69:7456/api/health`.

Sibling status_board row: `01f0b33e-bb05-42bc-8a49-94e5fb8e9bcc` (CC tab auto-close on Corazon - this rewind-modal sub-bug is one part; the broader tab-close primitive is still pending).

Related doctrine: [[ide-tab-is-the-new-fork-mechanic-2026-05-17]] (tabs are forks; their lifecycle including spawn-side-effects matters), [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]] (the restart-after-tools-edit rule that gated the fix landing).
