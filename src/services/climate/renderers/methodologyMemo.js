'use strict'

/**
 * methodologyMemo - templated methodology memo, markdown (climate-disclosure W6).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * (calcRuns, factorMeta, elections) -> markdown string
 *
 *   calcRuns   cd_calc_runs rows. Every figure in the memo is traced to its calc
 *              run id, inputs hash, calculator code SHA and factor vintage; a
 *              superseded run renders in the lineage appendix, never in the
 *              current-figures table.
 *   factorMeta cd_factors rows actually consumed (factor_set, vintage, category,
 *              unit, value, effective dates, source_url).
 *   elections  per-facility method elections, [{ facility, election, basis? }]
 *              or { default?, perFacility? } (the W3 methodElection shape).
 *
 * Pure and byte-deterministic: rows are sorted before rendering so caller fetch
 * order never leaks into the bytes; no clock, no DB, no randomness. The memo is
 * markdown; PDF mechanics live with the caller (scripts/html-to-pdf.js), never
 * in here.
 */

const { sortRows, mdCell, normaliseCell } = require('./renderCommon')

/** Human method descriptions keyed by calculator name (cd_calc_runs.calculator). */
const CALCULATOR_METHODS = Object.freeze({
  fuelCombustionS1:
    'Scope 1, fuel combustion (stationary and transport). E (t CO2e, per gas) = Q x EC x EF_gas / 1000 per NGA Factors "Using emission factors"; scope 1 total is the sum over CO2, CH4 and N2O. Exact scaled-integer arithmetic; rounding once at the output boundary into micro-tonnes CO2e.',
  refrigerantsS1:
    'Scope 1, fugitive refrigerant emissions. E (t CO2e) = leakage (kg) x GWP / 1000 against the published GWP table for the elected factor set and vintage. Exact scaled-integer arithmetic; rounding once at the output boundary.',
  electricityS2Location:
    'Scope 2, location-based. E (t CO2e) = Q (kWh) x state grid emission factor (kg CO2e/kWh) / 1000 per the NGA state factor table for the vintage. Exact scaled-integer arithmetic; rounding once at the output boundary.',
  electricityS2Market:
    'Scope 2, market-based. Residual consumption (purchased kWh net of surrendered certificates) x residual mix factor, per the NGA market-based method. Exact scaled-integer arithmetic; rounding once at the output boundary.',
})

function electionRows(elections) {
  if (!elections) return [{ facility: '(all facilities)', election: 'GHG_PROTOCOL', basis: 'default' }]
  if (Array.isArray(elections)) {
    return sortRows(
      elections.map((e) => ({ facility: e.facility ?? '(all facilities)', election: e.election, basis: e.basis ?? '' })),
      ['facility', 'election']
    )
  }
  const out = []
  out.push({ facility: '(all facilities)', election: elections.default || 'GHG_PROTOCOL', basis: elections.default ? 'engagement default' : 'default' })
  for (const facility of Object.keys(elections.perFacility || {}).sort()) {
    out.push({ facility, election: elections.perFacility[facility], basis: 'per-facility election' })
  }
  return out
}

/**
 * methodologyMemo(calcRuns, factorMeta, elections) -> markdown string.
 */
