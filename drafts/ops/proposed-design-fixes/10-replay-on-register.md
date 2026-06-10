# Fix 10 — Replay buffer for matcher register-time

**Origin:** fork_moslimsp_a72e73 listener audit, design Q3
**Leverage:** MEDIUM
**Depends on:** Fix 08 (matcher table) for the column, but standalone via env-var override.

## Problem
A new matcher only sees events from its registration moment forward. If the matcher logic should have caught the last 24h of events, those are silent. We DO have a durable journal (`os_observations`, 7d retention) — we're just not consuming it on register.

## Patch (standalone, env-var path)

Add to perceptionDispatcher.js `start()`:

```javascript
async function _replayOnRegister() {
  for (const matcher of MATCHERS) {
    const replaySecs = matcher.replayFromSecsAgo
      ?? (parseInt(process.env[`PERCEPTION_REPLAY_${matcher.domain.toUpperCase()}`], 10) || 0)
    if (!replaySecs || replaySecs <= 0) continue

    try {
      const cutoff = new Date(Date.now() - replaySecs * 1000)
      const rows = await db`
        SELECT id, source, kind, data, confidence, observed_at
        FROM os_observations
        WHERE observed_at > ${cutoff}
        ORDER BY observed_at ASC
      `
      logger.info(`perceptionDispatcher: replaying for ${matcher.domain}`, {
        events: rows.length, since: cutoff,
      })
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

        // Run only this matcher (not all of MATCHERS)
        try {
          if (!matcher.test(event)) continue
          // Use a "replay:" dedupe-key prefix so live events still dispatch
          const dedupeKey = `replay:${matcher.domain}:${event.source}:${event.kind}`
          if (!_shouldDispatch(dedupeKey)) continue
          await matcher.dispatch(event).catch(err => {
            logger.warn('perceptionDispatcher: replay dispatch error', {
              domain: matcher.domain, error: err.message,
            })
          })
        } catch (err) {
          logger.warn('perceptionDispatcher: replay matcher error', {
            domain: matcher.domain, error: err.message,
          })
        }
      }
    } catch (err) {
      logger.warn('perceptionDispatcher: replay failed', {
        domain: matcher.domain, error: err.message,
      })
    }
  }
}

function start() {
  if (_started) return
  perceptionBus.subscribe(_onEvent)
  _started = true
  // Replay AFTER subscribing — guarantees no event is missed during replay.
  _replayOnRegister().catch(err => logger.warn('replay-on-register failed', { error: err.message }))
  logger.info('perceptionDispatcher: started')
}
```

## Idempotency requirements
Replay only safe if dispatch side-effects are idempotent:
- `status_board_p1` action: dedupe by `name` (already done in error_escalation + security_incident matchers). ✅
- `republish` action: idempotent at consumer level (perceptionBus INSERT happens but downstream subscribers re-dedupe). 🟡 acceptable for OS but generates duplicate `os_observations` rows.
- `crm_context_surfaced`: idempotent (informational). ✅

For non-idempotent actions, replay must be opt-out per matcher.

## Operating procedure
1. Author new matcher with `replayFromSecsAgo: 86400` (24h replay).
2. PM2 restart triggers boot replay.
3. Boot logs show `events: <N>` for the matcher.
4. Verify: matcher's expected status_board rows / KG nodes appear.

## With Fix 08 (matcher table)
The `replay_from_secs_ago` column is read at matcher-load time. Adding a row + reload triggers replay on next dispatcher start (or SIGHUP). Without PM2 restart.

## Verification
- Set `PERCEPTION_REPLAY_FINANCE=3600` in `.env`. PM2 restart.
- Boot log: `replaying for finance, events: <N>`.
- Confirm any new finance-context status_board rows from replayed events appear.
- Without replay env-var (default behavior), matchers still only consume live events.
