'use strict'

/**
 * Unit tests for failureEscalateService - the single severity->surface routing
 * point (Layer 8 of the 24/7 autonomy architecture). Mocks the four downstream
 * surfaces (observerSignals / status_board via db / approvalQueue / sms) and
 * asserts each severity tier hits exactly the right surfaces per the doctrine
 * table.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

jest.mock('../../config/db', () => {
  globalThis.__escMock = { dedupeHit: false, statusBoardInserts: 0, dedupeStamps: 0 }
  const sql = (strings, ...vals) => {
    const s = globalThis.__escMock
    const text = strings.join('?').toLowerCase()
    if (text.includes('from kv_store') && text.includes("fired_at")) {
      return Promise.resolve(s.dedupeHit ? [{ 1: 1 }] : [])
    }
    if (text.includes('insert into kv_store')) {
      s.dedupeStamps += 1
      return Promise.resolve([])
    }
    if (text.includes('insert into status_board')) {
      s.statusBoardInserts += 1
      return Promise.resolve([{ id: 'sb-1' }])
    }
    return Promise.resolve([])
  }
  sql.json = (v) => v
  return sql
})

jest.mock('../observerSignalsService', () => {
  globalThis.__escObs = { calls: [] }
  return {
    writeSignal: (args) => { globalThis.__escObs.calls.push(args); return Promise.resolve({ id: 'obs-1' }) },
  }
}, { virtual: true })

jest.mock('../osAlertingService', () => {
  globalThis.__escSms = { calls: [] }
  return {
    sendSmsToTate: (body) => { globalThis.__escSms.calls.push(body); return Promise.resolve({ ok: true }) },
  }
}, { virtual: true })

jest.mock('../approvalQueueService', () => {
  globalThis.__escApproval = { calls: [] }
  return {
    enqueueFreeText: (args) => { globalThis.__escApproval.calls.push(args); return Promise.resolve({ ok: true, id: 'aq-1' }) },
  }
}, { virtual: true })

const escalate = require('../failureEscalateService')

function reset() {
  // The escalate service lazy-requires the surface modules inside fire(), so
  // their mock factories (which seed these globals) may not have run before the
  // first beforeEach. Init defensively.
  globalThis.__escMock = globalThis.__escMock || {}
  globalThis.__escObs = globalThis.__escObs || { calls: [] }
  globalThis.__escSms = globalThis.__escSms || { calls: [] }
  globalThis.__escApproval = globalThis.__escApproval || { calls: [] }
  globalThis.__escMock.dedupeHit = false
  globalThis.__escMock.statusBoardInserts = 0
  globalThis.__escMock.dedupeStamps = 0
  globalThis.__escObs.calls = []
  globalThis.__escSms.calls = []
  globalThis.__escApproval.calls = []
}

describe('failureEscalateService.fire', () => {
  beforeEach(reset)

  test('rejects invalid severity', async () => {
    await expect(escalate.fire({ severity: 'nope', kind: 'k', message: 'm' })).rejects.toThrow(/invalid severity/)
  })

  test('requires kind + message', async () => {
    await expect(escalate.fire({ severity: 'routine_info', kind: '', message: '' })).rejects.toThrow(/kind \+ message/)
  })

  test('routine_info -> observer only (no sms, no status_board)', async () => {
    await escalate.fire({ severity: 'routine_info', kind: 'k', message: 'm' })
    expect(globalThis.__escObs.calls.length).toBe(1)
    expect(globalThis.__escSms.calls.length).toBe(0)
    expect(globalThis.__escMock.statusBoardInserts).toBe(0)
  })

  test('action_recommended -> observer + status_board (no sms)', async () => {
    await escalate.fire({ severity: 'action_recommended', kind: 'k', message: 'm' })
    expect(globalThis.__escObs.calls.length).toBe(1)
    expect(globalThis.__escMock.statusBoardInserts).toBe(1)
    expect(globalThis.__escSms.calls.length).toBe(0)
  })

  test('tate_judgement -> approval_queue + observer (no sms)', async () => {
    await escalate.fire({ severity: 'tate_judgement', kind: 'k', message: 'm' })
    expect(globalThis.__escApproval.calls.length).toBe(1)
    expect(globalThis.__escObs.calls.length).toBe(1)
    expect(globalThis.__escSms.calls.length).toBe(0)
  })

  test('time_critical -> sms + observer + status_board', async () => {
    await escalate.fire({ severity: 'time_critical', kind: 'k', message: 'm' })
    expect(globalThis.__escSms.calls.length).toBe(1)
    expect(globalThis.__escObs.calls.length).toBe(1)
    expect(globalThis.__escMock.statusBoardInserts).toBe(1)
  })

  test('hard_tripwire -> sms + observer + status_board', async () => {
    await escalate.fire({ severity: 'hard_tripwire', kind: 'k', message: 'm' })
    expect(globalThis.__escSms.calls.length).toBe(1)
    expect(globalThis.__escMock.statusBoardInserts).toBe(1)
  })

  test('sms body carries severity + kind + message', async () => {
    await escalate.fire({ severity: 'time_critical', kind: 'agent_down', message: 'laptop unreachable' })
    const body = globalThis.__escSms.calls[0]
    expect(body).toMatch(/TIME_CRITICAL/)
    expect(body).toMatch(/agent_down/)
    expect(body).toMatch(/laptop unreachable/)
  })

  test('dedupe_key suppresses a repeat fire within window', async () => {
    globalThis.__escMock.dedupeHit = true
    const r = await escalate.fire({ severity: 'time_critical', kind: 'k', message: 'm', dedupe_key: 'dk1' })
    expect(r.deduped).toBe(true)
    expect(globalThis.__escSms.calls.length).toBe(0)
  })

  test('non-deduped fire stamps the dedupe key', async () => {
    await escalate.fire({ severity: 'routine_info', kind: 'k', message: 'm', dedupe_key: 'dk2' })
    expect(globalThis.__escMock.dedupeStamps).toBe(1)
  })

  test('SEVERITY_TO_PRIORITY maps tiers to 1-5', () => {
    expect(escalate.SEVERITY_TO_PRIORITY.time_critical).toBe(1)
    expect(escalate.SEVERITY_TO_PRIORITY.routine_info).toBe(5)
  })
})
