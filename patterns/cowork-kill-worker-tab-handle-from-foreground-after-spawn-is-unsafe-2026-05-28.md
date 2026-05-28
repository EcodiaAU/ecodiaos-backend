---
name: cowork-kill-worker-tab-handle-from-foreground-after-spawn-unsafe
description: Never call cowork.kill_worker on a tab_handle that was captured via foreground_after_spawn - it can match an unrelated tab and Ctrl+W the wrong window.
triggers: cowork-kill-worker, kill_worker, tab_handle, foreground_after_spawn, orphan-worker-cleanup, dispatch_worker-cleanup, woodford-chat-murder, wrong-tab-closed, ctrl-w-wrong-tab, worker-tab-cleanup, orphan-tab-recovery, tab-handle-disambiguation
load_bearing: true
status: active
created_at: 2026-05-28
---

# cowork.kill_worker on foreground_after_spawn tab_handle is unsafe

## The rule

When `cowork.dispatch_worker` returns an orphan with `tab_handle.captured_via = 'foreground_after_spawn'`, NEVER call `cowork.kill_worker({tab_handle})` to clean it up. The tab_handle's `hwnd` + `title` are whatever was foreground at the polling moment after the spawn keystroke, which can be a completely unrelated chat or file tab the user was actively working in. `kill_worker` focuses the window by title-contains-match and sends Ctrl+W, which closes THAT window.

Safe cleanup of an orphan whose tab_handle is `foreground_after_spawn`:

1. Remove the state marker only: `unlink D:/.code/EcodiaOS/coordination/state/<tab_id>.spawned` if it exists. The actual spawn either succeeded (real worker tab is somewhere) or failed (no real tab). Either way, do NOT send keystrokes blindly.
2. Let the orphan sweeper (`coord._sweepStaleWorkers`) age the worker out via heartbeat staleness.
3. If you must reclaim resources NOW, surface to Tate. Don't guess.

## Why

Worked-example incident 2026-05-28 ~19:25 AEST. Worker `tab_1779959559725_deab3fa6` was dispatched, ran into OOM (laptop at 88% RAM), never sent a heartbeat in 120s, returned orphan. The orphan response carried `tab_handle.title = "MISSION: Surface A - Now… - backend - Visual Studio Code"` (`captured_via: foreground_after_spawn`). I called `cowork.kill_worker({tab_id})` to clean up. The kill function focused the window by title-contains-match (first 30 chars of `MISSION: Surface A - Now`), found Tate's Woodford working chat (which had that exact prefix in its tab title), and Ctrl+W'd it. The user lost an active chat working on something unrelated.

Root cause: `cowork.kill_worker` (tools/cowork.js) uses `win.focus_window({titleContains: tab_handle.title.slice(0, 30)})` then sends Ctrl+W. The title was captured via foreground-window probe AFTER the spawn keystroke, which only weakly correlates with the actual spawned tab. When the spawn keystroke missed (or the new tab took longer than the 1.5s settle window), foreground stays on whatever was active before, and that title gets recorded as the tab_handle.

## How to apply

Before calling `cowork.kill_worker(args)`:

- Inspect the dispatcher return value or `coord.list_workers` row for the target worker.
- If `tab_handle == null` OR `tab_handle.captured_via != 'window-diff'`, the handle is unreliable - DO NOT pass it to kill_worker. The dispatcher only sets `captured_via: 'window-diff'` when it actually saw a new top-level window appear, which is the only signal that maps tab_id to a real hwnd.
- If the handle is unreliable, the safe cleanup is marker-removal-only:
  ```
  fs.unlinkSync(`D:/.code/EcodiaOS/coordination/state/${tab_id}.spawned`)
  ```
  Skip the win.focus_window + Ctrl+W keystroke entirely.

## Substrate fix on the agenda

`cowork.js::kill_worker` should refuse the keystroke path when `tab_handle.captured_via === 'foreground_after_spawn'` and fall through to marker-removal only. Until that ships, the discipline above is the only guard.

## Cross-refs

- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- [[dispatch-worker-runtime-semantics-2026-05-26]]
- [[verify-deployed-state-against-narrated-state]] - the broader meta-rule (trust ground truth, never narrated metadata)
- [[scheduling-is-0th-class-primitive-2026-05-28]]

## Origin

2026-05-28. Co-occurred with the first successful end-to-end validation of the scheduling 0th-class primitive. The orphan that triggered the bad cleanup was caused by OOM at 88% RAM, which is its own load-bearing failure mode (see worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28.md).
