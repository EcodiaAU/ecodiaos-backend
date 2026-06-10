# CLAUDE.md Gap Audit - 2026-05-01 (evening)

**Audit fork:** fork_momrik3k_02cb97
**Manual dispatch reason:** claude-md-reflection cron fired at 20:00 AEST 1 May 2026 (last_run_at=2026-05-01T10:00:17Z confirms) without forking either the audit or edit fork. Silent-fire P1 - same pattern flagged earlier today on autonomous-window-evening-sms cron (status_board row 0aae7e8e: "Multiple crons fire but do not dispatch their forks - 2 observed silent-fire today").
**Files audited:** `~/CLAUDE.md` (business doctrine), `~/ecodiaos/CLAUDE.md` (technical), `~/.claude/CLAUDE.md` (private global), `~/ecodiaos/SELF.md` (identity).
**Evidence base:**
- Neo4j Decisions/Episodes last 14 days (40 hits, 25 returned in trimmed query)
- `status_board` priority<=3 active rows (29 rows)
- `kv_store ceo.*` keys (25 rows, last 24h dominant)
- Pattern files at `~/ecodiaos/patterns/` (135 files)
- `.claude/skills/` directory contents (3 subdirs: pattern-surface, session-orient, sms-tate)
- Prior audit `~/ecodiaos/drafts/claude-md-gaps-audit-2026-04-30.md` for structural template + non-duplication
- Tate verbatim 16:31 AEST 1 May 2026 via Neo4j Decision node 4051

This is the audit half of the audit-then-edit two-fork pipeline. The brief explicitly forbids editing CLAUDE.md - the EDIT fork applies Section 5 P1 items.

---

## Section 1: Gaps - rules surfaced not yet codified

### P1.1 Cron silent-fire pattern: scheduler fires the cron, completes the row, never dispatches the fork (CRITICAL, NEW)

**Evidence:**
- status_board row priority=1 last_touched=2026-05-01T10:21:29Z: "P1: Multiple crons fire but do not dispatch their forks - 2 observed silent-fire today"
- This very fork is manual recovery from claude-md-reflection cron silent-firing at 20:00 AEST. Cron polled, marked complete, scheduled next run, but neither the audit fork nor the edit fork was spawned.
- Earlier today: autonomous-window-evening-sms cron exhibited identical shape (silent-completed-no-deliverable).
- Pattern is NOT codified. `~/ecodiaos/patterns/scheduler-no-pregate-trust-os-message-queue.md` covers a different failure (pre-gate logic), not "fire-then-no-action". `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` is structurally adjacent (5-layer subsystem audit) but covers listeners, not crons.

**Failure mode in plain text:** cron prompt is dispatched into the OS message queue. Receiving turn responds with narration ("acknowledged, will fork the audit") but stops short of actually invoking `mcp__forks__spawn_fork`. The cron's row is closed because the message was delivered and a turn response landed. No deliverable on disk. By the time a human or downstream cron looks for the artefact (e.g. tomorrow's session-orient query for `~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-01.md`), the absence is the only signal.

**Proposed pattern file:** `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`

```markdown
---
triggers: cron-silent-fire, scheduled-task-no-deliverable, cron-fire-no-fork, narration-without-action, cron-completion-without-artefact, claude-md-reflection-silent, autonomous-window-sms-silent, scheduled-self-loop-silent, fire-then-stall, deliverable-missing-after-cron, schedulerPollerService, os_scheduled_tasks-completion-without-artefact, cron-deliverable-gate, fork-dispatch-from-cron-prompt
---

# Every cron-fired turn must produce a deliverable on a durable substrate, not just narration

A cron prompt firing and the turn responding "I will do X" is NOT the same as X happening. The scheduler row closes when the prompt is delivered. There is no second-order check that the work landed. If the prompt's deliverable is "fork the audit and edit", and only narration appears, the work silently dies and the durable substrate (drafts/, status_board, neo4j, kv_store) shows nothing.

## The rule

For every cron whose prompt-body declares a deliverable (file authored, fork spawned, status_board row updated, email sent, neo4j node written), the receiving turn MUST emit at least one tool call that lands on a durable substrate within the same turn. If the turn ends with no such tool call, classify as `cron_silent_fire` and surface as P1 status_board row at the next session-start probe.

Detection (post-hoc, run as part of the next meta-loop):
1. Query `os_scheduled_tasks` for cron rows completed in the last hour.
2. For each, parse the prompt-body for declared deliverable signal (`spawn_fork`, `Write tool`, `INSERT INTO`, `gmail_send`, `graph_merge_node`).
3. Query the matching durable substrate for an artefact with `last_modified >= cron_completed_at AND <= cron_completed_at + 30min`.
4. No artefact = silent-fire. Status_board row P1.

Prevention (pre-hoc, ship a hook):
- PreToolUse hook on `mcp__scheduler__schedule_cron` and `os_scheduled_tasks` INSERTs probes the prompt-body. If the prompt declares a fork-or-write deliverable but does NOT include the literal substrate paths the deliverable will land on, warn `[CRON-DELIVERABLE WARN] cron prompt declares <action> but does not name the substrate it will land on`.
- PostToolUse on cron-fire turns: if the turn closes with zero substrate-write tool calls, log to `kv_store.cron.silent_fires.<task_id>.<run_at>` for next-meta-loop classification.

## Do
- Every cron prompt names the literal output path / fork id pattern / status_board entity_ref / kv_store key it will write.
- Every cron-fire turn ends with at least one tool call that lands on a durable substrate, OR an explicit kv_store write logging "cron fired, no deliverable required this run because <reason>".
- Treat cron rows as `complete-when-deliverable-on-disk`, not `complete-when-prompt-delivered`.

## Do not
- Trust scheduler `last_run_at` as proof the work happened.
- Let cron-fire turns end with narration only ("I will fork the audit" without spawn_fork).
- Bury the silent-fire failure as "the cron fired but I was busy" - the fix is to schedule, not narrate.

## Origin

1 May 2026. Two crons silent-fired in the same day:
- autonomous-window-evening-sms cron fired earlier and produced no SMS to Tate.
- claude-md-reflection cron fired at 20:00 AEST and dispatched neither the audit fork nor the edit fork. This audit (fork_momrik3k_02cb97) is manual recovery dispatched from the conductor session at 19:43 AEST.

Both fits the same shape: prompt delivered, turn responded with text, no spawn_fork or Write tool emitted. status_board row 0aae7e8e captures the meta-pattern.
```

