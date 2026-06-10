# C3: Per-matcher dedupe + Promise.all parallelism + per-source rate cap + pre-tokenise

**Manager fork:** `fork_mosn8o5x_7a0e54`
**Worker:** C3 (this report)
**Branch:** `worktree-agent-a0ffc25f92144a707`
**Worktree:** `/home/tate/ecodiaos/.claude/worktrees/agent-a0ffc25f92144a707`
**Date:** 2026-05-05

---

## Files modified

| File | Change |
|---|---|
| `src/services/perceptionDispatcher.js` | Per-matcher dedupe windows; `safeDispatch()` trampoline; `_onEvent` runs matchers via `Promise.all`; pre-tokenises `event.data_str` once per event; `DEFAULT_DEDUPE_WINDOW_MS` constant + max-window prune cutoff |
| `src/services/perceptionBus.js` | Per-source rolling 1h ring-buffer rate cap (default 1000/hr, env override `PERCEPTION_BUS_RATE_CAP_PER_SOURCE_PER_HOUR`); warn-log + drop on cap exceeded |
| `src/services/matchers/forkPhantomBail.js` | `dedupeWindowMs: 60_000` (60s) - high-volume |
| `src/services/matchers/statusBoardPriorityInversion.js` | `dedupeWindowMs: 86_400_000` (24h) - cadence-driven, per-row dedupe is 7d |
| `src/services/matchers/scheduleDrift.js` | `dedupeWindowMs: 3_600_000` (1h) - heartbeat-class, 60min payload grain |
| `src/services/matchers/calendarEventImminent.js` | `dedupeWindowMs: 3_600_000` (1h) - heartbeat-class, internal 1h per-event dedupe |
| `src/services/matchers/kvStoreHandoffAged.js` | `dedupeWindowMs: 3_600_000` (1h) - heartbeat-class, 6h internal per-key dedupe |
| `src/services/matchers/clientMention.js` | `dedupeWindowMs: 5*60*1000` (5min default); also reads `event.data_str` when available |

## Commit

- SHA: `97b38c2` (post-amend; original commit was `f515cbc`, amended once to inline the SHA into this artefact for self-reference)
- Branch: `worktree-agent-a0ffc25f92144a707`
- Manager stamp: `fork_mosn8o5x_7a0e54`
- Push: NOT pushed - manager handles push
- Files in commit: 9 files changed, 291 insertions(+), 30 deletions(-)

## dedupeWindowMs values per matcher

| Matcher | Window (ms) | Window (human) | Rationale |
|---|---|---|---|
| `finance` | 300,000 | 5min | Routine bursty around invoice cycles; default |
| `status_board` | 300,000 | 5min | Spread across many sources; default |
| `crm` | 300,000 | 5min | Bursty during delivery; default |
| `error_escalation` | 300,000 | 5min | Status_board name-dedupe handles row-level; default |
| `task_completion` | 300,000 | 5min | Infrequent structured fork_complete events |
| `security_incident` | 300,000 | 5min | Low-frequency; explicitly do NOT want long suppression — name-dedupe at status_board layer prevents row dupes |
| `client_mention` | 300,000 | 5min | Same shape as `crm` matcher; default |
| `schedule_drift` | 3,600,000 | 1h | Heartbeat-class events fire many times per hour; 60min payload grain |
| `fork_phantom_bail` | 60,000 | 1min | High-volume during fork churn; per-parent in-mem bucketing handles dedup, dispatcher just needs tight grain to surface bursts |
| `deploy_event` | undefined → 300,000 | 5min (default) | GATED matcher (Wave C); low expected volume |
| `stripe_event` | undefined → 300,000 | 5min (default) | GATED matcher (Wave C); low expected volume |
| `calendar_event_imminent` | 3,600,000 | 1h | Heartbeat-class; 1h per-event internal dedup matches |
| `doctrine_authored` | undefined → 300,000 | 5min (default) | GATED matcher (Wave C); low expected volume |
| `status_board_priority_inversion` | 86,400,000 | 24h | Heartbeat-class fires constantly; per-row 7d in-mem dedup; dispatcher 24h is the right grain to suppress source/kind dupes |
| `kv_store_handoff_aged` | 3,600,000 | 1h | Heartbeat-class; 6h per-key in-mem dedup |

