# One brain across voice + away + IDE - stateful coordination

Date: 2026-05-21
Author: EcodiaOS (IDE conductor)
Status: design - adversarial pass before any code ships
Source ask: Tate verbatim 2026-05-21 "neither the headless corazon opus or the call haiku were stateful, if i ended the call, whatever the handoff was from the first call was completely lost, so i thought why dont we make them both stateful, let haiku/sonnet communicate back and forth freely with the handoffs AND the chats currently working on corazon ide, so that it can ACTUALLY fully coordinate, and if i call it back later it can still access absolutely everything and wont lose anything if it receives info while im not on call with it"

## 0. TL;DR

Three brains today (voice-front Haiku, away-conductor headless Opus on Corazon, IDE conductor in Cursor/VS Code) each have private amnesia and three different ways of pretending to share context. Result: a HANDOFF from call #1 is gone by call #2, the away-conductor never sees what the IDE conductor did, and the IDE conductor never sees what happened on a voice call.

The fix is NOT new infrastructure. Five substrates already exist that do most of the work; nothing is fully wired:

- `cowork.message_thread.<channel>.<thread_id>` (kv_store) - per-channel mirrors. Voice doesn't write to it. Voice partially reads native's.
- `working_set` (postgres) - typed thread state with `intent`, `artifacts`, status. IDE conductor injects it on every turn. Voice/away invisible to it.
- `coord/inbox/chat.conductor.inbox` (filesystem) - cross-chat directive bus. Read by `conductor_heartbeat.py` hook. Already deny-list filtered. Already used by Opus to whisper into the IDE conductor.
- `coord/conductors/current.json` (filesystem) - IDE conductor heartbeat with an `in_turn` boolean. Already read by away-conductor to defer.
- `neo4j_episodes_queue` (postgres) - durable memory. Already written by triage + execute.

The proposal: a **single thread-scoped conversation log** keyed by `thread_id` (= `tate` for the only real thread), with channel-tagged entries, **case files** for in-flight handoffs, and **two thin cross-brain protocols** (poke and tail) that let all three brains read each other's recent activity without anyone having to remember to write.

Time to ship a useful v1 (phases 1 + 2 + 3, voice never loses anything, away knows what voice said, IDE conductor knows what happened while it was off): ~4-5 hours work.

## 1. Statefulness map - exactly what is lost today

Every cell below is a concrete amnesia. The matrix is brain x state-kind x scope.

