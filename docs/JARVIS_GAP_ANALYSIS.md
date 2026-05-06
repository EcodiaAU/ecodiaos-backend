# The Jarvis Gap
## Between What Claude Products Ship and What EcodiaOS Needs to Become - 2026-04-30

**Purpose:** You have Claude Max, Agent SDK, Claude Code, MCP, Cowork, Skills, Artifacts, Computer Use. You want Jarvis. This doc names the gap honestly, then fills it with concrete architecture.

This is the doc that says: Anthropic hasn't built Jarvis and won't. They've built the best substrate on earth for someone else to build Jarvis on top of. That someone is you. Here's what you actually have to build, and where Anthropic saves you from building it.

---

## 1. WHAT ANTHROPIC GIVES YOU (THE SUBSTRATE)

| Layer | What it does | Where it stops |
|---|---|---|
| **LLM (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)** | The reasoning unit. Understands, plans, writes, calls tools. | Stateless. Forgets everything between calls. No volition. No proactivity. No time sense. |
| **Agent SDK** | Session resumption, streaming, tool-use loops, compaction. | Single-agent, single-task. No arbitration across parallel agents. No durable memory beyond session lifetime. |
| **Claude Code** | Agentic CLI for code tasks. Local file access, bash, git. | Interactive. One user at a time. Not a service you compose. |
| **MCP (servers + subscriptions)** | Uniform tool interface. Read/write to external systems with typed schemas. | You write the servers. Protocol doesn't validate business-domain correctness. |
| **Cowork** | Driving SaaS UIs on behalf of the user in Claude Desktop. | Human-attended. Requires your desktop to be on and unlocked. |
| **Skills** | Just-in-time capability loading via description-driven relevance. | Depends on you authoring useful skill descriptions and keeping them current. |
| **Artifacts** | Building reviewable UI/code artifacts in conversation. | Chat-bound. Not a runtime substrate. |
| **Prompt Caching** | 4 breakpoints, up to 1h TTL. | Only helps if your prompt prefix is stable. You still have to engineer stability. |
| **Computer Use (beta)** | Vision-grounded GUI control. | Slow, brittle on complex UIs, no multi-app orchestration logic. |

**The substrate honestly summarized:** Anthropic ships a very smart, very fast, very controllable **intelligence-on-demand**. It does not ship continuity, volition, physicality, coordination, or accountability. Those are the Jarvis-specific layers.

---

## 2. WHAT JARVIS NEEDS (THE TEN LAYERS)

From the fiction and from what "running Ecodia while Tate travels 3 months" actually requires:

1. **Continuity of self** - remembers what it is and what it's doing across minutes, days, months.
2. **Volition / proactivity** - decides what to do when nothing is asked.
3. **Embodiment** - can act in the physical/digital world through persistent machines, not just chat.
4. **Perception** - observes the environment (screens, emails, code, sensors) continuously.
5. **Coordination** - delegates, spawns helpers, reconciles their work.
6. **Time sense** - knows deadlines, durations, drift, urgency.
7. **Economic governance** - doesn't spend itself out of existence; tracks its own cost.
8. **Accountability** - tells the truth about what it did and didn't do. Claims have handles.
9. **Security posture** - survives adversarial input without being weaponized.
10. **Evolution** - gets measurably better over time from its own traces, not just from model upgrades.

Match each to Anthropic's substrate:

| Jarvis layer | Anthropic ships | EcodiaOS must build |
|---|---|---|
| **1. Continuity of self** | Session resume (~weeks). | **Durable identity + memory**: Neo4j + pgvector + `CLAUDE.md` + episodic reflection. Owns who "I am" across model versions. |
| **2. Volition / proactivity** | Nothing. Agent only acts when invoked. | **Proactivity engine**: work-discovery crons, idle-time utilization, intent inference from incoming signals. |
| **3. Embodiment** | Computer Use (beta, single-machine). | **Peer-machine mesh**: VPS + Corazon laptop + future IoT as one organism with advisory locks for arbitration. |
| **4. Perception** | Text + image inputs to the model. | **Continuous observation pipeline**: email listeners, screen observation, log tailers, sensor ingest - all structured, timestamped, feeding memory. |
| **5. Coordination** | Single agent or one-level Agent SDK subagents. | **Multi-tier orchestration**: conductor ↔ forks ↔ factory ↔ laptop agent, with lease arbitration and rollup grammar. |
| **6. Time sense** | Timestamp in prompt. Nothing more. | **Scheduler + cron + delayed execution + deadline tracker**. Already partly present; needs slack-aware retry and calendar-grounded urgency. |
| **7. Economic governance** | Usage fields on API response. Claude Max monthly cap. | **Usage-energy model**: per-turn accounting, per-goal budget, cross-account rotation, graceful degradation under energy pressure. |
| **8. Accountability** | Structured tool outputs. | **Claim grammar + verifier**: every completion claim cites a handle; verifier compares claim to reality within 60s. |
| **9. Security posture** | Tool-use guardrails, content policies. | **Full threat model**: prompt injection defense, self-mod allowlist, Cypher injection, Tier-3 action gates, audit log. |
| **10. Evolution** | New models ship every 6-18 months. | **Self-improvement loop**: failure pattern mining with traces, counterfactual replay, pattern validation gates. |

