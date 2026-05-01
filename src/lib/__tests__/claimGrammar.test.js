'use strict'

/**
 * Tests for src/lib/claimGrammar.js.
 *
 * Pure-function module, no mocks needed.
 */

const {
  parseClaims,
  classifyHandle,
  renderClaim,
  ACTION_REQUIRED_KEYS,
} = require('../claimGrammar')

describe('claimGrammar.parseClaims', () => {
  test('parses a simple deployed claim', () => {
    const claims = parseClaims('Did the deploy. [CLAIM:deployed sha=abc123 pm2_uptime=4s] Then waited.')
    expect(claims.length).toBe(1)
    expect(claims[0].action).toBe('deployed')
    expect(claims[0].handle).toEqual({ sha: 'abc123', pm2_uptime: '4s' })
    expect(claims[0].raw).toBe('[CLAIM:deployed sha=abc123 pm2_uptime=4s]')
  })

  test('parses multiple claims on one line', () => {
    const claims = parseClaims('[CLAIM:committed sha=abc] [CLAIM:emailed to=x@y.com message_id=<abc@mail>]')
    expect(claims.length).toBe(2)
    expect(claims[0].action).toBe('committed')
    expect(claims[1].action).toBe('emailed')
    expect(claims[1].handle.message_id).toBe('<abc@mail>')
  })

  test('ignores malformed envelopes (no closing bracket)', () => {
    const claims = parseClaims('[CLAIM:deployed sha=abc\nNot a claim')
    expect(claims.length).toBe(0)
  })

  test('ignores empty envelopes', () => {
    const claims = parseClaims('[CLAIM:]')
    expect(claims.length).toBe(0)
  })

  test('ignores envelopes where action is not a valid identifier', () => {
    const claims = parseClaims('[CLAIM: sha=abc]')
    expect(claims.length).toBe(0)
  })

  test('action without any keys is valid (empty handle)', () => {
    const claims = parseClaims('[CLAIM:unverified]')
    expect(claims.length).toBe(1)
    expect(claims[0].action).toBe('unverified')
    expect(claims[0].handle).toEqual({})
  })

  test('quoted values with spaces and special chars', () => {
    const claims = parseClaims('[CLAIM:emailed to=x@y.com subject="hello world = tricky"]')
    expect(claims.length).toBe(1)
    expect(claims[0].handle).toEqual({
      to: 'x@y.com',
      subject: 'hello world = tricky',
    })
  })

  test('escaped quotes in quoted value', () => {
    const claims = parseClaims('[CLAIM:noted text="she said \\"hi\\""]')
    expect(claims.length).toBe(1)
    expect(claims[0].handle.text).toBe('she said "hi"')
  })

  test('skips malformed key=value tokens silently', () => {
    const claims = parseClaims('[CLAIM:deployed sha=abc =novalue key_only]')
    expect(claims.length).toBe(1)
    expect(claims[0].handle).toEqual({ sha: 'abc' })
  })

  test('invalid key (non-identifier) is dropped', () => {
    const claims = parseClaims('[CLAIM:deployed sha=abc 123bad=x]')
    expect(claims[0].handle).toEqual({ sha: 'abc' })
  })

  test('non-string input returns empty array', () => {
    expect(parseClaims(null)).toEqual([])
    expect(parseClaims(undefined)).toEqual([])
    expect(parseClaims(42)).toEqual([])
  })

  test('empty string returns empty array', () => {
    expect(parseClaims('')).toEqual([])
  })

  test('iso timestamp values pass through intact', () => {
    const claims = parseClaims('[CLAIM:scheduled task_id=sch_42 fires_at=2026-05-01T09:00:00Z]')
    expect(claims[0].handle.fires_at).toBe('2026-05-01T09:00:00Z')
  })
})

describe('claimGrammar.classifyHandle', () => {
  test('known action + required key present → has_handle=true', () => {
    const c = classifyHandle({ action: 'deployed', handle: { sha: 'abc' } })
    expect(c.has_handle).toBe(true)
    expect(c.missing_keys).toEqual([])
  })

  test('known action + required key missing → has_handle=false', () => {
    const c = classifyHandle({ action: 'emailed', handle: { to: 'x@y.com' } })
    expect(c.has_handle).toBe(false)
    expect(c.missing_keys).toEqual(['message_id'])
  })

  test('unknown action + any handle → has_handle=true (best effort)', () => {
    const c = classifyHandle({ action: 'novel_action', handle: { foo: 'bar' } })
    expect(c.has_handle).toBe(true)
  })

  test('unknown action + empty handle → has_handle=false', () => {
    const c = classifyHandle({ action: 'novel_action', handle: {} })
    expect(c.has_handle).toBe(false)
  })

  test('required keys table is stable', () => {
    expect(ACTION_REQUIRED_KEYS.deployed).toEqual(['sha'])
    expect(ACTION_REQUIRED_KEYS.emailed).toEqual(['message_id'])
    expect(Object.isFrozen(ACTION_REQUIRED_KEYS)).toBe(true)
  })
})

describe('claimGrammar.renderClaim', () => {
  test('round-trip: parse then render produces equivalent claim', () => {
    const input = '[CLAIM:deployed sha=abc pm2_uptime=4s]'
    const parsed = parseClaims(input)[0]
    const rendered = renderClaim(parsed)
    const reparsed = parseClaims(rendered)[0]
    expect(reparsed.action).toBe(parsed.action)
    expect(reparsed.handle).toEqual(parsed.handle)
  })

  test('values with spaces get quoted', () => {
    const rendered = renderClaim({ action: 'emailed', handle: { subject: 'hello world' } })
    expect(rendered).toContain('"hello world"')
  })

  test('values with embedded quotes get escaped', () => {
    const rendered = renderClaim({ action: 'noted', handle: { text: 'she said "hi"' } })
    expect(rendered).toContain('\\"hi\\"')
    const reparsed = parseClaims(rendered)[0]
    expect(reparsed.handle.text).toBe('she said "hi"')
  })

  test('clean values stay bare', () => {
    const rendered = renderClaim({ action: 'deployed', handle: { sha: 'abc123' } })
    expect(rendered).toBe('[CLAIM:deployed sha=abc123]')
  })
})