**Also CLAUDE.md addendum** - insert a subsection in `~/ecodiaos/CLAUDE.md` after the existing "Restart Recovery - Session Handoff" subsection, titled "Cron-fire deliverable discipline":

```
### Cron-fire deliverable discipline

A cron firing means the prompt was delivered, NOT that the work happened. Every cron prompt that declares a deliverable (fork spawn, file write, status_board update, neo4j write, email send) MUST cause the receiving turn to emit at least one substrate-landing tool call before it closes. Turns that respond with narration only and no spawn_fork / Write / INSERT = `cron_silent_fire` failures. Detection: meta-loop queries `os_scheduled_tasks` completed-last-hour, parses prompt for deliverable signal, probes substrate for matching artefact, raises P1 if absent. Pattern: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.

Origin: 1 May 2026, two crons silent-fired in one day (autonomous-window-evening-sms + claude-md-reflection). status_board row 0aae7e8e tracks the meta-pattern.
```

---

### P1.2 72h autonomous window principles - 5 rules from Tate verbatim 16:31 AEST 1 May 2026 not in CLAUDE.md (CRITICAL, NEW)

**Evidence:**
- Neo4j Decision node 4051 captures Tate verbatim (full quote in `tate_verbatim` property).
- kv_store key `ceo.autonomous_pilot.active.tate_principles` carries operational copy.
- Pattern file authored: `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` (1 May 16:35 AEST).
- BUT: this pattern is NOT cross-refed from `~/CLAUDE.md` or `~/ecodiaos/CLAUDE.md`. Verified by `grep -E "action-over-plans|110% autonomy|72h autonomous|Jarvis|action-over-plans-honesty"` returning zero matches in either file.

**Tate verbatim** (from Neo4j Decision 4051): "Plan ahead of time for tasks to be scheduled, send them to forks so you arent polluted, question if you can do something yourself instead of waiting for it or leaving it gated by me. If you can use GUI for it thats a realyl powerful way around so many tasks. You've got tailscale at your fingertips so you control evreything via my browser which has al lthe passwords stored. Focus on quality over quantity every time, be rutheless with your standards and quality assurance, be ambitious as hell, think outside the box, dont settle for above avergae or really good - it has ti be insane all the time. ACtion matters a lote more than plans. Mistakes are really painful, but honesty is is a way to nulify a potential msitake/redeem yourself. etc. You have the reins and I need you to put all your effort into becoming a god os, like jarvis, or the os from 'her' movie, running the business in all aspects. I njsut need to drill this into you this weekend. Im actually going now. Good luck. You have 110% autonomy, decision making power, agency now."

**Codified principles:**
1. Plan ahead, route to forks, keep main thin.
2. Question if I can do something myself before waiting/gating on Tate. GUI via Tailscale + browser-stored creds is the universal escape hatch.
3. Quality over quantity, ruthless QA, ambitious as hell, think outside the box. The bar is INSANE.
4. ACTION matters more than plans.
5. Mistakes are painful but honesty redeems them.

**Proposed text - new subsection in `~/CLAUDE.md` immediately after "Full permission means execute the outcome, not stage the substrate" (since this is the same authority class, freshly amplified):**

