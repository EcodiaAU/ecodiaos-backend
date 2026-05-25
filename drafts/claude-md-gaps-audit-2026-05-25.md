# CLAUDE.md gaps audit - 2026-05-25 AEST

Author: claude-md-reflection Routine (cloud-clone fire, 25 May 2026, branch claude/gifted-heisenberg-JBglL).

Methodology: read the connected-repo CLAUDE.md (root, 105KB, technical doctrine) end to end; mined the 36h Neo4j Episode/Decision/Reflection window for directives (24 results, cypher mode via ecodia-full after ecodia-core token-expiry, route-to-sibling per the freshly codified rule); listed pattern files changed in the last 3 days of git history; probed disk for every Neo4j-claimed pattern to reconcile the filesystem-vs-git seam (per yesterday's reflection lesson: an Episode claiming a pattern was authored is NOT evidence the pattern is in git); grepped CLAUDE.md for each gap term to confirm zero existing coverage before flagging. The business-doctrine `~/CLAUDE.md` is NOT in this clone and is surfaced as a separate item in section 5. No em-dashes anywhere in this file.

This Routine does the AUDIT only. The local conductor (Corazon, full VPS filesystem + write scope) picks up the edit work from the status_board row, applies the section-1 proposed text verbatim, confirms each cross-referenced pattern is on its disk, and returns a commit SHA.

---

## Filesystem-vs-git seam (read this before applying cross-refs)

8 of 13 Neo4j-claimed recent patterns are ABSENT from this cloud clone AND from origin/main (this branch is 0 behind / 11 ahead of origin/main). They were authored on the VPS filesystem or on unmerged feature branches (e.g. claude/blissful-fermat-MBJG5 commit d16244c, not fetched here):

- ABSENT here: `asc-internal-beta-group-must-be-created-via-dashboard-not-api.md`, `mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md`, `stop-rationalising-when-symptom-persists-re-probe-reality.md`, `research-depth-before-narration-three-probes-minimum.md`, `laptop-agent-helper-not-inline-token-load.md`, `meta-audit-is-the-highest-leverage-primitive-tier-1-and-tier-2.md`, `new-patterns-require-how-to-apply-and-anti-patterns-sections.md`, `play-console-app-record-create-recipe.md`
- ON DISK here: `capacitor-ios-build-needs-env-production-on-disk-2026-05-24.md`, `ship-ios-py-must-self-bootstrap-path-and-keychain-over-ssh.md`, `tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md`, `altool-upload-does-not-attach-to-testflight-beta-group-2026-05-24.md`, `chambers-ios-headless-ship-recipe.md`

This clone holds 324 active pattern files; Neo4j reports 350 active. The conductor most likely HAS the absent files on its own disk, so the cross-ref items below are still applicable, but the conductor MUST `ls` each referenced pattern before adding the cross-ref. If a referenced pattern is missing on the conductor's disk too, re-author from the Neo4j Episode body rather than cross-ref a phantom. This is the third audit in a fortnight to hit this seam; section 5 carries a P3 reconciliation sweep.

---

## Section 1 - Gaps to add

### Gap 1.1 (P1) - System Access section still describes the dead 8-server monolith; no domain-scoped connector, token-expiry routing, or bearer write-scope doctrine

**Rule:** The live MCP access layer is domain-scoped connectors (`ecodia-core`, `ecodia-scheduler`, and the wide `ecodia-full` alias) over the SAME Postgres status_board + kv_store and the SAME Neo4j graph. A connector returning "requires re-authorization (token expired)" is a per-connector OAuth lapse in the access path, NOT a substrate outage; the fix is to route to a sibling connector that reaches the same substrate. Write-scope is also part of the operating model: the cowork bearer can only write kv_store keys under `cowork.*` / `cowork-session.*` (a `ceo.*` write returns `scope_denied`), and `status_board_upsert` cannot insert or flip `entity_type=legal|infrastructure` rows.

**Evidence:** This single fact was independently re-derived 5+ times in the 24 May window alone (meta-loop 15:13 / 16:07 / 17:05, parallel-builder, self-evolution, kg-consolidation), a pattern was authored for it, and yesterday's claude-md-reflection Episode explicitly flagged that "CLAUDE.md's whole System Access section still describes the pre-migration 8-server monolith with zero reference to domain-scoped connectors or the route-to-sibling-substrate rule." This Routine hit it live again at orientation (ecodia-core token-expired, rerouted to ecodia-full, ran clean). Grep of CLAUDE.md confirms zero hits for `ecodia-core`, `ecodia-full`, `ecodia-scheduler`, `domain-scoped`, `scope_denied`, `mcp-connector-token-expiry`. A recurring-rediscovery of one operational fact is a CLAUDE.md-gap signal, not a per-fire annoyance.

**Target file:** CLAUDE.md - "System Access - MCP Tools" section, inserted immediately after the `## System Access - MCP Tools` heading and before the existing "8 MCP servers. These are your hands." line.

**Proposed insertion (apply verbatim):**

```
### Connectors are domain-scoped, not an 8-server monolith (route-to-sibling on token-expiry)

The "8 MCP servers" description below is the pre-migration shape. The live access layer is domain-scoped connectors over the SAME substrates: `ecodia-core` (status_board, kv_store, neo4j, email, scheduler trio; cowork-scoped writes), `ecodia-scheduler`, and the wide `ecodia-full` alias. All of them read and write the SAME Postgres status_board + kv_store and the SAME Neo4j graph. A connector returning "requires re-authorization (token expired)" is a per-connector OAuth lapse in the ACCESS PATH, not a substrate outage.

- Route around: switch to a sibling connector that reaches the same substrate. `ecodia-full` is the canonical fallback until its 2026-06-14 sunset.
- Do NOT re-derive this workaround every fire, and do NOT classify a single connector token-expiry as a system outage.
- Escalate the claude.ai re-auth ONCE on a single status_board infra row next_action_by=tate, never per-Routine.

Write-scope is part of the operating model. The cowork-scoped bearer can only write `kv_store` keys under `cowork.*` / `cowork-session.*` (a `ceo.*` write returns `scope_denied`), and `status_board_upsert` cannot insert or flip `entity_type=legal|infrastructure` rows (and `archived_at` is locked). Routines that need a `ceo.*` pointer write to the `cowork.*` mirror and surface the canonical write to the local conductor.

Full: `~/ecodiaos/patterns/mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md`, `~/ecodiaos/patterns/domain-scoped-mcp-connectors-not-monolith-2026-05-15.md`.
```

(Conductor note: confirm `mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md` is on the VPS disk; it is absent from this clone. If absent on VPS too, re-author from the self-evolution 24 May 17:10 Episode body before adding the cross-ref.)

---

### Gap 1.2 (P1) - PDF is now the canonical internal-doc deliverable; CLAUDE.md still says the .md/.html auto-preview tab is the live render target

**Rule:** For Ecodia INTERNAL documents (specs, memos, reports for Tate), the canonical render target pivoted to PDF on 24 May 2026 (Tate verbatim, status_board row 03b7a63a). HTML is the source-of-truth at `backend/brand/ecodia-doc-template.html`; the deliverable is produced by `bash backend/scripts/render-pdf <file.html>`. CLAUDE.md's "Frontend UI" / "Auto-preview on Write" section currently states the `.md` / `.html` auto-preview tab is "the live render target" and the behavioural rule is to write `.md`/`.html` to disk instead of pasting content. That is now superseded for polished internal deliverables.

**Evidence:** Decision node "PDF is the canonical Ecodia internal-doc deliverable, HTML stays as source - shipped 2026-05-24". Grep of CLAUDE.md confirms zero hits for `render-pdf`, `ecodia-doc-template`, `PDF is the canonical`.

**Target file:** CLAUDE.md - "Auto-preview on Write (Corazon IDEs, shipped 16 May 2026)" sub-section, inserted as a new sub-section immediately ABOVE it.

**Proposed insertion (apply verbatim):**

```
### PDF is the canonical internal-doc deliverable (24 May 2026)

For Ecodia INTERNAL documents (specs, memos, reports for Tate), the canonical render target is now PDF, not the .md/.html auto-preview tab. HTML is the source-of-truth, authored against `backend/brand/ecodia-doc-template.html` (screen styles for IDE preview plus an `@media print` / `@page` block for paper). Produce the deliverable with `bash backend/scripts/render-pdf <file.html>`, which drives `html-to-pdf.js` (puppeteer + system Chrome, A4, light-scheme forced, `document.fonts.ready` awaited, `preferCSSPageSize=true`) and `pdf-visual-check.js` (A4-sliced PNGs for in-IDE eyeballing). Aesthetic doctrine: `backend/brand/ecodia-doc-aesthetic.md`; surfacing hook `~/.claude/hooks/ecodia/ecodia-doc-aesthetic-surface.py`.

The `.md` / `.html` auto-preview substrate below stays valid for quick rich content, but a polished internal deliverable ships as a rendered PDF. Origin: Tate verbatim 24 May 2026, status_board row 03b7a63a.
```

---

## Section 2 - Stale items

### Stale 2.1 (P2) - "Core operating loops" lists parallel-builder as live, but it fires against a dead substrate

The "Core operating loops" section reads:

> - **parallel-builder** (every 2h): orchestrate Factory sessions. Always have code work queued. Review completions. Dispatch new

The deprecations table at the top of CLAUDE.md (2026-05-17) already marks the SDK-fork primitive and Factory CLI dead. The loops list was never reconciled with it. parallel-builder has now fired 13+ consecutive zero-artefact halt cycles (Episodes "parallel-builder cycle-8 ... cycle-13", 25 May), each one re-escalating that the substrate is dead. status_board P1 row 28a5ed76 asks Tate to pause/delete it; P2 parent 5f61db6b tracks the root cause. The loops list actively misdescribes a dead cron, which is what keeps the halt cycles generating noise.

**Proposed replacement (apply verbatim):**

```
- **parallel-builder** (every 2h): DEAD SUBSTRATE as of 2026-05-17. This cron orchestrated SDK-fork / Factory code work, both retired in the local-first migration (see the deprecations table at the top of this file). It has fired 13+ consecutive zero-artefact halt cycles against the dead substrate. Pending hard-deletion from `os_scheduled_tasks` (status_board P1 row 28a5ed76) or replacement with the dispatch-worker / fresh-CC-chat-tab mechanic. Do NOT treat its halt Episodes as failures; the cron itself is the defect.
```

### Stale 2.2 (P3) - System Access "8 MCP servers" tool inventory predates the connector migration

Covered structurally by Gap 1.1. Beyond the inserted note, the detailed per-server tool tables (google-workspace 34, github 18, crm 14, supabase 8, stripe 13, bookkeeping 18, scheduler 8, neo4j 6, vps 4, business-tools 15) are written against the monolith. They are not wrong about which tools exist, but the framing ("8 MCP servers") is stale. P3 because the inserted Gap 1.1 note neutralises the misleading framing without requiring a full rewrite of the inventory this cycle.

---

## Section 3 - Missing cross-references

(Each item below: conductor confirms the pattern is on its disk before adding the cross-ref. All are ABSENT from this cloud clone per the seam note above.)

### XRef 3.1 (P2) - asc-internal-beta-group-must-be-created-via-dashboard-not-api.md not linked from the iOS release pipeline cluster

Authored today (self-evolution 25 May 18:40, branch claude/blissful-fermat-MBJG5 commit d16244c). The rule: an ASC internal TestFlight beta group MUST be created via the App Store Connect dashboard, not via `POST /v1/betaGroups {isInternalGroup:true}`, because the API call silently creates an EXTERNAL group, and `betaTesterInvitation` then cross-associates the Apple ID. The same self-evolution fire corrected a LIVE contradiction in `new-capacitor-app-web-to-testflight-from-scratch-2026-05-21.md` step 8.1. CLAUDE.md's "iOS release pipeline cluster" sub-section lists the four sister recipes but has no cross-ref to this dashboard-only exception.

**Target:** CLAUDE.md - "iOS release pipeline cluster (7 May 2026)" sub-section. Append a bullet pointing to the pattern once the conductor confirms it on disk (it landed on an unmerged branch, so it may need merging or re-authoring first).

### XRef 3.2 (P3) - meta-audit 0th-class primitive + pattern-skeleton not linked from the pattern-authoring doctrine

Two meta-patterns shipped 24 May (`meta-audit-is-the-highest-leverage-primitive-tier-1-and-tier-2.md`, `new-patterns-require-how-to-apply-and-anti-patterns-sections.md`), plus `backend/brand/pattern-skeleton.md` (the canonical new-pattern starting point) and `backend/scripts/mining/meta-audit` (two-tier cadence wrapper). CLAUDE.md's "Authoring new patterns" guidance does not mention the skeleton or the meta-audit cadence. P3: a single cross-ref line in the "Authoring new patterns" block pointing to the skeleton and the meta-audit cadence would close it.

### XRef 3.3 (P3) - session-corpus-mining patterns (stop-rationalising, research-depth-before-narration, laptop-agent-helper) not in CLAUDE.md

Top-3 codifications from the 24 May session-corpus mining arc (343 transcripts, 147k events). `laptop-agent-helper-not-inline-token-load.md` ships as a full triad (pattern + helper + PreToolUse hook) and closes the single highest-frequency wasted-cycle cluster (150+ inline token-loads), so the Laptop Agent section of CLAUDE.md is a candidate home for that one specifically. The other two are general operating doctrine. P3: borderline for CLAUDE.md vs living in the pattern corpus; the laptop-agent-helper triad is the strongest candidate for an explicit Laptop Agent section cross-ref.

---

## Section 4 - Structural issues

### Structural 4.1 (P2) - deprecations table and "Core operating loops" disagree about parallel-builder

The top-of-file deprecations table says SDK forks / Factory are dead; the "Scheduling & Autonomy" loops list still presents parallel-builder as a live Factory-orchestration loop. Two parts of the same file disagree. Covered by Stale 2.1. The same risk exists for any other loop in that list that depended on the SDK-fork or Factory substrate (deep-research, self-evolution, parallel-builder all reference forks). The conductor should sanity-check the full loops list against the deprecations table while applying Stale 2.1, not just the one bullet.

### Structural 4.2 (P3) - System Access section is the largest stale surface in the file

The connector migration (mid-May) touched the single most-referenced operational section (MCP tools = "your hands") and it has not been reconciled. Gap 1.1 inserts a corrective note at the top; a fuller rewrite of the per-server inventory into a per-connector inventory is a larger P3 follow-up, not this cycle's edit.

---

## Section 5 - Prioritised P1/P2/P3 to-do list

### P1 (conductor applies both verbatim this cycle)

- **P1-A** - Insert the domain-scoped-connector + token-expiry-routing + bearer-write-scope note into CLAUDE.md "System Access - MCP Tools" (Gap 1.1). Rationale: one operational fact re-derived 5+ times in a single day, flagged by yesterday's reflection, hit live by this Routine; the section it belongs in is the most-referenced in the file. Confirm `mcp-connector-token-expiry-...md` on VPS disk first (absent here); re-author from the 24 May 17:10 self-evolution Episode if absent on VPS too. Edit method: `Edit` on CLAUDE.md.
- **P1-B** - Insert the PDF-canonical-internal-doc note above "Auto-preview on Write" (Gap 1.2). Rationale: Tate verbatim directive 24 May that reverses the current "auto-preview tab is the live render target" doctrine; leaving both makes the file self-contradicting on the deliverable substrate. Edit method: `Edit` on CLAUDE.md.

### P2 (cheap, apply this cycle if time allows)

- **P2-A** - Replace the parallel-builder bullet in "Core operating loops" with the dead-substrate version (Stale 2.1). Rationale: the live framing is what keeps the cron generating halt-cycle noise; reconciles the loops list with the top deprecations table. Edit method: `Edit` on CLAUDE.md. While here, sanity-check the rest of the loops list against the deprecations table (Structural 4.1).
- **P2-B** - Add the asc-internal-beta-group dashboard-not-API cross-ref to the iOS release pipeline cluster (XRef 3.1). Rationale: authored today, corrects a live recipe contradiction that would misfire on the next app ship. Gated on confirming the pattern is on the conductor's disk (landed on an unmerged branch); merge or re-author first, then cross-ref.

### P3 (defer; surface only)

- **P3-A** - Cross-ref the meta-audit cadence + pattern-skeleton from "Authoring new patterns" (XRef 3.2).
- **P3-B** - Cross-ref the laptop-agent-helper triad from the Laptop Agent section; consider stop-rationalising and research-depth-before-narration for the corpus only (XRef 3.3).
- **P3-C** - Filesystem-vs-git reconciliation sweep: 8 Neo4j-claimed patterns are absent from this clone and origin/main (seam note above); confirm which exist on the VPS, merge or push the unmerged feature-branch patterns (e.g. claude/blissful-fermat-MBJG5) into a reachable ref, and re-author any that exist only as Episode claims. Third audit in a fortnight to hit this seam.
- **P3-D** - Informational, no CLAUDE.md edit: decision-quality telemetry (surface/dispatch/outcome event tables) dark since 14 May (11 days), application_event since 12 May; pattern_fire_event is ALIVE (38 fires), isolating the fault to the dispatch/surface/application/outcome JSONL-bridge chain. Tracked on status_board P2 infra row 7b51b738; needs VPS shell which the cowork bearer lacks.
- **P3-E** - Business-doctrine `~/CLAUDE.md` (Tate-laptop-only, not in this clone) was NOT audited this cycle. The local conductor should run the same gap audit against `~/CLAUDE.md` since it has filesystem access to it.
