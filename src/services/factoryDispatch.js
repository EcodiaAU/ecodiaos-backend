'use strict'

/**
 * factoryDispatch - post-migration code-shipping router.
 *
 * Replaces the direct factoryTriggerService -> Redis -> factoryRunner pool
 * with a two-lane dispatch:
 *
 *   - lane='subagent': default. Writes a code_requests row tagged
 *     route='subagent' and returns. The local Claude Code conductor on
 *     Corazon picks the row up on its next orientation pass and spawns
 *     a Task subagent against it.
 *
 *   - lane='factory_cloud': self-modification, critical-path, or
 *     subagent-refused work. POSTs to the factory-cloud Routine /fire
 *     endpoint on money@ecodia.au. The Routine clones the codebase,
 *     ships, pushes a claude/factory-cloud-* branch, opens a PR, and
 *     writes the PR back to the named kv_store key.
 *
 * Spec: backend/docs/FACTORY_MIGRATION_DECISION_2026-05-15.md.
 * Architecture: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §4.
 *
 * The legacy factoryTriggerService.js stays alive during Phase 0-3
 * side-by-side validation. Phase 3 cutover swaps that service's export
 * surface to call dispatch() from this file. Phase 4 deletes the
 * Redis pool entirely.
 */

const crypto = require('node:crypto')
const db = require('../config/db')
const logger = require('../config/logger')
const env = require('../config/env')

// ─── Critical-path classifier ────────────────────────────────────────
//
// Edits to these surfaces always route via factory-cloud, never local
// Task subagents. Editing your own runtime from a subagent in your own
// session is a foot-gun (require-cache wedges, mid-edit compact, lost
// working memory). See factory-phantom-session-no-commit.md and
// audit-low-confidence-factory-commits-on-critical-path.md.

const CRITICAL_PATH_GLOBS = [
  'src/services/osSessionService.js',
  'src/services/factoryDispatch.js',
  'src/services/factoryTriggerService.js',
  'src/services/factoryBridge.js',
  'src/services/observerSignalsService.js',
  'src/middleware/',
  'src/routes/mcp/',
  '.claude/SELF.md',
  '.claude/settings.json',
  'CLAUDE.md',
  'backend/CLAUDE.md',
]

function isCriticalPath(brief, codebase) {
  if (codebase && codebase !== env.FACTORY_SELF_CODEBASE_NAME && codebase !== 'ecodiaos-backend') {
    // Critical-path classifier only fires on the ecodiaos-backend codebase.
    // Client codebases route to subagent regardless.
    return false
  }
  const briefLower = String(brief || '').toLowerCase()
  return CRITICAL_PATH_GLOBS.some(p => briefLower.includes(p.toLowerCase()))
}

// ─── Self-modification flag ──────────────────────────────────────────

function isSelfModification(triggerSource) {
  return triggerSource === 'self_modification'
    || triggerSource === 'self_diagnosis'
    || triggerSource === 'integration_scaffold'
}

// ─── Lane classifier ─────────────────────────────────────────────────

function classifyLane({ brief, codebase, triggerSource, forceLane }) {
  if (forceLane === 'subagent' || forceLane === 'factory_cloud') return forceLane
  if (isSelfModification(triggerSource)) return 'factory_cloud'
  if (isCriticalPath(brief, codebase)) return 'factory_cloud'
  return 'subagent'
}

// ─── Subagent lane: write code_requests row ──────────────────────────

async function _dispatchToSubagent({
  brief, codebase, triggerSource, triggerRefId,
  clientId, projectId, codebaseId, threadId,
}) {
  // The code_requests table is the canonical post-migration work queue.
  // Schema: id, summary, prompt, codebase_id, client_id, project_id,
  // status (pending|in_progress|shipped|failed), source, source_ref_id,
  // session_id (linked cc_sessions row, nullable), created_at,
  // updated_at. Add `route` column lazily (CHECK constraint added in
  // Phase 4 migration; for now route is stored alongside source).

  const summary = String(brief || '').slice(0, 200)
  const route = 'subagent'

  const [row] = await db`
    INSERT INTO code_requests (
      summary, prompt, codebase_id, client_id, project_id,
      status, source, source_ref_id, route, created_at
    ) VALUES (
      ${summary}, ${brief}, ${codebaseId || null}, ${clientId || null}, ${projectId || null},
      'pending', ${triggerSource || 'conductor'}, ${triggerRefId || threadId || null},
      ${route}, now()
    )
    RETURNING id, status, route, created_at
  `

  logger.info(`factoryDispatch: subagent code_request ${row.id} queued`, {
    triggerSource, codebase, codebaseId,
  })

  return { lane: 'subagent', code_request_id: row.id, status: row.status }
}

// ─── factory-cloud lane: POST to Routine /fire ───────────────────────

