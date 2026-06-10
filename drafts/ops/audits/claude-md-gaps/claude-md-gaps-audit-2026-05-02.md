# CLAUDE.md Gaps Audit - 2 May 2026

**Author:** fork_moo6c971_88e70b (manual-recovery audit fork; daily 20:00 AEST claude-md-reflection cron silent-fired)
**Window:** Day 2 of 72h autonomous window (1-4 May 2026)
**Method:** Read ~/CLAUDE.md, ~/ecodiaos/CLAUDE.md, ~/ecodiaos/patterns/INDEX.md, recent Neo4j Episodes/Decisions (last 24h), today's authored doctrine on disk.

---

## Section 1 - Gaps (rules surfaced today not yet codified, or codified-but-not-cross-referenced)

### 1.1 SMS frequency doctrine - codified file exists but ZERO cross-refs

**Status:** `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` was authored at 16:34 AEST today (4782 bytes, verified on disk). **Codification good.** **Surfacing broken.**

- `~/CLAUDE.md` SMS surface area: ONE mention only at line 149 (a row in the substrate-decision table: `gmail_send, sms-tate, zernio_*, ...`). No dedicated SMS section. No cross-ref to `sms-segment-economics.md` either, despite that being the elder sibling pattern.
- `~/ecodiaos/CLAUDE.md` SMS surface area: ZERO mentions. The string "SMS" never appears in the technical operations manual. `sms-tate` MCP tool is briefly named at line 149 but with no doctrine surface area.
- `~/ecodiaos/patterns/INDEX.md` lists `sms-segment-economics.md` (line 52) but not `sms-one-update-per-fix-not-running-commentary.md`.
- The semantic-search hook will surface the pattern on `send_sms` calls, but there is no chat-readable cross-reference path from CLAUDE.md.