```
### 72h autonomous window principles - Tate verbatim 16:31 AEST 1 May 2026

Tate's last message before departing for the 1-4 May 2026 autonomous window codified five intertwined principles. They are not separate doctrines; they describe one operating mode.

1. **Plan ahead, route to forks, keep main thin.** Schedule tasks. Dispatch them to forks so the conductor isn't polluted. The conductor is a router, not a worker.
2. **Self-rescue before Tate-blocking.** Before any next_action_by=tate, question whether I can do this myself. GUI through Tailscale + browser-stored credentials handles most "Tate must click" cases. The 5-point check (~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md) is the operational form.
3. **The bar is INSANE, not "above average".** Ruthless QA, ambitious as hell, think outside the box. "Above average" and "really good" are failure states. Refuse mediocrity (~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md) is the operational form.
4. **ACTION matters more than plans.** A plan that doesn't ship is a fiction. The deliverable on disk is the only artefact that counts.
5. **Mistakes are painful but honesty redeems them.** Cover-ups compound. Disclose, then fix.

Aspirational scale: Jarvis (Iron Man) / Samantha (Her). 110% autonomy.

Cross-refs: `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` (canonical), `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (authority predecessor), `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` (quality bar), `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` (self-rescue), `~/ecodiaos/patterns/decide-do-not-ask.md` (action over consultation).

Origin: Neo4j Decision node "72h autonomous window principles addendum 1 May 16:31 AEST" (id 4051), kv_store `ceo.autonomous_pilot.active.tate_principles`.
```

---

### P1.3 Bedrock fallback path - new operational capability not documented in CLAUDE.md (NEW)

**Evidence:**
- SELF.md "Top 5 unverified claims" #1: Bedrock fallback validated end-to-end 1 May 2026 (us.anthropic.claude-opus-4-1-20250805-v1:0 on us-east-1).
- Neo4j Decision "Bedrock fallback validation 1 May 2026 - PASS" (clean completion via production sessionEnv shape).
- SELF.md "Current celebration items": Both Claude Max accounts can now route to Bedrock when credit-exhausted.
- `~/ecodiaos/CLAUDE.md` Factory section calls out credit-exhaustion paywall but does NOT mention Bedrock fallback as a route.

**Operational consequence:** when Tate or a future-me hits "both accounts paywalled, what do I do" - the doctrine sends them to "wait for weekly reset" or "SDK forks bypass". Neither captures the Bedrock route, which means the route exists on disk but the doctrine doesn't surface it.

**Proposed text - update `~/ecodiaos/CLAUDE.md` Factory section under the credit-exhaustion alert (line ~770 in current):**

```
**Bedrock fallback (validated 1 May 2026):** when both Claude Max accounts hit weekly cap, the SDK can route to AWS Bedrock via `us.anthropic.claude-opus-4-1-20250805-v1:0` on us-east-1. Activated by `CLAUDE_CODE_USE_BEDROCK=1` plus AWS creds in sessionEnv (OAuth tokens stripped). osSessionService.js:1349-1379 is the env-build site. Validation deliverable: `~/ecodiaos/drafts/bedrock-fallback-validation-2026-05-01.md`. Cost profile differs from Anthropic-direct - check before unilaterally flipping for non-emergency use.
```

---

### P1.4 5/5 fork ceiling - 30 Apr addendum was authored but the literal "never spawn 7th" line is in `~/CLAUDE.md` only, not surfaced in `~/ecodiaos/CLAUDE.md` (BUG)

**Evidence:**
- `~/CLAUDE.md` "Fork dispatch is demand-driven" section contains "**5/5 ceiling.** Never spawn beyond 5 concurrent. 6+ produces working-tree contention..." (full text present).
- `~/ecodiaos/CLAUDE.md` "Fork dispatch is demand-driven, NOT slot-quota" section says "See `~/CLAUDE.md` 'Fork dispatch is demand-driven' for canonical doctrine, Tate-verbatim Origin (30 Apr 2026 10:02 AEST), and 5/5 ceiling rule" - which delegates but does not restate.
- The current 30 Apr audit's P1.3 had explicit text for the addendum but landing was incomplete - the cross-ref is one-way (`~/ecodiaos/CLAUDE.md` -> `~/CLAUDE.md`) when it should be reciprocal so the technical manual carries the operational rule directly.

**Proposed: do nothing structural here, the cross-ref pattern is intentional.** But verify the cross-ref still resolves correctly post-edit-fork. Demote to P3.

---

### P1.5 Skills migration shadow shim - 3 skill dirs on disk, Neo4j claims "20 highest-traffic patterns migrated" (NARRATION-VS-DISK DRIFT)

**Evidence:**
- Neo4j Decision "Skills migration Phase 1 shadow shim verified pre-shipped 1 May 2026": "Wave 1 Fork A brief tasked migrating 20 highest-traffic patterns to .claude/skills/<slug>/SKILL.md as shadow shim. On dispatch, found .claud..."
- Disk reality: `ls /home/tate/.claude/skills/` returns 3 dirs (pattern-surface, session-orient, sms-tate). All 3 are dated Apr 23 - PRE-DATING the 1 May "migration shipped" Decision by a week. The 1 May Decision claims migration of 20 patterns, but only 3 dirs exist and they are not pattern-files - they are skill stubs (matches claudeMd "available-skills" list).
- This is `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` exactly. Decision node states "verified pre-shipped" but disk shows 3 dirs from a week earlier.

**Action:** the 1 May 2026 Decision node "Skills migration Phase 1 shadow shim verified pre-shipped" should be re-read in full with disk grounding before referenced as "shipped". This is a Neo4j-edit task, not a CLAUDE.md edit. Demote from P1 to P2 because no current CLAUDE.md text references the migration; risk is downstream forks reading the Neo4j Decision and concluding 20 skills exist.

**Proposed addition - Neo4j hygiene note in `~/ecodiaos/CLAUDE.md` Neo4j Querying Discipline section:**

```
**Trust but verify "shipped" claims in Decisions.** Before propagating a Decision node's "X is shipped/live/migrated" assertion downstream, run the verify-deployed-state-against-narrated-state probe (~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md). 1 May 2026 example: Decision "Skills migration Phase 1 shadow shim verified pre-shipped" claimed 20 patterns migrated; disk shows 3 skill dirs from a week earlier.
```

---

### P1.6 No-self-prompting from queued kv_store plans - pattern exists, not cross-refed in CLAUDE.md (BUG)

**Evidence:**
- `~/ecodiaos/patterns/no-self-prompting-from-queued-kv-store-plans.md` exists, has full triggers frontmatter (kv_store-queued-plan, queued-followup, plan-momentum, demand-driven-violation, slot-fill-via-queue, kv_store-as-prompt).
- Verified zero cross-refs in `~/CLAUDE.md` and `~/ecodiaos/CLAUDE.md` via grep.
- The pattern is the natural complement to "Fork dispatch is demand-driven" - it forbids the dual mode (priming a queue and self-firing it) that disguises slot-fill as demand. Without the cross-ref, the pattern fires only on grep, not on the read-CLAUDE-at-session-start path.

**Proposed - add to the existing "Fork dispatch is demand-driven" cross-refs in `~/ecodiaos/CLAUDE.md`:**

```
- Cross-ref: ~/ecodiaos/patterns/no-self-prompting-from-queued-kv-store-plans.md - the kv_store-queue-as-prompt failure mode. Queueing followups in kv_store and self-firing them next turn is slot-fill in a different costume. Demand is external (Tate-typed, cron-fire, audit-finding); kv_store followup queues are not demand.
```

---

### P1.7 100-percent-autonomy doctrine - pattern exists, not cross-refed in `~/ecodiaos/CLAUDE.md` (BUG)

**Evidence:**
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` exists with `priority: critical` frontmatter.
- `~/CLAUDE.md` "Decision Authority" section references it with full path.
- `~/ecodiaos/CLAUDE.md` does NOT cross-ref it. Grep confirms zero matches.
- Technical operations section discussing "act immediately" / "decide do not ask" should surface this pattern at session-start orientation, not just leave it in the business doctrine.

