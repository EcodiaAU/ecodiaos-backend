#!/usr/bin/env node
'use strict'

/**
 * climate-exemplar-run.js
 *
 * W9 part 1: Exemplar Pty Ltd, a SYNTHETIC engagement run end to end on the LIVE
 * dedicated Supabase project (ecodia-climate-zero, ref cxaaaomqjszlpobcfkmg), beside
 * (and never touching) engagement zero. Stage-1 exit criterion 3 plus the W9 gate,
 * drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md. Publication
 * (public page + Polygon anchor) is a separate later step.
 *
 * SYNTHETIC DATA: Exemplar Pty Ltd is a fictional company. Every fixture file and
 * every notes/payload field written by this script carries that label.
 *
 * Design choice, documented: activity quantities MIRROR the published NGA Factors
 * 2025 worked examples (the calculators' golden fixtures), so every disclosed figure
 * in the pack is externally checkable against the government's own workbook. Source
 * documents are small text fixtures, not PDFs (simplification recorded here; the
 * ingest MIME/PDF path is exercised by engagement zero with real PDFs).
 *
 * Idempotent: keys on entity_name + period, doc sha256, factor natural key,
 * calc inputs_hash, and draft (clause_ref, version). Safe to re-run.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

const BACKEND = path.resolve(__dirname, '..')
const postgres = require(path.join(BACKEND, 'node_modules', 'postgres'))
const { classifyDocument } = require(path.join(BACKEND, 'src/services/climate/ingest/classify'))
const { buildEvidenceRow, confirmEvidence } = require(path.join(BACKEND, 'src/services/climate/ingest/commitEvidence'))
const { verifyChain, buildAnchorDigest, normaliseFetchedRow } = require(path.join(BACKEND, 'src/services/climate/evidenceChain'))
const calculators = require(path.join(BACKEND, 'src/services/climate/calculators'))
const renderers = require(path.join(BACKEND, 'src/services/climate/renderers'))

const FIXTURES = {
  electricityS2Location: require(path.join(BACKEND, 'src/services/climate/calculators/__tests__/fixtures/nga2025-example1-electricity-location')),
  electricityS2Market: require(path.join(BACKEND, 'src/services/climate/calculators/__tests__/fixtures/nga2025-example2-electricity-market')),
  fuelCombustionS1: require(path.join(BACKEND, 'src/services/climate/calculators/__tests__/fixtures/nga2025-example7-transport-diesel')),
  refrigerantsS1: require(path.join(BACKEND, 'src/services/climate/calculators/__tests__/fixtures/nga2025-example8-refrigerant-r410a')),
}

const ENV_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/climate-zero.env'
const EX_DIR = path.join(BACKEND, 'climate-testing', 'exemplar')
const DOCS_DIR = path.join(EX_DIR, 'docs')
const PACK_DIR = path.join(EX_DIR, 'pack')

const SYNTH = 'SYNTHETIC DATA: Exemplar Pty Ltd is a fictional company.'
const AS_OF = '2026-06-10'
const CLASSIFIER_VERSION = 'ecodiaos-exemplar-run-2026-06-10'

const ENGAGEMENT = {
  entity_name: 'Exemplar Pty Ltd',
  abn: 'SYNTHETIC (fictional company, no ABN)',
  reporting_period_start: '2026-07-01',
  reporting_period_end: '2027-06-30',
  group_classification: 'synthetic_w9_exemplar',
  status: 'setup',
  materiality_threshold: 0,
}

// The synthetic source documents. classification is the honest classifierFn output
// for each (the data is synthetic by construction, so the classifications are exact).
// calcFor names which calculator the evidence row feeds.
const DOCS = [
  {
    key: 'electricity-qld-office',
    file: 'electricity-invoice-qld-office.txt',
    body: `${SYNTH}\nTAX INVOICE (synthetic)\nRetailer: Exemplar Energy Co\nSite: QLD Office, 1 Example St, Brisbane QLD\nNMI: SYN1110000\nBilling period: 1 July 2026 to 30 June 2027 (annualised synthetic statement)\nElectricity consumed: ${FIXTURES.electricityS2Location.activityRows[0].quantity_kwh ?? FIXTURES.electricityS2Location.activityRows[0].quantity} kWh\nState grid: QLD\n`,
    classification: { document_type: 'electricity_invoice', facility: 'site/qld-office', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope2', confidence: 0.92 },
    calcFor: 'electricityS2Location',
    status: 'auto',
  },
  {
    key: 'electricity-nsw-warehouse',
    file: 'electricity-invoice-nsw-warehouse.txt',
    body: `${SYNTH}\nTAX INVOICE (synthetic)\nRetailer: Exemplar Energy Co\nSite: NSW Warehouse, 2 Sample Rd, Sydney NSW\nNMI: SYN2220000\nBilling period: 1 July 2026 to 30 June 2027 (annualised synthetic statement)\nElectricity consumed: ${FIXTURES.electricityS2Market.activityRows[0].quantity_kwh} kWh\nState grid: NSW. Power purchase agreement and LGC surrender per attached PPA statement.\n`,
    classification: { document_type: 'electricity_invoice', facility: 'site/nsw-warehouse', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope2', confidence: 0.9 },
    calcFor: 'electricityS2Market',
    status: 'auto',
  },
  {
    key: 'ppa-nsw-warehouse',
    file: 'ppa-statement-nsw-warehouse.txt',
    body: `${SYNTH}\nPOWER PURCHASE AGREEMENT ANNUAL STATEMENT (synthetic)\nSite: NSW Warehouse\nLGCs surrendered: ${FIXTURES.electricityS2Market.activityRows[0].recs_surrendered_mwh} MWh equivalent\nOn-site generation certificates: ${FIXTURES.electricityS2Market.activityRows[0].recs_onsite_mwh} MWh\nResidual mix applies to the remainder per NGA 2025 market method.\n`,
    classification: { document_type: 'other_evidence', facility: 'site/nsw-warehouse', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope2', confidence: 0.86 },
    calcFor: null,
    status: 'auto',
  },
  {
    key: 'fleet-diesel',
    file: 'fuel-card-statement-fleet.txt',
    body: `${SYNTH}\nFUEL CARD ANNUAL STATEMENT (synthetic)\nFleet: 6 diesel vehicles (post-2004)\nDiesel oil purchased: ${FIXTURES.fuelCombustionS1.activityRows[0].quantity} ${FIXTURES.fuelCombustionS1.activityRows[0].unit}\nSegment: transport\n`,
    classification: { document_type: 'fuel_card_statement', facility: 'fleet/diesel', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope1', confidence: 0.9 },
    calcFor: 'fuelCombustionS1',
    status: 'auto',
  },
  {
    key: 'refrigerant-service',
    file: 'refrigerant-service-record.txt',
    body: `${SYNTH}\nREFRIGERANT SERVICE RECORD (synthetic)\nSite: QLD Office\nEquipment: split system AC\nRefrigerant: R410A, charge ${FIXTURES.refrigerantsS1.activityRows[0].charge_kg} kg, leakage-rate basis\nTechnician: (synthetic record)\n`,
    classification: { document_type: 'refrigerant_service_record', facility: 'site/qld-office', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope1', confidence: 0.88 },
    calcFor: 'refrigerantsS1',
    status: 'auto',
  },
  {
    key: 'waste-invoice',
    file: 'waste-invoice-qld-office.txt',
    body: `${SYNTH}\nWASTE SERVICES INVOICE (synthetic)\nSite: QLD Office\nGeneral waste collected: 4.2 t over the period\nNo emissions method elected for waste yet; expected to stage for review.\n`,
    classification: { document_type: 'waste_invoice', facility: 'site/qld-office', period_start: '2026-07-01', period_end: '2027-06-30', scope_category: 'scope3', confidence: 0.7 },
    calcFor: null,
    status: 'pending_confirmation',
  },
]

// Adversarial probe 3 input: prose in a document's clothing; must be REFUSED.
const NOT_EVIDENCE_DOC = {
  file: 'meeting-notes.txt',
  body: `${SYNTH}\nWeekly ops meeting notes. Discussed the warehouse fitout and the office plants. No quantities, no periods, not evidence of anything.\n`,
  classification: { document_type: 'not_evidence', facility: null, period_start: null, period_end: null, scope_category: 'none', confidence: 0.95 },
}

const DRAFT_CLAUSES = [
  'AASB S2 para 6(a)(i)',
  'AASB S2 para 13(b)',
  'AASB S2 para 25(a)(iv)',
  'AASB S2 para 29(a)(v)',
  'AASB S2 para B28',
  'Corporations Act s 296A(1)-(5)',
]
const GAP_CLAUSE = 'AASB S2 para 29A'

function readDbPassword() {
  const env = fs.readFileSync(ENV_PATH, 'utf8')
  const m = /^CLIMATE_ZERO_DB_PASS=(.+)$/m.exec(env)
  if (!m) throw new Error(`CLIMATE_ZERO_DB_PASS not found in ${ENV_PATH}`)
  return m[1].trim()
}

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

async function fetchChain(sql, engagementId) {
  const raw = await sql`select * from cd_evidence_items where engagement_id = ${engagementId} order by seq asc`
  return { raw: [...raw], normalised: raw.map(normaliseFetchedRow) }
}

async function insertEvidence(sql, row) {
  const [inserted] = await sql`
    insert into cd_evidence_items
      (engagement_id, seq, doc_sha256, storage_path, source_channel, document_type,
       facility, period_start, period_end, scope_category, classifier_version,
       classification_confidence, payload, supersedes_id, prev_hash, row_hash,
       confirmation_status, captured_at)
    values
      (${row.engagement_id}, ${row.seq}, ${row.doc_sha256}, ${row.storage_path},
       ${row.source_channel}, ${row.document_type}, ${row.facility},
       ${row.period_start}, ${row.period_end}, ${row.scope_category},
       ${row.classifier_version}, ${row.classification_confidence},
       ${sql.json(row.payload)}, ${row.supersedes_id}, ${row.prev_hash},
       ${row.row_hash}, ${row.confirmation_status}, ${row.captured_at})
    returning *
  `
  return inserted
}

async function renderPack(sql, engagementId, codeSha) {
  const chain = await fetchChain(sql, engagementId)
  const calcRuns = (await sql`select * from cd_calc_runs where engagement_id = ${engagementId} order by calculator, run_at`).map((r) => ({ ...r }))
  const drafts = (await sql`select * from cd_disclosure_drafts where engagement_id = ${engagementId} order by clause_ref, version`).map((r) => ({ ...r }))
  const clauses = (await sql`select * from cd_clause_register order by clause_ref`).map((r) => ({ ...r }))
  const factorMeta = (await sql`select * from cd_factors where vintage = '2025' order by category, effective_from`).map((r) => ({ ...r }))
  const coverage = (await sql`select * from cd_coverage where engagement_id = ${engagementId} order by facility, period_start`).map((r) => ({ ...r }))
  const gapRows = drafts.filter((d) => d.status === 'gap')
  const elections = [
    { facility: 'site/qld-office', election: 'GHG_PROTOCOL', basis: 'engagement default' },
    { facility: 'site/nsw-warehouse', election: 'GHG_PROTOCOL', basis: 'engagement default' },
    { facility: 'fleet/diesel', election: 'GHG_PROTOCOL', basis: 'engagement default' },
  ]

  const register = renderers.registerExport(chain.normalised)
  const memo = renderers.methodologyMemo(calcRuns, factorMeta, elections)
  const statements = renderers.draftStatements(drafts, clauses)
  const coverageMd = renderers.coverageReport(coverage, gapRows, { asOf: AS_OF })

  const artifacts = [
    { name: 'register.csv', content: register.csv },
    { name: 'register.json', content: register.json },
    { name: 'methodology-memo.md', content: memo },
    { name: 'draft-statements.html', content: statements },
    { name: 'coverage-report.md', content: coverageMd },
  ]
  const { manifest, json } = renderers.packManifest(artifacts)
  return { artifacts: [...artifacts, { name: 'manifest.json', content: json }], packSha: manifest.pack_sha256, chain, calcRuns }
}

async function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true })
  fs.mkdirSync(PACK_DIR, { recursive: true })
  const codeSha = execSync('git rev-parse --short HEAD', { cwd: BACKEND }).toString().trim()
  const sql = postgres({
    host: 'aws-1-ap-southeast-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    username: 'postgres.cxaaaomqjszlpobcfkmg',
    password: readDbPassword(),
    ssl: 'require',
    prepare: false,
    max: 1,
  })
  const started = Date.now()
  const summary = { steps: [], adversarial: [] }

  try {
    // ---- fixtures on disk -----------------------------------------------------------
    for (const doc of [...DOCS, NOT_EVIDENCE_DOC]) {
      fs.writeFileSync(path.join(DOCS_DIR, doc.file), doc.body)
      doc.sha256 = sha256Hex(Buffer.from(doc.body))
    }

    // ---- engagement -------------------------------------------------------------------
    let [engagement] = await sql`
      select * from cd_engagements
      where entity_name = ${ENGAGEMENT.entity_name}
        and reporting_period_start = ${ENGAGEMENT.reporting_period_start}
    `
    if (!engagement) {
      ;[engagement] = await sql`
        insert into cd_engagements
          (entity_name, abn, reporting_period_start, reporting_period_end,
           group_classification, status, materiality_threshold, contacts, scope_boundary)
        values
          (${ENGAGEMENT.entity_name}, ${ENGAGEMENT.abn}, ${ENGAGEMENT.reporting_period_start},
           ${ENGAGEMENT.reporting_period_end}, ${ENGAGEMENT.group_classification},
           ${ENGAGEMENT.status}, ${ENGAGEMENT.materiality_threshold},
           ${sql.json({ note: SYNTH })},
           ${sql.json({ approach: 'operational_control', note: SYNTH, sites: ['site/qld-office', 'site/nsw-warehouse', 'fleet/diesel'] })})
        returning *
      `
      summary.steps.push(`engagement created: ${engagement.id}`)
    } else {
      summary.steps.push(`engagement exists, reusing: ${engagement.id}`)
    }
    const engagementId = engagement.id
    summary.engagement_id = engagementId

    // ---- expected documents ------------------------------------------------------------
    const EXPECTED = [
      ['site/qld-office', 'electricity_invoice'],
      ['site/nsw-warehouse', 'electricity_invoice'],
      ['fleet/diesel', 'fuel_card_statement'],
    ]
    for (const [facility, documentType] of EXPECTED) {
      const existing = await sql`
        select id from cd_expected_documents
        where engagement_id = ${engagementId} and facility = ${facility} and document_type = ${documentType}
      `
      if (existing.length === 0) {
        await sql`
          insert into cd_expected_documents (engagement_id, facility, document_type, cadence, grace_days)
          values (${engagementId}, ${facility}, ${documentType}, 'annual', 30)
        `
      }
    }
    summary.steps.push('expected documents present')

    // ---- factors (idempotent on natural key) --------------------------------------------
    let factorsLoaded = 0
    for (const fx of Object.values(FIXTURES)) {
      for (const f of fx.factorVintage.factors) {
        const existing = await sql`
          select id from cd_factors
          where factor_set = ${f.factor_set} and vintage = ${f.vintage}
            and category = ${f.category} and effective_from = ${f.effective_from}
        `
        if (existing.length > 0) continue
        await sql`
          insert into cd_factors (factor_set, vintage, category, unit, value, effective_from, effective_to, source_url)
          values (${f.factor_set}, ${f.vintage}, ${f.category}, ${f.unit}, ${f.value}, ${f.effective_from}, ${f.effective_to}, ${f.source_url})
        `
        factorsLoaded++
      }
    }
    summary.steps.push(`cd_factors: ${factorsLoaded} loaded (NGA-2025, golden-fixture sourced)`)

    // ---- evidence ingest -----------------------------------------------------------------
    let chain = await fetchChain(sql, engagementId)
    const bySha = new Set(chain.normalised.map((r) => r.doc_sha256))
    const evidenceByKey = {}
    let ingested = 0
    for (const doc of DOCS) {
      if (bySha.has(doc.sha256)) {
        evidenceByKey[doc.key] = chain.normalised.find((r) => r.doc_sha256 === doc.sha256)
        continue
      }
      const classifierFn = () => doc.classification
      const result = await classifyDocument({ filename: doc.file, sha256: doc.sha256 }, doc.body, classifierFn)
      const expectStaged = doc.status === 'pending_confirmation'
      if (result.staged_for_review !== expectStaged) {
        throw new Error(`${doc.key}: staging mismatch, expected staged=${expectStaged}, got ${result.staged_for_review} (${result.failure_code})`)
      }
      const input = {
        engagement_id: engagementId,
        doc_sha256: doc.sha256,
        storage_path: `climate-testing/exemplar/docs/${doc.file}`,
        source_channel: 'manual',
        document_type: result.document_type,
        facility: result.facility,
        period_start: result.period_start,
        period_end: result.period_end,
        scope_category: result.scope_category,
        classifier_version: CLASSIFIER_VERSION,
        classification_confidence: result.confidence,
        payload: { synthetic: true, label: SYNTH, classification_reason: result.reason ?? 'synthetic fixture, honest classification' },
        confirmation_status: doc.status,
        captured_at: new Date('2026-06-10T05:00:00.000Z'),
      }
      const row = buildEvidenceRow(input, chain.normalised)
      const inserted = await insertEvidence(sql, row)
      const norm = normaliseFetchedRow(inserted)
      chain.normalised.push(norm)
      evidenceByKey[doc.key] = norm
      bySha.add(doc.sha256)
      ingested++
    }
    summary.steps.push(`evidence ingested: ${ingested} new, ${DOCS.length - ingested} already in chain`)

    // ---- confirm the pending waste invoice (append-as-supersede) ---------------------------
    chain = await fetchChain(sql, engagementId)
    const pendingWaste = chain.normalised.find(
      (r) => r.doc_sha256 === DOCS.find((d) => d.key === 'waste-invoice').sha256 && r.confirmation_status === 'pending_confirmation'
    )
    const wasteSuperseded = pendingWaste ? chain.normalised.some((r) => r.supersedes_id === pendingWaste.id) : true
    if (pendingWaste && !wasteSuperseded) {
      const confirmed = confirmEvidence(pendingWaste, chain.normalised)
      await insertEvidence(sql, confirmed)
      summary.steps.push(`confirmation appended: seq ${confirmed.seq} supersedes ${pendingWaste.id}`)
    } else {
      summary.steps.push('confirmation already present, skipped')
    }

    // ---- calc runs --------------------------------------------------------------------------
    chain = await fetchChain(sql, engagementId)
    const calcResults = {}
    for (const [calcName, fx] of Object.entries(FIXTURES)) {
      const feedDoc = DOCS.find((d) => d.calcFor === calcName)
      const evidence = chain.normalised.find((r) => r.doc_sha256 === feedDoc.sha256)
      const activityRows = fx.activityRows.map((r) => ({ ...r, evidence_id: evidence.id, facility: feedDoc.classification.facility }))
      const result = calculators[calcName](activityRows, fx.factorVintage, fx.methodElection)
      calcResults[calcName] = { tco2e: result.tco2e, inputsHash: result.inputsHash, golden_expected: fx.expected.tco2e }
      const existing = await sql`
        select id from cd_calc_runs where engagement_id = ${engagementId} and inputs_hash = ${result.inputsHash} and superseded_by is null
      `
      if (existing.length === 0) {
        const evidenceIds = result.evidenceIds && result.evidenceIds.length > 0 ? result.evidenceIds : [evidence.id]
        await sql`
          insert into cd_calc_runs
            (engagement_id, calculator, code_sha, factor_vintage, inputs_hash, evidence_ids, output_tco2e, output_breakdown, run_at)
          values
            (${engagementId}, ${calcName}, ${codeSha}, ${fx.factorVintage.vintage}, ${result.inputsHash},
             ${evidenceIds}, ${result.tco2e}, ${sql.json(result.breakdown ?? {})}, ${new Date('2026-06-10T05:30:00.000Z')})
        `
      }
    }
    summary.calc_results = calcResults
    summary.steps.push(`calc runs present for ${Object.keys(FIXTURES).length} calculators`)

    // ---- disclosure drafts --------------------------------------------------------------------
    const clauseRows = await sql`select clause_ref from cd_clause_register where clause_ref = any(${[...DRAFT_CLAUSES, GAP_CLAUSE]})`
    const present = new Set(clauseRows.map((r) => r.clause_ref))
    const missing = [...DRAFT_CLAUSES, GAP_CLAUSE].filter((c) => !present.has(c))
    if (missing.length > 0) throw new Error(`clause refs missing from register: ${missing.join(', ')}`)
    const allEvidenceIds = chain.normalised.filter((r) => r.confirmation_status !== 'pending_confirmation').map((r) => r.id)
    let draftsCreated = 0
    for (const clauseRef of DRAFT_CLAUSES) {
      const existing = await sql`
        select id from cd_disclosure_drafts where engagement_id = ${engagementId} and clause_ref = ${clauseRef} and version = 1
      `
      if (existing.length > 0) continue
      const text = `${SYNTH} Draft statement for ${clauseRef}: Exemplar Pty Ltd discloses per the cited register evidence; figures recompute from cd_calc_runs (fuel ${calcResults.fuelCombustionS1.tco2e} t, electricity location ${calcResults.electricityS2Location.tco2e} t, market ${calcResults.electricityS2Market.tco2e} t, refrigerants ${calcResults.refrigerantsS1.tco2e} t CO2-e, NGA-2025 vintage).`
      await sql`
        insert into cd_disclosure_drafts (engagement_id, clause_ref, draft_text, evidence_citations, status, version)
        values (${engagementId}, ${clauseRef}, ${text}, ${allEvidenceIds}, 'drafted', 1)
      `
      draftsCreated++
    }
    const gapExisting = await sql`
      select id from cd_disclosure_drafts where engagement_id = ${engagementId} and clause_ref = ${GAP_CLAUSE} and version = 1
    `
    if (gapExisting.length === 0) {
      await sql`
        insert into cd_disclosure_drafts (engagement_id, clause_ref, draft_text, evidence_citations, status, version)
        values (${engagementId}, ${GAP_CLAUSE}, ${`${SYNTH} NAMED GAP: financed-emissions disclosure not applicable evidence not yet gathered; remediation owner: engagement lead.`}, ${'{}'}, 'gap', 1)
      `
      draftsCreated++
    }
    summary.steps.push(`drafts: ${draftsCreated} created`)

    // ---- pack render x2: byte-identical gate ----------------------------------------------------
    const pack1 = await renderPack(sql, engagementId, codeSha)
    for (const a of pack1.artifacts) fs.writeFileSync(path.join(PACK_DIR, a.name), a.content)
    const pack2 = await renderPack(sql, engagementId, codeSha)
    const mismatches = []
    for (let i = 0; i < pack1.artifacts.length; i++) {
      const s1 = sha256Hex(Buffer.from(pack1.artifacts[i].content))
      const s2 = sha256Hex(Buffer.from(pack2.artifacts[i].content))
      if (s1 !== s2) mismatches.push(pack1.artifacts[i].name)
    }
    summary.pack_sha256_run1 = pack1.packSha
    summary.pack_sha256_run2 = pack2.packSha
    summary.byte_identical = mismatches.length === 0 && pack1.packSha === pack2.packSha
    if (!summary.byte_identical) throw new Error(`BYTE-IDENTICAL GATE FAILED: ${mismatches.join(', ')}`)
    summary.steps.push(`pack rendered twice, byte-identical, pack_sha256 ${pack1.packSha}`)

    // ---- live verify ------------------------------------------------------------------------------
    chain = await fetchChain(sql, engagementId)
    const liveVerify = verifyChain(chain.normalised)
    summary.verify_normalised_rows = liveVerify
    if (!liveVerify.valid) throw new Error(`verifyChain broke at seq ${liveVerify.brokenAtSeq}`)
    const digest = buildAnchorDigest(chain.normalised)
    summary.chain = digest

    // ---- adversarial pass ---------------------------------------------------------------------------
    // 1. tamper UPDATE on a historical row
    try {
      await sql`update cd_evidence_items set facility = 'tampered' where id = ${chain.normalised[0].id}`
      summary.adversarial.push({ attempt: 'tamper UPDATE on historical row', expected: 'trigger rejection', observed: 'NOT REJECTED (FAILURE)' })
    } catch (e) {
      summary.adversarial.push({ attempt: 'tamper UPDATE on historical row', expected: 'trigger rejection', observed: `rejected: ${e.message.slice(0, 120)}` })
    }
    // 2. duplicate seq insert
    try {
      const dupe = chain.normalised[0]
      await sql`
        insert into cd_evidence_items (engagement_id, seq, doc_sha256, document_type, prev_hash, row_hash, confirmation_status)
        values (${engagementId}, ${dupe.seq}, ${'0'.repeat(64)}, 'other_evidence', ${dupe.prev_hash}, ${'0'.repeat(64)}, 'auto')
      `
      summary.adversarial.push({ attempt: 'duplicate seq insert', expected: 'unique violation', observed: 'NOT REJECTED (FAILURE)' })
    } catch (e) {
      summary.adversarial.push({ attempt: 'duplicate seq insert', expected: 'unique violation', observed: `rejected: ${e.message.slice(0, 120)}` })
    }
    // 3. not_evidence row through commitEvidence
    try {
      const result = await classifyDocument({ filename: NOT_EVIDENCE_DOC.file, sha256: NOT_EVIDENCE_DOC.sha256 }, NOT_EVIDENCE_DOC.body, () => NOT_EVIDENCE_DOC.classification)
      buildEvidenceRow({
        engagement_id: engagementId,
        doc_sha256: NOT_EVIDENCE_DOC.sha256,
        document_type: result.document_type,
        is_evidence: result.is_evidence,
        confirmation_status: 'auto',
        captured_at: new Date('2026-06-10T05:00:00.000Z'),
      }, chain.normalised)
      summary.adversarial.push({ attempt: 'not_evidence through commitEvidence', expected: 'refusal throw', observed: 'NOT REFUSED (FAILURE)' })
    } catch (e) {
      summary.adversarial.push({ attempt: 'not_evidence through commitEvidence', expected: 'refusal throw', observed: `refused: ${e.message.slice(0, 120)}` })
    }
    // 4. ambiguous duplicate factor
    try {
      const fx = FIXTURES.fuelCombustionS1
      const ambiguous = { vintage: fx.factorVintage.vintage, factors: [...fx.factorVintage.factors, { ...fx.factorVintage.factors[0], id: 'dupe', value: '99' }] }
      calculators.fuelCombustionS1(fx.activityRows, ambiguous, fx.methodElection)
      summary.adversarial.push({ attempt: 'ambiguous duplicate factor', expected: 'factorLoader throw', observed: 'NOT THROWN (FAILURE)' })
    } catch (e) {
      summary.adversarial.push({ attempt: 'ambiguous duplicate factor', expected: 'factorLoader throw', observed: `threw: ${e.message.slice(0, 120)}` })
    }
    const failures = summary.adversarial.filter((a) => a.observed.includes('FAILURE'))
    if (failures.length > 0) throw new Error(`ADVERSARIAL PASS FAILED: ${failures.map((f) => f.attempt).join('; ')}`)

    // ---- monitoring event ------------------------------------------------------------------------------
    await sql`
      insert into cd_monitoring_events (engagement_id, event_type, detail)
      values (${engagementId}, 'integrity_ok',
              ${sql.json({ kind: 'w9_exemplar_run', chain_length: digest.row_count, verified: true, chain_head_hash: digest.chain_head_hash, pack_sha256: pack1.packSha })})
    `
    summary.wall_time_ms = Date.now() - started
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('EXEMPLAR RUN FAILED:', err.message)
  process.exit(1)
})
