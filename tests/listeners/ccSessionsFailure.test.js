'use strict'

/**
 * ccSessionsFailure listener — Jest tests.
 *
 * Architectural rule under test (8 May 2026 refactor, fork_mowd86qm_e298bf):
 *   - relevanceFilter EXCLUDES cortex OS-session shells and rows missing
 *     codebase_id (these are not genuine Factory dispatches).
 *   - handle publishes to perceptionBus only. NEVER POSTs to
 *     /api/os-session/message. Conductor sees the failure via
 *     <perception_summary> context-stitching on the next natural turn.
 *
 * Mirrors the architectural rule applied to forkComplete on 5 May 2026:
 *   ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
 */

jest.mock('axios')
jest.mock('../../src/services/perceptionBus', () => ({
  publish: jest.fn().mockResolvedValue(undefined),
}))

const axios = require('axios')
const perceptionBus = require('../../src/services/perceptionBus')
const listener = require('../../src/services/listeners/ccSessionsFailure')

const REAL_FACTORY_ROW = {
  id: 'session-uuid-2',
  status: 'error',
  pipeline_stage: 'running',
  triggered_by: 'proactive',
  codebase_id: '00000000-0000-0000-0000-000000000abc',
  working_dir: '/home/tate/workspaces/ecodiaos/be',
}

const makeEvent = (rowOverrides = {}, dataOverrides = {}) => ({
  type: 'db:event',
  seq: 1,
  ts: new Date().toISOString(),
  data: {
    type: 'db:event',
    table: 'cc_sessions',
    action: 'UPDATE',
    row: { ...REAL_FACTORY_ROW, ...rowOverrides },
    ts: Date.now() / 1000,
    ...dataOverrides,
  },
})

describe('ccSessionsFailure', () => {
  afterAll(async () => {
    await new Promise(r => setImmediate(r))
    await new Promise(r => setImmediate(r))
  })

  beforeEach(() => {
    jest.clearAllMocks()
    axios.post.mockResolvedValue({ status: 200 })
  })

  // ---- relevanceFilter ----

  test('relevanceFilter: returns true for genuine Factory dispatch with status=error', () => {
    const event = makeEvent()
    expect(listener.relevanceFilter(event)).toBe(true)
  })

  test('relevanceFilter: returns true for pipeline_stage=failed on a genuine Factory dispatch', () => {
    const event = makeEvent({ status: 'running', pipeline_stage: 'failed' })
    expect(listener.relevanceFilter(event)).toBe(true)
  })

  test('relevanceFilter: returns true for pipeline_stage=error on a genuine Factory dispatch', () => {
    const event = makeEvent({ status: 'running', pipeline_stage: 'error' })
    expect(listener.relevanceFilter(event)).toBe(true)
  })

  test('relevanceFilter: returns false when status=complete + pipeline_stage=failed (factorySessionComplete owns this)', () => {
    const event = makeEvent({ status: 'complete', pipeline_stage: 'failed' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false when status=complete and stage is NOT failed/error', () => {
    const event = makeEvent({ status: 'complete', pipeline_stage: 'deployed' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false when status=complete and stage=awaiting_review', () => {
    const event = makeEvent({ status: 'complete', pipeline_stage: 'awaiting_review' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false for status=running (not a failure)', () => {
    const event = makeEvent({ status: 'running', pipeline_stage: 'running' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false for table=email_events', () => {
    const event = makeEvent({}, { table: 'email_events' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false for action=INSERT', () => {
    const event = makeEvent({}, { action: 'INSERT' })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false for non-db:event inner type', () => {
    const event = { type: 'text_delta', seq: 1, ts: new Date().toISOString(), data: { type: 'text_delta', content: 'hello' } }
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  // ---- new exclusion guards (8 May 2026) ----

  test('relevanceFilter: returns false for cortex OS-session shell (triggered_by=cortex)', () => {
    const event = makeEvent({
      triggered_by: 'cortex',
      codebase_id: null,
      working_dir: null,
      status: 'error',
      pipeline_stage: 'executing',
    })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false when codebase_id is NULL (no Factory deliverable)', () => {
    const event = makeEvent({
      triggered_by: 'proactive',
      codebase_id: null,
      working_dir: null,
      status: 'error',
      pipeline_stage: 'failed',
    })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  test('relevanceFilter: returns false when codebase_id is undefined', () => {
    const event = makeEvent({
      triggered_by: 'proactive',
      codebase_id: undefined,
      status: 'error',
    })
    expect(listener.relevanceFilter(event)).toBe(false)
  })

  // ---- handle ----

  test('handle: does NOT POST to /api/os-session/message (perception-only)', async () => {
    const event = makeEvent()
    const ctx = { sourceEventId: 'evt-fail-001' }
    await listener.handle(event, ctx)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('handle: publishes to perceptionBus with session_failure kind on a real Factory failure', async () => {
    const event = makeEvent({ error_message: 'API Error: 500' })
    const ctx = { sourceEventId: 'evt-fail-002' }
    await listener.handle(event, ctx)
    expect(perceptionBus.publish).toHaveBeenCalledTimes(1)
    const arg = perceptionBus.publish.mock.calls[0][0]
    expect(arg.source).toBe('factory')
    expect(arg.kind).toBe('session_failure')
    expect(arg.data.session_id).toBe('session-uuid-2')
    expect(arg.data.status).toBe('error')
    expect(arg.data.pipeline_stage).toBe('running')
    expect(arg.data.triggered_by).toBe('proactive')
    expect(arg.data.codebase_id).toBe('00000000-0000-0000-0000-000000000abc')
    expect(arg.data.error_message).toBe('API Error: 500')
    expect(arg.data.source_event_id).toBe('evt-fail-002')
  })

  test('handle: does NOT throw if perceptionBus.publish rejects', async () => {
    perceptionBus.publish.mockImplementationOnce(() => { throw new Error('bus down') })
    const event = makeEvent()
    const ctx = { sourceEventId: 'evt-fail-003' }
    let threw = false
    try {
      await listener.handle(event, ctx)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(axios.post).not.toHaveBeenCalled()
  })

  // ---- module shape ----

  test('exports required listener fields', () => {
    expect(listener.name).toBe('ccSessionsFailure')
    expect(Array.isArray(listener.subscribesTo)).toBe(true)
    expect(listener.subscribesTo).toContain('db:event')
    expect(typeof listener.relevanceFilter).toBe('function')
    expect(typeof listener.handle).toBe('function')
    expect(Array.isArray(listener.ownsWriteSurface)).toBe(true)
  })

  test('ownsWriteSurface is empty (perception-only, no os-session-message writes)', () => {
    expect(listener.ownsWriteSurface).toEqual([])
  })
})
