'use strict'

/**
 * classify - document metadata + extracted text -> classification (climate-disclosure W5).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 * Hardened 2026-06-10 against the 7 document-zoo pass-1 contract defects
 * (climate-testing/zoo/results-pass1-2026-06-10.md, "Contract verification").
 *
 * classifyDocument(docMeta, extractedText, classifierFn, options) emits:
 *   { document_type, facility, period_start, period_end, scope_category,
 *     is_evidence, confidence, staged_for_review, failure_code, reason }
 *
 * Contract guarantees (the zoo hardening):
 *   - document_type is validated against the closed DOCUMENT_TYPES vocabulary;
 *     anything else stages with failure_code 'unknown_document_type'. The DB-side
 *     twin is climate-migrations/012_cd_evidence_document_type_check.sql (the same
 *     list minus 'not_evidence', which must never reach cd_evidence_items).
 *   - period_start/period_end are ISO 8601 full-dates (yyyy-mm-dd, a REAL calendar
 *     date) or null; anything else stages with 'invalid_period'. The 002 columns
 *     are `date`; prose periods must never survive to insert time.
 *   - scope_category is null or one of SCOPE_CATEGORIES (scope1|scope2|scope3|none);
 *     anything else stages with 'invalid_scope'.
 *   - is_evidence is STRUCTURAL, computed here, never trusted from the classifier:
 *     false exactly when document_type is the 'not_evidence' refusal type (or when
 *     the result is staged without a usable document_type). Downstream commit layers
 *     (commitEvidence.buildEvidenceRow, the connector's cd_evidence_commit) refuse
 *     is_evidence:false rows structurally; no consumer string-matches the sentinel.
 *   - object/array field values stage with 'malformed_field'; they are never
 *     stringified to '[object Object]'.
 *   - every staged result carries a machine-readable failure_code from FAILURE_CODES
 *     alongside the prose reason; auto results carry failure_code null.
 *   - the confidence threshold is a CLOSED boundary: confidence <= threshold stages
 *     ('low_confidence'). Exactly-threshold does NOT auto-commit, so a classifier
 *     emitting a default 0.8 cannot auto-commit everything. Auto-commit requires
 *     confidence STRICTLY ABOVE the threshold.
 *
 * The LLM call is INJECTED as classifierFn so tests stub it and this module stays pure:
 * no network, no DB, no clock. classifierFn receives { docMeta, extractedText } and may
 * be sync or async; classifyDocument always returns a Promise.
 *
 * Weird input NEVER throws: it returns staged_for_review with a failure_code + reason.
 * The only throw is a missing/non-function classifierFn, which is a programmer error.
 */

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8

// Oversize lane (zoo failure-taxonomy #6): extracted text beyond this byte cap is
// not classified; it stages with 'oversize' so the review queue gets an explicit
// oversize lane instead of a metadata-only guess wearing a confidence number.
const DEFAULT_MAX_TEXT_BYTES = 2 * 1024 * 1024

// Closed document_type vocabulary (zoo defect 1). 'not_evidence' is the structural
// refusal type: it is a VALID classification (a confident refusal is a successful
// classify) but it must never reach cd_evidence_items; the 012 CHECK enforces the
// same list minus 'not_evidence' at the DB layer.
const DOCUMENT_TYPES = Object.freeze([
  'electricity_invoice',
  'gas_invoice',
  'fuel_invoice',
  'fuel_card_statement',
  'refrigerant_service_record',
  'water_invoice',
  'waste_invoice',
  'travel_record',
  'supplier_invoice',
  'meter_reading',
  'workbook',
  'other_evidence',
  'not_evidence',
])

// scope_category enum (zoo defect 3). null is also accepted (column is nullable).
const SCOPE_CATEGORIES = Object.freeze(['scope1', 'scope2', 'scope3', 'none'])

// Machine-readable staging codes (zoo defect 6): the monthly classifier_sample
// queue triages on these, never on prose.
const FAILURE_CODES = Object.freeze([
  'unknown_document_type',
  'invalid_period',
  'invalid_scope',
  'malformed_field',
  'low_confidence',
  'classifier_error',
  'empty_input',
  'oversize',
])

const STAGED_FIELDS = {
  document_type: null,
  facility: null,
  period_start: null,
  period_end: null,
  scope_category: null,
}

function staged(reason, failureCode, confidence) {
  if (!FAILURE_CODES.includes(failureCode)) {
    // Programmer error inside this module, not classifier input: fail loudly in tests.
    throw new Error(`staged() called with unknown failure_code '${failureCode}'`)
  }
  return {
    ...STAGED_FIELDS,
    is_evidence: false,
    confidence: typeof confidence === 'number' ? confidence : 0,
    staged_for_review: true,
    failure_code: failureCode,
    reason,
  }
}

// Sentinel for non-scalar field values; never leaks out of this module.
const MALFORMED = Symbol('malformed-field')

function asNullableString(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.length === 0 ? null : value
  // Objects/arrays/functions stage with 'malformed_field' (zoo defect 5); they are
  // never String()-coerced, which committed the literal '[object Object]'.
  if (typeof value === 'object' || typeof value === 'function') return MALFORMED
  return String(value)
}

