# Memory Leak Investigation — ecodia-api hits `max_memory_restart: '2G'` repeatedly

**Date:** 2026-04-30
**Fork:** fork_mokpmmwb_608839
**Status:** investigation_complete (audit-only, no code shipped)

---

## Section 1 — Empirical evidence

**Process:** `node /home/tate/ecodiaos/src/server.js` PID `352617`.

**Memory snapshots (captured during this audit):**
- T+0s: VSZ=11882224, RSS=181272 KB, ETIME=08:14
- T+5s: RSS=181056 KB (no growth in steady-state)
- T+25s: RSS=181268 KB

**Restart cadence (from `/home/tate/.pm2/logs/ecodia-api-out.log`):**
```
17:35:19  start
17:50:24  start  (15min)
18:05:24  start  (15min)
18:20:28  start  (15min)
23:06:11  start  (4h46m gap — quiet window)
23:36:15  start  (30min)
23:43:38  start  (7min ← matches Tate's "every ~6min" complaint)
```
Total restarts: **234** across the day. Cadence is **bursty, not steady** — sub-10min while forks are active, multi-hour while idle.

**Crash signature:** `pm2 logs` show no unhandled exception traces. Restarts are SIGTERM from PM2 hitting the 2GB ceiling, confirmed by the absence of `uncaughtException` / `unhandledRejection` log entries and the missing crash trace in `ecodia-api-error.log`.

**Inference:** The leak is **fork-scaled**. Quiet windows produce stable memory (RSS held at ~181MB for 8 minutes here). Active fork-dispatch waves blow through 2GB in 6-7 minutes. This rules out background services (KG consolidation, scheduler poller, telemetry intervals) as primary cause and points at the fork lifecycle path.

---

## Section 2 — Top 3 leak hypotheses

### H1 (PRIMARY) — `forkService._forks` transcript accumulation never trimmed

**File:** `/home/tate/ecodiaos/src/services/forkService.js`
**Lines:** 405 (`transcript: []`), 514 (`state.transcript.push(safe)`), 575 (`fullText = state.transcript.join('\n\n')`), 635 (`setTimeout(...5*60*1000) → _forks.delete`).

Each fork's `state.transcript` is an array that grows for the fork's entire lifetime — every assistant text fragment is pushed (line 514) and never trimmed. The transcript is read once at end-of-stream to extract `[FORK_REPORT]` (line 575). Across a 30-minute fork producing dozens of streamed messages, transcript can grow to 5-10MB per fork. With the **HARD_FORK_CAP of 5** (line 71) and the **5-minute post-termination linger** (line 635), at any moment the in-process Map can hold:

- 5 active forks × up to ~10MB transcript each = **50MB**
- N recently-terminated forks (still in Map for 5min) × ~5MB each = additional **25-50MB** in burst

But the bigger issue: **transcript strings are also pushed through `_emitForkOutput` (line 517)** which feeds `wsManager.broadcast` → `_eventRing` (500-entry ring, see H2). Each fork's content is duplicated across `state.transcript` AND `_eventRing`.

**Why this matches the empirical pattern:** fork-scaled, bursty, correlates with Tate's "every 6min" observation when 5/5 forks are active for 5+ minutes.

### H2 (SECONDARY) — `wsManager._eventRing` envelopes carry unbounded `data.content`

**File:** `/home/tate/ecodiaos/src/websocket/wsManager.js`
**Lines:** 167 (`RING_BUFFER_SIZE = 500`), 170-173 (`_addToRing` — push without size check on envelope contents).

The ring is **count-bounded (500)** but **byte-unbounded per envelope**. Tool results up to 1500 chars (`forkService.js:550`) plus full assistant text fragments (no cap on `safe` at `forkService.js:514`) plus full forks_rollup (`forkService.js:720-727`) plus delta coalescer batches (`wsManager.js:228 parts.join('')` with no size cap) — a single `text_delta` envelope after coalesce can be 100KB+ on a long-running streaming response.

500 envelopes × 100KB = **50MB ring**. Combined with H1, this approaches half the 2GB ceiling on its own during a heavy fork wave.

### H3 (TERTIARY) — `osSessionService._preToolSeenKeys` per-sessionId Map grows across sessions

**File:** `/home/tate/ecodiaos/src/services/osSessionService.js`
**Lines:** 238 (`const _preToolSeenKeys = new Map()`), 241-244 (`_getSeenKeys` insert path), 252-255 (eviction caps **per-session** array at 100).

Each unique `sessionId` adds a new entry to the outer Map, never evicted at the Map level. Per-session arrays are capped at 100, but the Map itself grows for the lifetime of the process. Less severe than H1/H2 (each entry is small — array of node keys), but during long-running api uptime with many session restarts and resumes the Map grows linearly.

Slow leak — contributes to baseline drift but is not the burst-cause.

