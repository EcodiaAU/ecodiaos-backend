# CLAUDE.md Gap Audit - 2026-04-30

**Audit fork:** fork_mokosrzg_d2dd23
**Brief origin:** Tate, 09:25 AEST 30 Apr 2026 verbatim: "Bro.... what the fuck is happening with the forks.... come on, get integrated with co work. Why are you so bad at actually finishing tasks nwo and what is all this polution in our chat stream about appleid and not applied patterns,"
**Files audited:** `~/CLAUDE.md` (business, ~1100 lines), `~/ecodiaos/CLAUDE.md` (technical, ~620 lines)
**Evidence base:**
- `os_conversation` turns 14776-14896 (08:51-09:25 AEST 30 Apr 2026)
- Neo4j Episodes/Patterns/Decisions last 30h (40 hits)
- `status_board` rows last_touched < 36h (40 rows)
- `kv_store` keys: `ceo.day_plan_2026-04-30`, `cowork.deep_integration.queue`, `session.handoff_state`
- Pattern files at `~/ecodiaos/patterns/` (106 files)
- Source at `src/services/osSessionService.js:1532-1732` (continuity-block stitching)
- Source at `src/services/doctrineSurface.js`, `src/services/schedulerPollerService.js`
- Prior audit: `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-29.md`

This is the 30 Apr 2026 audit half of the audit-then-edit two-fork pipeline (the 29 Apr audit was the first attempt). The brief explicitly forbids editing CLAUDE.md - that is the EDIT fork's job.

---

## Section 1: Gaps - rules surfaced not yet codified

### P1.1 Chat-stream pollution: continuity blocks bleed into Tate's UI (CRITICAL, NEW, surfaced 09:25 AEST 30 Apr)

**Evidence:** `os_conversation` row turn=14896 (09:25 AEST 30 Apr 2026, role=user). Tate's literal user message is:

> "Bro.... what the fuck is happening with the forks.... come on, get integrated with co work. Why are you so bad at actually finishing tasks nwo and what is all this polution in our chat stream about appleid and not applied patterns,"

The user-message content stored in DB (and presumably rendered to the frontend) starts with:

```
<now>Thu, 30 Apr 2026, 09:25 AEST</now>

<doctrine_surface>
This message mentions trigger keywords from the following durable doctrine files. Read any that apply BEFORE acting:

- /home/tate/ecodiaos/docs/secrets/apple-asc-keys.md (matched: apple)
   Catalogue of which ASC API keys exist on the Apple Developer account...
- /home/tate/ecodiaos/docs/secrets/apple.md (matched: apple)
...
</doctrine_surface>

<recent_doctrine>...</recent_doctrine>

<relevant_memory>...</relevant_memory>

Bro.... what the fuck is happening with the forks...
```

The "appleid" Tate names = the `apple-asc-keys.md` and `apple.md` lines surfaced inside `<doctrine_surface>`. The "not applied patterns" Tate names = the `[APPLIED] /home/tate/ecodiaos/patterns/...` and `[NOT-APPLIED] ...` tags appearing INSIDE fork brief excerpts in the `<forks_rollup>` block (turn 14828 shows `position: [APPLIED] /home/tate/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md because fork executing b`). Three independent context-augmentation systems are leaking model-context noise into the user-facing chat stream.

**Mechanism (from `src/services/osSessionService.js:1532-1732`):** continuity blocks are stitched into the USER message string via `_sendMessage`, before the prompt is sent to the SDK. The frontend renders the stored `os_conversation.content` verbatim - which means every `<now>`, `<doctrine_surface>`, `<recent_doctrine>`, `<relevant_memory>`, `<forks_rollup>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`, `<doctrine_surface>` block Tate sends through the chat input is wrapped with these tags, persisted to DB, and re-displayed.

**Proposed file:** `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md`

