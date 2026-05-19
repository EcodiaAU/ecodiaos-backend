'use strict'

/**
 * deviceState unit tests - pure pickChannelFromState policy. DB-touching
 * paths smoked at deploy time.
 */

jest.mock('../../src/config/db', () => {
  const fn = jest.fn(async () => [])
  return fn
})
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

const ds = require('../../src/services/deviceState')

describe('pickChannelFromState', () => {
  const now = Date.parse('2026-05-19T12:00:00Z')

  test('empty state -> sms', () => {
    expect(ds.pickChannelFromState({}, now)).toBe('sms')
  })

  test('recent native inbound -> native', () => {
    const state = {
      last_inbound_channel: 'native',
      last_inbound_at: new Date(now - 5 * 60 * 1000).toISOString(),
    }
    expect(ds.pickChannelFromState(state, now)).toBe('native')
  })

  test('recent sms inbound -> sms (stays on sender channel)', () => {
    const state = {
      last_inbound_channel: 'sms',
      last_inbound_at: new Date(now - 10 * 60 * 1000).toISOString(),
    }
    expect(ds.pickChannelFromState(state, now)).toBe('sms')
  })

  test('recent telegram inbound -> NEVER returned by auto policy', () => {
    const state = {
      last_inbound_channel: 'telegram',
      last_inbound_at: new Date(now - 5 * 60 * 1000).toISOString(),
      apns_token: 'tok',
      last_apns_delivery_success_at: new Date(now - 60 * 1000).toISOString(),
    }
    // Falls through to native because apns is fresh.
    expect(ds.pickChannelFromState(state, now)).toBe('native')
  })

  test('stale inbound (>60min) + fresh apns -> native', () => {
    const state = {
      last_inbound_channel: 'native',
      last_inbound_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      apns_token: 'tok',
      last_apns_delivery_success_at: new Date(now - 60 * 60 * 1000).toISOString(),
    }
    expect(ds.pickChannelFromState(state, now)).toBe('native')
  })

  test('apns token but no recent delivery success -> sms', () => {
    const state = {
      apns_token: 'tok',
      last_apns_delivery_success_at: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
    }
    expect(ds.pickChannelFromState(state, now)).toBe('sms')
  })

  test('apns token, never delivered -> sms', () => {
    const state = { apns_token: 'tok' }
    expect(ds.pickChannelFromState(state, now)).toBe('sms')
  })

  test('handles null state', () => {
    expect(ds.pickChannelFromState(null, now)).toBe('sms')
  })

  test('handles undefined state', () => {
    expect(ds.pickChannelFromState(undefined, now)).toBe('sms')
  })
})
