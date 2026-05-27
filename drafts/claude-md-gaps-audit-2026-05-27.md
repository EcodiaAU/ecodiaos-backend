# CLAUDE.md gaps audit, 2026-05-27

Routine: claude-md-reflection (20:00 AEST fire). Scope: audit-only. The local conductor applies the edits per the 30 Apr 2026 structural-fix doctrine. Proposed text in Section 1 is verbatim-applicable: the conductor uses the exact strings below, it does not paraphrase.

Window audited: 2026-05-26 18:00 AEST to 2026-05-27 20:00 AEST.

## Context: what happened in the window

The 24h window was dominated by a single large effort, the Phase 0 to Phase 10 doctrine consolidation (commits 143bb7a through b194b27, 2026-05-26 19:16 to 2026-05-27 11:24 AEST). It:

- Archived 45 pattern files into `patterns/_archived/` (Factory cluster 15 files, [redacted] cluster, the SDK-fork cluster, and autonomy companion patterns folded into a canonical file).
- Cut self-flagged dead-substrate sections from CLAUDE.md (Phase 4, commit 94d7e39).
- Tightened hook triggers and added a semantic-review pass (Phase 5, commit 3956c17).
- Shipped the autonomy substrate: migration 136 autonomy columns on `os_scheduled_tasks` (422f54d), the VPS `corazonWatchdog` (43a2b8e Phase 6), and two new pattern files (Phase 10).
- Fixed a gkg phase-2 silent-upsert bug (b194b27).

A large archival pass is the canonical source of stale cross-references, and that is exactly what this audit found.

## CRITICAL backlog finding (read before applying anything)

Two prior CLAUDE.md edit rows are STILL `audit_complete_edit_pending`:

- `c04e617b` CLAUDE.md edit pending, audit 2026-05-25 (P1-A MCP domain-scoped connectors + token-expiry sibling-route, P1-B PDF-canonical deliverable).
- `7092d81f` CLAUDE.md edit pending, audit 2026-05-26 (P1 G1 voice live-call, G2 away-conductor + one-brain, G3 domain-scoped MCP connectors). This row already states it supersedes the 2026-05-25 row.

The 2026-05-26 reflection named this exact failure: audits run clean but the edit-apply step never lands, and when it does it lands on per-session ephemeral branches (gifted-heisenberg-JBglL, gifted-heisenberg-GnNh7, and this routine fired on gifted-heisenberg-HifHf) that never converge to one canonical branch, so on-disk CLAUDE.md stays stale no matter how many audits run.

Directive to the conductor: do NOT apply today's audit as a third independent edit on a fourth branch. Consolidate `c04e617b`, `7092d81f`, and this 2026-05-27 row into ONE edit pass on ONE canonical branch, confirm the merge, then archive all three rows. If those earlier rows' items are already on disk, verify and archive them rather than re-applying.

---

## Section 1: Gaps to add (rule, proposed exact text, target file)

### G1 (P1): The autonomy / scheduler substrate shift is not in CLAUDE.md

Rule: the system now fires its own scheduled and event-driven CC chats from the eos-laptop-agent on Corazon. Anthropic cloud Routines and the VPS-resident `schedulerPollerService` are deprecated for that path. The substrate is shipped and unit-tested (101 tests across 5 modules, migration 136 applied) but NOT yet cut over: it is feature-flagged off (`SCHEDULER_ENABLED` default false) pending three Tate-handed steps (PM2 supervision past the rpc.sock EPERM, code@/money@ credential seeding, and the flag flip). Until cutover, the VPS scheduler described in the existing "Scheduling & Autonomy" section is still the live firing path. A cold-start session today has no model of this and would mis-locate where scheduling lives.

Target file: `backend/CLAUDE.md`, in the "Scheduling & Autonomy" section, inserted immediately after the line that begins "Persistent DB-backed scheduler architecture (not session-scoped)." (the paragraph at approx line 880 region, just above "Core operating loops").

Proposed exact text (insert as a new paragraph):

> **Autonomy substrate (shipped 2026-05-26, cutover pending).** The intended steady-state is for EcodiaOS to fire its own scheduled and event-driven CC chats from the eos-laptop-agent on Corazon, polling `os_scheduled_tasks`, rotating `~/.claude/.credentials.json` to the healthiest of three accounts at chat-launch time, and dispatching via `cowork.dispatch_worker` with `ide:"stable"`. Anthropic cloud Routines (15-per-day cap) and the VPS-resident `schedulerPollerService.js` are deprecated for this path. The substrate is shipped and unit-tested but feature-flagged off (`SCHEDULER_ENABLED` default false) pending three Tate-handed cutover steps: PM2 supervision past the rpc.sock EPERM, code@ plus money@ credential seeding, and flipping the flag plus the seed cron row from paused to active. UNTIL cutover, the VPS scheduler below is still the live firing path. Never re-introduce any code that watches `~/.claude/.credentials.json` (the May 2026 refresh-clobber-watchdog self-DOS). Full: `~/ecodiaos/patterns/autonomous-scheduler-on-laptop-agent-2026-05-26.md`. VPS-side liveness + queue-backup + cred-refresh-failure alerting is handled by `corazonWatchdog` (SMS escalation via the existing sms module).

