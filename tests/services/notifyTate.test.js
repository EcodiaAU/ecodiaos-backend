'use strict'

/**
 * notifyTate unit tests - channel dispatch + fallback paths.
 * All transports mocked.
 */

jest.mock('../../src/config/db', () => {
  const fn = jest.fn(async () => [])
  return fn
})
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

jest.mock('../../src/services/threadMirror', () => ({
  appendOutbound: jest.fn(async () => undefined),
}))

jest.mock('../../src/services/apnsClient', () => ({
  push: jest.fn(),
  buildAlertPayload: jest.fn(({ body }) => ({ aps: { alert: { body } } })),
}))

jest.mock('../../src/services/deviceState', () => ({
  read: jest.fn(),
  recordApnsDelivery: jest.fn(async () => undefined),
  pickChannel: jest.fn(),
}))

jest.mock('../../src/services/transports/smsTransport', () => ({
  sendSmsToTate: jest.fn(),
}))

jest.mock('../../src/services/transports/telegramTransport', () => ({
  sendTelegramMessage: jest.fn(),
}))

const apns = require('../../src/services/apnsClient')
const deviceState = require('../../src/services/deviceState')
const { sendSmsToTate } = require('../../src/services/transports/smsTransport')
const { sendTelegramMessage } = require('../../src/services/transports/telegramTransport')
const { notifyTate } = require('../../src/services/notifyTate')

beforeEach(() => {
  jest.clearAllMocks()
  process.env.TATE_TELEGRAM_CHAT_ID = '999'
})

describe('notifyTate: channel=sms', () => {
  test('routes to sms transport, returns transport=sms', async () => {
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM123' })
    const r = await notifyTate({ body: 'hi', channel: 'sms' })
    expect(sendSmsToTate).toHaveBeenCalledWith({ body: 'hi', append_to_mirror: true })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('sms')
    expect(r.message_id).toBe('SM123')
  })

  test('propagates sms failure', async () => {
    sendSmsToTate.mockResolvedValue({ ok: false, error: 'twilio creds missing' })
    const r = await notifyTate({ body: 'hi', channel: 'sms' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('twilio creds missing')
  })
})

describe('notifyTate: channel=telegram', () => {
  test('routes to telegram transport with thread_id', async () => {
    sendTelegramMessage.mockResolvedValue({ ok: true, message_id: 42 })
    const r = await notifyTate({ body: 'yo', channel: 'telegram', thread_id: '999' })
    expect(sendTelegramMessage).toHaveBeenCalledWith({ chat_id: '999', text: 'yo', append_to_mirror: true })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('telegram')
    expect(r.message_id).toBe('42')
  })

  test('fails when no chat_id available', async () => {
    delete process.env.TATE_TELEGRAM_CHAT_ID
    // db mock returns [] so kv_store loader yields null chat_id
    const r = await notifyTate({ body: 'yo', channel: 'telegram' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_telegram_chat_id')
  })
})

describe('notifyTate: channel=native', () => {
  test('no apns_token -> falls back to sms', async () => {
    deviceState.read.mockResolvedValue({})
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM_fallback' })
    const r = await notifyTate({ body: 'hi', channel: 'native' })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('sms')
    expect(r.fallback_reason).toBe('no_apns_token')
    expect(r.message_id).toBe('SM_fallback')
  })

  test('apns 200 -> ok via native', async () => {
    deviceState.read.mockResolvedValue({ apns_token: 'devtok' })
    apns.push.mockResolvedValue({ status: 200 })
    const r = await notifyTate({ body: 'hi', urgency: 'alert', channel: 'native' })
    expect(apns.push).toHaveBeenCalled()
    expect(deviceState.recordApnsDelivery).toHaveBeenCalledWith({ ok: true })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('native')
  })

  test('apns 410 (token retired) -> falls back to sms', async () => {
    deviceState.read.mockResolvedValue({ apns_token: 'staletok' })
    apns.push.mockResolvedValue({ status: 410, body: { reason: 'Unregistered' } })
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM_fallback' })
    const r = await notifyTate({ body: 'hi', urgency: 'alert', channel: 'native' })
    expect(deviceState.recordApnsDelivery).toHaveBeenCalledWith({ ok: false })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('sms')
    expect(r.fallback_reason).toBe('apns_410')
  })

  test('apns unprovisioned (status 0) -> falls back to sms', async () => {
    deviceState.read.mockResolvedValue({ apns_token: 'tok' })
    apns.push.mockResolvedValue({ status: 0, error: 'apns_not_provisioned' })
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM_fb' })
    const r = await notifyTate({ body: 'x', channel: 'native' })
    expect(r.transport).toBe('sms')
    expect(r.fallback_reason).toBe('apns_not_provisioned')
  })
})

describe('notifyTate: channel=auto', () => {
  test('delegates to deviceState.pickChannel', async () => {
    deviceState.pickChannel.mockResolvedValue('sms')
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM_auto' })
    const r = await notifyTate({ body: 'hi', channel: 'auto' })
    expect(deviceState.pickChannel).toHaveBeenCalled()
    expect(r.transport).toBe('sms')
  })

  test('default (undefined channel) treated as auto', async () => {
    deviceState.pickChannel.mockResolvedValue('sms')
    sendSmsToTate.mockResolvedValue({ ok: true, sid: 'SM' })
    const r = await notifyTate({ body: 'hi' })
    expect(deviceState.pickChannel).toHaveBeenCalled()
    expect(r.transport).toBe('sms')
  })
})

describe('notifyTate: unknown channel', () => {
  test('returns unknown_channel_ error', async () => {
    const r = await notifyTate({ body: 'x', channel: 'fax' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unknown_channel_/)
  })
})