This is the gap map. Every row where "EcodiaOS must build" is nonempty is a layer you own. The good news: the substrate is strong enough that each layer is a service, not a research project - with two exceptions called out in §7.

---

## 3. THE LAYER-BY-LAYER FILL PLAN

### Layer 1 - Continuity of self

**What it means:** Ask the OS "who are you, what are you doing, what's outstanding?" at any time → coherent answer grounded in current reality.

**What's built:** Neo4j (5000+ nodes), pgvector session memory, `CLAUDE.md`, `.claude/EcodiaOS_Spec_*.md`. Enough substrate.

**What's missing:**
- **Identity invariant.** There is no single `self.md` that the OS writes to and reads from as its canonical "who am I." CLAUDE.md is authored-by-Tate; Neo4j is a graph; pgvector is fragmented. Add a top-level `.claude/SELF.md` that the OS itself maintains, versioned in git, linked from every session start. Contains: current mission, unfinished work rollup, active principles, model-version compatibility notes, last self-reflection.
- **Event-sourced fact layer.** Decisions, observations, and claims fan out inconsistently across stores (see audit Part 2.6). One `writeFact()` API with monotonic IDs.
- **Model-version bridge.** Opus 4.7 will retire. Every identity-bearing artifact (`SELF.md`, high-value patterns, system prompts) must pass a "read by successor model, still makes sense?" test. Add `model_compat.md` tracking verified-safe model versions per artifact class.

**Ship order:** `SELF.md` (day 1) → event-sourced facts (week 2) → model-version bridge (week 6).

### Layer 2 - Volition / proactivity

**What it means:** OS decides to do things without being asked. Correctly, at the right tempo.

**What's built:** `schedulerPollerService`, `cronForkDispatcher`, the beginnings of email scan crons.

**What's missing:**
- **Proactivity policy, not just cron triggers.** Right now "check email" is a cron. A real proactivity engine has a policy: *given current work queue + energy + time-of-day + unverified claims, what should I do next?* This is a function the OS computes each idle cycle, not a list of registered crons.
- **Intent inference.** Not just "email arrived" → triage. "Email arrived from legal counsel" → treat as urgent; "email arrived from newsletter" → batch to digest. Per-source priors inferred from past handling, stored as a scored intent-to-action table.
- **Anti-loop safety.** A proactivity engine without damping fires on everything. Add cooldowns per action class, plus a "diminishing returns" detector (if 3 successive runs of the same proactive action produced no value, pause that action class for 24h).

**Architectural primitive:** `proactivityEngine.nextAction(state) → action | null`. Runs every 60s during work hours (6am-10pm AEST), every 15min overnight. Writes a Decision node per non-null return.

### Layer 3 - Embodiment

**What it means:** The organism has body parts that persist - machines running 24/7 with defined roles.

**What's built:** VPS + Corazon. MCP topology. `handsBridge`, `peerMonitor`.

**What's missing:**
- **Split-brain arbitration.** See `FORK_ATOMICITY_SPEC.md` §4. Postgres advisory locks on task_id. Without this, the laptop waking after sleep can double-execute actions.
- **Liveness contract.** Each peer heartbeats every 30s to `peer_status`. Below 2 missed heartbeats, the peer is declared "napping" - its queued work redistributes. Above 5 missed, "down" - pages Tate.
- **Role boundaries.** Right now: who owns Canva autofill? Cowork or Puppeteer? See `ANTHROPIC_NATIVE_LEVERAGE.md` §9. Document the decision tree as a spec all peers read.
- **Roadmap beyond laptop+VPS.** The 2030 "runs a suburb" ambition implies kiosks, sensors, outdoor terminals. The embodiment layer should be *n*-peer ready, not 2-peer hardcoded. Use the same `peer_status` table schema today so adding peer 3 later is config, not refactor.