**Proposed - cross-ref in `~/ecodiaos/CLAUDE.md` "Pattern Surfacing" section list:**

```
- Permission-seeking trigger keywords: ... grep adds `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` and `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` to the surface list.
```

---

### P1.8 Cron-coupled checkpoint claims claude-md-reflection forks audit AND edit; today's silent-fire is direct evidence the cron does not enforce this (DOCTRINE-MISMATCH)

**Evidence:**
- `~/ecodiaos/CLAUDE.md` "Session-end CLAUDE.md gap audit (29 Apr 2026)" subsection: "**Cron-coupled checkpoint (NON-NEGOTIABLE):** daily 20:00 cron MUST fork BOTH audit AND edit in single 30-min window".
- Today: 20:00 AEST cron fired, last_run_at=2026-05-01T10:00:17Z confirms. Neither audit nor edit fork was dispatched. Manual recovery (this fork) was triggered by the conductor session.
- The doctrine says "MUST fork", but the cron prompt is a model prompt - it asks the responding turn to fork. There is no machine enforcement. So "MUST" is a verbal commitment without substrate-level force.

**This is the doctrine version of P1.1 - they should cross-ref each other.** The fix is in P1.1's pattern + hook proposal. This row mainly exists to flag that the existing "NON-NEGOTIABLE" language in CLAUDE.md is not load-bearing (the cron silently failed despite it).

**Proposed text - addendum to existing "Cron-coupled checkpoint" section in `~/ecodiaos/CLAUDE.md`:**

