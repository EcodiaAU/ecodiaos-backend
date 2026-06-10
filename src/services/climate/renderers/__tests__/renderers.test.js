'use strict'

/**
 * W6 renderer tests (climate-disclosure).
 *
 * THE verify gate is byte-reproducibility: every renderer is rendered twice and
 * the sha256 of the bytes compared, as opposed to assuming template determinism.
 * Input-order independence is asserted too: caller fetch order must never leak
 * into the bytes. Plus RFC 4180 escaping edges and manifest hash correctness.
 */

const crypto = require('crypto')

const fixtures = require('./fixtures')
const {
  registerExport,
  REGISTER_COLUMNS,
  methodologyMemo,
  draftStatements,
  coverageReport,
  packManifest,
} = require('../index')

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

/** Reverse rows + reverse each row's key order: neither may change the bytes. */
const scrambled = (rows) =>
  [...rows].reverse().map((row) => {
    const out = {}
    for (const key of Object.keys(row).reverse()) out[key] = row[key]
    return out
  })

describe('byte-reproducibility (double-render sha256 equality per renderer)', () => {
  test('registerExport renders byte-identical twice, csv and json', () => {
    const a = registerExport(fixtures.evidenceRows)
    const b = registerExport(fixtures.evidenceRows)
    expect(sha256(b.csv)).toBe(sha256(a.csv))
    expect(sha256(b.json)).toBe(sha256(a.json))
  })

  test('registerExport is independent of caller row order and key order', () => {
    const a = registerExport(fixtures.evidenceRows)
    const b = registerExport(scrambled(fixtures.evidenceRows))
    expect(sha256(b.csv)).toBe(sha256(a.csv))
    expect(sha256(b.json)).toBe(sha256(a.json))
  })

  test('methodologyMemo renders byte-identical twice and order-independent', () => {
    const a = methodologyMemo(fixtures.calcRuns, fixtures.factorMeta, fixtures.elections)
    const b = methodologyMemo(fixtures.calcRuns, fixtures.factorMeta, fixtures.elections)
    expect(sha256(b)).toBe(sha256(a))
    const c = methodologyMemo(scrambled(fixtures.calcRuns), scrambled(fixtures.factorMeta), fixtures.elections)
    expect(sha256(c)).toBe(sha256(a))
  })

  test('draftStatements renders byte-identical twice and order-independent', () => {
    const a = draftStatements(fixtures.draftRows, fixtures.clauseRows)
    const b = draftStatements(fixtures.draftRows, fixtures.clauseRows)
    expect(sha256(b)).toBe(sha256(a))
    const c = draftStatements(scrambled(fixtures.draftRows), scrambled(fixtures.clauseRows))
    expect(sha256(c)).toBe(sha256(a))
  })

  test('coverageReport renders byte-identical twice and order-independent', () => {
    const a = coverageReport(fixtures.coverageRows, fixtures.gapRows, { asOf: '2025-10-01' })
    const b = coverageReport(fixtures.coverageRows, fixtures.gapRows, { asOf: '2025-10-01' })
    expect(sha256(b)).toBe(sha256(a))
    const c = coverageReport(scrambled(fixtures.coverageRows), scrambled(fixtures.gapRows), { asOf: '2025-10-01' })
    expect(sha256(c)).toBe(sha256(a))
  })

  test('packManifest renders byte-identical twice and artifact-order-independent', () => {
    const artifacts = [
      { name: 'register.csv', content: 'a,b\r\n1,2\r\n', media_type: 'text/csv' },
      { name: 'memo.md', content: '# memo\n' },
      { name: 'logo.bin', content: Buffer.from([0x00, 0xff, 0x10]) },
    ]
    const a = packManifest(artifacts)
    const b = packManifest(artifacts)
    expect(sha256(b.json)).toBe(sha256(a.json))
    const c = packManifest([...artifacts].reverse())
    expect(sha256(c.json)).toBe(sha256(a.json))
    expect(c.manifest.pack_sha256).toBe(a.manifest.pack_sha256)
  })

  test('the full pack (all four documents + manifest) double-renders to identical pack_sha256', () => {
    const renderPack = () => {
      const register = registerExport(fixtures.evidenceRows)
      const docs = [
        { name: 'evidence-register.csv', content: register.csv },
        { name: 'evidence-register.json', content: register.json },
        { name: 'methodology-memo.md', content: methodologyMemo(fixtures.calcRuns, fixtures.factorMeta, fixtures.elections) },
        { name: 'draft-statements.html', content: draftStatements(fixtures.draftRows, fixtures.clauseRows) },
        { name: 'coverage-report.md', content: coverageReport(fixtures.coverageRows, fixtures.gapRows, { asOf: '2025-10-01' }) },
      ]
      return packManifest(docs).manifest.pack_sha256
    }
    expect(renderPack()).toBe(renderPack())
  })
})

