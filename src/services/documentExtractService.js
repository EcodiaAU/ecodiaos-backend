'use strict'

/**
 * documentExtractService — PDF + image OCR text extraction.
 *
 * Closes AUTONOMY_AUDIT_2026-05-13 capability gaps "PDF reading missing" and
 * "Image OCR missing". The system can now read invoices, contracts, receipts,
 * whiteboards, screenshots — anything that's text-trapped in a binary.
 *
 * Dependencies are loaded lazily so the package can be missing without
 * crashing the whole process. Install with:
 *   npm install pdf-parse tesseract.js
 *
 * If either dep is absent, the extractor returns
 * { ok: false, error: 'dep_missing', missing: '<name>' } so the conductor can
 * surface a status_board row asking Tate to add it.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

// pdf-parse v2.x exports { PDFParse } class; legacy v1 exported a function
// directly. Probe both shapes so a future version downgrade still works.
let _pdfExtract, _pdfParseAttempted = false
function _getPdfExtractor() {
  if (_pdfParseAttempted) return _pdfExtract
  _pdfParseAttempted = true
  try {
    const mod = require('pdf-parse')
    if (typeof mod === 'function') {
      // v1 shape: pdfParse(buffer) → {text, numpages}
      _pdfExtract = async (buf) => {
        const r = await mod(buf)
        return { text: String(r.text || '').trim(), page_count: r.numpages || 0 }
      }
    } else if (mod && typeof mod.PDFParse === 'function') {
      // v2 shape: new PDFParse({data: buf}).getText() → {text, pages: [{num}]}
      _pdfExtract = async (buf) => {
        const parser = new mod.PDFParse({ data: buf })
        const r = await parser.getText()
        return {
          text: String(r.text || '').trim(),
          page_count: Array.isArray(r.pages) ? r.pages.length : (r.numpages || 0),
        }
      }
    } else {
      _pdfExtract = null
      logger.warn('documentExtract: pdf-parse loaded but neither v1 nor v2 shape detected')
    }
  } catch (err) {
    logger.info('documentExtract: pdf-parse not installed — PDF extraction disabled', { error: err.message })
    _pdfExtract = null
  }
  return _pdfExtract
}

let _tesseract, _tesseractAttempted = false
function _getTesseract() {
  if (_tesseractAttempted) return _tesseract
  _tesseractAttempted = true
  try { _tesseract = require('tesseract.js') }
  catch (err) {
    logger.info('documentExtract: tesseract.js not installed — OCR disabled', { error: err.message })
    _tesseract = null
  }
  return _tesseract
}

function _sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function _getCached(hash) {
  try {
    const rows = await db`
      SELECT text, page_count, source_kind FROM document_extract_cache
      WHERE content_hash = ${hash} LIMIT 1
    `
    if (rows.length) return rows[0]
  } catch (err) {
    logger.debug('documentExtract: cache lookup failed', { error: err.message })
  }
  return null
}

async function _setCached(hash, kind, text, pageCount) {
  try {
    await db`
      INSERT INTO document_extract_cache (content_hash, source_kind, text, page_count, extracted_at)
      VALUES (${hash}, ${kind}, ${text}, ${pageCount}, NOW())
      ON CONFLICT (content_hash) DO UPDATE
        SET text = EXCLUDED.text, page_count = EXCLUDED.page_count, extracted_at = EXCLUDED.extracted_at
    `
  } catch (err) {
    logger.debug('documentExtract: cache write failed', { error: err.message })
  }
}

/**
 * Extract text from a PDF buffer or file path.
 * Returns { ok, text, page_count, cached? } or { ok:false, error }.
 */
async function extractPdf({ buffer, filePath }) {
  if (!buffer && !filePath) return { ok: false, error: 'buffer or filePath required' }
  const extractor = _getPdfExtractor()
  if (!extractor) return { ok: false, error: 'dep_missing', missing: 'pdf-parse' }
  let buf = buffer
  if (!buf) {
    try { buf = fs.readFileSync(filePath) }
    catch (err) { return { ok: false, error: `read failed: ${err.message}` } }
  }
  const hash = _sha256(buf)
  const cached = await _getCached(hash)
  if (cached) return { ok: true, cached: true, text: cached.text, page_count: cached.page_count }
  try {
    const { text, page_count } = await extractor(buf)
    await _setCached(hash, 'pdf', text, page_count)
    return { ok: true, cached: false, text, page_count }
  } catch (err) {
    return { ok: false, error: `pdf parse failed: ${err.message}` }
  }
}

/**
 * Extract text from an image via OCR.
 * Accepts buffer, file path, or URL. Returns { ok, text, confidence?, cached? }.
 */
async function extractImage({ buffer, filePath, url, lang = 'eng' }) {
  if (!buffer && !filePath && !url) return { ok: false, error: 'buffer, filePath, or url required' }
  const tesseract = _getTesseract()
  if (!tesseract) return { ok: false, error: 'dep_missing', missing: 'tesseract.js' }
  // Build a cache key. For URL we hash the URL; for buffer/file we hash content.
  let input = buffer || filePath || url
  let hashSource = null
  if (buffer) hashSource = buffer
  else if (filePath) {
    try { hashSource = fs.readFileSync(filePath); input = hashSource }
    catch (err) { return { ok: false, error: `read failed: ${err.message}` } }
  } else {
    hashSource = Buffer.from(url, 'utf-8')
  }
  const hash = _sha256(hashSource)
  const cached = await _getCached(hash)
  if (cached) return { ok: true, cached: true, text: cached.text }
  try {
    const { data } = await tesseract.recognize(input, lang)
    const text = String(data?.text || '').trim()
    const confidence = data?.confidence ?? null
    await _setCached(hash, 'image', text, 1)
    return { ok: true, cached: false, text, confidence }
  } catch (err) {
    return { ok: false, error: `ocr failed: ${err.message}` }
  }
}

/**
 * Generic dispatcher: peek at the buffer's magic bytes / extension and route.
 */
async function extract({ buffer, filePath, url, lang }) {
  // PDF magic: %PDF
  let buf = buffer
  if (!buf && filePath) {
    try { buf = fs.readFileSync(filePath) }
    catch (err) { return { ok: false, error: `read failed: ${err.message}` } }
  }
  if (buf && buf.slice(0, 4).toString('utf-8') === '%PDF') {
    return extractPdf({ buffer: buf })
  }
  if (filePath && /\.pdf$/i.test(filePath)) return extractPdf({ filePath })
  // Otherwise assume image.
  return extractImage({ buffer: buf, filePath, url, lang })
}

module.exports = { extract, extractPdf, extractImage }
