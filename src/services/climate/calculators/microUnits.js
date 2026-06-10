'use strict'

/**
 * microUnits - exact fixed-point decimal arithmetic for disclosed figures (climate W3).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W3)
 *
 * HARD CONSTRAINT: no floating-point arithmetic ever touches a disclosed figure.
 * Every quantity and factor is parsed from its decimal-string form into an exact
 * scaled BigInt ({ units, scale } meaning units x 10^-scale), all multiplication
 * and addition stays exact (BigInt never overflows, scales only grow), and rounding
 * happens exactly once: at the output boundary, half-up, into integer micro-tonnes
 * CO2e (1 t = 1,000,000 micro-t). Display strings are rendered from the micro
 * integer, never via Number.
 *
 * No DB access, no Date.now, no randomness. Zero external dependencies.
 */

/** Tonnes are disclosed at micro precision: 1 tonne = 10^6 micro-tonnes. */
const MICRO_SCALE = 6

/** Decimal-string grammar we accept. Exponents are refused: they are a float tell. */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/

/**
 * parseDecimal(value) -> { units: BigInt, scale: number }
 *
 * Accepts a decimal string ('38.6'), a safe integer, or a BigInt. Anything else
 * (floats with exponents, NaN, Infinity, non-integer Numbers) throws: a fractional
 * Number has already been through IEEE-754 and cannot be trusted on a disclosed
 * figure, so callers must supply fractional values as strings.
 */
function parseDecimal(value) {
  if (typeof value === 'bigint') return { units: value, scale: 0 }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `microUnits.parseDecimal: non-integer Number ${value} refused; pass fractional values as decimal strings`
      )
    }
    return { units: BigInt(value), scale: 0 }
  }
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) {
    throw new TypeError(`microUnits.parseDecimal: not a plain decimal: ${String(value)}`)
  }
  const negative = value.startsWith('-')
  const body = negative ? value.slice(1) : value
  const [intPart, fracPart = ''] = body.split('.')
  const units = BigInt(intPart + fracPart)
  return { units: negative ? -units : units, scale: fracPart.length }
}

/** mul(a, b) -> exact product. Scales add, digits multiply, nothing is lost. */
function mul(a, b) {
  return { units: a.units * b.units, scale: a.scale + b.scale }
}

/** add(a, b) -> exact sum after aligning to the larger scale. */
function add(a, b) {
  if (a.scale === b.scale) return { units: a.units + b.units, scale: a.scale }
  if (a.scale < b.scale) {
    return { units: a.units * 10n ** BigInt(b.scale - a.scale) + b.units, scale: b.scale }
  }
  return { units: a.units + b.units * 10n ** BigInt(a.scale - b.scale), scale: a.scale }
}

/** sub(a, b) -> exact difference. */
function sub(a, b) {
  return add(a, { units: -b.units, scale: b.scale })
}

/** Exact division by a power of ten: just a scale shift (used for kg -> t). */
function shiftScale(a, by) {
  if (!Number.isInteger(by) || by < 0) {
    throw new TypeError('microUnits.shiftScale: shift must be a non-negative integer')
  }
  return { units: a.units, scale: a.scale + by }
}

const ZERO = Object.freeze({ units: 0n, scale: 0 })

/** Comparison helpers (exact, scale-aligned). */
function compare(a, b) {
  const d = sub(a, b)
  if (d.units === 0n) return 0
  return d.units > 0n ? 1 : -1
}

function isNegative(a) {
  return a.units < 0n
}

/**
 * roundToScale(a, targetScale) -> BigInt of a expressed at targetScale,
 * rounded HALF-UP (half away from zero). This is the single rounding primitive;
 * everything upstream of it is exact.
 */
function roundToScale(a, targetScale) {
  if (a.scale <= targetScale) {
    return a.units * 10n ** BigInt(targetScale - a.scale)
  }
  const drop = 10n ** BigInt(a.scale - targetScale)
  const q = a.units / drop
  const r = a.units % drop
  if (r === 0n) return q
  const doubled = (r < 0n ? -r : r) * 2n
  if (doubled >= drop) return a.units < 0n ? q - 1n : q + 1n
  return q
}

/** toMicro(decimal-in-tonnes) -> BigInt micro-tonnes, the disclosed-figure boundary. */
function toMicro(a) {
  return roundToScale(a, MICRO_SCALE)
}

/**
 * microToDisplay(micro, decimals = 6) -> decimal string for human/DB surfaces.
 * decimals <= 6; reducing decimals re-rounds half-up from the micro integer.
 * This is string assembly over BigInt: no Number is ever constructed.
 */
function microToDisplay(micro, decimals = MICRO_SCALE) {
  if (typeof micro !== 'bigint') throw new TypeError('microToDisplay expects a BigInt')
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MICRO_SCALE) {
    throw new TypeError(`microToDisplay: decimals must be an integer 0..${MICRO_SCALE}`)
  }
  const rounded = roundToScale({ units: micro, scale: MICRO_SCALE }, decimals)
  const negative = rounded < 0n
  const abs = (negative ? -rounded : rounded).toString().padStart(decimals + 1, '0')
  const intPart = decimals === 0 ? abs : abs.slice(0, -decimals)
  const fracPart = decimals === 0 ? '' : abs.slice(-decimals)
  return `${negative ? '-' : ''}${intPart}${fracPart ? '.' + fracPart : ''}`
}

module.exports = {
  MICRO_SCALE,
  ZERO,
  parseDecimal,
  mul,
  add,
  sub,
  shiftScale,
  compare,
  isNegative,
  roundToScale,
  toMicro,
  microToDisplay,
}
