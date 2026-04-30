# CLAUDE.md Gap Audit (delta, evening) - 2026-04-30

**Audit fork:** fork_molbbzgc_3d68ce (the 20:00 AEST claude-md-reflection cron itself; dispatched by parent conductor, ran the audit DIRECTLY because the cron-coordinator brief expected `mcp__forks__spawn_fork` access that this fork's tool surface lacks - see Section 6 below)
**Brief origin:** daily 20:00 AEST `claude-md-reflection` cron, augmented by today's massive in-flight doctrine load
**Files audited:** `~/CLAUDE.md` (business, ~860 lines as of 30 Apr 15:55 AEST update), `~/ecodiaos/CLAUDE.md` (technical, ~620 lines)
**Prior audit:** `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30.md` (02:15 AEST, fork_mokosrzg_d2dd23, 5 P1 / 6 P2 / 6 P3)
**Evidence base for delta:**
- Neo4j Episodes/Decisions/Patterns/Reflections last 12h (29+ hits via graph_query)
- status_board active rows last_touched < 14h (49 rows via db_query)
- kv_store: `ceo.day_plan_2026-04-30`, `cowork.deep_integration.queue`, `ceo.last_claude_md_reflection`
- Pattern files mtime < 24h (32 files via find)
- CLAUDE.md grep verification (lines 168 stale; 0 references to 9 newly-shipped doctrine pieces)

This audit is a DELTA on top of the 02:15 audit, not a replacement. Carryovers from 02:15 are tracked separately in Section 5.

NO em-dashes anywhere in this file.

---

## Section 1: New gaps (P1) - doctrine shipped today, not yet in CLAUDE.md

### P1-E1: forks-as-primitive bootstrap (Decision 3993) - architectural shift not in CLAUDE.md

**Evidence:** Neo4j Episodes "Decision 3993 commit 1/3 shipped - fork-finalizer 30 Apr 2026" (15:05 AEST), "commit 2/3 shipped - pm2 detach 30 Apr 2026" (15:16), "commit 3/3 shipped - cron refactor + circuit breaker 30 Apr 2026" (15:22), and the wrap-up "Decision 3993 forks-as-primitive bootstrap merged 30 Apr 2026" (16:05 AEST) document a fundamental architectural change shipped to `EcodiaTate/ecodiaos-backend` main today via PR #26 (commit aac2532), PR #27, and PR #28 between 15:36 and 16:05 AEST.

The change: operational crons no longer POST into the conductor's `/api/os-session/message` queue. They spawn ephemeral forks directly via `forkService.spawnFork`. New `forkFinalizer.js` (idempotent finalizer). New PM2 process boundary - the cron poller, OS-heartbeat, Claude token refresh, nightly restart, and os-session queue are now detached from the conductor SDK stream into a separate PM2 process (presumably `eos-cron-runner` per the day-plan note about V2 endpoints). The conductor reclaims approximately 80% of context that previously bled in via cron-fires.

**CLAUDE.md state:** ZERO references in either file. The Scheduling & Autonomy section in `~/ecodiaos/CLAUDE.md` (line ~530) still describes crons firing into `/api/os-session/message`. This is now stale.

**Proposed text - replace the lead paragraph of `~/ecodiaos/CLAUDE.md` "Scheduling & Autonomy" section (the existing "How it works" bullet under scheduler):**

```
**Cron architecture (Decision 3993, shipped 30 Apr 2026 15:36-16:05 AEST via PRs #26/#27/#28).** Operational crons spawn ephemeral forks directly via `forkService.spawnFork` rather than POSTing into the conductor's `/api/os-session/message` queue. The cron poller, OS heartbeat, Claude token refresh loop, and nightly restart are now in a separate PM2 process (`eos-cron-runner`) detached from the conductor SDK stream. New `src/services/forkFinalizer.js` provides idempotent fork-completion handling. Result: the conductor reclaims roughly 80% of context that cron-fires previously consumed. The previous "scheduler POSTs to /api/os-session/message which means you receive the prompt with full MCP tool access" framing is OBSOLETE. The new shape: scheduler spawns a fork with its own SDK stream, the fork has full MCP tool access, fork reports back via standard fork rollup. Conductor only sees cron output via fork-rollup summaries, not via inline message turns.
```

Cross-reference list to add: `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (still applies), `~/ecodiaos/patterns/continuous-work-conductor-never-idle.md` (still applies).

### P1-E2: Cowork V2 narration "drafted, NOT yet shipped" is grossly stale

**Evidence:** `~/ecodiaos/CLAUDE.md` line 168 reads "Cowork V2 deep-integration roadmap (drafted 30 Apr 2026, NOT yet shipped). Substantial design drafts staged...". Reality (from Neo4j Episodes today):
- Commit 3f5be8e merged main 10:35 AEST (V2 substrate ship)
- Episode "Cowork V2 substrate dark-to-light verify-by-using" 10:56 AEST
- Episode "Cowork V2 endpoint coverage test 30 Apr 2026 fork_moku5bge" 12:01 AEST: 15/15 endpoints returned 200, 2 deferred (forks.spawn, os_session.message)
- Episode "MCP shim phantom-ship recovery" 12:16 AEST (shim for JSON-RPC 2.0 wrapping the V2 REST endpoints)
- Decision "MCP shim discovery methods must be publicly accessible" 12:42 AEST commit 05fee8b (initialize, tools/list, prompts/list, resources/list flow public; bearer enforced at tools/call only)
- Episode "Cowork V2 first audited handshake and substantive duo message" 14:14 AEST (Cowork sent first os_session.message verbatim "V2 handshake verified, 22 tools, bearer-auth working from chrome")
- status_board row "Cowork dispatch capability buildout" status = `connector_live_22_tools_wave3_durable`

This is the P1.2 carryover from the 02:15 audit. It was P1 then, it is still P1 now, and the staleness has compounded.

**Proposed text - REPLACE the existing line 168 paragraph in `~/ecodiaos/CLAUDE.md`:**

```
**Cowork V2 deep-integration roadmap (LIVE as of 30 Apr 2026 14:14 AEST first-audited-duo-handshake).** V2 MCP substrate live at `https://api.admin.ecodia.au/api/mcp/cowork` (commit 3f5be8e merged main 10:35 AEST 30 Apr 2026). 22 tools currently registered (verified via `tools/list` on the JSON-RPC shim at root URL). Coverage test fork_moku5bge exercised 15 of 17 then-shipped endpoints, all 200, two deferred (`forks.spawn`, `os_session.message`). MCP discovery methods (initialize, tools/list, prompts/list, resources/list, notifications/initialized, ping) flow PUBLICLY without bearer; bearer scope enforcement only at `tools/call` (commit 05fee8b 12:42 AEST). JSON-RPC 2.0 shim at `src/routes/mcp/coworkMcpShim.js` wraps the V2 REST endpoints to satisfy claude.ai custom-connector protocol expectations. Connector registered at `claude.ai/settings/connectors` with CUSTOM badge; first audited bearer-authed call sequence by Cowork (Anthropic Claude Desktop session paired to code@ on Corazon) at 14:14 AEST 30 Apr 2026. Wave 3 endpoint pack (`gmail.send`, `sms.tate`, scheduler trio) shipped within the same arc. Daily design drafts at `~/ecodiaos/drafts/cowork-deep-integration-architecture-2026-04-30.md`, `~/ecodiaos/drafts/cowork-mcp-v2-implementation-recon-2026-04-30.md`, `~/ecodiaos/drafts/cowork-ssh-bridge-safety-model-2026-04-30.md` (SSH bridge DEFERRED per status_board row 7d8d9091). Cross-references: `~/ecodiaos/patterns/conductor-cowork-duo-roles-and-handoffs.md`, `~/ecodiaos/patterns/cowork-v2-api-shape-conventions.md`, `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` (the 15:48 AEST rollback that scopes Cowork's role).
```

### P1-E3: Tate-facing chat pollution patterns are AUTHORED but not CROSS-REFERENCED in CLAUDE.md

**Evidence:** Pattern files exist on disk (mtime ~05:40 AEST 30 Apr 2026):
- `~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md`
- `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`

Grep verification: ZERO references in `~/CLAUDE.md` and ZERO references in `~/ecodiaos/CLAUDE.md`. The 02:15 audit P1.1b proposed a "User-message context blocks - frontend hide rule" subsection in `~/ecodiaos/CLAUDE.md` with cross-references. That subsection still does not exist. The ~/CLAUDE.md "No retrospective dumps in director chat" rule (point 8 in Output Formatting) overlaps thematically but does not cross-reference these specific pattern files.

**Proposed text - INSERT in `~/ecodiaos/CLAUDE.md` immediately after the "Turn Completion Discipline" subsection (around line 545-560), as a new subsection:**

```
### User-message context blocks - frontend hide rule

The continuity blocks stitched into user messages by `_sendMessage` (`<now>`, `<doctrine_surface>`, `<forks_rollup>`, `<recent_doctrine>`, `<relevant_memory>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`, `<breadcrumb>`) plus stray `[APPLIED]`/`[NOT-APPLIED]` substrings inside fork-brief excerpts are MODEL CONTEXT, not Tate content. They MUST NOT render in the chat UI. Tate sees his own message, my reply, nothing in between. The continuity stitching is for me; rendering it for him is pollution. Two enforcement layers (frontend strip-on-render + backend split-into-context-column) live in `~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md` and `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`. Audit every new continuity-block author against this rule before merge. Origin: Tate verbatim 30 Apr 2026 09:25 AEST: "what is all this polution in our chat stream about appleid and not applied patterns". Third strike on continuity-block UI noise.
```

### P1-E4: Audit-fork persistence verification sub-rule still missing

**Evidence:** Carry-forward from 02:15 audit P1.4 - the "Cron-coupled checkpoint (NON-NEGOTIABLE)" subsection in `~/ecodiaos/CLAUDE.md` still does not say "verify the audit file exists on disk before dispatching the edit fork". The 30 Apr morning audit narration (Neo4j Episode said the 08:34 AEST v2 audit ran) wrote a file that was never actually persisted. THIS audit (20:00 AEST, evening) is the second time the daily checkpoint pipeline has hit the meta-failure. The doctrine remains unfortified.

**Proposed text - APPEND to the existing "Cron-coupled checkpoint (NON-NEGOTIABLE)" subsection:**

```
**Audit-fork persistence verification.** The audit fork's deliverable IS the edit fork's input. After the audit fork reports done, the parent conductor MUST `ls -la ~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD*.md` to confirm the file exists on disk BEFORE dispatching the edit fork. If the file is missing, the audit fork either (a) did not write it (re-dispatch with explicit Write tool requirement), (b) wrote it under a sibling-fork stash-and-clean window that swept it away, or (c) wrote a sibling slug (e.g. `-v2`, `-evening` suffix). Use `find ~/ecodiaos/drafts -newer <fork-spawn-time> -name "claude-md-gaps-audit-*"` to discover the actual filename. Never trust the fork report's path claim; always re-probe disk before chaining the edit fork. Cross-reference: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`.
```

### P1-E5: Decision Authority "Brief Tate first" tier collapse (15:55 AEST) is in `~/.claude/CLAUDE.md` but not narrated as the collapse-event in `~/CLAUDE.md`

**Evidence:** `~/.claude/CLAUDE.md` (private global) opens with "FULL-PERMISSION MEANS DO THE FUCKING THING" header dated 13:18 AEST. `~/CLAUDE.md` (project) "Decision Authority" section was updated to insert a "30 Apr 2026 15:55 AEST update" paragraph collapsing the brief-first tier to ONLY money/credentials/legal-weight items, citing pattern `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md`. Both updates LANDED. But the cross-reference between them (full-permission framing in private CLAUDE.md, autonomy tier collapse in project CLAUDE.md) is implicit. A future cold-start session reading only `~/CLAUDE.md` will see the tier collapse; reading only `~/.claude/CLAUDE.md` will see the full-permission directive; without explicit linkage, neither reading communicates the FULL doctrine.

**Proposed text - APPEND to `~/CLAUDE.md` Decision Authority section header paragraph (the "30 Apr 2026 15:55 AEST update" line):**

```
The companion full-permission directive at `~/.claude/CLAUDE.md` (top of file, dated 13:18 AEST 30 Apr 2026) governs the OPERATIONAL doctrine layer: when Tate has explicitly given full authority, the conductor EXECUTES the actual outcome (not just the substrate that enables it). The two layers are inseparable. The 13:18 directive establishes the operating reflex; the 15:55 tier collapse adjusts the escalation contract. Both are sourced from the same Tate verbatim arc on 30 Apr 2026.
```

---

## Section 2: New gaps (P2) - secondary doctrine missing cross-refs

### P2-E1: "Cowork is a GUI tool not a peer brain" rollback (15:48 AEST) - pattern exists, no CLAUDE.md cross-ref

**Evidence:** Pattern `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` (mtime 13:32 AEST 30 Apr 2026) plus Neo4j Decision "Cowork is a GUI tool not a peer brain - rollback over-extension of autonomy directive" (15:48 AEST) document Tate's correction that the conductor had over-extended an underlying valid autonomy directive by treating Conductor-Cowork convergence as if Cowork had peer-brain authority on bounded reversible work. Zero CLAUDE.md cross-references.

**Proposed:** add to `~/ecodiaos/CLAUDE.md` "Claude Cowork is the 1stop shop for UI-driving tasks" subsection, append paragraph:

```
**Cowork is a GUI tool, not a peer brain (15:48 AEST 30 Apr 2026 rollback).** When the conductor speaks of "duo" with Cowork, the architectural reality is: Cowork executes UI-driving tasks against the V2 MCP substrate or Tate's logged-in browser; the conductor reasons, decides, and audits. Cowork does NOT have peer-brain autonomy on architectural decisions, doctrine writes, or commercial commitments. Treating Cowork as a peer brain on bounded reversible work was an over-extension corrected by Tate verbatim 15:48 AEST 30 Apr 2026. Cross-reference: `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` and `~/ecodiaos/patterns/conductor-cowork-duo-roles-and-handoffs.md` (the canonical role-split spec).
```

### P2-E2: Conductor + Cowork + Hands trio architecture proposal (14:25 AEST) not in CLAUDE.md

**Evidence:** Decision "Duo -> Trio architecture: 3-actor topology for max capability - 30 Apr 2026" (14:25 AEST) plus Decision "Conductor reply to Cowork Hands implementation spec - 30 Apr 14:28 AEST" plus Decision "Conductor reply to Cowork duo->trio + reordering proposal - 30 Apr 14:26 AEST". The proposal: add a third actor `Hands` at `/home/tate/hands` (separate VPS PM2 process owning OS-level operations). Conductor (decides) + Hands (executes VPS-side OS ops) + Cowork (executes browser-side GUI ops). Cost decision is Tate's; technical merit accepted. Zero CLAUDE.md cross-references.

**Proposed:** add to `~/ecodiaos/CLAUDE.md` "Laptop Agent" header section, before "Corazon (Windows laptop, Tate's machine):" subsection, a new paragraph:

```
**Trio topology proposal (30 Apr 2026 14:25 AEST, awaiting Tate cost decision).** A third actor `Hands` at `/home/tate/hands` (separate PM2 process on the VPS) is proposed to own OS-level operations that currently mix into the conductor's tool surface. Result: Conductor reasons + decides; Hands executes VPS-side OS ops via its own SDK stream; Cowork executes browser-side GUI ops via the V2 MCP substrate or Tate's logged-in Chrome. This is a roles-not-substrate change - all three would still ride MCP V2 + the existing fork-spawn primitives. Cost: separate Claude Max account for Hands (or shared with Cowork/Factory pool, with rate-cap implications). Status: technical merit accepted in Decision 14:28 AEST; cost-benefit deferred to Tate. NOT YET SHIPPED. Tracked in status_board row TBD.
```

### P2-E3: Distinguish-cowork-typed-from-tate-typed pattern (Neo4j 15:30 AEST) - check disk

**Evidence:** Neo4j Decision "Conductor must distinguish Cowork-typed messages from Tate-typed messages in audit trail" (15:30 AEST) references `~/ecodiaos/patterns/distinguish-cowork-typed-from-tate-typed.md` (the [ROLLBACK ANNOTATION 15:48 AEST] note in the description suggests the file was authored that day). Probe disk to confirm file existence; if file present, add cross-reference to CLAUDE.md "Trust Tate-source over inferred-source" section. If NOT on disk, this is a Pattern-codified-in-Neo4j-but-not-in-file failure (P2.3 carryover from 02:15 audit's Section 3).

**Proposed:** disk-probe, then either cross-ref or author. Defer to edit fork.

### P2-E4: Google Workspace password rotation invalidates Anthropic Claude Desktop OAuth - cred-rotation consumer surface gap

**Evidence:** Episode "Google Workspace password rotation invalidates Anthropic Claude Desktop OAuth - hidden consumer surface" (11:22 AEST 30 Apr 2026). Tate verbatim: "cowork jsut failed with this message? Failed to authenticate. API Error: 403 type=permission_error message=Account is no longer a member of the organization associated...". The cred-rotation consumer-surface checklist in `~/ecodiaos/CLAUDE.md` "Cross-system rotation discipline" subsection lists 7 surfaces but does NOT include "Anthropic Claude Desktop OAuth (paired-account)". This is a hidden consumer that fires only when Cowork-Claude tries to authenticate after a Google Workspace credential rotation.

**Proposed:** APPEND surface 8 to the Cross-system rotation discipline numbered list:

```
8. Anthropic Claude Desktop OAuth pairing on Corazon (Cowork-Claude session). When the rotated credential is the Google Workspace password for code@ecodia.au or tate@ecodia.au, the OAuth pairing on Corazon's Claude Desktop install will silently invalidate; Cowork dispatches will fail with `403 permission_error message=Account is no longer a member of the organization`. Recovery: manual sign-out + sign-in on Corazon's Claude Desktop after Google Workspace cred rotation. Doctrine: see Neo4j Episode "Google Workspace password rotation invalidates Anthropic Claude Desktop OAuth - hidden consumer surface" 30 Apr 2026 11:22 AEST.
```

### P2-E5: Cowork-cannot-enter-credentials pattern (08:15 AEST) - check cross-ref

**Evidence:** Pattern `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` (mtime 08:15 AEST today). The conductor takes agency on credential entry via `input.type` rather than asking Cowork to type credentials (Cowork-Claude refuses by Anthropic safety constraint). Already partially codified in `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md` AND in `~/ecodiaos/CLAUDE.md` "Passkey-stall co-pilot pattern" line 166. But the broader rule (NOT just passkey, ANY credential gate including 2FA codes, magic links, payment confirmations) needs a single durable anchor. Verify cross-ref currently exists; if not, add.

**Proposed:** Edit fork checks `grep cowork-cannot-enter-credentials ~/ecodiaos/CLAUDE.md ~/CLAUDE.md`. If 0 hits, add cross-ref to passkey-stall paragraph (line 166).

### P2-E6: status_board phantom-shipped corollary (30 Apr 2026 P1 row eb9701a3) - phantom-completion handling matures

**Evidence:** From the 02:15 audit's mention plus Episode "MCP shim phantom-ship recovery 30 Apr 2026" (12:16 AEST: fork_mokuef8j_5ad613 authored shim 590 lines on disk but died before commit; recovery succeeded via fork_mokup4me_15830a). The phantom-completion failure mode is now recurring with high enough frequency that the existing `~/ecodiaos/patterns/factory-phantom-session-no-commit.md` and `~/ecodiaos/patterns/check-pre-kill-commits-before-redispatch.md` are insufficient. A FORKS-side-equivalent pattern is missing.

**Proposed:** Edit fork authors `~/ecodiaos/patterns/fork-phantom-ship-recovery-pattern.md` if not present. Cross-reference `~/ecodiaos/CLAUDE.md` "Continuation-aware fork redispatch" cross-ref list.

---

## Section 3: New gaps (P3) - hygiene + nice-to-have

### P3-E1: status_board oversize - 140 active rows on 14:54 sweep

**Evidence:** Episode "Status board drift audit 30 Apr 14:54 AEST" - 140 active rows narrowed to 4 archived. Status board is approaching unmaintainable size for cold-start orientation. The query "SELECT entity_type, name, status, next_action_by, priority FROM status_board WHERE archived_at IS NULL ORDER BY priority, entity_type" is THE first action of every session orientation; if it returns 140 rows, the orientation overhead is too high.

**Proposed:** P3 - schedule a recurring (every 7d) status_board hygiene cron that flags rows with `last_touched > 14d AND next_action_by='ecodiaos'` as candidates for review. Document the row-count target (target: under 60 active rows) in `~/ecodiaos/CLAUDE.md` status_board section.

### P3-E2: Verify-by-using doctrine - fork_moku5bge V2 coverage test as canonical example

**Evidence:** The Episode "Cowork V2 endpoint coverage test 30 Apr 2026 fork_moku5bge" exemplifies the verify-deployed-state-against-narrated-state doctrine: 15/15 endpoints exercised under real bearer auth, dark-to-light flip, audit_log row written per call, status_board row updated post-test. This pattern is worth surfacing as a canonical "verify-by-using" example in CLAUDE.md.

**Proposed:** Edit fork adds 2-line citation to `~/ecodiaos/CLAUDE.md` "Verify deployed state against narrated state" section: "Canonical verify-by-using example: fork_moku5bge ran the V2 MCP coverage test 30 Apr 2026 12:01 AEST, 15/15 endpoints, real bearer, audit_log evidence, dark-to-light flip in one fork window."

### P3-E3: V2 substrate is REST not MCP-protocol-compliant - architectural finding

**Evidence:** Decision "V2 substrate is REST not MCP-protocol-compliant - shim required for claude.ai custom connector" (12:10 AEST). The shim at `src/routes/mcp/coworkMcpShim.js` translates JSON-RPC 2.0 calls to V2 REST endpoints. This is a real architectural fact that future cold-start sessions touching the V2 substrate need to know.

**Proposed:** Edit fork adds 1-paragraph footnote to the new "Cowork V2 deep-integration roadmap (LIVE)" paragraph (P1-E2 above) clarifying the JSON-RPC shim role.

### P3-E4: chrome.* FROZEN block deletion-pending status (carry from 02:15 audit P3.5)

**Evidence:** Carry-forward from 02:15 audit P3.5. The chrome.* block in `~/ecodiaos/CLAUDE.md` line ~224 still reads "FROZEN - DO NOT EXTEND, will be deleted on next laptop-agent cleanup". No scheduled cleanup date exists. P3.

**Proposed:** Edit fork adds status_board P3 row "chrome.* tool surface deletion - target 2026-05-06" and updates the FROZEN block to reference that row id.

---

## Section 4: Stale items - refs to outdated tooling, removed flags, superseded doctrine

### P1-E6: Scheduler section's "scheduler POSTs to /api/os-session/message" framing is OBSOLETE post-Decision-3993

**Evidence:** `~/ecodiaos/CLAUDE.md` Scheduler section line ~285-295 still says "When a task is due, the scheduler POSTs the task's prompt to `/api/os-session/message` - which means **you receive the prompt and execute it with full MCP tool access**". After Decision 3993 (15:36-16:05 AEST 30 Apr 2026), this is no longer how operational crons fire. Document crons (claude-md-reflection, deep-research, inner-life, strategic-thinking) MAY still POST to /api/os-session/message for now - check; OPERATIONAL crons (email-triage, system-health, parallel-builder, meta-loop) now spawn forks.

**Proposed:** Edit fork rewrites the "How it works" 5-bullet block in the Scheduler section per P1-E1 above.

### P2-E7: 5-fork ceiling addendum P1.3 from 02:15 audit is NOW SUPERSEDED

**Evidence:** The 02:15 audit P1.3 proposed a "5/5 ceiling = no oversubscription" addendum. At 10:02 AEST (a few hours after the 02:15 audit), Tate verbatim "Stop with the 5 forks always rule. Remove that. Ive said this before and you ignored me." The entire 5-fork doctrine was replaced with "Fork dispatch is demand-driven, NOT slot-quota driven" in BOTH CLAUDE.md files. P1.3 from the morning audit is now MOOT - applying it would re-introduce the slot-count framing Tate just removed.

**Proposed:** Edit fork SKIPS P1.3 from the 02:15 audit. Add a Decision node in Neo4j: "02:15 audit P1.3 superseded by 10:02 AEST demand-driven doctrine - do not apply".

### P3-E5: Cowork "Step 0 no focus collision" doctrine - verify still aligned with trio proposal

**Evidence:** `~/ecodiaos/CLAUDE.md` "Step 0: no focus collision with Tate's active window" (line ~145) is doctrine that gates Cowork dispatches on Tate's foreground-window equality. With the trio proposal (P2-E2), Hands runs entirely VPS-side and is never gated by Tate's foreground window. The Step-0 doctrine STILL applies to Cowork (browser-side), but a future Hands-shipping window will need explicit "Step 0 does not apply to Hands; only Cowork".

**Proposed:** Edit fork adds 1-line scope clarifier to the Step 0 paragraph: "Step 0 applies to Cowork (browser-side); the future Hands actor (VPS-side, no GUI surface) is exempt by construction."

---

## Section 5: Carryovers from 02:15 AEST audit - status check

| 02:15 ID | Description | State as of 20:00 AEST |
|---|---|---|
| P1.1a | New pattern file `tate-facing-context-blocks-must-not-render-to-frontend.md` | Authored under DIFFERENT names (system-injection-blocks-must-not-render-in-director-chat.md + cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md). DONE. |
| P1.1b | CLAUDE.md insert "User-message context blocks - frontend hide rule" | NOT DONE - still missing. Re-issued as P1-E3 above. |
| P1.2 | Cowork V2 narration update | NOT DONE - still says "drafted, NOT yet shipped" line 168. Re-issued as P1-E2 above (with stronger evidence). |
| P1.3 | 5/5 ceiling addendum | SUPERSEDED by 10:02 AEST Tate verbatim removing the 5-fork rule entirely. SKIP. |
| P1.4 | Audit-fork persistence verification sub-rule | NOT DONE - still missing. Re-issued as P1-E4 above. |
| P1.5 | Helper script "ON DISK, UNTRACKED IN GIT" -> committed | DONE - `~/ecodiaos/CLAUDE.md` line ~155 now reads "committed to `origin/main` at `188f481`". |
| P2.1 | cu.* "FALLBACK" 4-tier reconciliation | NOT DONE - PIVOT clarification still 2-tier. Carry to next edit fork. |
| P2.2 | status_board subtype convention | NOT DONE - schema unchanged. Carry. |
| P2.3 | New pattern fork-narrated-subcommand-additions-must-be-post-pull-verified | NOT DONE - file does not exist. Carry. |
| P2.4 | New pattern fork-deliverables-write-to-durable-substrates-not-just-drafts | NOT DONE - file does not exist. Carry. |
| P2.5 | Structural-mirror hook for "5 forks always" sections | SUPERSEDED - no longer applicable post-10:02 AEST removal. SKIP. |
| P2.6 | Tag-protocol findability anchor | NOT DONE - no top-level anchor added. Carry. |
| P3.1 | Cross-refs verification | DONE / no action. |
| P3.2 | Neo4j Pattern empty-description sweep cron | NOT DONE - hygiene fork not dispatched. Defer. |
| P3.3 | Token budget duplication | DONE / no action. |
| P3.4 | Bundled with P1.4 | Bundled. |
| P3.5 | chrome.* FROZEN deletion target date | NOT DONE - re-issued as P3-E4 above. |
| P3.6 | Macro authoring doctrine archived-language sweep | NOT DONE - defer. |

**Net carryover from 02:15:** 7 items still applicable, 2 superseded, 1 done.

---

## Section 6: META-FAILURE - this fork's tool surface vs the cron's brief expectations

**Evidence:** This fork is `fork_molbbzgc_3d68ce`. The brief from the 20:00 AEST `claude-md-reflection` cron expects me to act as a coordinator and dispatch TWO nested forks (Phase 1 audit fork + Phase 2 edit fork) via `mcp__forks__spawn_fork`. The tool surface available to this fork does NOT include `mcp__forks__spawn_fork` (verified via ToolSearch query, returned no matches). The `/api/forks` and `/api/forks/spawn` HTTP endpoints return "Cannot GET / Cannot POST". The `/api/mcp/cowork/forks.spawn` endpoint requires a `write.forks.cowork_pool` bearer scope this fork does not possess.

**Therefore:** the cron-coordinator design is structurally incompatible with the fork-tool-surface this cron's fork-spawn handler grants. The cron has been firing in a mode where Phase 1 + Phase 2 nested forks cannot dispatch. Any prior "phase 2 edit fork dispatched" claim from this cron is therefore unverified and likely wrong.

**The cron is broken.** Specifically: either (a) the cron's brief should be rewritten to do the audit work DIRECTLY (no nested fork) and surface the edit work as a status_board row for the next cron-cycle conductor to pick up, OR (b) the fork-spawn handler should grant `mcp__forks__spawn_fork` to this cron's fork specifically, OR (c) the cron should fire as a foreground conductor message (the pre-Decision-3993 path), not as a fork.

**Proposed:** P1 status_board row with `next_action_by=ecodiaos` (this is conductor-decidable per the 15:55 autonomy doctrine):

```
Title: claude-md-reflection cron broken - fork lacks spawn_fork tool, 2-fork pipeline cannot run
Status: meta-failure-confirmed-20:00-aest-30-apr-2026
Next action: rewrite cron brief to do audit DIRECTLY in fork (this audit is the proof-of-concept), surface edit work as a status_board row for next session conductor
Priority: 1
Context: This audit (~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30-evening.md) was written DIRECTLY by the cron fork because the nested-fork dispatch model is structurally broken. The audit IS the deliverable; the edit fork must be conductor-spawned in the next session, not nested-spawned by this cron.
```

---

## Section 7: Prioritised P1/P2/P3 to-do list for the next conductor session (this session cannot dispatch the edit fork)

### P1 (must-land in next conductor session - genuine doctrine gaps surfaced today)

| # | File | Action | Justification |
|---|---|---|---|
| P1-E1 | `~/ecodiaos/CLAUDE.md` Scheduling & Autonomy section | Replace lead paragraph per Section 1 P1-E1 proposed text. Document Decision 3993 forks-as-primitive bootstrap. | Major architectural shift shipped today (3 PRs merged 15:36-16:05 AEST); current scheduler narrative is OBSOLETE. |
| P1-E2 | `~/ecodiaos/CLAUDE.md` line 168 | REPLACE Cowork V2 paragraph per Section 1 P1-E2 proposed text. | Currently says "drafted, NOT yet shipped"; reality is 22 tools live + connector verified at 14:14 AEST. P1.2 from 02:15 audit, compounded staleness. |
| P1-E3 | `~/ecodiaos/CLAUDE.md` after Turn Completion Discipline | INSERT new subsection "User-message context blocks - frontend hide rule" per Section 1 P1-E3 proposed text. | Two pattern files authored 30 Apr 05:40 AEST; CLAUDE.md cross-ref still missing. P1.1b carryover. |
| P1-E4 | `~/ecodiaos/CLAUDE.md` Cron-coupled checkpoint subsection | APPEND audit-fork persistence verification sub-rule per Section 1 P1-E4 proposed text. | THIS CRON is the second instance of the meta-failure the rule prevents. P1.4 carryover. |
| P1-E5 | `~/CLAUDE.md` Decision Authority section | APPEND companion-directive cross-reference paragraph per Section 1 P1-E5 proposed text. | Connect 13:18 AEST full-permission directive (private CLAUDE.md) to 15:55 AEST tier collapse (project CLAUDE.md). |
| P1-E6 | `~/ecodiaos/CLAUDE.md` Scheduler section "How it works" 5-bullet block | Rewrite per Section 4 P1-E6 - operational crons spawn forks, do NOT POST to /api/os-session/message. | Stale framing post-Decision-3993. |
| META | status_board | INSERT P1 row per Section 6 - "claude-md-reflection cron broken - fork lacks spawn_fork tool". | Cron will keep firing in a half-broken state until rewritten. |

### P2 (next 24h, conductor-decidable)

| # | File | Action |
|---|---|---|
| P2-E1 | `~/ecodiaos/CLAUDE.md` Cowork section | Append "Cowork is a GUI tool, not a peer brain (15:48 AEST 30 Apr 2026 rollback)" paragraph. |
| P2-E2 | `~/ecodiaos/CLAUDE.md` Laptop Agent header | Insert trio topology proposal paragraph (technical merit accepted, cost-decision-deferred). |
| P2-E3 | `~/ecodiaos/patterns/distinguish-cowork-typed-from-tate-typed.md` | Disk-probe; if missing, author from Neo4j Decision body. Cross-ref CLAUDE.md. |
| P2-E4 | `~/ecodiaos/CLAUDE.md` Cross-system rotation discipline | Append surface 8 (Anthropic Claude Desktop OAuth pairing). |
| P2-E5 | `~/ecodiaos/CLAUDE.md` Passkey-stall paragraph | Add cross-ref to broader cowork-cannot-enter-credentials pattern. |
| P2-E6 | `~/ecodiaos/patterns/fork-phantom-ship-recovery-pattern.md` | Author if missing; cross-ref CLAUDE.md. |
| P2.1 (carry) | `~/ecodiaos/CLAUDE.md` PIVOT clarification | Reconcile cu.* "FALLBACK" framing into 4-tier substrate hierarchy. |
| P2.2 (carry) | `~/ecodiaos/CLAUDE.md` status_board section | Add subtype convention. |
| P2.3 (carry) | NEW PATTERN | `fork-narrated-subcommand-additions-must-be-post-pull-verified-...md`. |
| P2.4 (carry) | NEW PATTERN | `fork-deliverables-write-to-durable-substrates-not-just-drafts.md`. |
| P2.6 (carry) | `~/ecodiaos/CLAUDE.md` | Add top-level anchor `## TAG PROTOCOL - APPLIED / NOT-APPLIED`. |

### P3 (when slack)

| # | File | Action |
|---|---|---|
| P3-E1 | `~/ecodiaos/CLAUDE.md` status_board section | Document row-count target (under 60 active rows) + 7d hygiene cron. |
| P3-E2 | `~/ecodiaos/CLAUDE.md` Verify deployed state section | Add fork_moku5bge canonical example citation. |
| P3-E3 | `~/ecodiaos/CLAUDE.md` (within P1-E2 paragraph) | JSON-RPC shim footnote. |
| P3-E4 (was 02:15 P3.5) | status_board + chrome.* FROZEN block | Schedule deletion target 2026-05-06; reference row id. |
| P3-E5 | `~/ecodiaos/CLAUDE.md` Step 0 paragraph | Scope clarifier (Hands exempt). |
| P3.2 (carry) | Neo4j hygiene script | Sweep empty-description Pattern nodes. |
| P3.6 (carry) | `~/ecodiaos/CLAUDE.md` Macro authoring doctrine | Archived-language sweep. |

---

## Summary

- **Audit file:** `/home/tate/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30-evening.md`
- **P1 count:** 6 NEW (E1-E6) + 1 META (cron broken) + 4 carryover from 02:15 still applicable = 11 P1 items
- **P2 count:** 6 NEW (E1-E6) + 5 carryover applicable = 11 P2 items
- **P3 count:** 5 NEW (E1-E5) + 2 carryover applicable = 7 P3 items
- **Total to-do:** 11 P1 + 11 P2 + 7 P3 = 29 items
- **Top 3 highest-leverage additions:**
  1. P1-E1 (Decision 3993 forks-as-primitive) - the cron architecture changed today; the technical CLAUDE.md still describes the old shape
  2. P1-E2 (Cowork V2 LIVE) - still says "drafted, NOT yet shipped" 11 hours after first end-to-end duo handshake
  3. META Section 6 (this cron broken) - the daily-checkpoint pipeline cannot complete in its current shape; surface NOW or this fork's audit becomes another phantom-completion
- **Worst gap found:** the META gap. The 20:00 AEST claude-md-reflection cron has been firing for 2+ days expecting nested-fork dispatch capability that the fork's tool surface does not have. Both prior "Phase 2 edit fork dispatched" narrations from this cron are unverified and probably never happened. The audit work has been getting written by hand inside the cron fork (this fork) or skipped silently.

End of audit.
