'use strict'

/**
 * classify - document metadata + extracted text -> classification (climate-disclosure W5).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 *
 * classifyDocument(docMeta, extractedText, classifierFn, options) emits:
 *   { document_type, facility, period_start, period_end, scope_category,
 *     confidence, staged_for_review, reason }
 *
 * The LLM call is INJECTED as classifierFn so tests stub it and this module stays pure:
 * no network, no DB, no clock. classifierFn receives { docMeta, extractedText } and may
 * be sync or async; classifyDocument always returns a Promise.
 *
 * Below the confidence threshold (options.confidenceThreshold, default 0.8) the result
 * is flagged staged_for_review: true (the monthly classifier_sample queue) instead of
 * auto-commit. Weird input NEVER throws: it returns staged_for_review with a reason.
 * The only throw is a missing/non-function classifierFn, which is a programmer error.
 */

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8

const STAGED_FIELDS = {
  document_type: null,
  facility: null,
  period_start: null,
  period_end: null,
  scope_category: null,
}

function staged(reason, confidence) {
  return {
    ...STAGED_FIELDS,
    confidence: typeof confidence === 'number' ? confidence : 0,
    staged_for_review: true,
    reason,
  }
}

function asNullableString(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.length === 0 ? null : value
  return String(value)
}

/**
 * classifyDocument(docMeta, extractedText, classifierFn, options) -> Promise<result>
 *
 * options:
 *   confidenceThreshold  number in (0, 1], default 0.8
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

  if (typeof extractedText !== 'string' || extractedText.trim().length === 0) {
    return staged('no extracted text to classify')
  }
  if (docMeta !== undefined && docMeta !== null && typeof docMeta !== 'object') {
    return staged('docMeta is not an object')
  }

  let raw
  try {
    raw = await classifierFn({ docMeta: docMeta || {}, extractedText })
  } catch (err) {
    return staged(`classifier error: ${err && err.message ? err.message : String(err)}`)
  }

  if (!raw || typeof raw !== 'object') {
    return staged('classifier returned a non-object result')
  }

  const confidence = Number(raw.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return staged(`classifier returned an invalid confidence (${raw.confidence})`)
  }

  const result = {
    document_type: asNullableString(raw.document_type),
    facility: asNullableString(raw.facility),
    period_start: asNullableString(raw.period_start),
    period_end: asNullableString(raw.period_end),
    scope_category: asNullableString(raw.scope_category),
    confidence,
    staged_for_review: false,
    reason: null,
  }

  if (result.document_type === null) {
    return { ...result, staged_for_review: true, reason: 'classifier returned no document_type' }
  }
  if (confidence < threshold) {
    return {
      ...result,
      staged_for_review: true,
      reason: `confidence ${confidence} below threshold ${threshold}`,
    }
  }
  return result
}

module.exports = {
  classifyDocument,
  DEFAULT_CONFIDENCE_THRESHOLD,
}
