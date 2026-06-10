#!/usr/bin/env node
'use strict'

/**
 * climate-engagement-zero-bootstrap.js
 *
 * ENGAGEMENT ZERO of the climate-disclosure line: Ecodia Pty Ltd itself, on the LIVE
 * dedicated Supabase project (ecodia-climate-zero, ref cxaaaomqjszlpobcfkmg).
 * Stage-1 exit criterion 2, drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md.
 *
 * What it does, idempotently (safe to re-run; keys on natural identity, skips existing):
 *   1. Creates the cd_engagements row for Ecodia Pty Ltd (ACN 693 123 278),
 *      reporting period 2025-07-01 to 2026-06-30, status 'retainer'.
 *   2. Seeds cd_expected_documents: monthly supplier_invoice per recurring cloud vendor.
 *   3. Ingests 6 REAL cloud-vendor invoice PDFs from climate-testing/zoo/raw
 *      (provenance: climate-testing/zoo/MANIFEST.json, pulled from our own mailboxes).
 *      Each goes through the classify contract (classifierFn = EcodiaOS's honest
 *      classification, encoded per-document below; all stage for review because the
 *      pipeline has no spend/usage scope-3 method yet), then commitEvidence.buildEvidenceRow
 *      against the caller-fetched live chain, INSERTed as pending_confirmation.
 *   4. Confirms ONE of them via evidenceChain.confirmEvidence: append-as-supersede,
 *      never UPDATE (the 002 trigger rejects UPDATE for every role).
 *   5. Fetches all live rows back, runs verifyChain (raw AND normalised; the raw result
 *      is recorded as a finding), runs the cd_coverage query, writes the
 *      cd_monitoring_events integrity_ok row, prints a JSON summary, exits 0 on success.
 *
 * Connection: session-mode pooler, postgres.js with prepare:false. The password is read
 * AT RUNTIME from /Users/ecodia/PRIVATE/ecodia-creds/climate-zero.env and never printed.
 *
 * LIVE-TYPE NORMALISATION (the W7 prediction, confirmed against the live DB 2026-06-10):
 * postgres.js returns bigint as string, numeric as string, and date as a Date pinned to
 * UTC midnight. evidenceChain hashes are computed over the JS values the caller supplied
 * at build time (seq as number, confidence as number, period dates as 'YYYY-MM-DD'
 * strings), so raw fetched rows DO NOT re-verify. normaliseFetchedRow() below is the
 * caller-side coercion the evidenceChain contract requires (pure library, caller owns
 * fetch semantics). No library code was changed.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const BACKEND = path.resolve(__dirname, '..')
const postgres = require(path.join(BACKEND, 'node_modules', 'postgres'))
const { PDFParse } = require(path.join(BACKEND, 'node_modules', 'pdf-parse'))
const { classifyDocument } = require(path.join(BACKEND, 'src/services/climate/ingest/classify'))
const { buildEvidenceRow, confirmEvidence } = require(path.join(BACKEND, 'src/services/climate/ingest/commitEvidence'))
const { verifyChain, buildAnchorDigest, normaliseFetchedRow } = require(path.join(BACKEND, 'src/services/climate/evidenceChain'))

const ENV_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/climate-zero.env'
const ZOO_RAW = path.join(BACKEND, 'climate-testing', 'zoo', 'raw')
const MANIFEST_PATH = path.join(BACKEND, 'climate-testing', 'zoo', 'MANIFEST.json')

const ENGAGEMENT = {
  entity_name: 'Ecodia Pty Ltd',
  // Column is `abn`; Ecodia Pty Ltd's identifier on file is the ACN, recorded explicitly
  // as such (the Upstash invoice carries the derived ABN 89 693 123 278).
  abn: 'ACN 693 123 278',
  reporting_period_start: '2025-07-01',
  reporting_period_end: '2026-06-30',
  group_classification: 'voluntary_engagement_zero',
  status: 'retainer', // 001 CHECK: setup | retainer | paused | closed
  materiality_threshold: 0, // everything needs confirmation; engagement zero runs strict
}

// Monthly supplier_invoice expectation per recurring cloud vendor. Anthropic, Supabase
// and Upstash are the brief's floor; Fly.io and DigitalOcean are also recurring monthly
// cloud spend in our real mailboxes (see the zoo), so they are expected too.
const EXPECTED_FACILITIES = [
  'cloud/anthropic',
  'cloud/supabase',
  'cloud/upstash',
  'cloud/fly',
  'cloud/digitalocean',
]

const CLASSIFIER_VERSION = 'ecodiaos-engagement-zero-bootstrap-2026-06-10'

/**
 * The six REAL documents, with EcodiaOS's honest classification encoded per document
 * (the agent is the classifierFn; these were read from the extracted PDF text, periods
 * and usage quantities verified against the documents themselves and the zoo manifest).
 * Confidence is held below the 0.8 threshold deliberately and honestly: the document
 * type and period are unambiguous, but the pipeline has no spend/usage-based scope-3
 * method yet, so per the zoo pass-1 findings these MUST stage for review rather than
 * auto-commit. Payload quantities are kept as strings/integers to avoid float
 * round-trip ambiguity through jsonb numeric.
 */
