---
triggers: mac-dispatcher, mac-cron-dispatch, scheduler-darwin-port, set-dispatcher-injection, ide-chat-send-message-submit, applescript-keystroke-key-code-36, applescript-key-vs-text, applescript-types-literal-word, cowork-windows-only, cron-dispatch-mac, mac-day-2026-06-08, focus-group-activate-1200ms-4x-return
status: active
---

# Mac scheduler dispatch ports via the `_setDispatcher` injection seam, not by branching cowork.js

**Rule.** When the substrate that scheduler.js calls (`dispatcher.dispatch_worker` / `kill_worker` / `cleanup_orphan_workers`) is platform-specific, do NOT branch the existing 1500-line cowork.js in place. Use the `scheduler._setDispatcher(...)` injection seam from `index.js` and ship a parallel `tools/mac-dispatcher.js` that re-exports `kill_worker` + `cleanup_orphan_workers` (cross-platform — they call `ide.tabs` / `ide.tabs_close` via the extension host) and implements only `dispatch_worker` for the Mac substrate. cowork.js stays untouched so the Corazon path remains intact for any rollback.

**Why.** Surgically branching cowork.js means touching hundreds of Windows-specific lines (`Code.exe` resolution, `D:\\` paths, `win.windows()` PowerShell probes, `window.focus_and_send` AHK scripts, Win32 `WinActivate` / `AttachThreadInput`, AppData/Roaming settings.json paths). The diff is huge and the chance of breaking the Windows path is real. The injection seam is built for exactly this: scheduler.js calls `_dispatcher.dispatch_worker(...)`, and `_setDispatcher(mod)` swaps the module at startup. One file, one platform-detect line in `index.js`, no risk to the working code.

**How to apply.**
1. Author `tools/mac-dispatcher.js` exporting `{ dispatch_worker, kill_worker, cleanup_orphan_workers, list_workers, swap_creds, swap_history }`. Re-export the last five from `cowork.js` (cross-platform via the extension host). Implement `dispatch_worker` against the Mac primitives:
   - **Spawn + populate**: `ide.chat_send_message({ prompt, submit: false })` — the bridge's `claude-vscode.editor.open` opens a CC chat tab and prefills the textarea in extension-host space. No OS keystroke, no focus race for this part.
   - **Submit**: AppleScript `activate_app({app: "Visual Studio Code"})` + `keystroke({key: 36})` repeated 4× spaced 800ms after a 1200ms settle. The 4× mirrors cowork.js's Windows fix (first Enter often no-ops because the textarea populate races with the submit handler's `textContent.trim()` check). See `cc-chat-dispatch-needs-click-and-multi-enter-2026-06-03`.
   - **Submit key gotcha**: `keystroke({key: "return"})` in AppleScript types the literal word "return" because the helper puts strings in quotes. Use `keystroke({key: 36})` — the numeric form triggers the `key code` branch which presses the actual Return key. Burned 20 minutes on this 2026-06-08.
2. In `index.js`, inject before `scheduler.start()`:
   ```js
   if (process.platform === 'darwin') {
     scheduler._setDispatcher(require('./tools/mac-dispatcher'))
   }
   scheduler.start()
   ```
3. Make COORD_ROOT env-driven across modules (`process.env.COORD_ROOT || (platform === 'win32' ? 'D:\\\\.code\\\\EcodiaOS\\\\coordination' : ~/.ecodiaos/coordination)`). The coord state files (workers/messages/state/briefs/inbox/conductors) need to land somewhere both platforms can write.
4. Register the conductor with `coord.register_conductor({ ide_bridge_port: <port> })` BEFORE any worker fires, so `coord.close_my_tab` can route the close request to the IDE bridge. Without this, workers can call `signal_done` cleanly but `close_my_tab` returns `no_conductor_ide_port` and tabs accumulate.

**Anti-patterns.**
- Branching cowork.js in place with `process.platform === 'win32'` / `=== 'darwin'` checks around every Windows-specific line. The diff is too big to land safely in one turn.
- Skipping the 4× Enter and trying single-Enter on Mac. The race is the same; reliability drops to ~50%.
- Forgetting to register the conductor. `close_my_tab` becomes a no-op for every worker fired.
- Trying to use `claudeCode.useCtrlEnterToSend` to flip submit semantics on Mac. The setting controls the CC extension's submit key but doesn't fix the populate-race. The 4×Enter pattern handles both.

**Origin.** Mac mini day-1, 2026-06-08. The 75-cron corpus was paused on Corazon because the 8GB Windows host couldn't host the fleet alongside the IDE + Chrome + worker tabs. Mac substrate brought everything except the dispatcher, which was Windows-AHK-coupled in cowork.js. First attempt branched cowork.js — abandoned after 30min of surface analysis showed the diff was too big. Pivoted to the injection seam, shipped mac-dispatcher.js in ~280 lines, smoke-confirmed end-to-end with `laptop-agent-pulse` (real cron) calling `signal_done` + `close_my_tab` cleanly.

**Cross-refs.**
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- [[cc-chat-dispatch-needs-click-and-multi-enter-2026-06-03]]
- [[cc-chat-submit-is-ctrl-enter-not-enter-2026-05-31]]
- [[cc-webview-chat-input-and-submit-unreachable-from-extension-host-2026-05-29]]
- [[dispatch-worker-focusless-populate-and-foreground-submit-2026-05-29]]
- [[scheduling-is-0th-class-primitive-2026-05-28]]
- [[migration-vps-to-local-corazon-2026-05-15]]
