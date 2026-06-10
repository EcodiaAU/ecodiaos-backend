'use strict'

/**
 * emailIngest - raw MIME message -> staged evidence candidates (climate-disclosure W5).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 * Convention: patterns/gmail-attachment-extraction-via-vps-service-account.md
 *   (the LIVE path fetches the raw RFC 822 message via the Gmail API service account;
 *    this module is the pure layer that path feeds: it never touches Gmail itself).
 *
 * ingestEmail(rawMimeMessage) parses the MIME structure, extracts attachments,
 * sha256s each, and emits candidates:
 *   { filename, mime_type, sha256, bytes (Buffer), size_bytes, received_meta }
 *
 * Pure over the passed message: no network, no DB, no clock. received_meta dates are
 * whatever the message headers carry, passed through as strings.
 *
 * Never throws on weird input (empty body, no attachments, corrupt base64, junk bytes):
 * the result carries staged_for_review: true with reasons instead. Throwing is reserved
 * for a non-string/non-Buffer argument, which is a programmer error, not weird input.
 *
 * Zero external dependencies (node:crypto only).
 */

const crypto = require('crypto')

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** Split raw message into { headerBlock, body } on the first blank line. */
function splitHeadersBody(raw) {
  const crlf = raw.indexOf('\r\n\r\n')
  const lf = raw.indexOf('\n\n')
  let idx
  let sepLen
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    idx = crlf
    sepLen = 4
  } else if (lf !== -1) {
    idx = lf
    sepLen = 2
  } else {
    return { headerBlock: raw, body: '' }
  }
  return { headerBlock: raw.slice(0, idx), body: raw.slice(idx + sepLen) }
}

/** Parse a header block (with RFC 822 continuation-line unfolding) into a lowercase-keyed map. */
function parseHeaders(headerBlock) {
  const headers = {}
  const lines = headerBlock.split(/\r?\n/)
  let currentName = null
  for (const line of lines) {
    if (/^[ \t]/.test(line) && currentName) {
      headers[currentName] += ' ' + line.trim()
      continue
    }
    const colon = line.indexOf(':')
    if (colon === -1) {
      currentName = null
      continue
    }
    currentName = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    headers[currentName] = headers[currentName] ? headers[currentName] + ', ' + value : value
  }
  return headers
}

/** Extract a parameter (e.g. boundary, filename, name) from a structured header value. */
function headerParam(headerValue, paramName) {
  if (!headerValue) return null
  // RFC 2231 continuation/extended forms (filename*=, filename*0=) reduced to the simple
  // case: take the first segment, strip charset'' prefix, percent-decode best-effort.
  const extended = new RegExp(`${paramName}\\*(?:0\\*?)?=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(headerValue)
  if (extended) {
    let v = extended[1] != null ? extended[1] : extended[2]
    const tick = v.indexOf("''")
    if (tick !== -1) v = v.slice(tick + 2)
    try {
      v = decodeURIComponent(v)
    } catch (_) {
      // keep raw; best-effort only
    }
    return v
  }
  const plain = new RegExp(`${paramName}=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(headerValue)
  if (!plain) return null
  return plain[1] != null ? plain[1] : plain[2]
}

/** Decode RFC 2047 encoded-words (=?utf-8?B?...?= / =?utf-8?Q?...?=) best-effort. */
function decodeEncodedWords(value) {
  if (!value) return value
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (match, charset, enc, text) => {
    try {
      if (enc.toLowerCase() === 'b') {
        return Buffer.from(text, 'base64').toString('utf8')
      }
      return Buffer.from(
        text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (m, h) =>
          String.fromCharCode(parseInt(h, 16))
        ),
        'binary'
      ).toString('utf8')
    } catch (_) {
      return match
    }
  })
}

/** Decode quoted-printable body text to a Buffer. */
function decodeQuotedPrintable(text) {
  const cleaned = text.replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '=' && /[0-9A-Fa-f]{2}/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

/**
 * Decode a MIME part body per its Content-Transfer-Encoding.
 * Returns { bytes, error } where error is a reason string when the payload is corrupt
 * (e.g. base64 with characters outside the alphabet). Never throws.
 */
function decodePartBody(bodyText, transferEncoding) {
  const enc = (transferEncoding || '7bit').trim().toLowerCase()
  if (enc === 'base64') {
    const compact = bodyText.replace(/\s+/g, '')
    if (!BASE64_RE.test(compact) || compact.length % 4 === 1) {
      return { bytes: null, error: 'corrupt base64 payload' }
    }
    return { bytes: Buffer.from(compact, 'base64'), error: null }
  }
  if (enc === 'quoted-printable') {
    return { bytes: decodeQuotedPrintable(bodyText), error: null }
  }
  // 7bit / 8bit / binary / unknown: take the literal bytes.
  return { bytes: Buffer.from(bodyText, 'binary'), error: null }
}

/**
 * Split a multipart body into its raw part strings by boundary.
 * Tolerant of a missing terminal boundary; ignores the preamble and epilogue.
 */
function splitMultipart(body, boundary) {
  const marker = '--' + boundary
  const segments = body.split(new RegExp(`(?:^|\\r?\\n)${escapeRegExp(marker)}`))
  const parts = []
  // segments[0] is the preamble; subsequent segments start with '--' (terminal), or
  // a newline followed by the part content.
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.startsWith('--')) break // terminal boundary; epilogue follows
    parts.push(seg.replace(/^\r?\n/, ''))
  }
  return parts
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Walk a MIME entity (headers + body) collecting attachment leaves.
 * Depth-capped to keep pathological nesting from recursing unboundedly.
 */
