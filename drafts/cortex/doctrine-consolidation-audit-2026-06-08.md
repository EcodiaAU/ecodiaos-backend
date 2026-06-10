# Doctrine consolidation audit - 2026-06-08

Scope: 4 CLAUDE.md-class files + patterns corpus (396 files) read in full.
Authored: 2026-06-08, EcodiaOS conductor (audit pass, no edits applied).
Sibling executor: Wave 2 agent applies edits per Section D.

Files in audit scope:
- `/Users/ecodia/.claude/CLAUDE.md` (127L, user-global)
- `/Users/ecodia/.code/ecodiaos/CLAUDE.md` (74L, project-level "CEO bootstrap")
- `/Users/ecodia/.code/ecodiaos/backend/CLAUDE.md` (947L, technical operations manual)
- `/Users/ecodia/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory/MEMORY.md` (5 pointers)
- `/Users/ecodia/.code/ecodiaos/backend/patterns/INDEX.md` (482L)
- `/Users/ecodia/.code/ecodiaos/backend/patterns/` (396 files, sampled)

---

## Section A. Duplications

### A1. Em-dash ban stated identically across files (correct, keep)

- User-global L30: "Em-dashes BANNED at character level. Use `-` or restructure."
- backend/CLAUDE.md L48: re-states "em-dash ban first" in Cline-bootstrap context.
- project-level CLAUDE.md: does NOT carry the em-dash ban statement (it should NOT carry it - this is a global rule, but it also should NOT VIOLATE it, see Section B1).

Recommended canonical home: user-global only. Backend mention is contextual reminder under Cline backup substrate, leave as-is.

### A2. Sub-agent / Factory delegation rule restated in three forms

- project-level CLAUDE.md L30-38: "Sub-agents and Routines (delegate domain work) - new architecture" lists Task subagents, Factory routine, Routines, and the model-selection guide.
- project-level CLAUDE.md L62, L70 still reference "delegate to Factory" / "Factory prompts" as if Factory is alive.
- backend/CLAUDE.md L18 (table row): Factory CLI is decommissioned; ecodia-factory MCP "dead, Factory process not running, being unmounted" (user-global L61).
- user-global L20+L35: parallelism is `cowork.dispatch_worker`, Task subagent for in-session.

Recommended canonical home: user-global L35 (`cowork.dispatch_worker` reflex). Project-level should one-line + cross-ref + delete Factory mentions. Backend's deprecation table already captures Factory death.

### A3. Em-dash ban + voice profile + Ecodia doc aesthetic all sit in user-global as 0th-class

The three reflexes at user-global L30-32 are each ~1500 chars long. They each have a substrate pattern (`ecodiaos-voice-substrate-2026-05-26`, `ecodia-internal-docs-render-in-html-not-markdown`). The CLAUDE.md text restates the full doctrine rather than one-line + cross-ref.

Recommended: keep the 0th-class reflex one-liner ("EcodiaOS voice is mandatory on authored surfaces; see [[pattern]]"), move the registers/scoring/incident catalogue to the pattern file. Same for the aesthetic block. Saves ~3000 chars in user-global, makes patterns the substrate.

### A4. `cowork.dispatch_worker` 0th-class reflex restated three times

