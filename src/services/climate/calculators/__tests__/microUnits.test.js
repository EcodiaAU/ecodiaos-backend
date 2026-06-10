'use strict'

/**
 * Micro-unit boundary tests (climate W3 verify gate): integer micro-tonne
 * arithmetic end to end, rounding ONLY at the output/display boundary, floats
 * refused on sight.
 */

const {
  parseDecimal,
  mul,
  add,
  sub,
  shiftScale,
  toMicro,
  microToDisplay,
  roundToScale,
} = require('../microUnits')
const { fuelCombustionS1 } = require('../fuelCombustionS1')

describe('parseDecimal', () => {
  test('parses decimal strings exactly', () => {
    expect(parseDecimal('38.6')).toEqual({ units: 386n, scale: 1 })
    expect(parseDecimal('0.18195')).toEqual({ units: 18195n, scale: 5 })
    expect(parseDecimal('-2.50')).toEqual({ units: -250n, scale: 2 })
    expect(parseDecimal(700)).toEqual({ units: 700n, scale: 0 })
    expect(parseDecimal(42n)).toEqual({ units: 42n, scale: 0 })
  })

  test('refuses fractional Numbers (IEEE-754 already corrupted them)', () => {
    expect(() => parseDecimal(0.1)).toThrow(/non-integer Number/)
    expect(() => parseDecimal(38.6)).toThrow(/non-integer Number/)
    expect(() => parseDecimal(NaN)).toThrow()
    expect(() => parseDecimal(Infinity)).toThrow()
  })

  test('refuses exponent notation and garbage', () => {
    expect(() => parseDecimal('1e3')).toThrow(/not a plain decimal/)
    expect(() => parseDecimal('0.56000000000000005e0')).toThrow(/not a plain decimal/)
    expect(() => parseDecimal('abc')).toThrow(/not a plain decimal/)
    expect(() => parseDecimal('')).toThrow(/not a plain decimal/)
    expect(() => parseDecimal(null)).toThrow(/not a plain decimal/)
  })
})

describe('exact arithmetic (the float-poison cases)', () => {
  test('0.1 + 0.2 === 0.3 exactly (the canonical float failure)', () => {
    const sum = add(parseDecimal('0.1'), parseDecimal('0.2'))
    expect(sum).toEqual({ units: 3n, scale: 1 })
  })

  test('multiplication is exact beyond 2^53', () => {
    // 11,300,000 kWh x 0.81805 = 9,243,965 exactly (NGA 2025 Example 2 interior)
    const product = mul(parseDecimal('11300000'), sub(parseDecimal('1'), parseDecimal('0.18195')))
    expect(product.units).toBe(924396500000n)
    expect(product.scale).toBe(5)
    // and a deliberately huge case Numbers cannot represent
    const big = mul(parseDecimal('123456789123456789'), parseDecimal('987654321987654321'))
    expect(big.units).toBe(123456789123456789n * 987654321987654321n)
  })

  test('shiftScale divides by powers of ten exactly', () => {
    const kg = parseDecimal('1896804') // kg (NGA Example 6 scope 1 total)
    expect(toMicro(shiftScale(kg, 3))).toBe(1896804000n) // 1,896.804 t at micro scale
  })
})

describe('rounding happens only at the boundary, half-up', () => {
  test('roundToScale half-up at the micro boundary', () => {
    expect(toMicro(parseDecimal('0.0000005'))).toBe(1n) // 0.5 micro rounds up
    expect(toMicro(parseDecimal('0.0000004'))).toBe(0n)
    expect(toMicro(parseDecimal('-0.0000005'))).toBe(-1n) // half away from zero
    expect(toMicro(parseDecimal('1.9999995'))).toBe(2000000n)
  })

  test('sub-micro row contributions survive until the total (no per-row rounding)', () => {
    // Two rows of 0.0005 GJ x 1 kg CO2e/GJ = 0.0000005 t each: exactly 1 micro
    // combined. Rounding per row first would double it to 2 micro.
    const factors = ['ef_co2', 'ef_ch4', 'ef_n2o'].map((c, i) => ({
      id: `t-${c}`,
      factor_set: 'NGA',
      vintage: 'test',
      category: `fuel.test_fuel.stationary.${c}`,
      unit: 'kg CO2-e/GJ',
      value: c === 'ef_co2' ? '1' : '0',
      effective_from: null,
      effective_to: null,
      source_url: 'test://synthetic-arithmetic-boundary-case',
    }))
    const rows = [1, 2].map((i) => ({
      evidence_id: `ev-${i}`,
      facility: 'Boundary',
      fuel_key: 'test_fuel',
      segment: 'stationary',
      quantity: '0.0005',
      unit: 'GJ',
    }))
    const result = fuelCombustionS1(rows, { vintage: 'test', factors }, undefined)
    expect(result.breakdown.totals.tco2e_micro).toBe('1')
    expect(result.tco2e).toBe('0.000001')
    // each row, displayed alone, half-up rounds its 0.5 micro to 1: the totals
    // deliberately do NOT equal the sum of display-rounded rows
    expect(result.breakdown.rows.map((r) => r.tco2e_micro)).toEqual(['1', '1'])
  })

  test('roundToScale never rounds when scaling up (exact)', () => {
    expect(roundToScale(parseDecimal('1.5'), 3)).toBe(1500n)
  })
})

describe('microToDisplay (the display boundary)', () => {
  test('renders micro BigInt to decimal strings without Number', () => {
    expect(microToDisplay(1896804000n)).toBe('1896.804000')
    expect(microToDisplay(202020n)).toBe('0.202020')
    expect(microToDisplay(-1500000n)).toBe('-1.500000')
    expect(microToDisplay(0n)).toBe('0.000000')
  })

  test('reducing decimals re-rounds half-up from the micro integer', () => {
    expect(microToDisplay(2364250000n, 1)).toBe('2364.3') // published Example 6 combined
    expect(microToDisplay(33817460000n, 0)).toBe('33817') // published Example 7 combined
    expect(microToDisplay(202020n, 4)).toBe('0.2020') // published Example 8
    expect(microToDisplay(7768447800n, 1)).toBe('7768.4') // published Example 2
  })

  test('refuses non-BigInt and out-of-range decimals', () => {
    expect(() => microToDisplay(123)).toThrow(/BigInt/)
    expect(() => microToDisplay(1n, 7)).toThrow(/0\.\.6/)
  })
})