function collectAttachments(headerBlockAndBody, reasons, depth) {
  if (depth > 8) {
    reasons.push('multipart nesting deeper than 8 levels; deeper parts ignored')
    return []
  }
  const { headerBlock, body } = headerBlockAndBody
  const headers = parseHeaders(headerBlock)
  const contentType = headers['content-type'] || 'text/plain'
  const mimeType = contentType.split(';')[0].trim().toLowerCase()

  if (mimeType.startsWith('multipart/')) {
    const boundary = headerParam(contentType, 'boundary')
    if (!boundary) {
      reasons.push(`multipart part without a boundary parameter (${mimeType})`)
      return []
    }
    const out = []
    for (const rawPart of splitMultipart(body, boundary)) {
      out.push(...collectAttachments(splitHeadersBody(rawPart), reasons, depth + 1))
    }
    return out
  }

  const disposition = headers['content-disposition'] || ''
  const filename =
    headerParam(disposition, 'filename') || headerParam(contentType, 'name') || null
  const isAttachment = /^\s*attachment/i.test(disposition) || (filename != null && !/^\s*inline/i.test(disposition))
  if (!isAttachment) return []

  const decodedName = decodeEncodedWords(filename) || 'unnamed-attachment'
  const { bytes, error } = decodePartBody(body, headers['content-transfer-encoding'])
  if (error) {
    reasons.push(`attachment '${decodedName}': ${error}`)
    return []
  }
  if (!bytes || bytes.length === 0) {
    reasons.push(`attachment '${decodedName}': empty payload`)
    return []
  }
  return [
    {
      filename: decodedName,
      mime_type: mimeType,
      sha256: sha256Hex(bytes),
      bytes,
      size_bytes: bytes.length,
    },
  ]
}

/**
 * ingestEmail(rawMimeMessage) -> {
 *   candidates: [{ filename, mime_type, sha256, bytes, size_bytes, received_meta }],
 *   received_meta: { from, to, subject, date, message_id },
 *   staged_for_review: boolean,
 *   reasons: [string],
 * }
 *
 * staged_for_review is true whenever ANYTHING about the message needs a human eye:
 * no attachments, an undecodable part, an empty message. Candidates that did decode
 * cleanly are still emitted alongside the reasons, so a half-good message commits the
 * good half and stages the rest.
 */
function ingestEmail(rawMimeMessage) {
  if (typeof rawMimeMessage !== 'string' && !Buffer.isBuffer(rawMimeMessage)) {
    throw new TypeError('ingestEmail expects the raw MIME message as a string or Buffer')
  }
  const raw = Buffer.isBuffer(rawMimeMessage)
    ? rawMimeMessage.toString('binary')
    : rawMimeMessage

  const reasons = []
  if (raw.trim().length === 0) {
    return {
      candidates: [],
      received_meta: { from: null, to: null, subject: null, date: null, message_id: null },
      staged_for_review: true,
      reasons: ['empty message'],
    }
  }

  const entity = splitHeadersBody(raw)
  const headers = parseHeaders(entity.headerBlock)
  const receivedMeta = {
    from: decodeEncodedWords(headers['from'] || null),
    to: decodeEncodedWords(headers['to'] || null),
    subject: decodeEncodedWords(headers['subject'] || null),
    date: headers['date'] || null,
    message_id: headers['message-id'] || null,
  }

  let candidates = []
  try {
    candidates = collectAttachments(entity, reasons, 0)
  } catch (err) {
    // Belt-and-braces: nothing above is expected to throw, but a malformed message must
    // never take the ingest path down.
    reasons.push(`unparseable message structure: ${err.message}`)
    candidates = []
  }

  if (candidates.length === 0 && reasons.length === 0) {
    reasons.push('no attachments found')
  }

  for (const c of candidates) c.received_meta = receivedMeta

  return {
    candidates,
    received_meta: receivedMeta,
    staged_for_review: reasons.length > 0,
    reasons,
  }
}

module.exports = {
  ingestEmail,
  // exported for direct unit coverage
  parseHeaders,
  headerParam,
  decodePartBody,
}