const DOCS = [
  {
    file: 'b9411a049d88_DigitalOcean_Invoice_2026_May_35312601-546123278_.pdf',
    sha256: 'b9411a049d886b9028be84b69fa1f527f0cea70219f104ab5ea1275de2742507',
    captured_at: 'Mon, 01 Jun 2026 09:25:41 +0000',
    source: { mailbox: 'code@ecodia.au', message_id: '19e8280d59666aea', from: 'DigitalOcean Support <support@digitalocean.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/digitalocean',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      scope_category: 'scope3',
      confidence: 0.7,
    },
    payload_extra: {
      vendor: 'DigitalOcean LLC',
      invoice_number: '546123278',
      total: '43.37 AUD inc GST',
      usage: { droplet_hours: 743, detail: 'ecodia-hub s-2vcpu-2gb 307h + s-4vcpu-8gb 436h' },
      note: 'cloud compute invoice with quantified droplet hours; scope3 cat-1 candidate; no spend/usage method in pipeline yet',
    },
  },
  {
    file: 'f3319f5b909b_Invoice-HAOVH9CQ-0001.pdf',
    sha256: 'f3319f5b909b3289e16156dfbdce5ecf56927ab7657e8d3812a9c12be5e10a5e',
    captured_at: 'Wed, 1 Apr 2026 12:20:22 +0000',
    source: { mailbox: 'tate@ecodia.au', message_id: '19d48fcd858111b0', from: '"Upstash, Inc." <invoice+statements+acct_1HoeMzF0KWKLiikN@stripe.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/upstash',
      period_start: '2026-02-01',
      period_end: '2026-03-31',
      scope_category: 'scope3',
      confidence: 0.72,
    },
    payload_extra: {
      vendor: 'Upstash, Inc.',
      invoice_number: 'HAOVH9CQ-0001',
      total: '7.73 USD',
      usage: { detail: 'pay-as-you-go request cost 2026-02 + 2026-03, storage cost 2026-03' },
      note: 'serverless data platform invoice, usage-billed; period spans two months (Feb request cost + Mar request and storage cost)',
    },
  },
  {
    file: '7fe3fff1d5a6_Invoice-ZBVLXO-00007.pdf',
    sha256: '7fe3fff1d5a66083020b24e300bae7234f30c444fee3bc7bbc62dd54cab2dce5',
    captured_at: 'Sun, 24 May 2026 13:30:28 +0000',
    source: { mailbox: 'tate@ecodia.au', message_id: '19e5a2e125fb5389', from: '"Supabase Pte. Ltd." <invoice+statements@supabase.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/supabase',
      period_start: '2026-04-24',
      period_end: '2026-05-23',
      scope_category: 'scope3',
      confidence: 0.68,
    },
    payload_extra: {
      vendor: 'Supabase Pte. Ltd.',
      invoice_number: 'ZBVLXO-00007',
      usage: { storage_gb_hrs_largest_project: '661.798909', detail: 'per-project compute hours, storage GB-hrs, egress GB, realtime connections' },
      note: 'cloud database invoice with energy-proximate usage quantities; receipt twin exists in zoo (8b224fbe...) and is deliberately NOT ingested (double-count risk)',
    },
  },
  {
    file: 'c2e73b77e407_Invoice-ZBVLXO-00006.pdf',
    sha256: 'c2e73b77e407b7a56eacc5f7cdf68cd8845c291d7ee7d96f48c77414c6eebf9b',
    captured_at: 'Fri, 24 Apr 2026 22:34:23 +0000',
    source: { mailbox: 'tate@ecodia.au', message_id: '19dc1a143f6a3bb3', from: '"Supabase Pte. Ltd." <invoice+statements@supabase.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/supabase',
      period_start: '2026-03-24',
      period_end: '2026-04-23',
      scope_category: 'scope3',
      confidence: 0.68,
    },
    payload_extra: {
      vendor: 'Supabase Pte. Ltd.',
      invoice_number: 'ZBVLXO-00006',
      usage: { detail: 'compute hours, storage GB-hrs (671.334916 largest project), function invocations, realtime' },
      note: 'cloud database invoice, usage-billed; receipt twin in zoo not ingested',
    },
  },
  {
    file: 'e07d4d824997_Invoice-QBVZBHPL-0004.pdf',
    sha256: 'e07d4d82499748a8c7f908217153cc658b994e95c501787f6d2ca7fa9f918f4c',
    captured_at: 'Tue, 2 Jun 2026 05:38:27 +0000',
    source: { mailbox: 'tate@ecodia.au', message_id: '19e86d72b98c8dc0', from: '"Fly.io, Inc." <invoice+statements+acct_19BnkOGco2mvL6zT@stripe.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/fly',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      scope_category: 'scope3',
      confidence: 0.68,
    },
    payload_extra: {
      vendor: 'Fly.io, Inc.',
      invoice_number: 'QBVZBHPL-0004',
      usage: { detail: 'machine-seconds and RAM by region (primary syd), cross-region bandwidth bytes itemised per region' },
      note: 'cloud compute invoice with machine-seconds usage; strongest energy-proximate signal alongside DigitalOcean; receipt twin not ingested',
    },
  },
  {
    file: 'cd30e204ba51_Invoice-QBVZBHPL-0003.pdf',
    sha256: 'cd30e204ba51330f24c3ef375badf23cb7a676a346c953730cd7389c13222d82',
    captured_at: 'Sat, 2 May 2026 05:20:26 +0000',
    source: { mailbox: 'tate@ecodia.au', message_id: '19de7218732323d5', from: '"Fly.io, Inc." <invoice+statements+acct_19BnkOGco2mvL6zT@stripe.com>' },
    classification: {
      document_type: 'supplier_invoice',
      facility: 'cloud/fly',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      scope_category: 'scope3',
      confidence: 0.68,
    },
    payload_extra: {
      vendor: 'Fly.io, Inc.',
      invoice_number: 'QBVZBHPL-0003',
      usage: { detail: 'machine-seconds usage (syd), bandwidth itemised' },
      note: 'cloud compute invoice, usage-billed; receipt twin not ingested',
    },
  },
]

