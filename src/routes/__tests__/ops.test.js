'use strict'

/**
 * Tests for /api/ops route.
 *
 * Mocks db so the route's panel-per-table queries return canned rows.
 * Covers:
 *   - /metrics returns the full JSON shape
 *   - Missing table (DB throws) → panel is null, page still 200s
 *   - /  returns HTML shell that fetches /metrics
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockResultsByPattern = {}

function setMock(pattern, value) {
  mockResultsByPattern[pattern] = value
}

jest.mock('../../config/db', () => function dbTag(strings) {
  const sql = strings.join('?')
  for (const pattern in mockResultsByPattern) {
    if (sql.includes(pattern)) {
      const v = mockResultsByPattern[pattern]
      delete mockResultsByPattern[pattern] // one-shot per test
      if (v instanceof Error) return Promise.reject(v)
      return Promise.resolve(v)
    }
  }
  return Promise.resolve([])
})

const express = require('express')
const request = require('http').request
const opsRouter = require('../ops')

function mountAndStart() {
  const app = express()
  app.use('/api/ops', opsRouter)
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ app, server, port: server.address().port }))
  })
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path, method: 'GET' }, (res) => {
      let body = ''
      res.setEncoding('utf-8')
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), raw: body })
        } catch {
          resolve({ status: res.statusCode, body: null, raw: body })
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

describe('/api/ops/metrics', () => {
  let server, port
  beforeAll(async () => { ({ server, port } = await mountAndStart()) })
  afterAll(() => new Promise((resolve) => server.close(resolve)))
  beforeEach(() => { for (const k in mockResultsByPattern) delete mockResultsByPattern[k] })

  test('returns full shape when all queries succeed', async () => {
    setMock('claude_usage', [{ input_tokens: 10_000, output_tokens: 2_000, turns: 8 }])
    setMock('os_forks', [{ live: 2, completed_24h: 10, aborted_24h: 0, cap_rejected_24h: 0 }])
    setMock('conductor_claims', [{
      total_24h: 20, verified: 17, failed: 1, pending: 2, action_unknown: 0,
    }])
    setMock('cc_sessions', [{ total: 3, approved: 2, rejected: 0, shadow_verdicts: 1 }])

    const r = await getJson(port, '/api/ops/metrics')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.state.memory_heap_mb).toBeGreaterThan(0)
    expect(r.body.turn_economics.tokens_per_turn_avg).toBe(1500) // (10000+2000)/8
    expect(r.body.forks.live).toBe(2)
    expect(r.body.claims.verified_24h).toBe(17)
    expect(r.body.claims.verification_rate).toBeCloseTo(17 / 20, 3)
    expect(r.body.security.review_b_24h.shadow_verdicts).toBe(1)
  })

  test('missing claude_usage table: turn_economics is null, request still 200s', async () => {
    setMock('claude_usage', new Error('relation "claude_usage" does not exist'))
    setMock('os_forks', [{ live: 0, completed_24h: 0, aborted_24h: 0, cap_rejected_24h: 0 }])

    const r = await getJson(port, '/api/ops/metrics')
    expect(r.status).toBe(200)
    expect(r.body.turn_economics).toBeNull()
    expect(r.body.forks).toBeDefined()
  })

  test('all panels unavailable: request still 200s with nulls', async () => {
    setMock('claude_usage', new Error('x'))
    setMock('os_forks', new Error('x'))
    setMock('conductor_claims', new Error('x'))
    setMock('cc_sessions', new Error('x'))

    const r = await getJson(port, '/api/ops/metrics')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.turn_economics).toBeNull()
    expect(r.body.forks).toBeNull()
    expect(r.body.claims).toBeNull()
    expect(r.body.security).toBeNull()
  })

  test('empty results: each panel returns zero rather than null', async () => {
    setMock('claude_usage', [])
    setMock('os_forks', [])
    setMock('conductor_claims', [])
    setMock('cc_sessions', [])

    const r = await getJson(port, '/api/ops/metrics')
    expect(r.status).toBe(200)
    expect(r.body.turn_economics.turns_this_week).toBe(0)
    expect(r.body.forks.live).toBe(0)
    expect(r.body.claims.total_24h).toBe(0)
    expect(r.body.security.review_b_24h.total).toBe(0)
  })
})

describe('/api/ops/', () => {
  let server, port
  beforeAll(async () => { ({ server, port } = await mountAndStart()) })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  test('returns HTML shell that fetches /metrics', async () => {
    const r = await getJson(port, '/api/ops/')
    expect(r.status).toBe(200)
    expect(r.raw).toContain('<title>/ops')
    expect(r.raw).toContain('/api/ops/metrics')
    expect(r.raw).toContain('EcodiaOS Operations')
    // Ensure no innerHTML-with-data pattern slipped in.
    expect(r.raw).not.toMatch(/innerHTML\s*=\s*[^'"`]/)
  })
})