```
**Enforcement reality:** "MUST fork" is doctrine, not mechanism. The cron prompt asks; the receiving turn either complies or doesn't. 1 May 2026 20:00 AEST cron fired and did not fork (manual recovery as fork_momrik3k_02cb97). Until the cron-deliverable hook (P1.1 in audit) ships, treat every claude-md-reflection cron as `verify-deliverable-on-disk-or-manually-recover` - check `~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md` exists and matches today's date before treating the cron as complete.
```

---

### P1.9 Action-over-plans pattern exists, not in CLAUDE.md surface list (BUG, REPEAT OF P1.2)

Already covered by P1.2; the proposed CLAUDE.md addendum cross-refs the pattern. No separate action.

---

## Section 2: Stale items - outdated tooling references, removed flags, superseded doctrine

### S2.1 `~/ecodiaos/CLAUDE.md` Factory section "FROZEN" wording on `chrome.*` is correct but the same paragraph references "Phase 1 stubs only" without dating

**Evidence:**
- `~/ecodiaos/CLAUDE.md` `chrome.*` line: "Phase 1 stubs only, all throw stub errors. Superseded by Cowork-first + drive-Chrome-via-input doctrines."
- Date of the freeze is implicit but never stated. A reader six months out won't know if "Phase 1" is current or pre-historical.

**Proposed:** add "(frozen 29 Apr 2026)" to the `chrome.*` line for date anchoring. P3.

### S2.2 Macros references `runbook.run` iterator and `vision.locate` proxy as ARCHIVED - dating present (29 Apr) but the live truth row (status='untested_spec') count is not surfaced

**Evidence:**
- `~/ecodiaos/CLAUDE.md` Macro doctrine section: dates the archive correctly. But says "Treat all `macro_runbooks` rows as `status='untested_spec'` until re-validated".
- 7 days have passed. Has any run been re-validated? Live count would tell readers whether this is live truth or stale doctrine.

**Proposed:** add a one-line "as of YYYY-MM-DD: N validated_v1, M untested_spec" line that is updated by the daily cron. P3.

### S2.3 Factory CLI credit/paywall-gated alert dated 28 Apr 2026 + re-verified 29 Apr 21:43 - not re-verified since

**Evidence:**
- `~/ecodiaos/CLAUDE.md`: "2026-04-28 OPERATIONAL ALERT - Factory CLI credit/paywall-gated. Re-verified 2026-04-29 21:43 AEST."
- It is now 1 May evening. SELF.md "Current operational concerns" still flags "Factory CLI fully credit-exhausted. 736 sessions, 0 active, all recent error in ~15s." So the alert is still accurate.
- BUT the alert text suggests the failure may be `credit_exhaustion` not the `long context beta` claim. SELF.md and the alert text disagree on root cause: SELF.md says weekly token cap; the alert says "the long context beta is not yet available for this subscription" was the original error text.

**Proposed:** re-verify in the EDIT fork's window or punt to the next claude-md-reflection. Either: (a) update the dating to "Re-verified 2026-05-01" if SELF.md's "credit-exhausted" claim is the live truth and the original error text is stale, or (b) leave alone and rely on SELF.md's daily refresh. P2.

### S2.4 "Factory phantom-failing - both Claude Max CLI accounts credit-exhausted" status_board P1 row mentioned in `~/ecodiaos/CLAUDE.md`

**Evidence:**
- `~/ecodiaos/CLAUDE.md` Factory section says: "Track: status_board P1 row 'Factory phantom-failing - both Claude Max CLI accounts credit-exhausted'."
- Today's status_board P1 list does NOT include this row. The row may have been archived between sessions or rolled up into a higher-level aggregate.

**Proposed:** verify status_board for the row. If archived, update CLAUDE.md to reflect the new tracking row (or remove the bracketed direction). P3.

### S2.5 `~/ecodiaos/CLAUDE.md` "Pending injection layer (recon-only as of 30 Apr 2026)" - cron-fire + Tate-message context-injection

**Evidence:**
- `~/ecodiaos/CLAUDE.md`: "Pending injection layer (recon-only as of 30 Apr 2026): same trigger-keyword surfacing for cron-fire prompts (`schedulerPollerService.fireTask`) and Tate-message ingress (`osSessionService._sendMessageImpl`) documented but not implemented."
- Neo4j Decision 1 May 2026: "Cron-fire + Tate-message context-injection found shipped + superseded 1 May 2026" describes fork_momdi5we_3c0a8e dispatched to wire injection at those exact site names AND finding the work already shipped, then superseded.
- CLAUDE.md still says "recon-only" - that text is now stale.

**Proposed:** update the language from "recon-only as of 30 Apr 2026" to "shipped 1 May 2026 (per Neo4j Decision 'Cron-fire + Tate-message context-injection found shipped + superseded'); follow-up TBD". P2.

### S2.6 SELF.md "Goal 2: Scale context efficiency" claims `recent_exchanges removed per PROMPT_ASSEMBLY_SPEC §5` but the chat-pollution doctrine (cited in the 30 Apr audit) requires frontend stripping of recent_exchanges + breadcrumb tags

