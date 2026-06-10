'use strict'

/**
 * Determinism (climate W3 verify gate): the same inputs always produce an
 * identical result object and an identical inputsHash. No clock, no randomness,
 * no iteration-order sensitivity.
 */

const fixtures = require('./fixtures')
const calculators = require('../index')

describe.each(fixtures)('determinism: $name', (fixture) => {
  const run = (factorVintage = fixture.factorVintage) =>
    calculators[fixture.calculator](fixture.activityRows, factorVintage, fixture.methodElection)

  test('same input twice -> identical output and identical inputsHash', () => {
    const a = run()
    const b = run()
    expect(b).toEqual(a)
    expect(b.inputsHash).toBe(a.inputsHash)
    expect(b.tco2e).toBe(a.tco2e)
  })

  test('factor row order does not change the result or the hash', () => {
    const a = run()
    const reversed = {
      vintage: fixture.factorVintage.vintage,
      factors: [...fixture.factorVintage.factors].reverse(),
    }
    const b = run(reversed)
    expect(b.tco2e).toBe(a.tco2e)
    expect(b.breakdown.totals.tco2e_micro).toBe(a.breakdown.totals.tco2e_micro)
    expect(b.inputsHash).toBe(a.inputsHash)
  })

  test('activity-row key order does not change the inputsHash (canonicalisation)', () => {
    const a = run()
    const shuffledRows = fixture.activityRows.map((row) => {
      const out = {}
      for (const key of Object.keys(row).reverse()) out[key] = row[key]
      return out
    })
    const b = calculators[fixture.calculator](shuffledRows, fixture.factorVintage, fixture.methodElection)
    expect(b.inputsHash).toBe(a.inputsHash)
    expect(b.tco2e).toBe(a.tco2e)
  })
})
