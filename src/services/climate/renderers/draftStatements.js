'use strict'

/**
 * draftStatements - clause-mapped draft climate statements, HTML (climate W6).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * (draftRows, clauseRows) -> HTML string
 *
 *   draftRows  cd_disclosure_drafts rows. Where several versions of a clause
 *              draft are supplied, only the highest version renders (earlier
 *              versions are caller-side history). status='gap' rows render as
 *              named gaps, never as silent omissions.
 *   clauseRows cd_clause_register rows; joined on clause_ref for the visible
 *              clause reference and requirement summary per section.
 *
 * CLIENT-FACING document: plain professional serif, NOT the Ecodia internal
 * EB-Garamond aesthetic (that aesthetic is Ecodia-from-Ecodia only; this is a
 * deliverable a CFO hands their auditor). Every draft section carries its
 * clause reference and the evidence-register citations behind it; the grounding
 * CHECK on cd_disclosure_drafts guarantees a non-gap row cites evidence, and
 * this renderer makes those citations visible rather than trusting the schema
 * silently.
 *
 * Pure and byte-deterministic: no clock (any dates shown arrive on input rows),
 * no DB, no randomness; rows are sorted before rendering. PDF conversion is the
 * caller's job (scripts/html-to-pdf.js).
 *
 * Schema note (carried from the W4 seed): cd_clause_register has no pillar
 * column; the pillar is parsed from the machine-greppable 'pillar=<value>'
 * prefix in applicability_notes.
 */

const { escapeHtml, sortRows, normaliseCell } = require('./renderCommon')

/** Section order for the rendered document; unknown pillars sort after, alphabetically. */
const PILLAR_ORDER = Object.freeze([
  'general_requirements',
  'governance',
  'strategy',
  'risk_management',
  'metrics_targets',
  'transition',
  'cross_cutting',
  'act_overlay',
])

const PILLAR_HEADINGS = Object.freeze({
  general_requirements: 'General requirements',
  governance: 'Governance',
  strategy: 'Strategy',
  risk_management: 'Risk management',
  metrics_targets: 'Metrics and targets',
  transition: 'Transition disclosures',
  cross_cutting: 'Cross-cutting requirements',
  act_overlay: 'Corporations Act overlays',
  unmapped: 'Other disclosures',
})

/** Parse 'pillar=<value>' from cd_clause_register.applicability_notes (W4 convention). */
function parsePillar(applicabilityNotes) {
  const match = /(?:^|\s)pillar=([a-z_]+)/.exec(applicabilityNotes || '')
  return match ? match[1] : 'unmapped'
}

function pillarRank(pillar) {
  const idx = PILLAR_ORDER.indexOf(pillar)
  return idx === -1 ? PILLAR_ORDER.length : idx
}

/** Keep only the highest version per clause_ref (ties broken by id for determinism). */
function latestVersions(draftRows) {
  const byClause = new Map()
  for (const row of sortRows(draftRows, ['clause_ref', 'version', 'id'])) {
    byClause.set(row.clause_ref, row) // sorted ascending; last write wins = highest version
  }
  return [...byClause.values()]
}

function renderCitations(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return ''
  const items = citations.map((id) => `<code>${escapeHtml(id)}</code>`).join(', ')
  return `<p class="citations">Evidence register: ${items}</p>`
}

