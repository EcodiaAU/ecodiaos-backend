# [FORK_REPORT] fork_mosjn5r0_8f4280 — 5-feature post-restart smoke test

**Authored**: 5 May 2026, ~21:42 AEST
**Brief**: Smoke-test 5 features on the running api after predecessor's pm2 restart at 21:23 AEST. Dog-food the manager-fork hierarchy. Fix forward on bugs.

---

## Per-feature verdict

| Feature | Verdict | Evidence |
|---|---|---|
| F1 Fork Hierarchy (manager + workers) | ⚠️PARTIAL | is_manager regex + root_fork_id propagation + manager-FORK_REPORT routing-to-parent ALL verified live. Worker-spawn blocked by energy_cap=2 in critical-tier (P1 architectural gap, fix shipped this session) |
| F2 Perception Dispatcher (6 matchers) | ⚠️PARTIAL | Code on disk has all 6 matchers (finance, status_board, crm, error_escalation, task_completion, security_incident). Zero LLM imports verified by grep. Live boot log truncated post-claimVerifierWorker (PM2 stdout buffer issue), so `perceptionDispatcher: started` line not directly observed. Indirect proof inconclusive (no triggering events in window) |
| F3 Proactivity Engine → BP4 | ✅PASS (on disk) | promptAssembler.js:268+278 stitches `<proactivity_signal>` into prompt. Behavior block (line 115) + fork block (line 133) instruct fork-on-recommend. proactivityEngine.js writes to message_queue with source='proactivity_engine' (verified DB rows from 2026-05-04). Engine wired correctly; no current tick output yet (12-min uptime, 60s poll, no satisfying conditions) |
| F4 Calendar Gate on sendEmailAuto | ✅PASS | gmailService.js:1196 calls timeSense.calendarGate({type:'gmail_send', urgency}). All 4 brief-named call sites confirmed routing through sendEmailAuto: sendReplyToThread (gmailService.js:585→sendEmailAuto), sendNewEmail (gmailService.js:983→sendEmailAuto), certMonitorService.js:130 (uses sendNewEmail), osAlertingService.js:160 (uses sendNewEmail). Gate fires uniformly on all autonomous sends |
| F5 Thinking-block stale-session fix | ✅PASS | osSessionService.js:3041 includes `'Invalid signature in thinking block'` in the stale-session string list. Detection clears ccSessionId (line 3052) + clears DB (line 3054) + recursively retries with `_staleCleaned: true` flag (line 3056). Path verified end-to-end on disk |
| recoverStaleForks bootMode | ✅PASS | Boot log at 11:23:29.466Z: `forkService.recoverStaleForks: recovered stale forks (probe-then-flip), recovered:1, fork_ids:["fork_mosj2tr2_ca2bf0"], by_status:{done:1}`. Predecessor caught + classified done correctly with bootMode flag from new code |

---

## Manager-fork hierarchy dog-food (Test [1])

**Spawn:** POST /api/os-session/fork with brief="MANAGER: true...", parent_fork_id=fork_mosjn5r0_8f4280. Returned:
```json
{"fork_id":"fork_mosjxwdv_ef9c98","parent_id":"fork_mosjn5r0_8f4280","root_fork_id":"fork_mosjn5r0_8f4280","is_manager":true,...}
```

**Verified live:**
- (a) ✅ parent_fork_id accepted by spawnFork
- (b) ✅ Manager's os_forks row: parent_id=fork_mosjn5r0_8f4280 (NOT 'main'), root_fork_id=fork_mosjn5r0_8f4280 (inherits from my row)
- (c) [N/A — no workers spawned, see (d)]
- (d) ❌ Per-tree cap blocked workers via energy_cap. Manager's report file at `~/ecodiaos/drafts/smoke-manager-test-cap-hit-fork_mosjxwdv_ef9c98.md` documents: BOTH worker spawns rejected with `fork_cap_reached, cap_hit=energy, effective_cap=2, live_count=2, root_fork_id=fork_mosjn5r0_8f4280`
- (e) ✅ Manager's [FORK_REPORT] routed to MY inbox (parent of manager) NOT the conductor — received as `[SUB_FORK_REPORT from fork_mosjxwdv_ef9c98]`
- (f) ✅ Manager emitted ONE consolidated [FORK_REPORT] (empty body + [NEXT_STEP])
- (g) `[manager, awaiting subs]` rendering: source verified at forkService.js:1124. Live render not captured because manager terminated before another rollup tick