**Proposed edit (for tomorrow's edit fork):**
- ADD `~/CLAUDE.md` new sub-section under "Output Formatting" or as new "SMS to Tate" sub-section listing both patterns:
  ```
  ### SMS to Tate
  Two-pattern stack governs every outbound SMS:
  - `~/ecodiaos/patterns/sms-segment-economics.md` - 1 GSM segment = $0.05 AUD, 160-char cap, strip filler/greetings/signoffs
  - `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` - AT MOST one SMS per fix arc, sanity-probe results to substrate not phone
  ```
- ADD `~/ecodiaos/patterns/INDEX.md` row for sms-one-update-per-fix-not-running-commentary.md.

**Origin:** 2 May 2026 16:33 AEST Tate verbatim "Can you stop those spam security texts, wasting twilio funds." Five SMS in 12 minutes around a single $0 data-fix bug.

### 1.2 Phantom-fork-bail at orientation phase pattern - NOT YET CODIFIED

**Status:** Five SDK forks earlier today phantom-bailed at the orientation phase, returning 600-char truncated reports without writing any disk artefact. The brief itself flagged this as a recurring failure mode ("DO NOT REPEAT"). **No pattern file exists for it.**

Search results:
- `~/ecodiaos/patterns/factory-phantom-session-no-commit.md` - exists but is FACTORY-specific (cc_sessions, files_changed=empty), not SDK-fork specific.
- No file matching "phantom-fork-bail", "sdk-fork-bail", "orientation-bail", or "fork-narrated-not-shipped" exists in `~/ecodiaos/patterns/`.
- `~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md` exists (covers recovery side) but doesn't address the failure mode itself.
- `~/ecodiaos/patterns/sdk-forks-must-commit-deliverables-not-leave-untracked.md` exists (covers commit-vs-untracked) but not orientation-bail.

**Proposed file:** `~/ecodiaos/patterns/sdk-fork-orientation-bail-truncated-report-no-disk-artefact.md` documenting:
- Symptom: SDK fork returns 200-800 char `[FORK_REPORT]` without spawn_fork's `result.files` showing any artefact path; report mentions "I read X, I checked Y" but no Write/Edit/INSERT was emitted.
- Detection: parent post-spawn check `if (forkResult.tool_use_count < 3 || result.length < 1000) suspect_phantom_bail`.
- Recovery: re-dispatch with explicit "FIRST tool call MUST be Write to <exact-path>" framing in brief. Do NOT just dispatch a sibling expecting different outcome.
- Origin: 2 May 2026 morning, five SDK forks phantom-bailed in succession before main took the work.

**Triggers candidates:** `sdk-fork-bail, orientation-bail, phantom-fork, truncated-fork-report, fork-narrated-not-shipped, fork-no-tool-calls, fork-quick-exit, mcp-forks-spawn-fork-bail, fork-result-empty, sdk-fork-orientation`.

### 1.3 Durable-execution rejection rationale - codified as Decision but no pattern file

**Status:** Per Neo4j (cannot fully read 24h Episode/Decision dump - exceeded 14k token output cap), durable-execution was rejected today as a Decision. No corresponding pattern file in `~/ecodiaos/patterns/` was found via filename grep.

**Decision needed (escalate to edit fork):** is the rejection-rationale a one-shot Decision (Neo4j-only, no doctrine), OR a recurring rule ("don't reach for durable-execution; here's why")? If the latter, the Decision should be summarised into a small pattern file `~/ecodiaos/patterns/durable-execution-rejected-stay-with-sdk-forks.md`. If the former, leave as Neo4j Decision and cross-ref from CLAUDE.md only when the topic resurfaces.

**Recommendation:** P3 - read the actual Decision node body (truncated in this audit) before authoring. Don't pre-author from a summary.

### 1.4 isSessionBusy pre-gate fix awaiting natural pm2 restart - status_board row exists, doctrine doesn't reference

**Status:** Per brief, scheduler poller has been silent-firing crons since ~03:43 UTC due to `isSessionBusy` pre-gate. Fix at commit 465fec0 already on origin/main but awaits natural pm2 restart (per `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md` discipline).

- `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md` exists (in INDEX line 83) and is the doctrine for this class of failure.
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` exists (referenced in CLAUDE.md line 703, 705) but is NOT in INDEX.md - see Section 3.
- The CLAUDE.md scheduler section (lines 740+) does not name this specific 03:43 UTC silent-fire incident as origin event for the cron-deliverable doctrine. The relevant doctrine is at lines 701-707 and is fine; the surrounding scheduler section (lines 740-758) is silent on the recent failure mode.

**Proposed:** when scheduler section gets touched in next edit fork, add one line at top of "Scheduling & Autonomy" section:
> **Known live issue (2 May 2026):** scheduler poller has been silent-firing since 03:43 UTC due to isSessionBusy pre-gate. Fix at commit 465fec0 is on origin/main; takes effect on next natural pm2 restart. Until then, every cron firing requires manual deliverable verification per `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.

DELETE that line once pm2 picks up 465fec0 and crons resume firing forks autonomously.

---

## Section 2 - Stale items (outdated tooling / superseded doctrine)

### 2.1 Scheduler section pre-gate doctrine

`~/ecodiaos/CLAUDE.md` line 740 opens "Scheduling & Autonomy" section but does NOT mention the `isSessionBusy` pre-gate failure mode at all. The reactive system bullet (line 740) and the loop list (lines 741-758) read as if all crons fire normally. This is stale until 465fec0 lands and is verified - at which point both the doctrine and any "known live issue" caveat (Section 1.4) need to be re-checked.

**Action:** P2. Re-read scheduler section after pm2 restart. If 465fec0 is live and verified, no edit needed. If it's NOT live by tomorrow's edit fork, add the caveat from Section 1.4.

### 2.2 INDEX.md regen cron status uncertain

`~/ecodiaos/CLAUDE.md` line 113 (in patterns INDEX rules section) says "INDEX.md handled by daily 22:00 AEST regen cron - do NOT manually edit from a fork." But:
- `~/ecodiaos/patterns/` contains 138 .md files (verified `ls | wc -l`).
- INDEX.md table contains ~84 file rows (visible in INDEX read, lines 26-108).
- Sample of files NOT in INDEX: `100-percent-autonomy-doctrine-30-apr-2026.md`, `claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`, `decide-do-not-ask.md`, `cron-fire-must-have-deliverable-not-just-narration.md`, `decision-quality-self-optimization-architecture.md`, `cowork-no-focus-collision.md`, `exhaust-laptop-route-before-declaring-tate-blocked.md`, ~50 more.

**Inference:** Either the daily 22:00 AEST regen cron is broken / silent-firing too, OR the doctrine line 113 is stale and INDEX is now manually maintained (badly).

**Action:** P1. Investigate scheduler row for INDEX regen task. If regen cron exists but is silent-firing (same root cause as 1.4), it'll auto-resolve on pm2 restart. If no such task exists, the doctrine line is wrong and INDEX needs a manual sync now.

### 2.3 "Up to 80 cron-coupled checkpoint" doctrine restated

`~/ecodiaos/CLAUDE.md` line 619 declares "MUST fork BOTH audit AND edit in single 30-min window" as NON-NEGOTIABLE. Line 705 (later in same file) softens this: "MUST fork is doctrine, not mechanism. The cron prompt asks; the receiving turn either complies or doesn't." Today's actual outcome (cron silent-fired, manual recovery 14 min late) confirms line 705 is the operational reality.

**Action:** P3. Reconcile lines 619 and 705. Either:
- (a) move line 619's NON-NEGOTIABLE language into line 705's framing (mechanism not in place), OR
- (b) ship the actual mechanism (cron-deliverable hook) and keep 619 as the standard.

Tomorrow's edit fork should NOT pick option (a) without considering whether (b) is actively being built.

### 2.4 Cron-fire context-injection "Follow-up TBD" line

`~/ecodiaos/CLAUDE.md` line 642 ends with "Follow-up TBD - revisit if cron-silent-fire pattern recurs." It HAS recurred (1 May, 2 May - third time today specifically). Line should be promoted from "Follow-up TBD" to a P1 status_board row.

**Action:** P1. Update line 642 to point to the active P1 status_board row tracking this, OR drop the "Follow-up TBD" wording for a concrete next-action.

---

## Section 3 - Missing cross-refs (patterns authored but not linked)

### 3.1 sms-one-update-per-fix-not-running-commentary.md

- Not in `~/ecodiaos/patterns/INDEX.md`.
- Not cross-referenced from `~/CLAUDE.md` (no SMS section exists).
- Not cross-referenced from `~/ecodiaos/CLAUDE.md` (zero "SMS" mentions in the manual).
- The pattern itself does cross-ref upward (lists `sms-segment-economics.md`, `silent-alerts-defer-when-tate-is-live.md`, `no-retrospective-dumps-in-director-chat.md`, `codify-at-the-moment-a-rule-is-stated-not-after.md`) - good.

### 3.2 cron-fire-must-have-deliverable-not-just-narration.md

- Referenced in `~/ecodiaos/CLAUDE.md` lines 703 and 705 (twice).
- NOT in `~/ecodiaos/patterns/INDEX.md` (verified by grep).

### 3.3 ~30 patterns not in INDEX (sample)

Verified count: 138 .md files in `~/ecodiaos/patterns/`, ~84 indexed. ~54 files unlinked from INDEX. Sample of high-value missing: `100-percent-autonomy-doctrine-30-apr-2026.md`, `action-over-plans-honesty-redeems-mistakes.md`, `claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`, `codify-at-the-moment-a-rule-is-stated-not-after.md`, `conductor-coordinates-capacity-is-a-floor.md`, `cowork-conductor-dispatch-protocol.md`, `cowork-no-focus-collision.md`, `cowork-passkey-stall-conductor-injects.md`, `decide-do-not-ask.md`, `decision-quality-self-optimization-architecture.md`, `discovery-to-doctrine-same-turn.md`, `exhaust-laptop-route-before-declaring-tate-blocked.md`, `fork-recovery-must-probe-deliverables-not-just-flip-status.md`, `fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`, `route-around-block-means-fix-this-turn-not-log-for-later.md`, `stop-asking-just-decide.md`, `tate-deliverables-pdf-only.md`, `verify-deployed-state-against-narrated-state.md`.

This is the highest-leverage backlog. Several of these are CANONICAL (cited as "(canonical)" in CLAUDE.md) and INDEX is missing them.

### 3.4 tate-facing-context-blocks-must-not-render-to-frontend.md

Referenced in `~/ecodiaos/CLAUDE.md` line 734. Need to verify file exists on disk and is in INDEX (skipped to stay within wall budget; flag for edit fork).

---

## Section 4 - Structural issues

### 4.1 ~/CLAUDE.md has no SMS section

The Output Formatting / Identity & Voice / Client Communication / Social Media (Zernio) hierarchy has surface areas for chat formatting, em-dash bans, social media, client comms - but SMS is invisible. SMS is a daily-use channel and the only outbound channel that costs real money per send. It deserves its own sub-section.

### 4.2 INDEX.md regen drift is symptomatic of broken cron

138 files, ~84 indexed = 39% drift. INDEX was intended to be the directory's table of contents and grep target. At 39% drift it's actively misleading - readers will assume a missing pattern doesn't exist.

### 4.3 CLAUDE.md line 619 vs 705 contradiction (see 2.3)

Same file, two passes, two different "MUST" levels for the same workflow.

### 4.4 Both CLAUDE.md files are LONG and growing

`~/CLAUDE.md` ~1100 lines, `~/ecodiaos/CLAUDE.md` ~770 lines. Cross-ref load between them is high. Future audit should probably propose a "doctrine corpus" section graph rather than appending more inline doctrine.

---

## Section 5 - Prioritised P1/P2/P3 to-do for tomorrow's edit fork

### P1 (must ship in next edit window)

1. **ADD SMS sub-section to `~/CLAUDE.md`** listing both `sms-segment-economics.md` and `sms-one-update-per-fix-not-running-commentary.md`. Place under Output Formatting or as standalone Identity-and-Voice sub-section.
2. **ADD `sms-one-update-per-fix-not-running-commentary.md` row to `~/ecodiaos/patterns/INDEX.md`** with triggers from the file's frontmatter.
3. **ADD `cron-fire-must-have-deliverable-not-just-narration.md` row to INDEX.md** (it is referenced from CLAUDE.md but unlisted in INDEX).
4. **INVESTIGATE INDEX.md regen cron** in `os_scheduled_tasks` table. If task exists, check last_run / verify it fires post-pm2-restart. If task does not exist, sync INDEX manually (54 missing rows) and create the cron.

### P2 (ship if budget allows)

5. **AUTHOR `sdk-fork-orientation-bail-truncated-report-no-disk-artefact.md`** per Section 1.2. Five-strike pattern today justifies file-per-thing. Do NOT bundle into existing factory-phantom or fork-recovery files - the failure mode is distinct (SDK forks bailing pre-execution, not Factory metadata drift).
6. **RECONCILE `~/ecodiaos/CLAUDE.md` lines 619 vs 705** per Section 2.3. Either soften line 619 OR commit to building the cron-deliverable hook.
7. **ADD scheduler-section caveat** at line 740 referencing the live 03:43 UTC silent-fire incident, conditional on 465fec0 not yet being live at edit-fork time.

### P3 (defer, log for later if not now)

8. **Read truncated Neo4j Decision dump** (output exceeded 14k tokens this audit) to surface any other 24h doctrine-shaped events not in this audit.
9. **Decide on durable-execution Decision** - is it a one-shot or a doctrine? See Section 1.3.
10. **Verify tate-facing-context-blocks-must-not-render-to-frontend.md** exists on disk and is INDEXed (Section 3.4).
11. **Backlog-process the ~54 patterns missing from INDEX** (Section 3.3). At minimum, add the canonical-cited ones.
12. **Length audit on both CLAUDE.md files** (Section 4.4). Propose a corpus-graph layout for next major rewrite.

---

## Verification

This audit file was written to disk at:
`~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-02.md`

Audit-fork persistence verification per `~/ecodiaos/CLAUDE.md` "Audit-fork persistence verification (NON-NEGOTIABLE)" - parent (or edit fork) must `ls -la` this exact path before treating today's claude-md-reflection cron as resolved.

Stamped: fork_moo6c971_88e70b
