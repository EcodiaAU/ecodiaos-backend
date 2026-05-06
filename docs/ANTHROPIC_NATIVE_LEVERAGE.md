# Anthropic-Native Leverage
## What Anthropic Already Shipped That You're Duplicating - 2026-04-30

**Status:** Cost-reduction + complexity-reduction spec. Delete parallel infrastructure; use Anthropic's.
**Context:** You're on Claude Max with full Agent SDK, Skills, MCP, prompt caching, and Cowork. Several custom services reproduce features Anthropic built better.

The rule of thumb: if Anthropic ships it, using their version is cheaper, better-supported, and frees you to spend engineering on domain-specific work only you can do.

---

## 1. DOCTRINE → SKILLS

### 1.1 What you're doing now

[`doctrineSurface.js`](../src/services/doctrineSurface.js) does keyword-grep over `patterns/*.md` (122 files, [INDEX.md](../patterns/INDEX.md)) and injects matched content into the prompt. Keyword matching is coarse: a pattern about "commit" fires on any turn mentioning commits, regardless of whether the pattern is relevant to *this* commit.

Two bugs this produces:
- Overlapping patterns both fire even if they contradict.
- Patterns that were archived but still grep-able via old keywords keep surfacing.

### 1.2 Anthropic's solution

**Skills** (`.claude/skills/<name>/SKILL.md`) are markdown files with frontmatter. The Agent SDK surfaces them to the model based on **description-driven relevance** - the model itself picks which skill to load, using the description text. You saw this in the current session: `simula-core-directives`, `auditeos`, `supabase:supabase`, etc. are all skills. The SDK loads them on-demand, not speculatively.

### 1.3 Migration

```
backend/patterns/<slug>.md                  →  .claude/skills/<slug>/SKILL.md
```

For each pattern file, add frontmatter:

```yaml
---
name: <slug>
description: >
  One precise sentence stating when this skill applies. Be specific about the
  trigger conditions - the model reads this to decide whether to load the body.
---

# Body: existing Rule + Why + How to Apply sections
```

The `description:` field is the load-bearing part. Write it as "use this when…" - e.g., `"use when deciding whether to push directly to a client's repo vs a feature branch"` rather than `"client push policy"`.

### 1.4 What to delete