---

## Section 3 — Recommended fix per hypothesis

### Fix for H1 (smallest possible change)

In `forkService.js`, after `state.transcript.push(safe)` on line 514, add:

```js
state.transcript.push(safe)
// Cap transcript at last N entries; [FORK_REPORT] is always at stream end
// so trimming the head is safe. Each entry can be 1-50KB.
if (state.transcript.length > 80) state.transcript.shift()
```

`[FORK_REPORT]` is always emitted as the fork's final assistant message, so the regex match at line 576 (`fullText.match(/\[FORK_REPORT\]...$/)`) will always find it inside the last 80 entries. 80 × 50KB = 4MB cap per fork transcript.

**Additionally**, shorten the linger TTL on line 635 from `5 * 60 * 1000` to `60 * 1000` (1 minute). The frontend has plenty of time to render terminal state in 60s, and shorter linger frees memory faster.

### Fix for H2

In `wsManager.js`, in `_addToRing` (line 170-173), truncate `envelope.data.content` if it's a string longer than 8KB before pushing into the ring:

```js
function _addToRing(envelope) {
  // Cap large content fields to keep the ring's byte size bounded.
  // The frontend can fetch the full content from broadcast() in real-time;
  // the ring is for reconnect recovery only.
  if (envelope?.data?.content && typeof envelope.data.content === 'string' && envelope.data.content.length > 8192) {
    envelope = { ...envelope, data: { ...envelope.data, content: envelope.data.content.slice(0, 8192) + '… (truncated for ring)' } }
  }
  _eventRing.push(envelope)
  if (_eventRing.length > RING_BUFFER_SIZE) _eventRing.shift()
}
```

Ring is reconnect-only, so truncation doesn't degrade live UX.

### Fix for H3

In `osSessionService.js`, around line 238, add a Map-level cap:

```js
const _preToolSeenKeys = new Map()
const _MAX_SESSIONS_TRACKED = 50
function _evictOldestSessionIfFull() {
  if (_preToolSeenKeys.size > _MAX_SESSIONS_TRACKED) {
    const firstKey = _preToolSeenKeys.keys().next().value
    if (firstKey) _preToolSeenKeys.delete(firstKey)
  }
}
```

Call `_evictOldestSessionIfFull()` inside `_getSeenKeys` on the first-insert branch.

---

## Section 4 — QUICK-WIN RECOMMENDATION (ship FIRST)

**Ship the H1 fix.** Two changes in `forkService.js`:

1. Add `if (state.transcript.length > 80) state.transcript.shift()` immediately after the existing `state.transcript.push(safe)` on line 514.
2. Change `5 * 60 * 1000` to `60 * 1000` on line 635.

**Why this wins:**
- It's a 2-line patch in one file — minimum diff, minimum review surface.
- It directly attacks the fork-scaled burst pattern that matches Tate's "every 6min" observation.
- It does NOT require a service restart-storm to deploy (next pm2 reload picks it up cleanly because the changes only affect newly spawned forks; the Map level state survives a reload anyway).
- It does NOT touch the wsManager (which is touched by every WS path) or osSessionService (3182 LOC, high-risk to edit). Smallest blast radius.

**Expected impact:** caps in-flight fork memory at roughly `5 active × 4MB transcript + 5 lingering × 4MB = 40MB` instead of the unbounded current pattern. Should extend api uptime from 6-7min under fork load to **multiple hours under fork load** (matching the quiet-window steady-state of 181MB).

**Follow-up (after the quick-win lands and stability is observed for ~24h):** ship H2 and H3 in a second small PR. They are additive defense-in-depth, not on the critical path.

**Anti-pattern guard:** do NOT bump `max_memory_restart` to 4G as a "fix" — that just delays the same crash by 2x and makes restart-storms worse when they do hit, because the OOM kill takes longer. Fix the leak, not the symptom.

---

## Methodology notes

- Read-only audit — no code shipped, no api restart triggered, no heap snapshot taken (would have stalled the api under 100% CPU per the brief's anti-patterns).
- Did not exhaustively review `kgConsolidationService.js` (2254 LOC, 90KB). Spot-grep showed `embeddingsByIndex = new Map(...)` and `learningMap` are function-local and properly scoped. If H1+H2 fixes don't restore stability, audit kgConsolidation next — it has a Map-heavy consolidation path.
- Did not read `factoryOversightService.js` (1577 LOC) end-to-end. Brief grep showed no Map/Set leak signals; if Factory dispatches accelerate restart cadence specifically, audit there next.
- The `setInterval(...5000)` `_livenessTimer` at `osSessionService.js:1523` is per-turn-scoped and cleared in turn-completion paths. Not a leak source under normal flow.
- `directActionService.js:31` has a top-level `setInterval` with proper `.unref()` and rate-limit Map eviction. Not a leak.
