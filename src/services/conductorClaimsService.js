// conductorClaimsService.js
// Multi-conductor coordination lease helper. Layer 5 of the 24/7 autonomy
// architecture spec (backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md).
//
// API:
//   acquire({entity_type, entity_ref, conductor_id, ttl_minutes?, context?})
//     -> { ok: true, claim } on win
//     -> { ok: false, held_by, expires_at, claim_id } when someone else owns it
//   touch(id, {ttl_minutes?}) -> extends expires_at on the OWNING side
//   release(id, {outcome?}) -> writes released_at + outcome
//   isHeld({entity_type, entity_ref}) -> { held: bool, claim? }
//   listMine(conductor_id) -> active claims by this conductor
//   sweep() -> count of expired claims swept (cheap, run by cron)
//
// Convention:
//   conductor_id strings to use:
//     - main-tate-cursor-2026-05-27 (Corazon chat)
//     - ios-native-conductor (iOS app)
//     - voice-conductor (twilio voice)
//     - cron-meta-loop, cron-email-triage (per-Routine)
//     - worker-tab_xxxxxx (spawned worker arc)
//
// Lease pattern:
//   Conductor: const r = await acquire({entity_type:'email_thread', entity_ref:'thread_abc', conductor_id:'main-...'})
//   if (!r.ok) { defer or skip; }
//   try { ...act on entity... } finally { await release(r.claim.id, {outcome:'done'}) }

const db = require('../config/db')
const logger = require('../config/logger')

const DEFAULT_TTL_MINUTES = 30

const VALID_ENTITY_TYPES = new Set([
  'status_board_row',
  'email_thread',
  'approval_queue_item',
  'scheduled_task',
  'observer_signal',
  'pending_restart_request',
  'working_set_thread',
  'custom',
])

async function acquire({ entity_type, entity_ref, conductor_id, ttl_minutes, context }) {
  if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
    throw new Error(`invalid entity_type: ${entity_type}`)
  }
  if (!entity_ref) throw new Error('entity_ref required')
  if (!conductor_id) throw new Error('conductor_id required')
  const ttl = Math.max(1, Math.min(360, ttl_minutes || DEFAULT_TTL_MINUTES))

  // Single statement: try to INSERT a fresh claim. The partial unique index
  // (active rows only) rejects when someone else holds the lease. If insert
  // hits the conflict, fetch the holding row and return ok:false.
  try {
    const rows = await db`
      INSERT INTO coordination_claims (conductor_id, entity_type, entity_ref, expires_at, context)
      VALUES (${conductor_id}, ${entity_type}, ${entity_ref}, NOW() + (${ttl} || ' minutes')::interval, ${context ? db.json(context) : null})
      RETURNING id, conductor_id, entity_type, entity_ref, claimed_at, expires_at
    `
    if (rows.length > 0) {
      logger.debug('conductorClaims: acquired', { entity_type, entity_ref, conductor_id, claim_id: rows[0].id })
      return { ok: true, claim: rows[0] }
    }
    return { ok: false, error: 'no_rows_returned_unexpectedly' }
  } catch (err) {
    // Unique constraint violation = someone else holds the lease.
    const isConflict = err && (err.code === '23505' || /coordination_claims_active_uniq/.test(err.message || ''))
    if (!isConflict) {
      logger.warn('conductorClaims: acquire failed unexpectedly', { error: err.message, entity_type, entity_ref })
      throw err
    }
    // Lookup the unreleased holding row (could be live OR expired-but-unswept).
    const held = await db`
      SELECT id, conductor_id, expires_at, expires_at > NOW() AS still_live
      FROM coordination_claims
      WHERE entity_type = ${entity_type} AND entity_ref = ${entity_ref}
        AND released_at IS NULL
      LIMIT 1
    `
    if (held.length === 0) {
      // Race: released between conflict + lookup. Retry once.
      return acquire({ entity_type, entity_ref, conductor_id, ttl_minutes: ttl, context })
    }
    if (!held[0].still_live) {
      // Expired claim blocking us. Sweep it in-line and retry the acquire.
      // Use the held.id so we only touch THIS row (sweep() is whole-table).
      await db`
        UPDATE coordination_claims
        SET released_at = NOW(), outcome = COALESCE(outcome, 'expired_inline_swept')
        WHERE id = ${held[0].id} AND released_at IS NULL
      `
      return acquire({ entity_type, entity_ref, conductor_id, ttl_minutes: ttl, context })
    }
    return { ok: false, held_by: held[0].conductor_id, expires_at: held[0].expires_at, claim_id: held[0].id }
  }
}

