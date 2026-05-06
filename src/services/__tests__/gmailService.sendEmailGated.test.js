'use strict'

/**
 * Integration test: gmailService.sendEmailGated - the §3.2/§3.3/§3.4/§7.1
 * composite gate wrapping the existing sendEmail dispatcher.
 *
 * Mocks every side-effect dep so the test runs in isolation without DB,
 * network, or googleapis. What we assert is ordering + fail-closed behaviour:
 *
 *   1. commitmentDetector.analyze runs first.
 *   2. outboundEmailDelayQueue.routeOutbound next - if queued, short-circuit.
 *   3. tier3GateService.verifyAndConsume - if false, throw tier3_gate_denied.
 *   4. Internal sender fires only on verified.
 *   5. securityAuditLog.append fires after successful send.
 */

process.env.GMAIL_ENABLED = 'true'

jest.mock('../../config/env', () => ({ GMAIL_ENABLED: 'true' }))
jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))
jest.mock('../../config/db', () => () => Promise.resolve([]))
jest.mock('googleapis', () => ({
  google: { auth: { JWT: jest.fn() }, gmail: jest.fn(() => ({ users: { messages: { send: jest.fn() } } })) },
}))
jest.mock('../../db/queries/transactions', () => ({ createNotification: jest.fn() }))
jest.mock('../../db/queries/clients', () => ({ findClientByEmail: jest.fn() }))
jest.mock('../../db/queries/tasks', () => ({ createTask: jest.fn() }))
jest.mock('../deepseekService', () => ({}))
jest.mock('../kgIngestionHooks', () => ({}))

const mockAnalyze = jest.fn()
const mockRequiresManualTier3 = jest.fn()
jest.mock('../commitmentDetector', () => ({
  analyze: (...a) => mockAnalyze(...a),
  requiresManualTier3: (...a) => mockRequiresManualTier3(...a),
}))

const mockRouteOutbound = jest.fn()
jest.mock('../outboundEmailDelayQueue', () => ({
  routeOutbound: (...a) => mockRouteOutbound(...a),
}))

const mockVerifyAndConsume = jest.fn()
jest.mock('../tier3GateService', () => ({
  verifyAndConsume: (...a) => mockVerifyAndConsume(...a),
}))

const mockAppend = jest.fn()
jest.mock('../securityAuditLog', () => ({
  append: (...a) => mockAppend(...a),
}))

const gmailService = require('../gmailService')

describe('gmailService.sendEmailGated', () => {
  beforeEach(() => {
    mockAnalyze.mockReset()
    mockRequiresManualTier3.mockReset()
    mockRouteOutbound.mockReset()
    mockVerifyAndConsume.mockReset()
    mockAppend.mockReset()
  })

  test('missing gate_token rejects with tier3_gate_denied', async () => {
    await expect(gmailService.sendEmailGated({
      to: 'client@example.com',
      subject: 's',
      body: 'b',
      sessionId: 'sess-1',
    })).rejects.toMatchObject({ code: 'tier3_gate_denied' })
  })

  test('missing sessionId throws (audit log requires it)', async () => {
    await expect(gmailService.sendEmailGated({
      to: 'client@example.com',
      subject: 's',
      body: 'b',
      gate_token: 't',
    })).rejects.toThrow(/sessionId/)
  })

  test('delay-queue queued path short-circuits without verifyAndConsume or send', async () => {
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'queued', row: { id: 77 } })

    const result = await gmailService.sendEmailGated({
      to: 'new@unknown.com', subject: 'hi', body: 'low-risk body',
      sessionId: 'sess-a', gate_token: 'tok',
    })

    expect(result).toEqual(expect.objectContaining({ queued: true, row: { id: 77 } }))
    expect(mockVerifyAndConsume).not.toHaveBeenCalled()
    expect(mockAppend).not.toHaveBeenCalled()
  })

  test('tier3 verify fails → tier3_gate_denied thrown, no send, no audit', async () => {
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(false)

    await expect(gmailService.sendEmailGated({
      to: 'friend@ecodia.au', subject: 's', body: 'b',
      sessionId: 'sess-b', gate_token: 'bad-token',
    })).rejects.toMatchObject({ code: 'tier3_gate_denied' })
    expect(mockAppend).not.toHaveBeenCalled()
  })

  test('analyze throws → fails closed (tier3_gate_denied)', async () => {
    mockAnalyze.mockRejectedValue(new Error('claude down'))
    await expect(gmailService.sendEmailGated({
      to: 'client@example.com', subject: 's', body: 'b',
      sessionId: 'sess-c', gate_token: 'tok',
    })).rejects.toMatchObject({ code: 'tier3_gate_denied' })
    expect(mockRouteOutbound).not.toHaveBeenCalled()
  })

  test('happy path: analyze → route (send) → verify true → audit fires with hashed target', async () => {
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockResolvedValue({ id: 1 })

    // Stub the underlying Google send pathway via gmailService.sendEmail monkey-patch.
    // Easier: replace module.exports.sendEmail in this scope.
    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'msg-1', gmail_thread_id: 'tid-1', from: 'code@ecodia.au' })

    try {
      const result = await gmailService.sendEmailGated({
        from: 'code@ecodia.au',
        to: 'partner@ecodia.com.au', subject: 'weekly update', body: 'all good',
        sessionId: 'sess-d', gate_token: 'tok',
      })
      expect(result.message_id).toBe('msg-1')
      expect(mockVerifyAndConsume).toHaveBeenCalledWith(expect.objectContaining({
        action_type: 'gmail_send_external',
        session_id: 'sess-d',
        token: 'tok',
      }))
      // verifyAndConsume target must include to + subject_hash (sha256 hex)
      const verifyArgs = mockVerifyAndConsume.mock.calls[0][0]
      expect(verifyArgs.target).toEqual(expect.objectContaining({
        to: 'partner@ecodia.com.au',
      }))
      expect(typeof verifyArgs.target.subject_hash).toBe('string')
      expect(verifyArgs.target.subject_hash).toHaveLength(64)
      expect(mockAppend).toHaveBeenCalledWith(expect.objectContaining({
        action_type: 'gmail_send_external',
        session_id: 'sess-d',
        trigger_source: 'gmailService.sendEmailGated',
      }))
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })

  test('audit append failure does NOT reverse a successful send', async () => {
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockRejectedValue(new Error('DB down'))

    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'msg-2', gmail_thread_id: null, from: 'code@ecodia.au' })

    try {
      const result = await gmailService.sendEmailGated({
        to: 'partner@ecodia.com.au', subject: 's', body: 'b',
        sessionId: 'sess-e', gate_token: 'tok',
      })
      expect(result.message_id).toBe('msg-2') // send succeeded, audit failed → still returned
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })
})