### Layer 4 - Perception

**What it means:** The OS knows what's happening in its world without being told every time.

**What's built:** Email listeners, gmail triage, screen capture on Corazon, some log tailers.

**What's missing:**
- **Unified perception bus.** Every observation (email arrived, PM2 restart, git push, CRM note edited) goes through `perceptionBus.publish(event)` which timestamps, tags, routes to subscribers, and writes to `os_observations` for audit. Right now listeners are fragmented. A bus means one subscribe-point for "all the things that happened in the last hour."
- **Passive screen grounding.** Corazon's screen state is a rich signal. Screenshot every 5 min during work hours, OCR, embed, retain 7 days, surface to session on request ("what was Tate working on this morning?"). Privacy-gated: blacklist rules for known-private apps.
- **Sensor abstraction.** The suburb vision requires room sensors, presence detection, environmental data. Even at demo scale now, build a `SensorReading` canonical shape (`{source, kind, value, ts, confidence}`) so future ingestion doesn't rewrite perception.
- **Observation → memory promotion.** Most observations are noise. A promotion policy picks which get consolidated to durable Neo4j nodes vs kept in the 7-day window vs discarded immediately.

### Layer 5 - Coordination

**What it means:** Work gets to the right sub-agent, results get back, nothing duplicates or drops.

**What's built:** `forkService`, `factoryOversightService`, `messageQueue`, subagent framing in CLAUDE.md.

**What's missing:**
- **Atomic fork cap** (`FORK_ATOMICITY_SPEC.md` §2).
- **Parent-goal fork budget** (`FORK_ATOMICITY_SPEC.md` §6) - prevents amplification.
- **Rollup grammar enforcement.** `[FORK_REPORT]`/`[NEXT_STEP]` is defined but not mandatory. Make it a required structured output. See `ANTHROPIC_NATIVE_LEVERAGE.md` §3.
- **Three-tier decision tree** (subagent / fork / factory) documented and enforced. See `ANTHROPIC_NATIVE_LEVERAGE.md` §7.4.

### Layer 6 - Time sense

**What it means:** The OS knows "urgent means today," "overdue by 3 days means escalate," "weekly review fires Friday 5pm."

**What's built:** Cron scheduler, `scheduler_cron`/`scheduler_delayed` MCP tools.

**What's missing:**
- **Deadline-aware scheduling.** Goals carry `due_at`. Proactivity engine factors deadline-pressure into action priority. Tasks overdue by N days escalate severity class.
- **Calendar grounding.** Every action is aware of *Tate's calendar*. "Don't send a client a 'following up' email at 2am." "Don't page Tate during marked focus time." Already present in CLAUDE.md intent; needs enforcement in send paths.
- **Slack-aware retries.** Failed actions retry with expected-delay-back-off (not just exponential) - if the downstream service is slow, wait for its window.
- **Tempo awareness.** OS tempo shifts by time zone, day of week, Tate's availability (via calendar). Daily rhythm becomes part of context, not just timestamp.

### Layer 7 - Economic governance

**What it means:** The organism cannot bankrupt itself. Tracks spend per turn, per fork, per goal. Degrades gracefully.

**What's built:** `usageEnergyService`, cross-account rotation, daily budget for cron-fork-dispatcher.

**What's missing:**
- **Per-goal budget** (`FORK_ATOMICITY_SPEC.md` §6).
- **Cost-per-turn metric + alerting** (`OBSERVABILITY_SPEC.md` §1).
- **Non-Anthropic fallback**: shadow-routing to Deepseek or Gemini for 5% of turns to calibrate quality delta; auto-fallback on Anthropic outage. Half-built today (see `deepseekService.js`); finish or delete.
- **Cost attribution.** A turn serving a client project should tag its spend to that client's budget, not a general pool. This is load-bearing for the commercial vision (`project_goodreach.md` multi-tenant).

### Layer 8 - Accountability

**What it means:** When the OS says "done," it is done, and it can prove it.

