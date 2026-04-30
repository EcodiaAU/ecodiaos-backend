# EcodiaOS Immediate Recovery Checklist
## Tactical Actions for OS Session Restart — 2026-04-30 (rev. 2 post-audit)

**Context:** This is the tactical companion to `RECOVERY_DIRECTIVES_2026-04-30.md`. When the OS comes back online (after Claude usage resets or Tate tops up), execute these tasks in order.

**Target:** Get the OS stable and functional within 24 hours of restart.

> **PHASE 0.5 (NEW — insert before Phase 1):** Security hardening starter. See `SECURITY_HARDENING.md`. Ship the untrusted-input delimiter wrap and self-mod path allowlist *before* anything else. 1-2 hours of work. Closes an active prompt-injection → RCE chain that all other work is blind to.
>
> **Phase 3.1 has been rewritten.** The original "`SELECT COUNT(*)` gate" is still TOCTOU-racy. The correct fix is an atomic conditional INSERT inside a transaction with a Postgres advisory lock, plus git worktree isolation per fork. See `FORK_ATOMICITY_SPEC.md`.
>
> **Line numbers in rev. 1 were approximations** (marked "likely NNNN"). This revision uses verified line numbers from the 2026-04-30 audit against actual source.

---

## PHASE 0: PRE-FLIGHT (Before OS comes online)

**Owner:** Tate (manual prep work)

- [ ] Verify Claude Max usage status: Check remaining capacity on both accounts
- [ ] Check VPS health: SSH into VPS, verify all PM2 processes running
- [ ] Check Neo4j: Verify database accessible and no corruption
- [ ] Check Supabase: Verify connection pool not saturated
- [ ] Review last 20 Director Chat messages: What was OS doing when it went down?
- [ ] Check for stuck forks: `SELECT * FROM os_forks WHERE status IN ('running', 'working') AND started_at < NOW() - INTERVAL '2 hours'`
- [ ] Check for orphaned factory sessions: `SELECT * FROM cc_sessions WHERE status = 'running' AND started_at < NOW() - INTERVAL '2 hours'`

---

## PHASE 0.5: SECURITY PRE-FLIGHT (NEW — Before Phase 1, ~2 hours)

**Owner:** OS Session (autonomous, but mandatory before any self-mod activity).
**Doc:** `SECURITY_HARDENING.md`.

### 0.5.1: Untrusted-input delimiter wrap

**Goal:** Close the email → self-mod → RCE chain documented in `SECURITY_HARDENING.md` §1.

