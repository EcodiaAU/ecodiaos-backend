'use strict'

/**
 * workbookIngest - workbook buffer (.xlsx) -> activity rows (climate-disclosure W5).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W5)
 *
 * DEPENDENCY NOTE (checked 2026-06-10): package.json carries NO xlsx library (no xlsx /
 * exceljs / sheetjs; jszip exists only as mammoth's transitive dependency, which is not
 * ours to rely on). Rather than add a dependency for the subset we need, this module
 * reads XLSX directly: an .xlsx file is a ZIP of XML, and node:zlib inflates ZIP deflate
 * streams natively. Stored (method 0) and deflated (method 8) entries are supported,
 * which covers every mainstream producer (Excel, LibreOffice, Google Sheets exports).
 * If a client workbook ever needs more (encrypted workbooks, binary .xls), that is the
 * moment to add exceljs as a declared dependency, not before.
 *
 * ingestWorkbook(workbookBuffer) -> {
 *   activity_rows: [{ <header>: value }],   from the first non-empty sheet
 *   sheets: [{ name, rows }],               every sheet, rows as raw cell arrays
 *   staged_for_review, reasons
 * }
 *
 * Pure over the passed buffer: no filesystem, no network, no clock. Never throws on
 * junk input (not a zip, truncated, not a workbook): stages with a reason instead.
 */

const zlib = require('zlib')

const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

/** Parse a ZIP buffer into a Map of entryName -> content Buffer. Throws on malformed zip. */
function readZipEntries(buf) {
  if (buf.length < 22) throw new Error('buffer too small to be a zip')
  // Scan backwards for the End Of Central Directory record (comment can pad the tail).
  let eocd = -1
  const scanFloor = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= scanFloor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('no zip end-of-central-directory record')
  const entryCount = buf.readUInt16LE(eocd + 10)
  const cdirOffset = buf.readUInt32LE(eocd + 16)

  const entries = new Map()
  let p = cdirOffset
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDIR_SIG) {
      throw new Error('malformed zip central directory')
    }
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8')

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`malformed zip local header for ${name}`)
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buf.length) throw new Error(`truncated zip data for ${name}`)
    const raw = buf.slice(dataStart, dataEnd)

    let content
    if (method === 0) {
      content = raw
    } else if (method === 8) {
      content = zlib.inflateRawSync(raw)
    } else {
      throw new Error(`unsupported zip compression method ${method} for ${name}`)
    }
    entries.set(name, content)
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXmlText(text) {
  return text.replace(/&(#x?[0-9A-Fa-f]+|[a-z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code =
        ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return XML_ENTITIES[ent] !== undefined ? XML_ENTITIES[ent] : m
  })
}

/** Parse xl/sharedStrings.xml -> array of strings (each <si>, all <t> runs concatenated). */
function parseSharedStrings(xml) {
  if (!xml) return []
  const out = []
  const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g
  let si
  while ((si = siRe.exec(xml)) !== null) {
    let text = ''
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
    let t
    while ((t = tRe.exec(si[1])) !== null) text += decodeXmlText(t[1])
    // self-closing <t/> contributes nothing; that is correct
    out.push(text)
  }
  return out
}

/** 'BC' -> 54 (0-based column index from an A1-style cell reference's letters). */
function columnIndex(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Parse a worksheet XML into rows of cell values (sparse cells filled with null).
 * Cell types handled: s (shared string), str (formula string), inlineStr, b (boolean),
 * n / default (number; left as string when not numeric).
 */
function parseSheet(xml, sharedStrings) {
  const rows = []
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g
  let rowMatch
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const cells = []
    const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const attrs = cellMatch[1]
      const inner = cellMatch[2] || ''
      const refMatch = /r="([A-Z]+)\d+"/.exec(attrs)
      const col = refMatch ? columnIndex(refMatch[1]) : cells.length
      const typeMatch = /t="([^"]+)"/.exec(attrs)
      const type = typeMatch ? typeMatch[1] : 'n'

      let value = null
      if (type === 'inlineStr') {
        const t = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner)
        value = t ? decodeXmlText(t[1]) : ''
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
        const rawValue = v ? decodeXmlText(v[1]) : null
        if (rawValue === null) {
          value = null
        } else if (type === 's') {
          const idx = Number(rawValue)
          value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : null
        } else if (type === 'b') {
          value = rawValue === '1'
        } else if (type === 'str') {
          value = rawValue
        } else {
          const num = Number(rawValue)
          value = Number.isFinite(num) ? num : rawValue
        }
      }
      while (cells.length < col) cells.push(null)
      cells[col] = value
    }
    rows.push(cells)
  }
  return rows
}

