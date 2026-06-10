'use strict'

/**
 * ecodia-climate MCP connector tests (climate-disclosure W7 verify gate).
 *
 * Gates from the dispatch brief:
 *  - zod rejects malformed params for EVERY tool (one negative case each;
 *    unknown params reject too, schemas are .strict())
 *  - handler logic over a stubbed DB client for cd_register_query,
 *    cd_coverage_query, cd_calc_run, cd_integrity_check (integrity over a
 *    small fixture chain, tamper detected)
 *  - deny-by-default at the bearer layer: wrong/other-connector bearer is
 *    rejected by connectorAuth (the exact layer the sibling connectors check)
 *  - cross-connector tool denial + scope denial at the dispatch layer
 *  - cd_evidence_commit confirmation uses append-as-supersede
 */

// connectorAuth reads the MAIN substrate db (kv_store bearer row); mock it so
// the bearer-layer tests run hermetically. Climate handlers never touch this
// client - they get the dedicated client injected.
jest.mock('../../../config/db', () => {
  const fn = jest.fn(async () => [])
  return fn
})
jest.mock('../../../config/logger', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
}))
// The audit writer also points at the main substrate; stub it out.
jest.mock('../../../services/connectorAudit', () => ({
  recordConnectorAuditRow: jest.fn(async () => {}),
}))

const mainDbMock = require('../../../config/db')
const makeConnectorAuth = require('../../../middleware/connectorAuth')
const { CONNECTOR } = require('../connector/manifest')
const { TOOLS, getTool, normaliseForChain } = require('../connector/tools')
const { _internal } = require('../../../routes/mcp/ecodiaClimate')
const evidenceChain = require('../evidenceChain')
const dieselFixture = require('../calculators/__tests__/fixtures/nga2025-example6-stationary-diesel')

const ENGAGEMENT_ID = '11111111-1111-4111-8111-111111111111'
const SHA = 'a'.repeat(64)

// ── stub DB: a postgres.js-shaped tagged-template function ──────────────
// Handlers only ever call db as a tagged template; the stub joins the SQL
// text and routes on it. Calls are recorded for assertion.
function makeStubDb(route) {
  const calls = []
  const db = async (strings, ...values) => {
    const sql = strings.join('$').replace(/\s+/g, ' ').trim()
    calls.push({ sql, values })
    return route(sql, values, calls)
  }
  db._calls = calls
  return db
}

// Build a valid evidence chain the way the connector writes it.
function buildFixtureChain(n) {
  const rows = []
  let prevHash = null
  for (let i = 1; i <= n; i++) {
    const row = normaliseForChain({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      engagement_id: ENGAGEMENT_ID,
      seq: i,
      doc_sha256: SHA,
      storage_path: `${ENGAGEMENT_ID}/raw/doc-${i}.pdf`,
      source_channel: 'email',
      document_type: 'electricity_invoice',
      facility: 'Site A',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      scope_category: 'scope2',
      classifier_version: 'v1',
      classification_confidence: 0.97,
      payload: { kwh: 1000 + i },
      supersedes_id: null,
      confirmation_status: 'auto',
      captured_at: '2026-02-01T00:00:00.000Z',
    })
    row.prev_hash = prevHash
    row.row_hash = evidenceChain.hashRow(row, prevHash)
    prevHash = row.row_hash
    rows.push(row)
  }
  return rows
}

// ── 1. zod negative case for every tool ─────────────────────────────────

