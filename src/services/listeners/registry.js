'use strict'

/**
 * Listener registry - loads, validates, and dispatches to in-process event listeners.
 *
 * Listeners are JS modules in src/services/listeners/ matching the explicit
 * allow-list LISTENER_FILES below. Each module must export:
 *   { name, subscribesTo, relevanceFilter, handle, ownsWriteSurface }
 *
 * Dispatch guarantees:
 * - relevanceFilter called synchronously; false = skip handle
 * - per-listener concurrency cap of 1: new events dropped (not queued) if handler is in-flight
 * - handler throws are caught and logged at warn; never propagate
 * - listeners that import osSessionService are rejected at load time
 *
 * Boot observability (load-loop fix 2026-04-30):
 *   The previous implementation used fs.readdirSync() and logger.info/.warn
 *   inside the load loop. Production observed only 2/7 listeners loading
 *   under PM2 with NO error logs - 60+ hours of silent half-loaded boots.
 *   Fix:
 *     (a) Replace fs.readdirSync with an explicit allow-list (LISTENER_FILES).
 *         Rules out filesystem-iteration corner cases.
 *     (b) Bracket every load-loop outcome with a synchronous process.stderr.write
 *         call. PM2 captures stderr to ecodia-api-err.log, bypassing any
 *         winston transport buffering / async-flush race.
 *     (c) Boot-time assertion: if loaded count != EXPECTED_LOADED_COUNT,
 *         emit an unmissable stderr line + logger.error with the loaded /
 *         skipped lists. Server stays up (no throw).
 *   See drafts/listener-pipeline-audit-2026-04-29.md for the full analysis.
 */

const path = require('path')
const fs = require('fs')
const logger = require('../../config/logger')

// Explicit allow-list of files in src/services/listeners/ that the registry
// will attempt to load. Adding a new listener requires editing this array.
// dbBridge.js is intentionally included even though it is not a listener
// (no name/subscribesTo/handle/relevanceFilter); the loader gives it a
// structural-validation skip with a 'missing required fields' warn. This
// preserves the prior contract and the boot log line ordering.
const LISTENER_FILES = [
  '_smoke.js',
  'ccSessionsFailure.js',
  'conductorStreamTagWatcher.js',
  'dbBridge.js',
  'dispatchQueueListener.js',
  'emailArrival.js',
  'factorySessionComplete.js',
  'forkComplete.js',
  'invoicePaymentState.js',
  'statusBoardDrift.js',
  'statusBoardHygieneHaikuListener.js',
]

// Number of files expected to pass full validation and end up in _listeners.
// LISTENER_FILES.length minus dbBridge.js (which is intentionally skipped).
const EXPECTED_LOADED_COUNT = LISTENER_FILES.length - 1

let _listeners = []
const _inFlight = new Map()    // listener name -> boolean (currently processing)
const _pending = new Map()     // listener name -> [{event, ctx}, ...] (queued, FIFO)
const _drops = new Map()       // listener name -> drop count (counter for /api/ops/listener-stats)
// Per-listener queue cap. Empirically 5-event fork-burst observed in the
// wild; 10 = 2× headroom. Bigger = more memory, smaller = more drops on burst.
// Memory cost: 8 listeners × 10 events × ~1KB envelope ≈ 80KB worst case.
const QUEUE_LIMIT = 10

// Synchronous stderr write - bypasses winston async-buffer log loss observed
// during boot. PM2 captures stderr to ecodia-api-err.log directly, so these
// lines survive regardless of winston transport state. Used only for boot-time
// observability of the listener load loop.
function _bootStderr(line) {
  try { process.stderr.write(`[listener-registry] ${line}\n`) } catch {}
}