// The one to push through the live confirmation path (append-as-supersede).
const CONFIRM_SHA256 = DOCS[0].sha256 // the DigitalOcean May invoice

function readDbPassword() {
  const env = fs.readFileSync(ENV_PATH, 'utf8')
  const m = /^CLIMATE_ZERO_DB_PASS=(.+)$/m.exec(env)
  if (!m) throw new Error(`CLIMATE_ZERO_DB_PASS not found in ${ENV_PATH}`)
  return m[1].trim()
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * Caller-side coercion of a live-fetched cd_evidence_items row back to the JS shapes
 * that were hashed at build time. Confirmed against the live DB (2026-06-10):
 *   seq                        bigint  -> string  -> Number
 *   classification_confidence  numeric -> string  -> Number
 *   period_start / period_end  date    -> Date(UTC midnight) -> 'YYYY-MM-DD'
 * captured_at (timestamptz -> Date) needs nothing: evidenceChain.normaliseValue
 * renders Date as toISOString(), which matches what was hashed at build time.
 * payload (jsonb -> object) needs nothing: canonicalise sorts keys, and payload values
 * are strings/integers by construction here.
 */
// normaliseFetchedRow now lives in evidenceChain (W2.1 consolidation, 2026-06-10);
// the live findings above are documented on the library implementation.

async function extractText(filePath) {
  const buf = fs.readFileSync(filePath)
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const res = await parser.getText()
    return { buf, text: res.text || '' }
  } finally {
    await parser.destroy()
  }
}

async function fetchChain(sql, engagementId) {
  const raw = await sql`
    select * from cd_evidence_items
    where engagement_id = ${engagementId}
    order by seq asc
  `
  return { raw: [...raw], normalised: raw.map(normaliseFetchedRow) }
}

