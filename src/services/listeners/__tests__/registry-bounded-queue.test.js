'use strict'

/**
 * Bounded-queue test for registry.dispatch.
 *
 * Wave B sub-task B2 (fork_mosmjqi4_20c41a). Per
 * drafts/proposed-design-fixes/03-bounded-queue-not-drop.md.
 *
 * Verifies the registry replaces concurrency=1 drop-on-inflight with a
 * per-listener FIFO bounded queue. Pre-fix: 5-event burst → only 1 handled,
 * 4 dropped. Post-fix: all 5 eventually handled, in FIFO order, no drops
 * until QUEUE_LIMIT exceeded.
 */

const registry = require('../registry')

// Test framework: prefer Jest if it exists in the repo. If not, fall back
// to a minimal assert-based runner so the file is still verifiable inline.
const hasJest = typeof describe === 'function' && typeof test === 'function'

function makeFakeListener(name, handlerDelayMs, calls) {
  return {
    name,
    subscribesTo: ['fake_event'],
    relevanceFilter: () => true,
    async handle(event, ctx) {
      calls.push({ at: Date.now(), event, ctx })
      await new Promise(r => setTimeout(r, handlerDelayMs))
    },
  }
}

async function runBurstAndAssert() {
  const calls = []
  const listener = makeFakeListener('boundedQueueTest', 100, calls)

  // Reset registry state for the fake listener so a previous run doesn't
  // leak in-flight=true and skew the test.
  if (registry._inFlight && typeof registry._inFlight.delete === 'function') {
    registry._inFlight.delete(listener.name)
  }
  if (registry._pending && typeof registry._pending.delete === 'function') {
    registry._pending.delete(listener.name)
  }
  if (registry._drops && typeof registry._drops.delete === 'function') {
    registry._drops.delete(listener.name)
  }

  // Fire 5 events in <10ms. Pre-fix: 4 dropped. Post-fix: all 5 handled.
  const start = Date.now()
  const dispatches = []
  for (let i = 0; i < 5; i++) {
    dispatches.push(registry.dispatch({ type: 'fake_event', seq: i }, [listener]))
  }
  await Promise.all(dispatches)

  // Wait for queue to fully drain
  while (true) {
    const q = registry._pending.get(listener.name)
    const inflight = registry._inFlight.get(listener.name)
    if ((!q || q.length === 0) && !inflight) break
    await new Promise(r => setTimeout(r, 25))
  }

  const elapsed = Date.now() - start

  // Assertions:
  // 1. All 5 events handled
  if (calls.length !== 5) {
    throw new Error(`expected 5 handled events, got ${calls.length}`)
  }
  // 2. FIFO order preserved (seq values 0..4)
  for (let i = 0; i < 5; i++) {
    if (calls[i].event.seq !== i) {
      throw new Error(`FIFO order broken at index ${i}: got seq=${calls[i].event.seq}`)
    }
  }
  // 3. No drops (5 <= QUEUE_LIMIT)
  const drops = registry._drops.get(listener.name) || 0
  if (drops !== 0) {
    throw new Error(`expected 0 drops at burst=5, got ${drops}`)
  }
  // 4. Queue cleaned up
  const finalQ = registry._pending.get(listener.name)
  if (finalQ && finalQ.length > 0) {
    throw new Error(`expected empty queue after drain, got ${finalQ.length}`)
  }

  return { ok: true, elapsed, calls: calls.length, drops }
}

async function runOverflowAndAssert() {
  // QUEUE_LIMIT default 10. Burst of 15: 1 in-flight + 10 queued + 4 dropped.
  const calls = []
  const listener = makeFakeListener('overflowTest', 100, calls)

  if (registry._inFlight && typeof registry._inFlight.delete === 'function') {
    registry._inFlight.delete(listener.name)
  }
  if (registry._pending && typeof registry._pending.delete === 'function') {
    registry._pending.delete(listener.name)
  }
  if (registry._drops && typeof registry._drops.delete === 'function') {
    registry._drops.delete(listener.name)
  }

  const dispatches = []
  for (let i = 0; i < 15; i++) {
    dispatches.push(registry.dispatch({ type: 'fake_event', seq: i }, [listener]))
  }
  await Promise.all(dispatches)

  // Wait for queue to fully drain
  while (true) {
    const q = registry._pending.get(listener.name)
    const inflight = registry._inFlight.get(listener.name)
    if ((!q || q.length === 0) && !inflight) break
    await new Promise(r => setTimeout(r, 25))
  }

  // Assertions:
  // 1. 11 events handled (1 in-flight + 10 queued)
  if (calls.length !== 11) {
    throw new Error(`expected 11 handled events at burst=15 (limit=10), got ${calls.length}`)
  }
  // 2. 4 drops counted
  const drops = registry._drops.get(listener.name) || 0
  if (drops !== 4) {
    throw new Error(`expected 4 drops at burst=15 (limit=10), got ${drops}`)
  }

  return { ok: true, calls: calls.length, drops }
}

if (hasJest) {
  describe('registry bounded queue', () => {
    test('5-event burst: all handled, FIFO, no drops', async () => {
      const r = await runBurstAndAssert()
      expect(r.ok).toBe(true)
      expect(r.calls).toBe(5)
      expect(r.drops).toBe(0)
    }, 5000)

    test('15-event burst (limit=10): 11 handled, 4 dropped', async () => {
      const r = await runOverflowAndAssert()
      expect(r.ok).toBe(true)
      expect(r.calls).toBe(11)
      expect(r.drops).toBe(4)
    }, 5000)
  })
} else if (require.main === module) {
  // Standalone runner - `node src/services/listeners/__tests__/registry-bounded-queue.test.js`
  ;(async () => {
    try {
      const r1 = await runBurstAndAssert()
      console.log('PASS: 5-event burst', r1)
      const r2 = await runOverflowAndAssert()
      console.log('PASS: 15-event overflow', r2)
      console.log('\nALL_PASS')
      process.exit(0)
    } catch (err) {
      console.error('FAIL:', err.message)
      process.exit(1)
    }
  })()
}

module.exports = { runBurstAndAssert, runOverflowAndAssert }