| State kind | Voice (per WS conn) | Away (per `claude --print`) | IDE (per session) |
|---|---|---|---|
| **In-progress conversation history** | held in `history = []` in [voiceCallService.js:282](backend/src/services/voiceCallService.js#L282), dies on `ws.on('close')` at line 518 | not held - each `runConductor()` is a fresh subprocess | held by Claude Code session, dies when chat tab closes |
| **Prior calls' history** | lost. `buildVoiceContext()` at line 109 reads native mirror (last 4) + status_board only - does not read any voice log because none is written | lost. `_recentThreadContext()` reads `cowork.message_thread.<channel>.tate` last 10 - which for voice channel is empty | depends on auto-memory + project-local CLAUDE.md; voice activity does NOT land there |
| **In-flight handoff state** | `fireHandoff()` at line 388 dispatches one-shot, no `case_id`, no status, no replay path. If call ends before reply lands -> result texts via APNs, voice never sees it | each handoff is anonymous - away has no record this work was "for the voice call from 5 min ago", just sees `[from a live voice call with Tate]` tag in the body | invisible. No way to know voice opened a case during a previous turn |
| **What other brain did since last contact** | nothing. Voice reconnects blind | nothing. Away has no way to see "IDE conductor pushed a commit 3min ago that affects this question" | partial - sees `coord/inbox` only when conductor_heartbeat.py emits prelude; sees working_set; does NOT see voice-channel turns or away-conductor results |
| **Tate's open questions / "still waiting on"** | not tracked anywhere | not tracked anywhere | not tracked anywhere |

The honest worst case today: Tate calls, asks "what's the stripe balance" -> voice emits HANDOFF -> away spawns Opus, takes 40s to answer -> Tate hangs up at 30s -> result lands via APNs in native mirror -> Tate dismisses notification -> next call 2h later, voice has zero idea that question was asked or answered.

## 2. What already exists (avoid parallel infrastructure)

Per `use-anthropic-existing-tools-before-building-parallel-infrastructure.md`, before proposing a new substrate, confirm none of these already does the job.

### 2.1 `cowork.message_thread.<channel>.<thread_id>` (kv_store)
- Service: [threadMirror.js](backend/src/services/threadMirror.js)
- Shape: `{exchanges: [{from: 'tate'|'ecodia', body, at, sender_name?}], last_at, channel, thread_id}`
- Limits: 20 outbound entries, 10 default load, 24h stale window
- Writers today: SMS webhook, Telegram webhook, native inbound, smsTransport.appendOutbound, telegramTransport.appendOutbound, notifyTate (indirect)
- **NOT a writer today: voiceCallService.** Every voice turn vanishes.
- Reader: `headlessConductor._loadTurnContext` for triage, `voiceCallService.buildVoiceContext` (native-only), `awayConductorClient._recentThreadContext` (any channel)

### 2.2 `working_set` (postgres)
- Service: [workingSetService.js](backend/src/services/workingSetService.js)
- Shape: `{id, topic, status, intent, artifacts JSONB, parent_id, last_touched_at, blocking_on, closed_at}`
- Hard caps: 5 active, auto-park after 30min idle
- Writers: forkComplete, emailArrival, factorySessionComplete (listeners). Manual via `openThread/updateThread/closeThread/findByForkId/findBySessionId`.
- Reader: `osSessionService._injectWorkingSet()` injects the `<working_set>` continuity block on every IDE conductor turn
- **NOT touched by voice or away today.**

### 2.3 `coord/inbox/chat.conductor.inbox/` (filesystem)
- Lives at: `D:/.code/EcodiaOS/coordination/inbox/chat.conductor.inbox/<uuid>.json`
- Already has ~50 messages in flight (verified by `ls`)
- Filter: deny-list (`idle_check`, `heartbeat`, `ping`) - everything else surfaces (per `coord-inbox-filter-must-be-deny-list-not-allow-list-2026-05-20.md`)
- Hook: `conductor_heartbeat.py` UserPromptSubmit, emits `<inbound_messages_pending>` prelude
- Writer surface: laptop-agent `coord.send_message` MCP tool (port 7456). Already used by `whisper_to_active_conductor` in headlessConductor.

### 2.4 `coord/conductors/current.json` (filesystem)
```json
{
  "tab_id": "conductor",
  "ide": "stable",
  "ide_pid": 28140,
  "ide_bridge_port": 7457,
  "workspace_root": "d:\\.code\\ecodiaos\\backend",
  "in_turn": false,
  "in_turn_set_at": null,
  "registered_at": "2026-05-21T05:16:48.642Z",
  "last_seen_at": "2026-05-21T05:19:19.814Z"
}
```
- Already read by `away-conductor-server.waitForIdeIdle()` to serialize against the IDE conductor
- Already gives us a reliable "Tate is at the keyboard right now" signal

### 2.5 IDE bridge HTTP (ide_bridge_port from current.json)
- Per `reference_ide_bridge_focusless_2026-05-18.md` - the IDE extension exposes 33 `ide.*` tools, registry-routed by `ide_pid`
- Means we CAN send a directive into the IDE conductor's prelude WITHOUT keystroke / focus theft (we already do, via coord inbox + heartbeat hook)

### 2.6 What we'd actually be adding
- A `thread_id`-keyed unified log (replaces / wraps the per-channel mirrors)
- `case_files` for in-flight handoffs
- Voice-side writes to all of the above
- A "since cursor" read pattern that all three brains use to catch up

Net new code surface: ~1 service file (`threadLog.js`), ~80 lines in voiceCallService.js, ~30 lines in awayConductorClient prompt, ~20 lines in headlessConductor on the IDE conductor side (mostly already there), one migration for `case_files`.

## 3. Proposed architecture

### 3.1 Unified thread log

Replace the channel-fragmented `cowork.message_thread.<channel>.<thread_id>` reads with one **logical** thread log keyed by `thread_id`. Physical storage stays in kv_store (with a small wrapper) OR a new `thread_log` table (decision in §11).

Entry shape:
```typescript
type ThreadLogEntry = {
  id: string              // uuid, monotonic-ish
  ts: string              // ISO-8601
  thread_id: string       // 'tate' for the only real thread
  channel: 'voice' | 'native' | 'sms' | 'telegram' | 'ide' | 'away' | 'system'
  role: 'tate' | 'ecodia'
  body: string            // <=2000 chars, truncated
  case_id?: string        // links to case_files row if this turn is part of an open case
  // metadata
  voice_call_id?: string  // groups all entries within one WS connection
  source?: string         // 'siri' | 'share' | 'chat' | 'cli' | etc
  meta?: object           // small free-form for channel-specific extras
}
```

Read API (one function, three callers):
```typescript
tailThreadLog({
  thread_id: 'tate',
  since?: string,         // ISO ts cursor - return entries strictly after this
  limit?: number,         // default 30
  channels?: string[],    // optional filter
  include_system?: boolean // default true
}) -> { entries: ThreadLogEntry[], cursor: string }
```

Write API (one function, every brain calls it):
```typescript
appendThreadLog({
  thread_id, channel, role, body,
  case_id?, voice_call_id?, source?, meta?
}) -> { id, ts }
```

### 3.2 Case files

A `case_file` represents a single piece of in-flight work that crosses contexts (handoff, escalation, fork, multi-turn investigation). Opens when work spawns, closes when delivered + acknowledged or explicitly abandoned.

Postgres migration `133_case_files.sql`:
```sql
CREATE TABLE case_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       text NOT NULL DEFAULT 'tate',
  opened_at       timestamptz NOT NULL DEFAULT NOW(),
  opened_by       text NOT NULL,           -- 'voice' | 'native' | 'sms' | 'telegram' | 'ide' | 'cron'
  opened_in_call  text,                    -- voice_call_id if opened during a call
  prompt          text NOT NULL,           -- what the case is about (the HANDOFF brief, or the question)
  status          text NOT NULL CHECK (status IN ('open','working','resolved','abandoned','blocked')),
  blocking_on     text,                    -- 'tate' | 'external_api' | 'scheduled' | null
  result          text,                    -- the answer/outcome when status in (resolved, abandoned)
  resolved_at     timestamptz,
  acknowledged_at timestamptz,             -- when Tate or a brain saw the result (vs just queued)
  delivered_via   text[]                   -- {'voice','apns','sms','ide_inbox'} - which channels saw it
);

CREATE INDEX idx_case_files_open ON case_files (thread_id, status) WHERE status IN ('open','working','blocked');
CREATE INDEX idx_case_files_opened_in_call ON case_files (opened_in_call) WHERE opened_in_call IS NOT NULL;
```

Service shape:
```typescript
openCase({thread_id, opened_by, opened_in_call?, prompt}) -> {id}
markWorking(id)
resolveCase(id, {result})
markDelivered(id, {via: 'voice'|'apns'|'sms'|'ide_inbox'})
ackCase(id)                                       // Tate or brain confirmed receipt
listOpenCases({thread_id, limit?}) -> CaseFile[]
listResolvedUnacked({thread_id, since?}) -> CaseFile[]
abandonCase(id, {reason})
```

### 3.3 Cross-brain protocols

Two simple primitives. Every brain uses both.

**Protocol A: tail-on-connect.** Every brain, when it starts a turn or session, calls `tailThreadLog({since: <last_seen_cursor>})` and `listOpenCases({})` + `listResolvedUnacked({since})`. The brain then has a complete picture of: prior conversation since it was last present, any work still open, any results that landed while it was away.

**Protocol B: surface-on-write.** When a brain produces a result that other brains might care about (resolveCase, append to thread log when call ends and was substantive, status_board change touching `tate_priority`), it ALSO writes a small note to `chat.conductor.inbox` with a typed body so the IDE conductor's heartbeat hook surfaces it on next turn. Plus an APNs nudge via `notifyTate` if Tate is the audience.

Together: every brain catches up on connect (no polling), and important results don't wait for a brain to call them.

### 3.4 Per-brain wiring

**Voice (`voiceCallService.js`):**
- On WS connect: mint `voice_call_id = uuid`. Call `tailThreadLog({since: lastSeenCursorFromKv, limit: 30})` and `listOpenCases({thread_id: 'tate'})` + `listResolvedUnacked({since: lastSeenCursor})`.
- Build initial system message: VOICE_SYSTEM + status_board snippet + "PRIOR CONVERSATION (across all channels since you were last present)" + "STILL OPEN: <case summaries>" + "LANDED WHILE YOU WERE OFF: <unacked result summaries>" + "if Tate asks about any of these, you already know the result".
- Every transcript-final and every spoken reply: `appendThreadLog({channel: 'voice', voice_call_id, ...})`.
- Every HANDOFF: `openCase({opened_by: 'voice', opened_in_call: voice_call_id, prompt})`, pass case_id into away-conductor envelope.
- On `say` queue item from `fireHandoff`: also `markDelivered(case_id, {via: 'voice'})` then `ackCase` (because Tate just heard it).
- On `ws.on('close')`: persist `lastSeenCursor` to kv (`cowork.voice.last_seen_cursor.tate`). Mark any unresolved cases opened in this call as still-`open` (NOT abandoned - they get retried/handed off next call).

**Away-conductor (`awayConductorClient.js` + `away-conductor-server.js`):**
- Client side passes `case_id` and the unified log tail in the envelope (replacing the current channel-specific `thread_context`).
- Server-side prompt template adds:
  - "RECENT CONVERSATION ACROSS ALL CHANNELS (last 30 entries, oldest first):"
  - "OPEN CASES (other work in flight): <one-liners>"
  - "YOUR CASE: <case_id> opened by voice 4min ago. PROMPT: <the handoff>"
  - "When you finish, your reply is the answer to this case. The parent process will resolveCase + appendThreadLog + deliver to Tate. Do NOT call notify_tate or any other reply tool - reply via <REPLY> only."
- After `<REPLY>` extraction, the SERVER `resolveCase(case_id, {result: reply})` and `appendThreadLog({channel: 'away', role: 'ecodia', body: reply, case_id})` and `markDelivered({via: ...})`.

**IDE conductor (me, via `osSessionService._injectWorkingSet()` + new prelude blocks):**
- On every turn, add two new continuity blocks (capped budget):
  - `<thread_tail>` - tail of the unified log since the IDE conductor's last seen cursor. Lets me see voice/away activity while my tab was off.
  - `<open_cases>` - any open or resolved-unacked cases. Lets me know "voice asked stripe balance during the call you missed, away answered 'sandbox balance $0', Tate hasn't been told yet."
- When I work on something thread-relevant, I `appendThreadLog({channel: 'ide', ...})` so voice and away pick it up next time.
- When I resolve a case (e.g. I find the answer to an open case), I `resolveCase` + decide delivery (notifyTate? next call?).

### 3.5 Reconnect / catch-up flow (the happy path)

Tate calls at 10am. Asks 3 things, hangs up at 10:02. Two of three answers land via APNs over next 2min. He dismisses notifications. At 12pm he calls back.

1. WS connects -> voice mints `voice_call_id_2`.
2. Voice loads `lastSeenCursor` from kv (last entry ts from call #1).
3. `tailThreadLog({since: cursor})` returns: 6 entries from call #1, 2 entries from away with answers, 1 entry from IDE conductor (me) that touched the resonaverde row at 11:15.
4. `listOpenCases()` returns: case #3 from call #1 still-open (the one whose answer never came back because Opus timed out).
5. `listResolvedUnacked()` returns: cases #1 and #2 from call #1 - resolved + delivered via APNs but `acknowledged_at IS NULL` because Tate dismissed without opening.
6. System prompt is assembled with all three. Voice's first turn knows: "the 3 things from earlier - here's where they landed, here's the one still open."
7. Tate says "yo". Voice replies "yo. fyi: stripe is still test-mode sandbox $0, resonaverde deploy is green, and i never got the third one - want me to retry?" (Or just "yo" if he doesn't engage further, with the context held silently for when he does.)

This is the user-facing test of the whole design.

## 4. Concurrency model

Three writers, one log per thread. Conflicts are rare but real.

### 4.1 Ordering and atomicity
- Log entries use server-generated `ts` (database NOW() when written via SQL, or `Date.now()` when in-kv). Ordering is timestamp-only - no causal ordering across brains. Acceptable: human-scale ms differences are fine; cross-brain race within 50ms is not realistic.
- Case file state machine: `open -> working -> resolved | abandoned | blocked`. Single-writer (the brain owning the case). The away-conductor owns the case from `openCase` to `resolveCase`; voice owns `markDelivered` and `ackCase`.
- Concurrent append: kv_store uses `ON CONFLICT (key) DO UPDATE`. Race window: read-then-write of the JSON array. Mitigate by making the table backing it a real append-only `thread_log` table instead of kv blob (recommended; see §11).

### 4.2 Read-write fences for IDE conductor
- IDE conductor heartbeat hook reads `chat.conductor.inbox` at every turn-start. Voice writes to that inbox when surfacing results = IDE picks them up next prompt.
- Away-conductor already serializes against IDE `in_turn` - no change.
- Voice does NOT need to defer to IDE `in_turn` (voice doesn't write to the repo). Voice just appends to the substrate.

### 4.3 Reply double-send guard
- A case has `delivered_via[]` array. Any brain about to deliver to channel `X` checks if `X in delivered_via`. If yes, skip (already told Tate via this surface).
- Specific risk: voice resolves case mid-call, but voice already spoke the result -> append `'voice'` to delivered_via -> IDE conductor doesn't ALSO `notifyTate` the same body 5 min later.

## 5. Token budget (the math that makes or breaks this)

### 5.1 What we're adding to the voice system prompt
Today voiceCallService injects:
- VOICE_SYSTEM (~700 tokens)
- buildVoiceContext: status_board 8 rows (~250 tokens) + native mirror last 4 (~120 tokens) = ~370 tokens
- per-turn `history.slice(-8)` (~600 tokens at 8 turns)
- Total at typical turn: ~1700 tokens system+history

Adding:
- `tailThreadLog` last 30 entries, ~120 tokens each = **~3600 tokens** if we send all 30
- `listOpenCases` 3-5 cases, ~80 tokens each = ~400 tokens
- `listResolvedUnacked` 0-3 entries, ~150 tokens each = ~450 tokens

Naive total per-turn for voice: ~6000 tokens system+history. Haiku 4.5 input is cheap (~$0.80/MTok), so 6k tokens = $0.005 per turn. 50 turns/day = $0.25/day. Affordable.

But Haiku attention degrades fast over 6k context. Real cost is **quality** not dollars.

### 5.2 The compression strategy
On voice connect, we summarize rather than dump:
- `tailThreadLog` last 30 -> a Haiku-side summary call ("summarize this conversation in <=300 tokens, preserving any open questions or unresolved threads"). Sub-second, runs in parallel with WS setup.
- `listOpenCases` -> a one-liner per case.
- `listResolvedUnacked` -> a one-liner per unacked result.

This trims the inject to <1000 tokens, the model attends to it cleanly, and we still preserve everything in the substrate. Decision: use summarization for the prompt; the raw log is still queryable via the away-conductor's tool surface when it needs detail.

### 5.3 What the away-conductor needs in its prompt
Away-conductor already accepts `thread_context` as a string in its envelope. We add:
- The tail summary (same as voice gets)
- The open case manifest
- The specific case_id this dispatch is fulfilling

Away-conductor is Opus on Corazon with full repo + MCP - context degradation isn't the bottleneck for it. We can send 6-8k tokens of recent activity without quality loss.

### 5.4 What the IDE conductor (me) gets
Per the doctrine I already operate under, continuity blocks have hard caps:
- `<working_set>` is 1500 bytes
- `<thread_tail>` should be ~1500 bytes capped (last 10 entries summarized)
- `<open_cases>` should be ~500 bytes capped

These slot into the existing prompt-assembly path; net IDE-conductor overhead is minimal.

## 6. Edge cases and how each is handled

Each row is an actual scenario the spec must answer.

### 6.1 Voice connects but kv read times out
- Fail-soft: skip the tail load, log a warn, use status_board-only context (today's behavior). Voice still works. Catch-up on next connect when kv recovers.

### 6.2 Two voice calls overlap (Tate calls from one device, second call from another)
- Each WS connect mints its own `voice_call_id`. Both append to the same thread log.
- Real ordering risk: a transcript from call A and an Ecodia reply from call B interleave in the log. Acceptable: human will be on at most one call at a time in practice. If two truly happen, the log is a faithful interleaving record of what was actually said.
- Case files use a single-writer rule (the call that opened it owns it through resolution), so cases don't get tangled.

### 6.3 Away-conductor times out mid-handoff
- Today `routeToAwayConductor` has a 5min timeout. On timeout: client returns `{ok: false, error: 'timeout'}`. Voice's fireHandoff logs a warn and silently drops.
- With cases: the case stays `working` until something resolves or abandons it. A scheduled cleanup (cron, 30min) marks `working` cases older than 30min as `blocked` with `blocking_on: 'timeout'`. On next voice connect, those surface as "stuck case - retry?".

### 6.4 IDE conductor crashes mid-edit on a thread-relevant file
- The IDE-conductor heartbeat goes stale (`in_turn = true, in_turn_set_at = 35min ago`). Away-conductor's existing `IDE_TURN_FRESH_MS = 5min` already treats stale=idle. No change needed.
- IDE never wrote to thread_log? Then voice/away don't know the work happened. Fine: those edits weren't communicated to Tate so they shouldn't be surfaced. The thread_log is the conversational substrate, not the dev substrate.

### 6.5 Tate dismisses an APNs notification (acknowledge vs read)
- We CAN'T detect "read" from APNs reliably. Best signal: app foreground after delivery (Phase 4 of native-app spec uses `/messages/:id/ack`). Until that's wired everywhere: treat APNs delivery success as `markDelivered` only, NOT as `ackCase`. Next voice connect: surface as unacked, voice asks "btw, did you see the stripe answer earlier?".
- Tate's correct answer is "yes" or "no" - either resolves the unacked state. (Sonnet triage can infer this, or we surface a `/api/native/cases/:id/ack` deep link in the APNs payload.)

### 6.6 Away-conductor produces a result for case #1 AFTER voice already spoke a partial result
- Voice should not double-speak. Already handled by `delivered_via[]`: if `'voice' in delivered_via` skip voice replay, but DO append the away update to thread_log as a system note. Tate hears the next time he calls.

### 6.7 Log corruption (malformed JSON, schema drift)
- Reader uses try/catch, treats malformed entries as `{role: 'system', body: '<corrupted entry skipped>', ts: filename_ts}`.
- A nuclear option: nightly cron compacts log into snapshots (kv_store.thread_snapshot.<thread_id>.<date>) and trims log to last 7 days of entries. Old snapshots are read-only.

### 6.8 Replay loop (voice connects, reads tail with its own prior replies, treats them as new user turns)
- Defense: every appendThreadLog entry has a `role`. The tail-to-system-prompt converter formats entries as `[<channel>:<role>] body`. The model NEVER sees prior assistant entries as user turns.
- Adversarial test: a malicious channel could write `{role: 'tate'}` impersonating Tate. Mitigate: writes are server-side only, authenticated by VOICE_CALL_TOKEN / AWAY_CONDUCTOR_TOKEN / coord-bus token. Channel value is set by the writing service, not by client input.

### 6.9 Stripe-style "this answer is stale" - Tate asks again 2 hours later
- The thread_log shows yesterday's answer. Sonnet/Opus must know to re-check rather than parrot. Easy: "if Tate asks again about something that has a STATE answer (balance, deploy status, inbox count), always re-check via tools; only PARROT if it's a STATIC fact (a decision made, a person's role, a doctrine point)."
- This is a prompt rule, not architecture. Add to VOICE_SYSTEM.

### 6.10 Privacy / scope - does IDE work belong in voice context?
- Defaults: every IDE-conductor edit that touches `thread:tate`-tagged working_set rows -> appended to thread_log. Other IDE work (random refactors, doctrine writes) does NOT auto-append.
- Trigger: explicit `appendThreadLog` call from a hook on PostToolUse for Bash|Edit|Write WHEN there's an active working_set row tagged `thread_id: tate`. Slightly fancy but cheap.
- Adversarial: what if IDE conductor narrates something embarrassing or wrong about Tate, and voice surfaces it? Mitigate: thread_log entries from `channel: 'ide'` are SYSTEM notes, summarized neutrally. The voice prompt template says "treat ide-channel entries as internal notes, not things Tate said."

### 6.11 Case explosion (Tate fires 10 questions in 30 sec)
- working_set has MAX_ACTIVE=5. case_files should NOT have a cap - cases are tasks, not threads.
- But the open-cases-block in the system prompt SHOULD cap: top 5 most recent open cases, "+N more" overflow.
- Adversarial: a malicious or buggy brain opens 10000 cases. Mitigate: rate-limit `openCase` to 10/min per brain. Logged + alarmed.

### 6.12 Tate is at the keyboard AND on a voice call simultaneously
- Real scenario (he's testing). Both surfaces append to the same log. IDE conductor's heartbeat reads voice's appends on next turn. Voice reads IDE's appends on next call connect (or every N seconds during call if we add polling).
- Adversarial: he asks the IDE conductor "shut up I'm on a call" - we honor by NOT writing to coord-inbox while a voice call is active. Detection: `cowork.voice.active_call.<thread_id> = {voice_call_id, started_at}` kv key written on WS connect, cleared on close. Hook checks before surfacing.

### 6.13 Tate switches phones / restarts the iOS app mid-case
- Cases are server-side. App restart doesn't affect cases.
- New device APNs token registered: device_state updated, future deliveries route to new device. No change to case state.

### 6.14 Voice transcribes an echo of itself as a user turn
- Already handled by `looksLikeEcho` in voiceCallService. No new risk.

### 6.15 IDE conductor mid-edit on a file the away-conductor wants to edit
- Existing `waitForIdeIdle` lock holds. Away waits up to 90s, then proceeds.
- New risk: cases linger longer if IDE is in 90s of turn. Acceptable - we already document this trade-off.

## 7. Adversarial scenarios - explicit attacks on the design

### 7.1 The "wrong brain answered, in front of Tate" attack
Voice connects, tail includes a half-formed Opus thought that was abandoned. Haiku reads it, thinks it's the answer, speaks it confidently. Tate now believes a wrong thing.

**Defense:** thread_log entries from `away` channel get a `case_id` link. Voice prompt template: "away-channel entries with status != resolved are work-in-progress drafts, NEVER state them as fact. If Tate asks about them, say 'I was looking into that, let me re-check'."

### 7.2 The "infinite handoff" attack
Voice -> HANDOFF -> away replies "I need more info, ask Tate X" -> voice asks Tate X -> Tate answers -> voice -> HANDOFF again with X -> ...

**Defense:** case_files have a hop counter. `metadata.hops int default 0`. Each HANDOFF on the same case increments. At hops >= 3, voice escalates differently: "this is getting circular, let me just answer with what I have."

### 7.3 The "phantom resolution" attack
Away-conductor crashes with a partial `<REPLY>` block parsed (because extractReply falls through to "last short non-empty paragraph"). Case gets `resolved` with garbage.

**Defense:** `extractReply` returns `null` if no valid `<REPLY>` block. Server requires `extractReply` non-null before `resolveCase`. Else `markBlocked(case_id, {reason: 'no_reply_extracted'})`. (Today the fallback is too lenient.)

### 7.4 The "stale lock" attack
IDE conductor heartbeat `in_turn = true` indefinitely (Stop hook crashed). Away waits 90s, then proceeds anyway. So far so good. But IDE crash also means `in_turn_set_at` is stale. Away considers stale = idle. Now what if the IDE actually IS still running and just dropped a hook? Away writes, IDE writes - conflict.

**Defense:** stale window of 5min is already the doctrine threshold. `git status` shows working tree as dirty -> any append-to-thread-log from away that happens during IDE-claimed-active becomes a coord-inbox message "FYI I appended to thread_log while you were in a turn, conflict if you also wrote." This is a recurring incident pattern, worth a sibling doctrine file.

### 7.5 The "channel impersonation" attack
A coord-inbox writer drops a message with `body.type: 'inbound_native'` claiming Tate said something he didn't. Hook surfaces it as inbound chat.

**Defense:** every appendThreadLog write is authenticated by a brain-token (voice has VOICE_CALL_TOKEN, away has AWAY_CONDUCTOR_TOKEN, IDE has no token but operates locally). The append writes the channel from the AUTHENTICATED identity, not from a client-supplied field. Client-supplied channel is rejected with 401 if it doesn't match the bearer.

### 7.6 The "snowball context" attack
After 6 months of operation, thread_log has 50000 entries. Tail of last 30 is still 30, but list queries slow + nightly compaction loses interesting old context.

**Defense:** explicit `thread_log` table (not kv_store JSON blob), indexed on `(thread_id, ts DESC)`. Tail query is `O(log n)`. Compaction is age + size based (7 days OR 5000 entries). Compacted snapshots stay queryable but don't slow tail.

### 7.7 The "wrong-brain-answers-first" race
Tate calls, voice opens case. Voice tries to handle directly (Sonnet, after Phase 1 of last spec). Sonnet starts answering, but mid-answer also emits HANDOFF (case opened). Away gets it, races to a different answer. Voice's answer streams out first. Tate hears voice answer. Away's answer lands later via APNs. Now Tate has two answers to one question, possibly conflicting.

**Defense:** voice's HANDOFF emission is a CONDITIONAL: only emit if voice has NOT already given a substantive answer. (Today this is implicit; make it explicit in VOICE_SYSTEM.) OR: voice marks case as `resolved_locally` and away short-circuits if case already resolved by the time it dispatches.

### 7.8 The "ackCase replayed" attack
A buggy hook fires `ackCase` twice in a row. Case is already resolved, status doesn't change. Acceptable.
A buggy hook fires `resolveCase` twice on same case with different bodies. Last wins. Acceptable but loggy.

**Defense:** `resolveCase` is idempotent on `(case_id, result_hash)` - same result = no-op, different result = warn + audit log.

### 7.9 The "voice call recorded forever" privacy concern
Every voice turn appends to a postgres table that, for all practical purposes, is permanent. Worth Tate explicitly accepting before ship.

**Defense:** retention policy default: voice entries in thread_log get a `redact_after_days` (default 30). Cron blanks `body` to `<expired>` after that. Cases and resolutions stay (those are the substance), the raw transcripts age out.

### 7.10 The "two IDE conductors" attack
Tate opens two VS Code windows, both register as `tab_id: conductor` in `coord/conductors/current.json`. Both heartbeat. Both try to handle cross-brain coord.

**Defense:** the file is single-key. Last writer wins. Other IDE conductor sees its claim has been overwritten and re-registers with a unique tab_id. Existing logic in laptop-agent registry already handles this; verify it does on this code path.

## 8. Failure modes and graceful degradation

| Failure | Visible symptom | Degraded behavior |
|---|---|---|
| kv_store down | thread_log writes fail | Voice still works (memory-only history per call), away still works (no cross-call context), IDE conductor still works. We just lose continuity for the duration. Recovery on substrate-back. |
| postgres down (case_files table) | openCase / resolveCase fail | Voice falls back to today's behavior (one-shot HANDOFF no case tracking). Away still answers. Tate may get double-replies for a while. Episode written so the work is recoverable from logs. |
| coord-inbox writes blocked (laptop-agent down) | IDE conductor doesn't get cross-brain whispers | Voice + away still work. IDE conductor catches up on next-thread-tail injection (which it reads on every turn anyway). No data loss, just slightly delayed surfacing. |
| Away-conductor down (Corazon off, claude crashed) | HANDOFFs return no reply | Voice falls back to today's behavior: speaks an "I'll get back to you" line, case stays `working`. Next voice connect surfaces the unresolved case. Tate is briefed: "got distracted on your stripe question - want me to retry?" |
| IDE conductor never reads coord-inbox (hook misconfigured) | Voice writes coord messages, IDE conductor never sees | Symptom: tate reports "the voice call mentioned X but you never knew." Mitigation: `tailThreadLog` is also injected directly into IDE conductor's prompt via `osSessionService`, bypassing the coord-inbox path. Two parallel signals = at least one works. |
| Migration not applied before service deploy | case_file writes fail | Service detects "relation does not exist" and falls back to today's stateless behavior. Logs warn. Deploy gate: confirm migration in CI before service restart. |

## 9. What this design does NOT solve (honest limits)

1. **The voice front brain is still bottleneck-bound on its model.** Even Sonnet-via-Agent-SDK in voice will sometimes mis-classify HANDOFF triggers. This is a Phase 1 improvement (last message), not solved by statefulness.
2. **Real bi-directional clarifying questions (voice <-> away mid-turn) still need server-sent updates to voice WS.** This design enables them (case is a stable id, voice can poll case state), but doesn't ship the protocol. That's Phase 5 if it ever bites.
3. **IDE conductor can't proactively interrupt a voice call.** If I figure something out while you're driving, the best I can do is appendThreadLog + push to coord-inbox + (if urgent) notifyTate APNs. The voice call won't speak my finding mid-conversation. That's a much harder problem (server-pushed mid-turn TTS); skip for now.
4. **Cross-thread (multi-Tate, multi-thread) coordination.** `thread_id: 'tate'` is the only thread. If we ever have multi-Tate (we won't) or multi-thread per Tate (we might, for distinct client work), the schema supports it but the prompt templates assume one thread. Easy to extend; doesn't matter yet.
5. **Voice call recording / audio replay.** This stores TRANSCRIPTS not audio. If Tate ever needs to re-hear something he'll be disappointed.

## 10. Phased delivery

Each phase is testable in isolation.

### Phase 1 - unified log + voice replay (~2h)
- New service: `src/services/threadLog.js` (append / tail). Backed by kv_store for v0 OR new `thread_log` table (decision below).
- Voice writes: every transcript-final + every spoken reply.
- Voice reads on connect: `tailThreadLog({since: lastSeenCursor, limit: 30})`, summarize via a Haiku side-call, inject as `PRIOR CONVERSATION` block in VOICE_SYSTEM.
- Persist `lastSeenCursor` to kv on `ws.on('close')`.
- **Acceptance:** call -> hang up -> call back -> voice references something from the prior call.

### Phase 2 - case files + away owns resolution (~1.5h)
- Migration 133_case_files.sql.
- Service: `src/services/caseFile.js`.
- voiceCallService `fireHandoff` opens case + passes case_id in envelope.
- awayConductorClient passes case_id through.
- away-conductor-server resolves case + appends to thread_log on `<REPLY>` extract.
- **Acceptance:** call, ask 2 questions that require handoff, hang up after one is answered. Call back. Voice surfaces: "case #1 resolved, case #2 still open want me to retry?"

### Phase 3 - IDE conductor reads + writes thread_log (~1h)
- `osSessionService._injectThreadTail()` + `_injectOpenCases()` continuity blocks.
- Hook (PostToolUse Bash|Edit|Write): when active working_set row tagged `thread:tate`, append summary to thread_log channel='ide'.
- I can read voice/away activity, voice/away can read mine.
- **Acceptance:** voice asks question during a call. After call, in IDE I see the question + answer in `<thread_tail>`. I push a related commit; on next voice call, voice mentions my commit.

### Phase 4 - delivery acknowledgement + un-acked surfacing (~1h)
- `delivered_via[]` array on case_files.
- iOS app `/api/native/cases/:id/ack` deep link in APNs payload.
- listResolvedUnacked surfaces on voice connect + IDE prelude.
- **Acceptance:** answer lands via APNs while Tate is away from phone. Tate calls 2h later, voice opens with "btw, stripe answer landed, want a recap?"

### Phase 5 (defer unless it bites) - voice <-> away two-way back-channel
- Server-push from case-state-change to active voice WS.
- Lets away ask "should I do X or Y" -> voice surfaces to Tate -> Tate answers -> voice forwards to away.
- Skip if Phase 1-4 + Sonnet front brain solves the felt problem.

Total Phase 1-4: ~5.5h. Phase 5 is open-ended (~half day if needed).

## 11. Open decisions Tate needs to make

These actually require your judgment, not just my recommendation.

### 11.1 kv_store JSON blob vs new `thread_log` postgres table
- kv blob: zero-migration, reuses threadMirror pattern, easier to ship today
- new table: indexable, scales to 50k+ entries, supports cursors cleanly, costs a migration

**My recommendation:** new table from day 1. kv blob will hit the same compaction problems threadMirror has (currently 20-entry hard cap because the whole blob has to fit and round-trip). For "every voice turn appends" we'll blow that in 2 calls.

### 11.2 Voice transcript retention - permanent vs 30-day TTL
- Permanent: lossless audit. Spec says voice is the new SMS, voice transcripts deserve the same durability as text messages.
- 30-day: privacy default, audit only via cases (which are summary anyway).

**My recommendation:** 30-day TTL for raw voice transcripts, permanent for case files. Tate has audit via cases without permanent transcript surveillance of every off-handed thing said on a call.

### 11.3 Voice front brain - Sonnet via Agent SDK NOW or after statefulness ships
- Sonnet now: cheap quality win independent of statefulness. Better HANDOFF recognition, better tail-summary handling.
- Wait: statefulness is the bigger lever; do it first, then Sonnet on top so we can measure the lift cleanly.

**My recommendation:** Sonnet first (1h swap), then Phase 1-4 statefulness. Reason: Sonnet handles the post-Phase-1 prompt complexity much more reliably than Haiku. Building statefulness on a brain that already struggles is fighting two battles.

### 11.4 Should the IDE conductor (me) proactively surface unacked cases in chat?
- Yes (recommended): I read `listResolvedUnacked` every turn, and IF count > 0 + Tate's not engaged in a different task, I mention them.
- No: Tate-driven only; he asks.

**My recommendation:** No proactive surfacing in chat without a request. Tate's already swimming in inbound; one more "btw" stream is noise. Surface on explicit ask or via the IDE statusline (cheap, ambient, non-intrusive).

### 11.5 Whisper-to-conductor on every voice-turn vs only on substantive events
- Every turn: IDE conductor sees the call as it happens, can intervene
- Substantive only (resolved cases, new HANDOFFs): minimal noise

**My recommendation:** substantive only. The IDE conductor doesn't need to see "yo" / "thanks" / "anytime" turns. It needs to see case opens, case resolves, and any explicit `whisper_to_conductor` call voice deliberately makes.

## 12. Files this design touches

New:
- `backend/src/services/threadLog.js` (append + tail)
- `backend/src/services/caseFile.js` (open / mark / resolve / list)
- `backend/src/db/migrations/133_case_files.sql`
- `backend/src/db/migrations/134_thread_log.sql` (if going with table over blob)
- `backend/patterns/one-brain-stateful-coordination-2026-05-21.md` (doctrine version of this doc, post-ship)

Modified:
- `backend/src/services/voiceCallService.js` (~80 lines: tail-on-connect, append-on-turn, case open/handoff, lastSeenCursor persist)
- `backend/src/services/awayConductorClient.js` (~20 lines: pass case_id + unified tail)
- `backend/scripts/away-conductor-server.js` (~30 lines: prompt updates, resolveCase + appendThreadLog on REPLY)
- `backend/src/services/headlessConductor.js` (~15 lines: pass case_id through to away)
- `backend/src/services/osSessionService.js` (~40 lines: new continuity blocks `<thread_tail>` + `<open_cases>`)
- `~/.claude/hooks/ecodia/conductor_heartbeat.py` (~10 lines: include thread_log tail signal in prelude)
- `~/.claude/hooks/ecodia/post_tool_use_thread_log.py` (~30 lines: new hook for ide-channel appends)

Total: ~225 lines of new/modified code + 2 migrations + 1 new pattern.

## 13. What I'd ship next if you greenlight

Order:
1. Migration `133_case_files.sql` + `134_thread_log.sql` (rollback-safe, additive)
2. `threadLog.js` + `caseFile.js` services with unit tests
3. Sonnet front brain swap in voiceCallService (the 1h win)
4. voiceCallService statefulness (tail on connect, append on turn, persist cursor)
5. awayConductor case-passing + resolution wiring
6. IDE conductor injection blocks + PostToolUse hook
7. iOS app `/cases/:id/ack` deep link
8. Doctrine file at `backend/patterns/one-brain-stateful-coordination-2026-05-21.md`
9. Neo4j Decision node capturing the architecture decision

Test plan: each phase has an acceptance test that's a literal phone interaction with Tate. No mocks - this thing only matters in real use.

## Open questions ONLY Tate can answer

1. **Retention default:** 30d on raw voice transcripts, permanent on cases - or different?
2. **Sonnet-first or statefulness-first:** which comes ship-wise?
3. **kv blob vs postgres table for thread_log:** are we comfortable with the migration cost for the clean version?
4. **Should voice proactively recap unacked cases on call connect, or only if I ask?**
5. **Cross-thread future:** are we ever going to have a second `thread_id` (e.g. client-specific threads), or is `tate` always the only one?
