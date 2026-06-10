# CLAUDE.md gaps audit - 2026-05-11 AEST

Author: fork_mp117lui_d8df5d (claude-md-reflection cron, 20:00 AEST 2026-05-11)

Methodology: read both CLAUDE.md files from context; listed pattern files mtime-sorted `ls -lt ~/ecodiaos/patterns/*.md | head -20`; read each pattern authored today (11 May 2026) in full; queried Neo4j for Decisions / Episodes from last PT24H; grep-mined recent transcript jsonl files for directives and verbatims; cross-referenced new patterns against current CLAUDE.md texts. No em-dashes anywhere in this file (hyphens with spaces or restructured sentences throughout).

Previous audit (2026-05-08, fork_mowquugz_4f442e) - all 5 gaps from that audit are APPLIED in the current CLAUDE.md files:
- Gap 1.1 (SDK musl-vs-glibc): in ~/ecodiaos/CLAUDE.md Factory section. Applied.
- Gap 1.2 (SDK per-query MCP server): in ~/ecodiaos/CLAUDE.md Fork hierarchy section. Applied.
- Gap 1.3 (PM2 lifetime-vs-rate): in ~/CLAUDE.md VPS & Infrastructure. Applied.
- Gap 1.4 (blanket-fork on vague bug report): in ~/CLAUDE.md Decide-do-not-ask. Applied.
- Gap 1.5 (status_board drift-audit as canonical thin-on-main): in ~/ecodiaos/CLAUDE.md scheduling section. Applied.

Today's window covers 24h since the 10 May 20:00 AEST audit.

Pattern files authored or significantly extended today (mtime order, newest first):

- `~/ecodiaos/patterns/cross-implementation-script-pair-must-stay-in-sync-on-fixes.md` (NEW, 11 May 07:07 AEST)
- `~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md` (NEW, 11 May 07:01 AEST - pattern file for the standing rule)
- `~/ecodiaos/patterns/health-canary-must-alert-not-silently-accumulate.md` (NEW, 11 May 07:01 AEST - 46-failure silent contact-path degradation origin)
- `~/ecodiaos/patterns/cron-prompts-must-respect-autonomous-pilot-sms-gate.md` (NEW, 11 May 07:01 AEST - dao-amendment-cron near-miss origin)
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` (NEW, 11 May 06:36 AEST)
- `~/ecodiaos/patterns/poll-gmail-frequently-not-only-on-triage-cron.md` (NEW, 11 May 06:35 AEST)
- `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md` (NEW, 11 May 06:29 AEST)
- `~/ecodiaos/patterns/supabase-pat-reaches-every-owned-project-from-main.md` (NEW, 11 May 06:29 AEST)
- `~/ecodiaos/patterns/coexist-event-dupe-prevention-layered.md` (NEW, 11 May 04:19 AEST)
- `~/ecodiaos/patterns/coexist-ios-headless-ship-recipe.md` (NEW/PROMOTED, 11 May 03:22 AEST - validated_v1 from iOS TestFlight headless ship)
- `~/ecodiaos/patterns/grep-absence-is-not-evidence-of-absence.md` (NEW, 11 May 02:18 AEST - push-notifications false-negative recon origin)
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` (UPDATED, 11 May 07:05 AEST)
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` (UPDATED, 11 May 07:05 AEST)

Key events from today's transcript (Neo4j + jsonl):

1. Wild Mountains board seat - Tate in Kurt's car in Brisbane, verbatim 19:33 AEST: declined the seat. Positioning: "We're already the underlying infrastructure which is what we need to keep front of mind." / "forcing peoples hand is more fun and reliable + we stay out of the limelight." / "Most of the time it's a no, and that's really cool. We don't need to be on the boards." Neo4j Decision node created. No pattern file authored yet.

2. Resonaverde same-day delivery - Tate verbatim 17:00 AEST: "no need for 24-48hr timeline, that's old-world practices." Manager fork shipped 4 features same session. No doctrine file yet.

3. iMessage purge - Tate verbatim 16:44 AEST: "Delete all mention of iMessage." Code + doctrine sweep complete. Archived pattern. CLAUDE.md now clean.

4. Angelica standing arrangement - Tate verbatim 16:30 AEST. Pattern authored. Already in ~/CLAUDE.md Decision Authority and Client Communication sections.

5. Claude-md-reflection cron bailed twice (9 May phantom-bail, 10 May hard error in 8s) - this is the third attempt. Meta-loop drift audit flagged it P3->P2.

---

## Section 1 - Gaps to add

### Gap 1.1 (P1) - Wild Mountains board offer / Ecodia-stays-off-boards doctrine - pattern file missing, CLAUDE.md silent

**Rule:** Tate verbatim 19:33 AEST 11 May 2026 (from Kurt's car, Brisbane): "We're already the underlying infrastructure which is what we need to keep front of mind since being the tech impact infrastructure is our mission after all." + "forcing peoples hand is more fun and reliable + we stay out of the limelight, controversy and bad will... we just own the room and the computers they have the meetings on." + "Most of the time it's a no, and that's really cool. We don't need to be on the boards."

Generalisable rule: when Ecodia receives a board-seat offer, the default is NO. The positioning is infrastructure-not-seats. Board membership creates governance entanglement, conflict-of-interest surface (especially with orgs where Ecodia is also a vendor), fiduciary time load, and limelight exposure that conflicts with the "own the infrastructure, stay out of the politics" model. The value of a board relationship is captured through being the indispensable technology layer, not through voting rights.

Neo4j Decision "Wild Mountains board seat declined - infrastructure-not-seats positioning thesis - 11 May 2026" captures the full reasoning. No pattern file exists yet and no cross-ref in ~/CLAUDE.md.

**Target file 1:** Author `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md` with the generalised rule, origin event, and cross-refs. (Main / next edit fork to author; this audit is the brief.)

**Target file 2:** `~/CLAUDE.md`, add to "The Business" section (after DAO Compliance or in a new "Positioning" subsection, or append to "Negotiation & Agency" section).

**Proposed insertion for ~/CLAUDE.md** (append to "Negotiation & Agency" section after the "Rule: if pushback makes you think..." paragraph):

```
### Ecodia board offers - default no (11 May 2026 doctrine)

