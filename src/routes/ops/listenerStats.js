'use strict'

/**
 * GET /api/ops/listener-stats
 *
 * Per W3 listener audit (drafts/proposed-design-fixes/04-listener-stats-endpoint.md).
 * fork_mosmjqi4_20c41a — Wave B sub-task B3.
 *
 * Surfaces per-matcher fire counts, dedupe-suppression counts, per-listener
 * drop counts, queue depth, bus-level event volume, and a "wired but dark"
 * indicator (listeners with 0 events in 24h flagged for the conductor).
 *
 * Defensive against B2 not yet shipped: if registry._drops / _pending /
 * _inFlight are not exported, the panel renders empty maps rather than
 * crashing. Same with dispatcher._stats — if Wave B B3 ships before B1's
 * matcher integration loads, the in-memory counters are simply zero.
 *
 * Persistent counts come from os_observations (durable, queryable for 1h /
 * 24h windows). In-memory counters are since-process-boot snapshots.
 *
 * Conductor reads this in BP4 / drift detection. Hits a "wired but dark"
 * listener (loaded, has subscribers, but 0 events in 24h) → investigate
 * publisher gap before declaring the surface healthy.
 */

const { Router } = require('express')
const router = Router()

const logger = require('../../config/logger')
const db = require('../../config/db')
const dispatcher = require('../../services/perceptionDispatcher')
const registry = require('../../services/listeners/registry')

function mapToObj(m) {
  const o = {}
  if (!m || typeof m.entries !== 'function') return o
  for (const [k, v] of m) o[k] = typeof v === 'number' ? v : (Array.isArray(v) ? v.length : v)
  return o
}

router.get('/', async (_req, res) => {
  const started = Date.now()
  try {
    // ── Dispatcher matcher stats (in-mem since boot) ────────────────────
    const stats = dispatcher._stats || {}
    const matcher = {
      bus_events_in: stats.bus_events_in || 0,
      fires: mapToObj(stats.matcher_fires),
      test_passes: mapToObj(stats.matcher_test_passes),
      dedupes: mapToObj(stats.matcher_dedupes),
      errors: mapToObj(stats.matcher_errors),
      registered_domains: Array.isArray(dispatcher.MATCHERS)
        ? dispatcher.MATCHERS.map(m => m.domain)
        : [],
    }

    // ── Registry listener stats (Fix 03 / B2 wiring; defensive) ─────────
    const listener = {
      drops: mapToObj(registry._drops),
      in_flight: mapToObj(registry._inFlight),
      queue_depth: {},
      loaded_count: 0,
      loaded_names: [],
    }
    if (registry._pending && typeof registry._pending.entries === 'function') {
      for (const [name, q] of registry._pending) {
        listener.queue_depth[name] = Array.isArray(q) ? q.length : 0
      }
    }
    if (typeof registry.getListeners === 'function') {
      const ls = registry.getListeners() || []
      listener.loaded_count = ls.length
      listener.loaded_names = ls.map(l => l.name).sort()
    }

    // ── Last-hour event volume (durable, from os_observations) ──────────
    let event_volume_1h = []
    try {
      const rows = await db`
        SELECT source, kind, count(*)::int AS n
        FROM os_observations
        WHERE observed_at > NOW() - INTERVAL '1 hour'
        GROUP BY 1, 2
        ORDER BY n DESC
        LIMIT 50
      `
      event_volume_1h = rows.map(r => ({ source: r.source, kind: r.kind, count: r.n }))
    } catch (err) {
      logger.debug('/api/ops/listener-stats: os_observations 1h aggregate unavailable', { error: err.message })
    }

    // ── 24h event volume per source (for "wired but dark" cross-check) ──
    let event_volume_24h_by_source = {}
    try {
      const rows = await db`
        SELECT source, count(*)::int AS n
        FROM os_observations
        WHERE observed_at > NOW() - INTERVAL '24 hours'
        GROUP BY 1
        ORDER BY n DESC
      `
      for (const r of rows) event_volume_24h_by_source[r.source] = r.n
    } catch (err) {
      logger.debug('/api/ops/listener-stats: os_observations 24h aggregate unavailable', { error: err.message })
    }

    // ── 24h fork-complete dispatch count (proxy for forkComplete listener) ─
    // listeners don't publish their own dispatch counts to the bus, so we
    // approximate "wired but dark" via known fork-complete event volume.
    let listener_24h_proxy = {}
    try {
      const rows = await db`
        SELECT kind, count(*)::int AS n
        FROM os_observations
        WHERE observed_at > NOW() - INTERVAL '24 hours'
          AND (
            source = 'fork'
            OR kind LIKE 'fork_%'
            OR kind LIKE 'cc_%'
            OR kind LIKE 'invoice_%'
            OR kind LIKE 'email_%'
            OR kind LIKE 'status_board%'
            OR kind LIKE 'dispatch_queue%'
          )
        GROUP BY 1
        ORDER BY n DESC
        LIMIT 50
      `
      for (const r of rows) listener_24h_proxy[r.kind] = r.n
    } catch (err) {
      logger.debug('/api/ops/listener-stats: listener-proxy 24h aggregate unavailable', { error: err.message })
    }

    // ── 'Wired but dark' summary ────────────────────────────────────────
    // For each loaded listener, check if its declared subscribesTo has any
    // matching event in the last 24h. If 0 → flag as 'dark'.
    const dark = []
    if (typeof registry.getListeners === 'function') {
      const ls = registry.getListeners() || []
      for (const l of ls) {
        const types = Array.isArray(l.subscribesTo) ? l.subscribesTo : [l.subscribesTo]
        let any = false
        for (const t of types) {
          if (listener_24h_proxy[t] && listener_24h_proxy[t] > 0) { any = true; break }
        }
        if (!any) dark.push({ name: l.name, subscribesTo: types })
      }
    }

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      query_duration_ms: Date.now() - started,
      matcher,
      listener,
      event_volume_1h,
      event_volume_24h_by_source,
      listener_24h_proxy,
      wired_but_dark: dark,
    })
  } catch (err) {
    logger.error('/api/ops/listener-stats: failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
