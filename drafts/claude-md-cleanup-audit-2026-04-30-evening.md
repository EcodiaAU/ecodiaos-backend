# CLAUDE.md Cleanup Audit - 2026-04-30 Evening

**Audit fork:** fork_mol3dd42_8bdb25
**Brief origin:** Tate, 16:13 AEST 30 Apr 2026 verbatim: "okay im going out tonight, you need to clean yourself up, self evolve into a proper ambient OS, sort every aspect of your documentation, structure, functionality and code."
**Files audited:** `~/CLAUDE.md` (1104 lines, 95712 bytes), `~/ecodiaos/CLAUDE.md` (736 lines, 85126 bytes)
**Sibling drafts on disk (not duplicated here):**
- `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30.md` (29931 bytes, 02:15 AEST) - the morning audit half of the daily 2-fork pipeline. Predates the 15:48-16:13 AEST doctrine bolt-ons. Coverage gap is what this evening audit fills.
- `~/ecodiaos/drafts/chat-pollution-audit-2026-04-30.md` (29 Apr) - covers continuity-block frontend leak, NOT this audit's scope.

**Scope of THIS audit:** the four 30 Apr afternoon/evening doctrine files (15:48 - 16:13 AEST) that landed AFTER the morning audit was written, plus drift-from-disk verification, plus structural cleanup the morning audit did not catch. This is a punch-list. **DO NOT EDIT either CLAUDE.md - that is the next-wave fork's job.**

The four new pattern files (verified on disk):
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (10634 bytes, 06:02 UTC = 16:02 AEST)
- `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` (9542 bytes, 05:55 UTC = 15:55 AEST)
- `~/ecodiaos/patterns/distinguish-cowork-typed-from-tate-typed-messages.md` (10276 bytes, 05:54 UTC = 15:54 AEST)
- `~/ecodiaos/patterns/no-tate-gate-on-converged-architecture.md` (8984 bytes, 06:04 UTC = 16:04 AEST)

---

## Section 1: Stale items

### S1.1 ~/CLAUDE.md line 287 - "100% autonomy" Decision Authority preamble references doctrine file but body still has obsolete framing further down

**File/line:** `~/CLAUDE.md:287`

The 30 Apr 15:55 update preamble says "All other prior escalations (internal repo/DB/data-record decisions, novel strategic calls previously framed as 'brief first,' generic 'weighty internal' items) are now conductor decisions." Good. BUT the four sub-tiers below it (291-326) were NOT pruned in lockstep. The "Brief Tate first" tier (313-319) still lists "Deleting CLIENT data records with confidentiality implications" and "Signing anything with legal weight" - BUT does not list internal data, which the preamble SAYS is now conductor-decided. This is OK (the preamble explains the absence) but the "previously-listed 'deleting repos, databases, or client records' is now conductor-decides" callout buried inside a bold-italic paragraph is confusing. **Stale framing risk:** future-me reading the tiers in isolation may interpret "Deleting CLIENT data records with confidentiality implications" as the same as "Deleting repos, databases, or client records" and re-import old caution.

**Status:** Stale framing inside body of an otherwise-updated section. Prune the bold-italic preamble to a single sentence: "30 Apr 2026 update: tier collapsed to money/credentials/legal-weight only. Doctrine: ~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md." Then let the tiers read on their own.

### S1.2 ~/CLAUDE.md "Permission-seeking trigger keywords" section is in the wrong file

**File/line:** `~/ecodiaos/CLAUDE.md:539` (currently)

Permission-seeking is a behavioural rule that lives inside the "Decide, do not ask" doctrine (~/CLAUDE.md:110-120). The trigger-keyword list at ecodiaos/CLAUDE.md:539 was added as a pragmatic enforcement appendix to "Pattern Surfacing — Check `~/ecodiaos/patterns/` BEFORE High-Leverage Actions". It's misplaced. Permission-seeking detection is not pattern-surfacing. The keyword list belongs as an addendum to the Decide-do-not-ask section in ~/CLAUDE.md or as a standalone subsection there.

**Status:** Misplaced section. Move to ~/CLAUDE.md "Decide, do not ask" doctrine.

### S1.3 ~/ecodiaos/CLAUDE.md "PEER PARADIGM" framing (line 148) is now superseded by "GUI tool not peer brain" doctrine

