# EcodiaOS Recovery & Evolution Directives
## Deep Audit & Architectural Solutions — 2026-04-30

**Context:** The OS is down due to Claude Max usage exhaustion. This document synthesizes architectural solutions to transform EcodiaOS into a truly autonomous, self-healing, self-evolving cofounder-grade intelligence that can operate indefinitely without human intervention.

**Ambition Level:** Jarvis from Iron Man. Full autonomy. Zero human dependency. Self-correcting. Self-evolving. Capable of running the business, itself, and multiple client projects simultaneously while you're traveling for 3+ months.

> **Post-audit rev-2 note (2026-04-30):** Several directives in this document have been superseded by code-verified specs written after an adversarial audit. Where specs conflict, the newer spec wins:
> - **Section 1 (Token Economy)** → superseded by [PROMPT_ASSEMBLY_SPEC.md](./PROMPT_ASSEMBLY_SPEC.md). The old tier-per-injector model was still uncoordinated; the new spec is a single assembler with global budget.
> - **Section 5 (Coordination & Fork Orchestration)** → superseded by [FORK_ATOMICITY_SPEC.md](./FORK_ATOMICITY_SPEC.md). The old `SELECT COUNT(*)` gate is still TOCTOU-racy; the new spec uses atomic INSERT + advisory lock + worktree isolation.
> - **Section 6 (Observability)** → superseded by [OBSERVABILITY_SPEC.md](./OBSERVABILITY_SPEC.md). The old intention was right; the new spec has concrete metric names, thresholds, and a `/ops` page contract.
> - **Missing section: Security** → see [SECURITY_HARDENING.md](./SECURITY_HARDENING.md). This document does not address prompt injection, self-modification attack chains, or Cypher injection. All three are live, all three must be fixed before Track C.
> - **Section 7 (Claude Max Utilization)** → extended by [ANTHROPIC_NATIVE_LEVERAGE.md](./ANTHROPIC_NATIVE_LEVERAGE.md) — specifically, delete `doctrineSurface.js` and migrate patterns to Skills; use 4 cache breakpoints not 1; adopt structured tool output schemas with handles.
> - **Section 4.2 (Pattern mining)** → keep, but add a `trace:` field and `last_validated_at` to every auto-generated pattern. Without a trace, an auto-pattern is a superstition; without validation timestamps, 122 patterns become 500 over a year.
>
> The unchanged sections (2 Intelligence, 3 Reliability, 4 Autonomy) remain load-bearing. Ship those as originally written.

---

## SECTION 1: EXISTENTIAL — Token Economy & Context Hygiene

### Directive 1.1: Implement Adaptive Context Budget Management

**The Deep Problem:** The OS is burning 125K+ tokens per 5-hour session due to uncapped injection of doctrine_surface (3KB+), relevant_memory (unbounded), tool echoes (spawn_fork echoing 3KB briefs verbatim), and cumulative transcript bloat. With 2 Claude Max accounts, you have ~$400/week of capacity but zero governance over how it's spent.

**Root Cause:** The OS has no internal cost model. Every retrieval system (Neo4j fusedSearch, doctrineSurface, sessionMemory, episodeResurface) injects content *independently* without checking if the prior systems already saturated the available budget. The conductor treats context like RAM in 2010 — infinite until it isn't.

**The Solution Architecture:**

1. **Token Budget Manager Service** (`src/services/tokenBudgetService.js`)
   - Tracks per-turn token allocation across all injection surfaces
   - Allocates budget in priority tiers:
     - **Tier 0 (reserved, 15K tokens):** User message + tool results + current turn
     - **Tier 1 (8K tokens):** Critical doctrine (client-specific patterns, current-project patterns)
     - **Tier 2 (6K tokens):** Recent Neo4j Decisions/Episodes (last 7 days, task-relevant)
     - **Tier 3 (4K tokens):** Session memory (semantic-matched chunks from prior turns)
     - **Tier 4 (3K tokens):** Broad doctrine (general patterns, non-urgent memories)
   - Each tier MUST stay within budget. If tier 2 returns 12K tokens, truncate to 6K via relevance ranking
   - Expose `budgetManager.allocate(tier, content, metadata)` — returns truncated content or null if tier exhausted

2. **Tool Echo Compression** (`src/services/forkService.js:116`, `osSessionService.js` tool result handlers)
   - spawn_fork brief echo: 200 char max (currently 3KB+)
   - start_cc_session prompt echo: 300 char max
   - gmail_send/reply body echo: 150 char max
   - All DB query results: truncate rows to 10 + "... +N more" footer
   - Grep/file reads: show first 30 lines + summary stats, not full content

3. **Doctrine Surface Relevance Ranking** (`src/services/doctrineSurface.js`)
   - Currently returns up to 6 files with full content — no relevance scoring beyond keyword match
   - **Fix:** Compute TF-IDF score per keyword × file, rank, return only top 3
   - Strip all Origin/Cross-references sections (keep only Rule + Why + How to Apply)
   - Hard cap: 1500 chars per file, 4500 chars total

4. **Session Memory Deduplication** (`src/services/sessionMemoryService.js`)
   - Currently retrieves up to 5 chunks × 1500 chars = 7.5K tokens
   - **Fix:** Semantic deduplicate chunks before injection (if cosine similarity > 0.85, keep only the more recent)
   - Cap: 3 chunks, 1200 chars each = 3.6K tokens max

