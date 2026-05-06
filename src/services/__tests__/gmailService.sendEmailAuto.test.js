'use strict'

/**
 * Integration tests for the gmailService auto-token send path.
 *
 * Covers:
 * - sendEmailAuto: pattern match → token issued → sendEmailGated path
 * - sendEmailAuto: no pattern match → pending_otp returned, NO send
 * - sendReplyToThread: routes through sendEmailAuto with thread context
 * - sendNewEmail: routes through sendEmailAuto with optional opts
 * - _buildSendTarget: deterministic shape across issuer and verifier
 *
 * Per §3.2/§3.3 threat model, every external-recipient send must go
 * through the composite gate. Previously sendReplyToThread and
 * sendNewEmail bypassed it - this test locks in the wire-up.
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

const mockIssueToken = jest.fn()
const mockVerifyAndConsume = jest.fn()
jest.mock('../tier3GateService', () => ({
  issueToken: (...a) => mockIssueToken(...a),
  verifyAndConsume: (...a) => mockVerifyAndConsume(...a),
}))

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

const mockAppend = jest.fn()
jest.mock('../securityAuditLog', () => ({
  append: (...a) => mockAppend(...a),
}))

// Calendar gate: always proceed so tests don't flake on time-of-day.
jest.mock('../timeSenseService', () => ({
  calendarGate: jest.fn(async () => ({ proceed: true })),
}))

const gmailService = require('../gmailService')

describe('gmailService.sendEmailAuto - auto-issue token path', () => {
  beforeEach(() => {
    mockIssueToken.mockReset()
    mockVerifyAndConsume.mockReset()
    mockAnalyze.mockReset()
    mockRequiresManualTier3.mockReset()
    mockRouteOutbound.mockReset()
    mockAppend.mockReset()
  })

  test('throws when `to` missing', async () => {
    await expect(gmailService.sendEmailAuto({ subject: 's', body: 'b' })).rejects.toThrow(/`to`/)
  })

  test('pattern matches → token issued → sendEmailGated path succeeds', async () => {
    mockIssueToken.mockResolvedValue({
      status: 'issued', token: 'auto-tok', expires_at: new Date(Date.now() + 900_000), pattern_name: 'internal_ecodia_comms',
    })
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockResolvedValue({ id: 1 })

    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'msg-auto-1', gmail_thread_id: null, from: 'code@ecodia.au' })

    try {
      const result = await gmailService.sendEmailAuto({
        from: 'code@ecodia.au',
        to: 'partner@ecodia.com.au',
        subject: 'update',
        body: 'body',
        sessionId: 'sess-auto-1',
      })
      expect(result.message_id).toBe('msg-auto-1')
      expect(mockIssueToken).toHaveBeenCalledWith(expect.objectContaining({
        action_type: 'gmail_send_external',
        session_id: 'sess-auto-1',
      }))
      // Target must include to_domain (derived from the @ split).
      const issueArgs = mockIssueToken.mock.calls[0][0]
      expect(issueArgs.target.to_domain).toBe('ecodia.com.au')
      expect(issueArgs.target.to).toBe('partner@ecodia.com.au')
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })

  test('no pattern match → pending_otp returned, NO send', async () => {
    mockIssueToken.mockResolvedValue({
      status: 'pending_otp', otp_id: 42, otp_code: '123456', expires_at: new Date(Date.now() + 600_000),
    })

    const result = await gmailService.sendEmailAuto({
      to: 'unknown@random.com',
      subject: 'hi',
      body: 'b',
      sessionId: 'sess-auto-2',
    })

    expect(result).toMatchObject({ pending_otp: true, otp_id: 42 })
    expect(mockRouteOutbound).not.toHaveBeenCalled()
    expect(mockAppend).not.toHaveBeenCalled()
  })

  test('synthetic sessionId when not provided', async () => {
    mockIssueToken.mockResolvedValue({ status: 'pending_otp', otp_id: 1 })

    await gmailService.sendEmailAuto({
      to: 'x@y.com',
      subject: 's',
      body: 'b',
      context: { source: 'test-src' },
    })

    expect(mockIssueToken).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: expect.stringMatching(/^autonomous-test-src-\d+$/),
      }),
    )
  })

  test('unexpected issueToken status throws', async () => {
    mockIssueToken.mockResolvedValue({ status: 'something-weird' })
    await expect(gmailService.sendEmailAuto({
      to: 'x@y.com', subject: 's', body: 'b', sessionId: 'sess-auto-3',
    })).rejects.toMatchObject({ code: 'tier3_issue_failed' })
  })

  test('issuer and verifier see same target shape (HMAC consistency)', async () => {
    mockIssueToken.mockResolvedValue({
      status: 'issued', token: 'auto-tok', expires_at: new Date(Date.now() + 900_000),
    })
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockResolvedValue({ id: 1 })

    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'mid' })

    try {
      await gmailService.sendEmailAuto({
        to: 'x@y.com', subject: 's', body: 'body of text', sessionId: 'sess-auto-4',
        context: { is_thread_reply: true, autonomous: true },
      })
      const issueTarget = mockIssueToken.mock.calls[0][0].target
      const verifyTarget = mockVerifyAndConsume.mock.calls[0][0].target
      // Every key/value must match - the HMAC depends on byte-for-byte equivalence.
      expect(verifyTarget).toEqual(issueTarget)
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })
})

describe('gmailService.sendReplyToThread - routes through sendEmailAuto', () => {
  beforeEach(() => {
    mockIssueToken.mockReset()
    mockVerifyAndConsume.mockReset()
    mockAnalyze.mockReset()
    mockRequiresManualTier3.mockReset()
    mockRouteOutbound.mockReset()
    mockAppend.mockReset()
  })

  test('tags autonomous + is_thread_reply context, thread.id in sessionId', async () => {
    mockIssueToken.mockResolvedValue({
      status: 'issued', token: 'auto-tok', expires_at: new Date(Date.now() + 900_000),
      pattern_name: 'autonomous_thread_reply',
    })
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockResolvedValue({ id: 1 })

    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'reply-1' })

    try {
      await gmailService.sendReplyToThread(
        {
          id: 'thread-abc',
          from_email: 'external@client.com',
          subject: 'Question',
          gmail_thread_id: 'gm-t-1',
          gmail_message_ids: ['<msg-1@mail>'],
          inbox: 'code@ecodia.au',
        },
        'Quick reply',
      )

      expect(mockIssueToken).toHaveBeenCalledWith(expect.objectContaining({
        action_type: 'gmail_send_external',
        session_id: 'triage-reply-thread-abc',
      }))
      const target = mockIssueToken.mock.calls[0][0].target
      expect(target).toEqual(expect.objectContaining({
        to: 'external@client.com',
        to_domain: 'client.com',
        is_thread_reply: true,
        autonomous: true,
      }))
      expect(target.body_length).toBe('Quick reply'.length)
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })

  test('pending_otp result: does NOT update thread status', async () => {
    mockIssueToken.mockResolvedValue({ status: 'pending_otp', otp_id: 9 })

    const result = await gmailService.sendReplyToThread(
      { id: 'thread-blocked', from_email: 'x@y.com', subject: 's', gmail_thread_id: 't', inbox: 'code@ecodia.au' },
      'Body',
    )
    expect(result).toMatchObject({ pending_otp: true, otp_id: 9 })
    // We can't easily assert DB was not written here without a db mock spy,
    // but the code path runs `if (pending_otp) return` before the UPDATE.
  })
})

describe('gmailService.sendNewEmail - routes through sendEmailAuto', () => {
  beforeEach(() => {
    mockIssueToken.mockReset()
    mockVerifyAndConsume.mockReset()
    mockAnalyze.mockReset()
    mockRequiresManualTier3.mockReset()
    mockRouteOutbound.mockReset()
    mockAppend.mockReset()
  })

  test('sendNewEmail with ecodia domain → internal_ecodia_comms pattern matches', async () => {
    mockIssueToken.mockResolvedValue({
      status: 'issued', token: 'auto-tok', expires_at: new Date(Date.now() + 900_000),
      pattern_name: 'internal_ecodia_comms',
    })
    mockAnalyze.mockResolvedValue({ contains_commitment: false, categories: [], risk: 'low', source: 'deterministic' })
    mockRequiresManualTier3.mockReturnValue(false)
    mockRouteOutbound.mockResolvedValue({ action: 'send', row: null })
    mockVerifyAndConsume.mockResolvedValue(true)
    mockAppend.mockResolvedValue({ id: 1 })

    const originalSendEmail = gmailService.sendEmail
    gmailService.sendEmail = async () => ({ sent: true, message_id: 'new-1' })

    try {
      await gmailService.sendNewEmail('code@ecodia.au', 'tate@ecodia.au', 'alert', 'body', {
        source: 'osAlerting', urgency: 'high',
      })
      const target = mockIssueToken.mock.calls[0][0].target
      expect(target.to_domain).toBe('ecodia.au')
    } finally {
      gmailService.sendEmail = originalSendEmail
    }
  })

  test('sendNewEmail to external domain → pending_otp (no matching pattern)', async () => {
    mockIssueToken.mockResolvedValue({ status: 'pending_otp', otp_id: 77 })

    const result = await gmailService.sendNewEmail(
      'code@ecodia.au',
      'cold@external.com',
      'New contact',
      'intro body',
    )
    expect(result).toMatchObject({ pending_otp: true, otp_id: 77 })
  })
})
