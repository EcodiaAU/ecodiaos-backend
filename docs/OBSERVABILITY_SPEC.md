# Observability Spec
## The /ops Dashboard - 2026-04-30

**Status:** MISSING from prior docs. The system is flying blind.
**Principle:** You cannot optimize what you cannot see. Every other intervention depends on measuring its impact.

This spec defines the minimum signal set required to operate EcodiaOS at 3am during an incident, without grep-logs-through-ssh.

---

## 1. THE SIX SIGNALS YOU DON'T HAVE

From the audit (Part 2.4), these are the gaps. Each is a separate metric family.

### 1.1 Per-turn token breakdown with per-block attribution

**Why:** You know ~125K tokens per turn. You don't know that turn #87 burned 40K because `<recent_exchanges>` accreted a 3-hour thread, while turn #88 burned 8K with no explanation. Without per-block attribution, optimization is guessing.

**Metric:**
```
os_turn_input_tokens_total{session_id, block_name}    (counter)
os_turn_output_tokens_total{session_id}               (counter)
os_turn_total_ms{session_id}                          (histogram)
os_turn_ttft_ms{session_id}                           (histogram, time-to-first-token)
```

**Source:** emit from `PromptAssembler.assemble()` per section; emit from SDK response handlers for input/output counts.

**Dashboard view:** stacked area chart of per-block tokens over the last 4h, one panel per session.

### 1.2 Prompt cache hit rate

**Why:** Anthropic returns `cache_read_input_tokens` on every response. If you're not storing it, your cost model is broken. Cache hit rate < 50% = prefix instability or premature invalidation.

**Metric:**
```
anthropic_cache_read_tokens_total{session_id, breakpoint_tier}     (counter)
anthropic_cache_creation_tokens_total{session_id, breakpoint_tier} (counter)
anthropic_uncached_input_tokens_total{session_id}                  (counter)
anthropic_cache_hit_ratio                                          (derived gauge)
```

**Source:** parse `response.usage` on every completion. See Anthropic API response format.

**Dashboard view:** single big number for hit ratio over last 1h, with a 24h sparkline beneath.

### 1.3 MCP tool latency, p50/p95/p99

**Why:** Your `<doctrine_surface>`, `<relevant_memory>`, `crm_get_intelligence`, `neo4j_search`, `patterns_semantic_search` each fire through 1.5–5s timeouts that fail open. Without per-tool p99, those timeouts are arbitrary. You're either capping too aggressively (losing signal) or too loosely (adding silent delay).

**Metric:**
```
mcp_tool_latency_ms{server, tool, outcome}    (histogram)
mcp_tool_timeout_total{server, tool}          (counter)
mcp_tool_error_total{server, tool, code}      (counter)
```

**Source:** wrap every MCP tool invocation with a timer. Tag `outcome ∈ {ok, timeout, error}`.

**Dashboard view:** table of (server, tool) rows with p50/p95/p99 ms columns, sorted by p99. The tools whose p99 approaches their timeout are your tuning candidates.

### 1.4 Fork time-to-first-useful-action (TTFT-fork)

**Why:** "Are forks earning their weight?" The answer depends on how long a fork takes from spawn to its first meaningful tool call. If TTFT-fork is 40s, brief forks are wasteful - the work should stay inline.

**Metric:**
```
fork_spawn_to_first_tool_use_ms{context_mode}     (histogram)
fork_total_duration_ms{context_mode, outcome}     (histogram)
fork_cap_rejections_total{reason}                 (counter)
fork_worktree_cleanup_ms                          (histogram)
```

**Source:** timestamp `spawned_at` and first `tool_use` event in the fork's transcript. Difference is TTFT-fork.

**Dashboard view:** histogram of TTFT-fork, p50/p95. If p50 > 30s, forks should be reserved for medium+ briefs, not quick lookups.

### 1.5 Claim → handle verification rate

**Why:** This is your "40% of completed tasks aren't actually complete" problem, quantified. Every `[CLAIM:...]` emitted by the conductor (see `ANTHROPIC_NATIVE_LEVERAGE.md` §3) should cite a verifiable handle - commit SHA, message-id, PM2 pid. The ratio of claims-with-verifiable-handles over total-claims *is* the empirical-verification gap.

