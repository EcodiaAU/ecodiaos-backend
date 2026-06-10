'use strict'

/**
 * ecodia-climate MCP connector - the cd_* tool family (climate-disclosure W7).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W7)
 *
 * Twelve tools, each carrying:
 *   name        - cd_* tool name (the connector allowlist in manifest.js)
 *   description - one-liner (tools/list serves the first line only)
 *   scope       - 'read.climate' | 'write.climate', checked against
 *                 req.connectorScopes with the exact requireScope envelope
 *   schema      - explicit zod schema, .strict(): unknown params REJECT.
 *                 Per mcp-tool-param-schema-discipline +
 *                 mcp-schemas-must-explicitly-declare-passthrough-ctx-args,
 *                 the ctx arg cowork_session_id is DECLARED on every tool,
 *                 never smuggled via .passthrough().
 *   inputSchema - JSON-schema mirror served by tools/describe (the narrow
 *                 connectors serve deferred tools/list + full describe)
 *   handler     - async ({ args, db }) -> result object. db is the dedicated
 *                 ecodia-climate postgres.js client (service-role; NEVER the
 *                 EcodiaOS substrate project). Handlers own the row fetches
 *                 and pass caller-fetched rows into the pure climate libs
 *                 (evidenceChain / calculators / renderers), per the W2/W3/W6
 *                 convention. Errors carry err.httpStatus + err.code; the
 *                 router maps them onto the shared error envelope.
 *
 * Type round-trip note (provisioning-day verify item): the evidence hash is
 * computed over JS values at write time and recomputed over DB-fetched rows
 * at verify time. postgres.js returns bigint/numeric as strings and
 * timestamptz as Date, so BOTH sides go through normaliseForChain() below
 * before hashing. If the fetched representation ever drifts from this
 * normalisation (driver upgrade, type parser change), cd_integrity_check is
 * the canary: it fails loudly, never silently.
 */

const { z } = require('zod')
const evidenceChain = require('../evidenceChain')
const calculators = require('../calculators')
const renderers = require('../renderers')

// ── shared schema fragments ─────────────────────────────────────────────

const UUID = z.string().uuid()
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
const ISO_TIMESTAMP = z.string().datetime({ offset: true })
const SHA256_HEX = z.string().regex(/^[0-9a-f]{64}$/, 'must be lowercase sha256 hex (64 chars)')

// Explicit JSON value - bounded recursion instead of z.any()/passthrough.
const JSON_VALUE = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(JSON_VALUE), z.record(JSON_VALUE)])
)
const JSON_OBJECT = z.record(JSON_VALUE)

// Passthrough ctx args, declared explicitly on every tool (the pattern).
const CTX_ARGS = {
  cowork_session_id: z.string().optional(),
}
const CTX_JSON_PROPS = {
  cowork_session_id: { type: 'string', description: 'Caller session id, audit passthrough' },
}

const ENGAGEMENT_STATUS = z.enum(['setup', 'retainer', 'paused', 'closed'])
const SOURCE_CHANNEL = z.enum(['email', 'workbook', 'api', 'manual'])
const DRAFT_STATUS = z.enum(['drafted', 'gap', 'entity_review', 'final'])
const EVENT_TYPE = z.enum([
  'factor_update', 'coverage_gap', 'drift', 'threshold_breach',
  'integrity_ok', 'integrity_fail', 'classifier_sample',
])
const CALCULATOR_NAME = z.enum([
  'fuelCombustionS1', 'refrigerantsS1', 'electricityS2Location', 'electricityS2Market',
])

// Activity rows are heterogeneous per calculator; the calculators themselves
// validate and THROW on malformed rows (fuel_key/segment, refrigerant/basis,
// grid, quantity_kwh...). The schema declares the cross-calculator superset
// explicitly and stays .strict() - no anything-goes passthrough.
const ACTIVITY_ROW = z.object({
  evidence_id: UUID.optional(),
  evidence_ids: z.array(UUID).optional(),
  facility: z.string().optional(),
  period_start: ISO_DATE.optional(),
  period_end: ISO_DATE.optional(),
  // fuelCombustionS1
  fuel_key: z.string().optional(),
  segment: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional(),
  // refrigerantsS1
  refrigerant: z.string().optional(),
  basis: z.enum(['leakage_rate', 'topup']).optional(),
  equipment_type: z.string().optional(),
  charge_kg: z.union([z.string(), z.number()]).optional(),
  quantity_kg: z.union([z.string(), z.number()]).optional(),
  // electricityS2Location / electricityS2Market
  grid: z.string().optional(),
  quantity_kwh: z.union([z.string(), z.number()]).optional(),
  exempt_kwh: z.union([z.string(), z.number()]).optional(),
  rpp: z.union([z.string(), z.number()]).optional(),
  jrpp: z.union([z.string(), z.number()]).optional(),
  recs_surrendered_mwh: z.union([z.string(), z.number()]).optional(),
  recs_onsite_mwh: z.union([z.string(), z.number()]).optional(),
}).strict()

