'use strict'

/**
 * coverageReport - evidence coverage + gap report, markdown (climate W6).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * (coverageRows, gapRows) -> markdown string
 *
 *   coverageRows cd_coverage view rows (010_cd_coverage_view.sql): one row per
 *                expected document per cadence period. Columns mirrored here:
 *                engagement_id, expected_document_id, facility, document_type,
 *                cadence, period_start, period_end, due_by, evidence_id, covered.
 *                NOTE the view exposes no 'gap' column or status: a coverage gap
 *                is derived as covered=false, and overdue-ness is NOT derivable
 *                inside a pure renderer (it needs a clock); callers wanting an
 *                as-at overdue cut pass options.asOf (ISO date string) and it is
 *                printed and applied verbatim.
 *   gapRows      cd_disclosure_drafts rows with status='gap': the DISCLOSURE
 *                gaps (clause-level requirements with no evidence held), as
 *                distinct from the document-cadence gaps in coverageRows.
 *
 * Pure and byte-deterministic: no clock reads (asOf, when wanted, is an
 * input); rows sorted before rendering; integer-arithmetic percentage.
 */

const { sortRows, mdCell, percentText, normaliseCell } = require('./renderCommon')

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * coverageReport(coverageRows, gapRows, options?) -> markdown string.
 * options.asOf: optional 'YYYY-MM-DD' string; enables the overdue column,
 * compared lexically against due_by (both ISO dates, so lexical = chronological).
 */
function coverageReport(coverageRows, gapRows, options = {}) {
  if (!Array.isArray(coverageRows)) throw new TypeError('coverageReport expects an array of cd_coverage rows')
  if (!Array.isArray(gapRows)) throw new TypeError('coverageReport expects an array of cd_disclosure_drafts gap rows')
  const asOf = options.asOf ?? null
  if (asOf !== null && !ISO_DATE_RE.test(String(asOf))) {
    throw new TypeError(`coverageReport: options.asOf must be 'YYYY-MM-DD' (timestamps are inputs, never the clock), got ${String(asOf)}`)
  }

  const rows = sortRows(coverageRows.map((r) => normaliseCell(r)), [
    'facility',
    'document_type',
    'period_start',
    'expected_document_id',
  ])
  const covered = rows.filter((r) => r.covered === true)
  const uncovered = rows.filter((r) => r.covered !== true)
  const gaps = sortRows(gapRows.map((r) => normaliseCell(r)), ['clause_ref', 'version', 'id'])

  const lines = []
  lines.push('# Evidence coverage and gap report')
  lines.push('')
  lines.push(
    'Coverage is read from the cd_coverage projection (expected documents joined against committed evidence per cadence period), never recomputed in prose. A missing period is a named gap below, not a silent omission.'
  )
  if (asOf) {
    lines.push('')
    lines.push(`Overdue status assessed as at ${asOf} (supplied by the caller; this report contains no clock reads).`)
  }
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push(`- Expected document-periods: ${rows.length}`)
  lines.push(`- Covered: ${covered.length} (${percentText(covered.length, rows.length)}%)`)
  lines.push(`- Not covered: ${uncovered.length}`)
  if (asOf) {
    const overdue = uncovered.filter((r) => r.due_by != null && String(r.due_by) < asOf)
    lines.push(`- Overdue as at ${asOf}: ${overdue.length}`)
  }
  lines.push(`- Disclosure-level gaps (clause register): ${gaps.length}`)
  lines.push('')

  lines.push('## Document coverage by period')
  lines.push('')
  const header = ['Facility', 'Document type', 'Cadence', 'Period', 'Due by', 'Covered', 'Evidence id']
  if (asOf) header.push(`Overdue at ${asOf}`)
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`|${' --- |'.repeat(header.length)}`)
  for (const r of rows) {
    const cells = [
      mdCell(r.facility),
      mdCell(r.document_type),
      mdCell(r.cadence),
      `${mdCell(r.period_start)} to ${mdCell(r.period_end)}`,
      mdCell(r.due_by),
      r.covered === true ? 'yes' : 'NO',
      mdCell(r.evidence_id),
    ]
    if (asOf) {
      cells.push(r.covered !== true && r.due_by != null && String(r.due_by) < asOf ? 'OVERDUE' : '')
    }
    lines.push(`| ${cells.join(' | ')} |`)
  }
  if (rows.length === 0) lines.push(`| (no expected documents configured) |${' |'.repeat(header.length - 1)}`)
  lines.push('')

  lines.push('## Named coverage gaps')
  lines.push('')
  if (uncovered.length === 0) {
    lines.push('None: every expected document-period has at least one committed evidence row.')
  } else {
    for (const r of uncovered) {
      lines.push(
        `- ${mdCell(r.facility) || '(no facility)'} / ${mdCell(r.document_type)}: period ${mdCell(r.period_start)} to ${mdCell(r.period_end)} has no committed evidence (due by ${mdCell(r.due_by)}).`
      )
    }
  }
  lines.push('')

  lines.push('## Disclosure-level gaps (clause register)')
  lines.push('')
  if (gaps.length === 0) {
    lines.push('None recorded: no cd_disclosure_drafts rows currently carry status=gap.')
  } else {
    lines.push('| Clause | Gap description | Draft id |')
    lines.push('| --- | --- | --- |')
    for (const g of gaps) {
      lines.push(`| ${mdCell(g.clause_ref)} | ${mdCell(g.draft_text)} | ${mdCell(g.id)} |`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

module.exports = { coverageReport }