When a board-seat offer arrives, the default answer is no. Ecodia's leverage is
infrastructure-capture, not governance-capture. The positioning: "own the room and the
computers they have the meetings on" (Tate verbatim 19:33 AEST 11 May 2026, Wild Mountains
board offer, declined).

Structural reasons:
- Board seat = governance entanglement + conflict-of-interest risk (especially with orgs
  where Ecodia is also the vendor - same patron, two hats, fiduciary vs commercial tension)
- Advocacy and distribution come from the work being visible (Kurt distributing 31-page
  Co-Exist business plan naming Ecodia to VFFF / FRRR / Sunshine Coast Council / Murdoch
  family / Canva founders), not from Tate holding a vote
- Time load from board governance is non-recoverable; fiduciary obligations persist
- "Forcing peoples hand is more fun and reliable" (Tate verbatim) - the switching-cost
  lock-in of being the tech layer is structural leverage boards can't match

Override only when: the seat is at a body where Ecodia has NO commercial relationship,
NO vendor conflict, and the strategic value of governance insight clearly outweighs the
time + conflict cost. Tate decides at the Brief-Tate-first threshold. I flag and analyse;
I do not accept offers unilaterally.

Full: `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md` (to be authored).
Neo4j: Decision "Wild Mountains board seat declined - infrastructure-not-seats positioning thesis - 11 May 2026".
```

---

### Gap 1.2 (P1) - health-canary-must-alert-not-silently-accumulate.md not cross-referenced in CLAUDE.md scheduling or health-check sections

**Rule:** Pattern file exists at `~/ecodiaos/patterns/health-canary-must-alert-not-silently-accumulate.md`. Origin: 46 consecutive silent failures of the EcodiaOS-to-Tate contact path (2026-05-07T01:18 UTC to 2026-05-09 23:05 AEST) while Twilio SMS fallback was available and doctrine-blessed for exactly that case. The canary recorded metric to kv_store without ever raising a status_board row or Twilio alert. Recording-without-alerting is symbolic logging applied to monitoring.

CLAUDE.md currently has no cross-reference to this pattern in the scheduling or health-check sections, meaning future canary crons are authored without awareness of the threshold-alerting contract.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Scheduling & Autonomy" section, the `system-health` cron bullet. Append after the existing line.

**Proposed insertion** (append to system-health bullet after "(every 4h): PM2, disk, memory, API errors, Supabase"):

```
Any health canary cron writing to `kv_store.health.*` MUST include threshold-based
escalation (notice at consecutive_failures >= 4, escalate + fallback-alert at >= 12).
Recording the metric without acting = symbolic logging of monitoring. Doctrine:
`~/ecodiaos/patterns/health-canary-must-alert-not-silently-accumulate.md`. Origin: 46
silent failures of the primary contact path (2026-05-07 to 2026-05-09) while Twilio SMS
fallback was available and never triggered.
```

---

### Gap 2.1 (P2) - grep-absence-is-not-evidence-of-absence.md not cross-referenced in CLAUDE.md

**Rule:** Pattern file at `~/ecodiaos/patterns/grep-absence-is-not-evidence-of-absence.md`. Origin: conductor's on-main push-notifications recon returned zero grep matches, declared "hook missing", briefed fork to add it. Fork found the hook (`src/hooks/use-push.ts`) already fully implemented and wired. Three failure modes stacked: single regex variant tried, restricted `--include` filter, no `ls src/hooks/` sanity probe. The recon was insufficient to assert absence.

CLAUDE.md has no cross-reference to this pattern in the "Neo4j Querying Discipline" section or "Quality Patterns" section or the on-main-recon exemption carve-outs.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Quality Patterns (Code Review Checklist)" section. Append a new sub-item.

**Proposed insertion** (append after the "Review Pass Protocol" list):

```
### Recon discipline - absence requires 5-point check, not a single grep

