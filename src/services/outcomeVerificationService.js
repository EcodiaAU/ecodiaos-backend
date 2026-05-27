// outcomeVerificationService.js
// Layer 6 of the 24/7 autonomy spec
// (backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md).
//
// Problem: workers report `signal_done` with a result_summary. Doctrine
// (verify-deployed-state-against-narrated-state) says don't trust narration.
// Today there is no automated probe - the conductor must remember to verify.
//
// This service is the probe library. The scheduler completionPass (and any
// other caller seeing a `done` signal) invokes `verify(signal, opts)` which
// runs a per-type probe and returns { verified, evidence, drift_reason }.
//
// Probe registry:
//   commit_sha     - git log HEAD on a repo path matches expected SHA
//   vercel_deploy  - vercel.list_deployments shows a READY deployment for the project
//   email_send     - gmail thread contains an outbound message in the last 5 min
//   status_board   - row with expected name + status exists
//   neo4j_node     - cypher MATCH returns >= 1
//   file_write     - fs.stat confirms file exists and mtime > probe_start_time
//   db_row         - arbitrary SQL returns >= 1 row
//
// New probes register via `registerProbe(type, fn)`. Workers/dispatchers
// declare verify intent in the brief or in their signal_done call:
//   coord.signal_done({task_id, result_summary, result_pointer:'verify:type=commit_sha;repo=...;sha=...'})
//
// Convention: result_pointer starting with `verify:` is parsed as a probe
// spec. Otherwise the caller passes opts.verify = { type, ... }.

const db = require('../config/db')
const logger = require('../config/logger')

const PROBES = new Map()

function registerProbe(type, fn) {
  if (typeof type !== 'string' || typeof fn !== 'function') {
    throw new Error('registerProbe(type:string, fn:function)')
  }
  PROBES.set(type, fn)
}

function parseSpec(pointer) {
  // verify:type=commit_sha;repo=/path;sha=abc123
  if (!pointer || typeof pointer !== 'string' || !pointer.startsWith('verify:')) return null
  const body = pointer.slice('verify:'.length)
  const out = {}
  for (const seg of body.split(';')) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    out[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim()
  }
  return out
}

async function verify(spec, ctx = {}) {
  if (!spec || !spec.type) {
    return { verified: false, drift_reason: 'no_spec' }
  }
  const probe = PROBES.get(spec.type)
  if (!probe) {
    return { verified: false, drift_reason: `unknown_probe_type:${spec.type}` }
  }
  try {
    const r = await probe(spec, ctx)
    if (typeof r !== 'object' || r === null) {
      return { verified: false, drift_reason: 'probe_returned_non_object' }
    }
    return {
      verified: !!r.verified,
      evidence: r.evidence ?? null,
      drift_reason: r.drift_reason ?? null,
      probe_type: spec.type,
    }
  } catch (err) {
    logger.warn('outcomeVerification: probe failed', { type: spec.type, error: err.message })
    return { verified: false, drift_reason: `probe_threw:${err.message?.slice(0, 200)}` }
  }
}

// Convenience wrapper called by scheduler.completionPass / markComplete.
// Reads spec from signal.result_pointer (if it starts with 'verify:') or
// from opts.verify. If no spec is declared, returns { verified: null } - which
// means "no probe ran, do not treat as failure or success".
async function verifyFromSignal(signal, opts = {}) {
  let spec = null
  if (opts.verify) spec = opts.verify
  else if (signal && signal.result_pointer) spec = parseSpec(signal.result_pointer)
  if (!spec) return { verified: null, drift_reason: null, probe_type: null }
  return verify(spec, { signal })
}

// ─────────────────────────────────────────────────────────────────────────
// Built-in probes
// ─────────────────────────────────────────────────────────────────────────

