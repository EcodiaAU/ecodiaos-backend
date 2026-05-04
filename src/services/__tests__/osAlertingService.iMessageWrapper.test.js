'use strict'

/**
 * Tests for the iMessage-primary + Twilio-fallback wrapping in
 * osAlertingService._sendSms. Mocks the tate-msg skill and the global
 * fetch (Twilio path).
 *
 * Cases:
 *   1. iMessage success → Twilio NOT called
 *   2. iMessage failure → Twilio called with same body
 *   3. USE_IMESSAGE_PRIMARY=0 → iMessage NOT called, only Twilio
 *
 * The wrapper is reached via _fire(SMS-eligible alert type). We expose
 * it indirectly through alertConsecutiveFailures (in SMS_ALERT_TYPES).
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// Make every db call return zero rows so the cooldown is treated as
// expired (Infinity), and the fired-write is a no-op.
jest.mock('../../config/db', () => {
  return function dbTag() {
    return Promise.resolve([])
  }
})

// Stub the gmail send so _send returns true (emit ok=true on alert).
jest.mock('../gmailService', () => ({
  sendNewEmail: jest.fn().mockResolvedValue({ ok: true }),
}))

// Stub osIncidentService.log so the optional logging line doesn't blow up.
jest.mock('../osIncidentService', () => ({
  log: jest.fn().mockResolvedValue(),
}))

// Mock the tate-msg skill. We replace the implementation per-test.
jest.mock('../../../skills/tate-msg', () => ({
  sendImessage: jest.fn(),
  healthCheck: jest.fn(),
  TATE_BUDDY: '+61404247153',
}))

const tateMsg = require('../../../skills/tate-msg')
const alerting = require('../osAlertingService')

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  // Twilio creds present so the fallback path is actually exercised
  // when invoked (rather than skipping due to unconfigured env).
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'tok_test'
  process.env.TWILIO_FROM_NUMBER = '+15555550100'
  process.env.TATE_MOBILE = '+61404247153'

  // Default fetch (Twilio) → ok
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ sid: 'SMabcd' }),
    text: async () => '',
  })
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('osAlertingService SMS wrapping (iMessage primary + Twilio fallback)', () => {
  test('iMessage success → Twilio NOT called', async () => {
    process.env.USE_IMESSAGE_PRIMARY = '1'
    tateMsg.sendImessage.mockResolvedValue({ ok: true, sid: 'imsg-123' })

    await alerting.alertConsecutiveFailures(3, 'mock')

    expect(tateMsg.sendImessage).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('iMessage failure → Twilio called with same body', async () => {
    process.env.USE_IMESSAGE_PRIMARY = '1'
    tateMsg.sendImessage.mockResolvedValue({ ok: false, error: 'ssh_connection_failed' })

    await alerting.alertConsecutiveFailures(3, 'mock')

    expect(tateMsg.sendImessage).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toMatch(/api\.twilio\.com/)
    const params = new URLSearchParams(opts.body)
    // The body Twilio receives should match what iMessage was offered
    // (after the alerting layer's prefix). Capture it from the iMessage
    // call so we don't have to know the exact prefix string.
    const iMessageBody = tateMsg.sendImessage.mock.calls[0][0]
    expect(params.get('Body')).toBe(iMessageBody.slice(0, 1500))
  })

  test('USE_IMESSAGE_PRIMARY=0 → iMessage NOT called, only Twilio', async () => {
    process.env.USE_IMESSAGE_PRIMARY = '0'
    tateMsg.sendImessage.mockResolvedValue({ ok: true, sid: 'imsg-should-not-fire' })

    await alerting.alertConsecutiveFailures(3, 'mock')

    expect(tateMsg.sendImessage).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('sendSmsToTate goes through wrapper (used by securityIncidentResponse)', async () => {
    process.env.USE_IMESSAGE_PRIMARY = '1'
    tateMsg.sendImessage.mockResolvedValue({ ok: true, sid: 'imsg-via-public' })

    await alerting.sendSmsToTate('[SECURITY] test incident')

    expect(tateMsg.sendImessage).toHaveBeenCalledTimes(1)
    expect(tateMsg.sendImessage.mock.calls[0][0]).toBe('[SECURITY] test incident')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