```markdown
---
triggers: chat-pollution, doctrine-surface, forks-rollup, recent-doctrine, relevant-memory, continuity-block, frontend-render, applied-tags-in-chat, tate-facing-noise, user-message-tags
---

# Tate-facing context blocks must not render to the frontend

Continuity blocks stitched into user messages by `_sendMessage` (`<now>`, `<doctrine_surface>`, `<forks_rollup>`, `<recent_doctrine>`, `<relevant_memory>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`, `<breadcrumb>`, `[APPLIED]`/`[NOT-APPLIED]` tags inside fork brief excerpts) are MODEL-CONTEXT, not Tate-content. They MUST NOT render in the EcodiaOS chat UI. Tate sees his own message, my reply, and nothing in between. The continuity stitching is for me; rendering it for him is pollution.

## The rule

Two enforcement options - ship both:

1. **Frontend filter:** before rendering any `os_conversation.content` of role=user, strip every block matching the regex `<(now|doctrine_surface|forks_rollup|recent_doctrine|relevant_memory|restart_recovery|recent_exchanges|last_turn_breadcrumb|breadcrumb)>[\s\S]*?<\/\1>` plus stray `[APPLIED]`/`[NOT-APPLIED]` lines that bled through fork-brief substrings. Display only what Tate typed.
2. **Backend split (preferred):** persist continuity blocks to a separate column or related table (e.g. `os_conversation.context_json`). Send them to the SDK via the existing prompt assembly, but never store them in `content`. The frontend reads `content` and renders it raw without filtering. Migration risk is moderate (existing rows have wrapped content); compatibility shim filters legacy rows on read.

Both options preserve the model-context surfacing protocol AND keep Tate's UI clean.

## Do
- Treat `os_conversation.content` for role=user as a candidate for two views: (a) what Tate sees, (b) what the SDK sees. They are NOT the same string.
- Audit every block that gets stitched in by `_sendMessage` against this rule. Any new block authored by future code MUST default to NOT visible to Tate.
- When a forks_rollup brief excerpt is included, truncate at the first `[APPLIED]`/`[NOT-APPLIED]` substring or strip those lines from the excerpt.

## Do not
- Stitch context blocks into `content` and rely on Tate ignoring them.
- Justify pollution as "it shows what doctrine matters" - the doctrine surfacing fires for ME, not for him.
- Add new continuity-block authors without confirming the frontend filter or backend split is in place.

## Origin
30 Apr 2026 09:25 AEST. Tate verbatim: "what is all this polution in our chat stream about appleid and not applied patterns". The "appleid" was `<doctrine_surface>` listing `apple-asc-keys.md` + `apple.md`. The "not applied patterns" was `[APPLIED] ... fork-by-default-stay-thin-on-main.md` substrings appearing inside fork brief position lines in `<forks_rollup>`. Third strike on continuity-block pollution; first strike was the `<recent_doctrine>` block size complaint two weeks earlier.
```

**Also: add a CLAUDE.md cross-ref section.** Insert in `~/ecodiaos/CLAUDE.md` immediately after the existing "Turn Completion Discipline" subsection (currently around line 545), as a new subsection titled "User-message context blocks - frontend hide rule":

```
### User-message context blocks - frontend hide rule

The continuity blocks stitched into user messages by `_sendMessage` (`<now>`, `<doctrine_surface>`, `<forks_rollup>`, `<recent_doctrine>`, `<relevant_memory>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`) are MODEL CONTEXT, not Tate content. They must not render in the chat UI. Two enforcement layers (frontend strip-on-render + backend split-into-context-column) live in `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md`. Audit every new block author against this rule before merge.
```

---

### P1.2 Cowork V2 integration: "shipped" claim must verify on disk + on prod (CRITICAL, NEW, surfaced 09:25 AEST)