const ISO_FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * isIsoFullDate(value) -> true only for a yyyy-mm-dd string naming a real
 * calendar date (so '2026-02-30' and '2026-13-01' are invalid, not just
 * shape-checked). Exported so the live pipeline can pre-validate.
 */
function isIsoFullDate(value) {
  if (typeof value !== 'string') return false
  const m = ISO_FULL_DATE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * classifyDocument(docMeta, extractedText, classifierFn, options) -> Promise<result>
 *
 * options:
 *   confidenceThreshold  number in (0, 1], default 0.8. CLOSED boundary:
 *                        confidence <= threshold stages with 'low_confidence';
 *                        only confidence STRICTLY ABOVE the threshold auto-commits.
 *   maxTextBytes         positive integer, default 2 MiB. Larger extracted text
 *                        stages with 'oversize' (explicit oversize lane).
 */
async function classifyDocument(docMeta, extractedText, classifierFn, options = {}) {
  if (typeof classifierFn !== 'function') {
    throw new TypeError('classifyDocument expects classifierFn to be injected as a function')
  }
  const threshold =
    typeof options.confidenceThreshold === 'number' &&
    options.confidenceThreshold > 0 &&
    options.confidenceThreshold <= 1
      ? options.confidenceThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD
  const maxTextBytes =
    typeof options.maxTextBytes === 'number' && options.maxTextBytes > 0
      ? options.maxTextBytes
      : DEFAULT_MAX_TEXT_BYTES

  if (typeof extractedText !== 'string' || extractedText.trim().length === 0) {
    return staged('no extracted text to classify', 'empty_input')
  }
  const textBytes = Buffer.byteLength(extractedText, 'utf8')
  if (textBytes > maxTextBytes) {
    return staged(
      `extracted text is ${textBytes} bytes, over the ${maxTextBytes}-byte cap; oversize lane`,
      'oversize'
    )
  }
  if (docMeta !== undefined && docMeta !== null && typeof docMeta !== 'object') {
    return staged('docMeta is not an object', 'malformed_field')
  }

  let raw
  try {
    raw = await classifierFn({ docMeta: docMeta || {}, extractedText })
  } catch (err) {
    return staged(
      `classifier error: ${err && err.message ? err.message : String(err)}`,
      'classifier_error'
    )
  }

  if (!raw || typeof raw !== 'object') {
    return staged('classifier returned a non-object result', 'classifier_error')
  }

  const confidence = Number(raw.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return staged(
      `classifier returned an invalid confidence (${raw.confidence})`,
      'classifier_error'
    )
  }

  // Coerce the string fields, staging on any non-scalar value (defect 5).
  const fields = {}
  for (const key of Object.keys(STAGED_FIELDS)) {
    const coerced = asNullableString(raw[key])
    if (coerced === MALFORMED) {
      return staged(
        `classifier returned a non-scalar value for ${key}; refusing to stringify`,
        'malformed_field',
        confidence
      )
    }
    fields[key] = coerced
  }

  // document_type vocabulary (defect 1).
  if (fields.document_type === null) {
    return staged('classifier returned no document_type', 'unknown_document_type', confidence)
  }
  if (!DOCUMENT_TYPES.includes(fields.document_type)) {
    return staged(
      `unknown document_type '${fields.document_type}' (not in the closed vocabulary)`,
      'unknown_document_type',
      confidence
    )
  }

  // period full-date validation (defect 2).
  for (const key of ['period_start', 'period_end']) {
    if (fields[key] !== null && !isIsoFullDate(fields[key])) {
      return staged(
        `${key} '${fields[key]}' is not an ISO yyyy-mm-dd full-date (or null)`,
        'invalid_period',
        confidence
      )
    }
  }

  // scope_category enum (defect 3).
  if (fields.scope_category !== null && !SCOPE_CATEGORIES.includes(fields.scope_category)) {
    return staged(
      `scope_category '${fields.scope_category}' is not one of ${SCOPE_CATEGORIES.join('|')} (or null)`,
      'invalid_scope',
      confidence
    )
  }

  // Structural is_evidence (defect 4): computed HERE, never trusted from the
  // classifier, false exactly for the 'not_evidence' refusal type.
  const result = {
    ...fields,
    is_evidence: fields.document_type !== 'not_evidence',
    confidence,
    staged_for_review: false,
    failure_code: null,
    reason: null,
  }

  // Closed threshold boundary (defect 7): <= stages, only strictly-above commits.
  if (confidence <= threshold) {
    return {
      ...result,
      staged_for_review: true,
      failure_code: 'low_confidence',
      reason: `confidence ${confidence} at or below threshold ${threshold} (closed boundary: exactly-threshold stages)`,
    }
  }
  return result
}

module.exports = {
  classifyDocument,
  isIsoFullDate,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_TEXT_BYTES,
  DOCUMENT_TYPES,
  SCOPE_CATEGORIES,
  FAILURE_CODES,
}