- [ ] Wrap all external-origin text in `<untrusted_input source="..." id="..." nonce="...">` before any prompt it lands in. Specific injection sites to patch:
  - [factoryOversightService.js:530-562](../src/services/factoryOversightService.js#L530-L562) (review prompt; includes email body / CRM data).
  - [factoryOversightService.js:691-720](../src/services/factoryOversightService.js#L691-L720) (follow-up generation).
  - Email wake path in `listeners/emailArrival.js`.
  - Cowork inbox read in `coworkInbox.js`.
- [ ] Add system-prompt clause (`SECURITY_HARDENING.md` §2.1) to all prompts that may contain `<untrusted_input>`.
- [ ] Nonce rotation: generate a per-session UUID suffix for the delimiter; strip-and-rewrap if the input contains the current nonce.

### 0.5.2: Self-mod path allowlist

**Goal:** Prevent prompt-injected factory sessions from editing their own guardrails.

- [ ] Add `deploymentService.js` pre-deploy check: if any file in the diff matches the deny-list in `SECURITY_HARDENING.md` §2.3, block deploy unconditionally (no confidence override).
- [ ] Add git pre-commit hook in every fork worktree that rejects changes to the deny-list.
- [ ] Require Tate SMS OTP (via `sms_tate` + `tateActiveGate`) for any allowlist bypass. Bypass expires in 10 min.

### 0.5.3: Cypher parameterization sweep

**Goal:** Prevent attackers from poisoning durable memory.

- [ ] Audit every `session.run`, `runWrite`, `runRead` call in `backend/src/services/**` for string interpolation.
- [ ] Convert to `$param` binds. Add a label allowlist for Neo4j labels (`['Pattern','Decision','Episode','Incident','Reflection','Person','Project','Client']`).
- [ ] Verify or implement `sanitizeLabel()` referenced at `knowledgeGraphService.js:74`. Replace with the allowlist if weak.

**Success gate:** All three tasks complete, tested with at least one attack-simulation test each (see `SECURITY_HARDENING.md` §11). No Phase 1 work proceeds until this passes.

---

## PHASE 1: CRITICAL FIXES (First 2 hours online)

**Owner:** OS Session (autonomous execution)

### 1.1: Context Cleanup (Immediate token waste reduction)

**Goal:** Cut token consumption per turn by 50% (125K → 60K)

**Tasks:**

> **Note on this section:** these truncation fixes are tactical stopgaps. The *correct* end state is `PROMPT_ASSEMBLY_SPEC.md` (single assembler, global budget, 4 cache breakpoints). Ship these now for the day-1 stability win, then replace with the assembler when Phase 1 is green.

- [ ] **Fork brief echo truncation** ([forkService.js](../src/services/forkService.js) — `_forkSnapshot()` function)
  - The brief is already used in several rollup formats. Identify the snapshot field returned to WS clients and truncate: `brief: state.brief.slice(0, 200) + (state.brief.length > 200 ? '...' : '')`
  - Test: Spawn test fork, verify echo is ≤200 chars in WS output

- [ ] **Factory prompt echo truncation** (`src/mcp/factory/index.js` — `start_cc_session` tool handler)
  - Find where `start_cc_session` returns tool result with full prompt
  - Truncate to 300 chars before returning (keep full prompt in DB `cc_sessions.initial_prompt`)
  - Test: Dispatch factory task, verify prompt echo ≤300 chars

- [ ] **Doctrine surface → migrate to Skills** ([doctrineSurface.js](../src/services/doctrineSurface.js))
  - Preferred path: do NOT patch this; instead execute `ANTHROPIC_NATIVE_LEVERAGE.md` §1 migration (patterns → `.claude/skills/`). Eliminates the 3KB/turn unconditional injection entirely.
  - Stopgap if migration is delayed: cap `DEFAULT_MAX_SURFACES` at 3, truncate each file to 1500 chars, strip non-essential sections.
  - Test: verify `<doctrine_surface>` block is ≤4500 chars total during a typical turn.

- [ ] **Session memory cap** ([sessionMemoryService.js](../src/services/sessionMemoryService.js))
  - Retrieval limit: 3 chunks max (verify current value first — grep the retrieval config).
  - Per-chunk char cap: 1200 chars.
  - Pre-truncation: semantic-dedupe chunks with cosine similarity > 0.85 before injection.
  - Test: Check memory retrieval in next turn, verify ≤3 chunks, total ≤3600 chars.

- [ ] **Neo4j retrieval compression** ([neo4jRetrieval.js](../src/services/neo4jRetrieval.js))
  - `fusedSearch()`: return only first 400 chars of content per node.
  - Pattern nodes: return only Rule + Why sections.
  - Decision nodes: return only decision + outcome, not full reasoning.
  - Episode nodes: return only title + takeaway.
  - Test: confirm `<relevant_memory>` block ≤4K chars.

- [ ] **Tool result truncation — move to frontend emit path** ([osSessionService.js:1833](../src/services/osSessionService.js#L1833))
  - Current: backend truncates tool result to 2000 chars before broadcasting. This is a *display* concern, not a *context* concern — the model still sees the full result.
  - Fix: increase broadcast truncation to 4000 chars with `{summary, full_ref}` structure so the frontend can expand on click. See `ANTHROPIC_NATIVE_LEVERAGE.md` §6.3.
  - Do NOT reduce the model's visibility; reducing that is what caused the "model keeps re-reading" failure mode last sprint.

**Success Criteria:**
- Token usage per turn drops to 50K–70K (verify via OS token counter)
- Context injection blocks in prompt total <15K tokens
- No functional regressions (all tools still work)

### 1.2: Memory Leak Fixes (Stop crash loops)

**Goal:** Eliminate 6–7 minute crash-loop during fork-heavy loads

**Tasks:**

- [ ] **Fork transcript cap** ([forkService.js:406](../src/services/forkService.js#L406) — `state.transcript: []`)
  - Verified: `transcript: []` is initialized at line 406 and grows unbounded per fork.
  - Fix: after every push, `if (state.transcript.length > 80) state.transcript.splice(0, 20)`.
  - Evicted entries → `os_forks.transcript_archive` JSONB column (add column if not present).
  - Test: Spawn long-running fork (>80 entries), verify in-memory transcript capped; DB archive grows.

- [ ] **WebSocket ring buffer shape fix** ([wsManager.js:163-242](../src/websocket/wsManager.js#L163))
  - Verified: single global `_eventRing = []` of last 500 events (not per-connection). `_pendingDeltas` is also global, 10ms coalesce window.
  - Fix A: truncate `envelope.data.content` to 8KB before ring insert.
  - Fix B: per-connection ring buffers when connection count > 10. Current global buffer OOMs at high client counts.
  - Test: 20 concurrent WS clients receiving 5MB of tool results; assert heap growth ≤200MB.

- [ ] **Fork linger TTL** ([forkService.js:674](../src/services/forkService.js#L674) — `setTimeout(() => _forks.delete(...), 60 * 1000)`)
  - Verified: TTL is already 60 seconds (1 min), not 5 min as the rev-1 checklist assumed.
  - No change needed for TTL itself. The *problem* is the leak when the process dies before the timeout fires. See `FORK_ATOMICITY_SPEC.md` §5.1 — cap enforcement should use DB count, not memory, making the linger cosmetic.

- [ ] **Memory usage monitoring**
  - Add: Log `process.memoryUsage().heapUsed` every 2 minutes as a Prometheus gauge `process_heap_bytes{pm2_name}`.
  - Add: Page via SMS if heapUsed > 1.95GB for ≥60s (see `OBSERVABILITY_SPEC.md` §4.2 thresholds).
  - Test: Monitor `/ops` page for memory trend.

**Success Criteria:**
- ecodia-conductor runs for 24+ hours without crash
- Memory usage stays below 1.5GB during normal load
- Memory usage peaks below 1.9GB during fork-heavy load (5 concurrent forks)

### 1.3: Compaction Adjustment (Extend session lifetime)

**Goal:** Run 8+ turns per session instead of 3–5

**Tasks:**

- [ ] **Lower compaction threshold** ([osSessionService.js:1925](../src/services/osSessionService.js#L1925) — `OS_SESSION_COMPACT_THRESHOLD` env var, default 800000)
  - Verified: current default is 800K tokens — this is the 1M-context Opus threshold, wrong for 200K-context deployments.
  - Fix: set `OS_SESSION_COMPACT_THRESHOLD=120000` in `.env`. Leaves 80K headroom post-compact on 200K-context models.
  - Do NOT use the old deprecated `compact()` route at [line 2874-2877](../src/services/osSessionService.js#L2874-L2877) — it destroys the session. SDK handles compaction internally; we just set threshold.
  - Test: Monitor `os_session_compact_events_total` metric; expect 1 compaction every 5-8 turns, not every 40.

- [ ] **Add continuity handoff** ([sessionHandoff.js](../src/services/sessionHandoff.js))
  - Before compaction, kv_store write:
    - Active forks (full briefs + positions, not just summaries).
    - Pending claims (unverified — see `OBSERVABILITY_SPEC.md` §3).
    - Status board items touched this session.
    - Message queue contents.
    - Unread Tate messages since last compaction.
  - Inject handoff into the first turn post-compaction as `<restart_recovery>` ([osSessionService.js:1610](../src/services/osSessionService.js#L1610) — existing injection point).
  - Test: Force compaction via threshold; verify new session receives continuity block and references it in first reply.

**Success Criteria:**
- Session compacts at 100K tokens instead of 180K
- New session after compact has continuity context
- Turn count per session increases from ~3 to ~8+

---

## PHASE 2: VERIFICATION GATES (Next 4 hours)

**Owner:** OS Session (autonomous execution)

### 2.1: Factory Deploy Verification

**Goal:** Never report "deployed" without verifying actual deployment

**Tasks:**

- [ ] **Add verification step to factoryOversightService** (`src/services/factoryOversightService.js`)
  - After factory session ends with status=success:
    - Run `git log --oneline origin/main -1` on target repo
    - Verify commit_sha matches factory's claimed push
    - If push was to client repo, verify commit appears on GitHub/Bitbucket
    - If deploy was requested, verify deployment timestamp > session_ended_at
  - Only mark status=deployed after verification passes
  - If verification fails: mark status=verification_failed, log to Neo4j, alert Tate

**Success Criteria:**
- 100% of factory deploys have verification entry in logs
- Zero false-positive "deployed" statuses
- Verification failures trigger auto-remediation forks

### 2.2: Fork Deliverable Verification

**Goal:** Cross-check fork claims against reality

**Tasks:**

- [ ] **Add deliverable parsing to forkFinalizer** (`src/services/forkFinalizer.js`)
  - Parse fork result for claims:
    - "sent email to X" → verify via gmail_search
    - "created GitHub issue #N" → verify via GitHub API
    - "updated status_board" → verify row exists with claimed value
    - "deployed to Vercel" → verify deployment exists
  - Append verification results to fork record: ✓ or ✗ per claim
  - If any ✗: auto-schedule continuation fork to complete work

**Success Criteria:**
- Forks that claim email sent have gmail_search verification
- Forks that claim deploy have Vercel API verification
- Continuation forks spawn automatically on verification failure

### 2.3: Listener 5-Layer Verification

**Goal:** Ensure listeners actually fire and produce effects

**Tasks:**

- [ ] **Add end-to-end listener tests** (`src/services/listeners/` subsystem)
  - For each listener (emailArrival, forkComplete, factorySessionComplete, etc.):
    - Layer 1: Verify DB trigger exists (`SELECT * FROM pg_trigger`)
    - Layer 2: Verify pg_notify reaches Node (log in dbBridge.js)
    - Layer 3: Verify listener handler executes (log at handler entry)
    - Layer 4: Verify handler completes (log at handler exit)
    - Layer 5: Verify side effect visible (e.g., status_board updated, Neo4j node created)
  - Run verification suite weekly via cron
  - Alert on any layer failure

**Success Criteria:**
- All listeners pass 5-layer verification
- Listener verification runs automatically weekly
- Failures trigger immediate investigation fork

---

## PHASE 3: FORK ORCHESTRATION (Next 4 hours)

**Owner:** OS Session (autonomous execution)

### 3.1: Hard Fork Ceiling Enforcement (REWRITTEN post-audit)

**Goal:** Never exceed 5 concurrent forks.

**Why the previous version was wrong:** "Before spawning, count; if ≥ 5, reject" is **still TOCTOU-racy**. Two concurrent `spawnFork()` calls read count=4, both pass the check, both insert. Same race as before, just with SQL instead of an in-memory Map. This is how production still violates the cap at 7/5.

**The correct fix** is an atomic conditional INSERT inside a transaction with a Postgres advisory lock, plus worktree isolation. Full spec: `FORK_ATOMICITY_SPEC.md`.

**Tasks:**

- [ ] **Atomic spawn transaction** (`FORK_ATOMICITY_SPEC.md` §2)
  - Replace [forkService.js:362-412](../src/services/forkService.js#L362-L412) cap check with a transaction that:
    - Takes `pg_advisory_xact_lock(hashtext('fork_cap'))`.
    - SELECTs count of live forks from DB.
    - If < cap, INSERTs new fork row inside same transaction.
    - Memory Map populated *after* transaction commits.
  - Feature flag first: `FORK_CAP_ATOMIC=1` alongside legacy path for 24h shadow.

- [ ] **Per-fork git worktrees** (`FORK_ATOMICITY_SPEC.md` §3)
  - On spawn: `git worktree add -b fork/${fork_id} /home/tate/fork_worktrees/${fork_id} main`
  - Fork process runs with `cwd = worktree path`.
  - On finalize: merge fork branch back (fast-forward only) + cleanup worktree.
  - Prevents concurrent-push corruption on shared cwd.

- [ ] **Parent-goal fork budget** (`FORK_ATOMICITY_SPEC.md` §6)
  - Each top-level goal carries `fork_budget_remaining` column.
  - Spawn transaction also checks root-goal budget; decrements atomically.
  - Prevents amplification loops (goal → forks → each fails → re-dispatch → more forks).

**Success Criteria:**
- Zero cap violations across 10K fire-1000-concurrent-spawns test cycles.
- Worktree contention incidents: 0 (measured via `git_worktree_conflict_total` counter).
- `fork_cap_rejections_total` metric visible on `/ops`; investigated if > 10/hr.

### 3.2: Fork Priority Queue

**Goal:** Spawn high-value work before low-value work

**Tasks:**

- [ ] **Create fork priority queue** (`src/services/forkQueue.js`)
  - Schema: `fork_queue` table with columns: id, brief, priority (critical/high/normal/low), queued_at, spawned_at
  - When spawn_fork blocked by capacity: insert to fork_queue
  - When fork completes: check fork_queue, spawn highest-priority queued item
  - Expose MCP tool: `mcp__forks__queue_work` for conductor to use

**Success Criteria:**
- Critical work never waits behind low-priority work
- Queue is drained automatically as forks complete
- Queue depth never exceeds 10 (signals capacity problem)

### 3.3: Fork Health Monitoring

**Goal:** Detect and recover from stuck forks

**Tasks:**

- [ ] **Add fork watchdog** (`src/services/forkService.js`)
  - Every 5 minutes, check all running forks
  - If fork hasn't emitted position update in >10 min: send nudge message
  - If still silent after another 5 min: auto-abort, log incident, spawn replacement
  - Log watchdog actions to Neo4j for pattern analysis

**Success Criteria:**
- Stuck forks are auto-detected within 10 minutes
- Stuck forks are auto-recovered within 15 minutes
- Watchdog logs show low false-positive rate (<10%)

---

## PHASE 4: SELF-DIAGNOSTICS (Next 6 hours)

**Owner:** OS Session (autonomous execution)

### 4.1: Expanded Health Checks

**Goal:** Detect problems before they cause failures

**Tasks:**

- [ ] **Expand osSelfCheckService** (`src/services/osSelfCheckService.js`)
  - Add checks:
    - Neo4j query performance (alert if >500ms)
    - Supabase connection pool (alert if >80% used)
    - MCP server responsiveness (timeout if >5s)
    - Gmail API quota (alert if >80% daily limit)
    - Disk space on VPS (alert if >85% used)
  - Run checks every 15 minutes
  - Auto-remediate where possible (e.g., restart MCP server)

**Success Criteria:**
- Health checks run every 15 minutes
- Alerts fire before problems cause outages
- Auto-remediation reduces manual intervention by 50%

### 4.2: Failure Prediction Telemetry

**Goal:** Predict crashes before they happen

**Tasks:**

- [ ] **Create failure prediction service** (`src/services/telemetry/failurePrediction.js`)
  - Track leading indicators:
    - Memory growth rate (MB/min)
    - Token burn rate (tokens/turn)
    - Error rate (errors per 10 turns)
    - Response latency (seconds/turn)
  - Emit warnings when indicators cross thresholds:
    - Memory growth >50MB/min → likely OOM in 10 min
    - Token burn >25K/turn → likely session cap before goal complete
    - Error rate >3/10 turns → likely cascading failure
  - Trigger preventive actions (compact, fork cull, model switch)

**Success Criteria:**
- Predictions fire 5–15 minutes before crashes
- Preventive actions reduce crash rate by 70%
- False positive rate <20%

### 4.3: State Checkpointing

**Goal:** Recover from crashes without losing work

**Tasks:**

- [ ] **Create state checkpoint service** (`src/services/stateCheckpoint.js`)
  - Every 5 minutes, write to DB:
    - All active forks (full state)
    - Message queue contents
    - In-flight tool calls
    - Current goals/subgoals
  - Table: `os_state_checkpoints` (id, session_id, checkpoint_at, state JSONB)
  - On OS restart, check for crashed checkpoints (timestamp <10 min ago)
  - If found: restore forks, message queue, notify Tate

**Success Criteria:**
- Checkpoints written every 5 minutes
- Crash recovery restores work-in-progress
- Recovery time drops from 10 min → 1 min

---

## PHASE 5: PROACTIVE WORK (Next 8 hours)

**Owner:** OS Session (autonomous execution)

### 5.1: Work Discovery Cron Jobs

**Goal:** Find work autonomously instead of waiting for Tate

**Tasks:**

- [ ] **Create work discovery dispatchers** (`src/services/cronForkDispatcher.js`)
  - **Email scan** (every 30 min):
    - Check Gmail for unread emails from clients
    - Categorize urgency (critical/high/normal/low)
    - Draft responses for Tate to review
  - **Invoice follow-up** (daily):
    - Check Stripe for unpaid invoices >7 days old
    - Send reminder emails automatically
  - **Client silence check** (daily):
    - Check CRM for clients with no contact in >14 days
    - Draft check-in emails
  - **System health scan** (hourly):
    - Check PM2 status, log errors, disk space
    - Alert on degradation trends

**Success Criteria:**
- Discovery crons run on schedule
- 30%+ of daily work is proactively discovered
- Zero client emails sit unanswered >4 hours

### 5.2: Idle Time Utilization

**Goal:** Productive work during downtime

**Tasks:**

- [ ] **Implement idle work queue** (pattern: `continuous-work-conductor-never-idle.md`)
  - When no forks running and no immediate work:
    - Review patterns for staleness (unused in 30 days → archive)
    - Run Neo4j consolidation (deduplicate entities)
    - Pre-draft email responses Tate hasn't opened
    - Analyze past decisions for improvement opportunities
  - Never be idle >10 minutes during work hours (6am–10pm AEST)

**Success Criteria:**
- Idle time drops from 2–3 hours/day → <1 hour/day
- Pattern catalog stays fresh (no stale patterns)
- Neo4j graph stays clean (no duplicates)

---

## PHASE 6: OPTIMIZATION (Ongoing)

**Owner:** OS Session (autonomous execution, continuous improvement)

### 6.1: Prompt Caching Optimization

**Goal:** Maximize cache hit rate (target >70%)

**Tasks:**

- [ ] **Restructure prompt order** (`src/services/osSessionService.js`)
  - Current order (likely): user message → context → CLAUDE.md
  - **New order:** CLAUDE.md → patterns index → Neo4j retrieval → user message
  - This puts stable content first (maximizes cache hits)
  - Test: Monitor Anthropic response headers for cache hit rate

**Success Criteria:**
- Cache hit rate increases from ~20% → >70%
- Cost per turn drops ~40% (cached tokens are 90% cheaper)

### 6.2: Intelligent Model Selection

**Goal:** Route tasks to cheapest capable model

**Tasks:**

- [ ] **Refine model routing** (`src/conductor.js` and subagent configs)
  - **Haiku:** Mechanical tasks (DB queries, file reads, simple emails)
  - **Sonnet:** Standard tasks (email responses, code reviews, client comms)
  - **Opus:** Complex tasks (architecture, negotiations, hard debugging)
  - Add task classification: conductor analyzes task complexity before spawning fork/subagent
  - Override default model based on classification

**Success Criteria:**
- 40% of tasks routed to Haiku (down from 0%)
- 40% to Sonnet (up from 30%)
- 20% to Opus (down from 70%)
- Quality metrics unchanged (no regressions)

### 6.3: Cross-Account Load Balancing

**Goal:** Balance usage across both Claude Max accounts

**Tasks:**

- [ ] **Implement predictive switching** (`src/services/usageEnergyService.js`)
  - Don't wait for account 1 to hit 90% while account 2 is at 30%
  - Switch when: `account1.weeklyUtilization - account2.weeklyUtilization > 0.20`
  - This keeps both accounts balanced, maximizes runway before both cap
  - Test: Monitor account utilization over 3 days, verify they stay within 20% of each other

**Success Criteria:**
- Both accounts within 20% utilization of each other
- Time until both accounts cap increases 30–50%

---

## SUCCESS METRICS (End of 24 hours)

### Stability Metrics
- [x] No crashes for 24 consecutive hours
- [x] Memory usage stays below 1.5GB during normal load
- [x] Session runs 8+ turns before compaction
- [x] All forks complete within 30 minutes or are flagged as stuck

### Efficiency Metrics
- [x] Token usage per turn drops from 125K → 50–70K
- [x] Prompt cache hit rate >70%
- [x] Cost per turn drops 40%
- [x] Both Claude Max accounts balanced (within 20% utilization)

### Intelligence Metrics
- [x] 100% of factory deploys verified as actually deployed
- [x] Zero false-positive "done" reports (verification catches 100%)
- [x] 30%+ of daily work is proactively discovered (not Tate-initiated)

### Autonomy Metrics
- [x] OS operates 6+ hours without Tate input
- [x] Critical alerts trigger autonomous remediation (not just notifications)
- [x] Client emails answered within 4 hours
- [x] System health issues detected before they cause outages

---

## FAILURE MODES & ROLLBACK PLAN

If any of these fixes cause regressions:

### Rollback Procedure
1. Identify broken commit via `git log`
2. Revert: `git revert <commit-sha>`
3. Push to VPS: `git push origin main`
4. On VPS: `cd ~/ecodiaos && git pull && pm2 restart ecodia-conductor`
5. Monitor logs: `pm2 logs ecodia-conductor --lines 100`

### Known Risk Areas
- **Context truncation:** Might break tools that rely on full content (test each tool after truncation changes)
- **Memory caps:** Might lose important fork state if cap too aggressive (monitor for incomplete work)
- **Compaction threshold:** Might cause thrashing if too low (monitor compaction frequency)

### Emergency Contacts
- If OS crashes during fixes: Check `~/ecodiaos/logs/conductor-errors.log`
- If fixes cause client-facing issues: Disable autonomous work, switch to manual mode
- If Supabase/Neo4j connection issues: Check VPS firewall and connection pool settings

---

## NEXT ACTIONS AFTER 24 HOURS

Once Phase 6 is complete and metrics are green:

1. **Generate postmortem:** Document what failed, why, and how fixes prevented recurrence
2. **Update patterns:** Create new patterns for lessons learned during recovery
3. **Schedule Phase 2 work:** Begin implementation of medium-priority directives from main doc
4. **Report to Tate:** Summary of fixes, metrics improvement, and recommendations for next phase

---

**Document Status:** Tactical Checklist v1.0
**Execution Owner:** EcodiaOS (when back online)
**Review Cadence:** Check metrics every 6 hours during first 24 hours
**Escalation Path:** If any metric fails to improve, alert Tate immediately
