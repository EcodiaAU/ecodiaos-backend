# CLAUDE.md gaps audit - 2026-05-08 AEST

Author: fork_mowquugz_4f442e (claude-md-reflection cron, 20:00 AEST 2026-05-08)

Methodology: read both CLAUDE.md files end-to-end (`~/CLAUDE.md` business, `~/ecodiaos/CLAUDE.md` technical); listed pattern files newer than yesterday's audit (`ls -lt ~/ecodiaos/patterns/*.md | head -25`); read each pattern authored or extended in the last 24h in full; queried Neo4j for Decisions / Episodes / Patterns / Reflections within the last PT24H window; cross-referenced new patterns against canonical CLAUDE.md texts via Read; grep-mined transcript jsonl for "verbatim", "codify this", "this is the pattern" tokens. NO em-dashes anywhere in this file (hyphens with spaces or restructured).

Yesterday's audit (2026-05-07) was authored by fork_movbh8x1_2678f7 and applied per the daily edit-cron. Today's window therefore covers the 24h since.

Pattern files authored or significantly extended in the last 24h (mtime order, newest first):

- `~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md` (NEW, 8 May 08:46 AEST, Origin 8 May 08:24-08:39 AEST P0 binary-not-found arc, fix commit 2980601)
- `~/ecodiaos/patterns/pm2-restart-count-is-lifetime-not-rate.md` (NEW, 8 May 07:14 AEST, Origin 8 May 16:38 AEST stale-premise fork brief)
- `~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md` (NEW, 8 May 07:13 AEST, Origin 8 May 16:40-17:14 AEST manager-fork sub-spawn regression, fix commit 1c7ea11)
- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` (NEW, 8 May 07:07 AEST; already cross-ref'd from `~/ecodiaos/CLAUDE.md` Cross-system rotation discipline section)
- `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` (NEW, 8 May 04:06 AEST, Tate verbatim 14:01 AEST 8 May; already top-of-file in `~/CLAUDE.md` Core Operating Doctrine)
- `~/ecodiaos/patterns/blanket-fork-when-vague-bug-report-not-clarifying-question.md` (NEW, 8 May 02:19 AEST, Tate verbatim 12:17 AEST 8 May)

Sibling shipped artefacts (last 24h, from Neo4j):

- ecodia-api `_recordTurnOutcome` triple-guard hardening shipped by Tate's commit d7b8388 03:59:32 UTC, resolved overnight restart-loop incident before conductor saw it
- Cortex-ambient page bug-fix pass shipped: 4 bugs fixed by manager fork_mowb3al4_f0d004 in commit 82ba8ad7
- FE undefined-length fix shipped at /cortex-ambient (EffectComposer / Bloom prop ordering)
- Cortex-ambient round 2 visuals + round 3 dispatch (neural-node-edge core + IDE/tab nav surface)
- Co-Exist iOS 1.8.4 shipped by Tate himself via the validated GUI release recipe (~13:43 AEST), conductor's GUI fork_mowd6rcg_09b3a8 cancelled
- Hook-stack tag-line stripping shipped (`scripts/hooks/lib/strip-tag-lines.sh` + 9 hooks wired)
- GKG L5+L6 dark seams verified green post commit 342df833 (knowledgeGraphService.js export of getBatchEmbeddings)
- SDK musl-vs-glibc fork-spawn auto-detect fix shipped by Tate commit 2980601, restored fork dispatch 08:39:54
- Manager-fork sub-spawn regression fixed by fork_mowkbcm4_ca76a0 commit 1c7ea11 (per-query MCP server factory)
- pm2 lifetime-vs-rate restart-counter doctrine authored from fork_mowkasur_95685e bounded-investigation finding the brief premise was stale

---

## Section 1 - Gaps to add (rule, proposed exact text, target file)

### Gap 1.1 - SDK musl-vs-glibc binary trap not surfaced from `~/ecodiaos/CLAUDE.md` Factory / Fork section

**Rule:** Today's 8 May 08:24-08:39 AEST P0 incident: every SDK fork dispatch from 08:24 onward aborted in ~35ms with abort_reason "Claude Code native binary not found at .../claude-agent-sdk-linux-x64-musl/claude". Root cause: Anthropic SDK's `B7()` resolver on Linux tries `linux-x64-musl` BEFORE `linux-x64`. Both packages get installed by `optionalDependencies` at every `npm install`; on glibc hosts (the VPS) the musl binary's interpreter `/lib/ld-musl-x86_64.so.1` is absent, so exec(2) returns ENOENT and the SDK reports "binary not found" even though the file exists. Fix: `pathToClaudeCodeExecutable` override on every `query()` call site OR `CLAUDE_CODE_EXECUTABLE` env in ecosystem.config.js. Tate shipped the fix in commit 2980601 because the recovery fork itself failed (the diagnostic substrate depended on the broken substrate). This trap will recur on every SDK version bump or `npm install`. Future-me debugging a sudden fork-spawn-aborts-in-35ms outage needs this pattern surfaced.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Factory - Your Coding Workforce" section, immediately before "The rule" subsection.

**Proposed insertion** (new subsection):

```
### SDK musl-vs-glibc binary auto-detect trap (recurs on every SDK upgrade or npm install)