function methodologyMemo(calcRuns, factorMeta, elections) {
  if (!Array.isArray(calcRuns)) throw new TypeError('methodologyMemo expects an array of cd_calc_runs rows')
  if (!Array.isArray(factorMeta)) throw new TypeError('methodologyMemo expects an array of cd_factors rows as factorMeta')

  const runs = sortRows(calcRuns.map((r) => normaliseCell(r)), ['calculator', 'run_at', 'id'])
  const current = runs.filter((r) => r.superseded_by == null)
  const superseded = runs.filter((r) => r.superseded_by != null)
  const factors = sortRows(factorMeta.map((f) => normaliseCell(f)), ['factor_set', 'vintage', 'category', 'effective_from', 'id'])
  const vintages = [...new Set(runs.map((r) => r.factor_vintage).filter((v) => v != null))].sort()

  const lines = []
  lines.push('# Methodology memo')
  lines.push('')
  lines.push('Every disclosed figure in this memo resolves to an immutable calculation run recording its inputs hash, calculator code SHA, factor vintage and the evidence-register rows it consumed. Recalculation never rewrites a run; a factor-vintage change produces new runs with the old runs marked superseded (appendix B). All arithmetic on disclosed figures is exact scaled-integer; rounding occurs exactly once per figure, at the output boundary, into micro-tonnes CO2e.')
  lines.push('')
  lines.push(`Factor vintages in effect: ${vintages.length ? vintages.join(', ') : '(none)'}.`)
  lines.push('')

  lines.push('## 1. Method elections')
  lines.push('')
  lines.push('Method election is recorded per facility on every calculation run (GHG Protocol default; NGER Determination methods where elected for NGER-covered facilities per AASB S2025-1, Dec 2025).')
  lines.push('')
  lines.push('| Facility | Election | Basis |')
  lines.push('| --- | --- | --- |')
  for (const e of electionRows(elections)) {
    lines.push(`| ${mdCell(e.facility)} | ${mdCell(e.election)} | ${mdCell(e.basis)} |`)
  }
  lines.push('')

  lines.push('## 2. Calculation methods applied')
  lines.push('')
  const calculatorsUsed = [...new Set(runs.map((r) => r.calculator).filter((c) => c != null))].sort()
  if (calculatorsUsed.length === 0) lines.push('(no calculation runs supplied)')
  for (const calc of calculatorsUsed) {
    lines.push(`### ${calc}`)
    lines.push('')
    lines.push(CALCULATOR_METHODS[calc] || 'Method description not registered for this calculator; see the calculator source header.')
    lines.push('')
  }

  lines.push('## 3. Current figures and their lineage')
  lines.push('')
  lines.push('| Calculator | t CO2e | Calc run id | Factor vintage | Inputs hash | Code SHA | Evidence rows | Run at |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of current) {
    const evidenceCount = Array.isArray(r.evidence_ids) ? r.evidence_ids.length : 0
    lines.push(
      `| ${mdCell(r.calculator)} | ${mdCell(r.output_tco2e)} | ${mdCell(r.id)} | ${mdCell(r.factor_vintage)} | ${mdCell(r.inputs_hash)} | ${mdCell(r.code_sha)} | ${evidenceCount} | ${mdCell(r.run_at)} |`
    )
  }
  if (current.length === 0) lines.push('| (none) |  |  |  |  |  |  |  |')
  lines.push('')
  for (const r of current) {
    lines.push(
      `- ${r.output_tco2e} t CO2e (${r.calculator}) is the output of calc run \`${r.id}\` against factor vintage ${r.factor_vintage}, inputs hash \`${r.inputs_hash}\`, consuming ${Array.isArray(r.evidence_ids) ? r.evidence_ids.length : 0} evidence-register row(s).`
    )
  }
  lines.push('')

  lines.push('## Appendix A. Emission factors consumed')
  lines.push('')
  lines.push('| Factor set | Vintage | Category | Value | Unit | Effective from | Effective to | Source |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const f of factors) {
    lines.push(
      `| ${mdCell(f.factor_set)} | ${mdCell(f.vintage)} | ${mdCell(f.category)} | ${mdCell(f.value)} | ${mdCell(f.unit)} | ${mdCell(f.effective_from)} | ${mdCell(f.effective_to)} | ${mdCell(f.source_url)} |`
    )
  }
  if (factors.length === 0) lines.push('| (none) |  |  |  |  |  |  |  |')
  lines.push('')

  lines.push('## Appendix B. Superseded runs (lineage)')
  lines.push('')
  if (superseded.length === 0) {
    lines.push('No superseded runs: no factor-vintage bump or recalculation has occurred over the supplied runs.')
  } else {
    lines.push('| Calc run id | Calculator | t CO2e | Factor vintage | Superseded by | Run at |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const r of superseded) {
      lines.push(
        `| ${mdCell(r.id)} | ${mdCell(r.calculator)} | ${mdCell(r.output_tco2e)} | ${mdCell(r.factor_vintage)} | ${mdCell(r.superseded_by)} | ${mdCell(r.run_at)} |`
      )
    }
  }
  lines.push('')

  return lines.join('\n')
}

module.exports = { methodologyMemo, CALCULATOR_METHODS }
