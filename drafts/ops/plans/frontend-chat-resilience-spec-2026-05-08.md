# Frontend Chat Resilience — Spec (2026-05-08)

Fork: `fork_mowlrdzt_79097c`
Status board: `148cddc5-57b3-4676-b075-98a7708c7698` (P2)
Origin: 7 May 2026 DeepSeek thinking-mode 400 storm. Phone chat froze at the
error event for 6+ hours. 4 commits + an entire conversation invisible to Tate.

## Recon (what already exists)

The freeze was NOT a missing-infrastructure problem. The streaming infra is
already remarkably sophisticated.

**Backend (`src/websocket/wsManager.js` + `src/routes/osSession.js`):**
- Every broadcast envelope carries `{ seq, ts, epoch, type, ... }`.
- `seq` is monotonic per OS session, resets on `resetSessionSeq()` or process restart.
- `epoch` is a UUID per session — distinguishes "process restarted, seq=0 again"
  from "new logical session" so the FE doesn't gap-fill against a dead ring buffer.
- 500-event in-memory ring buffer (`_eventRing`).
- `GET /api/os-session/recover?since_seq=N` returns events from the ring with
  `seq > N`, plus current epoch.
- 10ms text_delta coalescer.
- Persistent transcript: every USER message and assistant text is appended to
  `cc_session_logs` table via `appendLog(sessionId, content)` at
  `osSessionService.js:1106` and `:2383`. This is the durable store.
- `appendLog` writes `[USER] <text>` for inbound and the assistant's safe-text
  for outbound. Tool calls and partial deltas are NOT logged here — only the
  finalised assistant text per turn.

**Frontend (`src/hooks/useWebSocket.ts` + `src/store/osSessionStore.ts`):**
- WS reconnect: backoff `[200, 500, 1000, 2000, 5000, 10000, 20000, 30000]`.
- `onerror` and `onclose` unified through a single `handleDrop` so reconnect
  doesn't double-fire.
- Connection state machine: `connected | connecting | reconnecting | catching_up
  | disconnected | backend_alive`.
- Optimistic ticket prefetch overlapped with backoff wait.
- `lastSeenSeq` persisted to localStorage via Zustand `persist`.
- Per-message gap detection: any `msg.seq > lastSeenSeq + 1` triggers
  debounced `_scheduleRecover` (50/500/1500/5000/15000 ms backoff).
- Epoch drift detection: if the message's epoch differs from `_lastSeenEpoch`,
  treat as authoritative and clear `lastSeenSeq` so the new ring buffer isn't
  filtered as stale.
- `visibilitychange` handler kicks `_scheduleRecover` on tab-show.
- `replayRecoveredEvents` dedupes by seq.

This stack handles the "WS dropped, reconnect, fill the gap" case beautifully
under 500 events and a few minutes.

## What broke on 7 May

Three independent gaps compounded:

### Gap 1 — `status='error'` is a sticky dead-end with no UI affordance

When the backend emits `os-session:status` with `status='error'`
(line 781-782 of `useWebSocket.ts`), the FE just calls `osStore.setStatus('error')`.

What happens then:
- `streamText` / `streamTools` / `streamThinking` buffers are NEVER flushed
  to a finalized message. Whatever was streaming when the error fired is
  silently lost.
- `StreamingIndicator` (`CCStream.tsx:2374`) is gated on `status === 'streaming'`
  → vanishes.
- The Stop button (`CCStream.tsx:2496`) is also gated on streaming →
  vanishes; replaced by a small "new session" rotate icon.
- No error message rendered in the chat timeline.
- No "tap to retry" affordance.
- The user has no signal that anything went wrong other than the stream
  silently disappearing.

Subsequent backend turns can theoretically re-set status to streaming and
push events, but if the FE was backgrounded on a phone (mobile Chrome)
during the error storm, none of that is visible until visibilitychange,
and at that point Gap 2 takes over.

### Gap 2 — Ring buffer is too small for an extended disconnect

The `_eventRing` is 500 events, in-memory only. Lost on PM2 restart. A
single tool-heavy turn emits 40-60 events; a 6-hour disconnect window
across multi-turn conductor work blows past 500 trivially.

When `recoverEventsSince(sinceSeq)` is called and the ring no longer holds
events that old, the backend returns `[..._eventRing]` (the whole buffer)
because `getEventsSince` falls through to "return everything" when seq is
out of range — and every one of those events has `seq > sinceSeq`, so the
client filter passes them through, but the events that aged out are gone
forever. The user's transcript has a hole.

Worse, if PM2 restarted at any point, the epoch changed, so
`_applyRecoverEpoch` resets `lastSeenSeq` to null and the FE can't even
ask for those events at all — it just accepts the new live stream as
authoritative.

There is no fallback to the persistent `cc_session_logs` log.

### Gap 3 — Stale-stream watchdog absent

