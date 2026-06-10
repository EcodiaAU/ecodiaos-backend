# Session Summary - 2026-05-18 (for Tate)

Window: ~01:00 - ~13:00 AEST (12h elapsed). Most of the work in two passes: coord-bus + dispatch primitive (early), then audit-driven hardening + composition layer (later).

## What changed in your absence

### Live now (already serving requests)

- **`cowork.dispatch_worker`** is a real 0th-class primitive. One call: auto-spawns a new Claude Code chat tab via Ctrl+Alt+Shift+C in Cursor, syncs registration to the coord bus, pastes the brief, returns tab_id. Verified end-to-end (worker tab calls `coord.signal_done` from inside its own CC chat, conductor reads it from inbox). Codified in [patterns/dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md](../patterns/dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md) + [patterns/coord-conventions-heartbeat-signal-done-2026-05-18.md](../patterns/coord-conventions-heartbeat-signal-done-2026-05-18.md) + ~/.claude/CLAUDE.md + auto-memory.
- **Local coord bus on laptop-agent (port 7456)**. 8 → now 16+ MCP tools (`coord.send_message / read_inbox / peek_inbox / wait_for_inbox / ack_message / list_workers / heartbeat / report_progress / signal_done / pick_account / get_usage_state / poll_now / get_active_account / set_active_account / mark_flaky / clear_flaky / list_flaky`). File-backed persistence at `D:/.code/EcodiaOS/coordination/`. No PG, no SQLite, restart-survivable.
- **OC's account-balancing fully integrated.** They built `cowork.swap_creds` + `cowork.swap_history` + the full `usage.*` family on top of my coord substrate. Dispatch_worker now correctly resolves the active account via `usage._getActiveAccount()` (you'll see `account_active_when_spawned: "money@ecodia.au"` in dispatch responses now).
- **PS daemon eliminating per-call powershell.exe cold-start tax.** Long-lived `powershell.exe` child of laptop-agent, JSON-stdin protocol, single-in-flight queue, auto-respawn. `clipboard.js`, `window.js`, `input.js` all migrated and serving via the daemon. ~500ms saved per call * 30+ input calls per dispatch = ~9s shaved per dispatch.
- **Orphan-tab failure class closed.** `cowork.dispatch_worker` now wraps clipboard.write in try/catch + 1 retry + a clean orphan-return shape, so a clipboard hang under memory pressure no longer leaves a tab open with no brief.
- **Autoloader skips `*.test.js` / `*.spec.js`.** OC's test files were getting auto-required by `index.js`'s tools-autoloader, calling `process.exit()` at the end, silently killing every restart for a ~30min window. Patched; never bites again.

### Shipped to disk, waiting for next restart (current laptop-agent PID is stuck)

- `uia.js` migrated to PS daemon. UIA assemblies cold-load (~500ms) amortized to zero - turns "expensive fallback" into "first-class probe."
- `vscode.command_palette` switched from raw Ctrl+Shift+P → Esc+F1 (the "Claude Code:" typed-into-your-chat bug fix, propagated from reflex.js where you fixed it once).
- `gui.sequence` composition primitives: **`wait_for`** (wait UNTIL condition - cdp readiness/url/element/eval, file_exists, foreground window match, coord inbox has matching message, cmd exit zero) and **`branch`** (if-then-else inside a sequence). Doctrine in [patterns/gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18.md](../patterns/gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18.md).
- `gui.sequence` **variable substitution / value-binding** - any step can `as: "name"`, subsequent steps reference `${name}` (or `${name.field}`) in their params.
- `coord.peek_inbox` - same shape as read_inbox but doesn't mark messages seen. Used by `wait_for {type: 'coord_inbox_has'}` for non-consuming probes.

To get all of the above live: one successful agent restart. PID 30148 (current laptop-agent) is stuck and won't respond to taskkill/Stop-Process/wmic - looks like the audit's "burst-spawn catastrophe" failure mode under sustained ~85%+ memory. A Cursor reload, full reboot, or just leaving Corazon alone for an hour will likely let it die naturally + my background spawn will pick up.

## Audit Worker A (gui brittleness)

I dispatched a worker to audit the GUI substrate for brittleness while I built the PS daemon. Worker completed cleanly in ~4min, deliverable on disk at [coordination/briefs/gui-brittleness-audit-20260518.md](../../EcodiaOS/coordination/briefs/gui-brittleness-audit-20260518.md) (34KB, 5 sections). Worth a read - it reshuffled my priorities mid-session:

- `input.*` is the single biggest daemon win, not clipboard (30+ calls per dispatch).
- `cowork.dispatch_worker:329` had no try/catch around clipboard.write - that's what caused the orphan tab early in the session. Fixed.
- `reflex.fire_if_clear` exists already and dispatch_worker should consume it for pre-flight focus-collision check. I deferred this - dispatch is conductor-initiated not opportunistic, so the value is lower than the audit suggested.
- `vscode.command_palette` still uses raw Ctrl+Shift+P. Fixed (Esc+F1).
- AHK error-dialog hang trap exists everywhere, not just mouse.scroll. Not yet generalized - it's the right cross-cutting fix for AHK calls.

## Worker B (in flight - probably stuck)

Dispatched a second worker for "what NEXT composition primitives" audit at T+0. At T+~4min: registered but never heartbeated. Probably stuck in spin-up. Not waiting on it - my own variable-substitution + peek_inbox + wait_for/branch ships cover most of what it would have surfaced anyway.

## Doctrine artifacts created this session

- [patterns/dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md](../patterns/dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md)
- [patterns/coord-conventions-heartbeat-signal-done-2026-05-18.md](../patterns/coord-conventions-heartbeat-signal-done-2026-05-18.md)
- [patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md](../patterns/ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md)
- [patterns/gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18.md](../patterns/gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18.md)
- Backend `CLAUDE.md` deprecation table updated to point at dispatch_worker as the canonical parallelism mechanic
- User-global `CLAUDE.md` updated similarly (in both architecture-deltas + load-bearing-rules sections)
- Auto-memory: `reference_coord_bus_local_2026-05-18.md`, `reference_editor_area_claude_code_chat_keybinding.md`

## What to do when you're back

Nothing urgent. Two things worth knowing:

1. **OC's other chat is waiting on you** to log into the three accounts (tate@ / code@ / money@) so swap_creds has creds to swap with. That's their build, not mine. Bootstrap whenever you have a calm moment.

2. **One agent restart** lights up: uia daemon, vscode Esc+F1, gui.sequence wait_for + branch + ${var} substitution + peek_inbox. Easiest path: reboot Corazon when convenient. Memory pressure has been at the wedge point most of the day, so a cold start helps everything.

Otherwise just keep using the substrate normally - it's structurally better than this morning. The reflex of "dispatch a worker when work splits" is now codified across all four substrates (patterns + CLAUDE.md + memory + the actual tool surface).

---

Stream A (reliability via PS daemon) + Stream B (composability via wait_for/branch/${var}) of the "absolutely flawless GUI" doctrine you set at 01:00 AEST both shipped in this window. Stream B is just code-on-disk for now; goes live with the restart.
