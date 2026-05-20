'use strict'

/**
 * nativeInboundQueue.js (2026-05-20)
 *
 * Per-thread single-flight serializer for native-channel inbound conductor turns.
 *
 * Why this exists: native /inbound responds 200 immediately and routes the
 * conductor turn in the background. When Tate fires two messages within one
 * turn's duration (triage can take 5-16s), two processEnvelope runs execute
 * concurrently on the SAME thread. They each read the thread mirror BEFORE the
 * other has written its reply, so both reply to a stale view -> doubled and
 * contradictory replies (the "headless chicken" Tate flagged 2026-05-20).
 *
 * Fix: serialize per thread_id. Each inbound turn waits for the previous turn on
 * the same thread to fully settle (reply sent + episode written) before it
 * starts. By the time turn N+1 runs, the mirror already reflects turn N's reply,
 * so Sonnet sees the full context and answers coherently instead of racing.
 *
 * Native is single-user today (thread_id is always 'tate'), but we key by
 * thread_id so the primitive still holds if per-contact native threads ever
 * land. Cross-channel serialization is intentionally NOT done here - SMS and
 * Telegram have their own arrival cadence and a shared lock would head-of-line
 * block one channel behind another.
 *
 * Per backend/patterns/native-inbound-must-serialize-per-thread-2026-05-20.md.
 */

const logger = require('../config/logger')

// thread_id -> Promise (tail of the serial chain for that thread)
const _chains = new Map()
// thread_id -> number of turns currently queued (incl. the running one) - observability
const _depth = new Map()

function queueDepth(threadId) {
  return _depth.get(threadId || 'default') || 0
}

/**
 * Run taskFn serially with respect to other tasks on the same threadId.
 * Returns a promise that resolves/rejects with taskFn's outcome. A failing
 * task does NOT poison the chain - the next task still runs.
 *
 * @param {string}   threadId
 * @param {Function} taskFn   async () => result
 */
function runSerial(threadId, taskFn) {
  const key = threadId || 'default'
  _depth.set(key, (_depth.get(key) || 0) + 1)

  const depthNow = _depth.get(key)
  if (depthNow > 1) {
    logger.info('nativeInboundQueue: turn queued behind in-flight turn', { thread_id: key, queue_depth: depthNow })
  }

  const prev = _chains.get(key) || Promise.resolve()
  // .catch swallow so a rejected predecessor doesn't break the successor.
  const next = prev.catch(() => {}).then(async () => {
    try {
      return await taskFn()
    } finally {
      _depth.set(key, Math.max(0, (_depth.get(key) || 1) - 1))
    }
  })

  _chains.set(key, next)

  // Drop the map entry once this chain fully drains so threads don't leak.
  next.then(
    () => { if (_chains.get(key) === next) { _chains.delete(key); _depth.delete(key) } },
    () => { if (_chains.get(key) === next) { _chains.delete(key); _depth.delete(key) } },
  )

  return next
}

module.exports = { runSerial, queueDepth }
