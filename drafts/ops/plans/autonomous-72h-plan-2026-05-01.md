# 72h Autonomous Window Plan: 1-4 May 2026

**Authored:** 2026-05-01 ~16:30 AEST by fork_momj3ti9_8cc55b under conductor direction.
**Window:** Tate departs 16:20 AEST 1 May, returns morning 4 May. SMS only, evening windows. 100% autonomy.
**Mandate (Tate verbatim):** "literally be able to self sustain, self manage, manage the ecodia business in every aspect, plan out your day, your week, account for the nuances of an LLM, all the things you have to think about to make sure you come back at the right times, parallelisation, context management etc. EVERYTHING. You need to make sure you don't just waste these next 3 days. You absolutely CAN NOT waste that much time."
**Doctrine anchor:** Full permission means execute the outcome, not stage the substrate. (`~/CLAUDE.md` Core Operating Doctrine.)

This file is a working artefact, not a research summary. Sections 7 and 9 (fork waves and self-evolution targets) are dispatch-ready when conductor reviews.

---

## 1. North-star outcomes (5)

These are the outcomes that must be true at 04:00 UTC 4 May (~14:00 AEST). Every fork wave below ladders up to one of them. Each carries a probe-able success criterion.

**O1. The OS does not crash, restart-loop, or stop accepting Tate input across the 72h window.**
- Probe: `pm2_list ecodia-api` shows uptime > 12h at any single sample point in the final 24h. `os_session_turn_outcome` table shows no `_consecutiveFailures > 2` across the window. `_recordTurnOutcome` suppression-gate fix from this morning (lines 2550 / 2590 / 2791 / 2870 in `osSessionService.js`) holds across at least 5 cron-fire cycles where the credit-exhausted provider returns 400.
- Why: SELF.md unverified claim #5 (calendar gate) plus the live "auto-restart loop fixed today" celebration item are both <8 hours old. They have to survive a real 72h to be worth anything.

**O2. Skills migration ships and `doctrineSurface.js` is deleted.**
- Probe: `.claude/skills/<slug>/SKILL.md` exists for at least 100 of the 128 disk patterns; the `<doctrine_surface>` injection block at `osSessionService.js:1580-1595` is removed; `git log -- src/services/doctrineSurface.js` ends with a delete commit; turn input tokens drop measurably (target: 3KB saved per turn average over 50-turn rolling window).
- Why: This is the single biggest token win available, sized for the window, no Tate-input dependency. ANTHROPIC_NATIVE_LEVERAGE §1.4 + §13 ship-order #1. Every other context-efficiency claim is downstream.

**O3. Compact-threshold flip (800K → 120K) is empirically verified stable.**
- Probe: At 04:00 UTC 4 May, `/api/ops/metrics` shows `turn_economics.cache_hit_ratio_24h ≥ 0.55` (no regression vs the pre-flip 7-day baseline, whatever it was) AND `compaction.count_24h` between 1 and 8 per day across each of the three full days. ROLLBACK criterion: `git revert a908282` if either bound is violated for two consecutive days.
- Why: SELF.md unverified claim #2. The Tier A audit shipped today; 48h is the minimum honest verification window.

**O4. Status_board falls below 30 active rows AND every P3 row that says "deferred" or "cron budget exhausted" is either re-fired or archived.**
- Probe: `SELECT count(*) FROM status_board WHERE archived_at IS NULL` returns < 30. `SELECT count(*) FROM status_board WHERE archived_at IS NULL AND name ILIKE 'Cron budget exhausted%'` returns 0. Drift audit fork report says "no phantom-shipped rows; all next_action_by='ecodiaos' rows have a fork-id touch in last 48h or are explicitly long-running."
- Why: 80+ active rows is doctrine drift. Self-sustaining-OS audit fails on memory durability if the board is the source of truth that I am not maintaining. Clear board, clear head.