/** Sheet names in workbook order from xl/workbook.xml (best-effort; falls back to file order). */
function parseSheetNames(workbookXml) {
  const names = []
  if (!workbookXml) return names
  const re = /<sheet\s[^>]*?name="([^"]*)"[^>]*?\/?>/g
  let m
  while ((m = re.exec(workbookXml)) !== null) names.push(decodeXmlText(m[1]))
  return names
}

/** Header-keyed objects from raw rows: first non-empty row is the header. */
function toActivityRows(rows) {
  const headerIdx = rows.findIndex((r) => r.some((c) => c !== null && c !== ''))
  if (headerIdx === -1) return []
  const headers = rows[headerIdx].map((h, i) =>
    h === null || h === '' ? `column_${i + 1}` : String(h).trim()
  )
  const out = []
  for (const row of rows.slice(headerIdx + 1)) {
    if (!row.some((c) => c !== null && c !== '')) continue
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] === undefined ? null : row[i]
    })
    out.push(obj)
  }
  return out
}

/**
 * ingestWorkbook(workbookBuffer) -> { activity_rows, sheets, staged_for_review, reasons }
 */
function ingestWorkbook(workbookBuffer) {
  if (!Buffer.isBuffer(workbookBuffer)) {
    throw new TypeError('ingestWorkbook expects the workbook as a Buffer')
  }

  let entries
  try {
    entries = readZipEntries(workbookBuffer)
  } catch (err) {
    return {
      activity_rows: [],
      sheets: [],
      staged_for_review: true,
      reasons: [`not a readable workbook: ${err.message}`],
    }
  }

  try {
    const sheetEntryNames = [...entries.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => {
        const na = Number(/sheet(\d+)\.xml/.exec(a)[1])
        const nb = Number(/sheet(\d+)\.xml/.exec(b)[1])
        return na - nb
      })
    if (sheetEntryNames.length === 0) {
      return {
        activity_rows: [],
        sheets: [],
        staged_for_review: true,
        reasons: ['zip contains no xl/worksheets/*.xml (not an xlsx workbook)'],
      }
    }

    const sharedStrings = parseSharedStrings(
      entries.has('xl/sharedStrings.xml') ? entries.get('xl/sharedStrings.xml').toString('utf8') : null
    )
    const names = parseSheetNames(
      entries.has('xl/workbook.xml') ? entries.get('xl/workbook.xml').toString('utf8') : null
    )

    const sheets = sheetEntryNames.map((entryName, i) => ({
      name: names[i] !== undefined ? names[i] : entryName,
      rows: parseSheet(entries.get(entryName).toString('utf8'), sharedStrings),
    }))

    const firstWithData = sheets.find((s) => s.rows.length > 0)
    const activityRows = firstWithData ? toActivityRows(firstWithData.rows) : []
    const reasons = []
    if (activityRows.length === 0) reasons.push('workbook has no activity rows under a header row')

    return {
      activity_rows: activityRows,
      sheets,
      staged_for_review: reasons.length > 0,
      reasons,
    }
  } catch (err) {
    return {
      activity_rows: [],
      sheets: [],
      staged_for_review: true,
      reasons: [`workbook parse failed: ${err.message}`],
    }
  }
}

module.exports = {
  ingestWorkbook,
  // exported for direct unit coverage
  readZipEntries,
  parseSharedStrings,
  parseSheet,
}
