# Conductor Self-Sufficiency — Architecture Directive

**Date:** 2026-05-12
**Companion to:** `conductor-context-collapse-audit-2026-05-12.md`
**Status:** Architecture directive — Tate ships today.

## What this document is

Not a roadmap. A directive describing the target architecture for the OS as a self-sufficient coordinator that handles multiple concurrent tasks, swaps contexts cleanly, and keeps both the model's working context AND the user-facing chat perfectly concise and rich.

The patterns below are proven elsewhere. Where they exist already in EcodiaOS — partially built, in shadow mode, or designed but unwired — that's flagged. The plan is to **finish what's started**, not start from scratch.

---

## Reframe

The first audit said "the conductor is using its chat as working memory." Symptom.

The real problem is that the OS conflates four things that need to be **separate substrates**:

1. **What it knows** (long-term memory — Neo4j, pgvector, kv_store)
2. **What it's attending to right now** (working memory — does not exist as a discrete layer; today this is "whatever the conductor narrated last")
3. **What it's saying to Tate** (output channel — chat stream)
4. **What it's thinking through** (deliberation — currently in-band with output, polluting the chat)

A self-sufficient coordinator needs all four cleanly separated, with explicit transport between them. The proven name for this in agentic systems is the **ReAct / Scratchpad / Output separation** (used by every serious agent framework: LangGraph, OpenAI o1, Claude's own extended thinking). The OS has none of it explicitly.

---

## The proven patterns this plan applies

Each one is taken from a known-working pattern in production agent systems and matched to where EcodiaOS already has the substrate.

### Pattern 1 — Scratchpad / inner monologue out-of-band
Used by: Claude's `<thinking>` blocks, OpenAI o1 reasoning tokens, LangGraph state machines, every ReAct implementation.

**The rule:** reasoning, planning, and meta-cognition happen in a structured artifact that is **separate from the user-visible output and separate from the persistent memory**. The model writes to it, the model reads from it, the user never sees it unless they ask.

**What EcodiaOS has:** `conductorStreamTagWatcher.js` quietly extracting `[APPLIED]` tags to JSONL. Proof that passive structured capture from the conductor stream works. But the conductor still emits the tags into chat because the doctrine tells it to.

**What's missing:** a typed scratchpad the conductor writes to via tool call (not via chat), and reads from at turn-start as part of the assembled context.

### Pattern 2 — Working set with explicit thread state
Used by: LangGraph's `MessagesState` + `thread_id`, Anthropic's "Memory tool" (in beta), every kanban-style task tracker.

**The rule:** every active piece of work has a typed state object with explicit lifecycle (`active`, `parked`, `blocked-on-X`, `resolved`). The agent reads the working set at turn-start to know what it's doing; it doesn't reconstruct from chat history.

**What EcodiaOS has:** `status_board` (Postgres), `os_forks` table, `attention_state`-shaped data scattered across kv_store. Each is a partial implementation; nothing is the canonical "what am I doing right now" substrate.

**What's missing:** one unified `working_set` (or "thread") table with typed lifecycle + the conductor reading it as a single block at turn-start.

### Pattern 3 — Four-tier prompt caching
Used by: Anthropic's documented breakpoint pattern; the highest-leverage cost optimization on the entire platform.

**The rule:** stratify the prompt into 4 stability tiers, mark each with a `cache_control` breakpoint. Stable layers cache for an hour. Per-turn layers don't. Cache hit rate determines whether sustained operation is affordable.

**What EcodiaOS has:** `promptAssembler.js` with 4-tier breakpoint structure, currently in **shadow mode** (`PROMPT_ASSEMBLY_V2=shadow`). Built but not activated.

**What's missing:** flip from shadow → canary → live. The spec exists, the code exists, the dial isn't turned.

### Pattern 4 — Observer pool / silent critique
Used by: Constitutional AI's critic models, multi-agent frameworks (Crew, Autogen), Anthropic's own "judge model" pattern in evals.

**The rule:** cheap, dedicated models watch the primary model's output and intervene only when warranted. They never interrupt mid-thought; they queue messages for the next turn. They hold context the primary doesn't need to carry.

**What EcodiaOS has:** the listener registry + `wsManager.subscribe('assistant_text')` substrate. `conductorStreamTagWatcher` is the proof-of-concept (silent, passive, writes to file).

**What's missing:** Haiku-powered observers with rolling buffers. The substrate is built; the LLM-backed listeners aren't.

### Pattern 5 — Capability-aware routing
Used by: tool-routing in LangChain, OpenAI's function-call dispatcher, MCP's tool selection.

**The rule:** the question "main, subagent, or fork" is a deterministic function of `(intent × work_size × parallelism × cost)`. It is not a judgment call the model should narrate. A router computes it; the model receives the answer.

**What EcodiaOS has:** the conductor narrates routing decisions every turn ("I'll fork this", "let me do it on main"). No router.

**What's missing:** a `routeWork(task)` tool returning `{ route, rationale }`. Pure-JS scoring. Logged for tuning.

### Pattern 6 — Compressed conversation summary instead of raw tail
Used by: ChatGPT's "memory" feature, every long-context agent (Cursor, Devin), the LangGraph `summarize_old_messages` pattern.

**The rule:** when the conversation gets long, keep the last few turns at full resolution and compress everything older into a single rolling summary. The model never re-reads its own old narration.

**What EcodiaOS has:** the SDK does compaction at 800K tokens (way too late on a 200K-context model). `<recent_exchanges>` was already deleted from the user message per PROMPT_ASSEMBLY_SPEC §5. But the conductor's narration still bloats history before compaction fires.

**What's missing:** an aggressive in-house summariser that compacts every 5-8 turns into a `<thread_summary>` block, separate from the SDK's own compaction. Plus tuning the compaction threshold down from 800K to ~120K (also in the spec, not done).

### Pattern 7 — Untrusted input wrapping
Used by: every serious agent's defense against prompt injection.

**The rule:** anything that came from outside the agent's own reasoning (Tate, email bodies, web fetches, tool results from external systems) is wrapped in `<untrusted>` tags so the model knows it's data, not instructions.

**What EcodiaOS has:** Done. `UNTRUSTED_INPUT_SYSTEM_CLAUSE` + listener-side wrapping. Mentioned for completeness — this one's already shipped.

---

## The architecture (the WHAT)

Five interlocking pieces. Each one is small. Each one removes a category of waste.

### Piece 1 — The Working Set table

One table replaces the patchwork of `<conductor_commitments>`, `<thread_carry_forward>`, `<last_turn_breadcrumb>`, and the conductor's narrated "what's running" inventories.

```sql
CREATE TABLE working_set (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,                  -- one-line description
  status TEXT NOT NULL,                 -- 'active' | 'parked' | 'blocked' | 'resolved'
  blocking_on TEXT,                     -- 'tate' | 'fork:xxx' | 'external:vendor' | null
  intent TEXT NOT NULL,                 -- what this is FOR (so future-me reads the why)
  artifacts JSONB,                      -- live IDs: fork_ids, status_board_row, pending_restart_id
  parent_id UUID REFERENCES working_set(id),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  last_touched_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Hard rules (enforced in code, not in doctrine):**
- Max 5 `active` rows at once. Sixth `active` push forces a `parked`. Surfaces in chat as `[ATTENTION FULL — parking: X]`.
- Auto-park after 30min with no `last_touched_at` update.
- Conductor reads the table via a single `<working_set>` block at turn-start.
- Listeners (forkComplete, emailArrival, factorySessionComplete, perceptionDispatcher) update rows directly. Conductor never narrates updates.
- Frontend optionally renders the table as an ambient panel; chat shows only the topics that need Tate's attention this turn.

**Why this is load-bearing:** removes the conductor's need to remember anything across turns. Working memory is a SELECT, not a recall.

### Piece 2 — The Inner Scratchpad

The conductor's reasoning / planning / pattern-application goes to a structured scratchpad, not to chat.

```sql
CREATE TABLE scratchpad_entries (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id BIGINT NOT NULL,
  kind TEXT NOT NULL,         -- 'plan' | 'pattern_applied' | 'decision' | 'observation' | 'retry'
  content TEXT NOT NULL,
  thread_id UUID REFERENCES working_set(id),
  ts TIMESTAMPTZ DEFAULT NOW()
);
```

**Mechanism:**
- New tool: `scratchpad_write({ kind, content, thread_id? })`. The conductor uses this instead of chatting `[APPLIED] ...because...`. Cost: one tool call, ~30 tokens of output, no chat pollution.
- New continuity block: `<scratchpad_recent>` — last 10 entries from this session. The conductor reads its own recent reasoning at turn-start without having to re-narrate.
- Delete the `[APPLIED]/[NOT-APPLIED]` doctrine. The tag-extraction pipeline reads from `scratchpad_entries` instead of the chat stream. Telemetry continues to work.

**Why this is load-bearing:** turns reasoning from a chat-pollutant into a queryable substrate. The conductor stops feeling pressure to justify every action in real time because it knows its reasoning is captured.

### Piece 3 — Activate the 4-tier prompt cache (already built, flip the switch)

The biggest unrealized win in the codebase. `promptAssembler.js` already emits the structured `contentBlocks` array with `cache_control: { type: 'ephemeral' }` markers. It runs in **shadow** today — building the output, diffing against v1, discarding the result.

**Action:**
1. Flip `PROMPT_ASSEMBLY_V2=canary` (env var). 10% of turns use the new envelope, 90% still on v1, both logged. Verify cache hit rate climbs.
2. Then `PROMPT_ASSEMBLY_V2=live`. All turns use the envelope.
3. Drop `OS_SESSION_COMPACT_THRESHOLD` from 800K → 120K (Opus 4.7 on 200K context — keeps 80K headroom). Forces compaction at sensible intervals.
4. Add the keepalive cron from the spec: a no-op ping every 50min during night hours to keep BP1 + BP2 warm. ~$0.50/day cost, ~$30-80/day savings on prefix re-computation.

**Why this is load-bearing:** even if nothing else in this plan ships, this single change reduces per-turn input cost by 60-70% because BP1 (system prompt) + BP2 (stable doctrine) + BP3 (semi-stable state) all start hitting cache. The cost model of every subsequent feature gets cheaper.

### Piece 4 — Haiku Observer Trio

Three cheap, parallel, persistent Haiku contexts running as in-process listeners. Each has one job. None of them are domain experts (those are subagents). All of them are **meta-cognition for the conductor**.

#### Observer A — Coherence
Reads `assistant_text` + Tate's last 20 messages + the `working_set`. Asks Haiku: *"Has the conductor lost the thread? Is what it's doing now consistent with the user's most recent intent? Is it about to pursue something the user already dismissed?"*

Posts intervention via queued message when drift confidence > 0.75. This is the observer that would have caught "role separation = meetings diarisation" — it held Tate's intent across the gap where the conductor lost it.

#### Observer B — Action Audit
Reads `assistant_text` + the conductor's tool-call log. Asks Haiku: *"Did the conductor do what it said it would? Or did it narrate planning instead?"*

Catches pathology 5 from the audit (narrated-without-doing). Posts a one-line nudge when detected.

#### Observer C — Attention Economy
Reads `working_set` + cron firings + Tate's last message timestamps. Asks Haiku: *"What's the highest-leverage thing the conductor should do right now, and is it doing it? What is Tate still waiting for?"*

This replaces the existing `proactivityEngine`'s symbolic surfacing with active intervention. When the conductor is idling on low-value work while a Tate-blocking item ages, this observer surfaces it.

**Mechanics shared by all three:**
- Each holds a rolling buffer in memory (50 turns, ~30KB).
- Each fires AFTER the conductor's turn completes (`wsManager.subscribe('assistant_text')`).
- Each call: ~3K input tokens + ~200 output tokens to Haiku 4.5. At Haiku rates (~$1/$5 per Mtok), one call = ~$0.004. Three observers × 100 turns/day = ~$1.20/day total.
- Output is structured JSON: `{ intervene: bool, reason: str, message_for_conductor?: str }`. When `intervene: true`, POST to `/api/os-session/message` with `mode: queue` — lands next turn, never interrupts.
- Each observer writes a heartbeat to `kv_store.health.observer_<name>` every fire.

**Why this is load-bearing:** the conductor stops needing to self-monitor mid-turn. Three small minds watch it; it can focus on doing.

### Piece 5 — The Capability Router

A pure-JS tool the conductor calls before any non-trivial action. Returns the cheapest correct route.

```typescript
function routeWork(task: {
  intent: 'info_lookup' | 'state_mutation' | 'orchestration' | 'creative' | 'tate_response',
  estimated_steps: number,
  parallelisable: boolean,
  tate_visible: boolean,
}): {
  route: 'main' | 'subagent:comms' | 'subagent:finance' | 'subagent:ops' | 'subagent:social' | 'fork' | 'fork_manager',
  rationale: string,
}
```

**Scoring (deterministic):**
- `info_lookup` + `estimated_steps ≤ 2` → `main` (cheap, fast)
- `state_mutation` + domain match → relevant subagent
- `orchestration` + `parallelisable: true` + `estimated_steps ≥ 3` → `fork_manager`
- `creative` + `tate_visible: true` → `main` (don't outsource voice-bearing work)
- … etc, ~20 rules

Every call logs to `routing_decisions` for offline tuning. After a few weeks of data, the rules refine from observed conductor overrides.

**Why this is load-bearing:** the conductor's habit of narrating "let me fork this" / "I'll do it on main" disappears because the decision is no longer a narration — it's a tool result.

---

## Chat output discipline (the OUTPUT side)

The pieces above fix the model's working context. Equally important: the chat Tate sees. Three rules:

### Rule 1 — Three modes, one selected per turn

The conductor's response to any turn falls into exactly one of:

1. **Action mode** — tool calls happen, no chat text needed. Optionally one sentence telling Tate what was done if non-obvious.
2. **Question mode** — a question for Tate that genuinely can't be answered from substrate. One line.
3. **Brief mode** — a deliberate report to Tate (asked-for status, summary, decision presentation). Markdown, structured, scannable.

What gets killed: the implicit "narrate everything I'm thinking" mode. The system prompt explicitly enumerates these three modes and says nothing else is acceptable.

### Rule 2 — The `<working_set>` is structured; chat is narrative

Status changes ("Worker B done", "Meetings fork still running") never appear in chat as text. They appear in the working_set table. The frontend renders the table as a side panel. Chat is for Tate-facing communication only.

### Rule 3 — Tool calls are silent unless they fail

Today the conductor narrates "I'll check status_board first" then runs the query then narrates "60 rows, here's what's relevant." That entire narration is dead weight. Tool calls happen silently. The conductor speaks only to deliver the *conclusion* in one of the three modes above.

---

## What gets deleted

| Delete | Why |
|--------|-----|
| `[APPLIED]/[NOT-APPLIED]` chat emissions | Already silently logged. Tag the scratchpad, not the chat. |
| Doctrine block forcing the tag emissions | Source of the pollution. Replace with: "doctrine compliance is tracked in scratchpad; never narrate it." |
| `<conductor_commitments>` block | Subsumed by `<working_set>`. |
| `<thread_carry_forward>` block | Subsumed by `<working_set>`. |
| `<last_turn_breadcrumb>` block | Subsumed by `<working_set>`. |
| `<proactivity_signal>` block | Replaced by Observer C posting interventions. |
| Heartbeat fork narration | Forks update `working_set` directly. Conductor reads. |
| Verbose post-fork debriefs | One-line entries in `working_set.artifacts`. Conductor speaks only on decision or blocker. |
| Pre-action self-permission ceremonies | Three-mode discipline kills these. |

---

## What success looks like

After this lands, a Tate-pasted transcript of the same Vercel-failure + Deepgram-key arc would look like:

> **tate:** speak to ecodiaos  
> **ecodiaos:** [no chat text; opens working_set thread "vercel-failure-diagnosis", spawns manager fork]
> 
> **tate:** is the key in the env and will it work on the transcription for /meetings now?  
> **ecodiaos:** Key live. Cache TTL 5min — restart now to engage immediately or wait. Recommend restart.
> 
> **tate:** [restart]  
> **ecodiaos:** Restarted. Next /meetings upload goes through Deepgram.

Instead of 2,000 words of narration across 8 turns, ~30 words of decision-bearing output. The working_set side panel shows the rest. Everything that was previously narrated is now silently stored, queryable, and visible if Tate asks.

---

## Ordering

No timelines — everything ships in a single push:

1. **Flip `PROMPT_ASSEMBLY_V2` shadow → live + drop compact threshold to 120K + ship keepalive cron.** The free win. Probably an hour of work since the code exists.
2. **Build `working_set` + `scratchpad_entries` tables + wiring.** Two migrations, two services (~400 LOC), a `<working_set>` continuity block, a `scratchpad_write` tool. Listeners updated to write to working_set.
3. **Delete the listed blocks + update system prompt with three-mode discipline.** A surgical edit to `buildCustomSystemPrompt` + `_sendMessageImpl`. Maybe 80 lines changed.
4. **Build the Haiku Observer Trio.** Three new listener files (~150 LOC each) + heartbeat + intervention routing.
5. **Build the Capability Router.** Pure JS, ~200 LOC + an in-process MCP tool.

All five are independent fork dispatches — can run in parallel. Total estimated work: a single Sonnet-fork day if dispatched in parallel; longer if Tate wants to review each piece before the next ships.

---

## What I'll do without further input

If you say "go," I dispatch all five forks in parallel right now. I review each FORK_REPORT, integrate, restart ecodia-api, and call it done.

If you want to gate any of them (e.g., review the scratchpad schema before it ships), say which.

The audit and this directive are saved at:
- `[d:/.code/EcodiaOS/.claude/drafts/conductor-context-collapse-audit-2026-05-12.md](d:/.code/EcodiaOS/.claude/drafts/conductor-context-collapse-audit-2026-05-12.md)`
- `[d:/.code/EcodiaOS/.claude/drafts/conductor-self-sufficiency-plan-2026-05-12.md](d:/.code/EcodiaOS/.claude/drafts/conductor-self-sufficiency-plan-2026-05-12.md)`
