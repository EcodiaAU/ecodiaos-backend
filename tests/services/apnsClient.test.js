'use strict'

/**
 * apnsClient unit tests - pure logic only (payload builders, urgency mapping,
 * JWT signing). HTTP/2 push path is integration-tested via the smoke
 * test against the live API; not unit-mocked here because mocking
 * http2.connect is brittle and adds no signal.
 */

jest.mock('../../src/config/db', () => {
  const fn = jest.fn(async () => [])
  return fn
})
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}))

const apns = require('../../src/services/apnsClient')

describe('urgencyToInterruptionLevel', () => {
  test('critical maps to time-sensitive', () => {
    expect(apns.urgencyToInterruptionLevel('critical')).toBe('time-sensitive')
  })
  test('alert maps to active', () => {
    expect(apns.urgencyToInterruptionLevel('alert')).toBe('active')
  })
  test('routine maps to passive', () => {
    expect(apns.urgencyToInterruptionLevel('routine')).toBe('passive')
  })
  test('unknown maps to passive', () => {
    expect(apns.urgencyToInterruptionLevel('mystery')).toBe('passive')
  })
})

describe('buildAlertPayload', () => {
  test('emits aps.alert.body + interruption-level', () => {
    const p = apns.buildAlertPayload({ body: 'hi', urgency: 'alert' })
    expect(p.aps.alert.body).toBe('hi')
    expect(p.aps['interruption-level']).toBe('active')
    expect(p.aps.sound).toBe('default')
  })
  test('routine omits sound', () => {
    const p = apns.buildAlertPayload({ body: 'fyi', urgency: 'routine' })
    expect(p.aps.sound).toBeUndefined()
    expect(p.aps['interruption-level']).toBe('passive')
  })
  test('attaches message_id and deep_link when provided', () => {
    const p = apns.buildAlertPayload({ body: 'x', urgency: 'alert', message_id: 'm1', deep_link: 'ecodia://t/abc' })
    expect(p.message_id).toBe('m1')
    expect(p.deep_link).toBe('ecodia://t/abc')
  })
})

describe('buildBackgroundPayload', () => {
  test('emits content-available + payload', () => {
    const p = apns.buildBackgroundPayload({ payload: { foo: 1 } })
    expect(p.aps['content-available']).toBe(1)
    expect(p.payload.foo).toBe(1)
  })
})

describe('buildActivityPayload', () => {
  test('emits event + content-state + timestamp', () => {
    const p = apns.buildActivityPayload({ event: 'update', contentState: { state: 'thinking' } })
    expect(p.aps.event).toBe('update')
    expect(p.aps['content-state'].state).toBe('thinking')
    expect(typeof p.aps.timestamp).toBe('number')
  })
  test('omits alert when no body', () => {
    const p = apns.buildActivityPayload({ event: 'end', contentState: { state: 'done' } })
    expect(p.aps.alert).toBeUndefined()
  })
  test('includes alert.body when provided', () => {
    const p = apns.buildActivityPayload({ event: 'update', contentState: {}, body: 'progress' })
    expect(p.aps.alert.body).toBe('progress')
  })
})

describe('buildJwt', () => {
  // Real ES256 PEM via generated test key.
  test('signs with ES256, kid header, team_id issuer', () => {
    const { generateKeyPairSync } = require('node:crypto')
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const tok = apns.buildJwt({ p8Pem: pem, keyId: 'KEYID1', teamId: 'TEAMID1' })
    expect(typeof tok).toBe('string')
    const parts = tok.split('.')
    expect(parts).toHaveLength(3)
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    expect(header.alg).toBe('ES256')
    expect(header.kid).toBe('KEYID1')
    expect(payload.iss).toBe('TEAMID1')
    expect(typeof payload.exp).toBe('number')
  })
})