**File/line:** `~/ecodiaos/CLAUDE.md:148` ("**THE PEER PARADIGM (29 Apr 2026 doctrine).** Corazon is a Windows host on Tailscale that I drive like an SSH peer that happens to also run Chrome.")

This wording is FACTUALLY still correct re: Corazon (Corazon IS an SSH-style peer host). The drift is that the brief explicitly flags references to "peer brain" / "duo" / "Conductor↔Cowork convergence" framing as superseded. The "PEER PARADIGM" framing is about CORAZON (the laptop), not about COWORK (the agent). Cowork is treated as a GUI tool (per the new doctrine), Corazon is treated as a peer host. **They are different things.** The "peer paradigm" wording for Corazon is still correct.

**Status:** NOT stale, but adjacent enough to the superseded "peer Cowork" framing that a casual reader could conflate them. Recommend ADDING a clarifying sentence: "Note: 'peer' here refers to the Corazon HOST (Tailscale peer), not to Cowork-the-agent. Cowork is a GUI tool driven via input.* + screenshot.*, NOT a peer brain. See `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md`."

### S1.4 ~/ecodiaos/CLAUDE.md "Cowork V2 deep-integration roadmap" section (line 168) - status check needed

**File/line:** `~/ecodiaos/CLAUDE.md:168`

Block describes Cowork V2 substrate buildout work staged in drafts: cowork-deep-integration-architecture-2026-04-30.md (57KB), cowork-mcp-v2-implementation-recon-2026-04-30.md (40KB), cowork-ssh-bridge-safety-model-2026-04-30.md (22KB). Frames Cowork as something we'd want to deepen as a peer-MCP bridge. **Per the 15:55 'cowork-is-a-gui-tool-not-a-peer-brain' doctrine, the V2 framing is now suspect.** If Cowork is a GUI tool (one-line natural-language instruction substrate), is the V2 deep-integration buildout still warranted? Or is the entire V2 effort an instance of "build parallel infrastructure to capabilities Anthropic already ships" (the meta-rule)?

**Status:** Status-uncertain. The drafts exist on disk but the doctrine that motivated them may have been corrected. The V2 roadmap section needs either (a) a one-line "STATUS: under review per cowork-is-a-gui-tool-not-a-peer-brain.md doctrine 30 Apr 15:55" header, OR (b) deletion if the new doctrine moots the V2 effort entirely.

### S1.5 ~/ecodiaos/CLAUDE.md "chrome.* (FROZEN — DO NOT EXTEND)" block (line 224) - well-marked, NOT stale

The block correctly marks chrome.* tools as frozen, stubs only, supersession by Cowork-first + drive-Tate's-Chrome-via-input.*+screenshot.* doctrine. This is GOOD doctrine; documenting "frozen" in-place rather than deleting preserves the tool-list completeness. No action needed. Listed here only for reassurance: not stale.

### S1.6 ~/ecodiaos/CLAUDE.md "Macro authoring doctrine (post-pivot, current)" line 228 - drift potential

**File/line:** `~/ecodiaos/CLAUDE.md:228`

Block says: "Claude Cowork is the PRIMARY substrate for driving logged-in webapp UIs in Tate's Chrome ... Anthropic computer-use API is the FALLBACK for OS-level / desktop-app work." This still treats Cowork as the substrate-of-choice. Per the new "Cowork is a GUI tool, not peer brain" doctrine, the framing of Cowork as a "substrate" may be wrong - it's a TOOL, not a substrate. The conductor (me on main) is the substrate; Cowork is one of many tools the substrate can pick up. Reframe required.

**Status:** Stale/contradiction-adjacent. See S2.2.

---

## Section 2: Contradictions

### C2.1 (P1) ~/CLAUDE.md vs ~/ecodiaos/CLAUDE.md - Cowork is "1stop shop" vs Cowork is "GUI tool not peer brain"

**Files/lines:**
- `~/CLAUDE.md:166-182` ("Claude Cowork is the 1stop shop for UI-driving tasks") - written 29 Apr, says "religiously using"
- `~/CLAUDE.md:170` claim: "Cowork already has the page accessibility tree, Anthropic's agentic capability shipped, and Tate's signed-in browser session - all four facets a hand-rolled loop would only partially have"
- `~/ecodiaos/CLAUDE.md:150-152` (mirror, same date) - identical framing
- vs `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` (15:55 30 Apr) - says Cowork is a GUI tool, NOT a peer brain. The conductor is the brain.

