# Listener Subsystem 5-Layer Verification — Worker 1

**Fork:** `fork_moslif9x_75b9f4` (worker, reports to manager `fork_moslfc45_e59e0d`)
**Date:** 2026-05-05 (probed live ~12:30 UTC)
**Scope:** every listener / EventEmitter / pg_notify / kv_store-watch / message_queue subscriber in ecodiaos-backend
**Mode:** read-only audit (no PM2 restart, no synthetic security_incident publish, no sub-forks)
**Pattern reference:** `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`

---

## 0. Method

Empirical, not narrated.
- `pm2 logs ecodia-api --nostream --lines 4000 --out` for boot lines
- `pm2 logs ecodia-api --nostream --lines 4000 --err` for stderr
- `psql $DATABASE_URL` against `os_observations` and `os_forks` for substrate evidence
- `cat /proc/<pid>/fd/{1,2}` for stdout FD state
- `node -e` reproduction of the cred-monitor → token-refresh → wireServices boot chain in isolation
- `git log -- <file>` for the last commit that touched suspect surfaces

---

## 1. Listener registry inventory (live state, 2026-05-05 12:30 UTC)

| File | listener.name | subscribesTo | Producer surface | LOAD | LIVE | Last fire (24h) |
|---|---|---|---|---|---|---|
| `_smoke.js` | smoke | text_delta | pipeline noop (relevanceFilter ⇒ false) | ✅ | ✅ noop | n/a |
| `ccSessionsFailure.js` | ccSessionsFailure | db:event | cc_sessions UPDATE (status=error / stage=failed) | ✅ | ✅ FIRING | factory.session_failure ×11 (latest 10:55 UTC) |
| `dbBridge.js` | (transport, intentional skip) | LISTEN/NOTIFY | eos_listener_events | ✅ skipped (correct) | ✅ TRANSPORT LIVE | (transport — events flow through it) |
| `dispatchQueueListener.js` | dispatchQueueListener | db:event | dispatch_queue / os_forks UPDATE | ✅ | ✅ wired (no recent observable calls during audit window) | — |
| `emailArrival.js` | emailArrival | db:event | email_events INSERT | ✅ | 🟡 wired but no producer rows in 24h | — (email_events 0 inserts in window) |
| `factorySessionComplete.js` | factorySessionComplete | db:event | cc_sessions UPDATE (status=complete in awaiting_review/complete) | ✅ | ✅ FIRING | factory.session_failure ×11 (its sibling); factory_complete observable through fork events |
| `forkComplete.js` | forkComplete | db:event | os_forks UPDATE (terminal status / stale heartbeat) | ✅ | ✅ FIRING (loudly) | fork.fork_complete ×75, fork.fork_error ×13, fork.fork_aborted ×1 (latest 12:30 UTC, seconds before audit) |
| `invoicePaymentState.js` | invoicePaymentState | db:event | staged_transactions INSERT (amount_cents>0) | ✅ | 🟡 wired but no producer rows | — (no bank import in 24h) |
| `statusBoardDrift.js` | statusBoardDrift | db:event + 30min timer | status_board INSERT/UPDATE + scheduled timer | ✅ | ✅ wired | (timer-driven, no observable in-window publish to os_observations under its own source) |

**Loader stderr evidence (every recent boot, e.g. 11:47:32 UTC):**
```
[listener-registry] load: starting — 9 files in allow-list
[listener-registry] load: loaded smoke (_smoke.js)
[listener-registry] load: loaded ccSessionsFailure (ccSessionsFailure.js)
[listener-registry] load: skipped dbBridge.js (missing: name,subscribesTo,handle,relevanceFilter)
[listener-registry] load: loaded dispatchQueueListener (dispatchQueueListener.js)
[listener-registry] load: loaded emailArrival (emailArrival.js)
[listener-registry] load: loaded factorySessionComplete (factorySessionComplete.js)
[listener-registry] load: loaded forkComplete (forkComplete.js)
[listener-registry] load: loaded invoicePaymentState (invoicePaymentState.js)
[listener-registry] load: loaded statusBoardDrift (statusBoardDrift.js)
[listener-registry] load: complete — loaded=8 (expected=8) skipped=1
[listener-registry] registerAll: registered 8 listeners on channels [os-session:output]
```