async function touch(id, { ttl_minutes } = {}) {
  if (!id) throw new Error('id required')
  const ttl = Math.max(1, Math.min(360, ttl_minutes || DEFAULT_TTL_MINUTES))
  const rows = await db`
    UPDATE coordination_claims
    SET expires_at = NOW() + (${ttl} || ' minutes')::interval
    WHERE id = ${id} AND released_at IS NULL
    RETURNING id, expires_at
  `
  return { ok: rows.length > 0, expires_at: rows[0]?.expires_at }
}

async function release(id, { outcome } = {}) {
  if (!id) throw new Error('id required')
  const rows = await db`
    UPDATE coordination_claims
    SET released_at = NOW(), outcome = ${outcome || null}
    WHERE id = ${id} AND released_at IS NULL
    RETURNING id, released_at, outcome
  `
  return { ok: rows.length > 0, released_at: rows[0]?.released_at }
}

async function isHeld({ entity_type, entity_ref }) {
  if (!entity_type || !entity_ref) throw new Error('entity_type + entity_ref required')
  const rows = await db`
    SELECT id, conductor_id, expires_at
    FROM coordination_claims
    WHERE entity_type = ${entity_type} AND entity_ref = ${entity_ref}
      AND released_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `
  if (rows.length === 0) return { held: false }
  return { held: true, claim: rows[0] }
}

async function listMine(conductor_id) {
  if (!conductor_id) throw new Error('conductor_id required')
  return db`
    SELECT id, entity_type, entity_ref, claimed_at, expires_at, context
    FROM coordination_claims
    WHERE conductor_id = ${conductor_id} AND released_at IS NULL AND expires_at > NOW()
    ORDER BY claimed_at DESC
    LIMIT 50
  `
}

async function listAll({ limit = 100 } = {}) {
  return db`
    SELECT id, conductor_id, entity_type, entity_ref, claimed_at, expires_at
    FROM coordination_claims
    WHERE released_at IS NULL AND expires_at > NOW()
    ORDER BY claimed_at DESC
    LIMIT ${limit}
  `
}

// Sweep expired claims. Idempotent. Cheap (single UPDATE on a small partial
// index). Should be cron'd every 5 minutes.
async function sweep() {
  const rows = await db`
    UPDATE coordination_claims
    SET released_at = NOW(), outcome = COALESCE(outcome, 'expired_swept')
    WHERE released_at IS NULL AND expires_at <= NOW()
    RETURNING id
  `
  if (rows.length > 0) {
    logger.info('conductorClaims: swept expired', { count: rows.length })
  }
  return { swept: rows.length }
}

// Convenience: lease wrapper. Acquires, runs fn(claim), always releases.
async function withClaim({ entity_type, entity_ref, conductor_id, ttl_minutes, context }, fn) {
  const r = await acquire({ entity_type, entity_ref, conductor_id, ttl_minutes, context })
  if (!r.ok) return { acquired: false, reason: 'held_by_other', held_by: r.held_by, expires_at: r.expires_at }
  try {
    const result = await fn(r.claim)
    await release(r.claim.id, { outcome: 'completed' })
    return { acquired: true, result }
  } catch (err) {
    await release(r.claim.id, { outcome: 'errored:' + (err.message || 'unknown').slice(0, 200) })
    throw err
  }
}

module.exports = {
  acquire,
  touch,
  release,
  isHeld,
  listMine,
  listAll,
  sweep,
  withClaim,
  VALID_ENTITY_TYPES,
  DEFAULT_TTL_MINUTES,
}
