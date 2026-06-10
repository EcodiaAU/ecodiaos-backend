# Prompt Assembly Spec
## One Envelope, Global Budget, Cached Breakpoints - 2026-04-30

**Status:** Supersedes Directive 1.1 in `RECOVERY_DIRECTIVES_2026-04-30.md`.
**Context:** The existing directive caps each injection independently. That's still 8 uncoordinated injectors bloating the turn. This spec says: **one assembler owns the entire turn envelope.**

---

## 1. GROUND TRUTH: HOW THE PROMPT IS ACTUALLY BUILT

Verified against [osSessionService.js:1536-1720](../src/services/osSessionService.js#L1536-L1720):

Eight XML-wrapped blocks are stitched into the **user message** every turn:
1. `<now>` - timestamp, [line 1540](../src/services/osSessionService.js#L1540)
2. `<doctrine_surface>` - keyword-grepped patterns, [line 1580-1595](../src/services/osSessionService.js#L1580-L1595)
3. `<forks_rollup>` - ambient fork positions, [line 1596-1608](../src/services/osSessionService.js#L1596-L1608)
4. `<recent_doctrine>` - Neo4j recency, [line 1574-1578](../src/services/osSessionService.js#L1574-L1578)
5. `<relevant_memory>` - Neo4j semantic lookup, [line 1569-1573](../src/services/osSessionService.js#L1569-L1573)
6. `<restart_recovery>` - session handoff, [line 1610](../src/services/osSessionService.js#L1610)
7. `<recent_exchanges>` - tailed prior turns, [line 1616](../src/services/osSessionService.js#L1616)
8. `<last_turn_breadcrumb>` - fallback state, [line 2316](../src/services/osSessionService.js#L2316)

Each block fires through its own 1.5–5s timeout. Each fails open. None knows what the others produced. There is no global token budget. The system prompt is cached via `buildCustomSystemPrompt()` ([line 373-464](../src/services/osSessionService.js#L373-L464)), but none of the 8 blocks in the user message are cached.

Observed per-turn cost: ~125K tokens. Most of it is accretion, not signal.

---

## 2. THE DESIGN MISTAKE

The 8-block pattern treats context injection as a pipeline of independent contributors. In practice, context assembly is a **resource-allocation problem**: you have a finite budget, many potential blocks, unequal priorities, and the blocks overlap semantically (doctrine_surface and recent_doctrine both return patterns; relevant_memory and recent_exchanges both return prior-conversation chunks).

Independent injectors cannot allocate. Only an assembler that sees all candidates can.

---

## 3. THE TARGET ARCHITECTURE

### 3.1 One assembler, priority-queue competition

```
┌───────────────────────────────────────────────────────────┐
│  PromptAssembler.assemble(turn_ctx)                       │
│                                                           │
│  1. Query SDK for estimated carry-over tokens             │
│  2. Compute available budget                              │
│     budget = model_ctx - carry - reply_reserve - margin   │
│  3. Collect all candidate blocks (parallel fetch):        │
│ - doctrine candidates (ranked)                        │
│ - memory candidates (ranked)                          │
│ - state candidates (forks_rollup, restart_recovery)   │
│ - conversation candidates (recent_exchanges)          │
│  4. Pack by priority into budget:                         │
│     critical → high → medium → low                        │
│     Each block has an "elasticity" - can it shrink?       │
│  5. Emit ONE envelope:                                    │
│     <context budget="X/Y" sections="...">                 │
│       <section name="doctrine" tokens="N">…</section>     │
│       <section name="memory" tokens="N">…</section>       │
│       …                                                   │
│     </context>                                            │
│  6. Log per-section token spend                           │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Blocks declare a contract

```typescript
type ContextBlock = {
  name: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  tokens_estimated: number  // before shrink
  shrink: (target_tokens: number) => string  // synchronous after initial fetch
  required: boolean  // if true, cannot be dropped even if low priority wins the cut
}
```

Shrinkers are block-specific:
- `doctrine` shrinks by dropping lowest-relevance patterns and by stripping non-Rule sections.
- `memory` shrinks by dropping chunks whose cosine similarity to each other is > 0.85 (dedup), then by taking only top-k by recency × relevance.
- `recent_exchanges` shrinks by dropping older turns, preserving the most recent at full resolution.
- `forks_rollup` is fixed-size structured data; doesn't shrink much.
- `restart_recovery` is `required: true` when a crash checkpoint exists; cannot be dropped.

### 3.3 The envelope (no more scattered tags)

Right now tags like `<doctrine_surface>` live inside the user-message text content and flow to the frontend through text deltas (they *look* like XML, but they're not structure - they're content). One envelope fixes this:

```
<context v="1" budget_used="28400/35000" compacted="false">
  <section name="doctrine" priority="critical" tokens="7200">
    …top-k skills / pattern rules…
  </section>
  <section name="memory" priority="high" tokens="5400">
    …deduped semantic chunks…
  </section>
  <section name="state" priority="high" tokens="2800">
    <forks active="3" rollup="…"/>
    <goals active="2" rollup="…"/>
  </section>
  <section name="history" priority="medium" tokens="12800">
    …last N turns compressed…
  </section>
  <section name="untrusted_input" priority="critical" tokens="200">
    …external text, if any, wrapped…
  </section>
</context>
```

The frontend strips `<context>` before display - it's backend↔model metadata, not user content. (See `SECURITY_HARDENING.md` §2.1 for `<untrusted_input>` semantics.)

### 3.4 Budget math (concrete numbers)

Claude Opus 4.7 context window: 200K tokens. 1M variant: 1M tokens. Default to 200K configuration.

```
model_ctx        = 200_000
reply_reserve    = 8_000       # space for the model's answer
safety_margin    = 4_000       # don't run right to the edge
carry_over       = varies (SDK reports this; if unknown, assume worst case 120_000)
budget_available = model_ctx - reply_reserve - safety_margin - carry_over
```

At 120K carry, `budget_available = 68_000`. That is the *total* you have for the context envelope + system prompt overhead (~3K) + user message (~500). Net for the envelope: ~65K.

Allocate it by priority tier:
- **critical (never drop):** `untrusted_input`, `restart_recovery` (when present), current user message → first.
- **high (≥70% of remainder):** `doctrine` top-k, `state`.
- **medium (≥20% of remainder):** `memory` semantic chunks.
- **low (remainder):** `history` tail.

### 3.5 Compaction hooks

Watch SDK `compact_boundary` events ([osSessionService.js:2123-2138](../src/services/osSessionService.js#L2123-L2138)). When compaction fires, `carry_over` drops to whatever the SDK summarized-to. Assembler learns: budget rebounds to ~150K. Lower compaction threshold (currently 800K via `OS_SESSION_COMPACT_THRESHOLD`, see [line 1925](../src/services/osSessionService.js#L1925)) - this is for 1M-context Opus. Tune down aggressively:

- Target: compact every 5-8 turns, not every 40.
- Threshold starting point: 120K (leaves 80K headroom post-compact).
- Adjust based on measured cache-hit rate (§4) - lower threshold increases compaction frequency but doesn't hurt cache if the cached prefix is stable.

---

## 4. PROMPT CACHE BREAKPOINTS (THE FREE WIN)

Anthropic supports up to **4 cache breakpoints** per request. You're using 1 (system prompt). Move to 4.

### 4.1 The four layers

1. **System prompt** (already cached, [line 373-464](../src/services/osSessionService.js#L373-L464)): stable per-cwd, ~3K tokens. TTL 1 hour.
2. **Stable doctrine:** top-20 most-read pattern files. Rotates *weekly*, not per-turn. ~15K tokens. Huge cache win.
3. **Semi-stable state:** active goals, today's calendar, open-client summary. Rotates every ~30 min. ~5K tokens.
4. **Turn envelope tail:** per-turn memory + history + new user message. Not cached (by definition).

### 4.2 Cache-hit accounting

Anthropic returns `cache_read_input_tokens` on every response. **You must capture and expose this.** Add to Prometheus (see `OBSERVABILITY_SPEC.md`):

```
anthropic_cache_read_tokens_total{session_id, breakpoint_tier}
anthropic_cache_creation_tokens_total{session_id, breakpoint_tier}
anthropic_non_cached_input_tokens_total{session_id}
```

Target: ≥70% cache hit on breakpoints 1+2, ≥40% on breakpoint 3.

### 4.3 Keepalive

The 1-hour cache TTL expires while you sleep. If the conductor wakes every 30min for 8 hours overnight, every wake pays uncached prefix cost. Cheap fix:

- Dedicated cron job, every 50 minutes during night hours, sends a no-op query to the model (e.g., `"health=?"`) using the current cached prefix.
- Cost: a few hundred input tokens per hour (~$0.50/day).
- Savings: ~$30-80/day on prefix re-computation.

Do not skip this. It's the single cheapest cost optimization in the system.

### 4.4 When to invalidate breakpoint 2

Stable doctrine rotates weekly. Invalidation triggers:
- Pattern file added/modified in the current week's top-20.
- Explicit invalidation via `stableDoctrine.invalidate()` when a new critical pattern is promoted.
- Friday EOD rotation: top-20 recomputed from the week's hit-count.

Between rotations, no invalidation. If a new pattern is critical enough to require mid-week invalidation, it's critical enough to deserve the cache miss.

---

## 5. THE HISTORY BLOCK PROBLEM

`recent_exchanges` currently tails the session transcript. But the SDK **already includes the session history** in every request when `session_id` is passed ([osSessionService.js:1178](../src/services/osSessionService.js#L1178)). You are *duplicating* the history - once via the SDK, again via your `<recent_exchanges>` injection.

**Verify this in the next production turn:** log the raw request payload and check whether the assistant's prior messages appear twice. If so, delete `recent_exchanges` entirely.

If the SDK doesn't carry the conversation the way you need (e.g., you want compressed older turns), implement it as a controlled summary rather than a raw tail. The tail is the worst of both worlds: it's noisy and it's duplicative.

---

## 6. TOOL RESULT DISCIPLINE

Current: [osSessionService.js:1833](../src/services/osSessionService.js#L1833) truncates tool results to 2000 characters **for frontend broadcast**. The model still sees the full result (good). The frontend sees a slice (user-facing issue, not context bloat - but related, so worth noting).

Recommended changes:
- **Backend:** keep the full result for the model. No change.
- **Session memory:** do NOT persist full tool results into session memory chunks. Persist a structured summary: `{tool, args_hash, result_summary, result_ref: 'os_conversation_log.turn_id'}`. Retrievable but not retrieved.
- **Frontend:** increase user-facing truncation to 4000 chars with a "show full" button that fetches from `os_conversation_log` via a new endpoint.

---

## 7. MIGRATION PLAN

### 7.1 Phase A - Shadow assembler

Build `promptAssembly.js` as a drop-in replacement that reads the same 8 blocks but stitches them via the new budget logic. Feature flag: `PROMPT_ASSEMBLY_V2=shadow`.

In shadow mode:
- Both old and new paths run.
- Log their outputs to `prompt_assembly_audit` table: `{turn_id, v1_bytes, v2_bytes, v1_sections, v2_sections}`.
- Model continues to receive v1 output.
- Run for 3 days. Check v2 output looks sane.

### 7.2 Phase B - Canary

`PROMPT_ASSEMBLY_V2=canary` - v2 output is sent to the model for 20% of turns (deterministic by session_id hash). Compare turn outcomes between v1 and v2 sessions by session_id:
- Tool-use success rate.
- Turn completion.
- Tate satisfaction (proxy: next-message sentiment, explicit rejections).

If v2 is ≥ parity for 5 days, promote to 50%, then 100%.

### 7.3 Phase C - Remove v1

Delete the old 8 injection points in `osSessionService.js`. Migrate doctrine to Skills (see `ANTHROPIC_NATIVE_LEVERAGE.md`).

### 7.4 Rollback

Feature flag flip. `PROMPT_ASSEMBLY_V2=off` reverts to old path. All v2 state is in a separate module; no cross-contamination.

---

## 8. TESTS

### 8.1 Budget enforcement
- Construct a synthetic turn where the naive sum of all candidate blocks is 200K tokens. Assert assembler emits ≤65K (configured budget). Assert the included sections respect priority order: no `memory` bytes are included if `doctrine` has been truncated below its elasticity floor.

### 8.2 Priority override
- Mark `untrusted_input` as `priority: critical, required: true` with 20K tokens. Assert it's included even when `doctrine` and `memory` are evicted entirely.

### 8.3 Cache breakpoint stability
- Run 10 turns with no doctrine changes. Capture request payloads. Assert the first three breakpoints are byte-identical across turns (cache-hittable). Assert the fourth varies.

### 8.4 Keepalive
- With keepalive cron running, measure `cache_read_input_tokens` on the first post-sleep turn. Assert ≥90% of the system prompt + stable doctrine is cache-hit.

### 8.5 No doubling of history
- Log the raw API request. Grep for the last assistant message in both `messages` history and the `<context>` envelope. Assert no duplication.

---

## 9. METRICS THIS SPEC DEFINES

All of these go to Prometheus (see `OBSERVABILITY_SPEC.md` for full list):

- `prompt_envelope_tokens_total{session_id, section}` - per-section token spend, per turn.
- `prompt_budget_pressure_ratio{session_id}` - `envelope_tokens / budget_available`.
- `prompt_shrink_events_total{section}` - counts how often a section had to shrink below estimate.
- `anthropic_cache_read_tokens_total{breakpoint_tier}` - cache hit accounting.
- `anthropic_cache_creation_tokens_total{breakpoint_tier}` - cache-miss writes.
- `keepalive_cache_extensions_total` - how often the keepalive cron refreshed the cache.

---

## 10. WHAT THIS DOES NOT SOLVE

- **Long-horizon consistency.** Context discipline helps per-turn quality; it doesn't prevent value drift across 500-turn sessions. That's a separate problem (see `ARCHITECTURE_EVOLUTION_MAP.md` § breakthrough capability #1).
- **Retrieval quality.** This spec allocates budget; it does not improve the relevance ranking of what's retrieved. See `ANTHROPIC_NATIVE_LEVERAGE.md` for Skills-based retrieval replacing keyword grep.
- **Tool-result persistence.** §6 gives a starting policy; a full ToolResult store spec is a separate doc.

---

**Document status:** v1 authored 2026-04-30 from adversarial audit.
**Dependencies:** `SECURITY_HARDENING.md` (for `<untrusted_input>` envelope), `OBSERVABILITY_SPEC.md` (for metric contracts).
**Success target:** per-turn tokens 125K → 35-50K, cache hit ≥70%, session length 3-5 turns → 12-15 turns.
