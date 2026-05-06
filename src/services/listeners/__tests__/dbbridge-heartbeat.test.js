'use strict'

/**
 * dbBridge heartbeat tests - W3 audit fix #5, fork_mosn8o5x_7a0e54 worker C2.
 *
 * Three tests:
 *   1. heartbeat self-events filtered (not forwarded to subscribers)
 *   2. dead-subscription detection trips reconnect + perception event
 *   3. _startHeartbeat is idempotent (no double-stacked timers)
 *
 * Strategy: poke the module's __test surface rather than standing up a real
 * Postgres LISTEN connection. The test surface exposes the internal handlers
 * (_onNotification, _runWatchdog, _startHeartbeat, _stopHeartbeat) plus the
 * heartbeat-echo state, so we can simulate "echo arrived" / "echo stale"
 * deterministically.
 */

// Mock the wsManager and perceptionBus BEFORE require()-ing dbBridge so the
// lazy require() inside dbBridge picks up the mocks.
jest.mock('../../../websocket/wsManager', () => ({
  broadcast: jest.fn(),
}))

jest.mock('../../perceptionBus', () => ({
  publish: jest.fn().mockResolvedValue(undefined),
}))

// db is required transitively by perceptionBus' real impl (which we mocked
// above), but config/logger is required directly by dbBridge - keep it real,
// it's just a winston wrapper and won't blow up.

const dbBridge = require('../dbBridge')
const wsManager = require('../../../websocket/wsManager')
const perceptionBus = require('../../perceptionBus')

afterEach(async () => {
  // Clean up timers between tests so a leaked interval can't bleed across.
  // Set stopped=true first so any pending reconnect / heartbeat callbacks
  // exit early before scheduling more work.
  dbBridge.__test.setStopped(true)
  dbBridge.__test.stopHeartbeat()
  // Drain any reconnect timer scheduled by _forceReconnect (test 2 trips it).
  await dbBridge.stop()
  dbBridge.__test.setStopped(false)
  jest.clearAllMocks()
})

afterAll(async () => {
  // Final defence - ensure no setTimeout is still pending in the event loop.
  dbBridge.__test.setStopped(true)
  dbBridge.__test.stopHeartbeat()
  await dbBridge.stop()
})