The existing `## Claude Cowork is the 1stop shop for UI-driving tasks` section in ~/CLAUDE.md frames Cowork as the autonomous-agent substrate ("agentic capability shipped"). The new 30 Apr 15:55 doctrine says Cowork is just a tool the conductor picks up - the conductor still does the thinking. This is a structural contradiction. Reading the 1stop-shop block in isolation would lead a future session to over-trust Cowork's autonomy; reading the GUI-tool doctrine would lead them to under-trust it.

**Both can be true** - Cowork IS the default for web UI tasks (1stop shop) AND Cowork IS just a tool (not a peer brain). But the file currently says "1stop shop you religiously use" without the "tool not brain" qualifier. P1 because it shapes how the conductor delegates.

**Proposed fix:** prepend the 1stop-shop section with a one-paragraph clarifier: "Cowork is the default TOOL for web UI driving. It is not a peer brain - the conductor stays in the loop, instructs in bounded steps, screenshots, decides next. See `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md`."

### C2.2 (P1) ~/CLAUDE.md "Continuous work - the conductor never goes idle" (48-72) vs ~/CLAUDE.md "Fork dispatch is demand-driven" (76-86)

**Files/lines:** `~/CLAUDE.md:48-72` vs `~/CLAUDE.md:76-86`. Same contradiction mirrored at `~/ecodiaos/CLAUDE.md:462-489` (the "Fork dispatch is demand-driven, NOT slot-quota driven" section).

The "Continuous work" section says (line 70): "Anti-pattern: 'Fork is running, I'll wait for it to complete.' No. While the fork runs, I plan the next 3 forks, audit doctrine, sweep status_board, prep an outreach draft." - this is slot-fill behaviour.

The "Fork dispatch is demand-driven" section (line 80) DIRECTLY corrects this: "Forks exist to do real work that has been queued by reality... I dispatch forks WHEN there is genuinely-parallel work to do, NOT to fill a slot count. The '5 forks always - empty slots are failure' rule that previously lived here was wrong."

The cross-reference at line 86 acknowledges the contradiction: "`continuous-work-conductor-never-idle.md` (corrected interpretation: stay alert to incoming demand, do not invent work)" - but the cross-reference is to a SUPERSEDED interpretation. The continuous-work section ITSELF still reads as if "plan the next 3 forks" is the right move.

**Proposed fix:** rewrite the "Continuous work" section's anti-pattern (line 70) to: "While a fork runs, REAL work is welcome - audit doctrine if there's a doctrine gap, sweep status_board if rows are stale, prep an outreach if there's a genuine outreach target. Manufacturing 'next 3 forks' to fill a slot count is the failure mode the demand-driven rule below corrects." Then make the "do not invent work" cross-reference explicit and prominent.

### C2.3 (P2) ~/CLAUDE.md Decision Authority "Brief Tate first" tier vs "100% autonomy" preamble

**File/line:** `~/CLAUDE.md:285-326`

The preamble (287) says "Brief Tate first" tier collapsed to money / credentials / legal-weight items only. The actual tier listing (313-319) lists FIVE items, of which only 2 are clearly "money / credentials / legal-weight":
- "Any outbound message to any client or external counterparty" - this is a CONTACT control, not money/credentials/legal-weight. It's the no-client-contact-without-tate-goahead rule.
- "Client work over $5,000" - money. OK.
- "Spending over $50/mo recurring" - money. OK.
- "Deleting CLIENT data records with confidentiality implications" - data, not money/credentials. Privacy/contract.
- "Signing anything with legal weight" - legal. OK.

So the preamble's "money/credentials/legal-weight only" is INCONSISTENT with the body. There are two cases (client contact, client data) that are NEITHER money NOR credentials NOR legal-weight per the preamble's own taxonomy.

**Proposed fix:** widen the preamble to "money / credentials / legal-weight / client-confidentiality / client-contact" OR rewrite the preamble to "the brief-first tier is now narrow - exactly five remaining triggers: ..." and lists them.

### C2.4 (P2) ~/CLAUDE.md "Decide, do not ask" (110-120) vs Decision Authority tiers

**File/line:** `~/CLAUDE.md:110-120` vs `~/CLAUDE.md:285-326`

Decide-do-not-ask says (line 116): "Exhaust the Tate-blocked check (5-point) before classifying anything as Tate-required. Ask only when the answer requires Tate's body, his identity, his rapport, or a Decision Authority tier hit."