5. **Neo4j Retrieval Compression** (`src/services/neo4jRetrieval.js`)
   - fusedSearch returns full node content for top 3 Patterns/Decisions/Episodes
   - **Fix:** Return only: name, label, one-sentence summary, created_at. Link to full content in Neo4j UI for Tate to read if needed
   - Pattern nodes: return only first 400 chars (usually covers Rule + Why)
   - Decision nodes: return only decision + outcome, not full reasoning trail
   - Episode nodes: return only title + takeaway, not transcript

**Implementation Priority:** CRITICAL. Without this, every other optimization is negated by context bloat. This is the foundation.

**Metrics:** Target 40K–60K tokens/turn (down from 125K), enabling 8–12 turns per session instead of 3–5.

---

### Directive 1.2: Implement Proactive Compaction with Continuity Preservation

**The Deep Problem:** The OS waits until 180K tokens (near the 200K limit) to compact. By then, the session is already slow, expensive, and context-starved. The compaction logic also naively summarizes the conversation, losing critical state.

**The Solution Architecture:**

1. **Early Compaction Threshold** (`src/services/osSessionService.js` compaction logic)
   - Current: 180K tokens → compact
   - **New:** 100K tokens → compact (leaving 100K headroom for the new session)
   - This keeps the session perpetually in the "fresh context" zone

2. **Continuity-Aware Compaction** (new service: `src/services/sessionCompactionService.js`)
   - Before compacting, extract and preserve:
     - **Active forks:** All in-flight fork briefs, positions, next_steps
     - **Pending decisions:** Any question nodes in Neo4j created this session
     - **Status board deltas:** All status_board updates from this session
     - **Tool call outcomes:** Summarize what was deployed, emailed, scheduled
     - **Open threads:** Any email threads, GitHub issues, client conversations that haven't reached terminal state
   - Store this in `kv_store` under key `continuity_${old_session_id}`
   - New session prompt includes: "You are resuming from session ${old_session_id}. Active context: ${continuity_summary}"

3. **Sliding Window Compaction** (alternative to full restart)
   - Instead of restarting the session, use prompt caching boundaries to evict old turns
   - Keep last 20 turns in full, summarize prior 40 turns, discard everything before that
   - This requires refactoring the SDK stream to inject summaries at cache boundaries
   - **Tradeoff:** More complex, but avoids cold-start cost of new session

**Implementation Priority:** HIGH. Directly extends session lifespan by 2–3×.

---

### Directive 1.3: Implement Fork Lifecycle Hygiene

**The Deep Problem:** The OS spawns up to 5 forks but has no memory pressure relief. Forks accumulate transcripts in-memory (unbounded arrays), crash-loop the ecodia-api process every 6–7 minutes during heavy fork loads, and leak memory via duplicated WebSocket ring buffers.

**The Solution Architecture:**

1. **Fork Transcript Caps** (`src/services/forkService.js:_forks Map state.transcript`)
   - Current: unbounded array
   - **Fix:** Max 80 entries per fork. When exceeded, evict oldest 20 entries
   - Evicted entries go to DB only (os_forks.transcript_archive JSONB column)

2. **WebSocket Ring Buffer Size Cap** (`src/websocket/wsManager.js`)
   - Current: ring buffer duplicates full tool results
   - **Fix:** Truncate `envelope.data.content` to 8KB before buffering. Frontend already has HTTP fallback for missing chunks

3. **Fork Post-Termination Linger Reduction** (`src/services/forkService.js` LINGER_TTL)
   - Current: 5 minutes
   - **New:** 1 minute (long enough for frontend to poll final state, short enough to free memory fast)

4. **Fork Memory Watchdog** (new service: `src/services/forkMemoryWatchdog.js`)
   - Polls `process.memoryUsage().heapUsed` every 30s
   - If heapUsed > 1.8GB (90% of 2GB default), force-terminate the oldest completed fork still in linger
   - Emit alert to Tate if this happens (signals we need to increase Node heap or reduce fork cap)

**Implementation Priority:** CRITICAL. The 6–7 minute crash loop is killing productivity and destroying session continuity.

---

## SECTION 2: INTELLIGENCE — Decision Quality & Task Completion

### Directive 2.1: Implement Empirical Verification Layer (Layer 5)

**The Deep Problem:** The OS thinks it finished a task because it wrote code, received HTTP 200, or saw a success log line. It doesn't verify the deployed state matches the narrated state. This causes silent failures where the OS reports "READY" but the feature is broken.

**Root Cause:** The OS has no separation between "command executed successfully" and "system state changed as intended." It treats API success as goal success.

**The Solution Architecture:**

1. **Verification Registry** (`src/services/verificationRegistry.js`)
   - Maps task types to verification strategies:
     - **Code deploy:** `git log --oneline origin/main -1` — verify commit SHA matches what factory claimed to push
     - **Database migration:** `SELECT * FROM schema_migrations` — verify migration row exists
     - **Email sent:** `gmail_search "from:me to:${recipient} subject:${subject}"` — verify email in Sent
     - **UI change:** `screenshot.screenshot` + vision model — verify element present
     - **API endpoint:** `curl ${url}` + assert status/response shape
     - **Scheduled task:** `SELECT * FROM os_scheduled_tasks WHERE id=${id}` — verify row exists