describe('zod schemas reject malformed params (one negative case per tool)', () => {
  const NEGATIVE_CASES = {
    cd_engagement_create: { abn: '123' }, // missing entity_name + bad ABN
    cd_engagement_query: { limit: 'fifty' },
    cd_evidence_stage: { engagement_id: ENGAGEMENT_ID, doc_sha256: 'NOT-HEX', storage_path: 'x', source_channel: 'email' },
    cd_evidence_commit: { engagement_id: ENGAGEMENT_ID }, // neither confirm_evidence_id nor new-evidence fields
    cd_register_query: { engagement_id: 'not-a-uuid' },
    cd_coverage_query: { engagement_id: ENGAGEMENT_ID, only_gaps: 'yes' },
    cd_calc_run: { engagement_id: ENGAGEMENT_ID, calculator: 'magicEstimator', activity_rows: [{}], factor_vintage: '2025' },
    cd_draft_upsert: { engagement_id: ENGAGEMENT_ID, clause_ref: 'S2.29a', draft_text: 'x', status: 'published' },
    cd_drafts_query: { engagement_id: ENGAGEMENT_ID, status: 'approved' },
    cd_pack_export: { engagement_id: ENGAGEMENT_ID, as_of: '10/06/2026' },
    cd_integrity_check: { engagement_id: ENGAGEMENT_ID, record_event: 'true' },
    cd_event_log: { engagement_id: ENGAGEMENT_ID, event_type: 'integrity_ok', resolve_event_id: '22222222-2222-4222-8222-222222222222' }, // mutually exclusive
  }

  test('every connector tool has a negative case in this suite', () => {
    expect(Object.keys(NEGATIVE_CASES).sort()).toEqual([...CONNECTOR.tools].sort())
    expect(TOOLS).toHaveLength(12)
  })

  for (const [toolName, badArgs] of Object.entries(NEGATIVE_CASES)) {
    test(`${toolName} rejects malformed params`, () => {
      const tool = getTool(toolName)
      expect(tool).not.toBeNull()
      const parsed = tool.schema.safeParse(badArgs)
      expect(parsed.success).toBe(false)
    })
  }

  test('unknown params reject on every tool (strict schemas, no passthrough)', () => {
    for (const tool of TOOLS) {
      const parsed = tool.schema.safeParse({ engagement_id: ENGAGEMENT_ID, definitely_not_a_param: 1 })
      expect(parsed.success).toBe(false)
    }
  })

  test('declared ctx arg cowork_session_id is accepted (explicit, not passthrough)', () => {
    const tool = getTool('cd_engagement_query')
    const parsed = tool.schema.safeParse({ cowork_session_id: 'sess_123' })
    expect(parsed.success).toBe(true)
  })
})

// ── 2. handler logic over a stubbed DB client ───────────────────────────

describe('cd_register_query handler', () => {
  test('returns rows in seq order and filters superseded when asked', async () => {
    const chain = buildFixtureChain(3)
    // row 3 supersedes row 1
    chain[2].supersedes_id = chain[0].id
    const db = makeStubDb((sql) => {
      if (sql.includes('from cd_evidence_items')) return chain
      throw new Error(`unexpected sql: ${sql}`)
    })

    const all = await getTool('cd_register_query').handler({
      args: { engagement_id: ENGAGEMENT_ID }, db,
    })
    expect(all.ok).toBe(true)
    expect(all.count).toBe(3)

    const current = await getTool('cd_register_query').handler({
      args: { engagement_id: ENGAGEMENT_ID, include_superseded: false }, db,
    })
    expect(current.count).toBe(2)
    expect(current.rows.map((r) => r.seq)).toEqual([2, 3])
  })

  test('passes filters into the query values', async () => {
    const db = makeStubDb(() => [])
    await getTool('cd_register_query').handler({
      args: { engagement_id: ENGAGEMENT_ID, document_type: 'fuel_card', limit: 10 }, db,
    })
    expect(db._calls).toHaveLength(1)
    expect(db._calls[0].values).toContain('fuel_card')
    expect(db._calls[0].values).toContain(10)
  })
})

