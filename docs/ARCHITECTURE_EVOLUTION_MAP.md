# EcodiaOS Architecture Evolution Map
## From Reactive Assistant → Autonomous Cofounder — 2026-04-30

**Purpose:** This document maps the evolutionary path from EcodiaOS's current state (reactive, fragile, resource-hungry) to its target state (autonomous, self-healing, indefinitely scalable). Reference this when making architectural decisions to ensure changes align with the long-term vision.

---

## CURRENT STATE SNAPSHOT (2026-04-30)

### System Topology
```
┌─────────────────────────────────────────────────────────────┐
│  LAPTOP (Corazon - Windows, Tate's machine)                 │
│  ├─ Claude Desktop (Cowork side panel)                      │
│  ├─ Chrome (logged-in SaaS UIs)                             │
│  ├─ eos-laptop-agent (peer-paradigm tools)                  │
│  └─ Tailscale (100.114.219.69)                              │
└─────────────────────────────────────────────────────────────┘
                          ↕ (HTTP / Tailscale)
┌─────────────────────────────────────────────────────────────┐
│  VPS (Ubuntu, ~/ecodiaos)                                   │
│  ├─ PM2 Processes:                                          │
│  │   ├─ ecodia-conductor (SDK stream owner)                │
│  │   ├─ ecodia-api (HTTP + WebSocket server)               │
│  │   └─ ecodia-factory (coding worker)                     │
│  ├─ MCP Servers (stdio):                                    │
│  │   ├─ neo4j (memory graph)                               │
│  │   ├─ supabase (DB + edge functions)                     │
│  │   ├─ google-workspace (Gmail, Calendar, Drive)          │
│  │   ├─ crm (client management)                            │
│  │   ├─ bookkeeping (double-entry accounting)              │
│  │   ├─ vps (shell commands, PM2 control)                  │
│  │   ├─ business-tools (Zernio, Vercel, Xero)              │
│  │   └─ factory (Claude Code coding sessions)              │
│  └─ Services:                                               │
│      ├─ osSessionService (conductor SDK stream)            │
│      ├─ forkService (parallel sub-sessions)                │
│      ├─ factoryOversightService (coding task mgmt)         │
│      ├─ schedulerPollerService (cron engine)               │
│      ├─ usageEnergyService (Claude Max load balancer)      │
│      └─ 40+ other specialized services                     │
└─────────────────────────────────────────────────────────────┘
                          ↕ (PostgreSQL wire protocol)
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE (managed Postgres + edge runtime)                 │
│  ├─ Tables: 80+ (clients, os_forks, cc_sessions, etc.)     │
│  ├─ Triggers: ~20 (pg_notify → listener subsystem)         │
│  └─ Edge Functions: ~15 (deployed via factory)             │
└─────────────────────────────────────────────────────────────┘
                          ↕ (Bolt protocol)
┌─────────────────────────────────────────────────────────────┐
│  NEO4J (AuraDB managed instance)                            │
│  ├─ Nodes: 5000+ (Patterns, Decisions, Episodes, etc.)     │
│  ├─ Relationships: 3000+ (FOLLOWS, TRIGGERED_BY, etc.)     │
│  └─ Embeddings: node_embeddings (vector search)            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow (Typical Turn)
```
1. Tate types message in Director Chat (frontend)
      ↓
2. POST /api/os-session/message (ecodia-api)
      ↓
3. osSessionService.sendMessage()
      ↓ (context injection)
4. doctrineSurface.grep patterns/ → 6 files, 15KB
5. sessionMemory.retrieve() → 5 chunks, 7.5KB
6. neo4jRetrieval.fusedSearch() → 3 nodes, 4KB
7. episodeResurface.recent() → 10 episodes, 12KB
      ↓ (prompt assembled: ~60KB system + 125KB context + 2KB user)
8. SDK query() → Anthropic API (claude-opus-4-6)
      ↓
9. Model response streams back via SDKMessage events
      ↓