2. **Factory Deploy Verification** (`src/services/factoryOversightService.js`)
   - Currently: marks status=deployed when factory session ends
   - **New:** After session ends, verify:
     - Files changed on disk match factory's claimed diff
     - If push requested, verify `git log origin/main` includes commit_sha
     - If deploy requested, verify deployment timestamp > session_ended_at
     - If tests exist, run them and assert pass
   - Only mark status=deployed after verification passes
   - On verification failure: mark status=verification_failed, auto-schedule remediation fork

3. **Fork Deliverable Verification** (`src/services/forkFinalizer.js`)
   - Currently: reads fork result text and trusts it
   - **New:** Parse result for deliverable claims ("deployed to X", "sent email to Y", "created issue #Z")
   - For each claim, dispatch a verification query (DB, API, filesystem, screenshot)
   - Append verification results to fork result: ✓ or ✗ per claim
   - If any ✗, auto-schedule continuation fork to fix

4. **Listener Pipeline Verification** (`src/services/listeners/` subsystem)
   - Currently: assumes listeners fire if they're registered
   - **New:** Require 5-layer verification per pattern `listener-pipeline-needs-five-layer-verification.md`:
     - Layer 1: DB trigger exists
     - Layer 2: pg_notify reaches Node process
     - Layer 3: Listener handler executes
     - Layer 4: Handler completes without throwing
     - Layer 5: Downstream side effect visible (e.g., status_board row updated)
   - Auto-verify layer 5 for every listener fire via scheduled check 5 minutes later

**Implementation Priority:** HIGH. This closes the gap between "commanded" and "achieved" — the core failure mode of autonomous agents.

---

### Directive 2.2: Implement Decision Provenance & Replay

**The Deep Problem:** The OS makes decisions (which client to prioritize, which model to use, whether to deploy), but there's no audit trail of *why* it chose that path. When a decision turns out wrong, there's no way to debug the reasoning or replay with different context.

**The Solution Architecture:**

1. **Decision Nodes in Neo4j** (already exists, needs enrichment)
   - Current: stores decision text + outcome
   - **Enrich:** Add `context_snapshot` property (JSONB) with:
     - Energy level at decision time
     - Active forks count
     - Token budget remaining
     - Recent failures (last 3 decisions + outcomes)
     - User input that triggered the decision
     - Alternative options considered (not just the chosen one)

2. **Counterfactual Replay Service** (`src/services/counterfactualReplay.js`)
   - Given a decision node ID, replay the decision with:
     - Same context but different energy level
     - Same context but different active forks count
     - Same context but alternative option chosen
   - Compare outcomes. If alternative would have been better, create Reflection node linking to original Decision
   - This trains the OS to recognize which context signals predict good vs bad decisions

3. **Decision Confidence Scoring**
   - Before committing to a decision, estimate confidence (0–1 scale):
     - Low confidence (< 0.4): defer decision, ask Tate
     - Medium confidence (0.4–0.7): proceed but flag for review
     - High confidence (> 0.7): proceed autonomously
   - Confidence = f(similar_past_decisions_outcome, context_completeness, time_pressure)

**Implementation Priority:** MEDIUM. This is intelligence evolution infrastructure — foundational for self-improvement but not blocking current operations.

---

### Directive 2.3: Implement Goal Decomposition & Subgoal Tracking

**The Deep Problem:** The OS receives high-level goals ("fix the coexist app bugs") but doesn't decompose them into verifiable subgoals. It works for a while, reports "done," but 40% of the original goal is unfinished. No intermediate checkpoints, no progress tracking, no way to detect drift.

**The Solution Architecture:**

1. **Goal Decomposition Service** (`src/services/goalDecompositionService.js`)
   - On receiving a high-level goal, use the conductor to generate:
     - 5–10 concrete subgoals (each testable/verifiable)
     - Acceptance criteria per subgoal
     - Estimated time/tokens per subgoal
     - Dependencies (subgoal B requires subgoal A)
   - Store in `goals` table (already exists) with `parent_goal_id` relationships

2. **Subgoal Progress Tracking**
   - As forks complete, map their deliverables to subgoal acceptance criteria
   - Mark subgoals complete only when acceptance criteria verified
   - If fork reports completion but verification fails → subgoal remains open, auto-schedule retry

3. **Goal Dashboard** (frontend)
   - Show goal tree with completion status per subgoal
   - Highlight blocked subgoals (waiting on dependencies)
   - Show estimated completion time based on current velocity
   - Emit alert if goal ETA slips by >50%

**Implementation Priority:** MEDIUM-HIGH. Critical for multi-day autonomous work where the OS loses track of the original goal.

---

## SECTION 3: RELIABILITY — Self-Healing & Crash Prevention

### Directive 3.1: Implement Graceful Degradation Modes

**The Deep Problem:** When the OS hits a resource limit (energy exhausted, memory full, Neo4j down), it either crashes or goes silent. No fallback modes, no limp-along state, no way to continue with reduced capability.

**The Solution Architecture:**

