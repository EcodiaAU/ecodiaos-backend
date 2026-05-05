# Fix 12 — Restart-replay from os_observations cursor

**Origin:** fork_moslimsp_a72e73 listener audit, design Q5 + Top-leverage #1
**Leverage:** HIGH (closes silent-loss window across PM2 restarts; security_incident at-least-once)
**Files:** `src/services/perceptionDispatcher.js`, kv_store key.

## Problem
PM2 restart mid-event-flight loses every in-process subscriber's view of in-flight events. The bus's `os_observations` table IS the durable journal — events arriving during the down window survive (because PG triggers populate it from listeners that produced them, AND publish() inserts before fan-out). But the dispatcher does NOT replay from the journal on boot.

Result: any matcher's response to events that occurred during a 5-min restart window is silently lost. Most acutely: `security_incident` matcher's status_board P1 row never gets created if the incident fired during the down window.

## Patch

Add a kv_store cursor — last-processed observation timestamp:

```javascript
const KV_CURSOR_KEY = 'perception_dispatcher.last_processed_observed_at'
const REPLAY_CAP_SECS = 7200  // never replay more than 2h on boot — sanity bound

async function _readCursor() {
  try {
    const [row] = await db`SELECT v FROM kv_store WHERE k = ${KV_CURSOR_KEY} LIMIT 1`
    if (!row) return null
    const ts = new Date(row.v.replace(/^"|"$/g, ''))
    return isNaN(ts.getTime()) ? null : ts
  } catch { return null }
}

async function _writeCursor(ts) {
  try {
    const v = JSON.stringify(ts.toISOString())
    await db`INSERT INTO kv_store (k, v) VALUES (${KV_CURSOR_KEY}, ${v})
             ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`
  } catch {}
}

async function _replayFromCursor() {
  const cursor = await _readCursor()
  const cap = new Date(Date.now() - REPLAY_CAP_SECS * 1000)
  // Use cap as floor — never replay more than 2h.
  const since = (!cursor || cursor < cap) ? cap : cursor

  try {
    const rows = await db`
      SELECT id, source, kind, data, confidence, observed_at
      FROM os_observations
      WHERE observed_at > ${since}
        AND source != 'perception_dispatcher'  -- avoid feedback loop
      ORDER BY observed_at ASC
      LIMIT 5000  -- hard cap, bigger than any plausible 2h burst
    `
    if (rows.length === 0) {
      logger.info('perceptionDispatcher: no events to replay since cursor', { since })
      return
    }
    logger.info('perceptionDispatcher: replaying events since cursor', { since, count: rows.length })

    for (const row of rows) {
      const event = {
        id: row.id, source: row.source, kind: row.kind,
        data: row.data, confidence: row.confidence,
        observed_at: row.observed_at,
      }
      // Pre-tokenise (Fix 07)
      event._lc_kind = (event.kind || '').toLowerCase()
      event._lc_source = (event.source || '').toLowerCase()
      try { event._lc_data_str = JSON.stringify(event.data || {}).toLowerCase() } catch { event._lc_data_str = '' }

      // Replay-prefix dedupe key so live events still dispatch
      for (const matcher of MATCHERS) {
        try {
          if (!matcher.test(event)) continue
          const dedupeKey = `replay:${matcher.domain}:${event.source}:${event.kind}`
          if (!_shouldDispatch(dedupeKey)) continue
          await matcher.dispatch(event).catch(err => {
            logger.warn('perceptionDispatcher: replay dispatch error', { domain: matcher.domain, error: err.message })
          })
        } catch (err) {
          logger.warn('perceptionDispatcher: replay matcher error', { domain: matcher.domain, error: err.message })
        }
      }
    }

    const lastTs = rows[rows.length - 1].observed_at
    await _writeCursor(new Date(lastTs))
  } catch (err) {
    logger.warn('perceptionDispatcher: restart-replay failed', { error: err.message })
  }
}

// Periodic cursor advance for live events (so cursor doesn't stall behind realtime)
async function _advanceCursorToNow() {
  await _writeCursor(new Date())
}

function start() {
  if (_started) return
  perceptionBus.subscribe(_onEvent)
  _started = true
  // 1. Subscribe to live events first (no missed-window during replay)
  // 2. Replay anything since cursor (deduped against live via replay: prefix)
  _replayFromCursor().catch(() => {})
  // 3. Advance cursor every 60s so steady-state cursor tracks realtime
  setInterval(() => { _advanceCursorToNow().catch(() => {}) }, 60_000).unref?.()
  logger.info('perceptionDispatcher: started (with restart-replay)')
}
```

## Idempotency
Same constraints as Fix 10:
- `status_board_p1`: dedupe by `name`. Safe.
- `republish`: creates duplicate downstream `os_observations` rows. Acceptable for now.

## Trade-offs
- Boot is slightly slower (5000-row SELECT + per-row matcher dispatch). Cap at 2h replay limits this.
- After a long down window (>2h), events between 2h+ and now are NOT replayed — acceptable; "best-effort recovery within bounded window" is the contract.
- kv_store row is the single point of failure for the cursor — but if it's corrupt, fallback to 2h cap is safe.

## Combined with Fix 11 (heartbeat)
After restart-replay finishes, listenerHeartbeat fires for every replayed event that hits a handler, so the heartbeat status_board rows refresh quickly post-restart.

## Verification
1. Pre-restart: `SELECT max(observed_at) FROM os_observations` — note the max ts.
2. PM2 restart.
3. Post-restart boot log: `replaying events since cursor since=<previous max ts> count=<N>`.
4. New status_board rows for any error_escalation / security_incident hits during down window appear.
5. Subsequent restart with no events in window: log says `no events to replay since cursor`.

---

**End of design-fix drafts series (12 files).**
