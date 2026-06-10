'use strict'

/**
 * climate ingest surface (climate-disclosure W5).
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 *
 * Pure libraries over caller-supplied data: no DB, no network, no clock. The live
 * pipeline (Gmail service-account fetch -> evidence bucket -> INSERT) wires these
 * together at engagement zero; everything here is testable without any of it.
 */

const { ingestEmail } = require('./emailIngest')
const {
  classifyDocument,
  isIsoFullDate,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_TEXT_BYTES,
  DOCUMENT_TYPES,
  SCOPE_CATEGORIES,
  FAILURE_CODES,
} = require('./classify')
const {
  buildEvidenceRow,
  confirmEvidence,
  SOURCE_CHANNELS,
  CONFIRMATION_STATUSES,
} = require('./commitEvidence')
const { ingestWorkbook } = require('./workbookIngest')

module.exports = {
  ingestEmail,
  classifyDocument,
  isIsoFullDate,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_TEXT_BYTES,
  DOCUMENT_TYPES,
  SCOPE_CATEGORIES,
  FAILURE_CODES,
  buildEvidenceRow,
  confirmEvidence,
  SOURCE_CHANNELS,
  CONFIRMATION_STATUSES,
  ingestWorkbook,
}