async function main() {
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

  const summary = { steps: [] }
  try {
    // ---- 1. Engagement (skip-if-exists on entity_name + period) -------------------
    let [engagement] = await sql`
      select * from cd_engagements
      where entity_name = ${ENGAGEMENT.entity_name}
        and reporting_period_start = ${ENGAGEMENT.reporting_period_start}
        and reporting_period_end = ${ENGAGEMENT.reporting_period_end}
    `
    if (engagement) {
      summary.steps.push(`engagement exists, reusing: ${engagement.id}`)
    } else {
      ;[engagement] = await sql`
        insert into cd_engagements
          (entity_name, abn, reporting_period_start, reporting_period_end,
           group_classification, status, materiality_threshold, contacts, scope_boundary)
        values
          (${ENGAGEMENT.entity_name}, ${ENGAGEMENT.abn},
           ${ENGAGEMENT.reporting_period_start}, ${ENGAGEMENT.reporting_period_end},
           ${ENGAGEMENT.group_classification}, ${ENGAGEMENT.status},
           ${ENGAGEMENT.materiality_threshold},
           ${sql.json({ primary_contact: 'tate@ecodia.au', operator: 'EcodiaOS' })},
           ${sql.json({ approach: 'operational_control', entities: ['Ecodia Pty Ltd (ACN 693 123 278)'] })})
        returning *
      `
      summary.steps.push(`engagement created: ${engagement.id}`)
    }
    const engagementId = engagement.id
    summary.engagement_id = engagementId

    // ---- 2. Expected documents (skip-if-exists per facility + type) ---------------
    let expectedCreated = 0
    for (const facility of EXPECTED_FACILITIES) {
      const existing = await sql`
        select id from cd_expected_documents
        where engagement_id = ${engagementId}
          and facility = ${facility}
          and document_type = 'supplier_invoice'
      `
      if (existing.length > 0) continue
      await sql`
        insert into cd_expected_documents (engagement_id, facility, document_type, cadence, grace_days)
        values (${engagementId}, ${facility}, 'supplier_invoice', 'monthly', 14)
      `
      expectedCreated++
    }
    summary.steps.push(`expected documents: ${expectedCreated} created, ${EXPECTED_FACILITIES.length - expectedCreated} already present`)

    // ---- 3. Ingest the real documents (skip-if-exists per doc_sha256) -------------
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    const manifestBySha = new Map(manifest.items.map((i) => [i.sha256, i]))

    let chain = await fetchChain(sql, engagementId)
    const existingShas = new Set(chain.normalised.map((r) => r.doc_sha256))
    let ingested = 0

    for (const doc of DOCS) {
      if (existingShas.has(doc.sha256)) continue

      const filePath = path.join(ZOO_RAW, doc.file)
      const { buf, text } = await extractText(filePath)
      const actualSha = sha256Hex(buf)
      if (actualSha !== doc.sha256) {
        throw new Error(`sha256 mismatch for ${doc.file}: expected ${doc.sha256}, got ${actualSha}`)
      }
      const provenance = manifestBySha.get(doc.sha256) || null

      // The classify contract. classifierFn IS EcodiaOS: the honest classification for
      // this exact document (keyed by sha256) was authored above from the extracted text.
      const docMeta = { filename: doc.file, sha256: doc.sha256, from: doc.source.from }
      const classifierFn = ({ docMeta: meta }) => {
        const known = DOCS.find((d) => d.sha256 === meta.sha256)
        if (!known) throw new Error(`classifierFn has no honest classification for ${meta.sha256}`)
        return known.classification
      }
      const result = await classifyDocument(docMeta, text, classifierFn)
      if (!result.staged_for_review) {
        throw new Error(`${doc.file}: expected staged_for_review (no scope3 method in pipeline yet), got auto-commit`)
      }

      const input = {
        engagement_id: engagementId,
        doc_sha256: doc.sha256,
        storage_path: `climate-testing/zoo/raw/${doc.file}`,
        source_channel: 'email',
        document_type: result.document_type,
        facility: result.facility,
        period_start: result.period_start,
        period_end: result.period_end,
        scope_category: result.scope_category,
        classifier_version: CLASSIFIER_VERSION,
        classification_confidence: result.confidence,
        payload: {
          ...doc.payload_extra,
          classification_reason: result.reason,
          staged_for_review: true,
          provenance: provenance
            ? { source_mailbox: provenance.source_mailbox, source_message_id: provenance.source_message_id, from: provenance.from, subject: provenance.subject, date: provenance.date }
            : doc.source,
        },
        confirmation_status: 'pending_confirmation',
        captured_at: new Date(doc.captured_at),
      }

      const row = buildEvidenceRow(input, chain.normalised)
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
      chain.normalised.push(normaliseFetchedRow(inserted))
      existingShas.add(doc.sha256)
      ingested++
    }
    summary.steps.push(`evidence ingested: ${ingested} new, ${DOCS.length - ingested} already in chain`)

    // ---- 4. Confirm ONE pending row: append-as-supersede, never UPDATE ------------
    chain = await fetchChain(sql, engagementId)
    const pending = chain.normalised.find(
      (r) => r.doc_sha256 === CONFIRM_SHA256 && r.confirmation_status === 'pending_confirmation'
    )
    const alreadySuperseded = pending
      ? chain.normalised.some((r) => r.supersedes_id === pending.id)
      : true
    if (pending && !alreadySuperseded) {
      const confirmed = confirmEvidence(pending, chain.normalised)
      await sql`
        insert into cd_evidence_items
          (engagement_id, seq, doc_sha256, storage_path, source_channel, document_type,
           facility, period_start, period_end, scope_category, classifier_version,
           classification_confidence, payload, supersedes_id, prev_hash, row_hash,
           confirmation_status, captured_at)
        values
          (${confirmed.engagement_id}, ${confirmed.seq}, ${confirmed.doc_sha256},
           ${confirmed.storage_path}, ${confirmed.source_channel}, ${confirmed.document_type},
           ${confirmed.facility}, ${confirmed.period_start}, ${confirmed.period_end},
           ${confirmed.scope_category}, ${confirmed.classifier_version},
           ${confirmed.classification_confidence}, ${sql.json(confirmed.payload)},
           ${confirmed.supersedes_id}, ${confirmed.prev_hash}, ${confirmed.row_hash},
           ${confirmed.confirmation_status}, ${confirmed.captured_at})
      `
      summary.steps.push(`confirmation appended: seq ${confirmed.seq} supersedes ${pending.id} (DigitalOcean May invoice)`)
      summary.confirmation = { superseded_id: pending.id, confirmed_seq: confirmed.seq }
    } else {
      summary.steps.push('confirmation already present (superseding row exists), skipped')
      const conf = chain.normalised.find((r) => r.doc_sha256 === CONFIRM_SHA256 && r.confirmation_status === 'confirmed')
      summary.confirmation = conf ? { superseded_id: conf.supersedes_id, confirmed_seq: conf.seq } : null
    }

    // ---- 5. Live verify ------------------------------------------------------------
    chain = await fetchChain(sql, engagementId)
    const rawVerify = verifyChain(chain.raw)
    const liveVerify = verifyChain(chain.normalised)
    summary.verify_raw_fetched_rows = rawVerify
    summary.verify_normalised_rows = liveVerify
    if (!liveVerify.valid) {
      throw new Error(`HEADLINE PROBE FAILED: verifyChain over normalised live rows broke at seq ${liveVerify.brokenAtSeq}`)
    }
    const digest = buildAnchorDigest(chain.normalised)
    summary.chain = digest

    const coverage = await sql`
      select facility, document_type, period_start, period_end, due_by,
             covered, covered_including_pending
      from cd_coverage
      where engagement_id = ${engagementId}
      order by facility, period_start
    `
    const covered = coverage.filter((r) => r.covered).length
    const coveredIncPending = coverage.filter((r) => r.covered_including_pending).length
    summary.coverage = {
      total_period_slots: coverage.length,
      covered,
      covered_including_pending: coveredIncPending,
      covered_rows: coverage
        .filter((r) => r.covered_including_pending)
        .map((r) => ({
          facility: r.facility,
          period_start: r.period_start instanceof Date ? r.period_start.toISOString().slice(0, 10) : r.period_start,
          period_end: r.period_end instanceof Date ? r.period_end.toISOString().slice(0, 10) : r.period_end,
          covered: r.covered,
          covered_including_pending: r.covered_including_pending,
        })),
    }

    await sql`
      insert into cd_monitoring_events (engagement_id, event_type, detail)
      values (${engagementId}, 'integrity_ok',
              ${sql.json({
                kind: 'engagement_zero_bootstrap',
                chain_length: digest.row_count,
                verified: true,
                chain_head_hash: digest.chain_head_hash,
                seq_to: digest.seq_to,
              })})
    `
    summary.steps.push('integrity_ok monitoring event written')

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('BOOTSTRAP FAILED:', err.message)
  process.exit(1)
})