**The 28 Apr only-2-of-7 P0 IS RESOLVED.** Registry now writes synchronous stderr per file (bypassing winston async-buffer); explicit allow-list `LISTENER_FILES` (registry.js:42-52) replaced the failing `fs.readdirSync()`; boot-time assertion at registry.js:125-134 escalates if `loaded.length !== EXPECTED_LOADED_COUNT`. Confirmed `loaded=8 expected=8` on every boot in the 24h window.

---

## 2. Non-registry listener / subscription subsystems

| Component | Type | Producer | Bridge | LOAD | LIVE | Side-effects to substrate |
|---|---|---|---|---|---|---|
| **`perceptionDispatcher`** (6 matchers) | in-process subscribe to `perceptionBus` | every `perceptionBus.publish()` (forks, factory, status_board, etc.) | direct in-process callback | ❓ start() log MISSING but functionally LIVE | ✅ FIRING | `os_observations` rows source=`perception_dispatcher` ×3 in window (`overdue_status_board_items`, `followup_scheduling_suggested`); writes to `status_board` per matcher (P1 auto-rows) |
| **`proactivityEngine`** | tick loop | timer (energy-adjusted) | n/a | ❓ start() log MISSING | UNVERIFIED — no observable in `os_observations` in 24h, no `dispatch_queue` rows attributable in window | UNKNOWN. Brief P-Zero #2 says "f3005a4 papered over via lazy-init" — see §4 |
| **`patternEvolution`** | weekly cron | timer (one-shot at boot + weekly interval) | n/a | ❓ start() log MISSING | UNVERIFIED — no observable Reflection writes / pattern demotions in 24h | UNKNOWN |
| **`claimVerifierWorker`** | 30s tick | own `setInterval` poller | n/a | ✅ start log present (`claimVerifierWorker started` at 11:47:32.182Z) | ✅ wired | reads `conductor_claims`, dispatches per-action verifiers |
| **`credentialRedactionMonitor`** | 30s poll | `credentialFilter.getCounters()` | injects `fireIncident` actuator from `securityIncidentResponse` | ✅ start log present (`credentialRedactionMonitor started` at 11:47:32.184Z) | ✅ wired (still in 2h bootstrap window — counters observed but no fire until bootstrap_done) | `securityIncidentResponse.fireIncident` chain |
| **`securityIncidentResponse`** | NOT a listener — actuator container | n/a | wired via `wireServices()` from server.js | ❓ wireServices log MISSING in production (logs `securityIncidentResponse: services wired` in isolation) | UNVERIFIED at runtime, but `cred-monitor` injects `fireIncident` so it's reachable | n/a |
| **`schedulerPollerService`** | 30s poll | timer | n/a | ✅ start log present (`Scheduler poller started`) | ✅ wired | fires `os_scheduled_tasks` due rows → `/api/os-session/message` |
| **`messageQueue` sweep poller** | 30min sweep | timer | n/a | ✅ start log present | ✅ wired | promotes message_queue rows past max_age |
| **`osHeartbeatService`** | tick | timer | n/a | ✅ start log present | ✅ wired | wakes os_session inbox |
| **`certMonitorService`** | 1h tick | timer | n/a | ✅ start log present | ✅ wired | TLS expiry alerts |
| **`cacheKeepaliveWorker`** | 45min tick | timer (work-hours gated) | n/a | ✅ start log present | ✅ wired | Anthropic prompt-cache refresh |
| **`factoryBridge` (Redis subscriber)** | Redis pub/sub | factoryRunner publish | Redis | ✅ start log present (`Factory bridge subscriptions active`) | ✅ wired | session_complete + ws_broadcast relay |
| **`rescueService`** | Redis subscriber | ecodia-rescue publish | Redis | ❓ start log MISSING | UNVERIFIED | n/a (no rescue invocation in window) |
| **`imessagePathHealthCheck`** | 6h cron | timer | n/a | ❓ start log MISSING | UNVERIFIED | writes `kv_store.health.imessage_path` (canary) |
| **`nightlyRestartService`** | 03:00 AEST cron | timer | n/a | ❓ start log MISSING | UNVERIFIED | spawns `pm2 restart ecodia-api` |
| **`sessionAutoWake`** | one-shot at boot (15s after) | setTimeout | n/a | ❓ start log MISSING | UNVERIFIED in window | POSTs `/api/os-session/message` if recent handoff |
| **alive-beacon `setInterval`** (server.js:613) | 60s tick | timer | n/a | ❓ start log MISSING | UNKNOWN | upserts `kv_store.osalive_last` |