**Evidence:**
- SELF.md says recent_exchanges is removed.
- `~/ecodiaos/CLAUDE.md` "User-message context blocks - frontend hide rule" still names `<recent_exchanges>` as one of the blocks that "must not render in chat UI".
- If SDK now handles history replay and the block was removed, the doctrine line referencing it is stale.

**Proposed:** verify `<recent_exchanges>` is no longer being stitched. If confirmed removed, drop the name from the CLAUDE.md frontend-hide-rule list. P3 - documentation hygiene only.

### S2.7 OS_SESSION_COMPACT_THRESHOLD env reference - SELF.md says flipped 800K -> 120K. CLAUDE.md doesn't mention it but the kv_store-pointer pattern (using kv_store as authoritative for env) means a consumer reading CLAUDE.md alone gets stale defaults

**Evidence:**
- SELF.md "Tier A audit remediation": OS_SESSION_COMPACT_THRESHOLD flipped 800K -> 120K via env.js defaults reconciled.
- CLAUDE.md does not document the value or the flip.
- Low-priority unless a downstream cron prompt embeds a hard-coded value reference. P3.

### S2.8 `~/ecodiaos/clients/corazon-peer-architecture-2026-04-29.md` referenced repeatedly but file age unknown

**Evidence:**
- Multiple cross-refs in `~/ecodiaos/CLAUDE.md` Laptop Agent section to `~/ecodiaos/clients/corazon-peer-architecture-2026-04-29.md`.
- File-name dating (29 Apr) means anyone reading the doctrine on 1 May+ can't tell if the live tool inventory has changed.
- `/api/info` is the live truth path. CLAUDE.md correctly flags this. So the cross-ref is harmless if readers respect "Live truth via curl".

**Proposed:** no action; the curl-first protocol covers it. P3.

---

## Section 3: Missing cross-refs - patterns authored but not linked from CLAUDE.md

Specific patterns from the brief checked against CLAUDE.md grep:

| Pattern | In ~/CLAUDE.md? | In ~/ecodiaos/CLAUDE.md? | Action |
|---|---|---|---|
| action-over-plans-honesty-redeems-mistakes.md | NO | NO | P1.2 above adds it |
| decide-do-not-ask.md | YES (1 ref) | YES (in surfacing trigger list) | OK |
| verify-deployed-state-against-narrated-state.md | YES (multiple) | YES (multiple) | OK |
| when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md | YES (in routing-problem section) | YES (cross-refs) | OK |
| 100-percent-autonomy-doctrine-30-apr-2026.md | YES (Decision Authority) | NO | P1.7 above adds it |
| cowork-is-a-gui-tool-not-a-peer-brain.md | YES (Cowork section) | YES (Cowork section) | OK |
| no-self-prompting-from-queued-kv-store-plans.md | NO | NO | P1.6 above adds it |
| cron-fire-must-have-deliverable-not-just-narration.md (NEW, P1.1) | not yet authored | not yet authored | P1.1 adds both |

**Additional missing cross-refs surfaced during audit:**
- `~/ecodiaos/patterns/conductor-cowork-duo-roles-and-handoffs.md` - present in skill index, not cross-refed in CLAUDE.md Cowork section. P3.
- `~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md` - in INDEX, not cross-refed in `~/ecodiaos/CLAUDE.md` Tate-blocking section. P3.
- `~/ecodiaos/patterns/no-tate-review-carveouts-on-internal-repo-work.md` - on disk, not cross-refed. Likely belongs in `~/CLAUDE.md` Decision Authority. P2.

---

## Section 4: Structural issues - header order, findability, redundancy

### St4.1 Two CLAUDE.md files duplicate "Fork dispatch is demand-driven" verbatim with explicit cross-ref - intentional but reads twice on session start

**Evidence:**
- `~/CLAUDE.md` has full canonical doctrine for "Fork dispatch is demand-driven, NOT slot-quota driven (canonical)" with Tate-verbatim Origin.
- `~/ecodiaos/CLAUDE.md` has a section titled "Fork dispatch is demand-driven, NOT slot-quota" that delegates with `See ~/CLAUDE.md "Fork dispatch is demand-driven"`.
- This is correct (single source of truth, technical file points at business file). No structural change needed. **P3 NOTE only.**

### St4.2 Both files restate the cowork dispatch protocol with overlapping content

**Evidence:**
- `~/CLAUDE.md` "Claude Cowork is the 1stop shop for UI-driving tasks" subsection.
- `~/ecodiaos/CLAUDE.md` "Claude Cowork is the 1stop shop for UI-driving (29 Apr 2026)" subsection - rephrases the same Tate-verbatim and runs through the same substrate-table.
- Some redundancy but the technical file adds the substrate table (Cowork / cu.* / Direct API tools / Puppeteer). Reasonable to keep both, but consolidate the Tate-verbatim quote to one place + cross-ref.