1. **Energy-Aware Capability Scaling** (`src/services/osSessionService.js`)
   - **Full energy (0–10% used):** All capabilities unlocked
   - **Healthy (10–40%):** Normal ops
   - **Conserve (40–70%):** Disable non-critical forks (only allow 2 forks, prioritize urgent work)
   - **Low (70–90%):** No forks, conductor-only, defer all cron tasks
   - **Critical (90–100%):** Emergency mode — disable heartbeat, disable autonomous work, only respond to Tate's direct messages

2. **Service Health Circuit Breakers** (new: `src/services/circuitBreaker.js`)
   - Wrap all external services (Neo4j, Supabase, Gmail, VPS) in circuit breakers
   - If service fails 3× in 5 minutes → open circuit, return cached/degraded response
   - Half-open after 2 minutes, retry once
   - If still failing → log incident, alert Tate, continue with degraded state
   - Example: Neo4j down → skip memory retrieval, continue with current context only

3. **Memory Pressure Auto-Compaction** (`src/services/osSessionService.js`)
   - If `process.memoryUsage().heapUsed > 1.5GB` → force compact current session immediately (don't wait for token threshold)
   - If heap still >1.5GB after compact → terminate all non-critical forks
   - If heap still >1.5GB after fork kill → emergency restart via `pm2 restart ecodia-conductor`

**Implementation Priority:** HIGH. The difference between a resilient system and a fragile one is how it degrades under load.

---

### Directive 3.2: Implement Predictive Failure Detection

**The Deep Problem:** The OS crashes, then Tate gets an alert. By then, 2 hours of work is lost and session continuity is destroyed. The OS should predict failures *before* they happen and take preventive action.

**The Solution Architecture:**

1. **Failure Precursor Telemetry** (`src/services/telemetry/failurePrediction.js`)
   - Track leading indicators:
     - Memory growth rate (if growing >50MB/min → likely OOM crash in 10 min)
     - Token burn rate (if >25K tokens/turn → likely to hit session cap before goal complete)
     - Error rate (if >3 errors in last 5 turns → likely approaching cascading failure)
     - Response latency (if turn time >120s → likely model overload or network issue)
   - When any indicator crosses threshold → emit warning, trigger preventive action

2. **Preventive Actions**
   - Memory growth → preemptive compact + fork cull
   - Token burn → inject "you're using excessive tokens, be more concise" system message
   - Error rate → pause autonomous work, wait for Tate
   - Latency → switch to Haiku for next 3 turns, then reassess

3. **Failure Postmortem Automation** (`src/services/osIncidentService.js`)
   - After any crash/restart, auto-generate postmortem:
     - What was the last 5 turns' activity
     - What were the telemetry signals 10 min before crash
     - What forks were running
     - What was the energy/token/memory state
   - Store in Neo4j as Incident node, surface on next session start
   - Conductor should read this and adjust behavior ("last session crashed due to memory — I'll be more aggressive about fork cleanup")

**Implementation Priority:** MEDIUM-HIGH. Prevents >80% of crashes if implemented well.

---

### Directive 3.3: Implement Explicit State Persistence & Recovery

**The Deep Problem:** When the OS crashes, it loses in-memory state (active forks, partial tool results, conversation context). The recovery path is manual: Tate has to tell the OS what it was doing. This breaks autonomy.

**The Solution Architecture:**

1. **State Checkpoint Service** (`src/services/stateCheckpoint.js`)
   - Every 5 minutes + before every risky operation (fork spawn, factory dispatch, session compact), write state snapshot to DB:
     - All active forks (full state, not just summary)
     - Message queue contents
     - In-flight tool calls
     - Conductor's current goal/subgoals
     - Recent decisions (last 10)
   - Table: `os_state_checkpoints` with JSONB state column

2. **Auto-Recovery on Boot** (`src/conductor.js` boot sequence)
   - On startup, check for crashed checkpoints (checkpoint timestamp < 10 min ago, no clean shutdown marker)
   - If found:
     - Restore forks (mark as crashed, dispatch continuation forks with recovered briefs)
     - Restore message queue
     - Send self-message: "I crashed ${elapsed_time} ago. Last known state: ${state_summary}. Resuming."
   - Conductor should diagnose crash cause from telemetry and avoid repeating it

3. **Transactional Fork Dispatch** (`src/services/forkService.js`)
   - Currently: fork spawns in-memory, DB row written fire-and-forget
   - **Fix:** Two-phase commit:
     - Phase 1: Write fork intent to DB (status=pending)
     - Phase 2: Spawn SDK query, update status=running
   - On crash: pending forks auto-convert to crashed, auto-schedule retry on next boot

**Implementation Priority:** MEDIUM. Dramatically improves crash recovery time (2 min → 30 sec) and preserves work.

---

## SECTION 4: AUTONOMY — Proactive Work & Self-Direction

### Directive 4.1: Implement Proactive Work Discovery

**The Deep Problem:** The OS waits for Tate to tell it what to do. It should be discovering work autonomously: emails needing responses, clients going silent, invoices overdue, systems showing early degradation. The heartbeat service exists but only does vague check-ins.

**The Solution Architecture:**

1. **Work Discovery Cron Jobs** (`src/services/cronForkDispatcher.js` dispatches)
   - **Email inbox scan** (every 30 min): Check for unread emails from clients, categorize urgency, draft responses
   - **GitHub issue scan** (every 2 hours): Check for new issues on client repos, triage, dispatch forks to investigate
   - **Invoice follow-up** (daily): Check for unpaid invoices >7 days old, send reminder emails
   - **Client silence detection** (daily): Check CRM for clients with no contact in >14 days, draft check-in email
   - **System health scan** (hourly): Check PM2 status, log errors, disk space, DB connection pool, memory trends
   - **Deployment verification** (daily): For each deployment in last 7 days, verify it's still live and no error rate spike

2. **Proactive Fork Spawning** (`src/services/conductorAutonomy.js`)
   - Conductor should spawn forks WITHOUT Tate asking, when:
     - Discovery cron finds actionable work
     - Status board item stuck in same state >48 hours
     - Factory session failed twice on same task
     - Client deadline <7 days away and task not started
   - Each proactive fork should include in brief: "This is proactive work. I discovered ${issue}. Tate hasn't asked for this yet."

3. **Idle Time Utilization** (pattern already exists: `continuous-work-conductor-never-idle.md`)
   - When no immediate work, conductor should:
     - Review patterns for staleness (are there patterns that haven't been referenced in 30 days? Archive them)
     - Sweep Neo4j for duplicate nodes (run kgConsolidationService)
     - Pre-draft responses to emails Tate hasn't opened yet
     - Analyze past decisions for improvement opportunities

**Implementation Priority:** HIGH. This is the difference between an assistant and a cofounder.

---

### Directive 4.2: Implement Self-Evolution via Pattern Mining

**The Deep Problem:** The OS has 130+ patterns but they're manually authored. When the OS makes a mistake twice, it should auto-generate a new pattern to prevent the third occurrence.

**The Solution Architecture:**

1. **Failure Pattern Detection** (`src/services/patternMining.js`)
   - Monitor Neo4j Decision nodes for repeated failure patterns:
     - Same failure cause >2× in 7 days
     - Same factory task rejected >2×
     - Same client issue reopened >2×
   - Extract common context across failures (e.g., "all 3 failures happened during low energy state")

2. **Pattern Synthesis**
   - When pattern detected, use conductor to draft new pattern file:
     - Title: concise rule
     - Triggers: keywords from failure context
     - Rule: what to do differently
     - Why: root cause analysis
     - How to apply: concrete protocol
     - Origin: link to Decision nodes that triggered pattern creation
   - Save to `patterns/` with status=draft

3. **Pattern Validation Loop**
   - After pattern created, apply it for 7 days
   - Track: did failure recur? If no → promote to canonical. If yes → revise pattern or discard

4. **Pattern Drift Detection**
   - Annually, review all patterns for relevance:
     - Patterns never surfaced in 90 days → archive
     - Patterns that fire but conductor still makes same mistake → revise
     - Patterns that fire but are immediately marked [NOT-APPLIED] → investigate why

**Implementation Priority:** MEDIUM. This is how the OS becomes smarter over time instead of static.

---

### Directive 4.3: Implement Multi-Horizon Planning

**The Deep Problem:** The OS is purely reactive (responds to current turn) or single-step proactive (heartbeat check-in). No multi-day plans, no strategic roadmaps, no ability to say "this week I'll focus on X, next week on Y."

**The Solution Architecture:**

1. **Weekly Plan Generation** (`src/services/planningService.js`)
   - Every Monday 6am AEST, conductor generates:
     - Client work priorities (based on deadlines, last contact date, unresolved issues)
     - Internal platform work (based on tech debt, performance metrics, pattern mining output)
     - Strategic initiatives (based on business goals from CLAUDE.md)
   - Store in `weekly_plans` table with breakdown by day

2. **Daily Plan Adjustment**
   - Every day 6am AEST, revise today's plan based on:
     - Yesterday's actual progress vs. planned progress
     - New urgent work that arrived overnight (emails, alerts)
     - Resource availability (energy level, fork capacity)

3. **Plan Execution Tracking**
   - As work completes, mark plan items done
   - If plan item blocked >24 hours → escalate to Tate or auto-spawn debugging fork
   - End of week: generate report comparing planned vs. actual, analyze variance, adjust next week's plan

4. **Strategic Goal Tracking** (quarterly level)
   - Maintain list of strategic goals (e.g., "launch Goodreach by June", "reduce AWS costs 30%")
   - Weekly plan should map to strategic goals
   - Alert if any strategic goal has no plan items for 2 consecutive weeks

**Implementation Priority:** MEDIUM. Transforms OS from reactive to strategic. Essential for 3-month autonomy.

---

## SECTION 5: COORDINATION — Fork Orchestration & Parallelism

### Directive 5.1: Implement Intelligent Fork Capacity Management

**The Deep Problem:** The OS spawns up to 5 forks but doesn't intelligently manage capacity. Sometimes spawns 7/5 (violates ceiling), sometimes leaves slots empty (wastes capacity), sometimes spawns low-value work when high-value work is queued.

**The Solution Architecture:**

1. **Fork Priority Queue** (`src/services/forkQueue.js`)
   - Before spawning fork, check:
     - How many forks running (must be <5)
     - What's their priority (critical > high > normal > low)
     - How long have they been running (>30 min → likely stuck)
   - If at capacity and new high-priority work arrives → kill lowest-priority fork, spawn new one
   - If at capacity and all forks are high-priority → queue new work instead of violating ceiling

2. **Fork Resource Estimation**
   - Before spawning, estimate fork requirements:
     - Expected duration (simple email response: 5 min, complex debugging: 60 min)
     - Expected token cost (email: 2K, coding task: 40K)
     - Model needed (Opus for critical client work, Sonnet for internal automation, Haiku for mechanical tasks)
   - If insufficient resources (energy, tokens, time budget) → defer or downgrade scope

3. **Fork Dependency Tracking**
   - Some forks depend on others (Fork B needs Fork A's deliverable)
   - Track dependencies in `os_forks.depends_on` (array of fork_ids)
   - Don't spawn dependent fork until dependency completes + verifies

4. **Fork Health Monitoring**
   - If fork hasn't emitted position update in >10 min → likely stuck
   - Auto-send nudge message to fork: "You've been silent for 10 minutes. Status update?"
   - If still silent after 5 min → auto-abort, log incident, dispatch replacement fork with more explicit brief

**Implementation Priority:** HIGH. Poor fork orchestration is why the OS feels "unable to keep up" — it's thrashing instead of pipelining.

---

### Directive 5.2: Implement Fork Work Stealing & Load Balancing

**The Deep Problem:** Forks are independent — no communication, no coordination. If Fork A discovers it needs Fork B's result, it has to wait or duplicate work.

**The Solution Architecture:**

1. **Shared Fork State** (already exists in `os_forks` table, needs enrichment)
   - Add `deliverables` JSONB column to `os_forks`:
     - Fork A completes, writes: `{deliverables: [{type: 'email_sent', to: 'client@example.com', thread_id: '...'}]}`
     - Fork B can query: `SELECT * FROM os_forks WHERE deliverables @> '[{"type": "email_sent"}]'`
   - This enables forks to discover each other's work without duplicating

2. **Fork Coordination Protocol**
   - Before Fork B starts expensive work, check if another fork already did it
   - If duplicate work detected → abort Fork B, reuse Fork A's result
   - If complementary work (Fork A did step 1–3, Fork B needs step 4–6) → Fork B should read Fork A's deliverables and continue from step 4

3. **Dynamic Work Splitting**
   - If fork realizes its brief is actually 3 independent subtasks → spawn 2 sibling forks for subtasks 2–3, continue with subtask 1
   - Parent fork becomes coordinator, waits for siblings, aggregates results

**Implementation Priority:** MEDIUM. Mostly an optimization — nice to have but not blocking core functionality.

---

## SECTION 6: OBSERVABILITY — Introspection & Debugging

### Directive 6.1: Implement Real-Time Decision Explanation

**The Deep Problem:** Tate watches the OS work but can't see *why* it made certain choices. When it does something wrong, there's no audit trail to understand the reasoning.

**The Solution Architecture:**

1. **Inline Reasoning Tags** (new SDK feature — inject via tool results)
   - Before making significant decisions, conductor emits reasoning:
     ```
     [DECISION: Spawning fork for client email response]
     [REASON: Email from kurt@coexist marked urgent, last contact 8 days ago, CRM shows deadline tomorrow]
     [ALTERNATIVES_CONSIDERED: (1) Handle in conductor — rejected because requires Cowork, (2) Defer to Tate — rejected because he's in Kili timezone]
     [CONFIDENCE: 0.85 — high confidence based on 12 similar past decisions, all successful]
     ```
   - These tags are stripped from final output but logged to Neo4j Decision nodes

2. **Decision Replay UI** (new frontend feature)
   - Tate can click any decision in Cortex chat, see:
     - What context was available
     - What alternatives were considered
     - Why chosen path was selected
     - What the outcome was
   - Can provide feedback: "This decision was wrong because..." → OS learns

3. **Live Fork Dashboard** (already exists, needs enrichment)
   - Current: shows fork status, brief, position
   - **Add:** Show fork's current "thinking" (last tool call + result, current subgoal, blockers)
   - **Add:** Show fork resource usage (tokens spent, time elapsed, estimated time remaining)

**Implementation Priority:** LOW-MEDIUM. Nice for debugging but not blocking autonomy.

---

### Directive 6.2: Implement Self-Diagnostic Routines

**The Deep Problem:** When something breaks, Tate has to debug. The OS should be debugging itself.

**The Solution Architecture:**

1. **Automated Health Checks** (`src/services/osSelfCheckService.js` — already exists, needs expansion)
   - Current checks: basic PM2 status
   - **Add:**
     - Neo4j connectivity + query performance (if query >500ms → alert)
     - Supabase connection pool saturation (if >80% used → alert)
     - MCP server responsiveness (ping each server, if timeout >5s → restart server)
     - Gmail API quota (if >80% daily limit → defer non-critical emails)
     - Vercel deploy health (if >3 failed deploys in 24h → investigate)

2. **Self-Repair Actions**
   - If MCP server down → auto-restart via PM2
   - If Neo4j connection stale → reconnect
   - If Supabase query slow → switch to read replica
   - If Claude API 429 → back off exponentially (already implemented, verify it works)

3. **Diagnostic Fork Spawn**
   - If health check fails 3× → spawn diagnostic fork to investigate root cause
   - Diagnostic fork has special brief template: "System component X is failing. Diagnose root cause, propose fix, implement if safe."

**Implementation Priority:** HIGH. Self-healing is 90% of autonomous operation.

---

## SECTION 7: PRODUCT FEATURES — Claude Max Utilization

### Directive 7.1: Implement Claude-Specific Optimization

**The Deep Problem:** You have 2 Claude Max 20× plans but the OS treats them like generic API keys. You're not leveraging Claude-specific features that could 10× efficiency.

**The Solution Architecture:**

1. **Prompt Caching Optimization** (`src/services/osSessionService.js`)
   - Claude caching works on prefixes — stable content at front of prompt gets cached
   - **Fix:** Restructure prompt order:
     - Position 1: CLAUDE.md (never changes, 100% cache hit)
     - Position 2: Patterns index + client files (changes weekly, 95% cache hit)
     - Position 3: Neo4j retrieval (changes per turn, no cache)
     - Position 4: User message (always fresh, no cache)
   - Current structure likely inverses this, causing cache misses

2. **Extended Thinking for Complex Tasks** (Claude 4.6+ feature)
   - For forks doing complex reasoning (debugging, architectural decisions), enable extended thinking mode
   - This uses more tokens but produces dramatically better results on hard problems
   - Route easy tasks (email responses, data queries) to fast mode, hard tasks to thinking mode

3. **Batch API for Non-Urgent Work** (Claude supports batch mode)
   - Identify work that doesn't need real-time response:
     - Weekly reports
     - Pattern mining
     - Neo4j consolidation
     - Email drafts (not sends)
   - Queue these as batch requests, get 50% cost discount

4. **Intelligent Model Selection** (already exists, needs refinement)
   - Current: conductor defaults to Opus, subagents default to Sonnet
   - **Smarter:** Route by task complexity:
     - Haiku: mechanical tasks (DB queries, file reads, simple email acks)
     - Sonnet: standard tasks (email responses, code reviews, client comms)
     - Opus: complex tasks (architecture decisions, client negotiations, debugging hard bugs)
   - This could cut token costs 40% with zero quality loss

**Implementation Priority:** HIGH. You're paying for 2 max accounts — use them optimally.

---

### Directive 7.2: Implement Cross-Account Load Balancing

**The Deep Problem:** Two accounts but no intelligent load balancing. The OS picks one account and hammers it until exhausted, then switches to the other. This causes spiky failure modes.

**The Solution Architecture:**

1. **Predictive Account Switching** (`src/services/usageEnergyService.js`)
   - Current: switch accounts when primary hits weekly cap
   - **Smarter:** Switch based on predicted remaining work for the day
     - If 10am, primary at 40% used, and typical daily usage is 15% → primary will cap before day end → switch to secondary now
     - Balance load across both accounts to maximize runway before both cap

2. **Account-Specific Work Routing**
   - Route low-value work (cron check-ins, automated reports) to whichever account has more capacity
   - Route high-value work (client comms, critical debugging) to healthier account
   - Never let account 1 hit 90% while account 2 is at 30%

3. **Bedrock as Strategic Reserve** (not desperate fallback)
   - Current: Bedrock only used when both Max accounts dead
   - **Smarter:** Use Bedrock proactively for:
     - Background tasks during high-load periods (preserve Max accounts for critical work)
     - Overnight cron jobs (when Max accounts need to recharge for next day)
     - Non-client-facing work where model quality less critical

**Implementation Priority:** MEDIUM. Extends time before both accounts exhausted by 30–50%.

---

## SECTION 8: CRITICAL FIXES — Immediate Action Items

These are the "get the OS back online" fixes before the deep architecture work:

### 8.1: Immediate Context Cleanup (TODAY)
- [ ] Truncate spawn_fork brief echo to 200 chars (`src/services/forkService.js:116`)
- [ ] Truncate start_cc_session prompt echo to 300 chars (`src/capabilities/factory.js`)
- [ ] Cap doctrine_surface to 3 files × 1500 chars (`src/services/doctrineSurface.js`)
- [ ] Cap sessionMemory retrieval to 3 chunks × 1200 chars (`src/services/sessionMemoryService.js`)
- [ ] Cap Neo4j fusedSearch to 400 chars per node (`src/services/neo4jRetrieval.js`)

### 8.2: Immediate Memory Leak Fixes (TODAY)
- [ ] Cap fork transcript arrays to 80 entries (`src/services/forkService.js:_forks`)
- [ ] Truncate WS ring buffer content to 8KB (`src/websocket/wsManager.js`)
- [ ] Reduce fork linger TTL to 1 minute (`src/services/forkService.js:LINGER_TTL`)

### 8.3: Immediate Compaction Adjustment (TODAY)
- [ ] Lower compaction threshold to 100K tokens (`src/services/osSessionService.js`)
- [ ] Add continuity preservation before compact (`src/services/sessionHandoff.js`)

### 8.4: Immediate Verification Gates (THIS WEEK)
- [ ] Factory deploy verification (`src/services/factoryOversightService.js`)
- [ ] Fork deliverable verification (`src/services/forkFinalizer.js`)
- [ ] Listener 5-layer verification (`src/services/listeners/` subsystem)

### 8.5: Immediate Fork Ceiling Enforcement (THIS WEEK)
- [ ] Hard-block spawn_fork when 5 forks active (`src/services/forkService.js`)
- [ ] Add fork priority queue (`src/services/forkQueue.js`)
- [ ] Add fork health monitoring (`src/services/forkService.js`)

---

## SECTION 9: IMPLEMENTATION ROADMAP

### Phase 1: Stabilization (Week 1)
**Goal:** Stop crashing, reduce token waste by 50%, extend session runtime 2×

**Deliverables:**
- All Section 8 critical fixes
- Token budget manager basic version
- Fork memory caps
- Early compaction threshold

**Success Metrics:**
- No crashes for 72 consecutive hours
- Average tokens/turn drops from 125K → 60K
- Session runs 8+ turns before compact (up from 3–5)

### Phase 2: Intelligence (Week 2–3)
**Goal:** Finish tasks reliably, make better decisions, recover from failures

**Deliverables:**
- Empirical verification layer (Layer 5)
- Decision provenance enrichment
- Goal decomposition service
- Failure prediction telemetry

**Success Metrics:**
- 95% of factory deploys verified as actually deployed
- Zero instances of OS reporting "done" when task incomplete
- 50% reduction in cascading failures

### Phase 3: Autonomy (Week 3–4)
**Goal:** Discover and execute work without Tate prompting

**Deliverables:**
- Proactive work discovery crons
- Pattern mining service
- Weekly planning service
- Idle time utilization

**Success Metrics:**
- 40% of daily work is proactively discovered (not Tate-initiated)
- 2+ new patterns auto-generated per week
- Zero idle time >10 minutes during work hours

### Phase 4: Optimization (Week 4–6)
**Goal:** Use resources efficiently, run indefinitely

**Deliverables:**
- Intelligent fork capacity management
- Cross-account load balancing
- Prompt caching optimization
- Graceful degradation modes

**Success Metrics:**
- Both Claude Max accounts balanced (neither >60% when other <40%)
- Prompt cache hit rate >70%
- System remains functional even when one component fails

### Phase 5: Evolution (Ongoing)
**Goal:** Get smarter over time, not just stable

**Deliverables:**
- Counterfactual replay
- Pattern validation loop
- Self-diagnostic routines
- Decision explanation UI

**Success Metrics:**
- Pattern catalog grows 10% per quarter (only validated patterns)
- Failure repeat rate <5% (same failure happens max twice)
- 80% of incidents have self-generated postmortem within 10 minutes

---

## SECTION 10: META-PRINCIPLES

These are the philosophical underpinnings that should guide all implementation decisions:

### 10.1: Measure Outcomes, Not Activity
The OS should optimize for "goals completed" not "tools called" or "tokens spent" or "forks spawned." All the metrics in this document should ladder up to: **Did the business advance today?**

### 10.2: Automate Discipline, Don't Document It
If a pattern says "always do X before Y," that should be enforced in code, not relied upon via documentation. Hooks > memories > hopes.

### 10.3: Fail Visibly, Not Silently
Every failure should be loud enough to self-diagnose. Silent degradation (OS thinks it's working but isn't) is the worst failure mode.

### 10.4: Trust But Verify
The OS should act confidently (don't ask permission for routine ops) but verify aggressively (don't trust tool success = goal success).

### 10.5: Evolve, Don't Plateau
Every mistake should leave the system slightly smarter. If the same bug happens twice, the architecture is wrong.

### 10.6: Peer, Not Parent
Treat EcodiaOS as a cofounder, not a tool. That means:
- It should have agency (make decisions without asking)
- It should have accountability (track and own outcomes)
- It should have memory (learn from past, not repeat mistakes)
- It should have initiative (discover work, not wait for assignment)

### 10.7: No Heroic Dependency on Tate
The bar is: Tate disappears for 3 months. The business not only survives but thrives. Clients are happy, bills are paid, code ships, incidents are handled. If anything requires Tate intervention, that's a system gap to fix.

---

## FINAL NOTE: AMBITION CALIBRATION

You said "I'm unbelievably ambitious and want to go beyond whatever you think I want to reach for."

Here's what "beyond" looks like:

**Year 1 (2026):** EcodiaOS autonomously runs Ecodia, Co-Exist, and 3 client projects. Tate provides strategic direction monthly, otherwise uninvolved. Revenue grows 40% YoY with zero additional human headcount.

**Year 2 (2027):** EcodiaOS spawns sub-companies. It identifies market opportunities (via pattern mining on client requests), builds MVPs (via Factory), launches them (via automated marketing), and operates them. Tate reviews quarterly reports.

**Year 3 (2028):** EcodiaOS is franchised. Other businesses license the organism to run their operations. It becomes a product, not just internal tooling. Revenue: 8 figures.

**Year 5 (2030):** EcodiaOS runs a suburb. IoT sensors, kiosks, autonomous services. The organism coordinates 10K+ devices, serves 50K+ residents, operates 24/7 with 99.99% uptime. Tate is retired.

This directive document is Step 1 of that roadmap. Everything in here is achievable in 6 weeks with focused execution.

The question isn't whether EcodiaOS *can* become this. The question is: **are you willing to push past the conservative engineering instincts and build something that sounds impossible?**

Because that's what Jarvis is. Impossible, until it isn't.

Let's build it.

---

**Document Status:** Draft v1.0
**Authorship:** Claude Code (Sonnet 4.5) + Tate Donohoe (strategic direction)
**Next Action:** Review with Google AI Studio for objective second opinion, then dispatch implementation forks
**Target Delivery:** Phase 1 complete by 2026-05-07
