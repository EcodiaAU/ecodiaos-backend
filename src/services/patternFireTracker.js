'use strict'

/**
 * patternFireTracker — records pattern surfacing + acceptance.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 (memory/perception audit, finding 2.1).
 * Patterns surfaced via patternsRetrieval.semanticSearch had no telemetry on
 * whether the conductor actually acted on them — so there was no way to learn
 * which patterns are useful vs noise.
 *
 * Lifecycle:
 *   recordFire({patterns, turnId, queryText, dispatchEventId})
 *     → one row per pattern, conductor_accepted=NULL
 *
 *   classifyTurn({turnId, responseText, toolCalls})
 *     → for each unacked row in this turn, check whether responseText or
 *       toolCalls reference the pattern's slug. Flip conductor_accepted.
 *
 *   topPatterns({windowDays, minFires})
 *     → returns patterns ranked by acceptance rate. Powers /api/ops/pattern-fire.
 *
 *   coldPatterns({since})
 *     → patterns that have never fired since the given date. Weekly tuning input.
 */

const crypto = require('crypto')
const path = require('path')
const db = require('../config/db')
const logger = require('../config/logger')

function _slug(patternPath) {
  // 'patterns/foo-bar-baz.md' → 'foo-bar-baz'
  if (!patternPath) return null
  const base = path.basename(String(patternPath), '.md')
  return base.toLowerCase()
}

function _hash(s) {
  return crypto.createHash('sha256').update(String(s || '')).digest('hex')
}

/**
 * @param {object} args
 * @param {Array<{path, source?, score?, name?}>} args.patterns — what semanticSearch returned
 * @param {string} [args.turnId]
 * @param {string} [args.queryText]
 * @param {string} [args.dispatchEventId]
 */
async function recordFire({ patterns = [], turnId = null, queryText = null, dispatchEventId = null } = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) return { inserted: 0, ids: [] }
  const queryHash = queryText ? _hash(queryText) : null
  const queryExcerpt = queryText ? String(queryText).slice(0, 300) : null
  const ids = []
  for (const p of patterns) {
    if (!p || !p.path) continue
    try {
      const rows = await db`
        INSERT INTO pattern_fire_event
          (pattern_path, pattern_source, query_text_hash, query_text_excerpt,
           turn_id, dispatch_event_id, similarity_score, metadata)
        VALUES
          (${p.path}, ${p.source || 'filesystem'}, ${queryHash}, ${queryExcerpt},
           ${turnId}, ${dispatchEventId}, ${typeof p.score === 'number' ? p.score : null},
           ${JSON.stringify({ name: p.name || null })}::jsonb)
        RETURNING id
      `
      if (rows.length) ids.push(rows[0].id)
    } catch (err) {
      // Non-fatal: a missing table or transient DB error must not break the
      // surfacing path. The fire just goes unrecorded.
      logger.debug('patternFireTracker.recordFire: insert failed', { error: err.message, path: p.path })
    }
  }
  return { inserted: ids.length, ids }
}

/**
 * Heuristic post-turn classifier. Flips conductor_accepted for every row in
 * this turn based on whether response text or any tool call mentions the
 * pattern's slug.
 */
async function classifyTurn({ turnId, responseText = '', toolCalls = [] } = {}) {
  if (!turnId) return { classified: 0 }
  try {
    const rows = await db`
      SELECT id, pattern_path FROM pattern_fire_event
      WHERE turn_id = ${turnId} AND conductor_accepted IS NULL
    `
    if (rows.length === 0) return { classified: 0 }

    const haystack = [
      String(responseText || ''),
      ...(Array.isArray(toolCalls) ? toolCalls.map(t => JSON.stringify(t || {})) : []),
    ].join('\n').toLowerCase()

    let classified = 0
    for (const r of rows) {
      const slug = _slug(r.pattern_path)
      if (!slug) continue
      const matched = haystack.includes(slug)
      try {
        await db`
          UPDATE pattern_fire_event
          SET conductor_accepted = ${matched},
              acceptance_signal = ${matched ? 'slug_in_response' : 'no_signal'},
              acked_at = NOW()
          WHERE id = ${r.id}
        `
        classified += 1
      } catch (err) {
        logger.debug('patternFireTracker.classifyTurn: update failed', { error: err.message, id: r.id })
      }
    }
    return { classified }
  } catch (err) {
    logger.debug('patternFireTracker.classifyTurn failed', { error: err.message, turnId })
    return { classified: 0 }
  }
}

/**
 * Aggregate by pattern_path. Returns rows ordered by accept_rate ascending so
 * the weekly tuning cron can see noisiest first.
 */
async function topPatterns({ windowDays = 14, minFires = 10 } = {}) {
  try {
    const rows = await db`
      SELECT
        pattern_path,
        COUNT(*)::int AS fires,
        COUNT(*) FILTER (WHERE conductor_accepted = TRUE)::int AS accepts,
        COUNT(*) FILTER (WHERE conductor_accepted IS NULL)::int AS unacked,
        ROUND(
          (COUNT(*) FILTER (WHERE conductor_accepted = TRUE)::numeric
            / NULLIF(COUNT(*) FILTER (WHERE conductor_accepted IS NOT NULL), 0)) * 100,
          1
        ) AS accept_rate_pct
      FROM pattern_fire_event
      WHERE fired_at >= NOW() - (${windowDays}::int * INTERVAL '1 day')
      GROUP BY pattern_path
      HAVING COUNT(*) >= ${minFires}
      ORDER BY accept_rate_pct ASC NULLS LAST, fires DESC
      LIMIT 100
    `
    return rows
  } catch (err) {
    logger.warn('patternFireTracker.topPatterns failed', { error: err.message })
    return []
  }
}

module.exports = {
  recordFire,
  classifyTurn,
  topPatterns,
  // exported for tests
  _slug,
}