WS reconnect handles the disconnect case. But the WS staying CONNECTED
while no events flow is the silent failure. The 7 May storm is exactly
this shape: backend errored, sent the error event, then went quiet for
hours. The WS was open the whole time. From the FE's perspective:

- `ConnectionState` says `connected`.
- No reconnect fires (WS is healthy).
- `visibilitychange` only triggers recover on tab-show, which on the
  phone happens infrequently.

There is no "we haven't seen ANY event for 30s, the stream is dead even
though the socket is alive" detector.

The 5s liveness heartbeat (`os-session:status: live`) emitted by the
backend during in-flight turns IS exactly the heartbeat we need —
but the FE only reads it to update the liveness UI. No watchdog
checks for its absence.

## Fix design (narrow, three commits)

### Commit 1 — backend `GET /api/os-session/messages?since=<iso_ts>`

Add a new endpoint that reads from `cc_session_logs` (the durable store)
filtered by `created_at > since`. Returns the full transcript since the
timestamp as a flat array of `{ role, content, created_at }`.

**Implementation:**
- New route in `src/routes/osSession.js`, sibling to `/recover`.
- Reads the active session id via `osSession.getStatus()` (existing helper)
  to scope the query.
- Optional `?session_id` override for cross-session lookup (backwards-compat
  fallback if the FE has a stale sessionId).
- Parses `[USER] <text>` prefix on log rows to derive role; assistant text
  has no prefix. (This mirrors how `appendLog` writes today.)
- Auth: matches existing `/recover` and `/history` pattern — no new auth.
  Endpoint is admin-domain CORS-walled like its siblings.
- Returns `{ messages: [...], session_id, count, since }`.
- Default limit 200, capped 1000.
- Cheap: indexed scan on `cc_session_logs(session_id, created_at)`.

**Why message-level (not event-level)?** The ring buffer already covers
event-level (deltas, tool_use, status). The persistent log only contains
finalised user messages and finalised assistant text — exactly the level
the chat UI renders. Event-level extended-recovery would require a much
larger refactor (persisting every WS broadcast). The narrow fix replays
the visible transcript, not the full SDK event stream.

### Commit 2 — frontend consumer (resilience hook + handlers)

Three discrete changes in `src/hooks/useWebSocket.ts` and
`src/store/osSessionStore.ts`:

**(a) Stale-stream watchdog.** Track `_lastEventAt` on every WS message.
While `status === 'streaming'`, run a watchdog timer:
- If `Date.now() - _lastEventAt > 30000` AND we haven't received a
  liveness heartbeat in the last 15s, classify the stream as stale.
- On stale: setConnectionState('reconnecting'), schedule a recover via
  the existing `_scheduleRecover(lastSeenSeq)` path AND fire the new
  extended-recovery via `/messages?since=lastUserMessageAt`.
- Watchdog runs at 5s tick. Cleared on any inbound event.

**(b) Error-status handler.** When `os-session:status: error` arrives:
- Call `flushStreamBuffersSync()` to drain the coalescer.
- If `streamText || streamTools.length > 0 || streamThinking`, finalise
  them into an assistant message with an explicit `error: true` flag in
  metadata so the UI can render it differently.
- Carry the `meta.error` field from the backend into the message
  (currently dropped).
- Set status to `'error'`. The UI commit will surface a retry pill.
- Persist a `lastErrorAt` and `lastErrorReason` in the store so the pill
  can render across reloads.

**(c) Extended-recovery via `/messages?since=`.** New helper in
`src/api/osSession.ts`: `getMessagesSince(sinceIsoTs)`. Called by:
- The watchdog (after stale detection).
- `_legacyRecoveryFallback` after `recoverEventsSince` returns count=0
  (so a long disconnect that aged out the ring buffer still recovers via
  the persistent log).
- A manual "tap to recover" affordance from the error-state pill.

The helper adds a deduplicated assistant message for any log row whose
`created_at > store.lastUserMessageAt && createdAt > Math.max(...store.messages.map(m=>m.timestamp))`.
Dedup keys on `(role, content, createdAt within 1s)` to prevent duplicates
when the live SSE has already populated the message but the log replay
also returns it. Surfaces a "X new messages" pill via a new store action.

### Commit 3 — frontend UI

Two additive UI affordances in `src/pages/Cortex/CCStream.tsx`:

**(a) Error-state retry pill.** When `status === 'error'`, render a
pill above the input row:

> Stream errored. [Tap to recover →]

On tap:
1. Call `getMessagesSince(lastUserMessageAt || lastSettledMessage.timestamp)`.
2. Replay the missed messages into the chat (deduped).
3. Reset `status` to `'idle'`, clear `lastErrorAt/Reason`.
4. Fire `_scheduleRecover` to refill the live event stream.

The pill is intentionally subtle (matches existing chrome) — coral border,
single tap action, no modal. If the user just keeps typing the next
message, the pill clears on `addUserMessage` automatically.

