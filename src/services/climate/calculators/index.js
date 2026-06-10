'use strict'

/**
 * Climate-disclosure W3 calculation engine - public surface.
 *
 * Four pure calculators, each (activityRows, factorVintage, methodElection) ->
 * { tco2e, breakdown, evidenceIds, inputsHash }, where factorVintage is
 * { vintage, factors: cd_factors rows[] } (see calcCommon.js for the spec-defect
 * note on why factors are an argument). The caller persists results to
 * cd_calc_runs; nothing in here touches a database, a clock, or randomness.
 */

const { fuelCombustionS1 } = require('./fuelCombustionS1')
const { refrigerantsS1 } = require('./refrigerantsS1')
const { electricityS2Location } = require('./electricityS2Location')
const { electricityS2Market } = require('./electricityS2Market')
const factorLoader = require('./factorLoader')
const microUnits = require('./microUnits')
const inputsHash = require('./inputsHash')
const calcCommon = require('./calcCommon')

module.exports = {
  fuelCombustionS1,
  refrigerantsS1,
  electricityS2Location,
  electricityS2Market,
  factorLoader,
  microUnits,
  inputsHash,
  calcCommon,
}