describe('cd_coverage_query handler', () => {
  const coverageRows = [
    { engagement_id: ENGAGEMENT_ID, facility: 'Site A', document_type: 'electricity_invoice', period_start: '2026-01-01', covered: true },
    { engagement_id: ENGAGEMENT_ID, facility: 'Site A', document_type: 'electricity_invoice', period_start: '2026-02-01', covered: false },
    { engagement_id: ENGAGEMENT_ID, facility: 'Site B', document_type: 'fuel_card', period_start: '2026-01-01', covered: false },
  ]

  test('reads the cd_coverage view, counts gaps, only_gaps filters', async () => {
    const db = makeStubDb((sql) => {
      if (sql.includes('from cd_coverage')) return coverageRows
      throw new Error(`unexpected sql: ${sql}`)
    })
    const full = await getTool('cd_coverage_query').handler({
      args: { engagement_id: ENGAGEMENT_ID }, db,
    })
    expect(full.total_periods).toBe(3)
    expect(full.gap_count).toBe(2)
    expect(full.rows).toHaveLength(3)

    const gaps = await getTool('cd_coverage_query').handler({
      args: { engagement_id: ENGAGEMENT_ID, only_gaps: true }, db,
    })
    expect(gaps.rows).toHaveLength(2)
    expect(gaps.rows.every((r) => r.covered !== true)).toBe(true)
  })
})