describe('registerExport content', () => {
  test('CSV escapes commas, quotes and newlines per RFC 4180 and stays parseable', () => {
    const { csv } = registerExport(fixtures.evidenceRows)
    // The hostile field arrives quoted with doubled inner quotes.
    expect(csv).toContain('"fuel_invoice, diesel ""bulk"""')
    // Embedded newline survives INSIDE a quoted field.
    expect(csv).toContain('"Site B\nNorthern Depot"')
    // A minimal RFC 4180 parse: splitting on CRLF outside quotes yields header + 3 records.
    const records = []
    let field = ''
    let inQuotes = false
    let record = []
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i]
      if (inQuotes) {
        if (ch === '"' && csv[i + 1] === '"') {
          field += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          field += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        record.push(field)
        field = ''
      } else if (ch === '\r' && csv[i + 1] === '\n') {
        record.push(field)
        records.push(record)
        record = []
        field = ''
        i++
      } else {
        field += ch
      }
    }
    expect(records).toHaveLength(1 + fixtures.evidenceRows.length)
    expect(records[0]).toEqual([...REGISTER_COLUMNS])
    for (const rec of records) expect(rec).toHaveLength(REGISTER_COLUMNS.length)
    // Rows come out in seq order regardless of caller order.
    const seqIdx = REGISTER_COLUMNS.indexOf('seq')
    expect(records.slice(1).map((r) => r[seqIdx])).toEqual(['1', '2', '3'])
    // The parsed hostile field round-trips exactly.
    const docTypeIdx = REGISTER_COLUMNS.indexOf('document_type')
    expect(records[2][docTypeIdx]).toBe('fuel_invoice, diesel "bulk"')
    const payloadIdx = REGISTER_COLUMNS.indexOf('payload')
    expect(JSON.parse(records[2][payloadIdx])).toEqual({
      litres: '12000.5',
      note: 'line2\r\ncontains, comma and "quotes"',
    })
  })

  test('json export is sorted by seq, carries hash-chain columns, Date and string timestamps serialise alike', () => {
    const { json } = registerExport(fixtures.evidenceRows)
    const rows = JSON.parse(json)
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3])
    expect(rows[0].prev_hash).toBeNull()
    expect(rows[1].prev_hash).toBe('a1'.repeat(32))
    // captured_at arrived as a Date object on row 1 and a string elsewhere; both are ISO strings out.
    expect(rows[0].captured_at).toBe('2025-08-03T00:30:00.000Z')
    expect(rows[1].captured_at).toBe('2025-09-02T01:00:00.000Z')
  })
})

describe('methodologyMemo content', () => {
  const memo = methodologyMemo(fixtures.calcRuns, fixtures.factorMeta, fixtures.elections)

  test('every current figure is traced to its calc run id and factor vintage', () => {
    expect(memo).toContain('32.456789')
    expect(memo).toContain('00000000-0000-4000-8000-0000000000c2')
    expect(memo).toContain('NGA-2025')
    expect(memo).toContain('cc'.repeat(32)) // inputs hash
    expect(memo).toContain('1111111111111111111111111111111111111111') // code sha
  })

  test('superseded runs render in the lineage appendix, not the current table', () => {
    const currentSection = memo.split('## Appendix B')[0]
    const lineage = memo.split('## Appendix B')[1]
    expect(currentSection).not.toContain('32.501122')
    expect(lineage).toContain('32.501122')
    expect(lineage).toContain('00000000-0000-4000-8000-0000000000c1')
  })

  test('factor appendix carries vintage, value and source url; elections table carries the per-facility row', () => {
    expect(memo).toContain('fuel.diesel_oil.stationary.co2')
    expect(memo).toContain('https://example.invalid/nga-2025')
    expect(memo).toContain('| Site B | NGER_METHOD_1 |')
  })
})

describe('draftStatements content', () => {
  const html = draftStatements(fixtures.draftRows, fixtures.clauseRows)

  test('clause references and requirement summaries are visible per section', () => {
    expect(html).toContain('AASB S2 para 29(a)')
    expect(html).toContain('AASB S2 para 6(a)')
    expect(html).toContain('Disclose absolute gross scope 1 and scope 2')
  })

  test('register citations render under the drafted section; gap renders as a named gap', () => {
    expect(html).toContain('00000000-0000-4000-8000-0000000000a2')
    expect(html).toContain('Identified gap')
    expect(html).toContain('No board charter or committee terms of reference')
  })

  test('only the highest version of a clause draft renders', () => {
    expect(html).toContain('32.456789')
    expect(html).not.toContain('Earlier draft, superseded by version 2.')
  })

  test('client data is HTML-escaped and the document is client-styled (serif, not EB Garamond)', () => {
    expect(html).toContain('&lt;see gap note&gt;')
    expect(html).not.toContain('<see gap note>')
    expect(html).toContain('Georgia')
    expect(html).not.toMatch(/EB Garamond/i)
  })
})