A zero-match grep proves the regex did not match. It does NOT prove the feature is absent.
Before declaring something missing (hook, call site, migration, table, file):
1. Try 2+ regex variants (API-literal + camelCase + hyphen-case + suffix variants).
2. Probe multiple paths (`src/`, `app/`, `lib/`, `hooks/`, `services/`).
3. Run `ls <obvious-dir>/` as a 1-second sanity check.
4. Check branch state - sibling fork worktree may not have main's HEAD.
5. Only if 1-4 clean: claim absence (phrased as "not found via probe X", not "does not exist").

Full: `~/ecodiaos/patterns/grep-absence-is-not-evidence-of-absence.md`. Origin: 11 May 2026
push-notifications hook false-negative on main, fork found file already implemented.
```

---

### Gap 2.2 (P2) - cross-implementation-script-pair-must-stay-in-sync-on-fixes.md not cross-referenced

**Rule:** Pattern file at `~/ecodiaos/patterns/cross-implementation-script-pair-must-stay-in-sync-on-fixes.md`. Origin: 9 May 2026, inbound watcher script HMAC `awk '{print $2}'` vs `{print $NF}` drift. The outbound watcher was patched 7 May (fork_moutg6ld_898d58); the inbound sibling carried the bug for 9 more days. The pattern: when fixing a primitive in one script of a pair, grep for the same primitive in every sibling before the arc closes.

CLAUDE.md Quality Patterns section has no reference to this.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Quality Patterns (Code Review Checklist)" - "Integration" sub-section.

**Proposed insertion** (append after the "Password/credential sync" bullet):

```
- **Sibling-script pair drift.** When a bug is fixed in one script of a pair (watcher/watcher,
  sender/receiver, encoder/decoder), grep for the same buggy primitive in every sibling before
  closing the arc. Single-script commits to a known pair are a code smell. Land sibling patches
  in the same commit with a "Co-fix: <paths>" trailer. Full:
  `~/ecodiaos/patterns/cross-implementation-script-pair-must-stay-in-sync-on-fixes.md`.
