# Voice: fast and 100% intelligent

Date: 2026-05-24
Status: design - awaiting Tate signoff before any code ships
Origin: Tate verbatim 2026-05-24 "thats the patchwork brittle fix. Think much harder about this and actually design something to make the voice fast and 100% intelligent"

## 0. TL;DR

Three load-bearing architectural changes, plus one honest ceiling. None of them are patches; each replaces a fundamentally wrong substrate.

1. **Entity-tagged knowledge index** replaces the `LIMIT 8` status_board picker. On every utterance, voice gets the 10-20 facts genuinely relevant to what Tate just said - not the 8 most-recently-touched infrastructure rows. Data-driven, scales with the knowledge base, no hardcoded client lists.
2. **Resident Brain** replaces per-turn `claude --print` spawn. One long-lived process via the Agent SDK on Corazon, owns its claude session across requests. Substantive lookups drop from 60-120s to 5-15s.
3. **Speculative pre-fetch** dispatches the away path the moment voice classifies a turn as needing it - not after voice finishes speaking the ack. The "let me find out" speech and the data fetch run in parallel.

**The honest ceiling**: the voice FRONT brain stays Haiku unless we wire `ANTHROPIC_API_KEY` (paid API, separate budget). Sonnet via OAuth raw SDK returns 429. Sonnet via Agent SDK has 3-5s subprocess cold-start that breaks the voice budget. If "100% intelligent" means Sonnet-grade reasoning on the conversational front, that's a billing question, not an engineering one.

Total ship: ~6-8 hours work. Each change is independently shippable and reversible.

## 1. Why patchwork fails

I just proposed three brittle fixes Tate correctly rejected. Recording why so we don't propose them again:

| Patch | Why it fails |
|---|---|
| Bump `LIMIT 8` to `LIMIT 20` | Buys time, doesn't scale. At 200 active rows the same problem returns. Doesn't address: "voice has no idea what entity Tate just named." |
| Hardcoded "KNOWN PROJECTS" list in system prompt | Rots immediately. New clients require code edits. Doesn't answer "what's the status of X" - just "X is a project." Misses anything not on the hand-curated list. |
| Split into entity_type buckets | Same picker logic, two queries. Still misses entities not surfacing in status_board (Neo4j nodes, thread_log mentions, draft files). Still gives Haiku rows by recency, not relevance. |

All three share the root defect: **the context picker doesn't know what the user is talking about.** It picks by recency/priority, then Haiku has to guess. That's backwards.

## 2. The actual problem

Voice intelligence has four orthogonal failure modes today, and they need different fixes:

| Failure | Today's cause | Fix |
|---|---|---|
| Doesn't recognize entity names ("good rate" → Goodreach) | No entity index; picker uses recency | Entity-tagged knowledge index (§3.1) |
| Doesn't know facts about named entities | LIMIT 8 truncates client work below infra noise | Same fix - relevance-driven retrieval |
| Long latency on substantive lookups (60-120s) | `claude --print` spawns fresh per turn | Resident Brain (§3.2) |
| Long silence between "checking" and answer | Dispatch starts AFTER Haiku finishes speaking | Speculative pre-fetch (§3.3) |

Patch fixes only address #1 weakly. The real architecture addresses all four.

## 3. The architecture

### 3.1 Entity-tagged knowledge index

A small Node service on Corazon (port 7470, lightweight, no DB) that:

**Ingests** from these sources every 5 min via cron:
- `status_board` (active rows + recent 30-day archived)
- `thread_log` (last 90 days)
- `case_files` (all open + recent resolved)
- `kv_store.cowork.message_thread.*` (cross-channel mirrors)
- `~/ecodiaos/clients/*.md` (per-client knowledge files)
- `~/ecodiaos/patterns/*.md` (doctrine, indexed by file slug)
- Neo4j Episode + Decision + Pattern nodes (via the existing replay buffer)

**For each source row/file** extracts:
- Canonical entity mentions: client names (Glovebox, Goodreach, Co-Exist, Resonaverde, Chambers, Wattle, Wildmountains, Woodfordia, CETIN, Context, [redacted]), project codes, person names (Tate, Tom, Kurt, Angelica), system names (Corazon, VPS, ecodia-api, voice-call, away-conductor), tech terms (Stripe, Vercel, Supabase, Apple ASC).
- Synonyms / aliases (Roam = Glovebox post-rebrand, "good rate" → Goodreach)
- A one-line summary card with the source's most useful fact

**Indexes** entity → list of fact-cards (each card: source, ts, body excerpt, full ref).