const METHOD_ELECTION = z.object({
  default: z.enum(['GHG_PROTOCOL', 'NGER_METHOD_1']).optional(),
  perFacility: z.record(z.enum(['GHG_PROTOCOL', 'NGER_METHOD_1'])).optional(),
}).strict()

// Evidence content fields shared by cd_evidence_stage and cd_evidence_commit.
const EVIDENCE_CONTENT_FIELDS = {
  doc_sha256: SHA256_HEX,
  storage_path: z.string().min(1),
  source_channel: SOURCE_CHANNEL,
  document_type: z.string().min(1).optional(),
  facility: z.string().min(1).optional(),
  period_start: ISO_DATE.optional(),
  period_end: ISO_DATE.optional(),
  scope_category: z.string().optional(),
  classifier_version: z.string().optional(),
  classification_confidence: z.number().min(0).max(1).optional(),
  payload: JSON_OBJECT.optional(),
  captured_at: ISO_TIMESTAMP.optional(),
}
const EVIDENCE_CONTENT_JSON_PROPS = {
  doc_sha256: { type: 'string', description: 'sha256 hex of the source document bytes' },
  storage_path: { type: 'string', description: 'Path in the private evidence bucket' },
  source_channel: { type: 'string', enum: ['email', 'workbook', 'api', 'manual'] },
  document_type: { type: 'string' },
  facility: { type: 'string' },
  period_start: { type: 'string', description: 'YYYY-MM-DD' },
  period_end: { type: 'string', description: 'YYYY-MM-DD' },
  scope_category: { type: 'string' },
  classifier_version: { type: 'string' },
  classification_confidence: { type: 'number', minimum: 0, maximum: 1 },
  payload: { type: 'object', description: 'Extracted structured content (JSON)' },
  captured_at: { type: 'string', description: 'ISO-8601 timestamp the document was captured' },
}

// ── error helper (mirrors cowork.stripeAgent._scopeError mechanics) ─────

function toolError(message, code, httpStatus, details) {
  const err = new Error(message)
  err.code = code
  err.httpStatus = httpStatus
  if (details) err.details = details
  return err
}

// ── chain normalisation (write-side AND verify-side, see header note) ───