**Metric:**
```
conductor_claim_total{claim_type, has_handle, verified}    (counter)
conductor_claim_verification_lag_ms{claim_type}            (histogram)
```

Where `has_handle ∈ {true, false}` and `verified ∈ {true, false, pending}`.

**Source:** parse `[CLAIM:...]` grammar from conductor output; run async verifier (see §3).

**Dashboard view:** single gauge "verified claims / total claims" over last 24h, with a drill-down table by `claim_type`.

### 1.6 Context saturation trajectory

**Why:** `OS_SESSION_COMPACT_THRESHOLD` is set blindly. Without a trajectory chart, you don't know if compaction is firing too late (bad turns near threshold) or too early (wasted compute). A sawtooth pattern between 600K and 800K means you're compacting once per ~20 turns and paying the summary-regen cost once per cycle.

**Metric:**
```
os_session_carry_over_tokens{session_id}          (gauge, sampled per turn)
os_session_compact_events_total{reason}           (counter)
os_session_compact_duration_ms                    (histogram)
os_session_turns_per_compaction                   (histogram)
```

**Source:** sample SDK-reported carry on each turn; emit on `compact_boundary` event ([osSessionService.js:2123-2138](../src/services/osSessionService.js#L2123-L2138)).

**Dashboard view:** line chart of carry-over over last 24h, compaction events marked as vertical lines.

---

## 2. THE /ops PAGE

Single page. Loads in < 1 second. Everything above the fold.

### 2.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  /ops - EcodiaOS Operations                    [auto-refresh]│
├──────────────────────────────────────────────────────────────┤
│  STATE     Conductor: UP 14h  │ API: UP 14h │ Factory: UP 3d │
│            Fork slots: 2/5    │ Energy: 34% │ Memory: 1.1GB  │
├──────────────────────────────────────────────────────────────┤
│  TURN ECONOMICS (last 1h)                                    │
│  avg tokens/turn: 42K (target 35K)       cache hit: 68%      │
│  TTFT p50: 2.1s  p95: 4.7s               cost/hr: $6.40      │
│  [stacked area: tokens per block, 1h]                        │
├──────────────────────────────────────────────────────────────┤
│  VERIFICATION GAP (last 24h)                                 │
│  claims: 147   verified: 128 (87%)                           │
│  unverified: 19  → [drill down]                              │
├──────────────────────────────────────────────────────────────┤
│  FORKS (last 24h)                                            │
│  spawned: 41   succeeded: 37  cap-rejected: 2  crashed: 2    │
│  TTFT-fork p50: 14s  p95: 38s                                │
├──────────────────────────────────────────────────────────────┤
│  MCP TOOLS (sorted by p99)                                   │
│  neo4j_search           p50 180ms   p95 1.2s    p99 4.8s ⚠  │
│  patterns_semantic_sch  p50 220ms   p95 890ms   p99 2.1s     │
│  crm_get_intelligence   p50 90ms    p95 340ms   p99 720ms    │
│  gmail_send             p50 820ms   p95 1.8s    p99 3.1s     │
│  …                                                            │
├──────────────────────────────────────────────────────────────┤
│  SECURITY                                                    │
│  credential redactions (24h): 0                              │
│  Tier-3 gate invocations: 12 (all approved)                  │
│  Cypher label rejections: 0                                  │
│  quarantined doctrine nodes (pending): 3                     │
├──────────────────────────────────────────────────────────────┤
│  CONTEXT SATURATION                                          │
│  [line: carry-over tokens, 24h, with compaction markers]     │
│  compactions/24h: 8   avg turns/compact: 11                  │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Implementation notes

- Single SSR page at `/ops` in `ecodia-api`. No client-side framework overhead.
- Backing data from a `/ops/metrics` JSON endpoint that aggregates Prometheus scrape + direct DB queries for things with low cardinality.
- Auto-refresh every 10s. Hard cap 1s response time or the cron alerts.
- No auth gate initially - deploy behind Tailscale only, same way the rest of the VPS admin surface works.

---

## 3. CLAIM VERIFICATION PIPELINE

This is what powers §1.5. It's a small separate service, not a full subsystem.

### 3.1 Claim grammar

Conductor's system prompt ([osSessionService.js buildCustomSystemPrompt()](../src/services/osSessionService.js#L373-L464)) adds:

> When you report an action as complete, use the claim grammar:
> `[CLAIM:<action> <key>=<value> …]`
> Examples:
> `[CLAIM:deployed sha=abc123 pm2_uptime=4s]`
> `[CLAIM:emailed to=tom@example.com message_id=<abc@mail.gmail.com>]`
> `[CLAIM:committed sha=def456 branch=main]`
> `[CLAIM:scheduled task_id=sch_42 fires_at=2026-05-01T09:00:00Z]`
> If you cannot produce a handle, say "unverified" explicitly; do not guess.

### 3.2 Claim extraction

Post-turn hook in `osSessionService`:

```javascript
const CLAIM_RE = /\[CLAIM:(\w+)\s+([^\]]+)\]/g
for (const m of text.matchAll(CLAIM_RE)) {
  const [_, action, kvStr] = m
  const kv = parseKV(kvStr)
  await db`
    INSERT INTO conductor_claims
      (turn_id, session_id, action, handle_kv, verification_status)
    VALUES (${turnId}, ${sessionId}, ${action}, ${kv}, 'pending')
  `
}
```

### 3.3 Verifier

Cron every 30 seconds picks pending claims and dispatches a verifier based on `action`:

- `deployed` → `git log -1 origin/main` on expected SHA + PM2 process inspect.
- `emailed` → `gmail_search` on message_id, confirm it exists in Sent.
- `committed` → `git cat-file -e <sha>^{commit}` + branch membership check.
- `scheduled` → `SELECT 1 FROM os_scheduled_tasks WHERE id=$1`.
- Unknown action → mark `action_unknown`, log for operator.

Each verifier returns `{verified: true|false, detail}`. Update the row.

### 3.4 Amber-state UI

Frontend polls `/api/os/claims?session_id=X&since=Y`. Claims with `verification_status='pending'` for >60s display amber; `false` displays red; `true` displays green. The amber dots are where the work actually is: unverified completions.

### 3.5 Why this beats Layer-5 verification registry

The directives' "Layer 5 verification" runs *after* the agent has moved on. This system runs *alongside* and reports divergence within 60s. The agent reads its own unverified-claim count in the next turn's context envelope under `<state>` - **closing the loop in-session** rather than post-hoc.

---

## 4. ALERTING

### 4.1 Alert channels

- **SMS (page Tate):** security incidents (see `SECURITY_HARDENING.md` §7.2), process crashes, all Claude Max accounts exhausted, signed audit-log tamper detected.
- **Email (Tate digest):** overnight summary, any metric that crossed a warn threshold.
- **Director Chat post:** any metric that crossed an info threshold; resolves when metric returns.
- **Dashboard amber:** any metric outside target range, no notification. Visible at next `/ops` check.

### 4.2 Starting thresholds

| Metric | Info | Warn | Page |
|---|---|---|---|
| avg tokens/turn (1h) | > 60K | > 90K | - |
| cache hit ratio (1h) | < 60% | < 40% | - |
| MCP p99 latency | > 3s | > 10s | - |
| fork cap rejections (1h) | > 2 | > 10 | - |
| memory RSS (ecodia-api) | > 1.5G | > 1.8G | > 1.95G |
| memory RSS (ecodia-conductor) | > 1.5G | > 1.8G | > 1.95G |
| unverified claims (24h) | > 20% | > 40% | - |
| credential redactions (any) | - | > 0 | > 0 (out of bootstrap) |
| compactions/hr | > 4 | > 10 | - |
| Tier-3 gate denials (1h) | - | > 3 | > 10 |
| PM2 restart count (24h) | > 1 | > 3 | > 6 |
| Neo4j write errors (1h) | > 1 | > 5 | > 20 |

Tune from 2-week baseline. The goal is *actionable* alerts, not noise.

### 4.3 Alert fatigue mitigation

- Every alert that fires must have a runbook link. No runbook = not an alert.
- Alerts auto-resolve when the metric returns to normal; "resolved" is a separate channel event, not a silence.
- Rolling 7-day review: any alert that fired >5 times without human action gets threshold-tuned or dropped.

---

## 5. LOGGING DISCIPLINE

### 5.1 Structured logs everywhere

- `pino` (or current Node logger) with JSON output.
- Every log line includes: `session_id`, `turn_id` (when applicable), `trace_id`, `service_name`, `level`, `event`.
- Event names are canonical (`fork.spawned`, `fork.cap_rejected`, `tool.invoked`, `tool.result.truncated`, `claim.emitted`, `claim.verified`, `security.redaction`, etc.).

### 5.2 Retention

- 7 days hot (Grafana Loki or equivalent queryable log store).
- 90 days cold (S3 bucket).
- Security audit log: 7 years (separate table, see `SECURITY_HARDENING.md` §7.1).

### 5.3 What NOT to log

- Tool result bodies (they're in `os_conversation_log` already; logging duplicates). Log the `turn_id` pointer.
- Full prompt envelopes (same reason).
- Any credential-shaped string (§5.1 of SECURITY_HARDENING enforces this).
- Neo4j node full content on every retrieval (log just node_id + label + score).

### 5.4 Trace IDs

Every incoming HTTP request gets a `trace_id`. Propagated through:
- WebSocket session
- SDK queries (as a metadata tag)
- MCP tool calls (as an arg)
- Fork spawns (inherited)
- DB transactions (comment prefix)

Without trace_ids, post-hoc debugging at 3am means joining by timestamps, which is miserable.

---

## 6. INSTRUMENTATION BACKLOG

Order to ship:

1. **Token accounting** (§1.1): add `PromptAssembler`-level counters first, even before the full assembler ships. Instrument the current 8 blocks now. 1 day.
2. **Cache hit rate** (§1.2): parse `response.usage` on every SDK completion. 0.5 day.
3. **/ops page skeleton + metric JSON endpoint**. 1 day.
4. **Fork TTFT + cap rejections** (§1.4). 0.5 day.
5. **MCP latency histograms** (§1.3). 0.5 day.
6. **Claim grammar + verifier** (§3). 2 days.
7. **Context saturation chart** (§1.6). 0.5 day.
8. **Alerting wiring** (§4). 1 day.
9. **Trace ID propagation** (§5.4). 1 day.

Total: ~8 days. Do this before Track A optimizations so you can measure their impact.

---

## 7. THE METRICS CONTRACT (FOR IMPLEMENTERS)

### 7.1 Where metrics live

- `src/observability/metrics.js` - Prometheus register, Singleton.
- Every service imports the specific counters/histograms it needs. Single source of truth.
- Name conventions: `<domain>_<object>_<unit>` (e.g., `os_turn_input_tokens_total`). Follow Prometheus guidance.

### 7.2 Cardinality limits

- Labels with unbounded cardinality (session_id, turn_id, fork_id) are **fine on counters and histograms** at this scale (single VPS, <1k active sessions/day).
- Do NOT put session_id on alert rules - alert on aggregated values.
- `os_conversation_log` is the authoritative per-turn record; metrics are aggregates. Don't duplicate the transcript into labels.

### 7.3 Pull vs push

- Prometheus pulls via `/metrics`. VPS exposes it on localhost:9100, Grafana scrapes.
- Push metrics (e.g., from short-lived cron jobs) go through `pushgateway` with a TTL.

---

## 8. DASHBOARD EXPORT

Grafana dashboard JSON lives in `backend/docs/grafana/ops.json` (committed). Anyone who SSH'es into the VPS or pulls the repo can import it and see the same view. No ops toil recreating dashboards manually.

---

## 9. WHAT THIS DOES NOT COVER

- **User-facing analytics** (time-on-page, feature-use). Separate product-analytics concern.
- **Business metrics** (MRR, churn). Separate finance-reporting concern.
- **Distributed tracing** (OpenTelemetry full stack). The trace_id propagation in §5.4 is 80% of the value for 5% of the effort. Move to full OTel if and when you have >1 VPS.

---

**Document status:** v1 authored 2026-04-30.
**Blocking for:** every cost/quality optimization, because the baseline isn't measurable without these signals.
**Success metric:** When a crash happens, time-to-diagnosis drops from "SSH and grep for 20 minutes" to "open /ops, see the two metrics that spiked, open the drill-down."