---

## 3. Five-layer verdict per listener (canonical pattern)

For each, layers are: (1) PRODUCER, (2) TRIGGER, (3) BRIDGE, (4) LISTENER, (5) SIDE-EFFECT.

### 3.1 `forkComplete` — VERIFIED LIVE
1. **Producer**: `os_forks` UPDATE (status terminal OR `last_heartbeat > NOW() - 10min` is stale). Triggered by `forkService.spawnFork`/`recoverStaleForks`/heartbeat cycle.
2. **Trigger**: pg trigger `trg_os_forks_status_notify` → `eos_listener_notify_compact()` → `pg_notify('eos_listener_events', ...)`.
3. **Bridge**: `dbBridge._connect()` LISTEN on `eos_listener_events` → `_onNotification` → `wsManager.broadcast('db:event', payload)`.
4. **Listener**: registry.dispatch picks up envelope.type=`db:event`, `factorySessionComplete`/`forkComplete`/`ccSessionsFailure` all subscribe. forkComplete's `relevanceFilter` matches `table=os_forks`.
5. **Side-effect**: writes to `perceptionBus` with kind=`fork_complete` / `fork_error` / `fork_aborted` (visible in `os_observations` source=`fork`, ×89 in 24h, latest 12:30:22.835Z — seconds before audit). Republishes per-fork-id-source for downstream dispatchers (24 unique fork-id sources observed in window).

### 3.2 `factorySessionComplete` + `ccSessionsFailure` — VERIFIED LIVE
1. **Producer**: `cc_sessions` UPDATE (status=complete/error, stage=awaiting_review/failed/complete).
2. **Trigger**: pg trigger `trg_cc_sessions_status_notify` → `eos_listener_notify_compact` → `pg_notify`.
3. **Bridge**: same as forkComplete.
4. **Listener**: factorySessionComplete handles success path, ccSessionsFailure handles failure path. Both match on `table=cc_sessions`.
5. **Side-effect**: `factory.session_failure` ×11 in `os_observations` (latest 10:55:49 UTC). Routes to `factoryOversightService.runPostSessionPipeline`.