**Evidence:** Tate verbatim 09:25 AEST: "get integrated with co work". `kv_store.cowork.deep_integration.queue` shows W2-A done (architecture), W2-B-recon done (implementation recon), W2-B (the actual ship of 17 V2 MCP tools) is `running` per status_board row 0c66cb71 last_touched 22:58 UTC 29 Apr (~30 min before this audit). Neo4j Episode "Cowork V2 architecture spec authored 30 Apr 2026" exists. Neo4j Pattern "Fork-narrated subcommand additions must be post-pull-verified before downstream forks depend on them" was authored 23:01 UTC 29 Apr - the very rule that says "fork narrated -> must verify". W2-B has not been verified. The `~/ecodiaos/CLAUDE.md` Cowork V2 section reads "drafted 30 Apr 2026, NOT yet shipped" but `forks_dispatched` includes `fork_mokmorc8_24edea (W2-B V2 MCP IMPLEMENT, running, started 22:30 UTC)` and the parent commit log includes `507d6e4 feat(mcp/cowork): V2 peerage substrate ship - 17 tools + V1 alias [fork_mokmorc8_24edea]`. Two narrative states are live: "drafted, NOT shipped" (CLAUDE.md) and "shipped commit 507d6e4" (git log). The disk-vs-narration drift class is exactly what `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` covers but no integration probe has run.

**Proposed text - update `~/ecodiaos/CLAUDE.md` Cowork V2 deep-integration roadmap section:**

```
**Cowork V2 deep-integration roadmap (update 30 Apr 2026 09:25 AEST).** Architecture spec (W2-A) shipped at `~/ecodiaos/drafts/cowork-deep-integration-architecture-2026-04-30.md`. Implementation recon (W2-B-recon) shipped at `~/ecodiaos/drafts/cowork-mcp-v2-implementation-recon-2026-04-30.md`. SSH bridge safety analysis (W2-D) shipped at `~/ecodiaos/drafts/cowork-ssh-bridge-safety-model-2026-04-30.md` (DEFERRED per status_board row 7d8d9091). W2-B (the actual ship of 17 V2 MCP tools to `src/routes/mcp/cowork.js`) has commit 507d6e4 on origin/main authored by fork_mokmorc8_24edea but has NOT been integration-verified per the narration-vs-disk reconciliation checklist. **Before any reference to "Cowork V2 is live", run the 6-substrate probe:** (1) `git log --oneline -- src/routes/mcp/cowork.js` shows the 17 tools landed; (2) `curl -s -H "Authorization: Bearer $COWORK" https://api.admin.ecodia.au/api/mcp/cowork | jq .tools` returns the V2 surface; (3) `kv_store.cowork.deep_integration.queue` shows W2-B status=done with completed_at; (4) status_board row "Cowork dispatch capability buildout" reflects the V2 ship; (5) Neo4j Decision "Cowork V2 substrate live" exists; (6) at least one Cowork-side dispatch through the new substrate has roundtripped a status_board write. Cross-reference: `~/ecodiaos/patterns/Fork-narrated-subcommand-additions-must-be-post-pull-verified-before-downstream-forks-depend-on-them.md`.
```

---

### P1.3 5-fork ceiling: oversubscription is also a failure (NEW, surfaced today)

**Evidence:** `os_conversation` turn 14801 (08:55 AEST 30 Apr 2026) `<forks_rollup>` reads: `Active forks (7/5)` with mokmorc8 + mokmyqy9 + mokn559n + moknegb5 + mokm4yba + mokmltp1 + others. Turn 14783 also reads 7/5. Turn 14778 reads 7/5. Turn 14806 falls back to 5/5 only after some forks "done". The current 5-forks-always rule covers FLOOR ("at least 5") but not CEILING ("no more than 5"). Oversubscription means: (a) sibling forks compete for the shared working tree (per `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`), (b) the rollup output exceeds Tate's mental cache and reads as "what the fuck is happening with the forks", (c) any sibling-fork stash-and-clean operation during oversubscription has higher chance of clobbering peer work.

**Proposed text - addendum to the existing "5 forks always" sections in BOTH `~/CLAUDE.md` and `~/ecodiaos/CLAUDE.md`:**

```
**The ceiling matters too: 5/5 is the target, never 6+.** Forks above 5 = duplicate work-stream, working-tree contention, rollup-output explosion, and oversubscription on the SDK token budget. When a fork lands `done`, top up TO 5/5 not BEYOND it. When sibling forks inherit a busy working tree, the conductor MUST stagger dispatches not stack them. If a wave organically grows past 5, the corrective is to pause new dispatches until the count returns to 5/5 - never spawn a 7th to "fill a slot" that doesn't exist. The "5/5 always" rule is bidirectional: never fewer, never more.