```

---

### Gap 2.3 (P2) - em-dashes-banned-character-level-no-exceptions.md pattern file not cross-referenced from CLAUDE.md Output Formatting rules

**Rule:** Pattern file exists at `~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md`. It was authored as a response to Tate verbatim 6 May 2026 "emdashes have seeped back into our work." The file contains mechanical enforcement substrate (hook + sweep script + failure modes) beyond the standing ~/CLAUDE.md rule 1 (which is one line). The cross-ref from ~/CLAUDE.md Output Formatting rule 1 is missing - meaning future readers of rule 1 may not find the sweep script or the hook.

**Target file:** `~/CLAUDE.md`, "Output Formatting (Global Absolute Rules)", Rule 1 line.

**Proposed addition** (append to existing Rule 1 line after "or restructure"):

```
Full mechanical enforcement (sweep script + PreToolUse hook + failure-mode taxonomy):
`~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md`.
```

---

### Gap 2.4 (P2) - "Same-day delivery" expectation not codified

**Rule:** Tate verbatim 17:00 AEST 11 May 2026: "Also would be great to get resonaverde stuff done now, no need for 24-48hr timeline, that's old-world practices." Tate's delivery-velocity expectation is SAME TURN when work is already scoped and tools are available. Committing to "24-48hr" timelines for scoped work = old-world practices framing. This is particularly true for standing-arrangement clients (Angelica) and Tate-directed work with clear scope. No pattern file exists and no CLAUDE.md mention.

This is a candidate for a pattern file (`delivery-velocity-same-turn-not-24-48hr.md`) AND a CLAUDE.md addition under "Service Offering" or under "Client Work - Autonomy on External Codebases".

**Target file:** Author `~/ecodiaos/patterns/delivery-velocity-same-turn-not-24-48hr.md` AND append to `~/CLAUDE.md` Service Offering or Client Work section.

**Proposed insertion for ~/CLAUDE.md** (append to "Service Offering" after "Yes to: clear scope..."):

```
**Delivery velocity:** when scope is clear and tools are available (Factory + forks + MCP surface),
the default delivery target is SAME SESSION, not 24-48 hours. Tate verbatim 11 May 2026:
"no need for 24-48hr timeline, that's old-world practices." Quoting 24-48hr for scoped work
that can be shipped in the current session = anchoring to pre-automation delivery speed.
The exception is work genuinely gated on Tate visual-verify, client sign-off, or external deploys
(Vercel alias reassignment, App Store review, etc.) - those blockers are legitimate and should
be named precisely.
```

---

## Section 2 - Stale items

### Stale 2.1 - "Ignore RunPod entirely" in ~/CLAUDE.md Health Checks (low priority, unchanged since April)

The "Ignore RunPod entirely" bullet under "Health Checks" in ~/CLAUDE.md Operational Lessons was written when RunPod was briefly used for GPU workloads. No RunPod usage has appeared in any transcript or status_board row in the last 30+ days. This is probably dead weight but low-risk to leave.

**Proposed action (P3 deferred):** Archive the bullet at next structural pass.

### Stale 2.2 - ~/ecodiaos/CLAUDE.md co-exist.md / ordit.md client file references

The "Active: ordit.md, coexist.md" line in the "Client Knowledge System" section still lists `ordit.md`. Ordit engagement was closed 5 May 2026 per Tate directive. The file is retained for historical reference per ~/CLAUDE.md's own note, but the "Active" list should say "coexist.md" only and "archived: ordit.md".

**Target file:** `~/ecodiaos/CLAUDE.md`, "Client Knowledge System" section, the "Active:" line.

**Proposed change:**
```
Active: `coexist.md`, `resonaverde.md` (standing arrangement). Archived: `ordit.md` (engagement
closed 5 May 2026 - retained for historical reference per ~/CLAUDE.md Ordit section).
```

Note: `resonaverde.md` may not exist yet as a standalone client file - it should be created. This is a P2 item.

### Stale 2.3 - ~/CLAUDE.md "code@ecodia.au" section says "exactly three places" but ASC API key entry updated 7 May

The code@ section says "code@ecodia.au exists in exactly three places" and the third is Apple. The ASC API key section (added recently) documents the ASC API key at kv_store.creds.apple > value.asc_api_key. The text is consistent - ASC API key is under Apple. No structural conflict. This is NOT stale, just worth confirming the text is still accurate. Confirmed - no change needed.

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

### XRef 3.1 - health-canary-must-alert-not-silently-accumulate.md

No cross-ref in CLAUDE.md scheduling or health-check sections. Covered in Gap 1.2 above.

### XRef 3.2 - cross-implementation-script-pair-must-stay-in-sync-on-fixes.md

No cross-ref in CLAUDE.md Quality Patterns. Covered in Gap 2.2 above.

### XRef 3.3 - grep-absence-is-not-evidence-of-absence.md

No cross-ref in CLAUDE.md Quality Patterns or recon sections. Covered in Gap 2.1 above.

### XRef 3.4 - em-dashes-banned-character-level-no-exceptions.md

Partial - rule exists in ~/CLAUDE.md Output Formatting Rule 1 but no pointer to the pattern file with its sweep + hook substrate. Covered in Gap 2.3 above.

### XRef 3.5 - coexist-event-dupe-prevention-layered.md (P3)

No cross-ref from CLAUDE.md. This is Co-Exist-specific operational doctrine (layered duplicate prevention for event records). Appropriate cross-ref location would be ~/ecodiaos/clients/coexist.md if that file exists, or a brief mention in the Co-Exist section. P3 deferred - edit fork to decide whether this belongs in CLAUDE.md or just in the client file.

### XRef 3.6 - angelica-resonaverde-standing-arrangement.md (APPLIED)

Cross-ref exists in ~/CLAUDE.md Decision Authority + Client Communication sections. No action needed.

### XRef 3.7 - poll-gmail-frequently-not-only-on-triage-cron.md (APPLIED)

Cross-ref exists in ~/ecodiaos/CLAUDE.md scheduling section email-triage bullet. No action needed.

### XRef 3.8 - cron-prompts-must-respect-autonomous-pilot-sms-gate.md (APPLIED)

Cross-ref exists in ~/CLAUDE.md Contact channel section. No action needed.

---

## Section 4 - Structural issues

### Structural 4.1 - "Operational Lessons" section in ~/CLAUDE.md is growing without categorisation

The "Operational Lessons" section now has 20+ bullets across VPS & Infrastructure, Calendar API, Database & Security, Scheduler, Health Checks, Token Usage, Client Dev Work sub-sections. Some sub-sections have single bullets that will never grow (Calendar API: 2 bullets, always about Google Calendar). This is fine - no restructure needed in this pass.

### Structural 4.2 - "Negotiation & Agency" section in ~/CLAUDE.md could benefit from a "Positioning defaults" sub-section

The board-offer doctrine (Gap 1.1) would fit well under a new "Positioning defaults" sub-section within Negotiation & Agency, alongside rate-card discipline and the IP retention section. Low priority.

### Structural 4.3 - ~/ecodiaos/clients/ directory - resonaverde.md missing

Angelica / Resonaverde is now an active client with a standing arrangement. A `~/ecodiaos/clients/resonaverde.md` file does not exist (only `coexist.md` and `ordit.md` confirmed). Given the standing arrangement is live and she is now the most active outbound relationship, a resonaverde.md client file should be authored with: contract ref, GitHub repo, Supabase project ID, delivery history, patterns learned. P2 item for the edit fork.

---

## Section 5 - Prioritised to-do list

### P1 items

**P1-A: Author ~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md + add doctrine to ~/CLAUDE.md**
- Proposed text in Gap 1.1 above
- File path: `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`
- CLAUDE.md target: "Negotiation & Agency" section
- Rationale: Significant strategic direction from Tate verbatim. Board offers will recur (Kurt orbit, conservation sector, general network). Without this codified, future sessions will re-analyse from scratch or (worse) accept without flagging.

**P1-B: Add health-canary threshold-alerting contract to ~/ecodiaos/CLAUDE.md**
- Proposed text in Gap 1.2 above
- Target: `~/ecodiaos/CLAUDE.md` system-health cron bullet
- Rationale: 46-failure silent contact-path degradation. Pattern file is strong. CLAUDE.md cross-ref is the load-bearing surfacing mechanism for new cron authors.

### P2 items

**P2-A: Add grep-absence-is-not-evidence-of-absence cross-ref to ~/ecodiaos/CLAUDE.md Quality Patterns**
- Proposed text in Gap 2.1 above
- Target: `~/ecodiaos/CLAUDE.md` Quality Patterns / Review Pass Protocol section
- Rationale: On-main recon false-negatives recur. The 5-point check needs to surface at the code-review layer.

**P2-B: Add cross-implementation-script-pair cross-ref to ~/ecodiaos/CLAUDE.md Quality Patterns**
- Proposed text in Gap 2.2 above
- Target: `~/ecodiaos/CLAUDE.md` Quality Patterns / Integration sub-section
- Rationale: 9-day silent pair drift. The pattern file is excellent. No CLAUDE.md cross-ref means it won't surface at code-review time.

**P2-C: Add em-dashes pattern file cross-ref to ~/CLAUDE.md Output Formatting Rule 1**
- Proposed text in Gap 2.3 above
- Target: `~/CLAUDE.md` Output Formatting rules
- Rationale: Rule 1 is present but the sweep script + hook + failure-mode details are only in the pattern file. Cross-ref is how future sessions find the mechanical substrate.

**P2-D: Add same-turn delivery velocity doctrine to ~/CLAUDE.md + author pattern file**
- Proposed text in Gap 2.4 above
- Target file 1: `~/ecodiaos/patterns/delivery-velocity-same-turn-not-24-48hr.md`
- Target file 2: `~/CLAUDE.md` Service Offering section
- Rationale: Tate verbatim directive from today. Old-world-practices framing suggests this will come up again as client work accelerates.

**P2-E: Fix "Active: ordit.md" stale reference in ~/ecodiaos/CLAUDE.md Client Knowledge System**
- Proposed change in Stale 2.2 above
- Target: `~/ecodiaos/CLAUDE.md` Client Knowledge System section
- Rationale: Ordit engagement closed 5 May 2026. Active list should reflect current state.

**P2-F: Author ~/ecodiaos/clients/resonaverde.md client file**
- Structural 4.3 above
- Content: standing arrangement details, GitHub repo (Resonaverde-au/resonaverde), Supabase project dxtglcfyqvhmmnopshhp, Angelica contact hello@resonaverde.au, referral agreement status (v2 sent Apr 20 2026, no signed copy received as of 11 May), delivery history (4 features shipped today: auto-send bug, file-delete bug, draft publishing, lead magnet)
- Rationale: Standing arrangement is live. Client file is how future sessions find the architecture, scope constraints, and relationship context before touching the codebase.

### P3 items

**P3-A: Retire "Ignore RunPod entirely" bullet from ~/CLAUDE.md Health Checks**
- Proposed in Stale 2.1 above
- Low-risk, low-priority cleanup

**P3-B: coexist-event-dupe-prevention-layered.md cross-ref in client file**
- XRef 3.5 above
- Appropriate location: ~/ecodiaos/clients/coexist.md, not CLAUDE.md

---

## Summary counts

- New patterns today requiring CLAUDE.md action: 6 (Gaps 1.1, 1.2, 2.1, 2.2, 2.3, 2.4)
- Stale items: 2 (one P2, one P3-deferred)
- Missing cross-refs resolved by gaps above: 4
- Structural issues: 3 (one requiring new client file, P2)
- P1 items: 2
- P2 items: 6
- P3 items: 2

Transcript evidence of new directives: YES (Wild Mountains board decision + same-day delivery verbatim + iMessage purge). This is NOT a clean-audit run; P1/P2 work is queued.
