'use strict'

/**
 * Climate-disclosure W6 renderers - public surface.
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * Pure renderers over caller-fetched cd_* rows (the W2/W3 convention): no DB
 * access, no clock, no randomness, no shelling out. Byte-reproducibility is the
 * verify gate: the same input rows produce byte-identical strings, asserted in
 * __tests__ by double-rendering and comparing sha256. PDF conversion of the
 * markdown/HTML outputs is the CALLER's job (scripts/html-to-pdf.js); library
 * code never shells out.
 */

const { registerExport, REGISTER_COLUMNS } = require('./registerExport')
const { methodologyMemo, CALCULATOR_METHODS } = require('./methodologyMemo')
const { draftStatements, PILLAR_ORDER, parsePillar } = require('./draftStatements')
const { coverageReport } = require('./coverageReport')
const { packManifest, MANIFEST_FORMAT } = require('./packManifest')
const renderCommon = require('./renderCommon')

module.exports = {
  registerExport,
  REGISTER_COLUMNS,
  methodologyMemo,
  CALCULATOR_METHODS,
  draftStatements,
  PILLAR_ORDER,
  parsePillar,
  coverageReport,
  packManifest,
  MANIFEST_FORMAT,
  renderCommon,
}