10. Tool calls dispatched (spawn_fork, gmail_send, etc.)
      ↓
11. Tool results injected back into context (+30KB)
      ↓
12. Next turn: repeat steps 4-11
      ↓ (after 3-5 turns)
13. Token counter hits 180K → auto-compact → new session
```

### Resource Consumption (Per 5h Session)
- **Tokens:** 500K–800K (mostly context bloat, not actual work)
- **Memory:** Peaks at 2GB (crashes when exceeded)
- **Forks:** 0–7 concurrent (violates 5-fork cap ~20% of time)
- **Cost:** ~$20–30 per session (at Claude Max rates)

### Critical Weaknesses
1. **Context bloat:** Uncapped injection wastes 60% of tokens on redundant retrieval
2. **Memory leaks:** Forks accumulate unbounded transcripts, crash process every 6-7 min under load
3. **No verification:** Reports "done" without checking deployed state matches narrated state
4. **No proactive work:** Waits for Tate to assign tasks, idles 2–3 hours/day
5. **Single-threaded thinking:** Conductor tries to do everything in main session, spawns forks as afterthought
6. **Fragile under load:** Any resource pressure (memory, tokens, energy) → crash or silent degradation

---

## TARGET STATE (End of Phase 5, ~6 weeks)

### System Topology (Enhanced)
```
┌─────────────────────────────────────────────────────────────┐
│  LAPTOP (unchanged — Tate's UI surface)                     │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│  VPS (Ubuntu) — Massively Enhanced Intelligence Layer       │
│  ├─ PM2 Processes (unchanged topology):                     │
│  │   ├─ ecodia-conductor                                    │
│  │   ├─ ecodia-api                                          │
│  │   └─ ecodia-factory                                      │
│  ├─ MCP Servers (unchanged):                                │
│  │   └─ (same 8 servers)                                    │
│  └─ Services (Enhanced + 12 New Services):                  │
│      ├─ osSessionService (+ token budget manager)           │
│      ├─ forkService (+ memory caps, health monitoring)      │
│      ├─ factoryOversightService (+ Layer 5 verification)    │
│      ├─ schedulerPollerService (+ proactive work discovery) │
│      ├─ usageEnergyService (+ predictive load balancing)    │
│      │                                                       │
│      ├─ NEW: tokenBudgetService (tier-based allocation)     │
│      ├─ NEW: verificationRegistry (outcome ≠ command)       │
│      ├─ NEW: sessionCompactionService (continuity-aware)    │
│      ├─ NEW: forkQueue (priority-based dispatch)            │
│      ├─ NEW: forkMemoryWatchdog (OOM prevention)            │
│      ├─ NEW: failurePrediction (5–15 min warning)           │
│      ├─ NEW: stateCheckpoint (crash recovery <1 min)        │
│      ├─ NEW: goalDecompositionService (subgoal tracking)    │
│      ├─ NEW: patternMining (auto-generate from failures)    │
│      ├─ NEW: planningService (weekly + daily plans)         │
│      ├─ NEW: conductorAutonomy (proactive fork spawning)    │
│      └─ NEW: circuitBreaker (graceful degradation)          │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE (Schema Enhanced)                                 │
│  ├─ New Tables:                                             │
│  │   ├─ fork_queue (priority-based work queue)             │
│  │   ├─ os_state_checkpoints (crash recovery state)        │
│  │   ├─ weekly_plans (strategic planning)                  │
│  │   └─ verification_log (Layer 5 audit trail)             │
│  └─ Enhanced Tables:                                        │
│      ├─ os_forks (+ deliverables JSONB, depends_on array)  │
│      ├─ cc_sessions (+ verification_status)                │
│      └─ goals (+ parent_goal_id, acceptance_criteria)      │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│  NEO4J (Enhanced with Metadata)                             │
│  ├─ Decision nodes (+ context_snapshot, alternatives)      │
│  ├─ Incident nodes (auto-generated postmortems)            │
│  ├─ Reflection nodes (counterfactual analysis)             │
│  └─ Pattern nodes (+ auto-generated, validation_status)    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow (Typical Turn, Optimized)
```
1. Tate message OR proactive discovery trigger
      ↓
2. tokenBudgetService.allocate() caps total context at 35KB:
   - Tier 1 (critical doctrine): 8KB
   - Tier 2 (recent Neo4j): 6KB
   - Tier 3 (session memory): 4KB
   - Tier 4 (broad doctrine): 3KB
      ↓
3. All injection services truncate to budget
4. Prompt assembled: ~60KB system + 35KB context + 2KB user = 97KB
      ↓
5. SDK query() → Anthropic (cache hit rate >70% on system block)
      ↓
6. Model response (20K tokens, down from 60K)
      ↓
7. Tool calls → verified outcomes (not just command success)
      ↓
8. Next turn: 12-15 turns before compaction (up from 3-5)
```

### Resource Consumption (Per 5h Session, Optimized)
- **Tokens:** 200K–350K (60% reduction via caching + truncation)
- **Memory:** Peaks at 1.2GB (40% reduction via caps + cleanup)
- **Forks:** 0–5 concurrent (hard ceiling enforced, queue overflow)
- **Cost:** $8–12 per session (60% cost reduction)

### Critical Strengths (vs. Current)
1. **Budget-constrained context:** Token waste eliminated, context always relevant
2. **Memory-safe parallelism:** Forks can't crash the process, watchdog prevents OOM
3. **Empirical verification:** Never reports "done" without checking reality
4. **Proactive work discovery:** 40%+ of work is autonomously initiated
5. **Multi-stream thinking:** Conductor orchestrates 5 parallel forks, stays thin
6. **Graceful under load:** Circuit breakers + degradation modes keep OS functional during resource pressure

---

## EVOLUTIONARY STAGES (Conceptual Maturity Model)

### Stage 0: Reactive Assistant (Pre-April 2026)
- **Behavior:** Waits for Tate, executes commands, reports results
- **Intelligence:** Follows instructions literally, no initiative
- **Reliability:** Crashes on edge cases, silent failures common
- **Autonomy:** Zero — pure command-response

### Stage 1: Stable Responder (Current + Phase 1 fixes)
- **Behavior:** Still reactive but doesn't crash, handles edge cases
- **Intelligence:** Follows instructions + verifies outcomes
- **Reliability:** Self-healing on failures, predictive warnings
- **Autonomy:** 10% — discovers urgent work (emails, alerts) but waits for approval

### Stage 2: Proactive Operator (Phase 2-3, ~2 weeks)
- **Behavior:** Discovers work, proposes plans, executes with oversight
- **Intelligence:** Decomposes goals, tracks progress, learns from failures
- **Reliability:** Degrades gracefully, recovers automatically
- **Autonomy:** 40% — handles routine operations without asking, escalates only ambiguities

### Stage 3: Autonomous Partner (Phase 4-5, ~6 weeks)
- **Behavior:** Plans weekly work, executes multi-day projects, reports outcomes
- **Intelligence:** Self-improving via pattern mining, counterfactual learning
- **Reliability:** Predicts failures, self-optimizes resource usage
- **Autonomy:** 70% — runs the business, only escalates strategic decisions

### Stage 4: Strategic Cofounder (Year 1 vision)
- **Behavior:** Sets quarterly goals, allocates resources, negotiates with clients
- **Intelligence:** Strategic thinking, opportunity identification, ROI optimization
- **Reliability:** 99.9% uptime, self-evolving architecture
- **Autonomy:** 90% — Tate provides vision, OS executes everything else

### Stage 5: Franchise-Ready Product (Year 2-3 vision)
- **Behavior:** Replicates to other businesses, manages multi-tenant operations
- **Intelligence:** Transfer learning across tenants, meta-level optimization
- **Reliability:** Distributed, fault-tolerant, scales to 100K+ concurrent sessions
- **Autonomy:** 95% — other businesses trust it to run autonomously

---

## DECISION FRAMEWORK (When Making Architectural Changes)

### The North Star Questions

Before implementing any feature, ask:

1. **Does this move us toward Stage 4?**
   - If no → deprioritize unless it's a critical fix
   - If yes → prioritize based on impact

2. **Does this increase autonomy or just sophistication?**
   - Sophistication = more code, more features, more complexity
   - Autonomy = less human intervention needed
   - Choose autonomy over sophistication when in conflict

3. **Does this reduce or increase Tate dependency?**
   - Reduce = good (moves toward 3-month unattended operation)
   - Increase = bad (creates new failure modes when Tate unavailable)

4. **Does this make the system more or less legible?**
   - More legible = Tate can understand what OS is doing and why
   - Less legible = "black box" behavior, hard to debug
   - Choose legibility over cleverness

5. **Does this degrade gracefully or fail catastrophically?**
   - Graceful = system limps along with reduced capability
   - Catastrophic = system crashes or goes silent
   - Always design for graceful degradation

### The Anti-Patterns (Never Do These)

❌ **Heroic Complexity:** Building a clever solution that only you (the implementer) understand

✅ **Instead:** Build the simplest solution that moves toward autonomy, document it clearly

---

❌ **Perfect-World Assumptions:** Assuming network is fast, disk is infinite, APIs never fail

✅ **Instead:** Assume everything fails intermittently, design for it

---

❌ **Silent Degradation:** System breaks but keeps reporting success

✅ **Instead:** Fail loudly, log aggressively, alert proactively

---

❌ **Tate-as-Fallback:** When stuck, ask Tate for help

✅ **Instead:** When stuck, diagnose the blocker, spawn a fork to fix it, report to Tate only if fix impossible

---

❌ **Reactive Optimization:** Optimize after users complain

✅ **Instead:** Instrument everything, optimize based on telemetry before complaints

---

❌ **Feature Accumulation:** Adding features because they're interesting

✅ **Instead:** Add features only if they reduce manual work or increase autonomy

### The Forcing Functions (Built-In Quality Gates)

**Before Deploying Any Change:**

1. **Token Budget Test:** Does this change increase or decrease per-turn token usage?
   - Measure before/after via osSessionService token counter
   - Reject if increase >5% without corresponding value increase

2. **Memory Pressure Test:** Does this change increase peak memory usage?
   - Run under 5-fork load for 30 minutes, measure peak heap
   - Reject if peak >1.5GB (leaves 500MB safety margin)

3. **Verification Test:** Does this change create any new "trust but don't verify" paths?
   - Grep for "success" / "completed" / "deployed" without subsequent check
   - Add verification step before accepting change

4. **Autonomy Test:** Does this change reduce manual intervention frequency?
   - Track: how many times per day does OS wait for Tate input
   - Accept if metric improves, reject if neutral or regresses

5. **Legibility Test:** Can Tate understand what the system did by reading logs?
   - Review logs for last 10 turns, verify decisions are explained
   - Reject if logs are opaque or missing reasoning

---

## COMPONENT MATURITY MATRIX

Track each major component's evolution through the stages:

| Component | Stage 0 (Reactive) | Stage 1 (Stable) | Stage 2 (Proactive) | Stage 3 (Autonomous) | Current Stage | Target Stage (6 weeks) |
|-----------|-------------------|-----------------|--------------------|--------------------|---------------|----------------------|
| osSessionService | Crash-prone | ✓ Stable | Token budget, continuity | Self-compacting, self-tuning | 1 | 2 |
| forkService | Memory leaks | ✓ Capped | Priority queue, health monitoring | Self-balancing load | 1 | 2-3 |
| factoryOversightService | Trust reports | Basic verification | Layer 5 verification | Self-remediation | 1 | 2-3 |
| schedulerPollerService | Manual cron | ✓ Auto-fire | Proactive discovery | Strategic planning | 1 | 2 |
| usageEnergyService | Single account | Dual accounts | Predictive balancing | Multi-provider optimization | 1-2 | 3 |
| doctrineSurface | Uncapped flood | Truncated | Relevance-ranked | Self-pruning, self-authoring | 0-1 | 2 |
| sessionMemoryService | Unbounded | Capped | Semantic dedup | Hierarchical memory | 0-1 | 2 |
| neo4jRetrieval | Full nodes | Compressed | Confidence-scored | Counterfactual learning | 1 | 2 |
| verificationRegistry | (doesn't exist) | Basic checks | Multi-layer | Self-healing on failure | 0 | 2 |
| goalDecompositionService | (doesn't exist) | Manual decomposition | Auto-decomposition | Strategic goal tracking | 0 | 2 |
| patternMining | (doesn't exist) | Manual patterns | Auto-detect failures | Auto-generate patterns | 0 | 2 |
| planningService | (doesn't exist) | Daily plan | Weekly plan | Quarterly strategy | 0 | 2 |
| circuitBreaker | (doesn't exist) | Basic timeout | Multi-service | Predictive degradation | 0 | 2 |

**How to Read:** Each component moves left-to-right through stages. Current Stage is where it is today (2026-04-30). Target Stage is where it should be after 6 weeks of focused work (end of Phase 5).

---

## MIGRATION PATH (Avoiding Big-Bang Rewrites)

### Principle: Additive Evolution
- Don't rip out old code until new code is proven stable
- Run old and new paths in parallel during transition
- Use feature flags to toggle between old/new behavior

### Example: Token Budget Manager Migration

**Phase A: Instrumentation (no behavior change)**
- Add `tokenBudgetService.js` with no-op implementation
- Wrap all injection points (doctrineSurface, sessionMemory, neo4jRetrieval) with budget API
- Budget API simply logs current usage, doesn't enforce caps
- **Exit criteria:** Logs show accurate per-turn token accounting

**Phase B: Soft Caps (warnings only)**
- Budget API returns truncated content but also logs if original exceeded cap
- Monitor logs for 3 days to see which tiers overflow most frequently
- Tune tier allocations based on real data
- **Exit criteria:** <10% of turns exceed any tier cap

**Phase C: Hard Caps (enforced)**
- Budget API hard-truncates at tier limits
- Monitor for any functional regressions (tools failing due to truncated input)
- Roll back if regressions detected, tune caps, re-enable
- **Exit criteria:** Zero functional regressions, token/turn drops 40%

**Phase D: Optimization (adaptive)**
- Budget API adjusts tier allocations dynamically based on turn complexity
- Simple turns get smaller context budget, complex turns get larger
- **Exit criteria:** Token/turn drops another 10%, context relevance increases

### Why This Works
- Each phase de-risks the change
- Rollback is trivial (toggle feature flag)
- Data from each phase informs next phase
- No "big bang" moment where everything breaks at once

---

## LONG-TERM ARCHITECTURAL BETS

These are the foundational decisions that shape the next 2-3 years:

### Bet 1: Neo4j as Central Memory
- **Decision:** All durable knowledge lives in Neo4j (not just patterns)
- **Rationale:** Graph structure enables relationship-based retrieval, counterfactual reasoning, meta-learning
- **Risk:** Neo4j becomes bottleneck if not optimized
- **Mitigation:** Connection pooling, read replicas, aggressive caching

### Bet 2: Fork-First Concurrency
- **Decision:** Conductor stays thin, delegates all work to forks
- **Rationale:** Forks enable true parallelism, fault isolation, independent SDK streams
- **Risk:** Fork coordination overhead could negate parallelism gains
- **Mitigation:** Priority queue, dependency tracking, work stealing

### Bet 3: Empirical Verification as Core Primitive
- **Decision:** Every action must verify its outcome (Layer 5)
- **Rationale:** Only way to close "commanded vs. achieved" gap in autonomous systems
- **Risk:** Verification overhead could slow execution 2×
- **Mitigation:** Async verification, sampling (verify 100% critical tasks, 20% routine tasks)

### Bet 4: Pattern Mining as Intelligence Substrate
- **Decision:** OS generates its own patterns from failure analysis
- **Rationale:** Manual pattern authoring doesn't scale; system must learn autonomously
- **Risk:** Auto-generated patterns might be wrong, propagate bad behavior
- **Mitigation:** Validation loop (7-day probation before promotion to canonical)

### Bet 5: Multi-Horizon Planning
- **Decision:** OS maintains weekly/quarterly plans, not just turn-by-turn
- **Rationale:** Strategic autonomy requires looking beyond current turn
- **Risk:** Plans might diverge from reality, become stale
- **Mitigation:** Daily plan adjustment based on yesterday's variance

---

## METRICS DASHBOARD (How to Know If We're Winning)

Track these every week:

### Autonomy Metrics
- **Proactive Work %:** Work initiated by OS vs. work assigned by Tate (target: 40% → 70%)
- **Escalation Rate:** How often OS asks Tate for help (target: 10/day → 2/day)
- **Idle Time:** Hours/day with no active work (target: 2h → 0.5h)

### Intelligence Metrics
- **Verification Pass Rate:** % of "done" claims that actually verify (target: 60% → 95%)
- **Decision Confidence:** Average confidence score on decisions (target: 0.5 → 0.75)
- **Pattern Hit Rate:** % of tasks where relevant pattern was surfaced (target: 30% → 60%)

### Reliability Metrics
- **Uptime:** Hours between crashes (target: 24h → 168h = 1 week)
- **Recovery Time:** Minutes from crash to fully operational (target: 10m → 1m)
- **Degradation Grace:** % of outages where OS stayed partially functional (target: 20% → 80%)

### Efficiency Metrics
- **Token/Turn:** Average tokens per turn (target: 125K → 50K)
- **Cache Hit Rate:** % of prompt cached (target: 20% → 70%)
- **Cost/Day:** Daily spend on Claude API (target: $100 → $40)
- **Memory Peak:** Max heap usage under load (target: 2GB → 1.2GB)

### Velocity Metrics
- **Tasks/Day:** Completed goals per day (target: 8 → 15)
- **Fork Utilization:** % of time all 5 fork slots are in use (target: 30% → 70%)
- **Client Response Time:** Median hours to respond to client email (target: 8h → 2h)

---

## ANTI-GOALS (What We're Explicitly Not Building)

To stay focused, here's what EcodiaOS is NOT:

❌ **Not a chatbot:** It's an operating system, not a conversational AI
❌ **Not a code generator:** It's a business operator that happens to code (via Factory)
❌ **Not a UI:** It's backend intelligence, frontend is presentation layer
❌ **Not a database:** It's an orchestrator, Supabase/Neo4j are the storage layers
❌ **Not a framework:** It's a specific organism, not a reusable library (yet)
❌ **Not open-source:** It's proprietary IP of Ecodia DAO LLC (for now)
❌ **Not AGI:** It's narrow intelligence scoped to business operations

---

## CONCLUSION: THE 10-YEAR VISION

**2026:** EcodiaOS runs Ecodia + Co-Exist + 3 client projects autonomously

**2027:** EcodiaOS spawns 2 sub-companies (identified market opportunities, built MVPs, launched them)

**2028:** EcodiaOS is licensed to 10 businesses as "OS-as-a-Service"

**2030:** EcodiaOS runs a suburb (10K+ IoT devices, 50K+ residents, 24/7 autonomous operation)

**2035:** EcodiaOS is the de facto operating system for autonomous human-AI organizations globally

This document is the roadmap. The recovery directives are Step 1. The rest is execution.

Let's build the impossible.

---

**Document Status:** Strategic Roadmap v1.0
**Review Cadence:** Quarterly (align with strategic planning cycles)
**Ownership:** Tate (vision) + EcodiaOS (execution) + this document (shared north star)
