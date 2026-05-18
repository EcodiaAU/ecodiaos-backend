# Self-evolution routine fire - 2026-05-18

Filesystem fallback Episode log. Both `ecodia-core` and `ecodia-graph` MCP servers required re-authorisation (token expired) during this fire window, so the Neo4j Episode write and `kv_store.cowork.last_self_evolution` write could not complete via MCP. The pattern file IS the substrate deliverable; this file is the durable Episode-equivalent record so the next routine fire can rotate focus.

## Fire metadata

- **Routine:** self-evolution (every 4h on tate@ecodia.au)
- **Fire window:** 2026-05-18, while-Tate-presumed-away conductor turn
- **Substrate status:** ecodia-core MCP DOWN (token expired), ecodia-graph MCP DOWN (token expired), filesystem UP, status_board via MCP DOWN (token expired)
- **Focus area picked:** A (pattern authoring)
- **Rotation rationale:** could not read `cowork.last_self_evolution` to confirm last focus (MCP down), defaulted to A which is the highest-leverage option when a clear codifiable gap exists. Confirmed below that the gap exists and meets the 3+ occurrence bar.

## Artefact produced (the deliverable)

`backend/patterns/gui-substrate-subprocess-silent-failure-class-2026-05-18.md` (12,746 bytes, 67 lines, 21 narrow triggers, 0 em-dashes, 0 en-dashes).

Plus the corresponding row inserted into `backend/patterns/INDEX.md` between `gui-step-verify-protocol.md` (line 143) and `haiku-semantic-reviewer-complement-to-heuristic-hooks.md` (line 144 pre-edit).

## Rule codified

When a Corazon `eos-laptop-agent` tool that shells out to PowerShell, AutoHotkey v2, or `cmd.exe` either hangs to the parent timeout with empty stderr OR returns `ok:true` with structurally wrong data, default-suspect one of five known silent-failure modes before assuming the wrapper logic is wrong. The five modes plus a five-step diagnostic protocol are catalogued in the pattern file.

## Why 3+ occurrence bar cleared

Six distinct occurrences in seven days (2026-05-11 to 2026-05-18) share the shape "subprocess succeeded with no useful effect OR hung past timeout with empty stderr":

1. AHK v2 `Send "{WheelDown N}"` syntax hang (2026-05-17 ~16:30 AEST)
2. PowerShell `$pid` automatic-variable shadow in `window.foreground` (2026-05-17 ~22:50 AEST)
3. `Set-Clipboard` hang under memory pressure (2026-05-17 ~23:00 AEST)
4. `System.Web.HttpRuntimeSection` init OOM on cold PS spawn (2026-05-17 ~23:10 AEST)
5. `Ctrl+Shift+P` swallowed by Cursor chat input control, typed "Claude Code:" into Tate's chat (pre-2026-05-18, captured in ps-daemon pattern)
6. AHK `FileAppend` UTF-8 BOM in macro-recorder manifest.json (2026-05-11, captured in `apply-ahk-bom-fix.ps1`)

## Cross-reference scaffolding added

The new pattern explicitly cross-references:

- `ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18.md` (the architectural fix for modes 3 and 4; the new pattern is the complementary diagnostic layer)
- `gui-substrate-beast-mode-2026-05-17.md` (mentions `$pid` in passing; the new pattern catalogues it as mode 2)
- `gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17.md` (mentions mouse.scroll fix as side-ship; the new pattern catalogues it as mode 1)
- `gui-step-verify-protocol.md` (different failure class - input did not land vs subprocess silently misbehaved; symptom vs cause)
- `eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md` (different failure class - require-cache staleness; cross-referenced so future-me does not conflate the two)
- `verify-deployed-state-against-narrated-state.md` (parent meta-rule; this is the subprocess-shellout specialisation)

## Did not work

- Could not write the Episode via `mcp__ecodia-core__neo4j_write_episode` (token expired)
- Could not write the Episode via `mcp__ecodia-graph__graph_create_node` (token expired)
- Could not read `cowork.last_self_evolution` to confirm prior focus (token expired)
- Could not write `cowork.last_self_evolution` to record this focus (token expired)
- Could not check status_board for `doctrine_gap` rows (token expired)

The MCP outage forced reliance on filesystem-only signals (`patterns/`, `drafts/SESSION_SUMMARY_*`, `CLAUDE.md`) for both orientation and documentation. That worked - the pattern surface and recent session summaries gave enough context to identify the gap and write the doctrine.

## Next session should consider

1. **MCP auth refresh check.** If `ecodia-core` and `ecodia-graph` are still token-expired next fire, escalate to a status_board P3 row (via direct HTTP if MCP still down) so this becomes visible work rather than silent degradation. The auth-expiry pattern itself may deserve a pattern file if it recurs.
2. **Backfill the Neo4j Episode.** When MCP is back, write the Episode using this filesystem log as the source-of-truth payload. Use `type=cowork_realisation`, `name="self-evolution 2026-05-18 routine fire"`, description = the focus + deliverable + cross-refs summary.
3. **Scan ps-daemon migration TODO.** `notification.js`, `screenshot.js`, `reflex.js:isEditorWindowUp` are not yet daemon-routed per the ps-daemon pattern's migration cookbook. The new silent-failure-class pattern predicts modes 3 and 4 will bite those tools next under memory pressure. Pre-emptive migration would prevent the next incident in the taxonomy.
4. **Reflection synthesis candidate.** Six occurrences in a week of the same failure SHAPE is itself a Reflection-worthy synthesis - the meta-lesson is "Corazon's subprocess-shellout substrate has a systematic silent-failure surface that grows with each new tool, and the ps-daemon migration is the structural countermeasure." This pattern file IS the synthesis; a Reflection node would be redundant duplication.
5. **INDEX.md drift sweep.** During this fire I noticed several 2026-05-17/18 GUI patterns (`gui-substrate-beast-mode`, `gui-substrate-three-layer-architecture`, `cdp-compound-flow-design`, `gui-sequence-composition-primitives`, `ps-daemon-long-lived-powershell`) are NOT yet in INDEX.md. The daily-index-regen routine handles bulk normalisation; I only added my own new entry per scope discipline. If the regen routine has not run in a week, that is a separate failure to escalate.

## Was this session worth the tokens

**Yes.** The five-mode taxonomy + five-step diagnostic protocol now exists as a 5-minute resolution path for a failure class that ate hours of debugging time across the 2026-05-17/18 window. Each future occurrence of a sixth/seventh silent-failure mode can be appended as a new table row, compounding the file's value. The cross-reference scaffolding tightens the GUI-substrate cluster so future grep on any of the 21 narrow triggers will surface this file alongside its companions (ps-daemon, beast-mode, gui-batch-primitive, step-verify) rather than leaving the diagnostic layer as a buried sub-section of a larger doc.

## Verification

```
$ grep -nP '\x{2014}' backend/patterns/gui-substrate-subprocess-silent-failure-class-2026-05-18.md
$ echo $?
1   # no em-dash present

$ wc -lc backend/patterns/gui-substrate-subprocess-silent-failure-class-2026-05-18.md
   67 12746

$ grep -n "gui-substrate-subprocess-silent-failure-class-2026-05-18" backend/patterns/INDEX.md
144:| [gui-substrate-subprocess-silent-failure-class-2026-05-18.md](gui-substrate-subprocess-silent-failure-class-2026-05-18.md) | silent-subprocess-failure, ...
```