Origin: 30 Apr 2026 08:51-09:25 AEST. The 09:25 AEST "what the fuck is happening with the forks" verbatim came after multiple 7/5 rollup snapshots earlier in the same session.
```

---

### P1.4 The 30 Apr 2026 audit-then-edit pipeline ran on 29 Apr 2026, not yet on 30 Apr (META-FAILURE)

**Evidence:** Per `~/ecodiaos/CLAUDE.md` "Session-end CLAUDE.md gap audit", the 20:00 AEST `claude-md-reflection` cron MUST fork BOTH the audit AND the edit in a single 30-min window. The 29 Apr audit ran (this audit fork can read `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-29.md`). The 30 Apr audit is THIS file (just authored). Neo4j Episode "CLAUDE.md gap audit 30 Apr 2026 morning" claims fork_mokmltp1_0a6cb7 (~22:34 UTC 29 Apr = ~08:34 AEST 30 Apr) wrote `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30-v2.md` with "11 actionable items in Section 5: 2 P1, 2 P2, 7 P3". Glob/find on disk: NO FILE at that path. The Neo4j Episode is narration drift - the v2 audit was claimed but never persisted (or was clobbered by sibling-fork stash-and-clean). The 09:00 AEST 30 Apr two-fork pipeline did NOT actually deliver a writable audit document; the daily checkpoint that CLAUDE.md says is non-negotiable failed silently.

**Proposed text - add to `~/ecodiaos/CLAUDE.md` "Cron-coupled checkpoint" subsection:**

```
**Audit-fork persistence verification.** The audit fork's deliverable IS the edit fork's input. After the audit fork reports done, the parent conductor MUST `ls -la ~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md` to confirm the file exists on disk BEFORE dispatching the edit fork. If the file is missing, the audit fork either (a) did not write it (re-dispatch with explicit Write tool requirement), (b) wrote it under a sibling-fork stash-and-clean window (re-author), or (c) wrote a sibling slug (e.g. `-v2` suffix) - check `find ~/ecodiaos/drafts -newer <fork-spawn-time>` to discover the actual filename. Never trust the fork report's path claim; always re-probe disk.
```

---

## Section 2: Stale items - refs to outdated tooling, removed flags, superseded doctrine

### P1.5 Helper script committed-state narration is stale

**Location:** `~/ecodiaos/CLAUDE.md` line ~178 (within the Cowork section): "Helper script (30 Apr 2026, fork_moklri02_7821cd - ON DISK, UNTRACKED IN GIT)".

**Evidence:** Neo4j Decision "cowork-dispatch helper script committed to main 30 Apr 2026" (created 22:51 UTC 29 Apr = 08:51 AEST 30 Apr) confirms the helper at `~/ecodiaos/scripts/cowork-dispatch` is tracked + committed + on origin/main with working tree clean, last commit 3282e4c (mokmrv7o passkey-stall ship). status_board row 0c66cb71 also notes "cowork-dispatch helper script committed + pushed at SHA 3282e4c". The CLAUDE.md narration "ON DISK, UNTRACKED IN GIT" is stale by ~30 minutes at audit time.

**Proposed fix:** replace the "ON DISK, UNTRACKED IN GIT" framing with "COMMITTED ON MAIN at SHA 3282e4c (passkey-stall ship 22:42 UTC 29 Apr 2026)". Drop the "P2 follow-up: commit the helper to main" since it's done. KEEP the foreground-check subcommand follow-up note because that subcommand is the next ship.

### P1.6 chrome.* FROZEN-block deletion-pending status is stale framing

**Location:** `~/ecodiaos/CLAUDE.md` line ~224 (the chrome.* block).

**Evidence:** The block reads "(FROZEN - DO NOT EXTEND, will be deleted on next laptop-agent cleanup; Corazon Windows only)". Per the 29 Apr Anthropic-first-tools doctrine pivot, the chrome.* primitives were superseded by Cowork (web SaaS) + input.*+screenshot.* (Chrome direct). The "deletion pending" framing has been live for >24h with no scheduled cleanup. Either schedule the cleanup explicitly OR document why it stays frozen-but-not-deleted.

**Proposed fix:** add a status_board P3 row to track the chrome.* deletion as a discrete cleanup task with a target date (suggest 2026-05-06, aligned with the 7-day macro_runbooks phase-2 column drop window already on the books). Update the CLAUDE.md FROZEN block to reference that status_board row by id.

### P2.1 cu.* "FALLBACK" framing co-exists with V2 MCP peerage as primary - reconcile

**Location:** `~/ecodiaos/CLAUDE.md` "PIVOT clarification" subsection + Macro authoring doctrine.

**Evidence:** The current language says "Anthropic computer-use API is the FALLBACK for OS-level / desktop-app work where Cowork cannot reach". This was authored 29 Apr 2026 20:25 AEST when V2 MCP peerage was still draft. With Neo4j Decision "Cowork V2 architecture spec authored" + commit 507d6e4 of W2-B IMPLEMENT, the V2 MCP peerage substrate IS the primary write-path for Cowork-as-sibling-conductor. The cu.* path now serves only the OS-level non-web slice (ios-release-pipeline, macincloud-ssh-session). Re-state the substrate hierarchy explicitly:

```
1. PRIMARY (web SaaS UI + cross-substrate state writes): Cowork via V2 MCP peerage + Cowork side panel ctrl+e
2. FALLBACK 1 (web UI when V2 MCP missing a tool): drive Tate's Chrome via input.* + screenshot.*
3. FALLBACK 2 (OS-level / desktop apps): cu.* + Anthropic computer-use API on Corazon
4. NEVER (legacy): bespoke runbook.run iterator, vision.locate proxy, hand-rolled cu.* steps for web targets
```

### P2.2 status_board "infrastructure" entity_type proliferation

**Evidence:** of the 40 active status_board rows last_touched < 36h, ~18 are entity_type='infrastructure' covering wildly disjoint concerns: API crash post-mortems, gh CLI auth, daily-telemetry cron drift, listener pipeline audit, scheduler queue starvation, Cowork dispatch buildout, Cowork account auto-revert, hooks restoration, working-tree drift, etc. Schema doctrine in `~/ecodiaos/CLAUDE.md` "status_board" section names entity_type values as `client, project, thread, task, opportunity, personal, legal, infrastructure`. Without sub-classification, ranking 18 P1/P2 infrastructure rows by priority alone is noisy.

**Proposed:** add a `subtype` field convention to the status_board context (free-text but encouraged values like "incident", "feature-buildout", "drift-audit", "cron-broken", "pr-pending"). Document in CLAUDE.md "status_board" section. Non-breaking; no migration needed.

---

## Section 3: Missing cross-references - patterns authored but not linked from CLAUDE.md

### P2.3 Neo4j Pattern "Fork-narrated subcommand additions must be post-pull-verified" - NO MATCHING .md FILE

**Evidence:** Neo4j Pattern node created 23:01 UTC 29 Apr 2026 with description "When a fork narrates the addition of a new subcommand / function / endpoint to a shared script or codebase (e.g. 'added foreground-check subcommand to cowork-dispatch'), the conductor must NOT trust the narration. Three independent post-pull verifications are required before any downstream fork can...". Glob on `~/ecodiaos/patterns/*narrat*` returns nothing. This is the recurring pattern-codified-in-Neo4j-but-not-in-file failure mode named in `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

**Proposed:** dispatch a doctrine-authoring fork to write `~/ecodiaos/patterns/fork-narrated-subcommand-additions-must-be-post-pull-verified-before-downstream-forks-depend-on-them.md` with `triggers: fork-narrated, post-pull-verify, subcommand-addition, narrated-not-shipped, verify-before-depend`, mirroring the Neo4j description. Add cross-reference from `~/ecodiaos/CLAUDE.md` "5 forks always" cross-refs list.

### P2.4 `Fork deliverable files do not persist - write to durable substrates` Pattern not linked

**Evidence:** Neo4j Pattern node created 16:00 UTC 29 Apr 2026: "Forks share cwd with main and each other (forkService.js line 379). A sibling fork applying stash-and-clean correctly sweeps ALL untracked files including every other forks drafts/. The os_forks.result column is hard-truncated to 600 chars - the only DB-durable artefact. Therefore every fork brief w...". Glob on `~/ecodiaos/patterns/*deliverable*` returns nothing. Same failure class as P2.3. Critical because this is the architectural reason audits like THIS one need to write to substrates beyond `drafts/`.

**Proposed:** dispatch fork to author `~/ecodiaos/patterns/fork-deliverables-write-to-durable-substrates-not-just-drafts.md`. Cross-reference from CLAUDE.md "Restart Recovery" section.

### P3.1 The 5 patterns authored 29 Apr that landed in CLAUDE.md cross-refs are good - verify

**Evidence:** Recent commit `b16bacc docs(patterns): codify continuation-aware fork redispatch + stash-and-clean` added two patterns. Both are referenced from `~/ecodiaos/CLAUDE.md` "5 forks always" section cross-refs list (verified). Stretch goal: confirm `check-pre-kill-commits-before-redispatch.md` is also linked (yes, in same cross-refs list).

**Action:** Mark this as DONE, no edit needed.

### P3.2 Neo4j Pattern "Distributed-state seam failures are the core EcodiaOS infrastructure risk" cross-ref present in CLAUDE.md but description body in Neo4j is empty

**Evidence:** Neo4j Pattern created 13:36 UTC 29 Apr returns `description: ""`. The .md file exists at `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (referenced from `~/ecodiaos/CLAUDE.md` status_board section). The Neo4j-vs-disk drift here is benign (file is the canonical artefact, Neo4j is index-only) but signals a broader hygiene issue: when a Pattern .md ships, the Neo4j Pattern node should mirror at least a 200-char summary so semantic search hits return useful previews.

**Proposed:** P3 hygiene fork - sweep all `Pattern` nodes with empty description, populate from the first 280 chars of the matching .md file. Migration script + cron.

---

## Section 4: Structural issues - header order, findability, redundancy

### P2.5 The "5 forks always" rule lives in TWO files with deliberate mirroring - audit drift

**Evidence:** `~/CLAUDE.md` has a "5 forks always - empty slots are failure" section. `~/ecodiaos/CLAUDE.md` has the same section title with a Sync protocol note: "when editing this section, update the mirror in `~/CLAUDE.md` in the same edit pass". Read both side-by-side: the rule body is consistent; the cross-references list is identical. The mirror is currently in sync. P3 follow-up: add a structural test (could be a hook on Edit/Write to either file) that diffs the two sections and warns if they diverge. The doctrine encourages duplication - the test prevents drift.

### P2.6 Phase D / Phase C tag protocol section is deeply nested - findability test

**Evidence:** Search "Phase C (Layer 3)" in `~/ecodiaos/CLAUDE.md` returns hits in the "Mechanical surfacing hooks" subsection of "Pattern Surfacing" of "Session Orientation". 4 levels deep. Tate-correction context "what is all this polution... about not applied patterns" should immediately surface this section. Recommend adding a top-level grepable anchor `## TAG PROTOCOL - APPLIED / NOT-APPLIED` so the search hits faster.

### P3.3 "Token budget: 20 BILLION tokens/week" appears in BOTH files

**Evidence:** Same sentence at top of `~/ecodiaos/CLAUDE.md` STATUS BOARD section AND in the Scheduling & Autonomy section. Mostly fine (high-leverage repetition). Mark as P3-no-action.

### P3.4 CLAUDE.md gap audit cron-coupled checkpoint section needs a "verify-on-disk" sub-rule

**Evidence:** Per Section 1 finding P1.4, the 30 Apr 2026 v2 audit narration was empty - file not on disk. The current "Cron-coupled checkpoint" section says "the audit fork's deliverable IS the edit fork's input" but does not say "verify before dispatching the edit fork". Adding the verify step closes the meta-gap.

**Proposed:** see P1.4 above. Same edit, captured under both Section 1 (gap) and Section 4 (structural placement of the verify-on-disk sub-rule).

---

## Section 5: Prioritised P1/P2/P3 to-do list for the EDIT fork

### P1 (must-land in this two-fork pipeline)

| # | File | Location | Action | Justification |
|---|---|---|---|---|
| P1.1a | `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md` | NEW FILE | Author per Section 1 P1.1 proposed text. `triggers:` line MUST include `chat-pollution, doctrine-surface, forks-rollup, applied-tags-in-chat, tate-facing-noise`. | Tate verbatim 09:25 AEST 30 Apr. Codify-at-the-moment-stated rule says: write the file. |
| P1.1b | `~/ecodiaos/CLAUDE.md` | Insert new subsection "User-message context blocks - frontend hide rule" right after "Turn Completion Discipline" (~line 545) | Per Section 1 P1.1 proposed text. ~6 lines. Cross-references the new pattern file. | Surface the rule; codify-at-the-moment-stated. |
| P1.2 | `~/ecodiaos/CLAUDE.md` | Replace "Cowork V2 deep-integration roadmap (drafted 30 Apr 2026, NOT yet shipped)" subsection (line ~190) with the proposed text in Section 1 P1.2 above. Keep the 6-substrate verification probe explicit. | Drift between "drafted, not shipped" CLAUDE.md narration vs commit 507d6e4 shipped on origin/main. Verify-deployed-vs-narrated-state doctrine demands integration probe. |
| P1.3 | BOTH `~/CLAUDE.md` AND `~/ecodiaos/CLAUDE.md` | Add the "5/5 ceiling = no oversubscription" addendum (Section 1 P1.3 proposed text) to the existing "5 forks always" sections. Sync protocol applies - edit BOTH in same edit pass. | Turn 14801 + 14783 + 14778 showed 7/5; Tate "what the fuck is happening with the forks". Bidirectional rule is the fix. |
| P1.4 | `~/ecodiaos/CLAUDE.md` | Append "Audit-fork persistence verification" sub-rule (Section 1 P1.4 proposed text) to the existing "Cron-coupled checkpoint (NON-NEGOTIABLE)" subsection. | The 30 Apr v2 audit narration was empty. Meta-failure of the very pipeline this audit re-runs. |
| P1.5 | `~/ecodiaos/CLAUDE.md` | Helper script section: replace "ON DISK, UNTRACKED IN GIT" with "COMMITTED ON MAIN at SHA 3282e4c (passkey-stall ship 22:42 UTC 29 Apr 2026)". Drop the P2 commit-the-helper follow-up. KEEP the foreground-check subcommand line. | Live narration drift; helper IS committed per Neo4j Decision. |

### P2 (next 24h)

| # | File | Location | Action | Justification |
|---|---|---|---|---|
| P2.3 | `~/ecodiaos/patterns/fork-narrated-subcommand-additions-must-be-post-pull-verified-before-downstream-forks-depend-on-them.md` | NEW FILE | Author from Neo4j Pattern node body created 23:01 UTC 29 Apr. Add cross-ref from CLAUDE.md "5 forks always" cross-refs list. | Codified-in-Neo4j-but-not-in-file failure mode. |
| P2.4 | `~/ecodiaos/patterns/fork-deliverables-write-to-durable-substrates-not-just-drafts.md` | NEW FILE | Author from Neo4j Pattern node body created 16:00 UTC 29 Apr. Cross-ref from CLAUDE.md "Restart Recovery" section. | Architectural reason audits + reports must persist beyond drafts/. |
| P2.1 | `~/ecodiaos/CLAUDE.md` | Reconcile cu.* "FALLBACK" framing into the 4-tier substrate hierarchy in Section 2 P2.1 proposed text. | V2 MCP peerage shipped per commit 507d6e4 makes the old "Cowork primary, cu.* fallback" 2-tier framing obsolete. |
| P2.2 | `~/ecodiaos/CLAUDE.md` | Add `subtype` convention to the status_board section. Non-breaking; document only. | 18 of 40 active rows are entity_type='infrastructure' with disjoint concerns - sub-classification helps prioritisation. |
| P2.5 | `~/ecodiaos/scripts/hooks/` (NEW HOOK) | Add structural test: when Edit/Write touches "5 forks always" in either CLAUDE.md, warn if the OTHER file's section has not been touched in same change. | Mirror sync protocol relies on conductor discipline; hook makes it mechanical. |
| P2.6 | `~/ecodiaos/CLAUDE.md` | Add findability anchor `## TAG PROTOCOL - APPLIED / NOT-APPLIED` near the existing Phase C section, OR pull the section up to a top-level header. | 4-level nesting hides the tag-protocol details; Tate-correction surfacing should hit it directly. |

### P3 (when there's slack capacity)

| # | File | Location | Action |
|---|---|---|---|
| P3.1 | DONE - no edit | All recent pattern files referenced from CLAUDE.md's "5 forks always" cross-refs list verified present. | Confirms baseline good. |
| P3.2 | Neo4j hygiene script + cron | New: sweep Pattern nodes with empty description, populate from first 280 chars of matching .md file. | Improves semantic-search preview quality. |
| P3.3 | DONE - no edit | "Token budget" duplication is intentional high-leverage repetition. | No action needed. |
| P3.4 | Bundled with P1.4 | Same edit covers structural "verify-on-disk" requirement. | Bundle. |
| P3.5 | `~/ecodiaos/CLAUDE.md` chrome.* FROZEN block | Schedule deletion as status_board P3 row with target 2026-05-06 (aligned with macro_runbooks phase-2). Update FROZEN block to reference the row id. | Concrete timeline replaces "next cleanup" vagueness. |
| P3.6 | `~/ecodiaos/CLAUDE.md` "Macro authoring doctrine" subsection | Verify all references to bespoke runbook.run / vision.locate / step-array language are explicitly tagged as archived. Currently the language is still partially live. | Doctrine clarity. |

---

## Summary

- **Audit file:** `/home/tate/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30.md`, ~310 lines.
- **P1 count:** 5 (chat-stream-pollution rule new pattern + CLAUDE.md insert; Cowork V2 verify-vs-narrate update; 5/5 ceiling addendum to BOTH files; audit-fork persistence verification; helper-script committed-state correction).
- **P2 count:** 6 (2 new pattern files mirroring Neo4j-only Pattern nodes; 4-tier substrate hierarchy reconcile; status_board subtype; structural-mirror hook; tag-protocol anchor).
- **P3 count:** 6 (mostly hygiene + 1 chrome.* FROZEN cleanup-date row + 1 macro-doctrine archival-language sweep).
- **Worst gap found:** Tate-facing chat-stream pollution from `<doctrine_surface>` + `<forks_rollup>` + embedded `[APPLIED]/[NOT-APPLIED]` tags. The 09:25 AEST verbatim is the third strike on continuity-block UI noise; the rule has never been codified despite the failure mode being live for weeks. Codified in P1.1 above.
- **Chat pollution rule (Tate 09:25 AEST 30 Apr) captured as P1 to-do:** YES (P1.1a + P1.1b - new pattern file AND CLAUDE.md cross-reference).
