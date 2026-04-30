'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

const _subscribers = []

function subscribe(fn) {
  if (typeof fn === 'function') _subscribers.push(fn)
}

async function publish({ source, kind, data, ts, confidence = 1.0 }) {
  if (!source || !kind) return

  const observed_at = ts ? new Date(ts) : new Date()
  const event = { source, kind, data: data || null, confidence, observed_at }

  try {
    const rows = await db`
      INSERT INTO os_observations (source, kind, data, confidence, observed_at)
      VALUES (${source}, ${kind}, ${JSON.stringify(data || null)}, ${confidence}, ${observed_at})
      RETURNING id
    `
    event.id = rows[0]?.id
  } catch (err) {
    logger.warn('perceptionBus: failed to persist observation', { error: err.message, source, kind })
  }

  for (const fn of _subscribers) {
    try { fn(event) } catch (err) {
      logger.debug('perceptionBus: subscriber threw', { error: err.message })
    }
  }

  // Async promotion check — fire-and-forget
  setImmediate(() => _tryPromote(event).catch(() => {}))

  return event
}

// Promotion policy: score 0-1 based on business relevance.
// > 0.6 → promote to Neo4j Episode node
// < 0.3 → ephemeral (auto-cleaned after 7 days by the prune cron)
// 0.3-0.6 → kept in os_observations for 7 days without promotion

function promotionScore(event) {
  let score = 0
  const kind = (event.kind || '').toLowerCase()
  const source = (event.source || '').toLowerCase()
  const data = event.data || {}

  // About a client? +0.4
  if (data.client_id || data.client_name || kind.includes('client') || kind.includes('crm')) {
    score += 0.4
  }

  // About money? +0.3
  if (kind.includes('invoice') || kind.includes('payment') || kind.includes('billing') ||
      kind.includes('transaction') || source === 'bookkeeper') {
    score += 0.3
  }

  // Error or incident? +0.4
  if (kind.includes('error') || kind.includes('incident') || kind.includes('failure') ||
      kind.includes('crash') || kind.includes('alert')) {
    score += 0.4
  }

  // Contradicts known fact? +0.3 (caller sets data.contradicts_known_fact)
  if (data.contradicts_known_fact) {
    score += 0.3
  }

  // Fork completion (routine) — low value
  if (kind === 'fork_complete' && data.status === 'done') {
    score = Math.max(score - 0.2, 0)
  }

  return Math.min(score, 1.0)
}

async function _tryPromote(event) {
  const score = promotionScore(event)
  if (score < 0.6 || !event.id) return

  try {
    const neo4j = require('./knowledgeGraphService')
    if (!neo4j || typeof neo4j.writeEpisode !== 'function') return

    const episodeTitle = `Observation: ${event.source}/${event.kind}`
    const nodeId = await neo4j.writeEpisode({
      title: episodeTitle,
      content: JSON.stringify(event.data || {}),
      source: `perceptionBus:${event.source}`,
      tags: [event.source, event.kind],
    })

    if (nodeId && event.id) {
      await db`
        UPDATE os_observations
        SET promoted_to_kg = true, kg_node_id = ${String(nodeId)}
        WHERE id = ${event.id}
      `.catch(() => {})
    }
  } catch (err) {
    logger.debug('perceptionBus: promotion to KG failed (non-fatal)', { error: err.message })
  }
}

async function recentSummary(windowMinutes = 60) {
  try {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000)
    const rows = await db`
      SELECT source, kind, data, confidence, observed_at
      FROM os_observations
      WHERE observed_at > ${cutoff}
      ORDER BY observed_at DESC
      LIMIT 20
    `
    if (rows.length === 0) return null

    const lines = []
    const sourceCounts = {}
    for (const r of rows) {
      const src = r.source || 'unknown'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }

    // Header: source distribution
    const distParts = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `${s}(${c})`)
      .join(', ')
    lines.push(`Last ${windowMinutes}min: ${rows.length} events — ${distParts}`)

    // Notable events (high confidence or promoted)
    const notable = rows.filter(r => r.confidence >= 0.7 || promotionScore({ kind: r.kind, source: r.source, data: r.data }) >= 0.6)
    for (const r of notable.slice(0, 5)) {
      const ago = Math.round((Date.now() - new Date(r.observed_at).getTime()) / 60000)
      const snippet = r.data ? JSON.stringify(r.data).slice(0, 80) : ''
      lines.push(`  ${ago}m ago: ${r.source}/${r.kind} ${snippet}`)
    }

    const summary = lines.join('\n').slice(0, 500)
    return summary
  } catch (err) {
    logger.warn('perceptionBus.recentSummary failed', { error: err.message })
    return null
  }
}

async function prune(retentionDays = 7) {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const result = await db`
      DELETE FROM os_observations
      WHERE observed_at < ${cutoff}
        AND promoted_to_kg = false
      RETURNING id
    `
    const count = result.length
    if (count > 0) {
      logger.info('perceptionBus: pruned stale observations', { count, retention_days: retentionDays })
    }
    return count
  } catch (err) {
    logger.warn('perceptionBus.prune failed', { error: err.message })
    return 0
  }
}

module.exports = {
  publish,
  subscribe,
  recentSummary,
  prune,
  promotionScore,
}
