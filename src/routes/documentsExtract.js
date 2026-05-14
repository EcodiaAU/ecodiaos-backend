'use strict'

/**
 * POST /api/documents-extract
 *
 * Three forms accepted:
 *   1. JSON body: { filePath: '/absolute/path/to.pdf' }
 *      — used by VPS-side callers that already have the file on disk
 *      (e.g. Supabase storage download, attachment_save).
 *   2. JSON body: { url: 'https://...' }
 *      — fetched first (size cap 25MB) then routed.
 *   3. Raw body: PDF or image bytes with appropriate Content-Type.
 *
 * Returns { ok, text, page_count?, confidence?, cached?, source_kind }.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 §29-30.
 */

const { Router } = require('express')
const router = Router()
const logger = require('../config/logger')
const docExtract = require('../services/documentExtractService')

const MAX_URL_BYTES = 25 * 1024 * 1024 // 25MB

async function _fetchToBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  if (contentLength && contentLength > MAX_URL_BYTES) {
    throw new Error(`file too large: ${contentLength} bytes`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_URL_BYTES) throw new Error(`file too large after read: ${buf.length} bytes`)
  return buf
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {}
    const lang = body.lang || 'eng'
    if (body.filePath) {
      const result = await docExtract.extract({ filePath: body.filePath, lang })
      return res.json(result)
    }
    if (body.url) {
      let buf
      try { buf = await _fetchToBuffer(body.url) }
      catch (err) { return res.status(400).json({ ok: false, error: `url fetch failed: ${err.message}` }) }
      const result = await docExtract.extract({ buffer: buf, lang })
      return res.json(result)
    }
    if (Buffer.isBuffer(req.body)) {
      const result = await docExtract.extract({ buffer: req.body, lang })
      return res.json(result)
    }
    res.status(400).json({ ok: false, error: 'provide filePath, url, or raw binary body' })
  } catch (err) {
    logger.error('/api/documents-extract failed', { error: err.message })
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
