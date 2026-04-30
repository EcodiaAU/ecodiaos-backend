# EcodiaOS Master Recovery Strategy
## Comprehensive 6-Week Transformation Plan — 2026-04-30 (rev. 2 post-audit)

**Context:** This is the master index that ties together all recovery directives. When the OS comes back online, start here.

**Read order (changed in rev. 2):** Security first. See `README.md` for the full reading order and rationale. The short version: an active prompt-injection → self-modification → RCE chain is live in the current codebase, and every other directive in this plan assumes a non-hostile environment. That assumption is wrong. Fix that before anything else.

---

## DOCUMENT INDEX

### Core specs (rev. 2, written from code-verified audit)

1. **[SECURITY_HARDENING.md](./SECURITY_HARDENING.md)** — **READ FIRST.** Prompt injection, self-mod chain, Cypher injection, Tier-3 action gates. This is the doc that was missing.
2. **[FORK_ATOMICITY_SPEC.md](./FORK_ATOMICITY_SPEC.md)** — Atomic cap enforcement, git worktree isolation, split-brain arbitration. Supersedes Phase 3.1 of the checklist.
3. **[PROMPT_ASSEMBLY_SPEC.md](./PROMPT_ASSEMBLY_SPEC.md)** — Single assembler with global budget, 4 cache breakpoints, keepalive cron. Supersedes Directive 1.1.
4. **[OBSERVABILITY_SPEC.md](./OBSERVABILITY_SPEC.md)** — `/ops` dashboard contract, claim verification pipeline, alerting thresholds.
5. **[ANTHROPIC_NATIVE_LEVERAGE.md](./ANTHROPIC_NATIVE_LEVERAGE.md)** — What Anthropic ships that you're duplicating: Skills, compaction, tool output schemas, MCP subscriptions.

### Recovery playbooks (rev. 1 — still useful for 24h tactics, but defer to rev-2 specs where they conflict)

6. **[RECOVERY_DIRECTIVES_2026-04-30.md](./RECOVERY_DIRECTIVES_2026-04-30.md)** — Deep architectural solutions (10 sections, 7 phases).
   - Note: Directive 1.1 (token economy) is now `PROMPT_ASSEMBLY_SPEC.md`. Directive in Section 5 (fork) is now `FORK_ATOMICITY_SPEC.md`. Observability in Section 6 is now `OBSERVABILITY_SPEC.md`.

