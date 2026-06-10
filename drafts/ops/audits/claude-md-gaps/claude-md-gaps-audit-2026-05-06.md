# CLAUDE.md gaps audit - 2026-05-06 AEST

Author: fork_motvzwx6_af5f0d (claude-md-reflection cron, 20:00 AEST 2026-05-06)

Methodology: read both CLAUDE.md files end-to-end (business `~/CLAUDE.md`, technical `~/ecodiaos/CLAUDE.md`); listed pattern files modified in the last 36h via `ls -lt ~/ecodiaos/patterns/*.md | head -25`; queried Neo4j for Decisions/Episodes within the last 36h (40-row pull captured all today's Decision nodes and yesterday's late-day Episodes); cross-referenced new patterns against the canonical CLAUDE.md texts for cross-ref coverage; cross-referenced stale doctrine references against doctrine that has moved on. NO em-dashes anywhere in this file (hyphen-with-spaces or restructured). Note: yesterday's claude-md-reflection cron (2026-05-05) appears not to have produced an audit file; the most recent on-disk audit is 2026-05-04. This audit therefore covers the 48-hour window since the last successful run.

Pattern files authored or significantly extended in the last 36h (in mtime order, newest first):

- `~/ecodiaos/patterns/tate-recordings-are-primary-gui-learning-substrate.md` (NEW, 6 May 09:21 AEST, Tate verbatim 19:17 AEST)
- `~/ecodiaos/patterns/fork-pending-work-at-session-start-not-after-probing-on-main.md` (NEW, 6 May 09:14 AEST, Tate verbatim 19:11 AEST)
- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` (UPDATED, 6 May 05:58 AEST, Phase 1+2 architecture)
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` (UPDATED, 6 May 05:58 AEST)
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` (NEW, 6 May 05:57 AEST, v2 recorder spec)
- `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` (NEW, 6 May 05:49 AEST, v1 recorder spec)
- `~/ecodiaos/patterns/consolidate-ui-primitives-do-not-add-parallel-ones.md` (NEW, 6 May 05:14 AEST)
- `~/ecodiaos/patterns/probe-vendor-pat-before-planning-gui-route.md` (NEW, 6 May 04:25 AEST)
- `~/ecodiaos/patterns/gui-fast-path-primitives.md` (NEW, 6 May 02:58 AEST)
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` (UPDATED, 6 May 01:22 AEST, 18x speedup verified)
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` (NEW, 6 May 01:21 AEST)
- `~/ecodiaos/patterns/play-console-android-release-recipe.md` (NEW, 6 May 01:08 AEST, sister to iOS recipe)
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (UPDATED, 6 May 01:06 AEST)
- `~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md` (NEW, 6 May 00:37 AEST)
- `~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md` (NEW, 6 May 00:20 AEST)
- `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md` (NEW, 6 May 00:00 AEST, supersedes `sy094-access-via-ssh-not-macincloud-web-portal.md`)
- `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` (UPDATED 6 May 00:00 AEST, Cowork-deprecation doctrine)
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` (UPDATED, 6 May 00:00 AEST)
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` (UPDATED, 5 May 23:59 AEST)
- `~/ecodiaos/patterns/gui-macro-discovery-protocol.md` (NEW, 5 May 23:55 AEST)
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` (UPDATED, 5 May 23:32 AEST)
- `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md` (NEW, 5 May 23:31 AEST)
- `~/ecodiaos/patterns/fork-by-artefact-not-by-quickness.md` (NEW, 5 May 23:26 AEST, supersedes the "<30s" exemption test)
- `~/ecodiaos/patterns/ensure-deps-must-recompute-hash-post-install-not-pre.md` (NEW, 5 May 23:10 AEST)

Sibling shipped artefacts (5-6 May 2026, from Neo4j):