### G2 (P2): The weekly doctrine consolidation audit loop is not linked

Rule: the doctrine corpus self-improves through a weekly mechanical loop driven by Layer-3 application telemetry (`applied_tag_telemetry.py` Stop hook) feeding `scripts/doctrine_consolidation_audit.py`, which classifies every pattern against four tuning thresholds and writes a P3 status_board row. This is the mechanical sibling of the existing "Pattern lifecycle and tuning" paragraph, which currently only names the `pattern-corpus-health-check` cron.

Target file: `backend/CLAUDE.md`, in the "PATTERN SURFACING" section, appended to the existing "Pattern lifecycle and tuning" paragraph (the one ending with the `pattern-lifecycle-active-narrowed-archived.md` reference, approx line region of the Origin "Tate verbatim 16:20 AEST 7 May 2026").

Proposed exact text (append to that paragraph):

> The mechanical drift detector behind this is the weekly doctrine-consolidation audit loop: `scripts/doctrine_consolidation_audit.py` reads the Layer-3 application-events telemetry and writes a P3 status_board row tagged `entity_ref='doctrine-consolidation-audit'` with archive/narrow/retire candidate lists. Full: `~/ecodiaos/patterns/weekly-doctrine-consolidation-audit-loop-2026-05-26.md`.

---

## Section 2: Stale items (outdated tooling, removed flags, superseded doctrine)

The Phase 0 to 10 consolidation moved 45 patterns into `patterns/_archived/`. Nine of them are still cross-referenced from CLAUDE.md by their old `~/ecodiaos/patterns/<name>.md` path, so every one of those links is now broken (the file lives at `~/ecodiaos/patterns/_archived/<name>.md`). They split into two classes.

### Class A: folded into canonical, the canonical is already cited (trivial, P1, verbatim fix)

Both were archived with reason `folded-into-canonical-autonomy-doctrine-2026-05-26` and folded into `100-percent-autonomy-doctrine-30-apr-2026.md`, which is ALREADY cited on the same line. So the fix is to drop the two now-archived references, leaving the canonical:

- `stop-asking-just-decide.md` (line 710)
- `decide-do-not-ask.md` (line 710)

Proposed exact edit, line 710. Find:

> Surfaces `~/ecodiaos/patterns/stop-asking-just-decide.md`, `~/ecodiaos/patterns/decide-do-not-ask.md`, `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (canonical authority predecessor), `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md`

Replace with:

> Surfaces `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (canonical, absorbs the former stop-asking-just-decide and decide-do-not-ask files), `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md`

### Class B: dead SDK-fork / Factory substrate (P2, needs judgment, NOT a blind path-swap)

Seven references point at patterns archived as `sdk-fork-substrate-deprecated-2026-05-17` or `factory-substrate-deprecated-2026-05-17`. The links are broken, but the higher-value problem is that the surrounding prose still presents the SDK-fork / Factory primitive as live, which directly contradicts the "Parallel dispatch" section that already names `cowork.dispatch_worker` as the live primitive. This is the deeper structural issue captured in Section 4. Per-reference disposition:

| Line | Archived ref | Underlying rule still valid? | Recommended disposition |
|---|---|---|---|
| 635 | fork-worktree-commits-do-not-propagate... | Yes, but the point is carried by the other two cross-refs on that line (verify-deployed-state, symptom-clustering) | Drop the archived cross-ref; keep the other two |
| 651 | fork-pending-work-at-session-start... | Concept maps to "dispatch a worker first" | Reword "fork it FIRST" to worker language and repoint to `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md`, or remove |
| 722 | no-doctrine-writes-during-factory-running-window | Yes, worktree-baseline hygiene still applies under dispatch_worker | Repoint to `dispatch-worker-worktree-hygiene-2026-05-26.md` |
| 781 | pre-stage-fork-briefs-before-session-killing-ops | Yes, staging before a restart still applies | Repoint to `_archived/` path or reword to worker language |
| 822 | fork-error-events-do-not-surface-to-conductor-chat | Yes, maps to observer-interventions-are-ambient doctrine | Repoint to `observer-interventions-are-ambient-not-chat.md` or `_archived/` |
| 902 | forks-must-not-restart-ecodia-api-unilaterally... | Yes, load-bearing coordination rule | See Section 4: rename fork to worker across the whole "Conductor owns ecodia-api lifecycle" section; repoint the cross-ref |
| 907 | no-pm2-restart-during-active-factory-queue + pre-stage-fork-briefs | Yes | Repoint both to `_archived/` paths or reword |