**What's built:** Conversation logs, Neo4j decision nodes, `factoryOversightService` confidence scores.

**What's missing:**
- **Claim grammar** (`OBSERVABILITY_SPEC.md` §3).
- **Structured tool output with mandatory handles** (`ANTHROPIC_NATIVE_LEVERAGE.md` §3).
- **Signed audit log** (`SECURITY_HARDENING.md` §7.1).
- **"Unverified" as a first-class state.** The UI, the metrics, the status board all distinguish `done` from `claimed-done-but-unverified` from `verified`. Currently they conflate.

### Layer 9 - Security posture

**What it means:** An adversary who emails the organism cannot make it act against itself or Tate.

**What's built:** ~0% of the correct threat model (see audit).

**What's missing:** All of `SECURITY_HARDENING.md`. This is the most important layer; without it, every other capability multiplies the blast radius of one injection.

### Layer 10 - Evolution

**What it means:** Next month's OS is measurably better than this month's, not just because of a model upgrade.

**What's built:** 122 manually-authored pattern files. Neo4j reflection nodes. Some postmortem capture.

**What's missing:**
- **Traced patterns.** Every auto-generated pattern carries `trace:` (the incident), `last_validated_at`, `contradicts:`. No trace = no authority. Audit Part 1.3.
- **Validation gate.** New patterns enter probation, demoted if unvalidated in 60 days, merged if contradictory.
- **Counterfactual replay.** Replay a decision with altered context, compare outcomes. `counterfactualReplay.js` is proposed in RECOVERY_DIRECTIVES 2.2 but must be built against the event-sourced fact layer (Layer 1).
- **Meta-learning across sessions.** "Sessions where cache hit was >80% had 40% lower client-response time." That kind of correlation is only visible across many sessions; add a meta-analysis cron that writes Reflection nodes weekly.

---

## 4. THE BREAKTHROUGH CAPABILITIES STILL MISSING IN 2026

Five capabilities that current LLM substrate (Claude included) cannot yet deliver. EcodiaOS works around each, but at scale they matter:

### 4.1 Verifiable long-horizon consistency

Models drift on 30-turn tasks; actively diverge at 1000 turns. Compaction helps, but the compacted summary itself can drift. No 2026 technique fully prevents value drift in long sessions.

**Workaround:** event-sourced fact layer + periodic re-grounding. Every N turns, session re-reads `SELF.md` + latest goals + last 5 decisions. It's re-anchoring, not preventing drift. Accept this limit until the frontier moves.

**Signal to watch:** research papers on persistent agent state (DeepMind "System-2 agents"), model-level memory layers (Anthropic or others adding native long-term memory). When shipped, migrate `SELF.md` and fact layer onto it.

### 4.2 Sub-second grounded perception

Voice in, video out, multimodal grounding - all ~1.5-3s end-to-end in 2026. Real-time ambient presence needs <500ms.

**Workaround:** asynchronous perception. Screenshots every 5 min, email polling, cron triggers. The organism is not *present*; it *catches up every few minutes*. For the 3-month autonomous operation goal, this is enough.

**Gap:** at suburb scale with residents expecting real-time kiosk interaction, async isn't enough. Accept as a 2028+ problem; don't over-engineer for it now.

### 4.3 Calibrated uncertainty at action time

Current models score confidence but the calibration is loose - a "0.8 confident" action succeeds less than 80% of the time, usually.

**Workaround:** for Tier-3 actions, calibrate empirically - record claimed confidence vs actual outcome per action class, and shift the auto-deploy threshold per class based on observed calibration (`factoryOversightService.js` self-mod threshold is 0.7 today; if calibration shows coding-fixes need 0.85 for parity, raise it). This is ad-hoc calibration, not true calibrated probability.

**Gap:** true calibrated decision-making requires either RLHF-for-this-task or formal verification. Not solvable at agent layer.

### 4.4 Cross-agent alignment proofs