function _isoOrNull(value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

function _dateStrOrNull(value) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

/**
 * normaliseForChain(row) -> the canonical JS representation of an evidence
 * row's CONTENT_COLUMNS, applied identically before hashing at write time and
 * before verifyChain over DB-fetched rows (postgres.js returns bigint/numeric
 * as strings, date as 'YYYY-MM-DD' string, timestamptz as Date).
 */
function normaliseForChain(row) {
  return {
    ...row,
    seq: row.seq == null ? null : Number(row.seq),
    classification_confidence:
      row.classification_confidence == null ? null : Number(row.classification_confidence),
    period_start: _dateStrOrNull(row.period_start),
    period_end: _dateStrOrNull(row.period_end),
    captured_at: _isoOrNull(row.captured_at),
  }
}

/**
 * Append one row to an engagement's evidence chain: fetch the chain tail,
 * link prev_hash, compute row_hash over the normalised content, insert.
 * unique(engagement_id, seq) turns a concurrent append into a 409 for one
 * side; the caller retries (append-only means there is nothing to merge).
 */
async function appendEvidenceRow(db, engagementId, content, confirmationStatus, supersedesId) {
  const tailRows = await db`
    select seq, row_hash from cd_evidence_items
    where engagement_id = ${engagementId}
    order by seq desc
    limit 1
  `
  const tail = tailRows[0] || null
  const seq = tail ? Number(tail.seq) + 1 : 1
  const prevHash = tail ? tail.row_hash : null

  const chainRow = normaliseForChain({
    engagement_id: engagementId,
    seq,
    doc_sha256: content.doc_sha256 ?? null,
    storage_path: content.storage_path ?? null,
    source_channel: content.source_channel ?? null,
    document_type: content.document_type ?? null,
    facility: content.facility ?? null,
    period_start: content.period_start ?? null,
    period_end: content.period_end ?? null,
    scope_category: content.scope_category ?? null,
    classifier_version: content.classifier_version ?? null,
    classification_confidence: content.classification_confidence ?? null,
    payload: content.payload ?? null,
    supersedes_id: supersedesId ?? null,
    confirmation_status: confirmationStatus,
    captured_at: content.captured_at ?? null,
  })
  const rowHash = evidenceChain.hashRow(chainRow, prevHash)

  let inserted
  try {
    inserted = await db`
      insert into cd_evidence_items (
        engagement_id, seq, doc_sha256, storage_path, source_channel,
        document_type, facility, period_start, period_end, scope_category,
        classifier_version, classification_confidence, payload,
        supersedes_id, prev_hash, row_hash, confirmation_status, captured_at
      ) values (
        ${chainRow.engagement_id}, ${chainRow.seq}, ${chainRow.doc_sha256},
        ${chainRow.storage_path}, ${chainRow.source_channel},
        ${chainRow.document_type}, ${chainRow.facility},
        ${chainRow.period_start}, ${chainRow.period_end},
        ${chainRow.scope_category}, ${chainRow.classifier_version},
        ${chainRow.classification_confidence},
        ${chainRow.payload == null ? null : JSON.stringify(chainRow.payload)}::jsonb,
        ${chainRow.supersedes_id}, ${prevHash}, ${rowHash},
        ${chainRow.confirmation_status}, ${chainRow.captured_at}
      )
      returning *
    `
  } catch (err) {
    if (err && /unique|duplicate/i.test(err.message || '')) {
      throw toolError(
        `evidence chain seq conflict at seq ${seq} (concurrent append); retry`,
        'chain_seq_conflict', 409
      )
    }
    throw err
  }
  return inserted[0]
}

// ── the 12 tools ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'cd_engagement_create',
    description: 'Create a climate-disclosure engagement (cd_engagements row).',
    scope: 'write.climate',
    schema: z.object({
      entity_name: z.string().min(1),
      abn: z.string().regex(/^\d{11}$/, 'ABN is 11 digits').optional(),
      reporting_period_start: ISO_DATE.optional(),
      reporting_period_end: ISO_DATE.optional(),
      group_classification: z.string().optional(),
      contacts: JSON_OBJECT.optional(),
      scope_boundary: JSON_OBJECT.optional(),
      status: ENGAGEMENT_STATUS.optional(),
      materiality_threshold: z.number().positive().optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string' },
        abn: { type: 'string', description: '11-digit ABN' },
        reporting_period_start: { type: 'string', description: 'YYYY-MM-DD' },
        reporting_period_end: { type: 'string', description: 'YYYY-MM-DD' },
        group_classification: { type: 'string' },
        contacts: { type: 'object' },
        scope_boundary: { type: 'object' },
        status: { type: 'string', enum: ['setup', 'retainer', 'paused', 'closed'] },
        materiality_threshold: { type: 'number' },
        ...CTX_JSON_PROPS,
      },
      required: ['entity_name'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const rows = await db`
        insert into cd_engagements (
          entity_name, abn, reporting_period_start, reporting_period_end,
          group_classification, contacts, scope_boundary, status, materiality_threshold
        ) values (
          ${args.entity_name}, ${args.abn ?? null},
          ${args.reporting_period_start ?? null}, ${args.reporting_period_end ?? null},
          ${args.group_classification ?? null},
          ${args.contacts == null ? null : JSON.stringify(args.contacts)}::jsonb,
          ${args.scope_boundary == null ? null : JSON.stringify(args.scope_boundary)}::jsonb,
          ${args.status ?? 'setup'}, ${args.materiality_threshold ?? null}
        )
        returning *
      `
      return { ok: true, engagement: rows[0] }
    },
  },

  {
    name: 'cd_engagement_query',
    description: 'Query cd_engagements by id or status.',
    scope: 'read.climate',
    schema: z.object({
      id: UUID.optional(),
      status: ENGAGEMENT_STATUS.optional(),
      limit: z.number().int().min(1).max(200).optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Engagement UUID' },
        status: { type: 'string', enum: ['setup', 'retainer', 'paused', 'closed'] },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        ...CTX_JSON_PROPS,
      },
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const rows = await db`
        select * from cd_engagements
        where (${args.id ?? null}::uuid is null or id = ${args.id ?? null})
          and (${args.status ?? null}::text is null or status = ${args.status ?? null})
        order by created_at desc
        limit ${args.limit ?? 50}
      `
      return { ok: true, count: rows.length, engagements: rows }
    },
  },

  {
    name: 'cd_evidence_stage',
    description: 'Stage an evidence item onto the chain as pending_confirmation (excluded from strict coverage and calc input until confirmed).',
    scope: 'write.climate',
    schema: z.object({
      engagement_id: UUID,
      ...EVIDENCE_CONTENT_FIELDS,
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        ...EVIDENCE_CONTENT_JSON_PROPS,
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id', 'doc_sha256', 'storage_path', 'source_channel'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const row = await appendEvidenceRow(db, args.engagement_id, args, 'pending_confirmation', null)
      return {
        ok: true,
        staged: true,
        evidence_id: row.id,
        seq: row.seq,
        row_hash: row.row_hash,
        confirmation_status: row.confirmation_status,
      }
    },
  },

  {
    name: 'cd_evidence_commit',
    description: 'Commit evidence: append a new auto row, or confirm a pending row by appending a superseding confirmed row (append-as-supersede; history is never rewritten).',
    scope: 'write.climate',
    schema: z.object({
      engagement_id: UUID,
      confirm_evidence_id: UUID.optional(),
      doc_sha256: SHA256_HEX.optional(),
      storage_path: z.string().min(1).optional(),
      source_channel: SOURCE_CHANNEL.optional(),
      document_type: z.string().min(1).optional(),
      facility: z.string().min(1).optional(),
      period_start: ISO_DATE.optional(),
      period_end: ISO_DATE.optional(),
      scope_category: z.string().optional(),
      classifier_version: z.string().optional(),
      classification_confidence: z.number().min(0).max(1).optional(),
      payload: JSON_OBJECT.optional(),
      captured_at: ISO_TIMESTAMP.optional(),
      ...CTX_ARGS,
    }).strict().superRefine((val, ctx) => {
      const hasNewEvidence = val.doc_sha256 != null || val.storage_path != null || val.source_channel != null
      if (val.confirm_evidence_id != null && hasNewEvidence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'confirm_evidence_id and new-evidence fields are mutually exclusive: confirmation copies the pending row content (append-as-supersede), it never replaces it',
        })
      }
      if (val.confirm_evidence_id == null) {
        if (val.doc_sha256 == null || val.storage_path == null || val.source_channel == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'either confirm_evidence_id, or doc_sha256 + storage_path + source_channel for a new auto commit',
          })
        }
      }
    }),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        confirm_evidence_id: { type: 'string', description: 'UUID of a pending_confirmation row to confirm (append-as-supersede). Mutually exclusive with the new-evidence fields.' },
        ...EVIDENCE_CONTENT_JSON_PROPS,
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      if (args.confirm_evidence_id == null) {
        // New auto commit: ordinary chain append, confirmation_status 'auto'.
        const row = await appendEvidenceRow(db, args.engagement_id, args, 'auto', null)
        return {
          ok: true, committed: true, mode: 'auto',
          evidence_id: row.id, seq: row.seq, row_hash: row.row_hash,
          confirmation_status: row.confirmation_status,
        }
      }

      // Confirmation mode - append-as-supersede.
      // TODO(evidenceChain.confirmEvidence): a sibling is building the
      // confirmEvidence helper in src/services/climate/evidenceChain.js; when
      // it lands, replace this inline superseding-row construction with it.
      const pendingRows = await db`
        select * from cd_evidence_items where id = ${args.confirm_evidence_id}
      `
      const pending = pendingRows[0]
      if (!pending) {
        throw toolError(`evidence ${args.confirm_evidence_id} not found`, 'evidence_not_found', 404)
      }
      if (String(pending.engagement_id) !== String(args.engagement_id)) {
        throw toolError('evidence belongs to a different engagement', 'engagement_mismatch', 422)
      }
      if (pending.confirmation_status !== 'pending_confirmation') {
        throw toolError(
          `evidence ${args.confirm_evidence_id} is '${pending.confirmation_status}', only pending_confirmation rows can be confirmed`,
          'not_pending', 409
        )
      }
      const already = await db`
        select id from cd_evidence_items where supersedes_id = ${args.confirm_evidence_id} limit 1
      `
      if (already.length > 0) {
        throw toolError(
          `evidence ${args.confirm_evidence_id} already superseded by ${already[0].id}`,
          'already_superseded', 409
        )
      }

      const normalisedPending = normaliseForChain(pending)
      const content = {
        doc_sha256: normalisedPending.doc_sha256,
        storage_path: normalisedPending.storage_path,
        source_channel: normalisedPending.source_channel,
        document_type: normalisedPending.document_type,
        facility: normalisedPending.facility,
        period_start: normalisedPending.period_start,
        period_end: normalisedPending.period_end,
        scope_category: normalisedPending.scope_category,
        classifier_version: normalisedPending.classifier_version,
        classification_confidence: normalisedPending.classification_confidence,
        payload: normalisedPending.payload,
        captured_at: normalisedPending.captured_at,
      }
      const row = await appendEvidenceRow(db, args.engagement_id, content, 'confirmed', pending.id)
      return {
        ok: true, committed: true, mode: 'confirm',
        evidence_id: row.id, seq: row.seq, row_hash: row.row_hash,
        confirmation_status: row.confirmation_status,
        supersedes_id: row.supersedes_id,
      }
    },
  },

  {
    name: 'cd_register_query',
    description: 'Query the evidence register (cd_evidence_items) for an engagement, in chain (seq) order.',
    scope: 'read.climate',
    schema: z.object({
      engagement_id: UUID,
      document_type: z.string().optional(),
      facility: z.string().optional(),
      scope_category: z.string().optional(),
      since_seq: z.number().int().min(0).optional(),
      include_superseded: z.boolean().optional(),
      limit: z.number().int().min(1).max(5000).optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        document_type: { type: 'string' },
        facility: { type: 'string' },
        scope_category: { type: 'string' },
        since_seq: { type: 'integer', minimum: 0 },
        include_superseded: { type: 'boolean', description: 'Default true (the chain is history; superseded rows are content)' },
        limit: { type: 'integer', minimum: 1, maximum: 5000 },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const rows = await db`
        select * from cd_evidence_items
        where engagement_id = ${args.engagement_id}
          and (${args.document_type ?? null}::text is null or document_type = ${args.document_type ?? null})
          and (${args.facility ?? null}::text is null or facility = ${args.facility ?? null})
          and (${args.scope_category ?? null}::text is null or scope_category = ${args.scope_category ?? null})
          and seq >= ${args.since_seq ?? 0}
        order by seq asc
        limit ${args.limit ?? 500}
      `
      let out = rows
      if (args.include_superseded === false) {
        // Superseded = some fetched row points at it. Window-local by design:
        // a superseding row outside the fetched window is invisible here, so
        // callers wanting authoritative current-state fetch unfiltered.
        const supersededIds = new Set(rows.map((r) => r.supersedes_id).filter((x) => x != null).map(String))
        out = rows.filter((r) => !supersededIds.has(String(r.id)))
      }
      return { ok: true, engagement_id: args.engagement_id, count: out.length, rows: out }
    },
  },

  {
    name: 'cd_coverage_query',
    description: 'Query the cd_coverage view (expected documents vs committed evidence per period) for an engagement.',
    scope: 'read.climate',
    schema: z.object({
      engagement_id: UUID,
      only_gaps: z.boolean().optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        only_gaps: { type: 'boolean', description: 'Return only uncovered periods (covered = false)' },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const rows = await db`
        select * from cd_coverage
        where engagement_id = ${args.engagement_id}
        order by facility, document_type, period_start
      `
      const gaps = rows.filter((r) => r.covered !== true)
      return {
        ok: true,
        engagement_id: args.engagement_id,
        total_periods: rows.length,
        gap_count: gaps.length,
        rows: args.only_gaps ? gaps : rows,
      }
    },
  },

  {
    name: 'cd_calc_run',
    description: 'Run one deterministic calculator over supplied activity rows against a cd_factors vintage and record the immutable cd_calc_runs row.',
    scope: 'write.climate',
    schema: z.object({
      engagement_id: UUID,
      calculator: CALCULATOR_NAME,
      activity_rows: z.array(ACTIVITY_ROW).min(1),
      factor_vintage: z.string().min(1),
      method_election: METHOD_ELECTION.optional(),
      code_sha: z.string().optional(),
      supersedes_run_id: UUID.optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        calculator: { type: 'string', enum: ['fuelCombustionS1', 'refrigerantsS1', 'electricityS2Location', 'electricityS2Market'] },
        activity_rows: { type: 'array', items: { type: 'object' }, description: 'Activity rows (each carries evidence_id; shape per calculator)' },
        factor_vintage: { type: 'string', description: "cd_factors vintage, e.g. '2025'" },
        method_election: { type: 'object', description: '{ default?, perFacility? } of GHG_PROTOCOL | NGER_METHOD_1' },
        code_sha: { type: 'string', description: 'Calculator code git SHA recorded on the run' },
        supersedes_run_id: { type: 'string', description: 'Prior run id to mark superseded_by this run' },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id', 'calculator', 'activity_rows', 'factor_vintage'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const factorRows = await db`
        select * from cd_factors where vintage = ${args.factor_vintage}
      `
      if (!factorRows.length) {
        throw toolError(
          `no cd_factors rows for vintage '${args.factor_vintage}' (load the published NGA/NGER vintage first)`,
          'no_factors_for_vintage', 422
        )
      }
      const calcFn = calculators[args.calculator]
      let result
      try {
        result = calcFn(args.activity_rows, { vintage: args.factor_vintage, factors: factorRows }, args.method_election)
      } catch (err) {
        // Calculator contract violations (bad rows, ambiguous factor selection,
        // unsupported election) are caller errors, not server faults.
        throw toolError(err.message, 'calculation_rejected', 422)
      }

      const codeSha = args.code_sha ?? process.env.ECODIA_CODE_SHA ?? null
      const inserted = await db`
        insert into cd_calc_runs (
          engagement_id, calculator, code_sha, factor_vintage, inputs_hash,
          evidence_ids, output_tco2e, output_breakdown
        ) values (
          ${args.engagement_id}, ${args.calculator}, ${codeSha},
          ${args.factor_vintage}, ${result.inputsHash},
          ${result.evidenceIds}::uuid[], ${result.tco2e},
          ${JSON.stringify(result.breakdown)}::jsonb
        )
        returning *
      `
      const run = inserted[0]

      let superseded = null
      if (args.supersedes_run_id) {
        // cd_calc_runs is immutable in content; superseded_by is the one
        // lineage pointer the spec sets on the OLD row (W3 verify gate).
        const updated = await db`
          update cd_calc_runs
          set superseded_by = ${run.id}
          where id = ${args.supersedes_run_id} and superseded_by is null
          returning id
        `
        superseded = updated.length > 0 ? updated[0].id : null
        if (!superseded) {
          throw toolError(
            `supersedes_run_id ${args.supersedes_run_id} not found or already superseded (new run ${run.id} was still recorded)`,
            'supersede_target_unavailable', 409, { run_id: run.id }
          )
        }
      }

      return {
        ok: true,
        run_id: run.id,
        tco2e: result.tco2e,
        inputs_hash: result.inputsHash,
        evidence_ids: result.evidenceIds,
        factor_vintage: args.factor_vintage,
        calculator: args.calculator,
        superseded_run_id: superseded,
        breakdown: result.breakdown,
      }
    },
  },

  {
    name: 'cd_draft_upsert',
    description: 'Write a clause-mapped disclosure draft as a NEW version row (versions append, never rewrite). Non-gap drafts must cite evidence.',
    scope: 'write.climate',
    schema: z.object({
      engagement_id: UUID,
      clause_ref: z.string().min(1),
      draft_text: z.string().min(1),
      evidence_citations: z.array(UUID).optional(),
      status: DRAFT_STATUS,
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        clause_ref: { type: 'string', description: 'cd_clause_register clause_ref' },
        draft_text: { type: 'string' },
        evidence_citations: { type: 'array', items: { type: 'string' }, description: 'cd_evidence_items UUIDs grounding this draft (required unless status=gap)' },
        status: { type: 'string', enum: ['drafted', 'gap', 'entity_review', 'final'] },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id', 'clause_ref', 'draft_text', 'status'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const citations = args.evidence_citations ?? []
      // Mirror of the schema-layer grounding CHECK, surfaced as a friendly
      // 422 instead of a constraint violation.
      if (args.status !== 'gap' && citations.length === 0) {
        throw toolError(
          'a draft that asserts anything must cite evidence_citations; only status=gap rows may be citation-less (grounding CHECK, migration 007)',
          'ungrounded_draft', 422
        )
      }
      const versionRows = await db`
        select coalesce(max(version), 0) + 1 as next_version
        from cd_disclosure_drafts
        where engagement_id = ${args.engagement_id} and clause_ref = ${args.clause_ref}
      `
      const nextVersion = Number(versionRows[0].next_version)
      const inserted = await db`
        insert into cd_disclosure_drafts (
          engagement_id, clause_ref, draft_text, evidence_citations, status, version
        ) values (
          ${args.engagement_id}, ${args.clause_ref}, ${args.draft_text},
          ${citations}::uuid[], ${args.status}, ${nextVersion}
        )
        returning *
      `
      return { ok: true, draft: inserted[0], version: nextVersion }
    },
  },

  {
    name: 'cd_drafts_query',
    description: 'Query disclosure drafts for an engagement (latest version per clause by default).',
    scope: 'read.climate',
    schema: z.object({
      engagement_id: UUID,
      clause_ref: z.string().optional(),
      status: DRAFT_STATUS.optional(),
      latest_only: z.boolean().optional(),
      limit: z.number().int().min(1).max(2000).optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        clause_ref: { type: 'string' },
        status: { type: 'string', enum: ['drafted', 'gap', 'entity_review', 'final'] },
        latest_only: { type: 'boolean', description: 'Default true: only the highest version per clause_ref' },
        limit: { type: 'integer', minimum: 1, maximum: 2000 },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const latestOnly = args.latest_only !== false
      let rows
      if (latestOnly) {
        rows = await db`
          select distinct on (clause_ref) * from cd_disclosure_drafts
          where engagement_id = ${args.engagement_id}
            and (${args.clause_ref ?? null}::text is null or clause_ref = ${args.clause_ref ?? null})
            and (${args.status ?? null}::text is null or status = ${args.status ?? null})
          order by clause_ref, version desc
          limit ${args.limit ?? 500}
        `
      } else {
        rows = await db`
          select * from cd_disclosure_drafts
          where engagement_id = ${args.engagement_id}
            and (${args.clause_ref ?? null}::text is null or clause_ref = ${args.clause_ref ?? null})
            and (${args.status ?? null}::text is null or status = ${args.status ?? null})
          order by clause_ref, version asc
          limit ${args.limit ?? 500}
        `
      }
      return { ok: true, count: rows.length, drafts: rows }
    },
  },

  {
    name: 'cd_pack_export',
    description: 'Render the auditor-facing pack (register CSV/JSON, methodology memo, draft statements, coverage report, byte-reproducible manifest) for an engagement.',
    scope: 'read.climate',
    schema: z.object({
      engagement_id: UUID,
      as_of: ISO_DATE.optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        as_of: { type: 'string', description: "YYYY-MM-DD for the coverage report's overdue column (timestamps are inputs, never the clock)" },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const evidenceRows = await db`
        select * from cd_evidence_items where engagement_id = ${args.engagement_id} order by seq asc
      `
      const calcRuns = await db`
        select * from cd_calc_runs where engagement_id = ${args.engagement_id} order by run_at asc, id asc
      `
      const draftRows = await db`
        select * from cd_disclosure_drafts where engagement_id = ${args.engagement_id} order by clause_ref, version asc
      `
      const clauseRows = await db`
        select * from cd_clause_register order by standard, standard_version, clause_ref
      `
      const coverageRows = await db`
        select * from cd_coverage where engagement_id = ${args.engagement_id} order by facility, document_type, period_start
      `
      const vintages = [...new Set(calcRuns.map((r) => r.factor_vintage).filter((v) => v != null))]
      const factorMeta = vintages.length
        ? await db`select * from cd_factors where vintage = any(${vintages}::text[])`
        : []

      // Elections as recorded on the runs themselves (breakdown rows carry
      // method_election per facility), so the memo reports what was APPLIED.
      const electionSeen = new Set()
      const elections = []
      for (const run of calcRuns) {
        if (run.superseded_by != null) continue
        const breakdown = typeof run.output_breakdown === 'string'
          ? JSON.parse(run.output_breakdown) : run.output_breakdown
        for (const row of (breakdown && Array.isArray(breakdown.rows) ? breakdown.rows : [])) {
          const facility = row.facility ?? '(all facilities)'
          const key = `${facility}|${row.method_election}`
          if (row.method_election && !electionSeen.has(key)) {
            electionSeen.add(key)
            elections.push({ facility, election: row.method_election, basis: 'recorded on calc run' })
          }
        }
      }

      const register = renderers.registerExport(evidenceRows.map(normaliseForChain))
      const memo = renderers.methodologyMemo(calcRuns, factorMeta, elections.length ? elections : undefined)
      const statements = renderers.draftStatements(draftRows, clauseRows)
      const gapRows = draftRows.filter((r) => r.status === 'gap')
      const coverage = renderers.coverageReport(coverageRows, gapRows, args.as_of ? { asOf: args.as_of } : {})

      const artifacts = {
        'register.csv': register.csv,
        'register.json': register.json,
        'methodology-memo.md': memo,
        'draft-statements.html': statements,
        'coverage-report.md': coverage,
      }
      const { manifest, json: manifestJson } = renderers.packManifest(artifacts)
      return {
        ok: true,
        engagement_id: args.engagement_id,
        manifest,
        manifest_json: manifestJson,
        artifacts,
      }
    },
  },

  {
    name: 'cd_integrity_check',
    description: 'Recompute every link of an engagement evidence hash chain and record the integrity_ok/integrity_fail monitoring event (silence is detectable).',
    scope: 'read.climate',
    schema: z.object({
      engagement_id: UUID,
      record_event: z.boolean().optional(),
      ...CTX_ARGS,
    }).strict(),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        record_event: { type: 'boolean', description: 'Default true: write the cd_monitoring_events integrity row' },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      const rows = await db`
        select * from cd_evidence_items where engagement_id = ${args.engagement_id} order by seq asc
      `
      const { valid, brokenAtSeq } = evidenceChain.verifyChain(rows.map(normaliseForChain))
      const head = rows.length ? rows[rows.length - 1] : null
      const detail = {
        row_count: rows.length,
        chain_head_hash: head ? head.row_hash : null,
        chain_head_seq: head ? Number(head.seq) : null,
        broken_at_seq: brokenAtSeq,
      }
      let eventId = null
      if (args.record_event !== false) {
        const inserted = await db`
          insert into cd_monitoring_events (engagement_id, event_type, detail)
          values (${args.engagement_id}, ${valid ? 'integrity_ok' : 'integrity_fail'}, ${JSON.stringify(detail)}::jsonb)
          returning id
        `
        eventId = inserted[0].id
      }
      return { ok: true, valid, ...detail, event_id: eventId }
    },
  },

  {
    name: 'cd_event_log',
    description: 'Write a cd_monitoring_events row, or resolve an open one (resolve_event_id).',
    scope: 'write.climate',
    schema: z.object({
      engagement_id: UUID,
      event_type: EVENT_TYPE.optional(),
      detail: JSON_OBJECT.optional(),
      resolve_event_id: UUID.optional(),
      ...CTX_ARGS,
    }).strict().superRefine((val, ctx) => {
      const log = val.event_type != null
      const resolve = val.resolve_event_id != null
      if (log === resolve) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exactly one of event_type (log a new event) or resolve_event_id (resolve an open event) is required',
        })
      }
    }),
    inputSchema: {
      type: 'object',
      properties: {
        engagement_id: { type: 'string', description: 'Engagement UUID' },
        event_type: { type: 'string', enum: ['factor_update', 'coverage_gap', 'drift', 'threshold_breach', 'integrity_ok', 'integrity_fail', 'classifier_sample'] },
        detail: { type: 'object' },
        resolve_event_id: { type: 'string', description: 'UUID of an open event to mark resolved (mutually exclusive with event_type)' },
        ...CTX_JSON_PROPS,
      },
      required: ['engagement_id'],
      additionalProperties: false,
    },
    async handler({ args, db }) {
      if (args.resolve_event_id != null) {
        const updated = await db`
          update cd_monitoring_events
          set resolved_at = now()
          where id = ${args.resolve_event_id}
            and engagement_id = ${args.engagement_id}
            and resolved_at is null
          returning id, resolved_at
        `
        if (!updated.length) {
          throw toolError(
            `event ${args.resolve_event_id} not found for this engagement, or already resolved`,
            'event_not_resolvable', 409
          )
        }
        return { ok: true, resolved: true, event_id: updated[0].id, resolved_at: updated[0].resolved_at }
      }
      const inserted = await db`
        insert into cd_monitoring_events (engagement_id, event_type, detail)
        values (${args.engagement_id}, ${args.event_type}, ${args.detail == null ? null : JSON.stringify(args.detail)}::jsonb)
        returning *
      `
      return { ok: true, event: inserted[0] }
    },
  },
]

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]))

function getTool(name) {
  return TOOL_MAP.get(name) || null
}

module.exports = {
  TOOLS,
  TOOL_MAP,
  getTool,
  toolError,
  normaliseForChain,
  appendEvidenceRow,
}