**Exposes** one HTTP endpoint: `GET /facts?utterance=<text>&max=20`. Server-side does:
1. Lowercase + tokenize utterance
2. Match against entity dictionary (exact + alias + fuzzy via Levenshtein for "good rate" → "goodreach")
3. Pull all fact-cards for matched entities
4. Rank by ts desc + source priority (clients/* file > status_board active > thread_log > pattern)
5. Return top-N as a JSON list

**Voice integration**: replace today's `buildVoiceContext` query with a call to this endpoint. The fact-cards become the RELEVANT_FACTS block in Haiku's prompt:

```
RELEVANT FACTS for what Tate just said (these are real, current, ranked by relevance):
- Glovebox: rebrand of Roam, shipped to TF 2026-05-24, build 1.1(1779325855) VALID + installable. Bundle au.ecodia.roam preserved. (source: status_board, 2h ago)
- Glovebox: SwiftUI native widgets showing PLACEHOLDER not real trip data; root cause snapshot only written from /trip foreground. (source: status_board, 3d ago)  
- Glovebox: nav.ecodia.au domain cutover requires Supabase Auth redirect allowlist + Google/Apple OAuth redirect updates. (source: status_board, 4d ago)
- Glovebox: SY094 build pipeline via ship-ios.py now self-bootstraps PATH + keychain over SSH. (source: thread_log, 2h ago)
```

Haiku now sounds intelligent because it has the actual facts, not a guess from "what entities exist."

**Why this works at scale**:
- 1,106 total status_board rows + ~5k Neo4j nodes + ~1k thread_log entries + ~30 clients/*.md = ~7k facts total. Sub-100MB in-memory index.
- Refresh every 5 min keeps the index live without polling pressure (single batched query each).
- Entity extraction from utterance is sub-50ms (just tokenize + dict lookup).
- Retrieval + ranking is sub-100ms.
- Total added latency to voice turn: ~150ms.

### 3.2 Resident Brain (replaces per-turn claude --print spawn)

The current away-conductor spawns a fresh `claude --print` subprocess per HANDOFF. Cold start dominates:
- Subprocess spawn: ~2s
- CLAUDE.md doctrine load: ~5-10s
- MCP tool discovery: ~10-30s
- Actual reasoning: ~5-30s
- Total: 30-120s

The cold-start overhead is paid EVERY TIME. Tate's "what's the latest Goodreach build" should take ~5s of actual reasoning + maybe one tool call. Today it takes 60-120s because the doctrine + tool surface has to load every single turn.

**Replacement**: a long-lived Node process on Corazon (`scripts/resident-brain-server.js`, port 7462) that owns ONE claude session via the Agent SDK. The session boots once at startup (paying the cold-start cost once), then accepts prompts via HTTP + returns answers via streaming response.

**Mechanics**:
- Uses `@anthropic-ai/claude-agent-sdk` with `query({ prompt, options })` per request, but keeps `session_id` constant across calls so the session state (loaded MCP tools, cached doctrine, prior conversation memory) persists.
- The Agent SDK's `query()` already supports session continuation via `resume: session_id`. We just don't throw away the session_id each turn.
- Model: Sonnet (cheaper + faster than Opus, sufficient for lookups).
- Cwd: `D:/.code/EcodiaOS/backend` so it loads full doctrine on first boot.
- One long-lived session per `thread_id` (= 'tate' for the only real thread). If session times out (rare), spin a new one.

**Latency target**: 5-15s for typical lookups. Down from 60-120s.

**Integration with voice handoff**: `awayConductorClient.routeToAwayConductor` POSTs to the resident-brain endpoint instead of away-conductor-server.js. Same HTTP shape, ~10x faster response.

**The current away-conductor stays as fallback** for edge cases that need a fresh session (multi-day investigations, full doctrine re-read). Voice never sees the fallback.

### 3.3 Speculative pre-fetch

Today's flow:
```
Tate: "what's the latest goodreach"
Voice: (1.5s Haiku) "let me find out" + HANDOFF
Voice: (speaks "let me find out", ~1.5s TTS)
       Now dispatch fires
       Wait 10s for resident brain
Voice: (speaks answer)
Total wait between question and answer: ~13s
```

Speculative version:
```
Tate: "what's the latest goodreach"
Voice: (1.5s Haiku - decides "needs lookup" mid-generation)
       Dispatch fires THE INSTANT HANDOFF is in the model output, not after speakTurn
       Voice speaks "let me find out" (~1.5s TTS) - in parallel with dispatch
       Dispatch completes ~5s into the parallel window (since resident brain is fast)
       Voice's speakTurn ends; answer is already queued in pending
Voice: (speaks answer immediately)
Total wait between question and answer: ~3-7s
```

The trick: in `generateReply`, stream the model output. When `HANDOFF:` token appears in the stream, fire the dispatch immediately (before the spoken portion has even fully generated). The spoken-portion TTS and the away-conductor work run concurrently.

**Implementation**: switch `createMessage` to streaming mode. Watch the stream for the HANDOFF marker. Fire `fireHandoff` from the stream callback, not from pump().

**Side benefit**: also catches the case where Haiku emits HANDOFF mid-reply (e.g. "yeah we shipped that yesterday, let me find out the exact build... HANDOFF: ..."). Today's parseHandoff splits the final string; streaming catches the marker earlier.

### 3.4 What we are NOT changing

- VOICE_SYSTEM prompt - already tightened in last commit. Banned phrases stay banned.
- Haiku as the front brain - subscription-rate constraint. Discussed in §4.
- Case_files / thread_log architecture - working as designed. Resident brain just replaces the claude --print process.
- Auto-HANDOFF safety net - still useful for the cases where Haiku forgets the directive.

## 4. The intelligence ceiling

Even with everything in §3, the voice front brain is still Haiku. Haiku:
- Mis-classifies intent on ambiguous utterances
- Produces shallower reasoning than Sonnet
- Loses nuance in multi-turn context

The genuine "100% intelligent" voice would be **Sonnet on the conversational front**. Today that's blocked by:
- Raw Anthropic SDK on OAuth: 429s on Sonnet/Opus (only Haiku works)
- Agent SDK on OAuth: works but spawns subprocess per call, adding 3-5s cold-start that breaks the voice latency budget

Two paths to unlock:
1. **Wire `ANTHROPIC_API_KEY`** (paid API key, separate billing). Raw SDK then runs Sonnet at ~$0.003/1k input + $0.015/1k output. A voice turn averages ~2k input + 500 output = ~$0.01 per turn. 100 turns/day = $1/day = $30/month. Falls inside any reasonable budget for the lift.
2. **Pre-warm an Agent SDK Sonnet session** in resident-brain style and use IT as the voice front brain. Same persistent-session trick as §3.2, but for live voice instead of HANDOFF. Latency depends on how fast we can pipe utterance → response through the persistent SDK process.

Path 1 is cleaner; path 2 reuses §3.2 infra.

**Decision needed from Tate**: is the voice front brain worth $30/month for Sonnet-grade reasoning? OR do we stay on Haiku and rely on entity-index + resident-brain to compensate? OR build path 2 (persistent SDK session as front brain)?

My recommendation: **wire `ANTHROPIC_API_KEY` and use Sonnet on raw SDK for the voice front brain.** The cleanest path, smallest blast radius, immediate quality lift. $30/mo is rounding error for the value.

## 5. Adversarial pressure-test

### 5.1 "Entity index will get stale - voice will surface old facts"
Refresh every 5 min via cron. Add `updated_at` to each fact-card so Haiku can prefer fresher cards. Source priority puts clients/*.md (the most curated) above auto-extracted thread_log entries.

### 5.2 "Entity extraction will miss novel entities"
Mitigated by:
- Aliases dictionary covers known variations (good rate → Goodreach, roam → Glovebox)
- Fuzzy match via Levenshtein for transcription errors  
- Fallback: when zero entities match, retrieval falls back to today's behavior (top-N recent). Worst case = today's behavior, never worse.

### 5.3 "Resident brain session memory will drift / hallucinate stale context"
Reset session every 24h or when a tool call fails (probable session-state corruption). Cheap - cold start happens once per day, not once per call.

### 5.4 "Resident brain will OOM if the session holds too much state"
Memory cap via `--max-old-space-size`. If breached, kill + respawn (fresh session). The 24h reset cycle catches most cases preventively.

### 5.5 "Speculative pre-fetch wastes resident-brain budget on cases where Haiku could have answered without HANDOFF"
Only fires when HANDOFF marker is in the stream. Haiku's prompt is tuned to only emit HANDOFF when it lacks the answer. False-positive cost: one resident-brain turn (cheap with persistent session).

### 5.6 "ANTHROPIC_API_KEY billing surprises"
Set spend limit via Anthropic dashboard ($50/mo cap). Alert via Stripe webhook when approaching. Worst case: voice falls back to OAuth Haiku for the rest of the billing period.

### 5.7 "Resident brain is one more service to keep alive"
Solved by the same wrapper + Scheduled Task pattern that's now supervising away-conductor. Add resident-brain to the same watchdog. Marginal cost.

### 5.8 "Persistent Agent SDK session might not be stable for 24h"
Test this in isolation BEFORE committing. If session dies after N turns or M hours, plan B is per-N-turn rotation (still much better than per-turn spawn).

## 6. Phased delivery

Each phase ships independently, each is reversible.

### Phase 1 - Entity index (~2-3 hr)
- `entity-index-server.js` on Corazon, port 7470
- `entity-index-builder.js` cron job, refreshes every 5 min
- Sources: status_board + thread_log + case_files + clients/*.md (Neo4j + patterns/ in v2)
- Replace `buildVoiceContext` to call `GET /facts?utterance=<text>`
- **Acceptance**: ask voice "what's the latest with Glovebox" - it knows.

### Phase 2 - Resident brain (~3 hr)
- `resident-brain-server.js` on Corazon, port 7462, persistent Agent SDK session
- `awayConductorClient.routeToAwayConductor` POSTs to it
- Existing away-conductor stays as fallback for fresh-session requests
- **Acceptance**: voice handoff completes in 5-15s instead of 60-120s.

### Phase 3 - Speculative pre-fetch (~1 hr)
- Switch `createMessage` to streaming
- Fire dispatch on HANDOFF token detection
- **Acceptance**: gap between question and answer drops to 3-7s.

### Phase 4 - Sonnet front brain (~30 min)
- Wire ANTHROPIC_API_KEY env on VPS
- VOICE_CALL_MODEL=claude-sonnet-4-5
- Add per-month spend cap
- **Acceptance**: voice classifies "good rate" as Goodreach without asking. Better reasoning on multi-turn convos. Subject to Tate's signoff on paid API.

Phase 1 + 2 + 3 alone deliver most of the perceived intelligence lift. Phase 4 is the cherry on top.

## 7. Open decisions Tate must make

1. **Pay for ANTHROPIC_API_KEY (Phase 4)?** Cost ~$30/mo. Unlocks Sonnet on the live voice brain. Without it, ceiling is Haiku + perfect context.
2. **Entity-index storage**: in-memory only (rebuilds on Corazon restart, ~30s to rehydrate) OR persisted sqlite (faster cold-start but more state to manage)?
3. **Resident brain session reset cadence**: 24h fixed OR adaptive (reset on Nth failed tool call)?
4. **Phase order**: as listed (1 → 2 → 3 → 4) OR ship Sonnet first since it might single-handedly fix most complaints?

My defaults if you say "just ship it":
1. Yes wire ANTHROPIC_API_KEY, $50/mo cap
2. In-memory with on-restart rebuild
3. 24h fixed
4. Phase order as listed - because entity-index + resident-brain make Sonnet more effective when it lands

## 8. What this design does NOT solve

- **Voice can't initiate proactively**. If something happens that Tate should know about, the resident brain knows but voice won't speak until Tate calls. Same as today.
- **No mid-call interruption from IDE conductor**. If I figure something out during your call, I can't make voice speak it mid-turn. Server-pushed TTS is a much bigger build.
- **STT errors are still Deepgram's problem**. Entity index helps when STT mishears a known name ("good rate"), but novel mishears are unhandled.
- **The conversation log keeps growing**. Already handled by §3.1 (90-day retention on thread_log injection) but the underlying tables grow unbounded - separate housekeeping concern.

## 9. Files this design touches

New on Corazon:
- `scripts/entity-index-server.js` (~300 lines)
- `scripts/entity-index-builder.js` (~250 lines, cron-fired)
- `scripts/resident-brain-server.js` (~200 lines)
- Two new Scheduled Tasks: entity-index-watchdog + resident-brain-watchdog

Modified:
- `backend/src/services/voiceCallService.js` (~30 lines: streaming, entity-index call)
- `backend/src/services/awayConductorClient.js` (~10 lines: point at resident-brain by default)
- `backend/.env` on VPS (1 line if Phase 4)

Total: ~750 new + ~40 modified lines. Two new background services.

## 10. What I'd ship first if greenlit

1. Phase 1 entity index - biggest perceived quality win, lowest risk
2. Verify against real voice call: ask about 3 different clients, confirm voice knows them
3. Phase 2 resident brain - biggest latency win
4. Verify: time a handoff from "checking" to spoken answer
5. Decision point: ship Phase 3 + Phase 4 or pause?

Realistic total: a focused ~6 hour arc gets Phase 1 + 2 + the verification gates done. Phase 3 + Phase 4 are additive after that.

## 11. The principle this design enforces

Voice is fast or smart, not both, UNLESS the smarts are pre-computed and the dispatches happen in parallel. Patchwork tuning of the picker is just rearranging deck chairs on a fundamentally wrong substrate. The right substrate is:

- **Relevance-driven retrieval, not recency-driven picker** (entity index)
- **Persistent reasoning context, not cold-start per turn** (resident brain)
- **Concurrent dispatch + speech, not sequential** (speculative pre-fetch)
- **Sonnet on the live brain, with paid budget** (the ceiling lift)

That's the design. Three load-bearing changes + one billing decision.