`@anthropic-ai/claude-agent-sdk` ships both `linux-x64` (glibc) and `linux-x64-musl` binaries as `optionalDependencies`. The SDK's `B7()` resolver tries musl FIRST. On the glibc VPS this means every `query()` call after a fresh `npm install` silently picks the musl binary, which fails to execute (`ENOENT` on `/lib/ld-musl-x86_64.so.1`). Symptom: every fork aborts in ~35ms with "Claude Code native binary not found" even though the file exists at the named path.

Defence (mandatory on every SDK call site):
- Pass `pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'` on every `query({ options })`. Today: `forkService.js`, `voiceRelay.js`, `osSessionService.js`, `rescueRunner.js`. Any new call site MUST also include the override.
- Set `CLAUDE_CODE_EXECUTABLE` in `ecosystem.config.js` env block (belt and braces).
- Re-run `file node_modules/@anthropic-ai/claude-agent-sdk-linux-x64*/claude` after every `npm install` / `npm update` / SDK version bump.

Origin: 8 May 2026 P0 incident, fix commit 2980601. Full: `~/ecodiaos/patterns/sdk-musl-vs-glibc-binary-auto-detect-trap.md`. Meta-lesson: when the diagnostic substrate depends on the broken substrate, escalation must route around it (Tate's hands closed the loop manually because no fork could).
```

### Gap 1.2 - SDK in-process MCP server per-query rule not surfaced from manager-fork doctrine

**Rule:** Today's diagnosis fork (fork_mowkbcm4_ca76a0) found that `forkConductorTool.js` was caching a single `createSdkMcpServer()` return value across SDK queries. The MCP SDK's `Server.connect()` throws "Already connected to a transport" if the same Server instance is connected to a second transport. The Claude Agent SDK's `connectSdkMcpServer()` silently swallows that error in a `.catch()` and removes the server from `sdkMcpServerInstances`, so the second SDK query loses the in-process tool surface even though `--allowedTools` still lists `mcp__forks__*`. Manifestation: manager forks could describe sub-fork plans but never spawned them; recurring "MCP forks transport disconnects on hourly cron fire" pattern. Fix: rebuild the server fresh per call; cache the tool wrappers (pure data) but never the Server instance. Validation: `await getServer() === await getServer()` MUST be `false`. This rule applies to ANY in-process SDK MCP server shared across main + fork or main + cron-fire. Future-me adding a new in-process MCP server in this codebase needs this surfaced before they paste the singleton-cache pattern.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Fork hierarchy - Manager forks (5 May 2026)" subsection, end of section.

**Proposed insertion** (append after the "Conductor discipline" paragraph):

```
**SDK in-process MCP Server instances must be per-query, not singleton.** The MCP SDK's `Server.connect()` throws `Already connected to a transport` if the same instance is connected to a second transport. The Claude Agent SDK silently catches and removes it from `sdkMcpServerInstances`, so the second SDK query loses the in-process tool surface even though `--allowedTools` still lists the patterns. Symptom: manager-flagged forks describe sub-fork plans but no children appear with `parent_id=<manager_fork_id>`; recurring "MCP forks transport disconnects on hourly cron fire". Fix: rebuild the server fresh per call (cache the tool wrappers, NEVER the `createSdkMcpServer()` return value across SDK queries). Validation: `await getServer() === await getServer()` MUST be `false`. Applies to ANY in-process MCP server shared across main + fork or main + cron-fire. Origin: 8 May 2026 16:40-17:14 AEST, fix commit 1c7ea11. Full: `~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md`.
```

### Gap 1.3 - PM2 lifetime-vs-rate counter trap not surfaced from VPS Operational Lessons

**Rule:** The conductor read `pm2 list` showing ecodia-api restart count 6483 with uptime 109s, classified as a P1 "restart loop killing every long fork", and dispatched fork_mowkasur_95685e for an RCA. The fork found the brief's premise was STALE: commit d7b8388 had already resolved the loop overnight; `kv_store.auto_restart_last_at` unchanged since 2026-05-08T00:47Z (4h before d7b8388 deployed at 03:59 UTC); zero `auto_restart` incidents post-deploy; `health.restart_loop_detector` reported `loop_detected=false rate=0.0207/min`; current process uptime 22min stable. The "6483" was the LIFETIME restart counter accumulated from the entire history of the process, not a current rate. The 109s uptime was a normal post-deploy state during a healthy session, not a loop. The existing `~/CLAUDE.md` "ecodia-api restart counts: don't care unless accelerating rapidly (9 in 1h = red flag)" line is structurally unsafe because it does not specify HOW to read accelerating rapidly out of `pm2 list` (which only emits the lifetime counter). The new pattern names the rate-probe ladder explicitly.

**Target file:** `~/CLAUDE.md`, "Operational Lessons" / "VPS & Infrastructure" subsection, replace existing first bullet on `ecodia-api restart counts` (which says "9 in 1h = red flag, steady = patches" without specifying how to compute the 1h rate).

**Proposed text change** (replace existing line 774 bullet):

```
- ecodia-api restart counts in `pm2 list` are a LIFETIME counter, not a rate. Before classifying any "restart loop" as P1: probe (a) the uptime column in pm2 list (sustained >5min = no active loop), (b) `kv_store.auto_restart_last_at` updated_at vs NOW (>1h old = no recent restart event), (c) `kv_store.health.restart_loop_detector` (authoritative `loop_detected: bool` + `rate` per minute), (d) PM2 log roll-rate (faster than ~5min cycles = active loop). Lifetime count alone is sunk signal. Doctrine: `~/ecodiaos/patterns/pm2-restart-count-is-lifetime-not-rate.md`.
```

### Gap 1.4 - Blanket-fork on vague bug reports doctrine not surfaced from "Decide, do not ask" subsection

**Rule:** Tate verbatim 12:17 AEST 8 May 2026: "I mean you could just fork a blanket and let it do its own recon, or you could look at the site with tailscale and figure it out, I can't baby feed you this. Codify this too." Trigger context: the conductor reflexively called `AskUserQuestion` ("which page is throwing the error?") in response to a 1-line FE bug report. The pattern: when Tate reports a bug or symptom in a single line without specifying location ("FE is throwing X", "site is broken", "app says undefined.length", "something's off with Y"), the conductor MUST fork blanket recon immediately. NEVER `AskUserQuestion`. NEVER prompt for URL / page / stack trace / repro steps. The fork does its own recon via Tailscale screenshot + DevTools console + git log + source read. The clarification round-trip costs Tate's attention; fork dispatch costs nothing on the margin. A 1-line bug report is a confidence statement ("you have everything you need to diagnose this from where you sit"); asking for clarification fails that confidence. This rule belongs surfaced from the "Decide, do not ask" subsection because the bug-report-shape triggers a clarification reflex distinct from the canonical permission-seeking pattern.

**Target file:** `~/CLAUDE.md`, "Decide, do not ask" subsection in Core Operating Doctrine, append a new bullet to the existing list.

**Proposed insertion** (append as a new bullet after the existing 3 bullets, before the Cross-refs line):

```
- Vague single-line bug report ("FE is throwing X", "site is broken", "undefined.length") = fork blanket recon immediately, do NOT call AskUserQuestion or prompt for URL / page / stack trace. The fork does its own Tailscale screenshot + DevTools + git log recon. Origin: Tate verbatim 12:17 AEST 8 May 2026. Full: `~/ecodiaos/patterns/blanket-fork-when-vague-bug-report-not-clarifying-question.md`.
```

### Gap 1.5 - "Status_board drift audit on main is canonical thin-on-main work for meta-loop" pattern not surfaced

**Rule:** Today's meta-loop fire 15:53 AEST 8 May 2026 produced a Pattern node observation: when the hourly meta-loop fires and either (a) the fork-cap is full OR (b) `mcp__forks__*` tools are disconnected (recurring P3 hourly transport-disconnect symptom, ironically resolved later same day by Gap 1.2's per-query-MCP-factory fix), the conductor should still execute PHASE 2 drift-audit on main rather than stand down or symbolic-log "no work". The drift-audit IS the highest-leverage on-main work in that state because it surfaces stale rows / Tate-blocked clusters / external-blocker freshness without spawning forks. This is a useful narrowing of `continuous-work-conductor-never-idle.md` for the meta-loop specifically. Note: today's neo4j Pattern row exists but no `~/ecodiaos/patterns/<slug>.md` file was authored. Decision required: author the pattern file (Section 5 P2 item) before cross-ref.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Scheduling & Autonomy" / "Core operating loops" subsection, the meta-loop bullet line.

**Proposed text change** (extend the meta-loop bullet from line 813):

```
- **meta-loop** (every 1h): main CEO loop. Orient via status_board, decide highest-leverage, execute, schedule follow-ups. NO TIME LIMIT. When fork-cap is full or `mcp__forks__*` is disconnected, the canonical thin-on-main work is the PHASE 2 status_board drift audit (stale rows, Tate-blocked freshness, external-blocker probe). Doctrine: `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` (P2 to author).
```

---

## Section 2 - Stale items (refs to outdated tooling, removed flags, superseded doctrine)

### Stale 2.1 - Existing "ecodia-api restart counts" bullet in Operational Lessons is structurally unsafe

The line "ecodia-api restart counts: don't care unless accelerating rapidly (9 in 1h = red flag, steady = patches)" at `~/CLAUDE.md` line 774 does not specify HOW to compute "accelerating rapidly" out of `pm2 list`. Today's incident proved that reading `pm2 list` alone produces stale-premise classifications. Replacement text proposed in Gap 1.3.

### Stale 2.2 - "MCP forks transport disconnects on hourly cron fire" recurring symptom is now resolved

The phrasing "recurring P3 hourly transport-disconnect symptom" appears in today's neo4j Pattern observation as still active. The `sdk-mcp-server-instances-must-be-per-query-not-singleton.md` fix shipped in commit 1c7ea11 should resolve it. Verification window: monitor the next 3 hourly cron fires post-restart for clean `mcp__forks__spawn_fork` availability. If clean, archive the recurring P3 row at `kv_store.health.mcp_forks_transport` (if it exists) and any active status_board row noting the symptom. Pattern node body should be updated with `superseded_by` pointer once verified.

### Stale 2.3 - No stale tooling refs found in CLAUDE.md today

Both files cross-checked against today's pattern files. No removed flags / outdated tool names / superseded substrate references identified beyond Stale 2.1 and 2.2 above.

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

### Cross-ref 3.1 - `sdk-musl-vs-glibc-binary-auto-detect-trap.md`

Not currently linked from either CLAUDE.md. Proposed insertion site: Gap 1.1 above (Factory section). Cross-ref also belongs added to the existing "Factory CLI credit/paywall-gated" subsection note about SDK-based forks bypassing Factory CLI, since both touch the same SDK substrate.

### Cross-ref 3.2 - `sdk-mcp-server-instances-must-be-per-query-not-singleton.md`

Not currently linked. Proposed insertion site: Gap 1.2 above (Manager forks subsection). Sibling cross-ref also useful from the existing `listener-pipeline-needs-five-layer-verification.md` reference because the failure shape (wired but dark, fails silently because no layer checks end-to-end) is the same pattern class.

### Cross-ref 3.3 - `pm2-restart-count-is-lifetime-not-rate.md`

Not currently linked. Proposed insertion site: Gap 1.3 above (VPS Operational Lessons). Cross-ref also belongs added to the existing `re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` reference cluster in `~/ecodiaos/CLAUDE.md` Phantom-shipped corollary section, because today's failure mode is a specialisation of stale-health-check-readings.

### Cross-ref 3.4 - `blanket-fork-when-vague-bug-report-not-clarifying-question.md`

Not currently linked. Proposed insertion site: Gap 1.4 above (Decide do not ask subsection). Cross-ref also belongs added to the existing `forks-do-their-own-recon-do-not-probe-on-main.md` reference cluster, since the new pattern is a specialisation.

### Cross-ref 3.5 - `cred-rotation-must-propagate-to-all-consumers.md` is already cross-ref'd

Verified line 427 of `~/ecodiaos/CLAUDE.md` already links the new pattern from the Cross-system rotation discipline subsection. No action needed.

### Cross-ref 3.6 - `judgement-over-rule-when-blind-application-defeats-the-purpose.md` is already cross-ref'd

Verified lines 13-24 of `~/CLAUDE.md` already carry the full doctrine text and cross-refs at top of file. No action needed.

---

## Section 4 - Structural issues (header order, findability, redundancy)

### Structural 4.1 - "Core Operating Doctrine" section is approaching saturation

The Core Operating Doctrine section in `~/CLAUDE.md` now carries 14 sub-doctrines. Today's META rule (Judgement over rule) sits at top correctly. The section is near its useful upper bound for cold-start scanning. NO action this audit, but flag for next month: if it grows to 16+ sub-doctrines, consider splitting into Core (top 8) + Reference (rest).

### Structural 4.2 - "Operational Lessons" / VPS & Infrastructure subsection is becoming mixed

The VPS & Infrastructure bullet list mixes one-time-only events ("Disk at 79% (Apr 13). Top: organism 11G ... ~11G safe cleanup") with durable rules ("Hardcoded absolute paths = non-portable + security risk"). The Apr 13 disk-state line is now ~25 days stale and should either be re-probed OR archived. Cheap P3 to remove or update. Not blocking on this audit.

### Structural 4.3 - SDK substrate doctrine is scattered

SDK-related doctrine is now scattered across: `~/ecodiaos/CLAUDE.md` Factory section ("Factory runs Claude Code CLI in separate process"), DeepSeek-only fallback subsection, and (with this audit) two new SDK-binary + SDK-MCP-server subsections. Worth considering a future P3 consolidation into a "SDK substrate doctrine" subsection that holds all four (Factory CLI, DeepSeek fallback + sanitiser, musl binary trap, MCP server per-query). Not blocking this audit.

---

## Section 5 - Prioritised P1 / P2 / P3 to-do list

### P1 (apply this edit cycle)

- **P1.1** Insert new SDK musl-vs-glibc subsection into `~/ecodiaos/CLAUDE.md` Factory section per Gap 1.1.
- **P1.2** Insert SDK in-process MCP server per-query rule into `~/ecodiaos/CLAUDE.md` Manager forks subsection per Gap 1.2.
- **P1.3** Replace existing `~/CLAUDE.md` line 774 ecodia-api restart counts bullet with the new lifetime-vs-rate text per Gap 1.3.
- **P1.4** Append blanket-fork bullet to `~/CLAUDE.md` "Decide, do not ask" subsection per Gap 1.4.

P1 rationale: all four are operationally important defences that future-me debugging will hit if not surfaced. The SDK musl trap will recur on every npm install; the MCP server per-query rule prevents the manager-fork-sub-spawn regression from re-shipping; the pm2 lifetime-vs-rate rule prevents wrong-premise P1 dispatches; the blanket-fork rule prevents the canonical baby-feed failure mode Tate explicitly named today.

### P2 (apply this edit cycle if time, otherwise next)

- **P2.1** Author `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` as a new pattern file with `triggers:` frontmatter, then add the meta-loop bullet extension per Gap 1.5. The Pattern node already exists in Neo4j from today's meta-loop run; the file does not.
- **P2.2** Add `pm2-restart-count-is-lifetime-not-rate.md` cross-ref into the existing `re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` reference cluster in `~/ecodiaos/CLAUDE.md` Phantom-shipped corollary section per Cross-ref 3.3.
- **P2.3** Add `blanket-fork-when-vague-bug-report-not-clarifying-question.md` cross-ref into the existing `forks-do-their-own-recon-do-not-probe-on-main.md` reference cluster per Cross-ref 3.4.

### P3 (next month, not blocking)

- **P3.1** Verify `sdk-mcp-server-instances-must-be-per-query-not-singleton.md` fix actually closed the recurring "MCP forks transport disconnects on hourly cron fire" symptom (Stale 2.2). If clean for 24h, update the Pattern node body with `superseded_by` pointer.
- **P3.2** Re-probe or archive the Apr 13 disk-state line in `~/CLAUDE.md` Operational Lessons VPS & Infrastructure subsection (Structural 4.2).
- **P3.3** Consider future SDK-substrate-doctrine consolidation in `~/ecodiaos/CLAUDE.md` (Structural 4.1 / 4.3). Not urgent.
- **P3.4** Watch Core Operating Doctrine section size in `~/CLAUDE.md` over the next month. If it crosses 16 sub-doctrines, plan a Core + Reference split (Structural 4.1).

---

End of audit. Edit work routes to status_board for next conductor (main) session via PHASE 2 INSERT. NO em-dashes anywhere in this file (verified).
