'use strict'

/**
 * Fixtures for the W5 ingest tests.
 *
 * PROBE DISCIPLINE: FIXTURE_PDF_SHA256 is PRECOMPUTED from the known attachment bytes
 * and hardcoded as a literal, as opposed to hash-of-whatever-came-out. If the parser
 * mangles a single byte of the attachment, the test goes red; an expectation derived
 * from the parser's own output could never catch that.
 */

const zlib = require('zlib')

// The exact attachment bytes carried inside FIXTURE_EMAIL (a minimal but real PDF).
const FIXTURE_PDF_BYTES = Buffer.from(
  [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
    'trailer<</Size 4/Root 1 0 R>>',
    '%%EOF',
    '',
  ].join('\n'),
  'utf8'
)

// sha256 of FIXTURE_PDF_BYTES, precomputed once out-of-band (node:crypto, 2026-06-10).
const FIXTURE_PDF_SHA256 = '051a59b4e4a5b86bb6f409a08ffdee9ae21af2214eb7cf338f2250523682b791'
const FIXTURE_PDF_SIZE_BYTES = 200

// FIXTURE_PDF_BYTES base64-encoded, wrapped at 76 chars (standard MIME wrapping).
const FIXTURE_PDF_BASE64_WRAPPED = [
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBv',
  'Ymo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlw',
  'ZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVy',
  'PDwvU2l6ZSA0L1Jvb3QgMSAwIFI+PgolJUVPRgo=',
].join('\r\n')

const BOUNDARY = 'climate-w5-fixture-boundary'

/** A realistic inbound evidence email: multipart/mixed, text body + PDF invoice attachment. */
const FIXTURE_EMAIL = [
  'Return-Path: <accounts@energyretailer.example.com>',
  'Message-ID: <fixture-w5-001@energyretailer.example.com>',
  'Date: Wed, 1 Jul 2026 09:15:00 +1000',
  'From: Energy Retailer Accounts <accounts@energyretailer.example.com>',
  'To: evidence+eng-0001@ecodia.au',
  'Subject: Electricity invoice - Site A - June 2026',
  'MIME-Version: 1.0',
  `Content-Type: multipart/mixed; boundary="${BOUNDARY}"`,
  '',
  'Preamble that MIME readers must ignore.',
  `--${BOUNDARY}`,
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: 7bit',
  '',
  'Hi, please find attached the electricity invoice for Site A, June 2026.',
  `--${BOUNDARY}`,
  'Content-Type: application/pdf; name="invoice-site-a-2026-06.pdf"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="invoice-site-a-2026-06.pdf"',
  '',
  FIXTURE_PDF_BASE64_WRAPPED,
  `--${BOUNDARY}--`,
  'Epilogue, also ignored.',
  '',
].join('\r\n')

/** Same structure, but the base64 payload is corrupted with characters outside the alphabet. */
const FIXTURE_EMAIL_CORRUPT_BASE64 = FIXTURE_EMAIL.replace(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBv',
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdl!!!###NOT_BASE64$$$AyIDAgUj4'
)

/** Headers only, no attachments, plain body. */
const FIXTURE_EMAIL_NO_ATTACHMENTS = [
  'Message-ID: <fixture-w5-002@example.com>',
  'Date: Wed, 1 Jul 2026 10:00:00 +1000',
  'From: someone@example.com',
  'To: evidence+eng-0001@ecodia.au',
  'Subject: question about the portal',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'No attachment here, only a question.',
  '',
].join('\r\n')

// ---------------------------------------------------------------------------
// Minimal XLSX writer (store-method zip, no compression) for the workbook
// round-trip fixture. Test-side only; production reading lives in workbookIngest.
// ---------------------------------------------------------------------------

function crc32(buf) {
  // node:zlib has crc32 from v20.15; fall back to a table-free implementation if absent.
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Build a stored (method 0) zip from { name: contentString } entries. */
function buildStoredZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, contentString] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(contentString, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method: stored
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18) // compressed size
    local.writeUInt32LE(data.length, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra len
    locals.push(local, nameBuf, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(0, 10) // method
    central.writeUInt16LE(0, 12) // time
    central.writeUInt16LE(0, 14) // date
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk start
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42) // local header offset
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBuf, eocd])
}

/**
 * A minimal real .xlsx: one sheet "Activity", header row + two activity rows, exercising
 * shared strings, inline numbers, and a gap (sparse cell).
 *
 * | facility | fuel_type | quantity | unit   |
 * | Site A   | diesel    | 1200.5   | L      |
 * | Site B   | (blank)   | 350      | kWh    |
 */
function buildFixtureWorkbook() {
  const shared = ['facility', 'fuel_type', 'quantity', 'unit', 'Site A', 'diesel', 'L', 'Site B', 'kWh']
  const sharedXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
    shared.map((s) => `<si><t>${s}</t></si>`).join('') +
    '</sst>'
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1">' +
    '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c>' +
    '</row>' +
    '<row r="2">' +
    '<c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>1200.5</v></c><c r="D2" t="s"><v>6</v></c>' +
    '</row>' +
    '<row r="3">' +
    '<c r="A3" t="s"><v>7</v></c><c r="C3"><v>350</v></c><c r="D3" t="s"><v>8</v></c>' +
    '</row>' +
    '</sheetData></worksheet>'
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheets><sheet name="Activity" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>' +
    '</workbook>'
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '</Types>'

  return buildStoredZip({
    '[Content_Types].xml': contentTypes,
    'xl/workbook.xml': workbookXml,
    'xl/sharedStrings.xml': sharedXml,
    'xl/worksheets/sheet1.xml': sheetXml,
  })
}

module.exports = {
  FIXTURE_PDF_BYTES,
  FIXTURE_PDF_SHA256,
  FIXTURE_PDF_SIZE_BYTES,
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_CORRUPT_BASE64,
  FIXTURE_EMAIL_NO_ATTACHMENTS,
  buildFixtureWorkbook,
  buildStoredZip,
}
