# Listener Subsystem Design-Upgrade Audit (Worker 3)
**Fork:** fork_moslimsp_a72e73 (worker, reports to manager fork_moslfc45_e59e0d)
**Date:** 2026-05-05
**Scope:** perceptionBus, perceptionDispatcher, listeners/* (8 files), forkService.forkComplete handler, claimVerifierWorker, securityIncidentResponse
**Mode:** read-only audit + draft fixes (no PM2 restart, no production publish)

---

## 1. Subsystem Map (what's wired, where)

```
        ┌──────────────────────────────────────────────────────────────────┐
        │  PRODUCERS                                                       │
        │   forkService.spawnFork → publish('fork', 'fork_complete', ...)  │
        │   forkComplete listener → publish('fork', 'fork_done|aborted')   │
        │   factorySessionComplete → publish('factory', 'factory_*')       │
        │   ccSessionsFailure     → publish('factory', 'session_failure')  │
        │   emailArrival          → publish('email', kind)                 │
        │   invoicePaymentState   → publish('bookkeeper', 'payment_match') │
        │   statusBoardDrift (timer) → publish('status_board', 'drift')    │
        │   securityIncidentResponse  → ❌ NO publish                      │
        └────────────────┬─────────────────────────────────────────────────┘
                         │ in-memory (perceptionBus._subscribers + INSERT
                         │ os_observations) — single Node process
                         ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │ perceptionBus.publish()                                          │
        │  - INSERT os_observations (fire-and-forget on failure)           │
        │  - call _subscribers in-process synchronously                    │
        │  - setImmediate(_tryPromote) → Neo4j Episode if score>=0.6       │
        └────────────────┬─────────────────────────────────────────────────┘
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
   perceptionDispatcher._onEvent   custom subscribers (none in prod)
          │
          ├── 6 MATCHERS (finance / status_board / crm / error_escalation
          │   / task_completion / security_incident)
          ├── per-matcher dedupe key = domain:source:kind, 5min window
          └── fire-and-forget dispatch() → DB writes + republish to bus

        ┌──────────────────────────────────────────────────────────────────┐
        │ DB BRIDGE (separate channel)                                     │
        │ pg_notify on eos_listener_events → dbBridge → wsManager.broadcast│
        │   ('db:event') → registry.dispatch → 7 listeners                 │
        │     * forkComplete (os_forks UPDATE)                             │
        │     * factorySessionComplete (cc_sessions UPDATE)                │
        │     * ccSessionsFailure (cc_sessions UPDATE)                     │
        │     * emailArrival (email_events INSERT)                         │
        │     * invoicePaymentState (staged_transactions INSERT)           │
        │     * statusBoardDrift (status_board INSERT/UPDATE) + 30m timer  │
        │     * dispatchQueueListener (os_forks UPDATE)                    │
        └──────────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────────────────────────────────┐
        │ BP4 SURFACING (osSessionService._sendMessage)                    │
        │   perceptionBus.recentSummary(60) → <perception_summary> block   │
        │     · top 20 events, source distribution                         │
        │     · notable filter (confidence>=0.7 or promotionScore>=0.6)    │
        │   landed in continuityParts via turnInjection.processBlocks      │
        └──────────────────────────────────────────────────────────────────┘
```

**Two distinct event substrates that LOOK alike but aren't unified:**
1. `perceptionBus` — in-process pub/sub, persisted to `os_observations`, read-out via `recentSummary()` → BP4.
2. `wsManager` `db:event` channel via `dbBridge` — pg_notify-driven, routed to listener registry.

**Listeners on the wsManager substrate publish back into perceptionBus** in their `handle()` (forkComplete, factorySessionComplete, ccSessionsFailure, emailArrival, invoicePaymentState, statusBoardDrift). So the buses converge at the perception layer for BP4 read-out, but the dispatch path is split. `dispatchQueueListener` is the only listener that does NOT republish to perception — it acts on `dispatch_queue` rows directly.

---

## 2. Per-Dimension Audit

### Per-listener / dispatcher rollup

| Component | Dedupe | Priority | Error Iso | Observability | Restart | Parallelism | Speed | BP4 |
|---|---|---|---|---|---|---|---|---|
| `perceptionBus.publish` | ❌ MISSING | ❌ FIFO | ✅ try/catch per sub | 🟡 INSERT os_obs only | ❌ in-mem subs lost on restart | ⚠ serial sync subs | ✅ O(N subs) | ✅ via recentSummary |
| `perceptionDispatcher._onEvent` | ✅ 5min domain:src:kind | ❌ FIFO matcher iter | ✅ per-matcher try/catch | ❌ no counters | ❌ in-mem dedupe lost | ✅ async dispatch fire-forget | 🟡 re-stringifies data per matcher | ✅ republish surfaces |
| `dbBridge` | n/a (transport) | n/a | ✅ try/catch + reconnect backoff | 🟡 boot-stderr only | ✅ auto-reconnect 1→30s | n/a | ✅ direct LISTEN | n/a |
| `registry.dispatch` | ❌ no event-level dedupe | ❌ FIFO listener iter | ✅ filter+handle try/catch | 🟡 boot-stderr count | ❌ in-flight set lost | ⚠ per-listener concurrency=1 (drops, no queue) | ✅ envelope match | n/a |
| `forkComplete` | ✅ stale-fork in-mem Set | ❌ none | ✅ axios timeout 5s | 🟡 logger info | ❌ stale dedup lost | drop-on-inflight | ✅ | ✅ via publish |
| `factorySessionComplete` | ✅ 60s in-mem Map LRU 200 | ❌ none | ✅ wraps wake POST | 🟡 logger info | ❌ dedup lost | drop | ✅ | ✅ |
| `ccSessionsFailure` | ❌ MISSING | ❌ none | ✅ | 🟡 logger | ❌ | drop | ✅ | ✅ |
| `emailArrival` | ❌ MISSING (relies on INSERT-once) | ❌ none | ✅ wrapUntrusted | 🟡 logger | ❌ | drop | ✅ | ✅ |
| `invoicePaymentState` | ❌ MISSING (INSERT-once) | ❌ none | ✅ try/catch | 🟡 logger | ❌ | drop | 🟡 SELECT all open invoices each fire | ✅ |
| `statusBoardDrift` | ✅ alertedIds Set + last_touched | ❌ none | ✅ | 🟡 logger | ❌ alert state lost | drop | ✅ 30m timer | ✅ |
| `dispatchQueueListener` | ✅ atomic `UPDATE … WHERE status='queued'` | ✅ ORDER BY priority,created_at | ✅ per-row try/catch | 🟡 logger | ✅ DB-backed (durable) | ✅ DB-row claim | ✅ LIMIT 50 | ❌ no perception republish |
| `claimVerifierWorker` | n/a (pull-based timer) | ✅ ORDER BY claimed_at | ✅ per-row try/catch | 🟡 logger | ✅ DB-backed | drop concurrent ticks (`_inFlight`) | 🟡 sequential per-row exec | n/a |

### Dimension classification (rolled up across the subsystem)

| Dimension | Classification | Worst-case symptom | Best-case present |
|---|---|---|---|
| **1. Dedupe (publish layer)** | **MISSING** | Same fork_complete published 2× (e.g. forkService publishes + forkComplete listener republishes for SAME terminal transition) → BP4 perception_summary double-counts events. Already happening (see §3.1). | Dispatcher has it. |
| **2. Priority** | **MISSING** | A `security_incident` event ride-shares behind 6 routine `fork_complete` events in the matcher loop. Acceptable today (matcher loop is microseconds), unacceptable when matchers do DB work. | dispatchQueueListener + claimVerifier already ORDER BY priority. |
| **3. Error handling** | **VERIFIED-OK** | Every level has try/catch isolation; matcher throw doesn't crash dispatcher. | Verified via static read of every catch. |
| **4. Observability** | **WIRED-BUT-DARK** | No way to query "how many events did the `error_escalation` matcher fire in the last hour" without manually `SELECT count(*) FROM status_board WHERE name LIKE 'auto: %' AND source='perception_dispatcher'`. No matcher-level counters published. No BUS-level rate metric. logger.info lines only. | os_observations table has all raw events (queryable with care). |
| **5. Restart resilience** | **WIRED-BUT-DARK / MISSING** | PM2 restart mid-event-flight: in-memory `_subscribers`, `_recentDispatches`, `_alertedIds`, `_recentFires`, `_staledForks` ALL lost. Inflight events on registry.dispatch lost. dbBridge auto-reconnects but pg_notify channel buffers nothing — events that fired during the gap are gone. NO at-least-once guarantee for security_incident. The `eos_listener_events` channel is fire-and-forget. | os_observations INSERT happens before subscriber fan-out, so PUBLISHED events ARE durable on disk; replay tooling could re-feed them. dispatch_queue + conductor_claims are durable. |
| **6. Parallelism** | **VERIFIED-OK / WIRED-BUT-DARK** | registry concurrency-cap=1 DROPS events that arrive while a handler is in-flight (NOT queues them). For `forkComplete`, this means a burst of 5 forks finishing in <1s → only the first is handled, 4 are dropped. The drop is logged but not counter-aggregated. | Dispatcher matchers run in parallel via fire-and-forget Promise. |
| **7. Speed** | **VERIFIED-OK** for current volume | `JSON.stringify(event.data)` is recomputed inside every matcher's `test()` — the data string in `finance`, `status_board`, `crm`, `security_incident` matchers is rebuilt 4× per event. At 6 matchers and ~10-50 events/min, this is fine. At 1000 events/min it bottlenecks. | Otherwise pure regex + Map lookups. |
| **8. BP4 surfacing** | **VERIFIED-OK** | `recentSummary(60)` reads `os_observations` directly → `<perception_summary>` block stitched into next conductor turn via `turnInjection.processBlocks` (osSessionService.js:1814,1973,1995). Independent of in-memory state. | Sibling worker can verify matcher fires; the path from matcher republish → os_observations row → recentSummary → continuityParts is fully wired. |

---

## 3. Specific Defects Found

### 3.1 Double-publish of `fork_complete` (HIGH leverage to fix)
- `forkService.js:929-945` publishes `source='fork:<id>'`, `kind='fork_complete'` on success.
- `listeners/forkComplete.js:101` publishes `source='fork'`, `kind='fork_complete'` ALSO on success (for the SAME terminal transition the registry sees via dbBridge → os_forks UPDATE).
- Net: 2 rows in `os_observations` per fork completion. perception_summary counts `fork(2)` instead of `fork(1)`.
- The dispatcher's own dedupe key is `domain:source:kind`, so source mismatch (`fork:abc123` vs `fork`) means dedupe doesn't catch it.

**Fix:** Drop one. The forkService publish is closer to ground truth (richer payload — tokens, duration, parent_id). Listener publish should be dropped OR canonicalised to use the same source string. See `proposed-design-fixes/01-dedupe-fork-complete-publishes.md`.

### 3.2 `securityIncidentResponse.fireIncident` does NOT publish to perceptionBus
- `securityIncidentResponse.js` runs the response (emergency_mode, halt forks, SMS Tate) and INSERTs into `security_incidents` table, but never `perceptionBus.publish()`.
- The dispatcher matcher `security_incident` (perceptionDispatcher.js:237-276) was wired 5 May to listen for security signals, but the canonical security signal source — fireIncident — does not feed it.
- Result: a fired incident creates a `security_incidents` row + emergency_mode flag, but does NOT auto-create a status_board P1 row via the matcher path. The status_board row only appears if some OTHER caller publishes a `kind` matching the matcher's regex.

**Fix:** add `perceptionBus.publish({source:'security', kind:incident_class, ...})` inside `_logIncident` or at the head of `fireIncident`. See `proposed-design-fixes/02-security-incident-publishes-to-bus.md`.

### 3.3 Concurrency-cap=1 silently drops events
- `registry.js:165-168`: when handler in-flight, the new event is dropped (logged at `logger.info`, no counter, no surface). For `forkComplete`, a burst of fork terminations within a single handler's wake-POST window (5s axios timeout) means subsequent terminations are silently dropped.
- This is mostly fine because forkComplete's wake path is now silent on `done`/`error`/`aborted` (publish-only), but the RELEVANCEFILTER true → in-flight → drop path still fires for `db:event` envelopes.
- And the publish-to-perception side ALSO doesn't fire on dropped events. So under burst, perceptionBus loses events.

**Fix:** replace drop-on-inflight with a small bounded queue (size=10, FIFO) + counter. See `proposed-design-fixes/03-bounded-queue-not-drop.md`.

### 3.4 Matcher throwing in `test()` is silently caught but not counter-tracked
- `perceptionDispatcher.js:281-298` has try/catch around BOTH `test()` and the dispatch trampoline.
- `logger.debug` only — debug is filtered out of production stderr. So a matcher whose regex throws on certain payloads (e.g. circular-ref data) is INVISIBLE at runtime. The matcher silently fires zero times forever.

**Fix:** elevate to `logger.warn` AND increment a per-matcher error counter. See §4.4.

### 3.5 No per-matcher fire-counter
- We can run `SELECT source, kind, count(*) FROM os_observations WHERE observed_at > NOW() - INTERVAL '1 hour' GROUP BY 1,2` to get raw event volume.
- We CANNOT answer "how many times did the `error_escalation` matcher actually fire (passed test, passed dedupe, executed dispatch)?" without grepping logs.
- Conductor needs this to know whether matcher decay is happening (e.g. matcher was wired but dark for 24h before sibling worker validated).

**Fix:** in-mem counters + `/api/observability/listener-stats` route + Prom-style export. See `proposed-design-fixes/04-listener-stats-endpoint.md`.

### 3.6 dbBridge listen connection is single point of failure
- One postgres client (`max:1`) holding LISTEN. If the channel goes idle long enough for pgBouncer / network to drop it, postgres v3 lib auto-reconnects, but during the gap, pg_notify fires are lost (Postgres doesn't buffer NOTIFY across reconnect).
- Initial-connect backoff (1→30s) is fine. RUNTIME drop has NO backoff — relies on driver's internal reconnect.

**Fix:** add a heartbeat check (publish a synthetic NOTIFY every 30s, log if listener doesn't echo it within 10s). See `proposed-design-fixes/05-dbbridge-heartbeat.md`.

### 3.7 perceptionBus has no in-process fan-out priority
- All subscribers receive every event in registration order, no priority hints. If we add 10+ subscribers, a slow security-tier subscriber waits behind a finance-tier one.
- Currently only the dispatcher subscribes, so this is theoretical. But the brief asks about it.

**Fix:** subscribe-with-priority API (low priority number = early). See `proposed-design-fixes/06-prioritised-subscribers.md`.

### 3.8 Pre-tokenise once per event, not per-matcher
- `finance`, `status_board`, `crm`, `security_incident` matchers each call `JSON.stringify(event.data || {}).toLowerCase()` independently.
- At 6 matchers, that's 4 stringifies per event. Cheap today, will matter at high volume.

**Fix:** dispatcher pre-builds `event._lc_kind` and `event._lc_data_str` once before the matcher loop, matchers use those. See `proposed-design-fixes/07-pre-tokenise-event.md`.

---

## 4. Design-question answers

### Q1. Should perceptionDispatcher matchers be hot-reloadable?
**No, not in production. Yes, in a dev/staging gated mode.**

Reasoning:
- Hot-reload of matcher code via `delete require.cache[require.resolve('./perceptionDispatcher')]; require('./perceptionDispatcher').start()` is technically straightforward.
- BUT: matcher code can have side effects on subscription. The current `_started` guard plus `perceptionBus.subscribe()` returning an unsubscribe handle is sufficient for a controlled reload, but the bus's `_subscribers` array is currently push-only (no unsubscribe path on perceptionBus itself — only wsManager has that).
- Risk: hot-reload mid-event-flight leaves orphan promise chains running against the OLD matcher closures. Bug-hunting nightmare.
- Better: keep matcher logic data-driven (matcher table) and edit the table in DB; matchers reload from DB on dispatcher tick. This converts matcher edits from "code reload" to "DB write" which is reload-safe.

**Recommendation:** ship a `perception_matchers` table read at dispatcher start (and on `SIGHUP`). See `proposed-design-fixes/08-matcher-table-not-code.md`.

### Q2. Shadow mode for new matchers?
**Yes, this is high-leverage and cheap to add.**

Reasoning:
- Mistakes in matcher regex / dispatch logic are expensive: a bad `error_escalation` regex creates spurious P1 status_board rows; a leaky `security_incident` matcher fires emergency mode on benign events.
- Shadow mode = matcher's `test()` runs, dispatch is GATED on `env.PERCEPTION_MATCHER_SHADOW_<domain>=1` — when shadow, dispatch logs what it WOULD do without performing the side-effect.
- Concretely: each matcher's `dispatch()` already handles its own DB writes; we wrap with `if (matcher.shadow) { logger.info('shadow', {...}); return }`.

**Recommendation:** ship per-matcher shadow flag. New matchers default to shadow=true for 24h. See `proposed-design-fixes/09-shadow-mode.md`.

### Q3. Replay buffer for events?
**Yes, partial — already half-implemented via os_observations.**

Reasoning:
- `os_observations` IS a replay buffer (last 7d retained). Adding a matcher at runtime should be able to consume historical events.
- Today: dispatcher `start()` only subscribes to NEW events. New matcher misses everything before its registration.
- Replay impl: matcher table column `replay_from_secs_ago` (default null = live only). Dispatcher start (or matcher table reload) runs a one-time backfill: `SELECT * FROM os_observations WHERE observed_at > NOW() - INTERVAL '<replay_from_secs_ago>'` and runs each through the matcher.
- Constraint: dispatch side-effects must be idempotent (most are: status_board "auto:" rows are dedupe'd by name; finance/crm/status_board republish events go through perception's INSERT path).

**Recommendation:** ship replay-on-register, default replay window = 0 (no backfill). Matcher author opts in. See `proposed-design-fixes/10-replay-on-register.md`.

### Q4. Listeners publish own health status?
**Yes, this is the missing observability layer.**

Reasoning:
- "Wired-but-dark" is the dominant failure mode (60+ hours of half-loaded listeners pre-30 Apr fix). The fix added boot-time stderr + assertion. Runtime health is still inferred from logs.
- Each listener emits a heartbeat to perceptionBus every N seconds (configurable, default 60s for timer-based, on-event for db-event listeners) → status_board row `auto: listener_health/<name>` updates `last_touched`.
- statusBoardDrift's existing 24h drift threshold + priority<=2 filter naturally surfaces a listener that stopped heart-beating.

**Recommendation:** add a `_heartbeat()` helper that listeners call from their `handle()` (or timer); listenerSubsystem aggregates and writes a single status_board row. See `proposed-design-fixes/11-listener-heartbeat.md`.

### Q5. Should the BUS itself be more durable?
**Already mostly is — INSERT happens before fan-out.**

Reasoning:
- `perceptionBus.publish()` does the os_observations INSERT BEFORE `for (const fn of _subscribers)`. So a successfully-published event is on disk. Crash mid-fan-out: subscriber didn't fire, but event is durable.
- What's MISSING: a "replay un-handled events on boot" path. After PM2 restart, dispatcher subscribes but doesn't replay events that arrived during the down window.
- The journal is already there; we need the replay-on-boot consumer.

**Recommendation:** dispatcher start, after subscribing, queries `SELECT * FROM os_observations WHERE observed_at > <last_processed_ts>` and replays. `last_processed_ts` stored in kv_store as `perception_dispatcher.last_processed_observed_at`. Idempotent because matcher dedupe + status_board name-dedupe. See `proposed-design-fixes/12-restart-replay.md`.

---

## 5. Top 5 Design Improvements (Ranked by Leverage)

| # | Improvement | Leverage | Cost | Doctrine link |
|---|---|---|---|---|
| 1 | **Restart-replay from os_observations** (durable bus + replay on boot) — closes silent-loss window across PM2 restarts. Today every restart drops in-flight events; security_incident at-least-once is the prize. | HIGH | medium (kv_store cursor + bounded SELECT) | [verify-deployed-state-against-narrated-state](~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md), [listener-pipeline-needs-five-layer-verification](~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md) |
| 2 | **Listener heartbeat → status_board** — turns "wired but dark" from forensic discovery (hours of log-grepping) into a P2 status_board row that auto-surfaces. Couples to existing statusBoardDrift. | HIGH | low (~30 lines, one helper) | [verify-empirically-not-by-log-tail](~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md) |
| 3 | **securityIncidentResponse → publish to bus** — single missing line that wires the existing `security_incident` matcher to the canonical incident source. Closes the audit gap that says "wired but the wire isn't connected to the actual signal." | HIGH | trivial (~5 lines) | [listener-pipeline-needs-five-layer-verification](~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md) |
| 4 | **Per-matcher fire counters + /api/observability/listener-stats** — converts "did this matcher actually fire today" from log grep to one HTTP read. Powers conductor's BP4-time decisions about doctrine drift detection. | MEDIUM | low (~50 lines + new route) | [decision-quality-self-optimization-architecture](~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md) |
| 5 | **Dedupe fork_complete double-publish + matcher-table not code** (combined) — matcher-table edit (5 min) is a 2-week win on every future matcher. fork_complete dedupe is a single-line hotfix. | MEDIUM | low | [verify-deployed-state-against-narrated-state](~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md) |

---

## 6. Source Code Drafts (paths to commits)

All under `~/ecodiaos/drafts/proposed-design-fixes/`:

- `01-dedupe-fork-complete-publishes.md` — drop forkComplete listener's success-path publish; forkService is canonical.
- `02-security-incident-publishes-to-bus.md` — 5-line patch in fireIncident.
- `03-bounded-queue-not-drop.md` — registry.js: small per-listener FIFO instead of drop-on-inflight.
- `04-listener-stats-endpoint.md` — `/api/observability/listener-stats` + per-matcher counter map.
- `05-dbbridge-heartbeat.md` — synthetic NOTIFY every 30s, alert on echo-drop.
- `06-prioritised-subscribers.md` — perceptionBus subscribe(types, fn, {priority}).
- `07-pre-tokenise-event.md` — dispatcher pre-builds lc_kind/lc_data_str.
- `08-matcher-table-not-code.md` — perception_matchers DB table, dispatcher reads at start + SIGHUP.
- `09-shadow-mode.md` — per-matcher shadow flag; new matchers default shadow=true 24h.
- `10-replay-on-register.md` — matcher.replay_from_secs_ago column.
- `11-listener-heartbeat.md` — _heartbeat helper; status_board row aggregator.
- `12-restart-replay.md` — dispatcher start replays os_observations from kv_store cursor.

Each drafts file includes either the small full patch (for ≤30-line fixes) or the migration + module skeleton (for larger ones).

---

## 7. What I did NOT modify (deliberately)

- `~/.claude/CLAUDE.md` and `~/ecodiaos/CLAUDE.md` doctrine — out of scope per brief.
- No PM2 restart, no production publish.
- No live-DB writes; the matcher-table proposal includes the migration but I have not run it.
- No sub-forks spawned (worker-fork constraint per brief).

## 8. BP4 surfacing verification (the question the manager flagged)

Sibling worker confirmed matchers fire. I verified the full end-to-end:

1. `osSessionService.js:1814` — `perceptionBus.recentSummary(60)` is awaited via `_perceptionPromise` with 2s timeout.
2. `osSessionService.js:1872, 1885-1887` — `_perceptionBlock` populated from the promise.
3. `osSessionService.js:1973` — `_perceptionBlock` becomes `'<perception_summary>': '<perception_summary>\n…\n</perception_summary>'` candidate.
4. `osSessionService.js:1978-1981` — `turnInjection.processBlocks` gates dedupe but emits if content differs from previous turn.
5. `osSessionService.js:1995` — order = `<now> > <forks_rollup> > <conductor_commitments> > <thread_carry_forward> > <recent_doctrine> > <relevant_memory> > <perception_summary> > <proactivity_signal> > …`
6. `osSessionService.js:2002` — emitted blocks pushed into `continuityParts`, stitched into the assistant's user message before SDK call.

`<perception_summary>` is **VERIFIED reaching BP4** via the static path. Empirical confirmation requires a live turn observation but the code path has no gaps.

The one thing to watch: `processBlocks` dedupe SKIPS if content is byte-identical to previous turn's emission. So if the same 20 events are still recent, the block is skipped on consecutive turns. That's the intended "no spam" behaviour, not a bug. Worth noting in case manager wants to verify "matcher fires AND conductor sees" in a single turn — needs a NEW event since last turn.

---

**End of audit.**