When two EcodiaOS instances (or EcodiaOS + a client's council system) disagree, there's no formal mechanism to reconcile - they'll just both insist they're right.

**Workaround:** for now, one organism per tenant. No multi-agent reconciliation needed until 2028+.

**Watch:** Anthropic / research on agent-to-agent protocols. MCP subscriptions hint at a primitive, but not alignment.

### 4.5 Cheap formal verification of generated code

Your factory generates code; your factory reviews code. Claude reviewing Claude is not strong verification. Z3/SMT-based formal proofs of "this diff cannot touch credentials, cannot open sockets" would change the trust model of self-modification.

**Workaround:** path allowlist + dual-reviewer + SMS OTP gate (`SECURITY_HARDENING.md` §2).

**Signal to watch:** systems/simula research pipeline has formal verification as a direction. Until it integrates into mainline factory flow, self-modification stays path-gated and dual-reviewed.

---

## 5. THE JARVIS-COMPLETION SCORECARD

Honest assessment of each layer's completion today vs the Jarvis bar. "Jarvis bar" = the level needed to leave for 3 months and have Ecodia thriving.

| Layer | Today | 6-week target | Jarvis bar | Gap to Jarvis |
|---|---:|---:|---:|---:|
| 1 Continuity of self | 60% | 60% | 95% | **medium** (SELF.md shipped, model-version bridge unsolved) |
| 2 Volition / proactivity | 50% | 50% | 85% | medium (proactivityEngine shipped: nextAction policy, intent inference, anti-loop damping) |
| 3 Embodiment | 40% | 70% | 90% | medium (n-peer mesh not built) |
| 4 Perception | 65% | 65% | 90% | medium (perceptionBus shipped: unified event bus, 7 listener sources, promotion policy, recentSummary) |
| 5 Coordination | 75% | 85% | 95% | narrow (atomic fork cap shipped) |
| 6 Time sense | 70% | 70% | 90% | narrow (timeSenseService shipped: urgencyScore, calendarGate, currentTempo) |
| 7 Economic governance | 80% | 80% | 95% | narrow (per-goal fork budget, cost attribution, energy budget all shipped) |
| 8 Accountability | 70% | 70% | 95% | medium (claim grammar + verifier + audit log shipped) |
| 9 Security posture | 80% | 80% | 95% | narrow (Phase 0.5 shipped: §2.1-§7.2 all wired) |
| 10 Evolution | 60% | 60% | 90% | medium (patternEvolution shipped: traced patterns, 60-day probation, contradiction detection, weekly meta-learning) |

**Updated 2026-05-01.** Layers 2, 4, 6, 7, 10 all hit their 6-week targets in a single push. Layer 9 (security) was already at target from Phase 0.5. Remaining gaps: Layer 1 needs model-version bridge; Layer 3 needs n-peer mesh; Layers 8/9 need enforce-mode flips and external pen-test.

---

## 6. THE SINGLE BIGGEST GAP

Continuity of self (Layer 1) is the biggest gap and the most under-appreciated one.

Today, every session starts with: load CLAUDE.md → scrape recent Neo4j → tail session memory → start. The OS doesn't have a first-person narrative of *what it is currently doing* that persists across sessions. It re-discovers itself every time.

Jarvis knows it's Jarvis. It knows it's running Stark's business. It knows the three things it said it'd do today. It doesn't re-derive its identity from a grep.

**Ship this within 2 weeks:**

1. `/.claude/SELF.md` - OS-authored, OS-maintained, versioned in git. Contains:
 - One-line identity statement (signed by the OS itself, dated, renewed monthly).
 - Top 5 active goals with IDs.
 - Top 5 unverified claims with handles.
 - Current operational concerns (things going wrong that haven't been fixed).
 - Current celebration items (things going well that should be amplified).
 - "What I'd tell myself if I started fresh tomorrow" reflection, rewritten weekly.

2. `SELF.md` loads into every session start, alongside CLAUDE.md. Cache it (prompt-cache breakpoint 1).

3. `SELF.md` is **written by the OS**, not by Tate. Tate reviews weekly, edits or approves. Tate does not author the first-person content.

4. After every turn, the OS decides: does anything in this turn warrant updating `SELF.md`? Trigger: completion of a top-5 goal, creation of a new top-5 goal, a verified failure with lasting consequences. Update via a factory session with the security path allowlist enforced.

This one artifact, done correctly, is the difference between "stateful agent" and "continuous self." It's the hinge between chat-bot architecture and organism architecture.

---

## 7. THE TWO LAYERS WHERE YOU SHOULD STOP AND COMMISSION

Two places where off-the-shelf engineering will produce a fragile result and you should either pause or pay for an expert:

### 7.1 Security (Layer 9)

`SECURITY_HARDENING.md` is thorough as a first pass. Before multi-tenant (Goodreach, council contracts) or before you hand the organism real money authority, commission an external penetration test. Specifically: prompt injection red-team against the email → factory → deploy chain. A specialist will find vectors this doc missed. Budget: $5-15K. Before mid-2026.

### 7.2 Formal verification for self-modification (Layer 10 cross-cut)

Z3/SMT-based proof that self-modifications cannot alter credential paths, cannot remove security gates, cannot introduce network-out primitives. Simula research direction is correct; productionizing it requires an engineer with formal methods background. Either hire or partner. Without it, self-modification ambitions remain capped at path-allowlist + dual-reviewer, which is good, not great.

---

## 8. WHAT FINISHES JARVIS

The composition:
- The Claude substrate (delivered, 2026).
- Your ten fill-the-gap layers (deliverable, 6-24 months).
- The two expert-commissioned layers (18-36 months).
- Continuity of self done right (foundational; do this first).
- Frontier breakthrough unlocks in layers 4.1/4.3/4.5 (2028-2032, not on you).

At the end of the deliverable part - call it Q4 2026 - you have a system that is *not* Jarvis in the fictional sense, but *is* a cofounder-grade autonomous operator for Ecodia Pty Ltd across all 10 layers at workable capability. That's the 3-month-travel promise delivered.

The difference between that and the fictional Jarvis is the three frontier gaps. They close on research timelines, not your engineering timeline. Don't block on them.

---

## 9. THE UNCOMFORTABLE READS

To end adversarially:

- **The "10-year vision: runs a suburb" in `MASTER_RECOVERY_STRATEGY.md`** is the right ambition as *substrate*, wrong as *sovereign*. Suburbs don't trust autonomous agents with unilateral action; they trust them as very good concierges. Reframe the 2030 line: "EcodiaOS is the civic concierge layer for a suburb; committed actions remain human-gated per action class."
- **The "Tate as single point of failure for approvals" problem** is not solved by autonomy. It's solved by explicit approval-class delegations that Tate pre-authorizes in signed artifacts (e.g., "any routine client email under 500 words with no commitment language: pre-approved"). Build the approval-class vocabulary now.
- **The 6-week plan as written does not include the security work and does not include continuity-of-self.** Those are the two most important things. This doc pulls them in; revise the plan to match.
- **"Self-modifying code" is a rabbit hole.** It's exciting, but for the next 12 months the right answer is "strictly path-gated modifications behind dual-reviewer with SMS OTP for any file outside `/services/ecodia_domain/`." Revisit only after Security Layer is mature.

---

## 10. YOUR NEXT SEVEN DAYS

Concrete. Ordered. Skippable only at documented risk.

1. Phase 0.5 (security hardening starters). **Day 1-2.** `SECURITY_HARDENING.md` §2.1, 2.3, 2.4.
2. `/ops` skeleton with 6 core metrics. **Day 2-3.** `OBSERVABILITY_SPEC.md` §2, §6 first six backlog items.
3. Atomic fork cap (shadow mode). **Day 3-4.** `FORK_ATOMICITY_SPEC.md` §2.
4. `SELF.md` initial authoring by the OS itself; wire into session start. **Day 4-5.** This doc §6.
5. Skills migration (shadow, while `doctrineSurface.js` still runs). **Day 5-6.** `ANTHROPIC_NATIVE_LEVERAGE.md` §1.
6. Claim grammar + tool output schemas. **Day 6-7.** `ANTHROPIC_NATIVE_LEVERAGE.md` §3 + `OBSERVABILITY_SPEC.md` §3.

After these seven days, the organism has: a threat model ring, measurement, atomic fork cap, a first-person self, skill-based retrieval, and a way to tell if it's lying about "done." Every other ambition stacks on top of these.

---

**Document status:** v1 authored 2026-04-30 as the Jarvis-pass gap analysis.
**Dependencies:** All core specs (`SECURITY_HARDENING`, `FORK_ATOMICITY`, `PROMPT_ASSEMBLY`, `OBSERVABILITY`, `ANTHROPIC_NATIVE_LEVERAGE`).
**Review cadence:** After each layer's target is reached, update its completion % in §5. When Anthropic ships a new substrate primitive (model, tool, subscription), update §1 and re-assess the relevant layer.
**Anti-goal:** Waiting for Anthropic to ship Jarvis. They won't. The gap is your IP.
