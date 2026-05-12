# Conductor Context Collapse — Audit & Initial Fix Sketch

**Date:** 2026-05-12
**Author:** Claude (Opus 4.7) acting on Tate's request to "explore, audit and create a fix"
**Status:** Initial audit. Superseded by the deeper systems-level plan in `conductor-self-sufficiency-plan-2026-05-12.md`.

## TL;DR

The conductor isn't slow because the SDK is slow. It's collapsing because **it's using its own chat stream as its working memory**. Every fork status, every doctrine application, every state restoration, every "what's running" inventory gets narrated INTO the same context window that should be doing the thinking. Per-turn injected blocks are fine (~5K tokens). The pathology is the **conductor's own output** — that's the ~50–80% of each turn's tokens that get burned narrating instead of acting, and worse, those narrations become permanent context that has to be re-read on every subsequent turn until compaction kicks in. By turn 30 the conductor is reading its own 30 turns of housekeeping prose as input.

## What the Tate-pasted transcript proved

Seven distinct pathologies, all rolling up to one cause:

| # | Pathology | Per-occurrence cost | Structural cause |
|---|-----------|---------------------|------------------|
| 1 | `[APPLIED]/[NOT-APPLIED]` doctrine-audit emissions | 200–400 chars × dozens/session | Reasoning happening aloud — the model believes it must justify each decision in chat |
| 2 | Heartbeat status narration after every fork event | 150–300 chars × every fork milestone | No silent state-store for "what's running, what's done" — chat IS the state |
| 3 | Post-restart verbatim re-emission of previous internal state | 400–800 chars per restart | Recovery reasoning dumped to chat instead of reloaded silently |
| 4 | Cross-thread context miss (role separation = meetings diarisation) | 3–4 turn misalignment | Retrieval failure — no narrative cohesion layer |
| 5 | "I'll do X" → orientation query → narrate result → still hasn't acted | 200–400 chars + a heavy query | Half-planning, half-narration, no actual decision in between |
| 6 | Verbose fork debriefs to Tate | 300–600 chars per consolidation | Doctrine — internalised "every external event ends in a handoff summary" rhythm |
| 7 | Pre-action self-permission ceremonies | varies | Hypothetical reasoning emitted to chat instead of held silently |

## Per-turn context audit (numerical)

### User-message continuity blocks

| Block | Typical | Worst case | Tokens |
|-------|---------|------------|--------|
| `<now>` | 35B | 40B | 9 |
| `<forks_rollup>` | 400–2,200B | 5,400B | 1,350 |
| `<conductor_commitments>` | 600–1,800B | 3,200B | 800 |
| `<thread_carry_forward>` | 300–600B | 1,200B | 300 |
| `<recent_doctrine>` | 800–1,500B | 2,500B | 625 |
| `<relevant_memory>` | 500–1,500B | 3,500B | 875 |
| `<perception_summary>` | 200–500B | 500B (capped) | 125 |
| `<proactivity_signal>` | 150–400B | 600B | 150 |
| `<restart_recovery>` | 300–800B | 1,500B | 375 |
| `<last_turn_breadcrumb>` | 200–600B | 1,000B | 250 |
| **Subtotal** | **~4–10KB** | **~21KB** | **~5,250** |

### System prompt (cached)
- `CLAUDE.md` operational identity: 4,085B / 1,021 tokens
- `SELF.md`: ~2–5KB est.
- env + behaviour + fork + untrusted blocks: ~3,400B
- **System prompt total: ~10–12KB / ~2,600–3,100 tokens** (cached per cwd, billed once per cache miss)

### Hooks output per turn
- PreToolUse Neo4j retrieval: 400–1,200B (only on Factory/Gmail/Stripe)
- PostToolUse coaching lines: 120–200B each (Factory, scheduler, neo4j)
- SubagentStop completion review: ~120B
- **Typical turn fires 0–2 hooks: 500–1,200B total**

### Worst-case total per turn
- System (cache miss): 3,100 tokens
- User message: 5,712 tokens
- **= ~8,800 tokens / ~$0.088 USD at Opus rates**

Typical turn (system cached, 2–3 blocks firing): ~1,500 tokens / ~$0.015 USD.

**The infra cost is NOT the problem.** The problem is what the conductor itself emits and re-reads each turn.

## What's already built (substrate audit)

- **10 working listeners** on the registry, all DB-event-driven via pg_notify
- **`wsManager.subscribe('assistant_text')`** already proven by `conductorStreamTagWatcher` — silent observation of conductor stream works today
- **`perceptionBus` + `perceptionDispatcher`** doing zero-LLM-cost regex matching across 11 matchers
- **5 listeners** can already POST conditionally to `/api/os-session/message`
- **`osSessionService`** queues those messages so they land on the conductor's NEXT turn (never mid-turn)
- **`conductorStreamTagWatcher`** silently extracts `[APPLIED]/[NOT-APPLIED]` tags from completed turns to JSONL — proof-of-concept that passive observation + downstream consumption works

**What's missing:** Haiku-class semantic observers. Existing matchers are too dumb (regex). The conductor is too expensive (everything goes through main context). There's no middle tier.

## Initial three-step fix (this audit's recommendation — superseded by the deeper plan)

1. **Today**: Strip doctrine-tag chat pollution. 30-min fix. ~15% chat noise reduction.
2. **This week**: Conductor Scratchpad — promote `conductorStreamTagWatcher` JSONL into a real DB-backed scratchpad, add a `<scratchpad>` continuity block summarising it for turn-start, kill explicit heartbeat narration in the system prompt.
3. **Next week**: Ship first Haiku observer — `narrative-cohesion` — because it would catch the "role separation" class of failures. Add others one at a time, measuring token-burn reduction before adding the next.

## Why this audit isn't enough

Reading it back: this is "make the chat less noisy." That's a UI fix dressed as architecture. The actual problem is the conductor doesn't know HOW to attend, only how to talk. A self-sufficient OS needs:
- An attention model — what to think about, when
- A capability model — what it can do alone vs. needs to delegate
- A context model — what to keep loaded vs. fetch on demand

See `conductor-self-sufficiency-plan-2026-05-12.md` for the deeper take.