function renderSection(draft, clause) {
  const clauseRef = escapeHtml(draft.clause_ref ?? '(unmapped clause)')
  const summary = clause ? `<p class="requirement">${escapeHtml(clause.requirement_summary ?? '')}</p>` : ''
  if (draft.status === 'gap') {
    return [
      `      <section class="clause gap">`,
      `        <h3><span class="clause-ref">${clauseRef}</span></h3>`,
      summary ? `        ${summary}` : null,
      `        <p class="gap-label">Identified gap</p>`,
      `        <p>${escapeHtml(draft.draft_text ?? '')}</p>`,
      `      </section>`,
    ]
      .filter((l) => l !== null)
      .join('\n')
  }
  const paragraphs = String(draft.draft_text ?? '')
    .split(/\r?\n\r?\n/)
    .map((p) => `        <p>${escapeHtml(p)}</p>`)
    .join('\n')
  const statusBadge = draft.status && draft.status !== 'final' ? ` <span class="status">[${escapeHtml(draft.status)}]</span>` : ''
  return [
    `      <section class="clause">`,
    `        <h3><span class="clause-ref">${clauseRef}</span>${statusBadge}</h3>`,
    summary ? `        ${summary}` : null,
    paragraphs,
    `        ${renderCitations(draft.evidence_citations)}`,
    `      </section>`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}

/**
 * draftStatements(draftRows, clauseRows) -> complete HTML document string.
 */
function draftStatements(draftRows, clauseRows) {
  if (!Array.isArray(draftRows)) throw new TypeError('draftStatements expects an array of cd_disclosure_drafts rows')
  if (!Array.isArray(clauseRows)) throw new TypeError('draftStatements expects an array of cd_clause_register rows')

  const clauseByRef = new Map()
  for (const clause of sortRows(clauseRows, ['clause_ref', 'id'])) {
    if (!clauseByRef.has(clause.clause_ref)) clauseByRef.set(clause.clause_ref, clause)
  }

  const drafts = latestVersions(draftRows.map((r) => normaliseCell(r)))
  const annotated = drafts.map((draft) => {
    const clause = clauseByRef.get(draft.clause_ref) || null
    return { draft, clause, pillar: clause ? parsePillar(clause.applicability_notes) : 'unmapped' }
  })
  const ordered = annotated.sort((a, b) => {
    const rank = pillarRank(a.pillar) - pillarRank(b.pillar)
    if (rank !== 0) return rank
    if (a.pillar !== b.pillar) return a.pillar < b.pillar ? -1 : 1
    const refA = String(a.draft.clause_ref ?? '')
    const refB = String(b.draft.clause_ref ?? '')
    return refA < refB ? -1 : refA > refB ? 1 : 0
  })

  const gapCount = drafts.filter((d) => d.status === 'gap').length

  const body = []
  let currentPillar = null
  for (const { draft, clause, pillar } of ordered) {
    if (pillar !== currentPillar) {
      if (currentPillar !== null) body.push('    </div>')
      body.push(`    <div class="pillar">`)
      body.push(`      <h2>${escapeHtml(PILLAR_HEADINGS[pillar] || pillar)}</h2>`)
      currentPillar = pillar
    }
    body.push(renderSection(draft, clause))
  }
  if (currentPillar !== null) body.push('    </div>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Draft climate-related disclosures</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #ffffff; max-width: 760px; margin: 0 auto; padding: 48px 32px; line-height: 1.55; }
  h1 { font-size: 26px; font-weight: normal; border-bottom: 1px solid #999; padding-bottom: 12px; }
  h2 { font-size: 20px; font-weight: normal; margin-top: 40px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  h3 { font-size: 15px; margin-bottom: 4px; }
  .clause-ref { font-family: 'Courier New', monospace; font-size: 13px; background: #f3f3f3; padding: 1px 6px; border: 1px solid #ddd; }
  .status { font-size: 12px; color: #8a6d00; }
  .requirement { font-size: 13px; color: #555; font-style: italic; margin-top: 0; }
  .citations { font-size: 12px; color: #555; border-left: 3px solid #ccc; padding-left: 10px; }
  .citations code { font-size: 11px; }
  .clause { margin-bottom: 28px; }
  .clause.gap { border: 1px solid #c4a000; background: #fdf9ec; padding: 6px 14px; }
  .gap-label { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8a6d00; margin: 2px 0; }
  .preamble { font-size: 13px; color: #444; }
  footer { margin-top: 48px; font-size: 12px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; }
</style>
</head>
<body>
  <h1>Draft climate-related disclosures</h1>
  <p class="preamble">Prepared against AASB S2 Climate-related Disclosures. Each section carries its clause reference; every factual statement is grounded in the evidence register rows cited beneath it. Sections marked as identified gaps name disclosure requirements for which evidence is not yet held; they are work items, not assertions. Draft for entity review; not an assurance opinion.</p>
  <p class="preamble">Sections: ${ordered.length}. Identified gaps: ${gapCount}.</p>
${body.join('\n')}
  <footer>Draft prepared from the engagement evidence register. Calculation lineage and emission-factor sources are set out in the accompanying methodology memo; register integrity is verifiable against the published chain head.</footer>
</body>
</html>
`
}

module.exports = { draftStatements, PILLAR_ORDER, parsePillar }