function loadListeners() {
  const dir = __dirname
  _bootStderr(`load: starting - ${LISTENER_FILES.length} files in allow-list`)

  const loaded = []
  const skipped = []

  for (const file of LISTENER_FILES) {
    const filePath = path.join(dir, file)
    try {
      // Boot-time validation: reject modules that import osSessionService
      const content = fs.readFileSync(filePath, 'utf-8')
      if (/require\s*\(\s*['"][^'"]*osSessionService['"]/.test(content)) {
        _bootStderr(`load: rejected ${file} (imports osSessionService)`)
        logger.warn(`listener: rejected ${file} - imports osSessionService (forbidden)`)
        skipped.push({ file, reason: 'imports osSessionService' })
        continue
      }

      const mod = require(filePath)
      if (!mod || typeof mod !== 'object') {
        _bootStderr(`load: skipped ${file} (no object export)`)
        logger.warn(`listener: skipped ${file} - module did not export an object`)
        skipped.push({ file, reason: 'no object export' })
        continue
      }

      const missing = []
      if (!mod.name) missing.push('name')
      if (!Array.isArray(mod.subscribesTo)) missing.push('subscribesTo')
      if (typeof mod.handle !== 'function') missing.push('handle')
      if (typeof mod.relevanceFilter !== 'function') missing.push('relevanceFilter')

      if (missing.length > 0) {
        _bootStderr(`load: skipped ${file} (missing: ${missing.join(',')})`)
        logger.warn(`listener: skipped ${file} - missing required fields: ${missing.join(', ')}`)
        skipped.push({ file, reason: `missing: ${missing.join(',')}` })
        continue
      }

      loaded.push(mod)
      _bootStderr(`load: loaded ${mod.name} (${file})`)
      logger.info(`listener: loaded ${mod.name} (subscribesTo: ${mod.subscribesTo.join(', ')})`)
    } catch (err) {
      _bootStderr(`load: FAILED ${file} - ${err.message}`)
      logger.warn(`listener: failed to load ${file}`, { error: err.message })
      skipped.push({ file, reason: `error: ${err.message}` })
    }
  }

  _listeners = loaded
  _bootStderr(`load: complete - loaded=${loaded.length} (expected=${EXPECTED_LOADED_COUNT}) skipped=${skipped.length}`)

  // Boot-time assertion: surface load-loop regressions immediately. Server
  // stays up (no throw) but the stderr write is unmissable in
  // ecodia-api-err.log and logger.error escalates to DBErrorTransport.
  if (loaded.length !== EXPECTED_LOADED_COUNT) {
    const loadedNames = loaded.map(l => l.name).sort().join(',')
    _bootStderr(`load: ASSERTION FAILED - expected ${EXPECTED_LOADED_COUNT} listeners, loaded ${loaded.length}: [${loadedNames}]`)
    logger.error('listener subsystem: loaded count mismatch (load-loop regression)', {
      expected: EXPECTED_LOADED_COUNT,
      actual: loaded.length,
      loaded: loadedNames,
      skipped: skipped.map(s => `${s.file}:${s.reason}`).join('; '),
    })
  }

  return loaded
}

/**
 * Dispatch an event to a set of listeners (all loaded listeners by default).
 * Accepts an optional second argument for test injection.
 */
async function dispatch(event, _testListeners) {
  const targets = _testListeners || _listeners

  for (const listener of targets) {
    const types = Array.isArray(listener.subscribesTo) ? listener.subscribesTo : [listener.subscribesTo]
    // Match the semantic inner type first (e.g. 'text_delta' inside an 'os-session:output'
    // envelope), fall back to the outer envelope type for channels that don't wrap a data.type.
    const innerType = event && event.data && event.data.type
    const matched = (innerType && types.includes(innerType)) || types.includes(event.type)
    if (!matched) continue

    // Relevance filter - synchronous
    let relevant = false
    try {
      relevant = listener.relevanceFilter(event)
    } catch (err) {
      logger.warn(`listener ${listener.name}: relevanceFilter threw`, { error: err.message })
      continue
    }
    if (!relevant) continue

    // Concurrency cap with bounded queue: handler-in-flight events queue
    // (FIFO, capped at QUEUE_LIMIT). Drops counted in _drops, surfaced via
    // /api/ops/listener-stats (B3). Per drafts/proposed-design-fixes/03-bounded-queue-not-drop.md.
    const sourceEventId = event.ws_seq != null
      ? String(event.ws_seq)
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const ctx = { sourceEventId }

    if (_inFlight.get(listener.name)) {
      const q = _pending.get(listener.name) || []
      if (q.length >= QUEUE_LIMIT) {
        _drops.set(listener.name, (_drops.get(listener.name) || 0) + 1)
        logger.warn(`listener ${listener.name}: queue full, dropping event`, {
          type: event.type, queueLen: q.length, totalDrops: _drops.get(listener.name),
        })
        continue
      }
      q.push({ event, ctx })
      _pending.set(listener.name, q)
      continue
    }

    _inFlight.set(listener.name, true)
    try {
      await listener.handle(event, ctx)
      // Drain queue: one event at a time, preserves FIFO order. Drains
      // until empty or until a queued handler throws (logged, then continues).
      while (true) {
        const q = _pending.get(listener.name)
        if (!q || q.length === 0) break
        const { event: nextEvent, ctx: nextCtx } = q.shift()
        try {
          await listener.handle(nextEvent, nextCtx)
        } catch (err) {
          logger.warn(`listener ${listener.name}: queued handler threw`, { error: err.message })
        }
      }
    } catch (err) {
      logger.warn(`listener ${listener.name}: handler threw`, { error: err.message })
    } finally {
      _inFlight.delete(listener.name)
      // Clean up empty queue maps so /api/ops/listener-stats reports
      // queue_depth=0 cleanly without stale entries.
      const q = _pending.get(listener.name)
      if (q && q.length === 0) _pending.delete(listener.name)
    }
  }
}

/**
 * Register all loaded listeners with the wsManager's in-process subscribe().
 * Accepts an optional wsManager override for tests.
 *
 * NOTE: wsManager fan-out emits on channel keys (currently only 'os-session:output'),
 * NOT on envelope.type. Listeners declare subscribesTo in envelope-type terms
 * (e.g. 'text_delta'); dispatch() does the envelope.type filter. If more fan-out
 * channels are added later, extend WS_CHANNELS + route per-listener.
 */
const WS_CHANNELS = ['os-session:output']

function registerAll(_wsManager) {
  const wsMgr = _wsManager || require('../../websocket/wsManager')

  let registered = 0
  for (const listener of _listeners) {
    // Subscribe each listener directly to its declared event types
    const l = listener
    wsMgr.subscribe(l.subscribesTo, async (event) => {
      await dispatch(event, [l])
    })
    registered++
  }

  _bootStderr(`registerAll: registered ${registered} listeners on channels [${WS_CHANNELS.join(',')}]`)
  logger.info(`listener subsystem: registered ${registered} listeners on channels [${WS_CHANNELS.join(', ')}]`)
  return registered
}

function getListeners() {
  return _listeners
}

module.exports = {
  loadListeners,
  registerAll,
  dispatch,
  getListeners,
  // Telemetry exports for /api/ops/listener-stats (B3)
  _drops,
  _pending,
  _inFlight,
  QUEUE_LIMIT,
  // Exported for test access and for the boot-time assertion in index.js
  EXPECTED_LOADED_COUNT,
  LISTENER_FILES,
}