**(b) "X new messages" pill.** When the watchdog or `getMessagesSince`
injects N new messages, surface a pill at the top of the message list:

> N new messages [scroll →]

On tap, scrolls to the first new message. Auto-dismisses after 8s or
when the user scrolls to bottom.

Both use existing `inlineBanners` patterns in the store. No new
animation library, no new icon library.

## What this does NOT do

- Does NOT rewrite the WS layer. The seq + epoch + ring + recover infra
  is preserved verbatim.
- Does NOT add a new WS event type or change envelope shape.
- Does NOT touch the `cc_sessions` schema or message storage layer
  beyond a read endpoint.
- Does NOT add auth to the new endpoint (matches existing pattern).
- Does NOT attempt to recover individual events beyond the 500-event ring
  buffer — extended recovery is at the visible-message granularity.
- Does NOT change session-id semantics or fork routing.

## Out-of-scope risks surfaced for future forks

- **Tool calls and thinking blocks aren't persisted to `cc_session_logs`.**
  Only finalised assistant text and user input are. Extended-recovery via
  `/messages?since=` will give the user the conversational transcript but
  not the per-tool detail (which fires only via WS events). For the freeze
  scenario this is acceptable — the chat unfreezes and the user sees what
  was said. If we want full event-level extended-recovery, that's a
  separate larger ticket — persist every broadcast envelope to a
  `os_session_events` table with an LRU disk-backed equivalent of the
  ring buffer.
- **Push notifications on stream-error are out of scope.** The phone
  could buzz when the conductor errors out and Tate is offline. Out of
  scope for this fork; surface as a follow-up if desired.

## Files touched

Backend:
- `src/routes/osSession.js` — new `GET /messages?since=` route
- `src/services/osSessionService.js` — small helper `getMessagesSinceTimestamp`
  if not already inferable from `getHistory`

Frontend:
- `src/api/osSession.ts` — new `getMessagesSince` export
- `src/hooks/useWebSocket.ts` — stale-stream watchdog, enhanced error
  handler, extended-recovery wiring
- `src/store/osSessionStore.ts` — `lastErrorAt`, `lastErrorReason`,
  `injectRecoveredMessages`, `clearError` actions
- `src/pages/Cortex/CCStream.tsx` — error-state retry pill, "N new
  messages" pill

## Test plan

Local:
1. Start backend (`pm2 start ecodia-api`) and frontend dev (`vite`).
2. Open chat, send a message, verify normal stream completes.
3. **Induce SSE error mid-turn:** restart backend during a stream
   (`pm2 restart ecodia-api`), confirm:
   - WS disconnects, FE shows `reconnecting` state.
   - WS reconnects (~3-5s), FE shows `catching_up`.
   - Replay via `/recover?since_seq=N` fills missed events.
   - Chat is back in sync.
4. **Induce hard error:** force backend to emit `os-session:status: error`
   via abort or by killing a stream forcefully. Confirm:
   - In-flight `streamText` is finalised into a message (with error flag).
   - Error pill renders above the input.
   - Tapping the pill calls `getMessagesSince`, recovers any missed
     messages, resets status to idle.
5. **Induce extended-disconnect:** kill backend for >5 minutes while
   conductor work continues (simulate via injected log rows). Reconnect.
   Confirm:
   - Ring buffer recovery returns sparse / 0 events.
   - Extended recovery via `/messages?since=` populates missed messages.
   - "N new messages" pill renders, tap scrolls to first new message.
6. **Stale-stream:** open chat, send message, simulate the backend going
   silent for 35s without disconnecting WS (e.g. block in a debugger).
   Confirm:
   - Watchdog fires after 30s.
   - FE classifies stale, hits `_scheduleRecover` and `getMessagesSince`.

Production smoke (per `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md`):
- Visual verify on deployed URL (`admin.ecodia.au`).
- Screenshot before-state (broken).
- Screenshot after-state (recovered).
- Save both to `~/ecodiaos/drafts/`.

## Applied tags

[APPLIED] ~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md because the change is UI-visible and Tate is not actively at keyboard during this fork; ship-mode is push-test-revert (Mode B) acceptable here only because the diff is additive (new endpoint + new pill + new watchdog), no existing path is mutated destructively, and revert is a simple git revert.

[APPLIED] ~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md because pm2 restart of ecodia-api WILL terminate the conductor session; ship-summary is pre-staged at `frontend-chat-resilience-shipped-2026-05-08.md` BEFORE restart so a fresh session can read what shipped.

[APPLIED] ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md because every deploy claim ("backend live", "frontend deployed", "endpoint reachable") will be probed via curl/visual before being trusted in [FORK_REPORT].

[NOT-APPLIED] ~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md because this is internal frontend/backend resilience UX, not a capability Anthropic ships at the SDK or platform layer.
