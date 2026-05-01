'use strict'

/**
 * Integration seam test: wsManager.broadcast() must redactDeep all
 * non-meta envelope fields before ws.send + ring-buffer storage.
 * Covers §5.1 wire-in at the WS emit point.
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))
jest.mock('../../config/env', () => ({}))
jest.mock('express-ws', () => () => ({}))

const wsManager = require('../wsManager')
const credentialFilter = require('../../lib/credentialFilter')

describe('wsManager.broadcast redacts credentials in envelope payload', () => {
  beforeEach(() => {
    credentialFilter.resetCounters()
    wsManager.resetSessionSeq()
  })

  test('broadcast() scrubs AWS key from data.content in ring buffer', () => {
    wsManager.broadcast('os-session:output', {
      sessionId: 'sess-a',
      data: { type: 'tool_result', content: 'found AKIAIOSFODNN7EXAMPLE in the logs' },
    })
    const events = wsManager.getEventsSince(0)
    expect(events.length).toBeGreaterThan(0)
    const serialised = JSON.stringify(events[events.length - 1])
    expect(serialised).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(serialised).toContain('[REDACTED:aws_access_key]')
  })

  test('envelope meta (seq, ts, epoch, type, sessionId) is untouched', () => {
    wsManager.broadcast('os-session:status', {
      sessionId: 'sess-b',
      status: 'running',
    })
    const events = wsManager.getEventsSince(0)
    const last = events[events.length - 1]
    expect(last.type).toBe('os-session:status')
    expect(last.sessionId).toBe('sess-b')
    expect(typeof last.seq).toBe('number')
    expect(typeof last.ts).toBe('string')
    expect(typeof last.epoch).toBe('string')
  })

  test('coalesced text_delta path also redacts', (done) => {
    wsManager.broadcast('os-session:output', {
      sessionId: 'sess-c',
      data: { type: 'text_delta', content: 'here is ghp_abcdefghijklmnopqrstuvwxyz0123456789AB' },
    })
    wsManager.broadcast('os-session:output', {
      sessionId: 'sess-c',
      data: { type: 'text_delta', content: ' — please rotate' },
    })
    // Coalesce window is 10ms; wait longer than that then verify.
    setTimeout(() => {
      const events = wsManager.getEventsSince(0)
      const last = events[events.length - 1]
      const serialised = JSON.stringify(last)
      expect(serialised).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789AB')
      expect(serialised).toContain('[REDACTED:github_pat]')
      done()
    }, 30)
  })

  test('broadcastToSession() flows through the same redactor', () => {
    wsManager.broadcastToSession('sess-d', 'os-session:output', {
      type: 'assistant_text',
      content: 'key was sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01',
    })
    const events = wsManager.getEventsSince(0)
    const serialised = JSON.stringify(events[events.length - 1])
    expect(serialised).not.toContain('sk-ant-api01-xyzABCdefGHIjklMNOpqrSTUvwXYZ01')
    expect(serialised).toContain('[REDACTED:anthropic_api_key]')
  })
})
