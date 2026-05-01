'use strict'

/**
 * Integration seam test: osConversationLog.logTurn() must redact
 * credentials before the INSERT reaches the DB. Covers §5.1 wire-in.
 */

process.env.OS_CONV_LOG_ENABLED = 'true'

jest.mock('../../config/env', () => ({}))
jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))
jest.mock('../../config/db', () => {
  const calls = []
  const tag = (strings, ...values) => {
    calls.push({ sql: strings.join('?'), values })
    return Promise.resolve([])
  }
  tag._calls = calls
  tag._reset = () => { calls.length = 0 }
  return tag
})

const db = require('../../config/db')
const osConversationLog = require('../osConversationLog')
const credentialFilter = require('../../lib/credentialFilter')

describe('osConversationLog.logTurn redacts credentials before DB insert', () => {
  beforeEach(() => {
    db._reset()
    credentialFilter.resetCounters()
  })

  test('string content containing AWS key is redacted before INSERT', async () => {
    await osConversationLog.logTurn({
      ccSessionId: 'sess-1',
      turnNumber: 0,
      role: 'user',
      content: 'hey my AWS key is AKIAIOSFODNN7EXAMPLE please rotate',
      contentJson: null,
      tokenCount: null,
    })

    expect(db._calls.length).toBe(1)
    const { values } = db._calls[0]
    const joined = values.map(v => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))).join('||')
    expect(joined).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(joined).toContain('[REDACTED:aws_access_key]')
    expect(credentialFilter.getCounters()['aws_access_key|osConversationLog.logTurn']).toBe(1)
  })

  test('contentJson with nested secret is deep-redacted', async () => {
    await osConversationLog.logTurn({
      ccSessionId: 'sess-2',
      turnNumber: 1,
      role: 'tool_result',
      content: null,
      contentJson: {
        tool_use_id: 'tu_1',
        content: [{ type: 'text', text: 'response body has ghp_abcdefghijklmnopqrstuvwxyz0123456789AB in it' }],
      },
      tokenCount: 42,
    })

    expect(db._calls.length).toBe(1)
    const { values } = db._calls[0]
    const joined = values.map(v => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))).join('||')
    expect(joined).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789AB')
    expect(joined).toContain('[REDACTED:github_pat]')
  })

  test('null content stays null (no coercion to empty-string insert)', async () => {
    await osConversationLog.logTurn({
      ccSessionId: 'sess-3',
      turnNumber: 2,
      role: 'assistant',
      content: null,
      contentJson: null,
      tokenCount: null,
    })

    expect(db._calls.length).toBe(1)
    const { values } = db._calls[0]
    // Values: [ccSessionId, turnNumber, role, safeContent, safeContentJson, tokenCount]
    expect(values[3]).toBeNull()
    expect(values[4]).toBeNull()
  })
})
