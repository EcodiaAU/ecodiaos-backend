---
triggers: cc-extension, claude-code-extension, bash-popup, focus-steal, popup-window, powershell-flash, child-process-shim, windowsHide, creationFlags, create-no-window, extension-patcher, bash-tool, extension-js, vs-code-extension, ide-extension, console-flash, focus-stealing, popup-bug
---

# Claude Code extension Bash tool needs a child_process shim to stop console popups on Windows

The CC VS Code extension's Bash tool spawns commands via `child_process.spawn` / `spawnSync` / `exec` / `execSync` / `execFile` / `execFileSync` from many sites inside `extension.js`. On Windows, every spawn that omits `creationFlags: 0x08000000` (CREATE_NO_WINDOW) flashes a console window that steals focus from whatever Tate is typing into.

`windowsHide: true` alone is INSUFFICIENT. It only sets `STARTF_USESHOWWINDOW | SW_HIDE`. The Win32 process loader STILL allocates a console for the child, attaches `STARTF_USESHOWWINDOW` to the startup info, and `SW_HIDE` hides it milliseconds later. The window IS visible during that window. CREATE_NO_WINDOW skips console allocation entirely.

The original patcher at `~/.claude/scripts/patch-claude-code-extension.py` (shipped 2026-05-25) only rewrote inline `windowsHide:VALUE` literals to add `creationFlags:134217728` alongside. That caught 4 of the 4 `windowsHide` sites in extension.js 2.1.154. **It missed every spawn site that omitted `windowsHide` entirely** - which is the dominant pattern in the Bash tool's exec chain (`xx` / `pV` / `Fq` / `E_` helpers all call the underlying spawn primitives with options objects that don't mention windowsHide).

## The fix

A node `child_process` shim loaded BEFORE `extension.js` destructures spawn/exec/etc.

**Substrate triad:**

1. **Shim file** at `~/.claude/scripts/cc-child-process-shim.js`. On win32, monkey-patches `cp.spawn`, `cp.spawnSync`, `cp.exec`, `cp.execSync`, `cp.execFile`, `cp.execFileSync` to clone-and-inject `windowsHide: true, creationFlags: CREATE_NO_WINDOW` into whatever options bag (or absence of one) the caller passes. Bitwise-ORs into any pre-existing `creationFlags` so caller-set flags are preserved. No-op on non-win32 platforms.

2. **Patcher** at `~/.claude/scripts/patch-claude-code-extension.py`. Now prepends `require('C:/Users/tjdTa/.claude/scripts/cc-child-process-shim.js');` at byte 0 of extension.js so the shim mutates `child_process` exports before the bundle's first `require('child_process')` destructure. Idempotent via `cc-child-process-shim` marker check.

3. **SessionStart hook** that runs the patcher on every CC session start so newly auto-updated extension versions get re-patched within seconds of first use.

## Why both shim AND inline rewrite

Defence-in-depth. The shim catches everything via the module-export hijack, but it depends on load-order semantics: shim must run before the extension destructures `child_process`. Module-cache replacement is a stable Node behaviour but bundled sub-imports, ESM interop, hot-reload, or worker_threads boundaries are all places where the hijack could fail to propagate. The inline `windowsHide:VALUE -> windowsHide:VALUE,creationFlags:134217728` rewrite keeps the original 4 sites covered even if the shim ever silently breaks under one of those edge cases.

## Verification

After patcher run + window reload:

1. Tail extension.js head: first line is the shim require.
2. Run any Bash tool command. No popup. No focus steal.
3. Process audit: `Get-Process powershell, cmd, bash` while a Bash tool is mid-run shows the child process exists but no console window is associated with it.

## Anti-patterns

- Patching ONLY `windowsHide:VALUE` sites. Most CC spawn sites don't set windowsHide at all.
- Wrapping at the extension's bash-tool entry point. Bypasses every other spawn in extension.js (git inspections, telemetry, env probes, etc).
- Relying on the OS shell's window-hiding flag (`Start-Process -WindowStyle Hidden`). Wrong layer; CC doesn't shell out via PowerShell, it spawns the target binary directly.
- Editing the user's `child_process` module file. Anthropic-bundled extensions ship their own node runtime context; system-wide edits don't propagate.

## Origin

2026-05-29. Tate flagged: "powershell windows keep popping up for weeks, breaks focus, just interrupted me 3 times writing a message." Pattern correlation: popups fire BEFORE the user sees the Bash tool call in chat, confirming it's the spawn that produces them. Audit of extension.js 2.1.154 showed 10 `spawn(`, 5 `execFileSync(`, 65 `exec(` call sites; the previous patcher only protected the 4 that explicitly set `windowsHide`. Authored same-turn as the fix.

Cross-refs:
- [[windows-spawn-must-use-spawnSync-with-create-no-window-not-execSync-with-windowsHide]] - the underlying Win32 doctrine
- [[corazon-is-a-peer-not-a-browser-via-http]] - Corazon = Tate's foreground typing surface, focus steal is a P1 quality-of-life bug
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the triad shim+patcher+session-hook is the same recursive-improvement substrate triad shape