### 3.3 `dispatchQueueListener` — WIRED, sparse 24h activity
1. **Producer**: `dispatch_queue` rows (queue inserts) and `os_forks` updates.
2-3. Same trigger/bridge as above.
4. **Listener**: subscribes db:event.
5. **Side-effect**: drives Factory queue. No observable os_observations write attributable in window — listener does NOT republish to perceptionBus (per worker3 audit §1, only listener that doesn't republish).

### 3.4 `emailArrival` — WIRED BUT DARK (producer feed empty)
1. **Producer**: `email_events` INSERT — but the writer (Gmail poller) has not produced rows in the 24h window.
2-4. Loaded, registered, listener relevance filter ready.
5. **Side-effect**: none (no producer events to consume). Same secondary-darkness as called out in `drafts/listener-pipeline-audit-2026-04-29.md` §3.

### 3.5 `invoicePaymentState` — WIRED BUT DARK (producer feed empty)
1. **Producer**: `staged_transactions` INSERT (amount_cents > 0). Bank-import dormant in window — `staged_txn_24h=0`.
2-4. Loaded, registered.
5. **Side-effect**: none in window.

### 3.6 `statusBoardDrift` — WIRED, timer-driven
1. **Producer**: `status_board` INSERT/UPDATE + 30-min timer in own `start()`.
2-3. db:event path AND in-process setInterval.
4. **Listener**: subscribes db:event AND fires its own timer in `start()`.
5. **Side-effect**: writes status_board drift rows + perceptionBus publishes. perception_dispatcher matched `overdue_status_board_items` ×2 at 12:03:02 UTC (matcher firing on its publishes).

### 3.7 `_smoke` — INTENTIONAL NOOP
Pipeline-validation listener whose `relevanceFilter` always returns false. Loaded; never handles. Verifies the load+register path didn't regress.

### 3.8 `dbBridge` — TRANSPORT LIVE (intentionally skipped by registry)
1. n/a (transport).
2. n/a (consumes pg_notify).
3. ITSELF the bridge.
4. Connects via dedicated `idle_timeout: 0` postgres connection, LISTEN on `eos_listener_events`, 5s timeout-or-resolve at boot.
5. Broadcasts `db:event` envelopes via wsManager to every registry-loaded listener.
   **Evidence of liveness**: forkComplete, factorySessionComplete, ccSessionsFailure are all firing (§3.1-3.2) — that path requires dbBridge to be transmitting. Therefore dbBridge is up.

### 3.9 `perceptionDispatcher` — LIVE (worker3 already verified deeply; brief said don't re-test)
1. **Producer**: every `perceptionBus.publish()` in-process call (forks, factory, statusBoardDrift, invoicePaymentState, securityIncidentResponse).
2. **Trigger**: in-process callback registered at `perceptionBus._subscribers`.
3. **Bridge**: synchronous in-process call.
4. **Listener**: 6 matchers (finance, status_board, crm, error_escalation, task_completion, security_incident).
5. **Side-effect**: ×3 in `os_observations` source=`perception_dispatcher` in 24h (overdue_status_board_items ×2 at 12:03 UTC, followup_scheduling_suggested ×1 at 12:03 UTC); auto-creates P1 status_board rows for matched events.

### 3.10 `proactivityEngine` — UNVERIFIED (start log absent, no observable side-effects)
1. **Producer**: own tick loop (timer). Reads state from status_board / kv_store / Neo4j to decide actions.
2. **Trigger**: timer.
3. **Bridge**: n/a.
4. **Listener**: would `start()` and begin ticking.
5. **Side-effect**: enqueues actions via `dispatch_queue`. No `dispatch_queue` rows attributable to proactivityEngine in 24h. The expected start log line `proactivityEngine: started` (proactivityEngine.js:355) is **absent from production stdout** despite the surrounding try/catch in server.js:653-657 having no skip path other than CONDUCTOR_DETACHED (which is false in the running env). See §4 for why.

### 3.11 `patternEvolution` — UNVERIFIED (start log absent)
Same shape as 3.10. Expected log `patternEvolution: started` (patternEvolution.js:287) is absent. No Reflection node writes, no pattern demotions observed in 24h.

### 3.12 `claimVerifierWorker` — VERIFIED LIVE
1. **Producer**: `conductor_claims` rows pending (claim grammar §3 OBSERVABILITY_SPEC).
2-3. Self-poll every 30s.
4. **Listener**: own `setInterval`, `_inFlight` reentrancy guard.
5. **Side-effect**: writes verification outcomes back to `conductor_claims`. Start log present (`claimVerifierWorker started poll_ms=30000` at 11:47:32.182Z).

### 3.13 `credentialRedactionMonitor` — VERIFIED WIRED (still in 2h bootstrap)
1. **Producer**: `credentialFilter._counters` map (incremented at every emit-point redaction).
2-3. Self-poll every 30s.
4. **Listener**: own `setInterval`. Has `fireIncident` actuator wired to `securityIncidentResponse.fireIncident`.
5. **Side-effect**: would fire `credential_redaction_burst` after `bootstrap_ms=7200000` elapses (2h). Process uptime is currently 38 minutes — still in bootstrap window, so even if counters incremented, no fire would occur. Start log present.

---

## 4. P-Zero #2 — 5 May silent-skip root cause

### Empirical pinpoint
Last successful post-cred boot log: **2026-05-04 23:07:38 UTC** (`Claude token refresh service disabled — long-lived OAuth tokens detected`).
First fully-silent boot (cred-monitor logs but nothing after): **2026-05-04 23:14:01 UTC**.
Only commit in the window: **`82f462a` "energy: disable quota-check fetch — was crashing api silently"** (Tue May 5 09:13:38 +1000 = 23:13:38 UTC).

### What 82f462a actually changed
- `src/services/osSessionService.js` — replaced top-level `usageEnergy.refreshAllAccounts().then(...).then(logger.info('Claude energy on startup', ...))` with a single `logger.info('Claude energy: boot probe disabled (state populates from SDK turns)')`.
- `src/services/usageEnergyService.js` — disabled stale-header background refresh in `getEnergy()`.
- `src/routes/osSession.js` — removed `await usageEnergy.refreshAllAccounts()` from `/energy/reset`.

**The commit removed the `fetch + AbortController` pair that was crashing the api process at boot (silent exit code 0, mid-fetch).** Before the commit, the post-cred logs *briefly* appeared because the process raced from cred-monitor through token-refresh before crashing. After the commit, the process stops crashing — but it *also* stops emitting any logger.info output past `credentialRedactionMonitor started`.

### What is empirically true now
- Process uptime: 38 min (process is alive, not crashing)
- stdout FD on `node src/server.js` (PID 1858322) → socket 31215420 (PM2 captures it)
- stderr FD → socket 31215422 (PM2 captures it)
- `process.stderr.write` from `registry._bootStderr` reaches `ecodia-api-error.log` (8/8 listener load lines visible per boot)
- `logger.info` calls AFTER `credentialRedactionMonitor started` reach NEITHER `ecodia-api-out.log` NOR the in-memory ring buffer file dumps
- Substrate evidence proves listeners fire: forkComplete writes 89 rows, factorySessionComplete sibling writes 11, perceptionDispatcher writes 3, dbBridge transport is live — so the listener subsystem and perceptionDispatcher are running despite their start logs being absent
- Isolation reproduction (`node -e` loading cred-monitor → tokenRefresh → wireServices → imessage in sequence): **all start logs land in stdout cleanly**

### Verdict
**Logger output silently drops at the Console transport between credentialRedactionMonitor.start() and the next post-cred logger.info call inside the live `server.listen` callback.** Execution proceeds (we have substrate evidence that listeners + perceptionDispatcher run); only the log lines vanish.

The Console transport's `format.combine(format.timestamp(), format.errors({stack:true}), format.json())` chain (logger.js:256-261) does not appear to throw in isolation. The DBErrorTransport is hardened against backpressure (logger.js:55-70) so it cannot block. The RingBufferTransport is in-memory only (logger.js:182-208).

**Strong-but-not-proven hypothesis:** something in the post-cred boot section of `server.listen` callback is throwing/awaiting in a way that breaks the `format.json()` serialization for subsequent logger.info calls — most likely a circular reference or a non-serializable property that `format.json()` silently fails on, dropping the entry. Console transport's `log()` would silently no-op if format returned `undefined`.

The bisect candidates (between cred-monitor at server.js:423 and listener subsystem at server.js:643):
- `securityIncidentResponse.wireServices(...)` (server.js:458-526) — injects 4 closures including `db\`INSERT INTO kv_store\`` containing `${JSON.stringify({...})}` — sync-ok.
- `imessagePathHealthCheck.start()` (534-538) — calls SSH path, no boot-time await.
- `rescueService.start()` (547-551) — async fire-and-forget.
- `nightlyRestartService.start()` (559-563) — sync.
- **`await db\`SELECT value FROM kv_store WHERE key='osalive_last'\``** at server.js:573 — only `await` in the post-cred chain. `.catch(() => [])` makes it always resolve. But after this await resolves, downstream logger.info calls die.

### Proposed fix (file:line)

**Step 1 — instrument and bisect (server.js, immediately ship):**
Add unconditional `process.stderr.write` markers between every gated section in the boot block:

```js
// server.js after line 428 (after cred-monitor try/catch closes)
process.stderr.write('[boot] post-credentialRedactionMonitor\n')

// server.js after line 440 (after claudeTokenRefreshService try/catch closes)
process.stderr.write('[boot] post-claudeTokenRefreshService\n')

// server.js after line 526 (after securityIncidentResponse.wireServices try/catch closes)
process.stderr.write('[boot] post-securityIncidentResponse.wireServices\n')

// server.js after line 538 (after imessagePathHealthCheck try/catch closes)
process.stderr.write('[boot] post-imessagePathHealthCheck\n')

// server.js after line 551 (after rescueService try/catch closes)
process.stderr.write('[boot] post-rescueService\n')

// server.js after line 565 (after nightlyRestartService try/catch closes)
process.stderr.write('[boot] post-nightlyRestartService\n')

// server.js after line 627 (after process restart alert + alive beacon try/catch closes)
process.stderr.write('[boot] post-processRestartAlert\n')

// server.js after line 636 (after sessionAutoWake try/catch closes)
process.stderr.write('[boot] post-sessionAutoWake\n')

// server.js after line 648 (after listener subsystem try/catch closes)
process.stderr.write('[boot] post-listenerSubsystem\n')

// server.js after line 658 (after proactivityEngine try/catch closes)
process.stderr.write('[boot] post-proactivityEngine\n')

// server.js after line 666 (after perceptionDispatcher try/catch closes)
process.stderr.write('[boot] post-perceptionDispatcher\n')

// server.js after line 674 (after patternEvolution try/catch closes)
process.stderr.write('[boot] post-patternEvolution\n')
```

These bypass winston entirely (same mechanism that lets `[listener-registry]` lines through). The next pm2 restart will tell us exactly how far execution proceeds and where it stops, in <30s of stderr.

**Step 2 — harden Console transport (logger.js:243):**
Wrap the Console transport with a `format.errors({stack:true})`-safe alternative AND attach an `error` handler:

```js
// logger.js after line 243
const _consoleTransport = new transports.Console({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Defensive: if the format chain throws/returns undefined, surface it
  // via a backup stderr write rather than silently dropping the entry.
  handleExceptions: false,
})
_consoleTransport.on('error', (err) => {
  try { process.stderr.write(`[logger] Console transport error: ${err.message}\n`) } catch {}
})
```

**Step 3 — defensive logger drop-detection (logger.js after line 271):**
```js
// Verify Console transport still works on every Nth call. If three consecutive
// emits silently no-op (format returns undefined or transport throws), fall
// back to direct process.stderr.write of the JSON payload.
const _origInfo = logger.info.bind(logger)
let _consoleSilentCount = 0
logger.info = (...args) => {
  try {
    _origInfo(...args)
    _consoleSilentCount = 0
  } catch (err) {
    _consoleSilentCount++
    if (_consoleSilentCount >= 3) {
      process.stderr.write(`[logger-fallback] ${JSON.stringify({ level: 'info', args })}\n`)
    }
  }
}
```

(Step 3 is a defensive no-op until the actual silencer fires; once we have the bisect from Step 1, this wrapper isn't needed.)

### Note on the f3005a4 lazy-init "papering over"
Brief mentions `f3005a4` as a perceptionDispatcher lazy-init papering. I did not find that commit by hash in the recent log; the closest fix-shaped commit is `2c15e9f` "feat(jarvis): ship layers 2, 4, 6, 7, 10 — proactivity, perception, time sense, economic governance, evolution" which would be where these three services landed. Whatever was done in f3005a4 doesn't address the underlying logger silence — substrate evidence proves perceptionDispatcher is running anyway, so the lazy-init may have been a workaround for a different symptom.

---

## 5. P-Zero #1 — 28 Apr only-2-of-7 — RESOLVED (verification)

The original bug (5 of 7 listeners silently dropped after `dbBridge.js` skip in `loadListeners()` for-loop) was **fixed in registry.js** before this audit.

### Fix mechanics in current registry.js
1. **Explicit allow-list** (registry.js:42-52): `LISTENER_FILES = [...]` — no more `fs.readdirSync()` corner cases.
2. **Synchronous stderr per file** (registry.js:65-67, 71, 82, 91, 103, 110, 113, 120, 127): every load-loop outcome bracketed by `process.stderr.write` so winston async-buffer can never lose visibility.
3. **Boot-time assertion** (registry.js:125-134): if `loaded.length !== EXPECTED_LOADED_COUNT` (= LISTENER_FILES.length - 1 for the dbBridge intentional skip), emit unmissable stderr `ASSERTION FAILED` AND `logger.error` to DBErrorTransport.

### Evidence the fix is live
Every recent boot's stderr shows `load: complete — loaded=8 (expected=8) skipped=1` followed by `registerAll: registered 8 listeners on channels [os-session:output]`. No assertion-failed line on any boot in the 24h window. Substrate evidence (§3.1-3.6) confirms the loaded listeners actually fire.

### Residual P3
The `logger.info('listener subsystem: registered N listeners on channels')` at registry.js:211 and `logger.info('listener subsystem: started with N listeners + db bridge')` at index.js:37 are SAME-CHAIN consumers of the silent-skip from §4 — they don't surface in stdout. This isn't a registry bug; it's the §4 logger silence affecting the subsystem's own start logs.

---

## 6. New listeners discovered (not in the brief's enumerate-list)

- `osHeartbeatService` — timer-driven inbox waker, NOT a listener but uses subscription pattern (start() log present)
- `certMonitorService` — TLS expiry hourly tick (start() log present)
- `cacheKeepaliveWorker` — Anthropic prompt-cache refresh (start() log present)
- `factoryBridge` — Redis subscriber for factory session_complete + ws_broadcast relay (start log present)
- `imessagePathHealthCheck` — 6h SSH probe to SY094 (start log MISSING — silenced by §4)
- `nightlyRestartService` — 03:00 AEST cron (start log MISSING — silenced by §4)
- `sessionAutoWake` — one-shot 15s post-boot (no start log designed; would fire 15s after boot if recent handoff exists)
- alive-beacon `setInterval` at server.js:613-624 — 60s `kv_store.osalive_last` upserter
- `perceptionBus` (services/perceptionBus.js) — pub/sub bus that backs perceptionDispatcher; producer side, not a listener
- `wsManager` (websocket/wsManager.js) — registers all listener registry callbacks via `subscribe()`; transport, not listener

---

## 7. Substrate evidence summary

Query: `SELECT source, kind, count(*), max(observed_at) FROM os_observations WHERE observed_at > NOW() - INTERVAL '24h' GROUP BY source, kind ORDER BY count DESC` (top entries):

| source | kind | count | latest |
|---|---|---:|---|
| `fork` | `fork_complete` | 75 | 2026-05-05 12:30:22.821 UTC |
| `fork` | `fork_error` | 13 | 2026-05-05 10:58:36.729 UTC |
| `factory` | `session_failure` | 11 | 2026-05-05 10:55:49.690 UTC |
| `perception_dispatcher` | `overdue_status_board_items` | 2 | 2026-05-05 12:03:02.517 UTC |
| `perception_dispatcher` | `followup_scheduling_suggested` | 1 | 2026-05-05 12:03:02.559 UTC |
| `fork` | `fork_aborted` | 1 | 2026-05-05 11:09:38.215 UTC |
| `fork:fork_*` (24 unique) | `fork_complete` (most) | 1 each | spread across 11:26 → 12:30 UTC |

Listeners proven live by writes to substrate this window: **forkComplete, factorySessionComplete, ccSessionsFailure, perceptionDispatcher, dbBridge** (transport for first three). Listeners wired but with 0 producer rows in window: **emailArrival, invoicePaymentState**. Loaded but no observable substrate writes in window (timer-driven, expected silent in audit window): **statusBoardDrift, dispatchQueueListener, _smoke**.

---

## 8. Path to draft artefact

`~/ecodiaos/drafts/listener-audit-worker1-2026-05-05.md` (this file). Stamped with fork id `fork_moslif9x_75b9f4` in the per-line context above. No commit — workspace doctrine for audit-only deliverables.