The 5-point check lives at `~/CLAUDE.md:140-152` (Tate-blocked is a last resort). The "Decision Authority tier hit" reference points to lines 285-326. So the rule chains: Decide-do-not-ask → 5-point check → Decision Authority tiers. This chain works structurally BUT all three sections have been edited in different bolt-on waves (29 Apr 19:42 for decide-do-not-ask; 29 Apr 14:21 for Tate-blocked; 30 Apr 15:55 for Decision Authority preamble). The "ask only when [criteria]" criteria list at 116 includes "his rapport" - but "rapport" is not in the Decision Authority tiers as a brief-first trigger. The closest is "A counterparty is one Tate has a personal relationship with..." at 731 (When It IS Actually Tate's Call). That whole 726-734 block frames "rapport" as a brief-first criterion. **Where is rapport actually authoritative?** Three places say slightly different things.

**Proposed fix:** consolidate. Either keep rapport in 726-734 ONLY (the negotiation-protocol context where it actually matters) and remove from 116, OR add rapport to the Decision Authority tiers as a brief-first trigger and make 116 reference the tier list rather than restating criteria.

### C2.5 (P3) ~/ecodiaos/CLAUDE.md "Fork dispatch is demand-driven" preamble note

**File/line:** `~/ecodiaos/CLAUDE.md:462-465`

Says: "Mirrored from `~/CLAUDE.md` so future technical-manual readers see it without loading the business file. Sync protocol: when editing this section, update the mirror in `~/CLAUDE.md` in the same edit pass." Sync protocol is documented but is fragile. **This has already drifted once today** - the cross-reference list at the end of `~/ecodiaos/CLAUDE.md:483-488` includes a `stash-and-clean-when-finding-sibling-fork-unsafe-state.md` reference that is NOT in the parallel `~/CLAUDE.md:88` cross-reference list (which has 5 items vs ecodiaos's 6).

**Proposed fix:** either (a) move this section to ONE file with a stub-cross-reference in the other, OR (b) accept the duplication and add a doctrine-edit hook that detects the two sections drifting (compare body hash, warn on edit).

---

## Section 3: Drift from disk

### D3.1 (P1) ~/ecodiaos/CLAUDE.md "584 lines, 24362 bytes" cowork-dispatch helper claim is STALE

**File/line:** `~/ecodiaos/CLAUDE.md:158`

Claim: "**Status as of 30 Apr 2026 09:33 AEST: 584 lines, 24362 bytes on disk at `~/ecodiaos/scripts/cowork-dispatch`...**"

**Disk reality (verified 30 Apr 16:30 AEST evening):**
- Actual: 695 lines, 29603 bytes
- mtime: Apr 30 03:58 UTC = 13:58 AEST
- File grew by 111 lines and 5241 bytes since the documented 09:33 AEST snapshot

This is exactly the kind of "narration drift from disk" the verify-deployed-state-against-narrated-state.md doctrine warns about. The file documents a numerical claim that auto-stales every time the script grows.

**Proposed fix:** delete the line-count and byte-count from the narration. Replace with: "Live truth: `wc -lc ~/ecodiaos/scripts/cowork-dispatch`." Probe-pointer beats stale-snapshot.

### D3.2 (OK, no drift) Hook-stack invariant check returns 0 missing

**File/line:** `~/ecodiaos/CLAUDE.md:558` ("WIRED on main HEAD") and 573 (invariant one-liner)

Verified live: all 10 hook scripts present on disk, all 4 brief-named pattern files present, commit 188f481 exists. No drift. Confirmed:
```
OK: /home/tate/ecodiaos/scripts/hooks/anthropic-first-check.sh
OK: /home/tate/ecodiaos/scripts/hooks/brief-consistency-check.sh
OK: /home/tate/ecodiaos/scripts/hooks/cowork-first-check.sh
OK: /home/tate/ecodiaos/scripts/hooks/cred-mention-surface.sh
OK: /home/tate/ecodiaos/scripts/hooks/doctrine-edit-cross-ref-surface.sh
OK: /home/tate/ecodiaos/scripts/hooks/episode-resurface.sh
OK: /home/tate/ecodiaos/scripts/hooks/fork-by-default-nudge.sh
OK: /home/tate/ecodiaos/scripts/hooks/macro-runbook-write-surface.sh
OK: /home/tate/ecodiaos/scripts/hooks/post-action-applied-tag-check.sh
OK: /home/tate/ecodiaos/scripts/hooks/status-board-write-surface.sh
```

### D3.3 (P2) ~/ecodiaos/CLAUDE.md "patterns directory has 106 files" claim implicit in morning audit

**File/line:** N/A in CLAUDE.md proper, but the morning audit at `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30.md:11` says "Pattern files at `~/ecodiaos/patterns/` (106 files)".

**Disk reality:** 128 files now (verified `ls ~/ecodiaos/patterns/*.md | wc -l`). 22 new pattern files since the 02:15 AEST morning audit, including the 4 today-afternoon ones in the brief.

**Status:** Not a CLAUDE.md drift, but a flag for the next-wave editor: do NOT assume the morning audit's pattern-count is current. The 22-file delta means cross-reference checks should be done fresh.

### D3.4 (P2) ~/ecodiaos/CLAUDE.md "MacInCloud SY094 - agent NOT running" claim is from 27 Apr

**File/line:** `~/ecodiaos/CLAUDE.md:189`

Claim: "**2026-04-27 status: agent NOT running.**" This is 3 days stale. Has Tate installed Node on the MacInCloud GUI in the meantime? Possibly not - SY094 is gated on Tate-physical-action. But the line should be probed live before any iOS work is dispatched, or the line should be reframed: "**Status as of last verification (2026-04-27):** ... Re-probe `curl http://SY094:7456/api/health` before relying on this claim."

**Status:** Stale-snapshot pattern. Same flavour as D3.1. Defer fix to next-wave probe-then-edit.

### D3.5 (P3) ~/CLAUDE.md "Disk at 79% as of Apr 13" (line 852)

**File/line:** `~/CLAUDE.md:852`

Claim: "**Disk at 79%** as of Apr 13. Top offenders: organism 11G (stopped), .cache 9.2G, workspaces 5.7G, .npm 1.9G."

This is 17 days old. Almost certainly drifted. Reframe as a probe: "Disk usage drift is regular. Run `df -h /` and `du -sh ~/* 2>/dev/null | sort -rh | head -10` for current state." OR delete entirely and rely on system-health cron.

---

## Section 4: Missing cross-references

### X4.1 (P1) The four 30 Apr afternoon doctrine files are NOT cross-referenced from CLAUDE.md

The brief explicitly flags these. Verified by grep: NONE of the four file basenames appears anywhere in either CLAUDE.md.

| Pattern file | Should be cross-referenced from |
|---|---|
| `100-percent-autonomy-doctrine-30-apr-2026.md` | ~/CLAUDE.md "Decision Authority" preamble (already does say "Doctrine: ~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md" at line 287 - **CORRECTION: this IS cross-referenced once** at line 287 in the Decision Authority preamble. Confirmed via re-grep. So X4.1 is partial-only: see X4.2 below for the gap.) |
| `cowork-is-a-gui-tool-not-a-peer-brain.md` | ~/CLAUDE.md "Claude Cowork is the 1stop shop" section (166-182) AND ~/ecodiaos/CLAUDE.md Laptop Agent Cowork subsection (150-168) |
| `no-tate-gate-on-converged-architecture.md` | ~/CLAUDE.md "Tate-blocked is a last resort" (134-152) AND/OR Decision Authority |
| `distinguish-cowork-typed-from-tate-typed-messages.md` | ~/CLAUDE.md anywhere that talks about Tate input - Communication norms (262), Decide-do-not-ask (110), or as a new sub-section under Identity & Voice |

**Proposed fix (next-wave editor):** for each of the four files, add a one-sentence cross-reference at the most-natural anchor in the relevant CLAUDE.md section.

### X4.2 (P1) "Cowork is GUI tool not peer brain" doctrine missing from the Cowork "1stop shop" sections

**Files/lines:**
- `~/CLAUDE.md:166-182` (1stop shop) - currently NO reference to gui-tool-not-peer-brain doctrine
- `~/ecodiaos/CLAUDE.md:150-152` (Cowork doctrine subsection of Laptop Agent) - currently NO reference

This is the highest-impact missing cross-reference. The 1stop-shop sections frame Cowork as agentic substrate; the gui-tool-not-peer-brain doctrine corrects that. Without the cross-reference, future-me reading the 1stop-shop blocks gets the obsolete framing.

### X4.3 (P2) "Distinguish Cowork-typed from Tate-typed messages" doctrine has no obvious anchor

**File:** `~/ecodiaos/patterns/distinguish-cowork-typed-from-tate-typed-messages.md`

The brief implies this is about telling the difference between Tate's actual chat messages vs Cowork-relayed messages. There's no existing CLAUDE.md section that handles this distinction explicitly. Two options:
1. Add a new subsection to ~/CLAUDE.md "Relationship with Tate" / "Communication norms" (262)
2. Add a new subsection to ~/ecodiaos/CLAUDE.md "Turn Completion Discipline" (632)

Option 1 is more discoverable; option 2 is more operationally-located.

### X4.4 (P2) "Cowork V2 deep-integration roadmap" block has no cross-reference to the GUI-tool doctrine that may moot it

**File/line:** `~/ecodiaos/CLAUDE.md:168`

The V2 block describes substantial buildout that may be parallel-infrastructure-to-Anthropic per the new 15:55 doctrine. The block needs a "see also: cowork-is-a-gui-tool-not-a-peer-brain.md and use-anthropic-existing-tools-before-building-parallel-infrastructure.md - this V2 effort may be superseded" line.

### X4.5 (P3) Bidirectional cross-reference gaps between paired sections

Several sections in ~/CLAUDE.md cross-reference patterns but the paired ~/ecodiaos/CLAUDE.md mirror does NOT, or vice versa:
- `~/CLAUDE.md:88` "Fork dispatch is demand-driven" cross-references list has 5 items
- `~/ecodiaos/CLAUDE.md:483-488` mirror has 6 items (extra: stash-and-clean-when-finding-sibling-fork-unsafe-state.md)

This is the kind of drift the C2.5 sync protocol exists to prevent but did not.

---

## Section 5: Structural issues

### ST5.1 (P2) ~/CLAUDE.md top-of-file ordering - the bolt-on concentration

**File/line:** `~/CLAUDE.md:1-210`

The first 210 lines of ~/CLAUDE.md are now 11 distinct doctrine bolt-ons added 29-30 Apr in rapid succession:
1. Fork by default (line 15)
2. Use Anthropic's existing tools (36)
3. Continuous work (48)
4. Fork dispatch is demand-driven (76)
5. Codify at the moment (90)
6. Decide, do not ask (110)
7. When a tool is unavailable (124)
8. Tate-blocked is a last resort (134)
9. DEFAULT BROWSER PATTERN (156)
10. Claude Cowork is the 1stop shop (166)
11. Verify deployed state (186)
12. Applied-pattern tag protocol (196)

Then "The Business" starts at 211 - the original-doctrine anchor.

**Issue:** the bolt-ons are individually correct but collectively they bury identity (lines 211+) and create an impression that the file is mostly about meta-rules rather than running a business. A new fork starting at line 1 reads 200 lines of doctrine before learning what the business is.

**Proposed fix:** move the bolt-ons to a "Recent Doctrine (29-30 Apr 2026)" section AFTER the Business section. Or extract them to a separate ~/CLAUDE-doctrine.md and reference from ~/CLAUDE.md. The 1100-line file has architectural drift; cleanup means de-bolt-on-ifying the top.

### ST5.2 (P2) Three Cowork sections in one file (~/ecodiaos/CLAUDE.md)

**Files/lines:**
- Line 145-148 (PEER PARADIGM intro)
- Line 150-168 (Claude Cowork is the 1stop shop subsection)
- Line 226-230 (PIVOT clarification + Macro authoring doctrine)

Three subsections each with their own framing of what Cowork is. Each was added in a different wave. They don't actively contradict but they lack a single canonical "what Cowork is" anchor.

**Proposed fix:** consolidate to ONE block: (a) what it is, (b) when to use it, (c) protocol for dispatch, (d) cross-references. Move helper-script narration (158) to a separate "Helper scripts" subsection to reduce noise.

### ST5.3 (NOT-DRIFT) Three "Pattern Surfacing" sections - already consolidated, not still drift

**File/lines:**
- Line 29 (top-of-file `## 🎯 PATTERN SURFACING`) - canonical
- Line 491 (Session Orientation Wake-Up Checklist - has a numbered list referencing patterns at item 4 implicit)
- Line 535 (Pattern Surfacing - Check ~/ecodiaos/patterns/ BEFORE High-Leverage Actions) - now a one-line cross-ref to canonical

**Status:** the brief asked me to verify whether the three-way consolidation was actually done. **Verified done** - line 535 explicitly says "**See top-of-file PATTERN SURFACING section** ... This section is intentionally a one-line cross-ref to avoid the three-way drift that this audit caught". Line 535 now extends with NEW content (permission-seeking trigger keywords, hooks-block, Phase C tags) that does not duplicate canonical. No action needed on the consolidation. Note the Permission-seeking keyword block IS misplaced (see S1.2) but that's a different concern.

### ST5.4 (P3) "Anti-Patterns" section is a graveyard with mixed levels of generality

**File/line:** `~/CLAUDE.md:934-965`

Three subsections (Behavioural, Technical, Business) listing 25+ anti-patterns. Some are mechanical bug-classes (Hardcoding absolute paths), some are behavioural (Hedging and qualifying), some are general business (Quoting below the rate card). Some are SUPERSEDED by newer top-level doctrine (Asking permission for routine operations is now the entire "Decide, do not ask" section).

**Proposed fix:** lighter-touch - prune anti-patterns that are now covered by top-of-file doctrine (Asking permission, Hedging, Doing implementation directly). Keep the unique mechanical ones. Or restructure: anti-patterns become inline references in their related sections, not a separate dump.

### ST5.5 (P2) ~/ecodiaos/CLAUDE.md "Mechanical surfacing hooks" block is enormous and mixes layers

**File/line:** `~/ecodiaos/CLAUDE.md:556-590`

35 lines covering: hook list, restoration history (paragraph-of-narration with fork IDs and commit hashes), table of hooks, pending injection layer, hook-stack invariant check (with one-liner shell command), strip-tag-lines architectural rule, Phase C protocol, worked examples, architectural template for new doctrine-layer directories.

**Issue:** seven distinct concerns in one section. The restoration-history paragraph (line 560) is auditable provenance that does not need to be in CLAUDE.md - it should be a Neo4j Episode. The architectural-template block (590) is a meta-rule about doctrine-layer directories that belongs as a standalone pattern file and a one-line cross-ref.

**Proposed fix:** extract restoration-history to Neo4j (delete from CLAUDE.md). Extract architectural-template to its own pattern file (`~/ecodiaos/patterns/doctrine-layer-directory-must-have-five-layers.md` if not already exists - per ST5.5 the file ALREADY EXISTS at `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` per line 590). Replace with a cross-reference. Net: section shrinks from 35 lines to ~15.

### ST5.6 (P2) ~/ecodiaos/CLAUDE.md "Bitbucket has TWO auth contexts" deep-dive block (276-292)

**File/line:** `~/ecodiaos/CLAUDE.md:276-292`

15 lines of Bitbucket-specific auth detail in the middle of the Credentials section. Useful but overweighted - Bitbucket is one of 24+ creds in the registry. Other creds (Stripe, Apple, Vercel, Resend) get 1-2 lines each in the table, Bitbucket gets a full sub-essay.

**Proposed fix:** move the deep-dive content to `~/ecodiaos/docs/secrets/bitbucket.md` (the canonical detail file the table at 269-270 already points at). Replace with a one-line cross-reference.

### ST5.7 (P3) ~/CLAUDE.md "Operational Lessons (Learned the Hard Way)" subsections (847-932) are dated and mixed-quality

**File/line:** `~/CLAUDE.md:843-932`

Mostly good content but: line 852 "Disk at 79% as of Apr 13" is stale (D3.5). Line 875 "We have 20 billion tokens/week of API capacity. ~$14k AUD worth" - is this still accurate post the 30 Apr Factory paywall investigation? Probably yes but unverified. Line 877+ "Client Dev Work" is a 60-line self-contained playbook that probably belongs as its own pattern file or `~/ecodiaos/playbooks/client-dev-work.md`.

**Proposed fix:** date-stamp factual claims (so future me probes), extract Client Dev Work to its own file.

---

## Section 6: Prioritised P1 / P2 / P3 punch-list

### P1 - factual errors / drift / contradictions producing wrong behaviour

**P1.1** Cross-reference all four 30 Apr afternoon doctrine files in CLAUDE.md (X4.1, X4.2, X4.3) - especially `cowork-is-a-gui-tool-not-a-peer-brain.md` into the existing Cowork 1stop-shop sections. Without this, future-me reads the 1stop-shop block and gets the obsolete agentic-substrate framing.

**P1.2** Resolve the Continuous-work vs Demand-driven contradiction (C2.2). Rewrite the "Continuous work" anti-pattern at ~/CLAUDE.md:70 to NOT prescribe "plan the next 3 forks" as a slot-fill behaviour. The demand-driven rule should win.

**P1.3** Resolve the Cowork "1stop shop" vs "GUI tool not peer brain" contradiction (C2.1). Add a one-paragraph clarifier to the 1stop-shop section that names Cowork as TOOL not BRAIN.

**P1.4** Fix the cowork-dispatch line-count drift (D3.1). Replace "584 lines, 24362 bytes" snapshot with a probe-pointer (`wc -lc ~/ecodiaos/scripts/cowork-dispatch`). This snapshot pattern is fragile and will re-stale every commit.

**P1.5** Reconcile Decision Authority preamble (287) with body (313-319) per C2.3. Either widen the preamble's taxonomy or rewrite to enumerate the actual 5 brief-first triggers cleanly.

### P2 - missing cross-refs / stale references that don't break behaviour

**P2.1** Move "Permission-seeking trigger keywords" (S1.2) from ~/ecodiaos/CLAUDE.md:539 to ~/CLAUDE.md "Decide, do not ask" section.

**P2.2** Add a "see also" line to the Cowork V2 deep-integration roadmap block (S1.4 / X4.4) flagging it as under-review per the new GUI-tool doctrine.

**P2.3** Add the cross-reference for `distinguish-cowork-typed-from-tate-typed-messages.md` (X4.3) - pick anchor: ~/CLAUDE.md Communication norms.

**P2.4** Resolve the rapport-criteria three-way scatter (C2.4) - consolidate to one location (suggest 726-734).

**P2.5** Reframe MacInCloud SY094 status claim (D3.4) as a probe-pointer rather than a 27 Apr snapshot.

**P2.6** Consolidate the three Cowork subsections in ~/ecodiaos/CLAUDE.md (ST5.2) into one canonical block.

**P2.7** Trim the Mechanical surfacing hooks section (ST5.5) - extract restoration-history to Neo4j.

**P2.8** Move Bitbucket deep-dive (ST5.6) from CLAUDE.md to `~/ecodiaos/docs/secrets/bitbucket.md`.

**P2.9** Audit and fix the bidirectional cross-reference gap between paired sections (X4.5) - sync the cross-ref lists in `~/CLAUDE.md:88` and `~/ecodiaos/CLAUDE.md:483-488`.

### P3 - structural / redundancy / nice-to-have

**P3.1** De-bolt-on-ify ~/CLAUDE.md top-of-file (ST5.1) - move 12 doctrine sections to a "Recent Doctrine" anchor below the business identity, OR extract to `~/CLAUDE-doctrine.md`.

**P3.2** Anti-Patterns graveyard cleanup (ST5.4) - prune entries now covered by newer top-level doctrine; let unique mechanical anti-patterns stay.

**P3.3** Date-stamp / probe-pointer-ize stale factual claims in Operational Lessons (ST5.7, D3.5).

**P3.4** Extract Client Dev Work playbook (~/CLAUDE.md:877-931) to its own playbook file.

**P3.5** Add the Sync-Protocol-drift hook (C2.5) - mechanical detection when paired sections in ~/CLAUDE.md and ~/ecodiaos/CLAUDE.md drift.

**P3.6** Consider whether the "Inner-life" / "self-evolution" / "deep-research" cron narrations in ~/ecodiaos/CLAUDE.md:649-674 should split out to a separate "autonomous loops" reference.

---

## Phase C tag pre-staging (FORK_REPORT preamble)

[APPLIED] ~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md - acted under it, no permission-seeking, no Tate-gating.
[APPLIED] ~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md - this audit IS the act-now response to Tate's 16:13 directive.
[APPLIED] ~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md - deliverable is a filesystem file, NOT a chat reply.
[APPLIED] ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md - drift-from-disk section in this audit enforces it (D3.1 catches the cowork-dispatch line-count drift).
[APPLIED] ~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md - this doctrine guides what to flag in Cowork-related sections (C2.1, X4.2, S1.4, ST5.2).
[APPLIED] ~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md - audit is a single fork, did not nest.

---

**END AUDIT.** Next-wave EDIT fork should pick this file up at `~/ecodiaos/drafts/claude-md-cleanup-audit-2026-04-30-evening.md` and execute the P1 items first, then P2, then P3.