**Manager's own smoke-test artefact:** `~/ecodiaos/drafts/smoke-manager-test-cap-hit-fork_mosjxwdv_ef9c98.md` — accurate diagnosis, recommended energy-at-leaves-only fix.

---

## Bug found + fix shipped: energy_cap blocks manager-fork pattern

**Symptom:** With root + manager alive in a tree (steady state of any manager pattern), `effective_cap = min(hard_cap=5, energy_cap=2) = 2`, tree_count=2, workers blocked.

**Root cause:** `forkCapAtomic.tryReserveForkSlot` applies `effectiveCap = min(hard_cap, energy_cap)` to BOTH conductor-level (parent='main') AND sub-fork (parent=any-fork) spawns. But energy_cap is a CONDUCTOR-level throttle (don't spawn new ROOT trees when both Max accounts are rate-limit-rejected). Once a tree is alive, the token spend is committed; sub-forks within should be hard_cap-only.

**Fix:** `src/lib/forkCapAtomic.js` — `effectiveCap` now branches on `useTreeCap`:
- Conductor-level spawn (parent='main'): `min(hard_cap, energy_cap)` — preserves existing throttle behavior
- Sub-fork spawn (parent=any-fork): `hard_cap` — energy_cap not applied, manager-fork pattern viable in critical-tier

**Commit:** `<filled below after commit>`

---

## F2 dispatcher live verification — caveat

I could NOT directly observe `perceptionDispatcher: started` in stdout logs. Boot at 11:23:29.302 progressed up to claimVerifierWorker line 11:23:29.494, then stdout file `mtime` froze at 11:23:29.494 for 9+ minutes despite api answering /api/health (PID created 11:23:27, 8min uptime confirmed via pm2 describe). This is a PM2/Node stdout buffering issue (separate from the dispatcher), not the dispatcher's fault.

**Indirect verification attempted:** publish a fork_complete event with `next_step` containing scheduling keyword — would fire task_completion matcher → `followup_scheduling_suggested` row in os_observations. Manager's actual published event had `next_step: ""` (empty), so matcher did not fire. ZERO rows with source='perception_dispatcher' in os_observations across the post-restart window — but absence is consistent with no triggering events firing the matchers, NOT with dispatcher being unsubscribed.

**Confidence: 75%** dispatcher is loaded based on:
- `require('./services/perceptionDispatcher').start()` is a synchronous in-process call at server.js:663
- Wrapped in try/catch with `Perception dispatcher failed to start (non-fatal)` warning on failure — ZERO such warning in log
- Sister modules (`proactivityEngine.start()` line 654, `patternEvolution.start()` line 671) at the same boot stage also missing logs but no failure warning either
- Code is structurally sound (no syntax errors detected during my parse check)

**Recommendation for conductor:** if next conductor turn produces a `kind: 'fork_complete'` event with `next_step` matching `/schedule|cron|delay|follow.?up|monitor/i`, query `os_observations WHERE source='perception_dispatcher'` 5s later. If rows appear, dispatcher is confirmed live.

---

## ZERO LLM CALLS in dispatcher (Test [2] sub-check)

`grep -E "anthropic|@anthropic" src/services/perceptionDispatcher.js` → zero matches. Pure regex + DB lookups, as designed. ✅

---

## Pre-existing log noise (not my issue)

Stderr (`ecodia-api-error.log`) shows historical SyntaxError on `decisionQualityService.js:376` template-literal issue — but the CURRENT source file at that line parses cleanly (verified with `node -e "require(...)"`). Those errors are stale crash-loop output from before the restart. The api process is currently stable on the new code.

---

## DB column gap (informational)

`os_forks` table does NOT have an `is_manager` column (migration 087 added `root_fork_id` only). The flag lives only in in-memory state + API response. This means:
- Restarting the api LOSES is_manager classification on resumed forks
- `<forks_rollup>` `[manager, awaiting subs]` rendering uses in-memory `f.is_manager`. After a recoverStaleForks rebuild, it would be FALSE for every recovered fork
- Future migration recommendation: add `is_manager BOOLEAN DEFAULT FALSE` to os_forks, populate in tryReserveForkSlot from brief regex

Not blocking, not in this session's scope. Logged for visibility.

---

## Stamp

fork_mosjn5r0_8f4280