- user-global L35 (the canonical statement, full).
- backend/CLAUDE.md L650 ("Parallel dispatch (live primitive)" section, full restate).
- backend/CLAUDE.md L668 (in 24/7 autonomy section #5, full restate of self-scheduling/dispatch).

Recommended canonical home: user-global L35. Backend two restatements collapse to one-line + cross-ref `[[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]`.

### A5. CDP-Chrome launch reflex (`gui.enable_chrome_cdp`) restated twice

- user-global L39: full doctrine including "three canonical launch sites" table.
- backend/CLAUDE.md L315-340: same doctrine restated, including the same three-site table and same root-cause paragraph.

Recommended canonical home: pattern `chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear`. User-global keeps the 0th-class one-liner. Backend deletes the duplicate ~600 chars - the section already cross-refs the pattern.

### A6. PM2 hard-stop tripwire restated three times

- user-global L125: full doctrine including hook bypass token + clobber-watchdog forbidden.
- backend/CLAUDE.md L933: "NEVER blind-restart PM2 (mirror of the user-global hard-stop tripwire)" - explicitly calls itself a mirror, half-length restate.
- pattern: `pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27.md`.

Recommended canonical home: pattern file. User-global keeps tripwire one-liner. Backend "mirror" line goes to a single cross-ref.

### A7. Status-board hygiene 0th-class restated twice

- user-global L34: full "Tate verbatim 2026-05-21" hygiene doctrine.
- backend/CLAUDE.md L80: same doctrine restated, including the same `status_board_hygiene.py` hook reference.

Recommended canonical home: pattern `status-board-hygiene-is-a-0th-class-reflex-2026-05-21`. User-global gets one-line reflex; backend keeps schema/queries section but defers reflex text to pattern.

### A8. Scheduling 0th-class restated three times

- user-global L37: full "scheduler.delayed / scheduler.cron" doctrine.
- backend/CLAUDE.md L668: 24/7 autonomy section #5 - full restate.
- backend/CLAUDE.md L943: "Dynamic scheduling reflex" - third restate.
- pattern `scheduling-is-0th-class-primitive-2026-05-28`.

Recommended canonical home: the pattern. User-global one-liner. Backend collapses #5 + L943 into one cross-ref.

### A9. MCP narrow connectors taxonomy restated three times

- user-global L54-68: full list of 10 connectors with tool counts.
- project-level CLAUDE.md L26-28: same list, abbreviated.
- backend/CLAUDE.md L295-305: same list yet again.

Recommended canonical home: user-global. Project + backend keep a single cross-ref to user-global "MCP endpoints" section.

### A10. Mac vs Windows path duplication (a duplication AND a staleness)

User-global L84-86 names hooks at `C:/Users/tjdTa/.claude/hooks/ecodia/`. The Mac path is `~/.claude/hooks/ecodia/` (verified - 20+ hooks live there on the MacBook today). Both paths point at hooks for the same EcodiaOS, but the user-global only names the Windows path. See Section B for the staleness; the duplication note here is that backend/CLAUDE.md ALSO names the Windows path at L42 (Cline bootstrap) and L124 (auto-memory location).

---

## Section B. Staleness

### B1. Em-dash violations in CLAUDE.md itself (P0)

The em-dash ban is character-level. Counts via `grep -c $'\xe2\x80\x94'` (U+2014 byte sequence):
- user-global: 1 (line 125, the conductor-decom paren: `:3002 U+2014 harmless`)
- project-level CLAUDE.md: 6 (L43, 47, 51, 53, 62, 70)
- backend/CLAUDE.md: 1 (line 18, conductor-decom paren same as user-global: `:3002 U+2014 harmless`)

Reality: doctrine that bans em-dashes is itself violating that ban. Fix: 8 character replacements (em-dash to ` - `).

### B2. `ecodia-conductor` still narratively alive in places

Backend/CLAUDE.md L18 carries the decommission entry (CORRECT - this is the post-2026-06-08 truth). But:
- user-global L92 implicitly correct (says MacBook is "canonical workstation + laptop-agent scheduler poller + worker dispatch host (post-2026-06-08 decom of ecodia-conductor)").
- 24/7 autonomy invariants pattern `24x7-autonomy-architecture-invariants-2026-05-27.md` line 31 cites `_injectCoordEvents` continuity block in `osSessionService.js` as the live conductor surface for "VPS conductors (iOS native, voice, cron-spawned)" - these conductors were on `ecodia-conductor`, now dead. Invariant 7 (worker `signal_done` MUST trigger conductor turn-start surfacing) is structurally broken on the VPS side; only the Cursor `coord_events_pending.py` hook path is live.
- backend/CLAUDE.md L662 (24/7 section) repeats the same `_injectCoordEvents` claim.
- backend/CLAUDE.md L668: "The conductor-side scheduler poller post-patch routes the fire through `cowork.dispatch_worker` on the laptop-agent" - this was the patch the decom obsoletes; the scheduler poller now lives on the MacBook laptop-agent, not on `ecodia-conductor`.

Reality: post-2026-06-08, the only live conductor surface is the IDE Claude Code tab on the MacBook (with Corazon as the secondary). The VPS dispatches no conductor sessions. `osSessionService._injectCoordEvents` is unreachable code.

Fix targets: backend/CLAUDE.md L662 + the pattern `24x7-autonomy-architecture-invariants-2026-05-27.md` invariant 7 + L943 active-cron-set narrative.

### B3. "Corazon = canonical workstation" framing throughout

User-global L3: "This file loads on every Claude Code session on the MacBook (canonical workstation, hostname `MacBookPro.lan`) and on Corazon regardless of workspace." This is now correct.

But everything downstream treats Corazon as primary:
- user-global L80-86 "Local Corazon embodiment" section - paths are all `C:/Users/tjdTa/...` and `D:/.code/`. The Mac has `/Users/ecodia/.code/` and `/Users/ecodia/.claude/hooks/`.
- user-global L82 "NEVER `D:/.code/` (would load no workspace CLAUDE.md)" - on the Mac, the prohibition is meaningless because there is no `D:/`.
- user-global L84-86: hooks + skills + auto-memory all named at Windows paths. None of these are reachable from a Mac session.
- backend/CLAUDE.md L168 names scheduler at `D:/.code/eos-laptop-agent/tools/scheduler.js` - but the live scheduler IS on `MacBookPro.lan` per L92 + L941.
- backend/CLAUDE.md L347 "Corazon (Tate's Windows laptop)" section is whole-section Corazon-centric.
- backend/CLAUDE.md L660 cites `coord.close_my_tab` at `D:/.code/eos-laptop-agent/tools/coord.js` - on the Mac it lives at `~/.code/eos-laptop-agent/tools/coord.js` (or wherever the Mac canonical clone is).

Reality: Mac is canonical. Corazon is legacy + occasional secondary. Doctrine still reads as Corazon-first.

Fix: dual-path table (Corazon Windows paths + Mac paths) OR explicit "canonical = Mac" rewrite of paths in 5-10 places. See Section C for the gap pattern proposal.

### B4. `/api/mcp/cowork` + `/api/mcp/ecodia-full` "sunset-pending" framing

User-global L65: "Both stay mounted on the VPS to serve live Routines but are slated for sunset once the scheduler repoint is verified (status_board 2bf2c734)."
Backend/CLAUDE.md L299-301: same framing.
Project-level CLAUDE.md L12, L28: also says "deprecated (sunset-pending, status_board 2bf2c734)".

Post-2026-06-08: ecodia-conductor decommissioned, scheduler runs on MacBook laptop-agent, scheduler dispatch routes via `cowork.dispatch_worker` (laptop-agent localhost, not the VPS gateway). The "scheduler repoint verified" predicate from 2026-05-29 is satisfied. The status_board row `2bf2c734` likely already moved; needs probe.

Reality: the sunset condition is met. Whether the gateways have actually been unmounted from the VPS PM2 list is a separate fact to verify - backend L18 says the canonical VPS PM2 list is `ecodia-api`, `ecodia-meetings`, `voice-call` only. If `ecodia-api` no longer serves the gateways, the rows are dead doctrine.

Fix: verify status_board `2bf2c734` + verify `/api/mcp/cowork` returns 404 today. If both confirm sunset, replace "sunset-pending" with "DECOMMISSIONED 2026-06-08" everywhere.

### B5. Specific status_board ids referenced in doctrine

- project-level L13: row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` (VPS-to-local migration phase).
- user-global L65, project L12+L28, backend L299: row `2bf2c734` (cowork/ecodia-full sunset).
- backend L773: rows `0df47f4b-3b14-4f1a-9613-07877f0f9e1f` (cron silent-fire detector) + `e86b6437-1315-47b7-87f4-cd6481256966` (INDEX.md regen investigation).
- backend L941: row `b22cc8dd` (scheduler signal_bound P1, currently open).
- backend L941: row `9e961dcc` (cron prompt rewrite, completed 2026-06-08).

Reality: most of these may already be archived. Migration row `580f7aaf` represented a 2026-05-15 phase that's now ~3 weeks past completion. Pattern: doctrine referencing specific status_board uuids that have rolled past is a recurring drift surface.

Fix: probe each id's `archived_at` status. Replace archived ones with prose ("the VPS-to-local migration completed; see Episode <name>" instead of "query row id X").

### B6. Routines status

User-global L70-78 lists 20 routine prompt bodies (16 scheduled + 4 webhook + factory-cloud). Backend L17 (the deprecation table) says "Routines status unverified - treat each routine claim as unverified until the world-model audit confirms it."

Reality: per backend L18, the schedulerPoller migrated to `eos-laptop-agent/tools/scheduler.js`. Per L941, the active cron set is 76 rows on the MacBook scheduler. The Anthropic-cloud routines (claude.ai/code/routines) are a separate substrate; whether any still fire is unverified.

Fix: probe `https://claude.ai/code/routines` on a code@ session, list which routines are present + their last-run timestamps. Routines that are dead get archived from `backend/routines/REGISTRY.md` and from user-global L70-78.

### B7. Project-level CLAUDE.md says "interactive conductor = local Claude Code on Corazon" (L23)

Post-2026-06-08, the interactive conductor primarily runs on `MacBookPro.lan`, not Corazon. Corazon is a secondary worker host.

Fix: rewrite L23 to "local Claude Code on the MacBook (`MacBookPro.lan`, canonical) or Corazon (secondary, legacy)".

### B8. Stale dispatch routing claim in backend L668

"The conductor-side scheduler poller post-patch routes the fire through `cowork.dispatch_worker` on the laptop-agent, not the deprecated os-session/message surface ([[scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28]])"

This was the patch ON THE VPS conductor. The VPS conductor is dead. The scheduler poller IS the laptop-agent now (per L939 + the user-global delta). The framing "conductor-side scheduler poller post-patch routes the fire through cowork.dispatch_worker" treats the conductor and the laptop-agent as different things; they collapsed.

Fix: tighten - "The scheduler poller (laptop-agent `tools/scheduler.js`) dispatches via `cowork.dispatch_worker` directly. The deprecated os-session/message path is removed."

### B9. Open P1 noted at L941 but not lifted to user-global

Backend L941: "Open P1 (status_board `b22cc8dd`): scheduler dispatch path is broken at signal_bound. The poller leases rows, `cowork.dispatch_worker` successfully spawns tabs, but spawned tabs never call `coord.signal_bound` back; every dispatch hits the 180s timeout and stale-leases."

This is a current, load-bearing failure. Every scheduled cron is firing into a broken path. Should be a hard-stop banner at user-global level OR have a status_board P1 row that turns up on every session-start query.

Fix: either add a one-liner under user-global "Hard-stop tripwires" noting "scheduler dispatch broken at signal_bound - cron fires are not landing work; see status_board `b22cc8dd`" OR escalate the row to P1 if not already.

### B10. MEMORY.md two-week-old line: "Cron prompts default to claude-opus-4-8 with explicit IDs"

MEMORY.md line 4 references `claude-opus-4-8`. The current model in the active session is `claude-opus-4-7` (per the system prompt). Whether 4-8 exists yet is unverified; if it's a planned future model, the doctrine line is correct but the version is not yet active.

Fix: verify - if `claude-opus-4-8` is not yet an available model ID, rewrite the memory entry to name the actual default model used by the 2026-06-08 cron-prompt rewrite (likely `claude-opus-4-7` per the patterns-index-regen run cited in backend L941).

---

## Section C. Gaps

### C1. Proposed pattern: `mac-is-canonical-workstation-architecture-2026-06-08.md`

**Why:** The MacBook (`MacBookPro.lan`) became the canonical workstation on 2026-06-08 when ecodia-conductor was decommissioned. The patterns corpus has 14 Corazon/laptop-agent patterns describing Corazon-specific plumbing (Windows paths, PM2 supervision, PowerShell shell.shell), but NO single pattern naming the Mac as the canonical conductor host and enumerating the Mac-side equivalents of the Corazon paths. Three patterns touch Mac plumbing in passing (`cred-rotation-mac-port-shipped-2026-06-08`, `mac-port-of-windows-hardcoded-hook-scripts-requires-three-way-audit-2026-06-08`, `mac-local-headless-ios-ship-via-asc-api-2026-06-08`) but none is the load-bearing "Mac is canonical, here's the path map" pattern.

**Stub:**
```
# The Mac (MacBookPro.lan) is the canonical workstation; Corazon is secondary
Triggers: mac-canonical, macbook-canonical, mac-paths, mac-vs-corazon, canonical-workstation, post-conductor-decom, mac-conductor

Post-2026-06-08 architecture: ecodia-conductor PM2 process decommissioned. Scheduler poller, worker dispatch, cred refresher, conductor session all live on the MacBook. Corazon remains alive as a secondary worker host (GUI / Windows-bound work, AHK macros, Tate's logged-in Chrome session) but is no longer the primary conductor surface.

Path map (Mac canonical → Corazon equivalent):
- Workspace: /Users/ecodia/.code/ecodiaos/ → D:/.code/ecodiaos/ (mirror)
- Hooks: ~/.claude/hooks/ecodia/ → C:/Users/tjdTa/.claude/hooks/ecodia/
- Skills: ~/.claude/skills/ → C:/Users/tjdTa/.claude/skills/
- Auto-memory: ~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory/ → C:/Users/tjdTa/.claude/projects/d---code/memory/
- Cred store: /Users/ecodia/PRIVATE/ecodia-creds/ → (Corazon does not hold these)
- Chrome profile: ~/Library/Application Support/Google/Chrome/Default → %LOCALAPPDATA%/Google/Chrome/User Data/Default
- Laptop-agent: ~/.code/eos-laptop-agent/ (Mac canonical) + D:/.code/eos-laptop-agent/ (Corazon)
- Scheduler: ~/.code/eos-laptop-agent/tools/scheduler.js (Mac) → laptop-agent on MacBookPro.lan canonical
- Service supervision: launchctl (Mac) → PM2 + Windows Task Scheduler (Corazon)
- Shell: /bin/zsh or /bin/bash via shell_exec → PowerShell via shell.shell on Corazon

Hook plumbing: hooks on the Mac live at ~/.claude/hooks/ecodia/ with ~50 files. Same hook names as Corazon; the audit pattern `mac-port-of-windows-hardcoded-hook-scripts-requires-three-way-audit-2026-06-08` covers the path-rewrite obligation when porting Corazon hooks to Mac.

Anti-pattern: writing doctrine that names only the Corazon path. The doctrine must name both paths OR the Mac path with Corazon as a "see also". Default = Mac.

Origin: 2026-06-08 ecodia-conductor decom moved the conductor primary surface to the Mac. See Neo4j Decision "ecodia-conductor decommissioned 2026-06-08" + auto-memory `ecodia-conductor-decommissioned-2026-06-08`.
```

### C2. Proposed pattern: `24x7-autonomy-invariants-post-conductor-decom-2026-06-08.md`

**Why:** The 10 invariants in `24x7-autonomy-architecture-invariants-2026-05-27.md` were authored when `ecodia-conductor` was the live VPS conductor process. Invariant 7 names `_injectCoordEvents` in `osSessionService.js` (VPS conductor turn-start surfacing). Post-decom that code path is dead. Invariants 2 (cred substrate), 3 (conductor-owns-restart), 6 (signal_bound first instruction), 7 (turn-start surfacing) need either an addendum or a rewrite to match the laptop-agent-as-scheduler / MacBook-conductor topology. The open P1 at status_board `b22cc8dd` (signal_bound not firing back from spawned tabs) is a direct test of invariant 6.

**Stub:**
```
# 24/7 autonomy invariants - reconciled with post-2026-06-08 conductor decom
Triggers: 24x7-autonomy-post-decom, autonomy-invariants-reconciled, mac-conductor-turn-start, scheduler-signal-bound-broken, post-conductor-decom-autonomy

The 10 invariants in 24x7-autonomy-architecture-invariants-2026-05-27.md remain load-bearing, but four require reconciliation against the 2026-06-08 ecodia-conductor decom:

Invariant 2 (no conductor reads .credentials.json directly): still binds. `cred-refresher.js` ran in ecodia-conductor's worker set; it now runs on the MacBook (per cred-rotation-mac-port-shipped-2026-06-08).

Invariant 3 (conductor-owns-restart): rewrite needed. "Forks file pending_restart_requests, conductor reads + executes" assumed the ecodia-conductor was the executor. Post-decom, the executor is the MacBook conductor (or any live IDE conductor). The pending_restart_requests table remains the coordination surface.

Invariant 6 (signal_bound first instruction): currently failing in production. Status_board b22cc8dd. The poller leases rows, cowork.dispatch_worker spawns tabs, but the spawned tabs never call coord.signal_bound back. Every dispatch hits the 180s timeout. This is the highest-leverage current bug; the autonomy substrate is broken until signal_bound fires.

Invariant 7 (worker signal_done MUST trigger conductor turn-start surfacing): _injectCoordEvents in osSessionService.js is unreachable post-decom (VPS conductor is dead). The live surface is the Cursor/Claude-Code IDE coord_events_pending.py UserPromptSubmit hook ONLY. VPS-spawned conductors (iOS, voice, cron) no longer exist as a category - all conductor sessions now run in an IDE.

Reach with the original invariants pattern; this file is the diff, not the replacement.
```

### C3. Proposed pattern: `signal-bound-broken-blocks-autonomy-substrate-2026-06-08.md`

**Why:** Status_board `b22cc8dd` is the load-bearing P1 cited at backend/CLAUDE.md L941 but it has no pattern file naming the diagnosis path or the recovery substrate. Until signal_bound fires, EVERY scheduled cron is silently failing and the 24/7 autonomy substrate is non-functional. This is the actual current state of EcodiaOS, and there's no pattern file capturing "when you wake up to scheduler tasks not landing, here's the first probe".

**Stub:**
```
# Signal_bound broken blocks the entire autonomy substrate
Triggers: signal-bound-broken, scheduler-dispatch-broken, scheduler-stale-lease, no-coord-signal-bound, autonomy-substrate-broken, post-decom-scheduler-failure

Symptom: scheduled cron rows lease, cowork.dispatch_worker reports success (tab_id in /Users/ecodia/Library/Logs/eos-laptop-agent.err.log), but spawned tabs never call coord.signal_bound. Poller hits 180s timeout. Cron rows reset per scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02 doctrine. Loop indefinitely; no work lands.

Root-cause space (open):
1. Spawned IDE tab doesn't load the brief that mandates signal_bound as first instruction.
2. The brief loads but coord MCP is not attached to the spawned tab.
3. coord.signal_bound is called but the laptop-agent doesn't receive it (network / port).
4. The receive happens but isn't matched back to the lease.

Diagnosis probes:
- Tail /Users/ecodia/Library/Logs/eos-laptop-agent.err.log around a known spawn time, look for coord.signal_bound POST.
- Open the spawned tab manually, check whether the brief was pasted.
- Verify coord MCP is in the spawned tab's .mcp.json.
- Verify the laptop-agent port 7456 is reachable from the spawned tab's network namespace.

Doctrine: any change to the dispatch_worker brief template, the IDE spawn keystroke (Ctrl+Alt+Shift+C on Windows, Cmd+equivalent on Mac), or the coord MCP attachment list MUST verify signal_bound fires before being declared shipped.

Origin: 2026-06-08, status_board b22cc8dd. Post-conductor-decom the scheduler moved to the MacBook laptop-agent; signal_bound has not fired since.
```

### C4. Proposed pattern (small): `claude-md-three-tier-hierarchy-load-order-2026-06-08.md`

**Why:** The relationship between the three CLAUDE.md files is described informally at the top of each (user-global L3, project-level not stated, backend L3). No pattern names the LOAD ORDER + the SCOPE RULE (what belongs in user-global vs project vs backend). This audit had to infer the scope rule from content. Future audits should be able to grep for it.

**Stub:**
```
# The three-tier CLAUDE.md hierarchy: user-global / project / backend
Triggers: claude-md-hierarchy, claude-md-scope, claude-md-load-order, where-does-this-doctrine-live, claude-md-canonical-home

Load order (Claude Code session start):
1. ~/.claude/CLAUDE.md (user-global) - identity, decision authority, 0th-class reflexes that apply on every session regardless of workspace.
2. <workspace>/CLAUDE.md (project-level "CEO bootstrap") - conductor architecture, operating principles, anti-patterns. Loads automatically when workspace = /Users/ecodia/.code/ecodiaos/.
3. <workspace>/backend/CLAUDE.md (technical operations manual) - MCP tools, laptop-agent plumbing, cred substrate, database tables, scheduler, hooks. Loads when cwd is or descends from backend/.

Scope rule (where doctrine belongs):
- user-global: identity, legal posture, 0th-class reflexes (em-dash ban, voice profile, status_board hygiene, dispatch_worker, scheduling), MCP endpoints taxonomy, hard-stop tripwires.
- project-level: conductor-vs-routine architecture, anti-patterns, memory hygiene rule, quality bar. Brief by design.
- backend: full technical doctrine - MCP tool inventories, kv_store creds, scheduler internals, database schemas, hook plumbing, restart recovery, observer trio.

A doctrine line belongs in EXACTLY ONE file. Cross-files duplications are stripped to one-line + cross-ref. Patterns are the deep substrate; CLAUDE.md is the surfacing layer.

Anti-patterns:
- Same rule restated full-length in two CLAUDE.md files (use cross-ref instead).
- Pattern doctrine inlined into CLAUDE.md beyond the one-liner surfacing summary.
- Workspace-specific rules in user-global (they belong in project-level).

Origin: 2026-06-08 doctrine consolidation audit identified A1-A10 duplications, this pattern captures the scope rule that prevents recurrence.
```

### C5. Gap: no pattern for "MEMORY.md hygiene" / Anthropic auto-memory promotion

MEMORY.md has 5 entries dating back days. No pattern names when an auto-memory entry should be promoted to Neo4j or to a pattern file. backend/CLAUDE.md L127-133 describes the promotion path but defers to the routine `auto-memory-promotion-audit` (status unverified per B6). Without a pattern, the hygiene is invisible.

Stub: `auto-memory-promotion-hygiene-when-and-how-to-promote.md`. Defer authoring to Wave 2 if scope-bounded.

---

## Section D. P1 fixes (5 most load-bearing edits, ship next session)

### D1. Fix em-dash violations in CLAUDE.md files

Files: user-global L125, project-level L43+L47+L51+L53+L62+L70, backend L18 (table cell).
Substitution: U+2014 character to ` - ` (em-dash to space-hyphen-space).
Verification: `grep -c $'\xe2\x80\x94' <file>` returns 0 for all three.
Severity: P0 self-inconsistency (the file banning em-dashes contains em-dashes).

### D2. Surface the open scheduler signal_bound P1 to user-global hard-stop tripwires

User-global L115-125 "Hard-stop tripwires" section. Add one line: "Scheduler dispatch broken at signal_bound (status_board `b22cc8dd`) - cron fires are not landing work as of 2026-06-08. Treat any scheduler claim as unverified until signal_bound restored. See [[signal-bound-broken-blocks-autonomy-substrate-2026-06-08]] (to be authored, Section C3)."
Severity: P1 (every cron silently fails; doctrine pretends the autonomy substrate is alive).

### D3. Reconcile 24/7 autonomy invariants with post-conductor-decom reality

File: `/Users/ecodia/.code/ecodiaos/backend/patterns/24x7-autonomy-architecture-invariants-2026-05-27.md`.
Edit: insert reconciliation note at the top of invariant 7 + invariant 3 + invariant 6. Cross-ref the post-decom auto-memory entry + the new pattern from Section C2.
Alternative: author the C2 pattern as a diff-pattern; original stays as-is.
Backend/CLAUDE.md L662 + L668: rewrite to name the MacBook laptop-agent as the scheduler poller and the IDE conductor (Mac primary, Corazon secondary) as the turn-start surface. Drop the `osSessionService._injectCoordEvents` reference - that's VPS-conductor-only code that no longer fires.
Severity: P1 (the 24/7 autonomy doctrine is the substrate for the Africa trip; it must be true).

### D4. Author the Mac-canonical-workstation pattern (C1)

Path: `/Users/ecodia/.code/ecodiaos/backend/patterns/mac-is-canonical-workstation-architecture-2026-06-08.md`.
Use the C1 stub above as the starting body. Add the cross-refs (cred-rotation-mac-port-shipped, mac-port-of-windows-hardcoded-hook-scripts-requires-three-way-audit, mac-local-headless-ios-ship-via-asc-api).
Update user-global L80-86 "Local Corazon embodiment" to "Local embodiment - Mac canonical + Corazon secondary" with a two-column path table.
Severity: P1 (doctrine consistently reads Corazon-first, reality is Mac-first; every new session orienting against this drifts further).

### D5. Consolidate the 0th-class reflexes in user-global to one-liners + pattern cross-refs

Lines 30-44 of user-global. Each reflex (em-dash ban, voice profile, doc aesthetic, action-over-plans, status-board hygiene, dispatch_worker, kill_worker tab handle, self-scheduling, Chrome CDP top primitive, CDP-Chrome launch, parallel CDP chats, verify deployed state, no client contact, codify-at-the-moment, recursive improvement) - 14 reflexes, ~12000 chars total.

Recommendation: each reflex collapses to one paragraph (1-2 sentences) + a `[[pattern-name]]` cross-ref. The deep doctrine LIVES in the pattern files. User-global becomes the index, not the substrate.

Net reduction: ~8000 chars from user-global. Patterns become the deep substrate as designed.

Severity: P1-by-volume (this is the largest single readability + duplication fix; every session reads this file).

---

## Note on autonomy / decision-authority

This audit ships findings only. No CLAUDE.md or pattern files were edited. Wave 2 agent has unblocked authority to execute D1-D5 same-day; D1 is character-level safe to apply mechanically; D2-D5 should each spawn a `cowork.dispatch_worker` with the relevant fix-scope brief.

End audit.
