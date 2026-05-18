'use strict'

/**
 * financePulseService - CFO-in-RAM continuity block.
 *
 * Reads kv_store key `cowork.ceo.finance_now` and renders a typed
 * <finance_pulse>...</finance_pulse> block stitched into the conductor's
 * turn-start prelude. The substrate (not the conductor) owns update cadence;
 * upstream Routines / forks / batch posters write the row, this service only
 * reads + renders.
 *
 * Block cap: 1500 bytes (matches workingSetService discipline).
 *
 * Origin: continuity-blocks-are-the-os-pulse-2026-05-18.md.
 */

const logger = require('../config/logger')
const db = require('../config/db')

const KV_KEY = 'cowork.ceo.finance_now'
const BLOCK_BYTE_CAP = 1500

// Default-zero shape returned when the kv row is absent or malformed.
function _defaultShape() {
  return {
    cash_business: 0,
    cash_personal_subsidising: 0,
    director_loan_balance: 0,
    gst_owed_accrued: 0,
    income_tax_provisional_accrued: 0,
    next_30d_inflows: 0,
    next_30d_outflows: 0,
    runway_days: null,
    last_updated: new Date().toISOString(),
  }
}

function _parseRow(rows) {
  if (!rows || !rows.length) return null
  const raw = rows[0].value
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (err) {
    logger.warn('financePulseService: failed to parse kv row', { error: err.message })
    return null
  }
}

function _coerceShape(payload) {
  const base = _defaultShape()
  if (!payload || typeof payload !== 'object') return base
  const out = { ...base }
  for (const key of Object.keys(base)) {
    if (payload[key] !== undefined) out[key] = payload[key]
  }
  return out
}

/**
 * getFinanceNow - read the finance_now kv row.
 * Returns the shape; falls back to default-zero on absent / parse failure.
 */
async function getFinanceNow() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
    const parsed = _parseRow(rows)
    if (!parsed) return _defaultShape()
    return _coerceShape(parsed)
  } catch (err) {
    logger.warn('financePulseService.getFinanceNow: failed', { error: err.message })
    return _defaultShape()
  }
}

/**
 * setFinanceNow - merge-write the finance_now kv row.
 * Preserves keys not present in `payload`. Stamps last_updated unless
 * opts.preserveTimestamp is true.
 *
 * @param {object} payload - partial shape; only included keys are overwritten.
 * @param {object} [opts]
 * @param {boolean} [opts.preserveTimestamp=false] - skip last_updated bump.
 */
async function setFinanceNow(payload, opts = {}) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('financePulseService.setFinanceNow: payload must be an object')
    return null
  }
  try {
    const current = await getFinanceNow()
    const merged = { ...current, ...payload }
    if (!opts.preserveTimestamp) merged.last_updated = new Date().toISOString()
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${KV_KEY}, ${JSON.stringify(merged)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `
    return merged
  } catch (err) {
    logger.warn('financePulseService.setFinanceNow: failed', { error: err.message })
    return null
  }
}

/**
 * incrementBuffer - atomic integer-cents increment for accrual buffers.
 * Use for gst_owed_accrued and income_tax_provisional_accrued, where the
 * Right Thing is "add to whatever's there" not "overwrite". Single SQL
 * statement so concurrent posters do not lose increments.
 *
 * @param {string} key - top-level key inside the kv json (e.g. 'gst_owed_accrued').
 * @param {number} deltaCents - signed integer cents to add.
 */
async function incrementBuffer(key, deltaCents) {
  if (!key || typeof key !== 'string') {
    logger.warn('financePulseService.incrementBuffer: key required')
    return null
  }
  const delta = Number(deltaCents)
  if (!Number.isFinite(delta)) {
    logger.warn('financePulseService.incrementBuffer: deltaCents must be a number', { deltaCents })
    return null
  }
  try {
    const nowIso = new Date().toISOString()
    // Ensure row exists with default shape, then jsonb_set the incremented value.
    // Using to_jsonb on the computed sum keeps atomicity at the SQL layer.
    const [row] = await db`
      INSERT INTO kv_store (key, value)
      VALUES (${KV_KEY}, ${JSON.stringify(_defaultShape())})
      ON CONFLICT (key) DO UPDATE SET value = jsonb_set(
        jsonb_set(
          kv_store.value::jsonb,
          ${'{' + key + '}'},
          to_jsonb(COALESCE((kv_store.value::jsonb->>${key})::numeric, 0) + ${delta}),
          true
        ),
        '{last_updated}',
        to_jsonb(${nowIso}::text),
        true
      )
      RETURNING value
    `
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
      return _coerceShape(parsed)
    } catch (_) {
      return null
    }
  } catch (err) {
    logger.warn('financePulseService.incrementBuffer: failed', { key, error: err.message })
    return null
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function _formatDollars(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '$0.00'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n) / 100
  return `${sign}$${abs.toFixed(2)}`
}

function _formatAge(iso) {
  if (!iso) return 'never'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'unknown'
  const ageMs = Date.now() - ts
  if (ageMs < 0) return 'just now'
  const mins = Math.round(ageMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

/**
 * renderBlock - returns the <finance_pulse>...</finance_pulse> XML string.
 * Hard-capped at BLOCK_BYTE_CAP bytes; falls back to a minimal cash-only
 * block if the full render would exceed the cap.
 */
async function renderBlock() {
  const shape = await getFinanceNow()
  const runway = shape.runway_days === null || shape.runway_days === undefined
    ? 'n/a'
    : String(shape.runway_days)
  const lines = [
    '<finance_pulse>',
    `  cash_business: ${_formatDollars(shape.cash_business)}`,
    `  director_loan: ${_formatDollars(shape.director_loan_balance)}`,
    `  gst_accrued: ${_formatDollars(shape.gst_owed_accrued)}`,
    `  income_tax_accrued: ${_formatDollars(shape.income_tax_provisional_accrued)}`,
    `  next_30d_inflows: ${_formatDollars(shape.next_30d_inflows)}`,
    `  runway_days: ${runway}`,
    `  updated: ${_formatAge(shape.last_updated)}`,
    '</finance_pulse>',
  ]
  const block = lines.join('\n')
  if (Buffer.byteLength(block, 'utf8') <= BLOCK_BYTE_CAP) return block
  // Fallback: cash-only minimal block.
  const minimal = [
    '<finance_pulse>',
    `  cash_business: ${_formatDollars(shape.cash_business)}`,
    `  updated: ${_formatAge(shape.last_updated)}`,
    '</finance_pulse>',
  ].join('\n')
  return minimal
}

module.exports = {
  getFinanceNow,
  setFinanceNow,
  incrementBuffer,
  renderBlock,
}