async function _dispatchToFactoryCloud({
  brief, codebase, triggerSource, triggerRefId, selfModification, untrustedInputWrap,
}) {
  const fireToken = await _getRoutineFireToken('factory-cloud')
  if (!fireToken) {
    logger.error('factoryDispatch: factory-cloud /fire token missing in kv_store.routines.factory-cloud.fire_token')
    return { lane: 'factory_cloud', ok: false, error: 'missing_fire_token' }
  }

  const routeBackKey = `cowork.factory_cloud.run.${crypto.randomUUID()}`
  const payload = {
    brief,
    codebase,
    self_modification: !!selfModification,
    trigger_source: triggerSource || 'conductor',
    trigger_ref_id: triggerRefId || null,
    route_back_kv_key: routeBackKey,
    untrusted_input_wrap: !!untrustedInputWrap,
  }

  // Seed the route_back key so the conductor can spot in-flight runs by
  // listing keys with the kv_store prefix - even before the Routine
  // writes its first update.
  await db`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (
      ${routeBackKey},
      ${JSON.stringify({ status: 'fired', payload, fired_at: new Date().toISOString() })}::jsonb,
      now()
    )
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now()
  `.catch(err => {
    logger.warn('factoryDispatch: failed to seed route_back kv key', { error: err.message, routeBackKey })
  })

  const fireUrl = env.FACTORY_CLOUD_FIRE_URL
    || 'https://api.anthropic.com/v1/claude_code/routines/trig_factory_cloud/fire'

  let fireOk = false
  let fireErr = null
  try {
    const res = await fetch(fireUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fireToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: JSON.stringify(payload) }),
    })
    fireOk = res.ok
    if (!res.ok) {
      fireErr = `fire_${res.status}: ${(await res.text()).slice(0, 400)}`
    }
  } catch (err) {
    fireErr = `fire_exception: ${err.message}`
  }

  if (!fireOk) {
    logger.error('factoryDispatch: factory-cloud /fire failed', { fireErr, routeBackKey })
    // Mark the route_back key as failed so subsequent reads see the error.
    await db`
      UPDATE kv_store SET value = value || ${JSON.stringify({ ok: false, error: fireErr })}::jsonb,
                          updated_at = now()
      WHERE key = ${routeBackKey}
    `.catch(() => {})
    return { lane: 'factory_cloud', ok: false, error: fireErr, route_back_kv_key: routeBackKey }
  }

  logger.info(`factoryDispatch: factory-cloud Routine fired`, {
    triggerSource, codebase, routeBackKey,
  })

  return { lane: 'factory_cloud', ok: true, route_back_kv_key: routeBackKey }
}

async function _getRoutineFireToken(routineName) {
  try {
    const [row] = await db`
      SELECT value FROM kv_store WHERE key = ${`routines.${routineName}.fire_token`} LIMIT 1
    `
    if (!row) return null
    const v = row.value
    if (typeof v === 'string') return v
    return v?.token || v?.fire_token || null
  } catch (err) {
    logger.warn('factoryDispatch: failed to read routine fire token', { routineName, error: err.message })
    return null
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Dispatch a code-shipping request through the post-migration router.
 *
 * @param {object} args
 * @param {string} args.brief - full natural-language brief
 * @param {string} args.codebase - canonical codebase name (e.g. 'ecodiaos-backend')
 * @param {string} [args.codebaseId] - DB id if already resolved
 * @param {string} [args.triggerSource] - one of: cortex|crm_stage|gmail|kg_insight|self_modification|self_diagnosis|integration_scaffold|simula|thymos|proactive|scheduled
 * @param {string} [args.triggerRefId] - id of the source row (email thread, client, incident, etc)
 * @param {string} [args.clientId]
 * @param {string} [args.projectId]
 * @param {string} [args.threadId] - email thread id when relevant
 * @param {boolean} [args.untrustedInputWrap] - true when brief contains external content
 * @param {'subagent'|'factory_cloud'} [args.forceLane] - override the lane classifier
 *
 * @returns {Promise<{lane: string, ...}>}
 */
async function dispatch(args) {
  const lane = classifyLane({
    brief: args.brief,
    codebase: args.codebase,
    triggerSource: args.triggerSource,
    forceLane: args.forceLane,
  })

  if (lane === 'factory_cloud') {
    return _dispatchToFactoryCloud({
      brief: args.brief,
      codebase: args.codebase || env.FACTORY_SELF_CODEBASE_NAME || 'ecodiaos-backend',
      triggerSource: args.triggerSource,
      triggerRefId: args.triggerRefId,
      selfModification: isSelfModification(args.triggerSource),
      untrustedInputWrap: !!args.untrustedInputWrap,
    })
  }

  return _dispatchToSubagent({
    brief: args.brief,
    codebase: args.codebase,
    codebaseId: args.codebaseId,
    triggerSource: args.triggerSource,
    triggerRefId: args.triggerRefId,
    clientId: args.clientId,
    projectId: args.projectId,
    threadId: args.threadId,
  })
}

module.exports = {
  dispatch,
  classifyLane,
  isCriticalPath,
  isSelfModification,
  CRITICAL_PATH_GLOBS,
}