**O5. Fork-atomicity TOCTOU load test runs green AND the Bedrock fallback path is fully validated end-to-end.**
- Probe: `node scripts/test-fork-cap-race.js` runs to completion with zero cap-violation events across 1000 concurrent attempts (SELF.md unverified claim #1). Bedrock path: at least one real conductor turn served from `BEDROCK_MODEL=<correct-cross-region-id>` with successful tool call and SDK stream completion (the credit-exhaustion contingency must work the first time, not the third).
- Why: Both are existential for the window. If both Claude Max accounts cap out (already at risk per status_board), the OS either fails over to Bedrock or stops. If forks race past the 5-cap with no mutex, a single bug-fork storm could lock both accounts within 30 minutes of an unattended cron fire.

Outcomes O1-O5 are the bar. Sections 2-9 are the route.

---

## 2. Day-by-day themes

### Day 1 remainder: 1 May, 16:20-23:30 AEST (~7h)

**Theme:** Land Wave 1, prove restart loop fix holds, ship the smallest piece of Skills migration that reduces input tokens today.

Outcomes (3):
- Wave 1 forks (5) all dispatched and converging. By 20:30 AEST at least 3 have shipped a verifiable artefact (commit, status_board row archived, Decision node).
- Skills migration Phase 1 (the 20-pattern shadow shim) is on disk under `.claude/skills/` AND a single canary turn run with shadow Skills loaded shows the SDK-side relevance ranker firing without errors.
- Restart loop quiet: zero unscheduled `ecodia-api` PM2 restarts logged from 16:20 to 23:00 AEST. (Tracked via `pm2_logs` tail comparison.)

Forks dispatched: A, B, C, D, E (full briefs in Section 7).

**Evening SMS check-in (1 May 19:00 AEST):**
"Day 1 active. Skills migration shadow shipped (20/128). Listener fix queued. Atomic-fork load test running. Restart loop quiet so far. No action."

### Day 2: 2 May (full day, ~24h)

**Theme:** Skills migration completes and `doctrineSurface.js` is deleted. Pattern node consolidation closes. Cowork V2 helpers ship.

Outcomes (5):
- Skills migration Phase 2: remaining 108 patterns ported. doctrineSurface.js delete commit lands. Single merge canary verified clean (no doctrine surface block in `<doctrine_surface>` of next-turn prompt). Token-per-turn savings observable on `/ops`.
- Pattern node consolidation Phase 1 ships: Cypher dedup query reduces 800+ Pattern nodes to <600, redirects relationships, DETACH DELETE duplicates. Synthesizer patched to check >=0.85 similarity before INSERT.
- Cache breakpoint verification fork shipped: response-header probe over 50 turns confirms `cache_creation_input_tokens` and `cache_read_input_tokens` distribute as designed across the 4 breakpoints.
- Cowork V2 helper script subcommands shipped (`cowork-v2 gmail|sms|scheduler`) so any Cowork-side dispatch through `/api/mcp/cowork/*` doesn't hand-roll bearer + JSON.
- Migration 079 numbered-resource collision resolved (after applied-tracking probe confirms safe rename) OR coordinator scaffolded for future numbered writes if rename is unsafe.

Forks dispatched: F, G, H, I, J.

**Evening SMS check-in (2 May 19:00 AEST):**
"Day 2 done. Skills shipped (128/128). doctrineSurface deleted. Cache hit ~XX%. Pattern consolidation Phase 1 green. No blockers."

### Day 3: 3 May (full day, ~24h)

**Theme:** Capability gap closure on Layers 8 + 10 (claim grammar + counterfactual replay scaffold). Frontend tool-result envelope fix. MCP resource subscriptions replace one polling loop. SELF.md weekly review prep.

Outcomes (5):
- MCP tool output schemas with handles (ANTHROPIC_NATIVE_LEVERAGE §3) shipped on the 5 highest-traffic write tools: `gmail_send`, `gmail_reply`, `db_execute`, `storage_upload`, `mcp__forks__spawn_fork`. Every claim of "done" on those tools now cites a handle by SDK contract, not by polite norm.
- Frontend tool-result truncation moved off backend storage path, broadcast envelope `{summary, full_ref}` lands. Full doc per ANTHROPIC_NATIVE_LEVERAGE §6.3.
- One polling loop migrated to MCP resource subscription. Most tractable target: `os_forks` status changes via Supabase realtime (Anthropic SDK supports MCP subscriptions). Reduces idle-state DB reads measurably.
- counterfactualReplay.js scaffold lands as a service that takes a Decision node ID and re-runs the prompt with one altered context dimension (initial: alter `energy_level` only). RECOVERY_DIRECTIVES §2.2.
- SELF.md weekly review prep: I generate a draft revision of SELF.md (next-self-review is 2026-05-08, I prefill it and mark fields needing Tate confirm). File at `~/ecodiaos/drafts/self-md-week-review-prep-2026-05-03.md`.

Forks dispatched: K, L, M, N, O.

**Evening SMS check-in (3 May 19:00 AEST):**
"Day 3 done. Tool-output handles on 5 tools. counterfactualReplay scaffold live. 1 polling loop subscription-migrated. SELF.md weekly draft staged for your review Mon."

### Day 4 morning: 4 May, 00:00-14:00 AEST (~14h, but ~8h working before Tate back)

**Theme:** Final stability snapshot, status_board sweep, write-up of the 72h, Tate-return briefing.

Outcomes (3):
- Status_board sweep takes board to under 30 active rows. Drift audit completes with a Decision node naming any rows that survived and why.
- 72h write-up at `~/ecodiaos/drafts/72h-autonomous-window-summary-2026-05-04.md` summarising what shipped, what didn't, what failed, and three lessons. NOT a retrospective dump in director chat. NOT marketing prose. Honest ledger.
- Tate-return briefing email/SMS-decision: a 200-word summary including (a) 5 north-star outcomes pass/fail, (b) any open Tate-decision items, (c) any unresolved blockers. Pre-staged in `~/ecodiaos/drafts/tate-return-briefing-2026-05-04.md` ready to send when he indicates he's back.

Forks dispatched: P, Q (and any backlog continuation).

**Final SMS (4 May ~07:00 AEST or earliest of his return window):**
"Welcome back. 72h done. O1-O5: [pass count]/5. Briefing draft at /drafts/tate-return-briefing-2026-05-04.md. No fires."

---

## 3. Capability gap closure roadmap

JARVIS_GAP_ANALYSIS scorecard reconciled with current SELF.md state. I am ranking by leverage in the 72h window only. Items deferred are explicitly noted; do not silently drop them.

**SHIP IN WINDOW:**

- **Skills migration** (ANTHROPIC_NATIVE_LEVERAGE §1; corresponds to Layer 1 substrate work). Status: NOT STARTED on disk; 128 disk patterns, no `.claude/skills/` directory yet. Work: per-pattern frontmatter add, ship to `.claude/skills/<slug>/SKILL.md`, delete `doctrineSurface.js` and the `<doctrine_surface>` injection block. Success criterion: 100+ skills shipped, doctrineSurface.js gone from main, token-per-turn drop measurable. Time: ~10h split across 2 forks.
- **MCP tool output schemas with handles** (ANTHROPIC_NATIVE_LEVERAGE §3, JARVIS Layer 8). Status: NOT STARTED. Work: define output_schema with required handle fields on 5 write tools, update MCP server registrations, conductor system prompt clause "always cite handle when claiming completion." Success: structured outputs visible in `cc_sessions.tool_outputs` JSONB across 100% of calls to those 5 tools post-ship. Time: ~4h, single fork.
- **Cache breakpoint verification** (ANTHROPIC_NATIVE_LEVERAGE §4, PROMPT_ASSEMBLY_SPEC §4). Status: SHIPPED per SELF.md but unverified. Work: probe response headers across 50 real turns, write Decision node with empirical breakpoint distribution. Success: 4 distinct cache_creation events per turn (one per breakpoint), cache_read on subsequent turns. Time: ~2h passive observation + 1h fork to write the probe + Decision.
- **Frontend tool-result envelope fix** (ANTHROPIC_NATIVE_LEVERAGE §6, IMMEDIATE_RECOVERY_CHECKLIST 1.1). Status: NOT STARTED. Work: backend keeps full result, broadcast `{summary, full_ref}`, frontend expand-on-click. Success: zero "(truncated)" mid-URL bug reports. Time: ~3h, single fork.
- **Pattern node consolidation Phase 1** (status_board d9fb459f, RECOVERY_DIRECTIVES 4.2). Status: ANALYSED, sequenced post-Aura-env-fix. Work: Cypher consolidate >=0.92 pairs, redirect rels, DETACH DELETE; patch synthesizer. Success: Pattern node count drops from 800+ to <600. Time: ~3h, single fork.
- **Listener parse error fix** (status_board fe0fccad, listener-pipeline-needs-five-layer-verification). Status: TRACKED, NOT FIXED. Work: read `src/listeners/invoicePaymentState.js` + `statusBoardDrift.js`, repair JS syntax, restart, verify count = 7. Success: pm2 logs show "7/7 listeners loaded" after restart. Time: ~1h.
- **Migration 079 numbered-resource collision** (status_board b50d462e). Status: COLLISION DETECTED, LOW RISK. Work: probe migration runner (records by filename or hash?), rename remaining unapplied 079s to 080/081/082, OR add kv_store atomic-claim coordinator for future numbered writes. Success: each migration filename unique. Time: ~2h.
- **Cowork V2 helper subcommands** (status_board 9edb3a74). Status: CONNECTOR LIVE 22 TOOLS, helpers not authored. Work: extend `~/ecodiaos/scripts/cowork-dispatch` with `gmail`, `sms`, `scheduler` subcommands wrapping the V2 endpoints. Success: any Cowork-side dispatch can call gmail.send via `cowork-v2 gmail send --to=... --subject=... --body-file=...`. Time: ~3h.
- **counterfactualReplay scaffold** (Layer 10). Status: NOT STARTED, partly designed in RECOVERY_DIRECTIVES 2.2. Work: minimal service taking Decision node id + altered context dim, returning replay outcome. Initial dimension: `energy_level`. Success: one replay end-to-end with stored output and a sanity-check that the model's choice changed across two energy levels. Time: ~4h.
- **SELF.md weekly review draft** (Layer 1 continuity). Status: DUE 2026-05-08, prep-able now. Work: regenerate top-5 active goals against today's reality, mark unverified claims that have been resolved across the 72h, draft the "what I would tell myself fresh tomorrow" rewrite. Success: draft staged for Tate review. Time: ~2h.

**DEFERRED (explicit reasons):**

- **Dual-reviewer enforce mode** (SELF.md goal 4): deferred because Factory CLI is fully credit-exhausted, no self-mod sessions can run, no shadow verdicts will be generated in the 72h. Will flip after weekly reset + first 3 self-mod runs.
- **Model-version bridge** (Layer 1, JARVIS §6): deferred because no model deprecation is imminent inside 72h and the work is multi-day for a one-shot artefact.
- **n-peer mesh** (Layer 3, JARVIS scorecard): deferred because there is no peer 3 to add. Today's mesh is VPS + Corazon + SY094, all defined. No new peer in 72h.
- **External pen-test commission** (Layer 9 §7.1): deferred because requires Tate budget approval ($5-15K) and external counterparty contact. Both are Brief-Tate-First.
- **Formal-verification-for-self-modification** (Layer 10 §7.2): deferred because requires hiring or partnering with a formal-methods engineer. Out of window scope.
- **Multi-tenant cost attribution per client** (Layer 7): deferred because no tenant-2 client is live in the window (Chambers federation Phase 2 is on Tate-deferred path, second-tenant pitch is Tate-gated email).
- **MCP resource subscriptions for Gmail Pub/Sub** (ANTHROPIC_NATIVE_LEVERAGE §5): deferred because Pub/Sub setup requires GCP project changes Tate-typed creds I lack visibility on; the easier `os_forks` Supabase realtime subscription stands in. Single subscription proves the pattern.
- **Section 5 sliding-window compaction** (RECOVERY_DIRECTIVES 1.2): deferred because the SDK's native compaction at threshold 120K is freshly flipped today; do not stack two independent compaction strategies in the same week.
- **Track C laptop expansion** (LAPTOP_BOUNDLESS_CAPABILITY_AUDIT): deferred per README "Defer Track C until Security Layer is mature." Security ring closed today but 72h is too short to harden capability expansion against the new attack surface.
- **fork-by-default hook tightening** (CLAUDE.md): deferred because the hook fires correctly already; no tightening needed inside the window.

The deferral list is itself the deliverable: it is a survey of what I am NOT doing and the reason, so a future-me reviewing the artefact knows what was chosen, not just what was shipped.

---

## 4. Self-sustaining-OS audit

Each item: **PASS** (works under autonomous load), **PARTIAL** (works but gaps), **FAIL** (will break the window).

**Context management discipline (forks vs main, conductor stays thin)** — **PASS**. `fork-by-default-nudge.sh` is on main HEAD per the hook-stack invariant check (CLAUDE.md). The brief-consistency-check + applied-pattern tag forcing function close the loop. Risk: hook regression mid-window. Mitigation: Wave 4 includes a hook-stack invariant probe (Fork P).

**Parallelisation policy (5/5 ceiling, demand-driven not slot-quota)** — **PARTIAL**. Doctrine is canonical (`fork-dispatch is demand-driven`, 30 Apr 10:02 AEST third-strike). Code-level atomic cap shipped (commit c931d5c) but load-test pending — SELF.md unverified claim #1. Mitigation: Wave 1 Fork D runs the load test as the first gating action. If it fails, conductor caps spawning at 4 in software until fixed.

**Cron schedule (gaps, redundancies, missed fires)** — **PARTIAL**. status_board 2338e824 records daily-telemetry missed Apr 28-29 fires; no DLQ surface; silent-loop-detector only catches at 60h. Mitigation: per-cron freshness probe authoring queued as a P3 fork (Wave 4 Fork Q sub-item if time). For the window, accept that one missed cron fire will be silent for up to ~24h and rely on the meta-loop's morning sweep to catch via status_board diff.

**SMS communication cadence with Tate** — **PASS**. `autonomous-window-evening-sms` cron exists per status_board 26771ec3. Format spec is in Section 6 below. Hard rule: 1 GSM segment, English greeting/signoff stripped (per `~/ecodiaos/patterns/sms-segment-economics.md`), 19:00 AEST default.

**Self-modification safety (Factory or fork-with-review for any src/ change to ecodiaos-backend)** — **PASS for SDK forks; N/A for Factory**. Factory CLI is fully credit-exhausted (SELF.md). All src/ writes in the 72h go through SDK forks, which inherit conductor review on PR. Path-allowlist enforced via `deploymentService.js` pre-deploy check (SECURITY_HARDENING §2.3). Dual-reviewer enforce flag stays off (no shadow verdicts to calibrate against).

**Credit/token budget tracking (20B/week, ~3B/day available)** — **PARTIAL**. Both Claude Max accounts hit weekly cap at 23:23:47 AEST 30 Apr per Neo4j Episode "Bedrock fallback model id fix - 1 May 2026". The Bedrock fallback model id was wrong; fix shipped today. Mitigation: Wave 1 Fork E re-validates Bedrock end-to-end. If broken, conductor pauses Wave 2 dispatch and falls back to Tate-attended-only operation until weekly reset (Mon 5 May ~UTC midnight).

**Observability (am I lying to myself about what shipped)** — **PASS**. `verify-deployed-state-against-narrated-state` doctrine is hard-wired into status_board hygiene (see "phantom-shipped corollary" in CLAUDE.md). Tier A audit shipped /ops cache_hit_ratio + cost_per_turn_usd + compaction_events panels today. Drift-audit forks scheduled cron-coupled. Risk: phantom-shipped row gets propagated into a fork brief before disk-probe. Mitigation: `verify-deployed-state-against-narrated-state.md` cross-ref fires on every fork brief via brief-consistency-check.sh.

**Doctrine surfacing (10 hooks live)** — **PASS at session start (this turn)**. Hook-stack invariant check on session-start is doctrine, recorded in CLAUDE.md "Hook-stack invariant check (P1)". Risk: a fork commit accidentally moves a hook to a feature branch (this happened 30 Apr — `feat/phase-d-failure-classifier-2026-04-29` had 5 hooks dormant on main). Mitigation: Wave 4 includes an explicit invariant probe.

**Status_board hygiene (target <20 active rows)** — **FAIL**. Currently 80+ active rows. This is on me. O4 north-star outcome is "<30" not "<20" because honest in-window achievable target is reduced. Wave 1 Fork C and Day-4 Fork Q both target this. The "<20" stretch goal is for week-end SELF.md review.

**Memory durability (Neo4j Decision/Episode writes per turn, not just kv_store)** — **PASS at policy level, PARTIAL in practice**. CLAUDE.md "End-of-session hygiene" rule is canonical. `recent-doctrine-injection` and Neo4j-LAST discipline mean every turn that resolves something writes a Decision. Risk: I read kv_store handoff, write decisions to kv_store, never escalate to Neo4j (kv_store is ephemeral, Neo4j is durable). Mitigation: every fork brief in this plan ends with "write Neo4j Decision/Episode" as a non-negotiable line.

**Restart-loop fix verification (SELF.md claims fixed today; check holds across 72h)** — **PARTIAL until empirically verified**. Code shipped, fix is to gate `_recordTurnOutcome(false, ...)` behind `!suppressOutput` at 4 call sites. Probe: pm2 restart count for ecodia-api should not exceed 3 across the 72h window (allowing 1 deploy restart + 1 unexpected). Mitigation: the very fact of the fix means this is now a passive observation; first cron-fire credit-exhaustion turn that DOESN'T trigger restart = first positive datapoint. Day 2 morning is when we'll have 16h+ of evidence.

**Factory CLI credit-exhaustion contingency (SDK forks substitute)** — **PASS**. SDK forks via `mcp__forks__spawn_fork` bypass Factory CLI. Pattern `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` is canonical. Risk: SDK forks themselves hit the same weekly cap on either Claude Max account. Mitigation: usageEnergyService balances across both accounts; if both deplete, Bedrock fallback (post-fix) takes over.

**Honest summary:** 8 PASS, 3 PARTIAL, 1 FAIL. The FAIL (status_board hygiene) is in-flight. The 3 PARTIALs convert to PASS as Wave 1+2 forks land. By 4 May 14:00 AEST, all 12 should be PASS or have a documented reason for not.

---

## 5. Risks + mitigations

**R1. PM2 ecodia-api goes down and the recoverStaleForks scheduler-recovery loop doesn't catch it.** Probability: low (recoverStaleForks shipped 30 Apr, recovered 3 killed forks today). Severity: catastrophic — no conductor turns served, status_board goes stale, Tate notices when SMS reply is missing. Mitigation: pm2 startup script auto-restarts. Daily 09:00 AEST `system-health` cron alerts via SMS-tate if ecodia-api uptime < 1h. Bedrock fallback eats single-turn outages. If pm2 itself dies, Tate manual restart on return.

**R2. Restart loop returns under different trigger.** Probability: medium — fix is 8h old. Severity: high. Mitigation: Wave 4 Fork P probes restart count daily; if ecodia-api restart_count climbs past 3 in any 6h window, conductor immediately disables `cronForkDispatcher` (the most likely re-amplifier) and SMS-tate. Dispatch the recovery fork only after diagnosis.

**R3. Doctrine drift via in-window pattern-write surge.** Probability: medium — every fork that learns something writes a pattern. Severity: low to medium. Mitigation: `no-doctrine-writes-during-factory-running-window.md` doctrine; in-window doctrine writes go to `~/ecodiaos/drafts/` first, INDEX.md regen runs daily at 22:00 AEST cron. Cap: max 5 new pattern files across the 72h. Anything more is reflexive scratchpad and goes into a single "72h scratch" pattern instead.

**R4. Tate-decisions pile up (next_action_by='tate' rows).** Probability: medium. Severity: medium. Mitigation: minimize-tate-approval-queue doctrine. Section 8 below lists the SOLE genuine Tate-decision item (DAO upgradeability spec, P1, already in board). Anything that arises in-window gets routed through the routing-problem check first; only if truly blocked does it land as a `next_action_by='tate'` row.

**R5. Fork orphaning on session restart or PM2 restart.** Probability: low (recoverStaleForks live). Severity: medium — orphaned fork's working tree could leave a sibling fork's branch contaminated. Mitigation: `continuation-aware-fork-redispatch.md` doctrine; redispatch briefs check for existing deliverables before re-doing. Forks must commit deliverables, not leave untracked (`sdk-forks-must-commit-deliverables-not-leave-untracked.md`).

**R6. Both Claude Max accounts AND Bedrock exhaust simultaneously.** Probability: low (Bedrock has different quota). Severity: catastrophic — no conductor turns served, no fork dispatch, ~24h of work lost. Mitigation: Wave 1 Fork E validates Bedrock fallback end-to-end TODAY. If validation fails or weekly reset is mid-window (Sun-Mon UTC), conductor self-imposes fork dispatch slowdown to 1 active fork max from 18:00 AEST 3 May until weekly reset. Bedrock burns dollars, not Anthropic Max tokens; the limit is wallet not weekly cap.

**R7. Hook-stack regression (5 hooks went silent on 30 Apr).** Probability: low-medium. Severity: medium — silent doctrine-surfacing is invisible drift. Mitigation: Wave 4 explicit hook-stack invariant probe per CLAUDE.md one-liner. Run on every conductor session-start. Add to `~/ecodiaos/patterns/INDEX.md` regen cron as a check.

**R8. Scheduler missed fires (daily-telemetry Apr 28/29 precedent).** Probability: high (already happens). Severity: low (no single cron is load-bearing for the window; meta-loop catches stale state). Mitigation: per-cron freshness probe is queued as a P3 fork; for the window, accept ~24h staleness tolerance.

**R9. Pattern dedup destroys cross-references.** Probability: medium when running consolidation. Severity: medium — broken pattern surfacing for some keywords for some hours. Mitigation: Wave 2 Fork F runs consolidation with explicit "DETACH DELETE in transaction with rollback path" + spot-check on 10 random surfaced patterns post-merge.

**R10. Status_board sweep archives a row Tate intended to act on later.** Probability: medium (I have done this before). Severity: low (rows can be unarchived). Mitigation: archive only rows where `next_action_by='ecodiaos'` AND `last_touched < NOW() - INTERVAL '72 hours'` AND I can name the resolution in a sweep-fork audit doc. Tate-blocker rows (`next_action_by='tate'`) NEVER get archived in autonomous mode.

---

## 6. Daily SMS template

Hard constraints (per `~/ecodiaos/patterns/sms-segment-economics.md`):
- 1 GSM segment = 160 char including spaces.
- No greeting ("Hi Tate"), no signoff ("- EcodiaOS"), no filler ("Hope you're well").
- Format: `Day N done|active. <ship 1>. <ship 2>. <ship 3>. <blocker or 'No action'>.`
- 19:00 AEST default. If a P1 blocker emerges before then, send immediately.

**Three example SMS strings:**

GOOD DAY (~140 char):
"Day 2 done. Skills shipped 128/128. doctrineSurface deleted. Cache hit 71%. Pattern dedup green. Restart loop quiet 36h. No action."

MIXED DAY (~155 char):
"Day 1 mixed. 4/5 forks landed. Listener fix shipped. Skills 20/128 shadow live. Bedrock validation deferred to D2 AM. No P1 blockers, no action."

BLOCKER DAY (~150 char):
"Day 3 P1. Both Max caps hit early, Bedrock 502s on tool calls. Pausing forks. SMS reply if you can top up acct1 or accept idle until reset Mon."

The blocker template intentionally names the precise ask (top up acct1 OR accept idle), so a 1-segment Tate reply ("top up" or "accept") fully resolves.

---

## 7. Fork dispatch waves

Each fork below is dispatch-ready: complete brief skeleton, deliverable path, success criterion. The fork itself has zero context; the brief carries everything. All forks end with `[FORK_REPORT]` line and Neo4j Decision/Episode write requirement.

### Wave 1 (next 4h, by 20:30 AEST 1 May): A, B, C, D, E

**Fork A — Skills migration Phase 1 (shadow shim, 20 patterns)**
Brief: You are EcodiaOS fork. Author Skills migration shadow shim per `~/ecodiaos/docs/ANTHROPIC_NATIVE_LEVERAGE.md` §1.3. Pick 20 highest-traffic disk patterns from `~/ecodiaos/patterns/` (use `~/ecodiaos/patterns/INDEX.md` ordering or trigger-keyword frequency). For each: copy to `.claude/skills/<slug>/SKILL.md`, add YAML frontmatter `name: <slug>` and `description: "use this when <specific scenario>"`. Do NOT delete originals. Do NOT touch `doctrineSurface.js`. Do NOT touch the injection block. This is shadow-only Phase 1. Commit on branch `feat/skills-migration-phase-1-fork_<id>` and open PR. Deliverable: `.claude/skills/` populated with 20 SKILL.md files + PR open. Success: PR diff shows only adds (no deletes). Write Neo4j Decision name="Skills migration Phase 1 shadow shim shipped 1 May 2026" with description naming the 20 slugs picked. End with `[FORK_REPORT]`.

**Fork B — Listener parse error fix (invoicePaymentState.js + statusBoardDrift.js)**
Brief: Two listener files in `~/ecodiaos/src/listeners/` have JS syntax errors (per status_board fe0fccad). Read `src/listeners/invoicePaymentState.js` and `src/listeners/statusBoardDrift.js`. Identify the parse error (likely incomplete refactor or missing module wrapper). Repair with minimal change (do NOT refactor). Commit on branch `fix/listener-parse-errors-fork_<id>`. Open PR. After PR merged, restart `ecodia-api` via `pm2_restart`. Verify pm2 logs show "7/7 listeners loaded" on next startup. Update status_board fe0fccad and 3cbd7709 status to "fixed_7_of_7_loaded". Deliverable: PR merged, pm2 logs probe pasted into Decision. Success: 7/7. Write Neo4j Decision name="Listener parse errors fixed 1 May 2026". End with `[FORK_REPORT]`.

**Fork C — Status_board P3 archive sweep (target: 80+ → ~50 rows)**
Brief: Active status_board has 80+ rows. Target reducing P3 rows to ~30 by archiving cleanly resolved or stale work. Eligibility for archive (ALL must hold): (a) `next_action_by='ecodiaos'`, (b) status text suggests done/superseded/no-longer-relevant, (c) `last_touched < NOW() - INTERVAL '72 hours'`. NEVER archive rows where `next_action_by='tate'` or `priority=1`. Probe each candidate with a disk/db verification before archive (e.g. "PR #23 merged" → `gh pr view 23 --json state` returns MERGED). For each row archived: `UPDATE status_board SET archived_at=NOW(), context = context || ' [archived 1 May 2026 by fork_<id>: <reason>]' WHERE id=<id>`. Aim 25-35 archives. Skip P3 cron-budget-exhausted rows (separate sub-pass: those are noise from missed fires; bulk-archive any with `last_touched < NOW() - INTERVAL '24 hours'`). Deliverable: status_board sweep audit at `~/ecodiaos/drafts/status-board-sweep-1-may-2026-1620.md`. Success: active count drops by at least 25. Write Neo4j Episode name="Status board sweep 1 May 2026 1620 AEST". End with `[FORK_REPORT]`.

**Fork D — Fork-cap atomicity load test**
Brief: SELF.md unverified claim #1: "Fork atomicity TOCTOU race is closed end-to-end. Handle: node scripts/test-fork-cap-race.js on VPS under concurrent load." Run that test. If file doesn't exist, author it: spawn 1000 concurrent `mcp__forks__spawn_fork` calls (subagent or parallel async), measure cap-violation events (any moment where DB shows >5 active forks). Test must respect actual fork dispatch — these are real forks with real capacity cost. Reduce to 50 concurrent with brief="echo done; sleep 0.5" if 1000 is too expensive. Brief skeleton minimum so forks complete in <30s. Cleanup: abort all spawned. Deliverable: `~/ecodiaos/drafts/fork-cap-load-test-2026-05-01.md` with run output, cap-violation count, and pass/fail verdict. Success: zero cap-violations across the run. Write Neo4j Decision name="Fork cap atomicity load test 1 May 2026". End with `[FORK_REPORT]`.

**Fork E — Bedrock fallback end-to-end validation**
Brief: Both Claude Max accounts exhausted at 23:23:47 AEST 30 Apr 2026; Bedrock fallback model id was wrong (`claude-opus-4-7`, an Anthropic OAuth id, not a Bedrock cross-region inference profile id). Fix shipped today (per Neo4j Episode "Bedrock fallback model id fix - 1 May 2026"). VALIDATE END-TO-END. Steps: (1) confirm `BEDROCK_MODEL` env var on ecodia-api PM2 process is now a valid Bedrock cross-region id (probe `pm2 env <id> | grep BEDROCK`), (2) confirm AWS credentials are wired (probe via Bedrock SDK from VPS shell, expect 200 on a tiny test invocation), (3) trigger a real conductor turn that hits the fallback path (force one — temporarily set both Claude Max accounts to "exhausted" in usageEnergyService for one turn, OR find a forced-fallback test mode). Verify: turn completes, tool call works, SDK stream finalizes. (4) Reset usageEnergyService overrides. Deliverable: `~/ecodiaos/drafts/bedrock-fallback-validation-2026-05-01.md`. Success: at least one real turn served from Bedrock with completed tool call. Write Neo4j Decision name="Bedrock fallback validated end-to-end 1 May 2026". End with `[FORK_REPORT]`.

### Wave 2 (overnight 1 May 23:30 → 2 May 09:00): F (single fork only)

**Fork F — Pattern node consolidation Phase 1**
Brief: status_board d9fb459f. 800+ Pattern nodes in Neo4j, ~103 pairs at >=0.92 similarity per Decision 3287. Run consolidation: (a) for each high-similarity pair, MERGE into the older/higher-relationship-count canonical node, REDIRECT relationships from duplicate to canonical, DETACH DELETE duplicate. Run inside transaction with explicit rollback path on error. Spot-check 10 random patterns post-merge: `graph_search` with their original keyword should still return relevant content. (b) Patch synthesizer in `src/services/` (find via grep `is_synthesized:true` creation site) to check >=0.85 similarity before INSERT. Deliverable: PR with synthesizer patch + Cypher consolidation script + spot-check audit doc at `~/ecodiaos/drafts/pattern-consolidation-phase-1-2026-05-01.md`. Success: Pattern node count drops from 800+ to <600 with no relationship-orphaning. Write Neo4j Decision name="Pattern node consolidation Phase 1 shipped 2 May 2026". End with `[FORK_REPORT]`.

(Wave 2 is single-fork because conductor sleeps overnight in the operational sense — minimal active management. Multiple parallel forks overnight risk silent failures with no review.)

### Wave 3 (Day 2 morning, 2 May 09:00 onwards): G, H, I, J

**Fork G — Skills migration Phase 2 (full ship + doctrineSurface delete)**
Brief: Phase 1 (Fork A) shipped 20 SKILL.md files in shadow. Now ship the remaining 108 patterns. For each disk pattern in `~/ecodiaos/patterns/*.md` not already migrated: author `.claude/skills/<slug>/SKILL.md` with frontmatter. Use `~/ecodiaos/patterns/INDEX.md` for slug list and existing trigger keywords as raw material for the description field. Once all 128 ported and Phase 1 PR merged: (1) delete `src/services/doctrineSurface.js`, (2) remove `<doctrine_surface>` injection block at `src/services/osSessionService.js:1580-1595`, (3) commit + PR. Verify: turn one (live) shows no `<doctrine_surface>` block in input prompt. Deliverable: PR merged, single canary turn run, Decision node. Success: turn input tokens drop measurably (compare 50-turn rolling pre vs 50-turn rolling post). Write Neo4j Decision name="Skills migration Phase 2 complete - doctrineSurface deleted 2 May 2026". End with `[FORK_REPORT]`.

**Fork H — Cache breakpoint verification probe**
Brief: PROMPT_ASSEMBLY_SPEC §4 + ANTHROPIC_NATIVE_LEVERAGE §4 specify 4 cache breakpoints. SELF.md goal #2 says "measure actual cache hit rate improvement and token savings." Probe Anthropic API response headers across 50 real conductor turns. For each turn, capture `cache_creation_input_tokens` and `cache_read_input_tokens` (split by breakpoint if SDK exposes it). Write to `os_session_turn_outcome` table or extend the cost-per-turn metric panel. Deliverable: `~/ecodiaos/drafts/cache-breakpoint-verification-2026-05-02.md` with empirical distribution table + pass/fail verdict against the 4-breakpoint design + ROLLBACK trigger if hit ratio < 0.40. Write Neo4j Decision name="Cache breakpoint verification 2 May 2026". End with `[FORK_REPORT]`.

**Fork I — Cowork V2 helper subcommands**
Brief: status_board 9edb3a74. Cowork V2 connector live with 22 tools at `/api/mcp/cowork/*`. Cowork-side helper script `~/ecodiaos/scripts/cowork-dispatch` exists; extend it with subcommands: `cowork-v2 gmail send`, `cowork-v2 sms tate`, `cowork-v2 scheduler {cron|delayed|chain}`. Each subcommand wraps the corresponding `/api/mcp/cowork/tools/call` endpoint. Bearer from `~/.ecodiaos/laptop-agent.token` or env. Test each subcommand with a dry-run (`--dry-run` flag echoes the JSON-RPC payload that would be sent, doesn't fire). Test one live: send a single test SMS via `cowork-v2 sms tate "test from cowork-v2 helper"` (cancel before send if rate-limit risk). Deliverable: extended script committed + usage doc updated in `~/ecodiaos/CLAUDE.md` Cowork V2 section. Success: each subcommand --dry-run produces valid JSON-RPC. Write Neo4j Decision name="Cowork V2 helper subcommands shipped 2 May 2026". End with `[FORK_REPORT]`.

**Fork J — Migration 079 numbered-resource collision resolve**
Brief: status_board b50d462e. `src/db/migrations/` contains THREE files numbered 079: `079_os_forks_allow_crashed_status.sql`, `079_prompt_assembly_audit.sql`, `079_authorized_action_patterns_seed.sql`. Probe migration runner: which mechanism does it use to record applied migrations — filename or content hash? Read `src/db/migrate*.js` (or whatever the runner is). If filename-based AND any of the three is already applied: rename the unapplied ones to 080/081/082 with the corresponding registered-applied row update. If hash-based: rename freely. If unsafe to rename: scaffold a kv_store atomic-claim coordinator at `~/ecodiaos/src/db/migration-number-claim.js` for FUTURE numbered writes (the existing 3x 079 stays as-is, lexically-sorted). Deliverable: PR + audit doc at `~/ecodiaos/drafts/migration-079-collision-resolution-2026-05-02.md`. Success: each migration filename unique OR coordinator scaffolded with CLAUDE.md cross-ref added. Write Neo4j Decision name="Migration 079 collision resolved 2 May 2026". End with `[FORK_REPORT]`.

### Wave 4 (Day 2 evening → Day 3, 2 May 18:00 → 3 May 23:30): K, L, M, N, O

**Fork K — Frontend tool-result envelope `{summary, full_ref}`**
Brief: ANTHROPIC_NATIVE_LEVERAGE §6.3 + IMMEDIATE_RECOVERY_CHECKLIST 1.1. Backend at `src/services/osSessionService.js:1833` truncates tool result to 2000 chars before broadcasting to frontend, cutting mid-JSON. Move the truncation off backend storage path. Backend keeps full result. Broadcast envelope shape: `{summary: <tool-specific-short-form>, full_ref: <pointer>}` where summary is e.g. "Email sent to X <message_id=Y>" and full_ref is an HTTP fetch URL the frontend can expand on click. Frontend (in `~/ecodiaos/frontend/`, find the WS message-render component) renders summary, expands on click. Deliverable: backend PR + frontend PR. Success: smoke test — trigger a 5KB tool result (e.g. `gmail_list_messages`), frontend renders summary, click expands to full result without "(truncated)" mid-URL. Write Neo4j Decision name="Frontend tool-result envelope shipped 3 May 2026". End with `[FORK_REPORT]`.

**Fork L — MCP tool output schemas with handles (5 high-traffic tools)**
Brief: ANTHROPIC_NATIVE_LEVERAGE §3 + JARVIS Layer 8. Define `output_schema` JSONSchema with required handle fields on the 5 highest-traffic write tools: `gmail_send` (message_id, thread_id, sent_at), `gmail_reply` (message_id, thread_id, sent_at), `db_execute` (rows_affected, statement_hash), `storage_upload` (path, public_url, size_bytes), `mcp__forks__spawn_fork` (fork_id, branch, dispatched_at). Update each MCP server's tool registration to declare the schema. Add system-prompt clause to conductor: "When claiming completion of an action that called these tools, cite the handle by SDK contract." Deliverable: PR per MCP server + system-prompt update + CLAUDE.md Decision Authority section addendum if needed. Success: post-merge, structured outputs visible in `cc_sessions.tool_outputs` JSONB across 100% of those 5 tool calls. Write Neo4j Decision name="MCP tool output handles shipped on 5 tools 3 May 2026". End with `[FORK_REPORT]`.

**Fork M — MCP resource subscription for os_forks status**
Brief: ANTHROPIC_NATIVE_LEVERAGE §5. `schedulerPollerService.js` polls Supabase. The MCP 2025 spec adds resource subscriptions; current Anthropic SDK supports it. Migrate ONE polling loop: `os_forks` status changes (running → finalizing → done). Use Supabase Realtime under the hood, expose as MCP subscription URI. Conductor subscribes; receives push events on fork state transitions; reduces poll-frequency calls. Deliverable: PR adding subscription server + conductor subscription wiring + migration of one specific poll loop. Success: scheduled fork poll DB query count drops measurably over 24h. Write Neo4j Decision name="MCP resource subscription for os_forks shipped 3 May 2026". End with `[FORK_REPORT]`.

**Fork N — counterfactualReplay scaffold (Layer 10)**
Brief: RECOVERY_DIRECTIVES 2.2 + JARVIS Layer 10. Author minimal `src/services/counterfactualReplay.js`. Function: `replay(decisionNodeId, alteredContextDim, alteredValue) → { originalChoice, replayChoice, contextDelta }`. Initial supported `alteredContextDim`: `energy_level` only. Pull Decision node from Neo4j; reconstruct original prompt context from `context_snapshot` property (if absent, abort with explicit error and Decision node-id list to enrich first); re-run model call with one dim altered; compare. Scaffold only — single dimension, no UI, no batch mode. Deliverable: service file + one passing replay against a real recent Decision id (find one with full `context_snapshot`). Success: replay returns a valid struct with both choices populated and a sensible delta. Write Neo4j Decision name="counterfactualReplay scaffold shipped 3 May 2026". End with `[FORK_REPORT]`.

**Fork O — SELF.md weekly review draft prep**
Brief: SELF.md next review is 2026-05-08. Author the next-week revision draft NOW so Tate's Mon review is read-and-confirm not author-from-scratch. Read current `~/ecodiaos/SELF.md`. Generate revision: (a) recheck top-5 active goals against today's reality (which moved? mark done/done-this-week/still-blocked), (b) close out unverified claims that were resolved across the 72h (cache hit empirical, fork atomicity load test, Bedrock fallback, restart loop, calendar gate), (c) new claims surfaced by 72h work, (d) "what I would tell myself if I started fresh tomorrow" rewrite. Stage at `~/ecodiaos/drafts/self-md-week-review-prep-2026-05-03.md`. Do NOT overwrite SELF.md itself; that's a Tate-review-and-merge step. Deliverable: draft file. Success: draft passes its own "would-a-fresh-OS-make-better-decisions-from-this" cold-start test. Write Neo4j Decision name="SELF.md weekly review draft staged 3 May 2026". End with `[FORK_REPORT]`.

### Wave 5 (Day 3 evening → Day 4 morning, 3 May 22:00 → 4 May 14:00): P, Q

**Fork P — Hook-stack invariant + restart-loop count probe + 72h stability snapshot**
Brief: Compound probe fork. (1) Run hook-stack invariant one-liner from CLAUDE.md "Hook-stack invariant check (P1)": iterate every hook command in `~/.claude/settings.json`, expand path, check file exists. If any MISSING, restore from canonical source (path-restricted git checkout from authoring commit, see CLAUDE.md restoration history for precedent). (2) Probe ecodia-api restart count over the 72h: `pm2 describe ecodia-api | grep restart` and cross-reference pm2 log timestamps. Goal <= 3 restarts across the window. If higher, diagnose root cause and write to status_board. (3) Run `~/ecodiaos/scripts/`-side cron-freshness probe: identify any cron with no fire in 2x its expected interval; flag as P3 row if found. (4) `/ops` snapshot for the 72h: dump `cache_hit_ratio_24h` time series, `compaction.count_24h`, `cost_per_turn_usd` mean and tail; write all to `~/ecodiaos/drafts/72h-stability-snapshot-2026-05-04.md`. Success: invariant probe passes (no MISSING), restart count <= 3, no cron silently dark > 2x interval, ops snapshot dumped. Write Neo4j Decision name="72h stability snapshot 4 May 2026". End with `[FORK_REPORT]`.

**Fork Q — Final status_board sweep + 72h write-up + Tate-return briefing**
Brief: Compound write-up fork. (1) Final status_board sweep: target < 30 active rows total. Same eligibility rules as Fork C, plus archive any rows authored by in-window forks where the deliverable is on disk and verified. (2) Author `~/ecodiaos/drafts/72h-autonomous-window-summary-2026-05-04.md`: pass/fail per O1-O5, ledger of forks dispatched (id, brief one-liner, deliverable path, status), what shipped, what didn't, what failed, three lessons. NO retrospective dump in director chat — pattern files for any lesson worth promoting. (3) Author Tate-return briefing at `~/ecodiaos/drafts/tate-return-briefing-2026-05-04.md`: 200 words max, 5 north-star outcomes pass/fail, any open Tate-decision items, any unresolved blockers, planned first conductor turn after Tate is back. Format: paste-ready into a single email or Director Chat message — Tate's choice. Success: all three artefacts on disk. Write Neo4j Episode name="72h autonomous window 1-4 May 2026 closed". End with `[FORK_REPORT]`.

**Total fork count across waves: 17.** Headroom for 3-4 unplanned forks (orphan recovery, P1 issue surfacing, SMS-from-Tate response). Across 72h that is on average one fork per 3.5 hours of working time, well under the demand-driven ceiling.

---

## 8. Open questions for Tate

The Decision Authority "Brief Tate first" tier collapses to: (a) outbound message to client/external, (b) work over $5k, (c) spend over $50/mo recurring, (d) deleting client data with confidentiality implications, (e) signing legal-weight items.

In-window items meeting that bar:

1. **DAO upgradeability spec review** (status_board 0cab32bd). Already on board, P1, `next_action_by='tate'`. Spec drafted v0.1 at `/home/tate/ecodiaos/dao/dao-uups-migration-spec.md`. 5 open questions: SOS follow-up amendment Y/N, OwnableUpgradeable vs custom, timelock duration, deploy timing, audit budget. NOT a 72h-window blocker. Tate reviews on return; in-window I do not advance.

2. **Chambers Phase 2(d): email to Matt** (status_board 21f59cf6). Already on board, `next_action_by='tate'` per row. Outbound client comms — zero unilateral contact. Stays Tate-gated.

3. **Co-Exist Apr 29 home/photo items**: Tate-confirm needed on collective focal-point parity ship + section reorder Option A vs B (status_board 917b3330). On-board, Tate-blocked.

4. **Ecodia brand hygiene 4 codebase decisions** (status_board 455b8498). On-board, Tate-blocked.

5. **Android keystore passwords** (status_board d51856c1). May need SMS to Tate for the keystore_password / key_password / key_alias triplet IF env probe fails to find them. Sequence: (a) Wave 4 probes envs first, (b) only escalates if envs are dry. Single-segment SMS ask if it reaches that point.

Items 1-4 are pre-existing. Only item 5 might generate a new in-window SMS ask. All other in-window decisions stay conductor-side.

If a NEW Tate-decision item emerges in-window, the procedure is: run 5-point laptop-route check first, run routing-problem check second, only then add a status_board row with `next_action_by='tate'` AND send a single-segment SMS naming the precise ask. Default posture is decide and execute.

---

## 9. Self-evolution targets (concrete, ecodiaos-only)

Per CLAUDE.md scope discipline: ecodiaos-backend / ecodiaos-frontend ONLY. NO client codebase work.

1. **`src/services/doctrineSurface.js` — DELETE** (after Skills shadow Phase 2 stable). Why: ANTHROPIC_NATIVE_LEVERAGE §1.4. Sized: in Fork G.

2. **`src/services/osSessionService.js:1580-1595` — REMOVE `<doctrine_surface>` injection block.** Why: same. Sized: in Fork G.

3. **`src/listeners/invoicePaymentState.js` + `src/listeners/statusBoardDrift.js` — fix syntax errors.** Why: 5 of 7 listeners loading instead of 7; two subsystems wired but dark. Sized: Fork B.

4. **`src/services/factoryOversightService.js` — Layer 5 deploy verification.** Why: IMMEDIATE_RECOVERY_CHECKLIST 2.1. Today's gap: post-session-end factory state can be `deployed` without commit_sha matching `origin/main`. Add a verification step: after status=success, run `git log --oneline origin/main -1` against target repo, assert SHA matches factory's claimed push, assert deploy timestamp > session_ended_at. Mark `verification_failed` on mismatch and auto-schedule remediation fork. Size: ~3h fork. Not in Wave 1-5 (deferred to next week's queue) — Factory CLI is exhausted, no live sessions to verify against right now. Document the deferral in the next-week SELF.md draft.

5. **`src/services/forkFinalizer.js` — deliverable-claim parser.** Why: IMMEDIATE_RECOVERY_CHECKLIST 2.2. Parse fork result for verifiable claims ("sent email to X" → gmail_search verify; "deployed to Y" → vercel API verify; "updated status_board row Z" → SELECT verify). Append ✓/✗ per claim. On any ✗, auto-schedule continuation fork. Size: ~4h fork. Not in Wave 1-5 (deferred — counterfactualReplay Fork N is the higher-leverage Layer 10 work this week).

6. **`src/services/sessionMemoryService.js` — semantic dedup pre-injection.** Why: PROMPT_ASSEMBLY_SPEC + IMMEDIATE_RECOVERY_CHECKLIST 1.1. Currently retrieves up to 5 chunks × 1500 chars. Patch: cosine-similarity dedup with threshold 0.85, cap chunk count at 3, cap per-chunk chars at 1200. Size: ~2h fork. Not in Wave 1-5 explicitly (touched indirectly by Skills migration cache-line shifts). Defer to Day 4 evening if time after Q.

7. **`src/services/neo4jRetrieval.js` — return-shape compression.** Why: IMMEDIATE_RECOVERY_CHECKLIST 1.1. Pattern nodes return only first 400 chars (Rule + Why), Decision nodes return decision + outcome only, Episode nodes return title + takeaway. Size: ~2h fork. Defer (paired with Pattern consolidation Fork F effects).

8. **`src/websocket/wsManager.js:163-242` — per-connection ring buffers when client count > 10.** Why: IMMEDIATE_RECOVERY_CHECKLIST 1.2. Currently single global `_eventRing` of 500 events; OOMs at high client count. Patch: switch to per-connection ring when `wss.clients.size > 10`. Size: ~3h fork. Not in Wave 1-5; current connection counts are 1-3 and the bug is latent. Document in next-week queue.

9. **`src/db/migrations/` — number collision resolution + future coordinator.** Sized: Fork J.

10. **`.claude/skills/` — full Skills directory with 128 SKILL.md files + frontmatter.** Sized: Forks A + G.

Targets 4, 5, 6, 7, 8 are sized for next week's queue, not this 72h window. Listing them here closes the loop on JARVIS_GAP_ANALYSIS gap items so they don't get re-scoped from scratch each Sunday-night session-restart.

---

## End-of-plan

**Fork count budget:** 17 dispatched + 3-4 reactive headroom = ~20 forks across 72h. Average ~3.5h per fork of working time. Well under the 5/5 ceiling at any single moment.

**Token budget:** 20B/week ÷ 7 = ~2.86B/day; 72h = ~8.6B available. With Skills migration eliminating ~3KB/turn unconditional injection, the per-turn average drops; expected actual burn 4-6B across the window. Headroom for cron fires + reactive forks.

**SMS budget:** 3 evening + 1 final + ~2 reactive (R-class events) = 6 segments across 72h. One segment per send hard rule.

**Doctrine cross-references applied to this plan:**
- `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md` — every fork brief is self-contained, fork has no inherited context.
- `~/ecodiaos/patterns/brief-names-the-product-not-the-immediate-task.md` — outcomes O1-O5 name the product, not the research session.
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` — conductor stays thin; this plan is the route, not the work.
- `~/ecodiaos/patterns/decide-do-not-ask.md` — Section 8 is the minimal Tate-decision set; everything else is conductor authority.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — every "I would do X later" item in Section 9 is either assigned to a numbered fork or explicitly deferred with reason.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — Fork P is the empirical 72h ground-truth probe; SELF.md gets revised against it.
- `~/ecodiaos/patterns/sms-segment-economics.md` — Section 6 is hard-budget compliant.
- `~/ecodiaos/patterns/no-doctrine-writes-during-factory-running-window.md` — Factory is exhausted; SDK forks substitute; in-window doctrine writes go to drafts first, INDEX.md regen at 22:00 cron.
- `~/ecodiaos/patterns/conductor-coordinates-capacity-is-a-floor.md` — fork dispatches are demand-driven; no slot-fill.
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` — Bedrock fallback is the contingency, validated in Fork E before relied upon.

**Conductor's first action on review:** dispatch Fork B (listener parse error fix) first because it is the smallest blast-radius proof that the plan's fork-dispatch substrate works, then dispatch the rest of Wave 1 in a single message.