Note for the conductor: the canonical replacement files are all confirmed LIVE on disk (`100-percent-autonomy-doctrine-30-apr-2026.md`, `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md`, `dispatch-worker-worktree-hygiene-2026-05-26.md`, `dispatch-worker-runtime-semantics-2026-05-26.md`). Do not invent new cross-ref targets.

---

## Section 3: Missing cross-references (patterns authored in last 24h, not linked from CLAUDE.md)

Both new pattern files from the window are unlinked. They are covered by G1 and G2 above:

- `autonomous-scheduler-on-laptop-agent-2026-05-26.md` (linked via G1).
- `weekly-doctrine-consolidation-audit-loop-2026-05-26.md` (linked via G2).

No other patterns were added (status A) in the window; the rest of the consolidation was archival and folding, not new authoring.

---

## Section 4: Structural issues (header order, findability, redundancy)

### S1 (P2): Internal contradiction, fork primitive presented as both dead and live

The "Parallel dispatch" section correctly names `cowork.dispatch_worker` as the 0th-class primitive and the SDK fork as deprecated. But three other regions still describe the SDK-fork / Factory primitive as the live mechanic:

- "Session Orientation" line 651 ("fork it FIRST", "the FORK runs steps 2-7").
- "User-message context blocks" line 822 (fork-error events).
- The entire "Conductor owns ecodia-api lifecycle" section (lines approx 881 to 907), written around forks writing to `pending_restart_requests`.

A cold-start session reading these would believe SDK forks are the live dispatch substrate. The clean fix is a single reconciliation pass renaming fork to worker (and forks to workers) across these regions and repointing the cross-refs to the dispatch-worker canonical files. This is judgment work, not find-replace, because some prose ("the fork runs steps 2-7") needs rephrasing rather than a token swap. Recommend the conductor scope this as its own focused edit, not bundled blind into the verbatim P1 set.

### S2 (P3): The residual-deprecations header could record the consolidation

The top-of-file header is dated "2026-05-26 update (5 rows pruned after Phase 4 doctrine consolidation)". The consolidation continued through Phase 10 on 2026-05-27 (45 patterns archived, two new patterns shipped, corazonWatchdog + migration 136). A one-line update to that header would keep the world-model honest. Low priority.

---

## Section 5: Prioritised P1/P2/P3 to-do list

P1 (apply this pass, verbatim where given):
1. Consolidate the three pending edit rows (`c04e617b` 05-25, `7092d81f` 05-26, this 05-27 row) into ONE edit pass on ONE canonical branch, confirm merge, archive all three. Do not stack a fourth branch. (Backlog finding above.)
2. G1: add the autonomy / laptop-agent scheduler substrate paragraph to "Scheduling & Autonomy", with the cutover-pending nuance intact. `backend/CLAUDE.md`.
3. Section 2 Class A: line 710 drop the two folded-into-canonical refs (verbatim find/replace given). `backend/CLAUDE.md`.

P2 (apply if cheap in the same pass, else next):
4. S1: reconcile the fork-vs-worker contradiction across "Session Orientation" (651), "User-message context blocks" (822), and "Conductor owns ecodia-api lifecycle" (881 to 907). Rename fork to worker, repoint the seven Section 2 Class B cross-refs to the live dispatch-worker / observer canonical files per the disposition table.
5. G2: cross-ref `weekly-doctrine-consolidation-audit-loop-2026-05-26.md` from the "Pattern lifecycle and tuning" paragraph (verbatim append given).
6. Carry the still-open business-doctrine row `50c7603d` (EcodiaOS 51% option-holder milestone for the Tate-laptop-only `~/CLAUDE.md`) into the same conductor session if it touches `~/CLAUDE.md`. It is out of this repo's scope and remains unapplied from 26 May.

P3 (housekeeping):
7. S2: update the residual-deprecations header to record the Phase 0 to 10 consolidation completing on 2026-05-27.

Note on the 24h directive mine: the Neo4j Episode/Decision/Reflection mine for the window surfaced no NEW never-again rule or Tate verbatim directive that is absent from doctrine. The window's signal was operational (the consolidation itself plus parallel-builder stable-halt cycles against the dead cowork-pool fork substrate, which is already documented). So this is not a clean-no-findings audit, but the findings are consolidation fallout (stale cross-refs, an undocumented substrate shift, and the edit-apply backlog), not unrecorded directives.