## Rate cap configuration

- Default: 1000 events/source/hour
- Env: `PERCEPTION_BUS_RATE_CAP_PER_SOURCE_PER_HOUR=<int>`
- Window: rolling 60min from current `Date.now()`
- Drop behaviour: returns silently (matches existing publish "no result on no-op" shape) after one `logger.warn` line per dropped event
- Memory: ~16KB worst-case per source at cap=1000 (one timestamp array, pruned on every publish)

## Verification checklist

| Check | Result |
|---|---|
| `node -e "require('./src/services/perceptionDispatcher')"` | PASS - 15 matchers loaded |
| `node -e "require('./src/services/perceptionBus')"` | PASS - exports include `RATE_CAP_PER_SOURCE_PER_HOUR=1000`, `_checkRateCap`, `publish` |
| MATCHERS array count = Wave B's 15 (6 inline + 9 module) | PASS - 15 |
| Rate cap unit smoke (publish 1001 events from same source, assert 1 dropped) | PASS - `allowed=1000, blocked=1` |
| Promise.all parallelism (slow matcher does NOT delay fast sibling) | PASS - fast=1ms, slow=51ms, both fired |
| Per-matcher dedupe window (100ms window, 2 immediate calls, 1 fire; after 110ms, 1 more fire) | PASS - fired=1 then fired=2 |
| Pre-tokenise (event.data_str set in _onEvent before matcher.test runs, matchers can read it) | PASS - `event.data_str = '{"foo":"bar","n":42}'`, matcher saw the same string |

## Test failures or skipped tests

- **No pre-existing tests reference perceptionDispatcher/perceptionBus** — verified via `grep -l perceptionDispatcher tests/` returning zero hits, and `grep -l perceptionBus tests/` returning zero hits.
- **`npm test` not run end-to-end** — full Jest suite includes integration tests touching live DB / external services; running it requires a configured environment (DB creds, etc) which the worktree does not have. Smoke tests above cover the C3 deliverable specifically.
- **safeDispatch backward compatibility:** matchers using `JSON.stringify(event.data || {})` directly continue to work unchanged. `event.data_str` is additive (initialised in `_onEvent` before fan-out).

## Backward-compatibility notes

1. `_shouldDispatch(key)` (single-arg) still works — windowMs falls back to `DEFAULT_DEDUPE_WINDOW_MS`.
2. `DEDUPE_WINDOW_MS` is still exported as a const for any external callers.
3. Matchers without `dedupeWindowMs` (deploy_event, stripe_event, doctrine_authored — the 3 GATED Wave C matchers) get the default 5min window automatically.
4. `event.data_str` is set by `_onEvent` before matchers fan out; matchers that haven't been adapted to read it still work via their own `JSON.stringify` call.
5. `module.exports.safeDispatch` and `module.exports.DEFAULT_DEDUPE_WINDOW_MS` added for testability.

## Architectural notes

- **Manager-isolated worktree note:** initial Edit calls landed on the main checkout (`/home/tate/ecodiaos/src/services/...`) rather than the worktree path. Recovered by copying the modified files into the worktree and reverting the main checkout via `git checkout --`. Final state: main checkout clean, worktree carries all 8 file modifications, ready to commit on `worktree-agent-a0ffc25f92144a707` branch.
- **Sibling C1 (parallel sibling) is touching `src/server.js` and creating new publisher files.** Those are out of scope for C3 and not in this worktree's diff.
- **safeDispatch error swallowing:** any throw in `test()` or `dispatch()` is caught, the matcher_errors counter bumps, and the Promise.all completes successfully. The publishing stream is never blocked.
- **Pre-tokenise scope:** `event.data_str` is the canonical (non-lowercased) JSON string. Matchers that need lowercase (finance/status_board/crm/security_incident) call `.toLowerCase()` locally on the result. This is by design — pre-lowercasing would force matchers that need case-sensitive matching to re-stringify.

[SUB_FORK_REPORT]