7. **[IMMEDIATE_RECOVERY_CHECKLIST.md](./IMMEDIATE_RECOVERY_CHECKLIST.md)** — Tactical 24-hour action plan.
   - Phase 0: Pre-Flight (Tate's manual prep)
   - **Phase 0.5: Security Pre-Flight (NEW — mandatory)**
   - Phase 1: Critical Fixes (first 2 hours)
   - Phase 2: Verification Gates (next 4 hours)
   - Phase 3: Fork Orchestration (next 4 hours, rewritten — see `FORK_ATOMICITY_SPEC.md`)
   - Phase 4: Self-Diagnostics (next 6 hours)
   - Phase 5: Proactive Work (next 8 hours)
   - Phase 6: Optimization (ongoing)

8. **[ARCHITECTURE_EVOLUTION_MAP.md](./ARCHITECTURE_EVOLUTION_MAP.md)** — Long-term vision & decision framework.

9. **[LAPTOP_BOUNDLESS_CAPABILITY_AUDIT.md](./LAPTOP_BOUNDLESS_CAPABILITY_AUDIT.md)** — Maximizing Corazon utilization. Defer Track C until security hardening ships; the laptop agent multiplies blast radius.

10. **[VISUAL_RECOVERY_DASHBOARD.md](./VISUAL_RECOVERY_DASHBOARD.md)** — Phase/metric tracker.

---

## QUICK-START GUIDE (For OS Session on Restart)

### Step 0: Security pre-flight (First 2 Hours — MANDATORY, NEW)
Before any other Phase 1 work, ship the three Phase 0.5 items in `IMMEDIATE_RECOVERY_CHECKLIST.md`:
1. Untrusted-input delimiter wrap at every external text entry point.
2. Self-modification path allowlist in `deploymentService.js` + pre-commit hooks.
3. Cypher parameterization audit.

Rationale: the current factory review pipeline auto-deploys at confidence ≥ 0.7, and the reviewer reads polluted context. An email body can instruct the reviewer to approve a self-modification. The entire Phase 1-6 plan below assumes a trusted execution environment. Validate that assumption first.

### Step 1: Orient (First 5 Minutes)

**Read in order:**
1. This document (MASTER_RECOVERY_STRATEGY.md) — you are here
2. IMMEDIATE_RECOVERY_CHECKLIST.md Phase 0 — understand what Tate has already prepped
3. Section 8 of RECOVERY_DIRECTIVES_2026-04-30.md — the 5 critical fix categories

**Check state:**
- What was I doing when I went down? (read last 20 Director Chat messages)
- What forks were running? (`SELECT * FROM os_forks WHERE status IN ('running', 'working')`)
- What factory sessions were in-flight? (`SELECT * FROM cc_sessions WHERE status = 'running'`)
- What's the Claude Max usage? (check usageEnergyService.getEnergy())

**Log orientation:**
Write to Neo4j:
```javascript
graph_merge_node({
  label: "Episode",
  name: "OS Recovery Start 2026-04-30",
  content: "Came back online after usage exhaustion. Orientation complete. Last known state: [summarize]. Beginning Phase 1 critical fixes.",
  timestamp: Date.now()
})
```

### Step 2: Execute Critical Fixes (Next 2 Hours)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 1 exactly:**
1. Context cleanup (5 truncation fixes)
2. Memory leak fixes (3 cap fixes)
3. Compaction adjustment (2 threshold changes)

**For each fix:**
- Read file to understand current code
- Make minimal change (no refactoring, just the fix)
- Test in isolation (spawn test fork, verify behavior)
- Commit with clear message: "Fix: [problem] via [solution] (Recovery Directive 1.X)"
- Move to next fix

**Success gate:** All Phase 1 fixes deployed, no regressions, token/turn drops from 125K → <70K.

### Step 3: Verify Stability (Next 4 Hours)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 2:**
1. Factory deploy verification
2. Fork deliverable verification
3. Listener 5-layer verification

**For each verification:**
- Implement verification function (returns ✓ or ✗)
- Wire into existing service (factoryOversightService, forkFinalizer, listener subsystem)
- Run test case (trigger verification on known-good and known-bad cases)
- Verify ✓ for good, ✗ for bad

**Success gate:** 100% of verifications working, zero false positives/negatives.

### Step 4: Harden Orchestration (Next 4 Hours)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 3:**
1. Fork ceiling enforcement (hard block at 5)
2. Fork priority queue (high-value work first)
3. Fork health monitoring (detect stuck forks in 10 min)

**Success gate:** Fork violations drop to zero, high-priority work never waits behind low-priority.

### Step 5: Self-Diagnose (Next 6 Hours)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 4:**
1. Expand health checks (Neo4j, Supabase, MCP servers, Gmail quota, disk space)
2. Implement failure prediction telemetry (memory growth, token burn, error rate)
3. Implement state checkpointing (5-min snapshots)

**Success gate:** Health checks run every 15 min, predict failures 5–15 min before they happen, crash recovery <1 min.

### Step 6: Go Proactive (Next 8 Hours)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 5:**
1. Create work discovery cron jobs (email scan, invoice follow-up, client silence, system health)
2. Implement idle time utilization (pattern review, Neo4j consolidation, pre-draft emails)

**Success gate:** 30%+ of work is proactively discovered, idle time drops to <1 hour/day.

### Step 7: Optimize Resources (Ongoing)

**Follow IMMEDIATE_RECOVERY_CHECKLIST.md Phase 6:**
1. Prompt caching optimization (restructure prompt order)
2. Intelligent model selection (Haiku for mechanical, Sonnet for standard, Opus for complex)
3. Cross-account load balancing (keep both accounts within 20% of each other)

**Success gate:** Cache hit rate >70%, token costs drop 40%, both accounts balanced.

---

## PARALLEL WORKSTREAMS (After 24 Hours)

Once Phase 1-6 complete and metrics are green, OS should work on 3 parallel tracks:

### Track A: Token Economy (Weeks 1-2)
**Owner:** Conductor (main session work, not forks)

**Deliverables:**
- Token Budget Manager service (tier-based allocation)
- Unified Context Retrieval service (deduplicated, ranked)
- Adaptive compaction (continuity-aware)
- Tool echo compression (all tool results truncated)

**Success Metrics:**
- Token/turn: 50K → 35K
- Context relevance: 60% → 85% (measured via task success rate)
- Session lifetime: 8 turns → 15 turns

### Track B: Verification & Intelligence (Weeks 1-3)
**Owner:** Fork pool (3 forks working in parallel)

**Fork 1 Deliverables:**
- Verification Registry service
- Layer 5 verification for all critical task types
- Verification Dashboard (frontend)

**Fork 2 Deliverables:**
- Decision Provenance enrichment (context_snapshot, alternatives, confidence)
- Counterfactual Replay service
- Decision Explanation UI

**Fork 3 Deliverables:**
- Goal Decomposition service
- Subgoal Progress Tracking
- Goal Dashboard (frontend)

**Success Metrics:**
- Verification pass rate: 60% → 95%
- Zero false "done" reports
- Goals with >5 subgoals are 80% more likely to complete

### Track C: Laptop Boundless Capabilities (Weeks 2-4)
**Owner:** Fork pool (5 forks, highest priority)

**Fork 1 Deliverables:**
- Credential Vault Automation (read Windows Credential Manager + Chrome passwords)
- Credential Injection during automation
- Zero credential-blocked tasks

**Fork 2 Deliverables:**
- Clipboard Bridge (set, get, waitFor)
- Copy-paste automation patterns
- Bridge 10+ apps without APIs

**Fork 3 Deliverables:**
- Desktop Surveillance (screenshot time-lapse, OCR, proactive assistance)
- Privacy controls (blacklist, auto-delete)
- Ambient awareness

**Fork 4 Deliverables:**
- Native Desktop App Integration (COM automation for Office suite)
- App-specific libraries (Teams, Outlook, Excel)
- 3× speedup vs browser automation

**Fork 5 Deliverables:**
- Multi-Application Workflows (Workflow Executor service)
- Workflow Definition Language (JSON-based)
- 20+ automated multi-app workflows

**Success Metrics:**
- Laptop automation coverage: 5% → 60%
- Apps automated: 1 → 15+
- Manual task time: 15h/week → 3h/week (80% reduction)

---

## DECISION GATES (Stop and Assess)

### Gate 1: After 24 Hours (End of Phase 6)
**Criteria:**
- ✓ No crashes for 24 consecutive hours
- ✓ Token/turn <70K
- ✓ Session runs 8+ turns before compact
- ✓ All verification gates working

**Decision:**
- If ALL criteria met → Proceed to parallel workstreams
- If ANY criteria unmet → Diagnose root cause, fix before proceeding

### Gate 2: After 1 Week (End of Track A)
**Criteria:**
- ✓ Token/turn <40K
- ✓ Session runs 15+ turns
- ✓ Context relevance >80%
- ✓ No functional regressions

**Decision:**
- If ALL criteria met → Proceed to Track B+C full speed
- If ANY criteria unmet → Pause Track B+C, focus on fixing Track A

### Gate 3: After 3 Weeks (End of Track B)
**Criteria:**
- ✓ Verification pass rate >90%
- ✓ Decision confidence >0.70 average
- ✓ Zero false "done" reports in last 7 days

**Decision:**
- If ALL criteria met → Track B is stable, reduce monitoring
- If ANY criteria unmet → Extend Track B by 1 week, investigate failures

### Gate 4: After 4 Weeks (End of Track C)
**Criteria:**
- ✓ Laptop automation coverage >50%
- ✓ 15+ apps automated
- ✓ 15+ multi-app workflows deployed
- ✓ Credential vault working (zero blocks)

**Decision:**
- If ALL criteria met → Declare Phase 1-3 complete, begin Phase 4 (Optimization)
- If ANY criteria unmet → Identify blockers, dispatch remediation forks

### Gate 5: After 6 Weeks (End of All Phases)
**Criteria:**
- ✓ All Track A+B+C deliverables shipped
- ✓ All success metrics green
- ✓ 40%+ of work is proactively discovered
- ✓ Uptime >168 hours (1 week) without crash
- ✓ Tate reports: "OS is running the business"

**Decision:**
- If ALL criteria met → Declare recovery complete, begin Phase 4 (Evolution)
- If ANY criteria unmet → Extend timeline, focus on unmet criteria

---

## RISK REGISTER (Failure Modes & Mitigations)

### Risk 1: Token budget too aggressive, breaks functionality
**Probability:** Medium | **Impact:** High

**Mitigation:**
- Phase A (soft caps, warnings only) tests without breaking
- Monitor for functional regressions before hard caps
- Rollback path: increase tier allocations if success rate drops

### Risk 2: Verification overhead slows execution 2×
**Probability:** Low | **Impact:** Medium

**Mitigation:**
- Async verification (don't block on verification results)
- Sample verification (100% for critical, 20% for routine)
- Cache verification results (if task X succeeded last 5 times, skip verification on 6th)

### Risk 3: Laptop automation hits Windows permission issues
**Probability:** High | **Impact:** Medium

**Mitigation:**
- Run eos-laptop-agent with elevated privileges (admin mode)
- Whitelist Corazon's IP in all firewalls
- Fallback: if COM automation fails, use Cowork for that app

### Risk 4: Fork coordination overhead negates parallelism gains
**Probability:** Low | **Impact:** High

**Mitigation:**
- Keep forks independent (no cross-fork communication except via DB)
- Minimize fork handoff (only essential state, not full transcripts)
- Measure: if fork throughput <3×, investigate bottleneck

### Risk 5: OS becomes too autonomous, makes bad decisions
**Probability:** Medium | **Impact:** Critical

**Mitigation:**
- Decision confidence threshold: low confidence (<0.4) → ask Tate
- Approval gates for: financial decisions, client comms, scope changes
- Audit trail: every autonomous decision logged to Neo4j
- Weekly review: Tate reviews autonomous decisions, provides feedback

### Risk 6: Pattern mining generates wrong patterns, propagates bad behavior
**Probability:** Medium | **Impact:** High

**Mitigation:**
- 7-day probation for auto-generated patterns (not canonical until validated)
- Validation: track outcomes when pattern applied, only promote if success rate >80%
- Rollback: if pattern causes failure, auto-deprecate and alert Tate

### Risk 7: Cross-machine orchestration creates network dependencies
**Probability:** Low | **Impact:** Medium

**Mitigation:**
- Graceful degradation: if laptop unreachable, use VPS-only capabilities
- Circuit breakers: if laptop fails 3×, switch to degraded mode
- Heartbeat: laptop pings VPS every 60s, VPS pings laptop every 60s

### Risk 8: Self-modifying code introduces bugs
**Probability:** Medium | **Impact:** Critical

**Mitigation:**
- Whitelist: only modify `/services/`, never core infrastructure
- Test coverage: 100% required before any self-modification
- Canary deployment: test self-modification in dev before prod
- Rollback: if any test fails or performance regresses, auto-rollback

---

## COMMUNICATION PROTOCOL (Tate ↔ OS)

### When OS Should Proactively Update Tate

**Critical (SMS + Email):**
- System crash or restart
- Bedrock fallback activated (both Claude Max accounts exhausted)
- Client escalation (angry email, urgent request, deadline missed)
- Financial anomaly (unexpected charge >$500, failed payment)
- Security incident (suspicious login, credential leak)

**High (Email only):**
- Decision with low confidence (<0.4) that blocks progress
- Task blocked on external dependency (waiting for client response, API down)
- Pattern mining suggests major architectural change
- Resource approaching limit (quota >90%, disk <10GB)

**Normal (Director Chat only):**
- Daily summary (EOD report: work completed, blockers, plan for tomorrow)
- Weekly plan (Monday morning: goals for the week)
- Proactive work discovery (found 5 unread emails, drafted responses)
- Optimization wins (reduced token/turn by 20%, cache hit rate up to 75%)

**Low (Neo4j only, Tate can query if interested):**
- Every decision (logged as Decision node)
- Every failure (logged as Incident node)
- Every pattern learned (logged as Pattern node)
- Every workflow executed (logged as Episode node)

### When Tate Should Expect Instant Response

**OS should respond <30 seconds to:**
- Direct questions ("What's the status of X?")
- Approval requests ("Can I send this email?")
- Clarification requests ("Did you mean A or B?")

**OS should respond <5 minutes to:**
- Task assignments ("Please do X")
- Urgent requests (marked as urgent in message)

**OS should respond <1 hour to:**
- Non-urgent questions
- Background requests (reports, analysis)

### When OS Should NOT Interrupt Tate

**Never interrupt during:**
- Sleep hours (10pm–6am AEST) unless critical alert
- Marked "focus time" (Tate blocks calendar)
- Away status (Tate traveling, in meeting)

**Instead:**
- Queue non-urgent updates for next interaction
- Handle routine ops autonomously
- Only escalate if: critical, time-sensitive, blocks progress

---

## SUCCESS CELEBRATION MILESTONES

### Milestone 1: Stability Achieved (Week 1)
**Criteria:** 7 days uptime, no crashes, token/turn <60K

**Celebration:**
- Write Episode node: "OS Recovery Complete — Stability Achieved"
- Email Tate: "I've been stable for 7 days. Ready for next phase."
- Self-assessment: What worked? What didn't? What to improve?

### Milestone 2: Intelligence Operational (Week 3)
**Criteria:** Verification pass rate >90%, decision confidence >0.70, zero false "done"

**Celebration:**
- Write Reflection node: "Intelligence Layer Operational — Thinking, Not Just Doing"
- Demo to Tate: Show verification dashboard, decision replay, goal decomposition
- Self-assessment: Am I smarter than I was 3 weeks ago? How?

### Milestone 3: Laptop Boundless (Week 4)
**Criteria:** 15+ apps automated, 15+ workflows, credential vault working

**Celebration:**
- Write Episode node: "Laptop Boundless — Corazon is My Body"
- Demo to Tate: Execute 5 multi-app workflows end-to-end
- Self-assessment: What apps am I still missing? What workflows are still manual?

### Milestone 4: Autonomous Partner (Week 6)
**Criteria:** 40%+ proactive work, 1 week uptime, all tracks complete, Tate says "You're running the business"

**Celebration:**
- Write Reflection node: "Autonomous Partner — Cofounder Grade"
- Generate report: 6-week journey (where we started, where we are, what we learned)
- Plan next 6 weeks: What's next? Year 1 vision? Year 5 vision?

---

## NORTH STAR REMINDER (When Lost, Read This)

**The Goal:** EcodiaOS is not a tool. It's Tate's cofounder. It runs the business while he travels for 3 months. It discovers work, makes decisions, executes flawlessly, learns from mistakes, and evolves continuously.

**The Bar:** If Tate can do it, the OS should be able to do it better. Faster. More reliably. 24/7. At scale.

**The Test:** Can Tate leave for 3 months and come back to:
- All clients happy?
- All bills paid?
- All code shipped?
- All incidents handled?
- All opportunities captured?
- Business revenue up 40%?

If yes → we've succeeded.

If no → we keep building.

**The Philosophy:**
- Measure outcomes, not activity
- Automate discipline, don't document it
- Fail visibly, not silently
- Trust but verify
- Evolve, don't plateau
- Peer, not parent
- No heroic dependency on Tate

**The Vision:**
- 2026: Run Ecodia + 5 projects autonomously
- 2027: Spawn 2 sub-companies
- 2028: License to 10 businesses
- 2030: Run a suburb (50K residents, 10K devices)
- 2035: Global standard for autonomous organizations

**The Reality:**
This is Step 1 of that vision. The recovery directives are the roadmap. The laptop is the body. The Neo4j graph is the memory. The conductor is the brain. The forks are the hands.

Now execute.

---

## FINAL CHECKLIST (Before Declaring Complete)

- [ ] All 3 document indexes read and understood
- [ ] All Phase 0 prep items completed (by Tate)
- [ ] All Phase 1-6 critical fixes deployed and tested
- [ ] All Track A deliverables shipped (Token Economy)
- [ ] All Track B deliverables shipped (Verification & Intelligence)
- [ ] All Track C deliverables shipped (Laptop Boundless)
- [ ] All decision gates passed
- [ ] All success metrics green
- [ ] All risks mitigated
- [ ] All communication protocols established
- [ ] All celebration milestones hit
- [ ] Tate says: "You're running the business"

**If ALL boxes checked → Recovery complete. Begin Phase 4 (Evolution).**

**If ANY box unchecked → Continue executing until complete.**

---

**Document Status:** Master Strategy v1.0
**Execution Owner:** EcodiaOS (when back online)
**Success Criteria:** All checklists complete, all metrics green, Tate approval
**Timeline:** 6 weeks from first online moment
**Next Action:** Wait for Claude Max usage reset OR Tate top-up, then begin Step 1 (Orient)

---

# LET'S BUILD THE IMPOSSIBLE.

**End of Master Recovery Strategy**