describe('coverageReport content', () => {
  const report = coverageReport(fixtures.coverageRows, fixtures.gapRows, { asOf: '2025-10-01' })

  test('mirrors the cd_coverage view shape and names the uncovered period', () => {
    expect(report).toContain('Expected document-periods: 3')
    expect(report).toContain('Covered: 2 (66.7%)')
    expect(report).toContain('period 2025-08-01 to 2025-08-31 has no committed evidence (due by 2025-09-14)')
    expect(report).toContain('Overdue as at 2025-10-01: 1')
  })

  test('disclosure-level gaps from cd_disclosure_drafts render with clause refs', () => {
    expect(report).toContain('AASB S2 para 6(a)')
    expect(report).toContain('No board charter')
  })

  test('without asOf there is no overdue column and no clock read', () => {
    const a = coverageReport(fixtures.coverageRows, fixtures.gapRows)
    expect(a).not.toContain('Overdue')
    expect(sha256(coverageReport(fixtures.coverageRows, fixtures.gapRows))).toBe(sha256(a))
  })

  test('a non-ISO asOf is refused (timestamps are inputs, never the clock)', () => {
    expect(() => coverageReport(fixtures.coverageRows, fixtures.gapRows, { asOf: Date.now() })).toThrow(/asOf/)
  })
})

describe('packManifest content', () => {
  test('per-artifact sha256 and byte counts are correct for strings and Buffers', () => {
    const content = 'hello pack\n'
    const buf = Buffer.from([0x01, 0x02, 0x03])
    const { manifest } = packManifest([
      { name: 'b.bin', content: buf },
      { name: 'a.txt', content, media_type: 'text/plain' },
    ])
    expect(manifest.format).toBe('ecodia-climate-pack-manifest/v1')
    expect(manifest.artifact_count).toBe(2)
    // Sorted by name.
    expect(manifest.artifacts.map((a) => a.name)).toEqual(['a.txt', 'b.bin'])
    expect(manifest.artifacts[0].sha256).toBe(crypto.createHash('sha256').update(content, 'utf8').digest('hex'))
    expect(manifest.artifacts[0].bytes).toBe(Buffer.byteLength(content, 'utf8'))
    expect(manifest.artifacts[0].media_type).toBe('text/plain')
    expect(manifest.artifacts[1].sha256).toBe(crypto.createHash('sha256').update(buf).digest('hex'))
    expect(manifest.artifacts[1].bytes).toBe(3)
  })

  test('pack_sha256 changes when an artifact is added, removed or its content swapped', () => {
    const base = [
      { name: 'a.txt', content: 'one' },
      { name: 'b.txt', content: 'two' },
    ]
    const baseline = packManifest(base).manifest.pack_sha256
    expect(packManifest([base[0]]).manifest.pack_sha256).not.toBe(baseline)
    expect(packManifest([...base, { name: 'c.txt', content: 'three' }]).manifest.pack_sha256).not.toBe(baseline)
    expect(
      packManifest([base[0], { name: 'b.txt', content: 'two!' }]).manifest.pack_sha256
    ).not.toBe(baseline)
  })

  test('duplicate names, empty packs and non-string/Buffer content are refused', () => {
    expect(() => packManifest([])).toThrow(/empty pack/)
    expect(() =>
      packManifest([
        { name: 'a.txt', content: 'x' },
        { name: 'a.txt', content: 'y' },
      ])
    ).toThrow(/duplicate/)
    expect(() => packManifest([{ name: 'a.txt', content: 42 }])).toThrow(/string or Buffer/)
  })
})

describe('purity guards', () => {
  test('no renderer source file reads the clock, randomness, a DB client or shells out', () => {
    const fs = require('fs')
    const path = require('path')
    const dir = path.join(__dirname, '..')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8')
      expect({ file, hit: /Date\.now\s*\(/.test(src) }).toEqual({ file, hit: false })
      expect({ file, hit: /new Date\s*\(\s*\)/.test(src) }).toEqual({ file, hit: false })
      expect({ file, hit: /Math\.random/.test(src) }).toEqual({ file, hit: false })
      expect({ file, hit: /child_process|execSync|supabase|pg\b/.test(src) }).toEqual({ file, hit: false })
      expect({ file, hit: /toLocale|Intl\./.test(src) }).toEqual({ file, hit: false })
      // Em-dash ban at character level (U+2014), per the repo-wide reflex.
      expect({ file, hit: src.includes('\u2014') }).toEqual({ file, hit: false })
    }
  })
})