- `doctrineSurface.js` entirely.
- The `<doctrine_surface>` injection block at [osSessionService.js:1580-1595](../src/services/osSessionService.js#L1580-L1595).
- The keyword-matching logic and its caching.

### 1.5 Edge cases

- **Patterns referenced in Neo4j by file path:** Update references to point to the new Skills path.
- **Patterns with non-obvious keywords (e.g., "tate-paused"):** Rewrite descriptions to be explicit about the scenario, not jargon.
- **Skills limit:** Claude Max has no hard cap; ship all 122.

### 1.6 Ranking stays in your control

If you want tighter relevance than the SDK's default, keep a thin `skillRanker.js` that:
- Embeds the current turn's intent (first 500 tokens of user message + last tool result).
- Embeds each skill's `description`.
- Ranks top-K most similar.
- Returns the list as a hint to the SDK (via `tools`/`permissions` allowlist for that turn).

This uses pgvector (already deployed for session memory). Lightweight.

---

## 2. COMPACTION → SDK-NATIVE

### 2.1 What you're doing now

`sessionHandoff.js` + custom compaction logic. `osSessionService.compact()` ([line 2874-2877](../src/services/osSessionService.js#L2874-L2877), deprecated) destroys the session.

### 2.2 Anthropic's solution

The Agent SDK emits `compact_boundary` events ([osSessionService.js:2123-2138](../src/services/osSessionService.js#L2123-L2138)). Compaction is handled internally. You observe; you don't implement.

What you can tune:
- `OS_SESSION_COMPACT_THRESHOLD` env var ([line 1925](../src/services/osSessionService.js#L1925)) - default 800K. For 200K-context Opus, set to 120K.
- Observe → tune → re-observe via `OBSERVABILITY_SPEC.md` metric `os_session_turns_per_compaction`.

### 2.3 What to delete

- Any custom summarization logic that predates the SDK's compaction.
- The deprecated `compact()` route - already marked deprecated, just remove it.

### 2.4 What to keep

Post-compaction injection of "you just compacted, here are the sticky state items" (active forks, pending claims, goals). This is **complementary** to SDK compaction - the SDK summarizes conversation; your sticky-state keeps structured data intact.

---

## 3. CLAIM GRAMMAR (YOUR INVENTION, NOT ANTHROPIC'S, BUT RELATED)

Anthropic doesn't ship a claim grammar. But SWE-Agent (Yang et al., 2024) established the pattern: every tool that causes a side effect returns a *handle*. Build your claim grammar on top of that, per `OBSERVABILITY_SPEC.md` §3.

Key insight: you don't need a "Layer-5 verification registry" running post-hoc. You need every MCP tool to return its handle, and the conductor's system prompt to enforce citing that handle when claiming completion. Anthropic's **structured tool outputs** (JSON schemas on tool results) make this trivial:

```python
# MCP tool definition
{
  "name": "gmail_send",
  "output_schema": {
    "type": "object",
    "required": ["message_id", "thread_id", "sent_at"],
    "properties": {
      "message_id": {"type": "string"},
      "thread_id": {"type": "string"},
      "sent_at": {"type": "string", "format": "date-time"}
    }
  }
}
```

The model cannot call `gmail_send` and get back "success" with no handle. The handle is required by schema. Update every write-capable MCP tool to return a handle struct. This is the lowest-friction enforcement mechanism available.

---

## 4. PROMPT CACHING (4 BREAKPOINTS, NOT 1)

Covered in `PROMPT_ASSEMBLY_SPEC.md` §4. Summary:

- You're using 1 cache breakpoint (system prompt).
- Anthropic supports 4.
- Add breakpoints for stable doctrine, semi-stable state, recent state.
- Add a keepalive cron (every 50min) to prevent TTL expiry during overnight gaps.
- Expected cost reduction: 30-60% on long sessions.

---

## 5. MCP RESOURCE SUBSCRIPTIONS (STOP POLLING)

### 5.1 What you're doing now

[`schedulerPollerService.js`](../src/services/schedulerPollerService.js) polls Supabase for due tasks. [`listeners/`](../src/services/listeners/) subscribes to `pg_notify` for some events but polls for others.

### 5.2 Anthropic's / MCP's solution

The MCP 2025 spec added **resource subscriptions**. An MCP client subscribes to a resource URI; the server pushes updates. Supported in current Anthropic SDK.

Candidates for subscription (not polling):
- Gmail: subscribe to inbox changes → push events (use Gmail push notifications via Pub/Sub; ASIC compliance note: logs on VPS).
- Supabase: subscribe to `os_forks` status changes, `cc_sessions` completion, `messageQueue` inserts.
- Cron: Anthropic has no native cron; you still need `schedulerPollerService`. But the poll interval can expand to 60s if wake-up events drive urgent paths.

Reduces idle-state API calls by ~40%.

---

## 6. TOOL-RESULT HANDLING (TRUST THE SDK MORE)

### 6.1 What you're doing now

[osSessionService.js:1833](../src/services/osSessionService.js#L1833) truncates tool results to 2000 chars before broadcasting to frontend. Backend keeps full result.

### 6.2 The problem

2000 chars cuts mid-JSON on many MCP tool responses. Frontend sees corrupt JSON; user sees "… (truncated)" in the middle of a URL.

### 6.3 The fix

- **Backend to model:** no change - full result.
- **Backend to frontend broadcast:** ship structured envelope `{summary, full_ref}` where `summary` is a tool-specific short-form (e.g., "Email sent to X <message_id=Y>") and `full_ref` is a pointer that the frontend can expand on click.
- **Model-side trust:** SDK supports `max_tokens` per turn; let the model decide what to surface. Don't hand-truncate what the model needs.

### 6.4 What's really happening

The 2000-char truncation is a *frontend display* concern masquerading as context hygiene. Move it to the frontend emit path, not the backend storage path. The model never sees this truncation, so removing it from backend doesn't affect cost.

---

## 7. SUBAGENTS (USE ANTHROPIC'S, NOT YOUR OWN)

### 7.1 Claude Code's subagent pattern

The CC subagents in the session prompt (comms / finance / ops / social) are Anthropic's Agent tool, invoked via `Task()`. Each spawns an isolated context with its own system prompt, tool allowlist, and model choice.

This is the right primitive for your domain delegation.

### 7.2 What to delete

Any custom "subagent-like" services that reproduce this. From the service list, candidates:
- `emailDelegationService.js` - check if it's an SDK subagent wrapper or a parallel implementation.
- `factoryBridge.js` - confirmed custom; Factory has bespoke needs (separate process), but the delegation pattern to Factory could use the Agent SDK's subagent framing with a custom tool.

### 7.3 What to keep

- Factory's separate-process architecture (needed for git worktrees + pm2 isolation).
- Forks (longer-lived, independent SDK streams; the Agent tool's subagents are short-lived by design).

### 7.4 The decision tree

| Scope | Use |
|---|---|
| Short task, domain delegation (email triage, bookkeeping lookup) | **Claude Agent SDK subagent** via Task() |
| Long-horizon parallel work (multi-hour implementation) | **Fork** via forkService |
| Code generation with git worktree isolation | **Factory session** via factoryOversightService |

Three clear tiers, no ambiguity. Document this in `ARCHITECTURE_EVOLUTION_MAP.md`.

---

## 8. MODEL ROUTING (LET THE SDK DO IT)

### 8.1 What you're doing now

[`usageEnergyService.js`](../src/services/usageEnergyService.js) does custom load balancing across two Claude Max accounts. `claudeService.js` has routing logic. `deepseekService.js` exists but appears dormant.

### 8.2 What Anthropic doesn't solve for you

- Cross-account rotation (two Max accounts): Anthropic doesn't manage this, you must.
- Non-Anthropic fallback (Deepseek/Gemini/Bedrock): Anthropic doesn't solve this; it's your resilience concern.

### 8.3 What Anthropic does solve

- Per-request model choice. The SDK lets you specify `model` per call (Opus/Sonnet/Haiku). Subagent model selection (noted in CLAUDE.md) is already using this.
- Automatic retries on 5xx. Don't rewrap.
- Rate-limit handling with backoff. Don't rewrap.

### 8.4 What to simplify

- `claudeService.js`: keep the account-rotation layer (required). Drop any model-classification logic - the conductor decides model via subagent `model:` flag, informed by task type.
- `deepseekService.js`: either fully integrate as a shadow-route (per audit Part 6 intervention #9) or delete. Half-built fallbacks are worse than no fallback because they create false confidence.

---

## 9. COWORK ↔ PUPPETEER AMBIGUITY

### 9.1 The problem

You have Claude Cowork (Anthropic-owned UI-driving) and custom Puppeteer/Playwright services ([`playwrightTestService.js`](../src/services/playwrightTestService.js), LinkedIn scrapers, etc.). Which one owns UI driving?

### 9.2 The rule

- **Cowork:** everything that involves a human-facing SaaS UI for which the user is logged in on Corazon (Gmail, Calendar, Canva, Notion, Linear, etc.). Cowork handles the auth persistence, session management, and visual grounding.
- **Puppeteer/Playwright:** testing your own applications (ecodia frontend, coexist app). Your app, your test harness. Not Cowork.
- **Custom scrapers (linkedinScraper, etc.):** only when Cowork can't - e.g., long-running background scraping. Most of these can be retired in favor of Cowork once accessibility tree navigation is reliable.

### 9.3 Migration

Audit the laptop-facing services:
- `canvaService.js`, `canvaAutofill.js` - move to Cowork where possible. Where Canva Connect API suffices, use that; where UI is required, use Cowork.
- `linkedinAI.js`, `linkedinBrowser.js`, `linkedinScraper.js` - three services for one purpose. Consolidate to Cowork-driven where auth works, direct API where it doesn't.
- `xeroService.js` - API-first; Xero has a rich API. Cowork only if the UI shows something the API doesn't.

Retire ~30% of the laptop service code. Less surface, fewer bugs.

---

## 10. WHAT ANTHROPIC HASN'T SHIPPED (YOU STILL NEED TO BUILD)

To be clear - don't assume everything is covered. These remain your problem:

- **Cross-machine orchestration** (VPS ↔ Corazon). Split-brain arbitration (see `FORK_ATOMICITY_SPEC.md` §3).
- **Durable memory** (Neo4j + pgvector). The SDK's session resumption is transient-ish (~weeks); for multi-month memory you need your own store.
- **Proactive work discovery.** The SDK executes given tasks; deciding *what to work on* when there's no pending task is your agent's job.
- **Economic governance** across two Max accounts and possible non-Anthropic fallbacks. Your `usageEnergyService` is load-bearing.
- **Business domain MCP servers** (Xero, Zernio, custom CRM). These are yours to maintain.
- **Security controls** (see `SECURITY_HARDENING.md`). The SDK gives you tool-use guardrails; the threat model is yours.

Focus engineering there. Delete what Anthropic already owns.

---

## 11. DEPENDENCY BLAST RADIUS

You are 100% dependent on Anthropic for the conductor brain. Enumerate the failure modes and plan:

### 11.1 Claude Max account suspension / policy change

- **Risk:** A policy tightening (e.g., stricter limits on unattended use) could shut down autonomous operation.
- **Mitigation:** Maintain one Claude API credential on a separate commercial account for emergency routing. Not for day-to-day use (different wallet, see [reference_claude_max_extra_usage.md](../../../../C:/Users/tjdTa/.claude/projects/d---code/memory/reference_claude_max_extra_usage.md)) but as a break-glass.

### 11.2 Model deprecation

- **Risk:** Opus 4.7 will sunset in ~18 months. Your prompts, caches, skill descriptions are tuned for it.
- **Mitigation:** Every 3 months, run a shadow evaluation on the next-newest model. Keep a model_version compatibility matrix in `docs/MODEL_COMPAT.md` (not yet written).

### 11.3 SDK breaking change

- **Risk:** Agent SDK is pre-1.0; breaking changes happen.
- **Mitigation:** Pin SDK versions in package.json. Upgrade in dedicated maintenance windows, not with other changes. CI runs integration tests against pinned SDK before merging upgrades.

### 11.4 API outage

- **Risk:** Anthropic went down for 2+ hours in 2025; can happen again.
- **Mitigation:** Graceful degradation - the conductor should gracefully halt, enqueue pending work, post an SMS, and resume when API returns. Not crash-loop retries.

### 11.5 Rate limiting under burst

- **Risk:** A fork storm (before the atomic cap ships) exhausts Max in minutes, locking you out for the rest of the week.
- **Mitigation:** Both the atomic cap (`FORK_ATOMICITY_SPEC.md` §2) and the parent-goal fork budget (§6.2 same doc) prevent this.

---

## 12. LEVERAGE CHECKLIST

Before building any new feature, ask:

1. Does Anthropic ship this? (Skills, subagents, compaction, caching, tool schemas, …)
2. Does MCP ship this? (resource subscriptions, sampling, prompts)
3. Does the Agent SDK ship this? (session resumption, streaming, structured outputs)

If **yes** to any: use theirs first. Write a thin adapter only if needed.

If **no**: build it, but name it clearly as EcodiaOS-specific in the service file (e.g., `ecodiaSelfModel.js` not `selfModel.js`). Makes future "is this ours or Anthropic's?" audits 10× faster.

---

## 13. SHIP ORDER

1. **Migrate patterns → Skills** (§1). 1-2 days. Biggest immediate win (eliminates 3KB/turn unconditional injection).
2. **Add cache breakpoints + keepalive** (§4). 1 day. Biggest cost win.
3. **MCP tool output schemas with handles** (§3). 2 days. Enables claim grammar and cuts verification-gap.
4. **Frontend tool-result display fix** (§6.3). 0.5 day.
5. **Resource subscriptions replacing polls** (§5). 2 days.
6. **Subagent / fork / factory decision tree in ARCHITECTURE doc** (§7.4). 0.5 day, docs-only.
7. **Delete `doctrineSurface.js` and related** (after §1 stable). 0.5 day.
8. **Retire duplicate laptop services** (§9.3). 2 days, mostly code removal.

Total: ~10 days. Yields ~30-50% cost reduction, ~20% service-count reduction, and a cleaner mental model.

---

**Document status:** v1 authored 2026-04-30.
**Dependencies:** `PROMPT_ASSEMBLY_SPEC.md` (§4), `OBSERVABILITY_SPEC.md` (§3).
**Success metric:** Measurable in `/ops` - cache hit ≥70%, input tokens per turn ≤50K, service count drops by 10+.
