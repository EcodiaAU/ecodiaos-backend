'use strict'

/**
 * Unit tests for conductorClaimsService - the multi-conductor lease primitive
 * (Layer 5 of the 24/7 autonomy architecture). Mocks db so the lease/conflict/
 * expiry/release logic is exercised without a live Postgres.
 *
 * The subtle path is acquire-under-conflict: a unique-violation (23505) means
 * someone holds the lease; the service then looks up the holder and either
 * returns ok:false (live holder) or in-line sweeps + retries (expired holder).
 */

jest.mock('../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))

jest.mock('../../config/db', () => {
  globalThis.__claimsMockState = {
    rows: [],            // active claim rows
    nextId: 1,
    insertAttempts: 0,
    conflictAttempts: 0, // throw 23505 on the first N INSERT attempts, then succeed
    heldRow: null,        // row returned by the post-conflict lookup
  }
  const sql = (strings, ...vals) => {
    const s = globalThis.__claimsMockState
    const text = strings.join('?').toLowerCase()

    if (text.includes('insert into coordination_claims')) {
      s.insertAttempts += 1
      if (s.insertAttempts <= s.conflictAttempts) {
        const err = new Error('duplicate key value violates unique constraint "coordination_claims_active_uniq"')
        err.code = '23505'
        return Promise.reject(err)
      }
      const row = {
        id: 'claim-' + (s.nextId++),
        conductor_id: vals[0],
        entity_type: vals[1],
        entity_ref: vals[2],
        claimed_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60000),
      }
      s.rows.push(row)
      return Promise.resolve([row])
    }
    // post-conflict holder lookup
    if (text.includes('select id, conductor_id, expires_at') && text.includes('released_at is null')) {
      return Promise.resolve(s.heldRow ? [s.heldRow] : [])
    }
    // in-line sweep of an expired blocking row
    if (text.includes('update coordination_claims') && text.includes('expired_inline_swept')) {
      return Promise.resolve([])
    }
    // touch
    if (text.includes('update coordination_claims') && text.includes('expires_at = now()')) {
      return Promise.resolve([{ id: vals[vals.length - 1], expires_at: new Date(Date.now() + 30 * 60000) }])
    }
    // release
    if (text.includes('update coordination_claims') && text.includes('released_at = now()')) {
      return Promise.resolve([{ id: vals[vals.length - 1], released_at: new Date() }])
    }
    // isHeld / listMine / listAll
    if (text.includes('select id, conductor_id, expires_at') || text.includes('select id, entity_type')) {
      return Promise.resolve(s.heldRow ? [s.heldRow] : [])
    }
    // sweep
    if (text.includes('update coordination_claims') && text.includes('expired_swept')) {
      return Promise.resolve(s.rows.map(r => ({ id: r.id })))
    }
    return Promise.resolve([])
  }
  sql.json = (v) => v
  sql.unsafe = () => Promise.resolve([])
  return sql
})

const claims = require('../conductorClaimsService')

function resetState() {
  globalThis.__claimsMockState.rows = []
  globalThis.__claimsMockState.nextId = 1
  globalThis.__claimsMockState.insertAttempts = 0
  globalThis.__claimsMockState.conflictAttempts = 0
  globalThis.__claimsMockState.heldRow = null
}

describe('conductorClaimsService', () => {
  beforeEach(resetState)

  test('acquire returns ok + claim on a free entity', async () => {
    const r = await claims.acquire({ entity_type: 'email_thread', entity_ref: 't1', conductor_id: 'A' })
    expect(r.ok).toBe(true)
    expect(r.claim.conductor_id).toBe('A')
    expect(r.claim.entity_ref).toBe('t1')
  })

  test('acquire rejects invalid entity_type', async () => {
    await expect(
      claims.acquire({ entity_type: 'not_a_type', entity_ref: 'x', conductor_id: 'A' })
    ).rejects.toThrow(/invalid entity_type/)
  })

  test('acquire requires entity_ref + conductor_id', async () => {
    await expect(claims.acquire({ entity_type: 'custom', conductor_id: 'A' })).rejects.toThrow(/entity_ref/)
    await expect(claims.acquire({ entity_type: 'custom', entity_ref: 'x' })).rejects.toThrow(/conductor_id/)
  })

  test('acquire under conflict with a LIVE holder returns ok:false + held_by', async () => {
    const s = globalThis.__claimsMockState
    s.conflictAttempts = 99 // every INSERT conflicts
    s.heldRow = { id: 'claim-99', conductor_id: 'B', expires_at: new Date(Date.now() + 60000), still_live: true }
    const r = await claims.acquire({ entity_type: 'email_thread', entity_ref: 't1', conductor_id: 'A' })
    expect(r.ok).toBe(false)
    expect(r.held_by).toBe('B')
    expect(r.claim_id).toBe('claim-99')
  })

  test('acquire under conflict with an EXPIRED holder sweeps + retries to success', async () => {
    const s = globalThis.__claimsMockState
    s.conflictAttempts = 1 // first INSERT conflicts, retry after sweep succeeds
    s.heldRow = { id: 'claim-expired', conductor_id: 'B', expires_at: new Date(Date.now() - 60000), still_live: false }
    const r = await claims.acquire({ entity_type: 'email_thread', entity_ref: 't1', conductor_id: 'A' })
    expect(r.ok).toBe(true)
    expect(s.insertAttempts).toBe(2) // proves it conflicted once then retried
  })

  test('release returns ok', async () => {
    const r = await claims.release('claim-1', { outcome: 'done' })
    expect(r.ok).toBe(true)
  })

  test('touch extends expiry', async () => {
    const r = await claims.touch('claim-1', { ttl_minutes: 60 })
    expect(r.ok).toBe(true)
    expect(r.expires_at).toBeInstanceOf(Date)
  })

  test('withClaim runs fn + releases on success', async () => {
    const out = await claims.withClaim(
      { entity_type: 'custom', entity_ref: 'wc1', conductor_id: 'A' },
      async (claim) => { expect(claim.id).toBeTruthy(); return 42 }
    )
    expect(out.acquired).toBe(true)
    expect(out.result).toBe(42)
  })

  test('withClaim returns acquired:false when held by other', async () => {
    const s = globalThis.__claimsMockState
    s.conflictAttempts = 99
    s.heldRow = { id: 'claim-held', conductor_id: 'B', expires_at: new Date(Date.now() + 60000), still_live: true }
    let ran = false
    const out = await claims.withClaim(
      { entity_type: 'custom', entity_ref: 'wc2', conductor_id: 'A' },
      async () => { ran = true }
    )
    expect(out.acquired).toBe(false)
    expect(out.held_by).toBe('B')
    expect(ran).toBe(false)
  })

  test('withClaim releases + rethrows on fn error', async () => {
    await expect(
      claims.withClaim(
        { entity_type: 'custom', entity_ref: 'wc3', conductor_id: 'A' },
        async () => { throw new Error('boom') }
      )
    ).rejects.toThrow('boom')
  })

  test('VALID_ENTITY_TYPES is exposed + includes the canonical set', () => {
    expect(claims.VALID_ENTITY_TYPES.has('status_board_row')).toBe(true)
    expect(claims.VALID_ENTITY_TYPES.has('email_thread')).toBe(true)
    expect(claims.VALID_ENTITY_TYPES.has('scheduled_task')).toBe(true)
  })
})