describe('dbBridge heartbeat', () => {
  describe('test 1: heartbeat self-events are filtered', () => {
    test('heartbeat-self event updates lastHeartbeatEcho but does NOT fan-out to wsManager.broadcast', () => {
      // Reset state
      dbBridge.__test.setLastHeartbeatEcho(0)
      wsManager.broadcast.mockClear()

      const heartbeatPayload = JSON.stringify({
        heartbeat: true,
        source: 'dbbridge_self',
        ts: Date.now(),
      })

      dbBridge.__test.onNotification(heartbeatPayload)

      // Must NOT have broadcast to subscribers
      expect(wsManager.broadcast).not.toHaveBeenCalled()
      // Must have updated _lastHeartbeatEcho (non-zero, recent)
      const echo = dbBridge.__test.getLastHeartbeatEcho()
      expect(echo).toBeGreaterThan(0)
      expect(Date.now() - echo).toBeLessThan(1000)
    })

    test('non-heartbeat event IS forwarded to wsManager.broadcast', () => {
      wsManager.broadcast.mockClear()

      const realEvent = JSON.stringify({
        table: 'os_forks',
        action: 'UPDATE',
        row: { id: 'fork_x', status: 'done' },
        ts: Date.now(),
      })

      dbBridge.__test.onNotification(realEvent)

      expect(wsManager.broadcast).toHaveBeenCalledTimes(1)
      const [type, payload] = wsManager.broadcast.mock.calls[0]
      expect(type).toBe('db:event')
      expect(payload.data.table).toBe('os_forks')
    })

    test('heartbeat-shaped event from a DIFFERENT source is NOT filtered (only dbbridge_self is swallowed)', () => {
      // Defensive: future code might emit heartbeat:true from somewhere else;
      // we should only swallow our own self-emitted ones.
      wsManager.broadcast.mockClear()

      const otherHeartbeat = JSON.stringify({
        heartbeat: true,
        source: 'something_else',
        ts: Date.now(),
        table: 'foo',
      })

      dbBridge.__test.onNotification(otherHeartbeat)

      // Should have been forwarded (table: foo broadcast)
      expect(wsManager.broadcast).toHaveBeenCalledTimes(1)
    })
  })

  describe('test 2: dead-subscription detection', () => {
    test('stale heartbeat trips perceptionBus.publish with kind=dbbridge_subscription_dead', () => {
      perceptionBus.publish.mockClear()

      // Simulate: last echo was 91 seconds ago (>HEARTBEAT_STALE_MS=90s)
      const staleTs = Date.now() - 91_000
      dbBridge.__test.setLastHeartbeatEcho(staleTs)

      // Run the watchdog directly - synchronous decision, async forceReconnect
      dbBridge.__test.runWatchdog()

      expect(perceptionBus.publish).toHaveBeenCalledTimes(1)
      const call = perceptionBus.publish.mock.calls[0][0]
      expect(call.source).toBe('infra')
      expect(call.kind).toBe('dbbridge_subscription_dead')
      expect(call.data.last_seen_ms).toBe(staleTs)
      expect(call.data.dead_for_s).toBeGreaterThanOrEqual(90)
      expect(call.confidence).toBe(1)
    })

    test('fresh heartbeat does NOT trip the watchdog', () => {
      perceptionBus.publish.mockClear()

      // Last echo 5 seconds ago - well under stale threshold
      dbBridge.__test.setLastHeartbeatEcho(Date.now() - 5_000)

      dbBridge.__test.runWatchdog()

      expect(perceptionBus.publish).not.toHaveBeenCalled()
    })

    test('zero heartbeat (pre-first-connect) does NOT trip the watchdog', () => {
      perceptionBus.publish.mockClear()

      dbBridge.__test.setLastHeartbeatEcho(0)
      dbBridge.__test.runWatchdog()

      expect(perceptionBus.publish).not.toHaveBeenCalled()
    })

    test('after detection trips, lastHeartbeatEcho is reset to now (prevents repeated tripping during reconnect)', () => {
      perceptionBus.publish.mockClear()

      const staleTs = Date.now() - 95_000
      dbBridge.__test.setLastHeartbeatEcho(staleTs)

      dbBridge.__test.runWatchdog()

      const echoAfter = dbBridge.__test.getLastHeartbeatEcho()
      expect(echoAfter).toBeGreaterThan(staleTs)
      // Should be ~now, not the stale 95s-ago value
      expect(Date.now() - echoAfter).toBeLessThan(1000)
    })
  })

  describe('test 3: idempotent _startHeartbeat', () => {
    test('calling startHeartbeat twice does not stack two heartbeat intervals', () => {
      // Stop any pre-existing timers
      dbBridge.__test.stopHeartbeat()

      // First start
      dbBridge.__test.startHeartbeat()
      const firstTimers = dbBridge.__test.getTimers()
      expect(firstTimers.heartbeatTimer).not.toBeNull()
      expect(firstTimers.watchdogTimer).not.toBeNull()

      const firstHbRef = firstTimers.heartbeatTimer
      const firstWdRef = firstTimers.watchdogTimer

      // Second start - must REPLACE, not stack
      dbBridge.__test.startHeartbeat()
      const secondTimers = dbBridge.__test.getTimers()

      // Both timers exist
      expect(secondTimers.heartbeatTimer).not.toBeNull()
      expect(secondTimers.watchdogTimer).not.toBeNull()
      // But the originals were cleared (different reference)
      expect(secondTimers.heartbeatTimer).not.toBe(firstHbRef)
      expect(secondTimers.watchdogTimer).not.toBe(firstWdRef)

      // Cleanup
      dbBridge.__test.stopHeartbeat()
      const afterStop = dbBridge.__test.getTimers()
      expect(afterStop.heartbeatTimer).toBeNull()
      expect(afterStop.watchdogTimer).toBeNull()
    })

    test('stopHeartbeat is safe to call when no timers are running', () => {
      // First ensure clean state
      dbBridge.__test.stopHeartbeat()
      // Call again - must not throw
      expect(() => dbBridge.__test.stopHeartbeat()).not.toThrow()
    })
  })

  describe('module load smoke', () => {
    test('dbBridge module exports start/stop/_heartbeatStatus', () => {
      expect(typeof dbBridge.start).toBe('function')
      expect(typeof dbBridge.stop).toBe('function')
      expect(typeof dbBridge._heartbeatStatus).toBe('function')
    })

    test('_heartbeatStatus returns expected shape', () => {
      const status = dbBridge._heartbeatStatus()
      expect(status).toHaveProperty('last_echo_ms_ago')
      expect(status).toHaveProperty('healthy')
      expect(status).toHaveProperty('interval_ms')
      expect(status).toHaveProperty('stale_threshold_ms')
      expect(status.interval_ms).toBe(60_000)
      expect(status.stale_threshold_ms).toBe(90_000)
    })
  })
})