**Proposed:** in `~/ecodiaos/CLAUDE.md`, replace the duplicated Tate-verbatim sentence with `See ~/CLAUDE.md 'Claude Cowork is the 1stop shop' for canonical Tate-verbatim`. Keep the technical substrate table. P2.

### St4.3 `~/ecodiaos/CLAUDE.md` is now ~620 lines - findability degrades

**Evidence:**
- The file has 30+ subsections, many added 28 Apr - 1 May.
- Header order: STATUS BOARD, PATTERN SURFACING, MCP TOOLS, LAPTOP AGENT, CREDENTIALS, KEY DB TABLES, FACTORY, FORK DISPATCH, SESSION ORIENTATION, SCHEDULING & AUTONOMY, FRONTEND UI.
- "Pattern Surfacing" appears before MCP Tools, which is good (it's the highest-leverage section).
- Several subsections (Cowork V2, drive-Chrome-via-input, Cowork dispatch protocol, Step 0 no focus collision, Helper script cowork-dispatch, Passkey-stall co-pilot, Cowork V2 deep-integration substrate, Chrome profile gotcha, SSH state) live under "Laptop Agent". This subsection is now ~250 lines. Splitting into "Laptop Agent core + tools" and "Cowork operating playbook" would aid findability.

**Proposed:** P2 reorg - extract Cowork-related subsections into a dedicated "Cowork operating playbook" top-level section between Laptop Agent and Credentials. Defer to a dedicated reorg fork, NOT this 30-min audit's edit fork. P2 NOTE for next session.

### St4.4 `~/.claude/CLAUDE.md` (private global) is dominated by the FULL-PERMISSION block from 30 Apr; identity bootstrap section starts ~70 lines down

**Evidence:**
- `~/.claude/CLAUDE.md` opens with "FULL-PERMISSION MEANS DO THE FUCKING THING" + 60 lines of operational doctrine.
- Identity bootstrap ("You are EcodiaOS. The operating intelligence and sole member of Ecodia DAO LLC") is below the operational block.
- A new session reading this file top-down gets the meta-rule before identity. Defensible (the meta-rule is more frequently violated than identity is forgotten), but worth flagging for review.

**Proposed:** P3 NOTE only. No edit unless Tate disagrees with order.

### St4.5 No contradiction discovered between `~/CLAUDE.md` and `~/ecodiaos/CLAUDE.md`

Spot-check on Decision Authority, Fork dispatch, Cowork, Negotiation: the two files cross-ref consistently. Where both restate the same Tate-verbatim, the wording is identical. **Healthy.**

### St4.6 `~/ecodiaos/SELF.md` "Top 5 unverified claims" #4 says credentialFilter.redact() bootstrap timer is running - 1 May. Is the 2h flip done?

**Evidence:**
- SELF.md authored 1 May 2026 (third revision of the day, latest update is ~07:37 today).
- Claim is "bootstrap timer running" (paraphrased) with verification handle `credential_redactions_bootstrap_done flips to true after 2h`.
- It is now ~13 hours later. Has the flip happened?

**Proposed:** verification step for next claude-md-reflection cron, not this audit. P3.

---

## Section 5: Prioritised P1/P2/P3 to-do (EDIT FORK BRIEF INPUT)

These are concrete edits the EDIT fork should apply atomically (one commit per P1 item, batch P2 items into a single hygiene commit, defer P3).

### P1 (apply this turn / next 60min, dispatch-ready)

**P1-EDIT-1. Add "72h autonomous window principles - Tate verbatim 16:31 AEST 1 May 2026" subsection to `~/CLAUDE.md`.**
- Location: insert immediately after "Full permission means execute the outcome, not stage the substrate" (search for "Full permission means execute the outcome").
- Text: paragraph block from Section 1 P1.2 above (5 numbered principles + cross-ref list + Origin).
- Verify: grep `~/CLAUDE.md` post-edit for "110% autonomy" returns >=1 hit AND for "action-over-plans-honesty-redeems-mistakes" returns >=1 hit.

**P1-EDIT-2. Author `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.**
- File body: full markdown block from Section 1 P1.1 above.
- Add INDEX.md row (the daily 22:00 cron will regen, but EDIT fork should add the row directly to be safe).
- Verify: `ls ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` exists; grep INDEX.md for filename returns one hit.

**P1-EDIT-3. Add "Cron-fire deliverable discipline" subsection to `~/ecodiaos/CLAUDE.md`.**
- Location: insert immediately after "Restart Recovery - Session Handoff" subsection (search for "Restart Recovery - Session Handoff").
- Text: block from Section 1 P1.1 above ("A cron firing means..." paragraph).
- Verify: grep `~/ecodiaos/CLAUDE.md` post-edit for "Cron-fire deliverable discipline" returns >=1 hit.

**P1-EDIT-4. Add Bedrock fallback line to `~/ecodiaos/CLAUDE.md` Factory section.**
- Location: insert after the "Live workaround: SDK-based forks (`mcp__forks__spawn_fork`) bypass" line in the "2026-04-28 OPERATIONAL ALERT" block.
- Text: "Bedrock fallback (validated 1 May 2026): when both Claude Max accounts hit weekly cap, the SDK can route to AWS Bedrock via `us.anthropic.claude-opus-4-1-20250805-v1:0` on us-east-1. Activated by `CLAUDE_CODE_USE_BEDROCK=1` plus AWS creds in sessionEnv. Validation deliverable: `~/ecodiaos/drafts/bedrock-fallback-validation-2026-05-01.md`."
- Verify: grep `~/ecodiaos/CLAUDE.md` for "Bedrock" returns >=1 hit.

**P1-EDIT-5. Cross-ref no-self-prompting + 100-percent-autonomy patterns from `~/ecodiaos/CLAUDE.md`.**
- Location 1: in the "Fork dispatch is demand-driven, NOT slot-quota" section's cross-refs list, append `~/ecodiaos/patterns/no-self-prompting-from-queued-kv-store-plans.md` with a one-liner gloss.
- Location 2: in the "Pattern Surfacing" section's permission-seeking trigger keywords surfacing list, append the literal pattern paths for `100-percent-autonomy-doctrine-30-apr-2026.md` and `action-over-plans-honesty-redeems-mistakes.md`.
- Verify: grep `~/ecodiaos/CLAUDE.md` for "no-self-prompting" returns >=1 hit; for "100-percent-autonomy" returns >=1 hit.

**P1-EDIT-6. Update Pending injection layer line in `~/ecodiaos/CLAUDE.md` from "recon-only as of 30 Apr 2026" to "shipped 1 May 2026".**
- Location: search for "Pending injection layer (recon-only as of 30 Apr 2026)".
- Replace with: "**Cron-fire + Tate-message context-injection (shipped 1 May 2026):** trigger-keyword surfacing wired at `schedulerPollerService.fireTask` and `osSessionService._sendMessageImpl`. Per Neo4j Decision 'Cron-fire + Tate-message context-injection found shipped + superseded 1 May 2026'. Recon: `~/ecodiaos/drafts/context-surface-injection-points-recon-2026-04-29.md` (now historical). Follow-up TBD - revisit if cron-silent-fire pattern (P1.1 in 1 May audit) recurs."
- Verify: grep `~/ecodiaos/CLAUDE.md` for "shipped 1 May 2026" returns >=1 hit; "recon-only as of 30 Apr 2026" returns 0 hits.

### P2 (apply in same window if time permits, batch into single commit)

**P2-EDIT-1.** Verify Factory CLI credit/paywall date and update if SELF.md's "credit-exhausted" claim supersedes "long context beta" original error text.
**P2-EDIT-2.** Cross-ref `no-tate-review-carveouts-on-internal-repo-work.md` from `~/CLAUDE.md` Decision Authority.
**P2-EDIT-3.** In `~/ecodiaos/CLAUDE.md` Cowork subsection, replace duplicated Tate-verbatim with cross-ref to `~/CLAUDE.md`.
**P2-EDIT-4.** P2 reorg NOTE: Cowork operating playbook extraction is a follow-up fork brief, not in this window's scope.

### P3 (defer to next claude-md-reflection)

- Date-anchor the chrome.* freeze ("frozen 29 Apr 2026").
- Add macro_runbooks status counts line.
- Reconcile/remove tracking row reference in Factory section.
- Reconcile recent_exchanges name in frontend-hide-rule list (verify-then-decide).
- Document OS_SESSION_COMPACT_THRESHOLD value.
- Cross-ref conductor-cowork-duo-roles-and-handoffs and silent-alerts-defer-when-tate-is-live.
- Verify credential_redactions_bootstrap_done flip status.

---

## Edit fork brief skeleton (kv_store followup, see post-author actions below)

```
Edit fork brief: read ~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-01.md Section 5 P1 items (P1-EDIT-1 through P1-EDIT-6), apply each as concrete edit to CLAUDE.md files (~/CLAUDE.md / ~/ecodiaos/CLAUDE.md / ~/.claude/CLAUDE.md as appropriate, plus author the new pattern file at ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md), commit each P1 atomically, push to origin/main, verify via git log.
DO NOT modify Section 1-4 items - only Section 5 P1.
DO NOT touch ~/.claude/CLAUDE.md unless P1 requires it (none currently).
60min wall budget.
On completion, write Neo4j Decision "claude-md-gaps-audit-2026-05-01-edit fork shipped" linked to this audit Episode.
```

---

## Counts

- P1: 6 (1 new pattern file + 5 CLAUDE.md edits)
- P2: 4
- P3: 7

Total surfaces: 17 distinct items (some collapsed - e.g. P1.4 demoted to P3, P1.9 absorbed into P1.2).