// status_board: row matches name OR id and (optional) expected status fragment.
registerProbe('status_board', async (spec) => {
  if (!spec.name && !spec.id) return { verified: false, drift_reason: 'spec_missing_name_or_id' }
  const rows = await db`
    SELECT id, name, status, archived_at
    FROM status_board
    WHERE ${spec.id ? db`id = ${spec.id}::uuid` : db`name = ${spec.name}`}
    LIMIT 1
  `
  if (rows.length === 0) return { verified: false, drift_reason: 'row_not_found' }
  const row = rows[0]
  if (spec.status_contains && (!row.status || !row.status.includes(spec.status_contains))) {
    return { verified: false, drift_reason: `status_mismatch:${row.status}`, evidence: row }
  }
  if (spec.archived === 'true' && !row.archived_at) {
    return { verified: false, drift_reason: 'expected_archived_but_active', evidence: row }
  }
  return { verified: true, evidence: { id: row.id, status: row.status, archived: !!row.archived_at } }
})

// db_row: arbitrary SELECT, verified iff at least one row.
// Spec accepts only safe SELECT-shaped templates registered by callers via
// opts; this probe is intentionally limited to a parameter-bound shape:
//   { type:'db_row', table:'kg_episodes', where_column:'id', where_value:'...' }
registerProbe('db_row', async (spec) => {
  if (!spec.table || !spec.where_column || spec.where_value === undefined) {
    return { verified: false, drift_reason: 'spec_incomplete' }
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(spec.table) || !/^[a-z_][a-z0-9_]*$/i.test(spec.where_column)) {
    return { verified: false, drift_reason: 'spec_unsafe_identifier' }
  }
  const sql = `SELECT 1 FROM ${spec.table} WHERE ${spec.where_column} = $1 LIMIT 1`
  const rows = await db.unsafe(sql, [spec.where_value])
  if (rows.length === 0) return { verified: false, drift_reason: 'row_not_found' }
  return { verified: true, evidence: { table: spec.table, where_column: spec.where_column } }
})

// file_write: fs.stat confirms file exists and (optional) mtime > probe_start.
registerProbe('file_write', async (spec) => {
  if (!spec.path) return { verified: false, drift_reason: 'spec_missing_path' }
  const fs = require('fs')
  try {
    const stat = fs.statSync(spec.path)
    if (spec.min_size_bytes) {
      const min = parseInt(spec.min_size_bytes, 10)
      if (stat.size < min) {
        return { verified: false, drift_reason: `size_below_min:${stat.size}<${min}`, evidence: { size: stat.size } }
      }
    }
    if (spec.modified_after_iso) {
      const cutoff = new Date(spec.modified_after_iso).getTime()
      if (stat.mtimeMs < cutoff) {
        return { verified: false, drift_reason: 'mtime_too_old', evidence: { mtime_ms: stat.mtimeMs } }
      }
    }
    return { verified: true, evidence: { size: stat.size, mtime_ms: stat.mtimeMs } }
  } catch (err) {
    return { verified: false, drift_reason: `stat_failed:${err.code || err.message?.slice(0, 80)}` }
  }
})

// neo4j_node: spec.cypher must return at least 1 row.
// To keep the probe library boundary-safe, we ONLY accept a limited template.
// Callers pass { type:'neo4j_node', label:'Decision', name:'...' }.
registerProbe('neo4j_node', async (spec) => {
  if (!spec.label || !spec.name) return { verified: false, drift_reason: 'spec_incomplete' }
  // Cypher labels can't be parameterized - validate against a strict
  // identifier regex before interpolating, mirroring the db_row probe.
  // Backtick-quote the label so even allowed identifiers can't break
  // out of the label position.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec.label)) {
    return { verified: false, drift_reason: 'spec_unsafe_label' }
  }
  try {
    const neo4jService = require('./neo4jService')
    if (!neo4jService || typeof neo4jService.query !== 'function') {
      return { verified: false, drift_reason: 'neo4j_service_unavailable' }
    }
    const cypher = `MATCH (n:\`${spec.label}\` {name: $name}) RETURN n LIMIT 1`
    const r = await neo4jService.query(cypher, { name: spec.name })
    if (!r || !r.records || r.records.length === 0) {
      return { verified: false, drift_reason: 'node_not_found' }
    }
    return { verified: true, evidence: { label: spec.label, name: spec.name } }
  } catch (err) {
    return { verified: false, drift_reason: `neo4j_threw:${err.message?.slice(0, 120)}` }
  }
})

module.exports = {
  registerProbe,
  verify,
  verifyFromSignal,
  parseSpec,
  PROBES,
}