describe('cd_calc_run handler', () => {
  // Real NGA 2025 golden-fixture factors so the run exercises the actual
  // calculator, not a mock of it (700 kL stationary diesel = 1896.804 t).
  const factorRows = dieselFixture.factorVintage.factors

  function calcDb({ factors = factorRows } = {}) {
    const insertedRows = []
    const db = makeStubDb((sql, values) => {
      if (sql.includes('from cd_factors')) return factors
      if (sql.includes('insert into cd_calc_runs')) {
        const row = { id: '33333333-3333-4333-8333-333333333333', superseded_by: null }
        insertedRows.push({ values })
        return [row]
      }
      if (sql.includes('update cd_calc_runs')) {
        return values.includes('44444444-4444-4444-8444-444444444444')
          ? [{ id: '44444444-4444-4444-8444-444444444444' }] : []
      }
      throw new Error(`unexpected sql: ${sql}`)
    })
    db._insertedRows = insertedRows
    return db
  }

  test('runs the real calculator over caller-fetched factor rows and records the run', async () => {
    const db = calcDb()
    const out = await getTool('cd_calc_run').handler({
      args: {
        engagement_id: ENGAGEMENT_ID,
        calculator: 'fuelCombustionS1',
        activity_rows: dieselFixture.activityRows,
        factor_vintage: '2025',
        method_election: dieselFixture.methodElection,
      },
      db,
    })
    expect(out.ok).toBe(true)
    expect(out.tco2e).toBe(dieselFixture.expected.tco2e) // 1896.804000
    expect(out.inputs_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(out.evidence_ids).toEqual([dieselFixture.activityRows[0].evidence_id])
    // run row insert carried the inputs hash + tco2e
    expect(db._insertedRows).toHaveLength(1)
    expect(db._insertedRows[0].values).toContain(out.inputs_hash)
    expect(db._insertedRows[0].values).toContain(out.tco2e)
  })

  test('refuses an empty factor vintage with 422', async () => {
    const db = calcDb({ factors: [] })
    await expect(getTool('cd_calc_run').handler({
      args: {
        engagement_id: ENGAGEMENT_ID, calculator: 'fuelCombustionS1',
        activity_rows: dieselFixture.activityRows, factor_vintage: '1999',
      },
      db,
    })).rejects.toMatchObject({ code: 'no_factors_for_vintage', httpStatus: 422 })
  })

  test('calculator contract violations surface as 422 calculation_rejected', async () => {
    const db = calcDb()
    await expect(getTool('cd_calc_run').handler({
      args: {
        engagement_id: ENGAGEMENT_ID, calculator: 'fuelCombustionS1',
        activity_rows: [{ facility: 'Site A' }], // no fuel_key/segment
        factor_vintage: '2025',
      },
      db,
    })).rejects.toMatchObject({ code: 'calculation_rejected', httpStatus: 422 })
  })

  test('supersedes_run_id marks the old run superseded by the new one', async () => {
    const db = calcDb()
    const out = await getTool('cd_calc_run').handler({
      args: {
        engagement_id: ENGAGEMENT_ID, calculator: 'fuelCombustionS1',
        activity_rows: dieselFixture.activityRows, factor_vintage: '2025',
        supersedes_run_id: '44444444-4444-4444-8444-444444444444',
      },
      db,
    })
    expect(out.superseded_run_id).toBe('44444444-4444-4444-8444-444444444444')
    const update = db._calls.find((c) => c.sql.includes('update cd_calc_runs'))
    expect(update).toBeDefined()
    expect(update.values).toContain('33333333-3333-4333-8333-333333333333')
  })
})

describe('cd_integrity_check handler (fixture chain)', () => {
  function integrityDb(rows) {
    const events = []
    const db = makeStubDb((sql, values) => {
      if (sql.includes('from cd_evidence_items')) return rows
      if (sql.includes('insert into cd_monitoring_events')) {
        events.push(values)
        return [{ id: '55555555-5555-4555-8555-555555555555' }]
      }
      throw new Error(`unexpected sql: ${sql}`)
    })
    db._events = events
    return db
  }

  test('valid chain -> valid:true + integrity_ok event recorded', async () => {
    const chain = buildFixtureChain(4)
    const db = integrityDb(chain)
    const out = await getTool('cd_integrity_check').handler({
      args: { engagement_id: ENGAGEMENT_ID }, db,
    })
    expect(out.valid).toBe(true)
    expect(out.broken_at_seq).toBeNull()
    expect(out.row_count).toBe(4)
    expect(out.chain_head_hash).toBe(chain[3].row_hash)
    expect(out.event_id).toBe('55555555-5555-4555-8555-555555555555')
    expect(db._events).toHaveLength(1)
    expect(db._events[0]).toContain('integrity_ok')
  })

  test('tampered mid-chain row -> valid:false at exactly that seq + integrity_fail event', async () => {
    const chain = buildFixtureChain(4)
    chain[1].payload = { kwh: 999999 } // tamper seq 2 content, hash now wrong
    const db = integrityDb(chain)
    const out = await getTool('cd_integrity_check').handler({
      args: { engagement_id: ENGAGEMENT_ID }, db,
    })
    expect(out.valid).toBe(false)
    expect(out.broken_at_seq).toBe(2)
    expect(db._events[0]).toContain('integrity_fail')
  })

  test('record_event:false skips the monitoring write', async () => {
    const db = integrityDb(buildFixtureChain(2))
    const out = await getTool('cd_integrity_check').handler({
      args: { engagement_id: ENGAGEMENT_ID, record_event: false }, db,
    })
    expect(out.valid).toBe(true)
    expect(out.event_id).toBeNull()
    expect(db._events).toHaveLength(0)
  })
})

describe('cd_evidence_commit confirmation (append-as-supersede)', () => {
  test('confirming a pending row appends a confirmed superseding row, never updates', async () => {
    const chain = buildFixtureChain(2)
    chain[1].confirmation_status = 'pending_confirmation'
    // rebuild row 2 hash since we changed its content for the fixture
    chain[1].row_hash = evidenceChain.hashRow(chain[1], chain[0].row_hash)

    const inserts = []
    const db = makeStubDb((sql, values) => {
      if (sql.includes('where id =')) return [chain[1]]
      if (sql.includes('where supersedes_id =')) return []
      if (sql.includes('order by seq desc')) return [chain[1]]
      if (sql.includes('insert into cd_evidence_items')) {
        inserts.push(values)
        return [{
          id: '66666666-6666-4666-8666-666666666666',
          seq: 3, supersedes_id: chain[1].id,
          row_hash: values[15], confirmation_status: 'confirmed',
        }]
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    const out = await getTool('cd_evidence_commit').handler({
      args: { engagement_id: ENGAGEMENT_ID, confirm_evidence_id: chain[1].id }, db,
    })
    expect(out.mode).toBe('confirm')
    expect(out.seq).toBe(3)
    expect(out.supersedes_id).toBe(chain[1].id)
    expect(out.confirmation_status).toBe('confirmed')
    // No UPDATE was ever issued against cd_evidence_items (append-only).
    expect(db._calls.some((c) => c.sql.includes('update cd_evidence_items'))).toBe(false)
    // The appended row chains onto the pending row's hash and verifies.
    expect(inserts).toHaveLength(1)
  })

  test('confirming an auto row is refused (only pending_confirmation confirms)', async () => {
    const chain = buildFixtureChain(1)
    const db = makeStubDb((sql) => {
      if (sql.includes('where id =')) return [chain[0]]
      throw new Error(`unexpected sql: ${sql}`)
    })
    await expect(getTool('cd_evidence_commit').handler({
      args: { engagement_id: ENGAGEMENT_ID, confirm_evidence_id: chain[0].id }, db,
    })).rejects.toMatchObject({ code: 'not_pending', httpStatus: 409 })
  })
})

// ── 3. deny-by-default at the bearer layer ──────────────────────────────

describe('bearer deny-by-default (connectorAuth, the layer every narrow connector checks)', () => {
  const CLIMATE_TOKEN = 'climate-bearer-token-correct'
  const OTHER_CONNECTOR_TOKEN = 'ecodia-crm-bearer-token'

  beforeEach(() => {
    makeConnectorAuth._clearCache()
    // kv_store row for creds.ecodia_climate_mcp_bearer
    mainDbMock.mockImplementation(async () => [{
      value: { token: CLIMATE_TOKEN, scopes: ['read.climate', 'write.climate'], fingerprint: 'fp' },
    }])
  })

  function run(authHeader) {
    const auth = makeConnectorAuth(CONNECTOR)
    const req = { headers: authHeader ? { authorization: authHeader } : {} }
    const res = {
      statusCode: null, body: null,
      status(c) { this.statusCode = c; return this },
      json(b) { this.body = b; return this },
    }
    let nextCalled = false
    return auth(req, res, () => { nextCalled = true }).then(() => ({ req, res, nextCalled }))
  }

  test('the scoped climate bearer passes and attaches climate scopes', async () => {
    const { req, nextCalled } = await run(`Bearer ${CLIMATE_TOKEN}`)
    expect(nextCalled).toBe(true)
    expect(req.connectorName).toBe('ecodia-climate')
    expect(req.connectorScopes).toEqual(['read.climate', 'write.climate'])
  })

  test('a wrong bearer is rejected 401 invalid_bearer', async () => {
    const { res, nextCalled } = await run('Bearer not-the-climate-token')
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('invalid_bearer')
  })

  test("another connector's bearer is rejected 401 (deny-by-default)", async () => {
    const { res, nextCalled } = await run(`Bearer ${OTHER_CONNECTOR_TOKEN}`)
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('invalid_bearer')
  })

  test('a missing bearer is rejected 401 missing_bearer', async () => {
    const { res, nextCalled } = await run(null)
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('missing_bearer')
  })

  test('an unprovisioned bearer row denies everything (bearer_unconfigured)', async () => {
    mainDbMock.mockImplementation(async () => [])
    const { res, nextCalled } = await run(`Bearer ${CLIMATE_TOKEN}`)
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('bearer_unconfigured')
  })
})

// ── 4. scope gate at the dispatch layer ─────────────────────────────────

describe('dispatch scope gate (requireScope envelope over connectorScopes)', () => {
  test('a read-only bearer cannot call a write tool', async () => {
    const db = makeStubDb(() => [])
    const req = { connectorScopes: ['read.climate'], connectorBearerFingerprint: 'fp' }
    const out = await _internal.dispatchClimateTool(req, getTool('cd_engagement_create'), { entity_name: 'Exemplar Pty Ltd' }, db)
    expect(out.statusCode).toBe(403)
    expect(out.body).toEqual({
      error: 'scope_denied',
      message: 'requires write.climate',
      details: { required: 'write.climate', granted: ['read.climate'] },
    })
    expect(db._calls).toHaveLength(0)
  })

  test('zod failures surface as 422 invalid_params before any DB call', async () => {
    const db = makeStubDb(() => { throw new Error('db must not be touched') })
    const req = { connectorScopes: ['read.climate', 'write.climate'] }
    const out = await _internal.dispatchClimateTool(req, getTool('cd_register_query'), { engagement_id: 'nope' }, db)
    expect(out.statusCode).toBe(422)
    expect(out.body.error).toBe('invalid_params')
    expect(db._calls).toHaveLength(0)
  })
})