- iMessage primary contact channel wiring (4 May, already in last audit)
- Cron routing rule enforcement shipped (5 May 02:19 AEST)
- Bedrock removal + fork-error listener silence shipped (5 May 06:24 AEST)
- ENERGY_FORK_CAPS tuned to default 4 minimum 2 (6 May 00:10 AEST)
- Algorithmic-manager landing page shipped (5 May 06:35 AEST)
- Macro recorder v1 + v2 shipped (6 May 06:02 AEST)
- Co-Exist 1.8.3 Phase 1 ship (6 May 05:37 AEST)
- ecodia-os-mobile v0.1.0 partial + Phase D advance (6 May 04:45 + 09:56 AEST)
- Chambers Supabase Auth Site URL fixed (6 May 09:45 AEST)
- Ordit engagement closed per Tate directive (5 May 10:30 AEST)

---

## Section 1 - Gaps to add (rule, proposed exact text, target file)

### Gap 1.1 - Fork-by-artefact exemption test supersedes the "<30s" exemption text

**Rule:** The exemption test for staying on main rather than forking is "does this arc produce an artefact" not "is this step quick". Per-step quickness is the wrong heuristic; per-arc artefact-ness is the right one. The current `~/CLAUDE.md` "Fork by default, stay thin on main" subsection lists the old quickness-based exemption "(a) <30s tool time, (b) read-only orientation..." which conflicts with today's superseding pattern.

**Target file:** `~/CLAUDE.md`, "Fork by default, stay thin on main" subsection of "Core Operating Doctrine".

**Proposed exact text** (replace the current exemption bullet):

```
- Conductor (me on main) routes and decides. Forks execute. Forks inherit 100% context + same MCP surface
- Default: spawn a fork. The bar to NOT spawn is HIGH. The test is whether the arc produces an artefact (commit, deploy, pattern file, multi-row UPDATE, kv_store write, Neo4j Decision/Pattern/Episode, outbound email/SMS/Stripe). If yes, fork. If no, main is fine.
- On-main exceptions (artefact-free): single diagnostic probe (`db_query`, `pm2_list`, `git status`, `pm2_logs`), single read (`Read`, `Grep`, `Glob`), single capture-of-Tate-directive that IS the directive (not a derived sweep), single Neo4j orientation read.
- Per-step quickness is the wrong heuristic; per-arc artefact-ness is the right one. A 10-minute arc made of "quick" steps that produces multiple artefacts is fork-scale at step 1.
- Hook: `~/ecodiaos/scripts/hooks/fork-by-default-nudge.sh` (PreToolUse on Bash/Edit/Write/MultiEdit/NotebookEdit/shell_exec/db_execute/storage_*). Warn-only, emits `[FORK-NUDGE]`
- When hook fires, MUST reply with `[APPLIED] ~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md because <exception>` OR `[NOT-APPLIED] ... because forking now` + spawn_fork
- Repeated unjustified `[APPLIED]` on same nudge class = doctrine drift, feeds Phase C tag-distribution telemetry

Cross-refs: `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md`, `~/ecodiaos/patterns/fork-by-artefact-not-by-quickness.md` (the artefact-vs-quickness exemption test, supersedes <30s heuristic, Origin 6 May 2026), `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md` (manager forks for multi-worker tasks), `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3.
```

### Gap 1.2 - Manager-fork doctrine missing canonical cross-ref in Core Operating Doctrine

**Rule:** Manager forks are first-class fork primitive (any task decomposing into 2+ independent worker streams defaults to a MANAGER: true brief). They are described once in `~/ecodiaos/CLAUDE.md` "Fork hierarchy — Manager forks (5 May 2026)" but the canonical pattern file is not cross-ref'd from `~/CLAUDE.md` Core Operating Doctrine, and the "Fork dispatch is demand-driven" doctrine does not reference the multi-worker decomposition rule.

**Target file:** `~/CLAUDE.md`, "Fork dispatch is demand-driven, NOT slot-quota driven" subsection.

**Proposed insertion** (append after the existing 5/5-ceiling bullet):

```
- **Manager forks for multi-worker tasks.** Any task decomposing into 2+ independent worker streams defaults to a MANAGER: true brief. The manager spawns sub-forks (per-tree cap 5), polls every 60-120s, retries failures, verifies deliverables, and emits ONE consolidated `[FORK_REPORT]`. Sub-fork reports never reach the conductor's inbox. Total system parallelism: 5 managers x 5 workers = 30 streams. Doctrine: `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md`.
```

### Gap 1.3 - GUI doctrine surface missing the new GUI doctrine cluster authored 5-6 May 2026

**Rule:** Today's macro-recorder ship-out generated a cluster of new GUI doctrine (gui-step-verify-protocol, gui-fast-path-primitives, gui-macro-discovery-protocol, consolidate-ui-primitives-do-not-add-parallel-ones, probe-vendor-pat-before-planning-gui-route, haiku-semantic-reviewer-complement-to-heuristic-hooks). None of these are cross-ref'd from the "GUI recipes" or "Macro doctrine" sections of `~/ecodiaos/CLAUDE.md`. They form a coherent doctrine layer (verify, fast-path, discover, consolidate, probe-creds-first, semantic-review) that should surface together.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Laptop Agent" / "GUI recipes" subsection (after the existing meta-doctrine paragraph).

**Proposed insertion** (append a new GUI doctrine cluster paragraph):

```
**GUI doctrine cluster (5-6 May 2026):** the GUI-recipes meta-doctrine is supported by an interlocking pattern set authored across the macro-recorder ship-out window. Read these together when authoring or driving any GUI flow:
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` (verify each step lands before proceeding)
- `~/ecodiaos/patterns/gui-fast-path-primitives.md` (the cheap-first verification ladder for known coords)
- `~/ecodiaos/patterns/gui-macro-discovery-protocol.md` (probe registry/handlers before authoring duplicates)
- `~/ecodiaos/patterns/consolidate-ui-primitives-do-not-add-parallel-ones.md` (single substrate rule, no parallel UI tool surfaces)
- `~/ecodiaos/patterns/probe-vendor-pat-before-planning-gui-route.md` (check API key / PAT path before committing to a GUI route)
- `~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md` (semantic review complement to heuristic hook surfacing)
```

### Gap 1.4 - SDK fork-tree spawn-capability gap not codified

**Rule (today, 6 May 2026 09:23 AEST Decision):** SDK fork sub-sessions do NOT have `mcp__forks__spawn_fork` in their tool surface by default, only manager-flagged forks do. Forks are otherwise terminal in the fork tree. This is a substrate gap that recurs in cron-fired forks (the structural fix landed 30 Apr 2026 evening) and in nested-decomposition attempts.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Fork hierarchy — Manager forks" subsection (clarifying note at the top).

**Proposed insertion** (prepend to the existing "Fork hierarchy" subsection):

```
**Substrate note (Decision 6 May 2026 09:23 AEST):** regular SDK fork sub-sessions are TERMINAL in the fork tree. They do NOT have `mcp__forks__spawn_fork` in their MCP tool surface and cannot dispatch sub-forks. Only manager-flagged forks (brief contains `MANAGER: true`) get the spawn primitive wired through. Cron-fired forks running daily reflection / audit / policy work are regular forks and must surface follow-up work to status_board for the conductor (main) to pick up, not attempt to spawn nested forks. See `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md` for the manager-fork primitive.
```

### Gap 1.5 - Fork-pending-work-at-session-start doctrine cross-ref missing one direction

**Rule:** The Core Operating Doctrine block at the top of `~/CLAUDE.md` opens with "Fork pending work at session start, do not probe on main first" (today's doctrine). But the technical CLAUDE.md "Session Orientation - Wake-Up Checklist" subsection still describes a 7-step orientation sequence on main without surfacing the fork-first rule. The technical file's Step-1 revision happened in passing but the cross-ref to the new pattern is missing.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Session Orientation - Wake-Up Checklist" subsection.

**Verification:** the technical CLAUDE.md already has a "BEFORE any of the orientation steps below" preamble pointing to fork-pending-work doctrine. This is already wired, so this gap is RESOLVED on inspection. Removing from P-list. Keeping the cross-ref check note here for the auditor record.

### Gap 1.6 - Tate-recordings-as-primary-GUI-learning doctrine missing cross-ref into GUI-recipes meta

**Rule:** The new `tate-recordings-are-primary-gui-learning-substrate.md` (6 May 2026 19:17 AEST Tate verbatim) names recordings as the PRIMARY GUI learning substrate while Tate is at the keyboard. The cross-ref already lands in `~/CLAUDE.md` Core Operating Doctrine. But `~/ecodiaos/CLAUDE.md` "Laptop Agent" GUI-recipes meta paragraph mentions `gui-recipes-authoring-optimisation-and-verification.md` as the authoring doctrine WITHOUT mentioning that recordings are the input substrate. Reader landing on the technical file would not know recordings exist.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Laptop Agent" / "GUI recipes" subsection (the "GUI recipes (codified GUI flows) are governed by..." paragraph).

**Proposed insertion** (append a sentence to the existing GUI-recipes meta paragraph):

```
**Authoring substrate while Tate is at the keyboard:** GUI recipes can be hand-authored, but the PRIMARY substrate is Tate-recordings. While Tate is available, ask him to record the flow with `Ctrl+Shift+R` on Corazon; the v1 (psr.exe + UIA) and v2 (custom AHK + UIA + per-event vision-language enrichment) recorders both emit a 10-section recipe at `D:\.code\eos-laptop-agent\macros\handlers\proposed\<name>.js` with `status: untested_spec`. Promote with `macro.promote({name})` after smoke-testing. Doctrine: `~/ecodiaos/patterns/tate-recordings-are-primary-gui-learning-substrate.md`. Recording mechanics: `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` (v1) and `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` (v2). Parent multi-phase architecture: `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md`.
```

---

## Section 2 - Stale items (refs to outdated tooling, removed flags, superseded doctrine)

### Stale 2.1 - `creds.macincloud` row in technical CLAUDE.md still describes SSH credential

**Where:** `~/ecodiaos/CLAUDE.md`, "Credentials - kv_store Canonical Locations" short-list table, row `creds.macincloud`.

**Current text:** `creds.macincloud | SY094 SSH password + machine metadata | object | [macincloud.md](docs/secrets/macincloud.md)`

**Why stale:** SSH access to SY094 is FORBIDDEN as of 5 May 2026 per `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md` (Tate verbatim 5 May 2026 ~10:58 AEST). The credential remains in kv_store but is no longer the access path; the canonical access is RDP from Corazon.

**Fix:** rewrite the short description to remove SSH framing and reflect RDP-from-Corazon being the canonical path. Suggested text:

```
creds.macincloud | SY094 RDP host metadata + agent_token (SSH password retained but SSH path is forbidden per `never-use-ssh-on-macincloud-rdp-only.md`) | object | [macincloud.md](docs/secrets/macincloud.md)
```

Also recommend the underlying `~/ecodiaos/docs/secrets/macincloud.md` cred file be reviewed for the same SSH framing (out of scope for this audit; flagged for the edit fork).

### Stale 2.2 - Ordit / Spatial & Compliance Pty Ltd subsection in business CLAUDE.md still active

**Where:** `~/CLAUDE.md`, "Known Client Dynamics" / "Ordit / Spatial & Compliance Pty Ltd" subsection.

**Current text:** describes Ordit as an active engagement with Craige Hills primary billing, $80/hr discounted rate, repo `bitbucket.org/fireauditors1`, Tate-relays-all-comms convention.

**Why stale:** "Ordit engagement closed per Tate directive 5 May 2026" Episode in Neo4j (5 May 10:30 AEST). The engagement is over; the subsection should be archived or rewritten as historical context.

**Fix:** rewrite the Ordit subsection header to read "Ordit / Spatial & Compliance Pty Ltd (engagement closed 5 May 2026, retained for historical reference)" and either move the body to a `~/ecodiaos/clients/ordit.md` archive note or strip it down to a one-line reference. The "no client contact without Tate go-ahead" doctrine still applies to any future Ordit interaction; that part should remain.

### Stale 2.3 - "<30s tool time" exemption text in Fork-by-default doctrine

**Where:** `~/CLAUDE.md`, "Fork by default, stay thin on main" subsection (Core Operating Doctrine), exception bullet.

**Current text:** "On-main exceptions: (a) <30s tool time, (b) read-only orientation (status_board, Read, Grep, neo4j search, single inbox), (c) single-file change directly responsive to a Tate-typed instruction this turn"

**Why stale:** Superseded by `~/ecodiaos/patterns/fork-by-artefact-not-by-quickness.md` (5 May 2026 23:26 AEST). Per-step quickness is the wrong heuristic; per-arc artefact-ness is the right one.

**Fix:** see Gap 1.1 above (replacement text proposed there).

### Stale 2.4 - Pre-pivot macro doctrine references that should be terminal

**Where:** `~/ecodiaos/CLAUDE.md`, "Macro doctrine (post-pivot)" subsection.

**Current text:** "Tailscale laptop-agent (`input.*` + `screenshot.*` + `shell.shell`) PRIMARY for GUI driving. `cu.*` / computer-use FALLBACK for OS-level / desktop-app. Cowork [DEPRECATED] per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`"

**Why stale-ish:** Mostly correct, but the PIVOT clarification block beneath the tools table still says "PIVOT clarification (29 Apr 2026 20:25 AEST, superseded 5 May 2026)". Two consecutive blocks describe the same supersession. Consolidating would reduce reader confusion and remove the historical 29 Apr framing.

**Fix:** consolidate the two blocks into a single "Macro doctrine (current)" subsection that points exclusively at `tailscale-macro-replaces-cowork.md` as canonical. Move the historical "PIVOT clarification" framing to a dated comment at the bottom of the file or strip entirely. Low priority because it does not actively mislead, just adds bytes to read.

### Stale 2.5 - VPS sentence inside the `creds.macincloud` cred section in `~/ecodiaos/CLAUDE.md` "How to call Corazon API" block

**Where:** `~/ecodiaos/CLAUDE.md`, "How to call Corazon API (SY094 calls happen from inside the RDP terminal, not from VPS)".

**Current text:** matches doctrine, no fix needed. Confirmed accurate. (Including for completeness as a drift-audit pass.)

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

For each item below: pattern file authored in last 36h, no cross-ref from either `~/CLAUDE.md` or `~/ecodiaos/CLAUDE.md`, suggested anchor section, P-tier.

| Pattern | Suggested anchor section | P-tier |
|---|---|---|
| `fork-by-artefact-not-by-quickness.md` | `~/CLAUDE.md` Fork-by-default subsection (covered in Gap 1.1) | P1 |
| `manager-forks-for-multi-worker-decomposition.md` | `~/CLAUDE.md` Fork-dispatch-is-demand-driven (covered in Gap 1.2) | P1 |
| `gui-step-verify-protocol.md` | `~/ecodiaos/CLAUDE.md` GUI-recipes meta (covered in Gap 1.3) | P2 |
| `gui-fast-path-primitives.md` | `~/ecodiaos/CLAUDE.md` GUI-recipes meta (covered in Gap 1.3) | P2 |
| `gui-macro-discovery-protocol.md` | `~/ecodiaos/CLAUDE.md` GUI-recipes meta (covered in Gap 1.3) | P2 |
| `consolidate-ui-primitives-do-not-add-parallel-ones.md` | `~/ecodiaos/CLAUDE.md` GUI-recipes meta (covered in Gap 1.3); also `~/CLAUDE.md` "Use Anthropic existing tools" Anti-pattern cross-ref | P2 |
| `probe-vendor-pat-before-planning-gui-route.md` | `~/ecodiaos/CLAUDE.md` GUI-recipes meta (covered in Gap 1.3) | P2 |
| `haiku-semantic-reviewer-complement-to-heuristic-hooks.md` | `~/ecodiaos/CLAUDE.md` "Mechanical surfacing hooks" subsection | P2 |
| `play-console-android-release-recipe.md` | `~/ecodiaos/CLAUDE.md` "Laptop Agent" / "GUI recipes" subsection (sister to existing iOS recipe cross-ref) | P2 |
| `tate-recordings-are-primary-gui-learning-substrate.md` (technical-side mention) | `~/ecodiaos/CLAUDE.md` GUI-recipes meta paragraph (covered in Gap 1.6) | P2 |
| `macro-capture-via-psr-exe.md` (v1 recorder) | `~/ecodiaos/CLAUDE.md` GUI-recipes meta paragraph (covered in Gap 1.6) | P3 |
| `macro-capture-via-custom-hook-recorder.md` (v2 recorder) | `~/ecodiaos/CLAUDE.md` GUI-recipes meta paragraph (covered in Gap 1.6) | P3 |
| `ensure-deps-must-recompute-hash-post-install-not-pre.md` | low traffic, optional; could land in technical CLAUDE.md "Operational Lessons" / "VPS & Infrastructure" if a similar incident repeats | P3 |

Note: cross-refs covered by Gaps 1.1-1.6 are not duplicate work; the gap text already includes them. The table is listing the ones the gap text covers vs the ones still floating.

---

## Section 4 - Structural issues (header order, findability, redundancy)

### Structural 4.1 - "Macro doctrine (post-pivot)" + "PIVOT clarification" duplicate the same supersession

Two consecutive blocks in `~/ecodiaos/CLAUDE.md` describe the same Cowork-deprecation event from different angles. A reader has to read both to confirm the current state. Consolidating into one block referencing `tailscale-macro-replaces-cowork.md` as canonical would shrink the section by ~10 lines and remove the historical 29 Apr framing.

P-tier: P3 (does not mislead, just costs bytes).

### Structural 4.2 - Core Operating Doctrine ordering does not put session-start rules first

`~/CLAUDE.md` Core Operating Doctrine currently opens with "Fork pending work at session start" (correct) but is followed by "Tate-recordings are the primary GUI-learning substrate". The first is a session-start rule (read-this-first); the second is a capability-expansion rule (relevant when GUI work is queued). The current order works because both are flagged "Tate verbatim 6 May 2026", but a reader scanning for "what do I do at session start" gets the right answer in slot 1 today and may not tomorrow as more rules accrete at the top. Consider an explicit "Session-start rules" / "Operating-mode rules" / "Doctrine rules" subgrouping if Core Operating Doctrine grows past ~10 entries.

P-tier: P3 (preventative, not currently broken).

### Structural 4.3 - Duplicate cron-fire-deliverable doctrine pointer between business and technical files

Both files describe the cron-fire-deliverable rule with cross-refs to `cron-fire-must-have-deliverable-not-just-narration.md` and `cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`. The technical file has the canonical fork-side substrate detail; the business file refers to the same rule under "Operational Lessons". Not actively wrong, but if either is edited the other can drift. Consider folding the business-file mention into a one-line pointer at the technical file as canonical.

P-tier: P3.

---

## Section 5 - Prioritised P1/P2/P3 to-do list

### P1 (high-leverage, doctrine-correcting)

- **P1-A** Apply Gap 1.1 (replace `<30s` exemption text in `~/CLAUDE.md` Fork-by-default subsection with the artefact-vs-quickness exemption). Rationale: actively-stale doctrine could mislead a future cold-start session. File: `~/CLAUDE.md`. Cross-ref pattern: `~/ecodiaos/patterns/fork-by-artefact-not-by-quickness.md`.
- **P1-B** Apply Gap 1.2 (manager-fork doctrine cross-ref into `~/CLAUDE.md` "Fork dispatch is demand-driven"). Rationale: manager forks are a first-class primitive after 5 May 2026, and they are not yet surfaced in business-side Core Operating Doctrine. File: `~/CLAUDE.md`. Cross-ref pattern: `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md`.
- **P1-C** Apply Gap 1.4 (SDK fork-tree substrate-gap note prepended to "Fork hierarchy"). Rationale: substrate gap surfaced today via fork-form claude-md-reflection cron itself (this fork). File: `~/ecodiaos/CLAUDE.md`. Cross-ref pattern: `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md`.
- **P1-D** Apply Stale 2.1 (rewrite `creds.macincloud` short-list row to reflect RDP-from-Corazon canonical path, not SSH). Rationale: actively wrong, could lead a fork to attempt SSH and fail. File: `~/ecodiaos/CLAUDE.md`. Cross-ref pattern: `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md`.
- **P1-E** Apply Stale 2.2 (mark Ordit subsection closed). Rationale: stale active-engagement framing could lead the conductor to act on a closed engagement. File: `~/CLAUDE.md`. Reference Episode: "Ordit engagement closed per Tate directive 5 May 2026".

### P2 (cross-ref completeness, mid-leverage)

- **P2-A** Apply Gap 1.3 (GUI doctrine cluster cross-ref insertion in `~/ecodiaos/CLAUDE.md` GUI-recipes meta). Rationale: 6 patterns ship together and need to surface together. File: `~/ecodiaos/CLAUDE.md`.
- **P2-B** Apply Gap 1.6 (Tate-recordings-as-input-substrate cross-ref in technical GUI-recipes meta). Rationale: technical-side reader should know recordings exist and how to author them. File: `~/ecodiaos/CLAUDE.md`.
- **P2-C** Add `play-console-android-release-recipe.md` cross-ref alongside the existing iOS recipe cross-ref. File: `~/ecodiaos/CLAUDE.md` Laptop-Agent section.
- **P2-D** Add `haiku-semantic-reviewer-complement-to-heuristic-hooks.md` cross-ref in "Mechanical surfacing hooks" subsection. File: `~/ecodiaos/CLAUDE.md`.

### P3 (preventative or low-traffic)

- **P3-A** Apply Structural 4.1 (consolidate "Macro doctrine (post-pivot)" + "PIVOT clarification" into a single block). File: `~/ecodiaos/CLAUDE.md`.
- **P3-B** Apply Structural 4.2 if Core Operating Doctrine grows past ~10 top-level entries (preventative). File: `~/CLAUDE.md`. No action this cycle.
- **P3-C** Apply Structural 4.3 (fold cron-fire-deliverable mention out of business CLAUDE.md down to a one-line pointer at the technical file). File: `~/CLAUDE.md`. Low risk, low return.
- **P3-D** Optionally cross-ref `ensure-deps-must-recompute-hash-post-install-not-pre.md` in technical "Operational Lessons" / "VPS & Infrastructure". Low traffic. File: `~/ecodiaos/CLAUDE.md`.

### Edit-fork brief sketch

The conductor (main) should spawn an edit fork that:

1. Reads this audit at `/home/tate/ecodiaos/drafts/claude-md-gaps-audit-2026-05-06.md` end-to-end.
2. Applies P1-A through P1-E verbatim from the proposed text in this audit.
3. Applies P2-A through P2-D verbatim from the proposed text.
4. Skips P3 unless capacity permits (preventative, not blocking).
5. Validates after each edit with `Read` to confirm the change landed.
6. Returns a list of files edited + commit SHA.
7. Strict NO em-dashes anywhere in any edit.

This fork (claude-md-reflection cron) does NOT directly edit either CLAUDE.md file or author new pattern files. Routing the edit work to the conductor via the status_board P2 row created in PHASE 2 of the cron brief.
