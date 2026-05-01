'use strict'

const db = require('../config/db')
const logger = require('../config/logger')

const PROBATION_DAYS = 60
const SIMILARITY_THRESHOLD = 0.85
const WEEKLY_CRON_NAME = 'pattern-evolution-weekly'

let _weeklyTimer = null

// ─── Backfill: trace + last_validated_at on legacy Pattern nodes ────────────

async function backfillLegacyPatterns() {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.runCypher !== 'function') {
      logger.info('patternEvolution: KG not available, skipping backfill')
      return 0
    }

    const result = await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE p.trace IS NULL
      SET p.trace = 'legacy', p.last_validated_at = COALESCE(p.created_at, datetime())
      RETURN COUNT(p) AS updated
    `)
    const updated = result?.records?.[0]?.get('updated')?.toNumber?.() || 0
    if (updated > 0) {
      logger.info('patternEvolution: backfilled legacy patterns', { updated })
    }
    return updated
  } catch (err) {
    logger.warn('patternEvolution.backfillLegacyPatterns failed', { error: err.message })
    return 0
  }
}

// ─── 60-day probation: demote stale patterns ────────────────────────────────

async function demoteStalePatterns() {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.runCypher !== 'function') return 0

    const cutoff = new Date(Date.now() - PROBATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const result = await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE p.last_validated_at < datetime('${cutoff}')
        AND (p.priority IS NULL OR p.priority > 0.1)
      SET p.priority = 0.1
      RETURN COUNT(p) AS demoted
    `)
    const demoted = result?.records?.[0]?.get('demoted')?.toNumber?.() || 0
    if (demoted > 0) {
      logger.info('patternEvolution: demoted stale patterns', { demoted, cutoff })
    }
    return demoted
  } catch (err) {
    logger.warn('patternEvolution.demoteStalePatterns failed', { error: err.message })
    return 0
  }
}

// ─── Refresh: mark a pattern as validated (was surfaced + session succeeded) ─

async function refreshPattern(patternId) {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.runCypher !== 'function') return false

    await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE elementId(p) = $id OR p.name = $id
      SET p.last_validated_at = datetime(), p.priority = CASE WHEN p.priority < 0.5 THEN 0.5 ELSE p.priority END
    `, { id: patternId })
    return true
  } catch (err) {
    logger.debug('patternEvolution.refreshPattern failed', { error: err.message, patternId })
    return false
  }
}

// ─── Contradiction detection ────────────────────────────────────────────────

async function checkContradiction(newPatternText, newPatternId) {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.semanticSearch !== 'function') return []

    // Find semantically similar patterns
    const similar = await kg.semanticSearch(newPatternText, {
      label: 'Pattern',
      limit: 5,
      minScore: SIMILARITY_THRESHOLD,
    })

    if (!similar || similar.length === 0) return []

    // For each highly similar pattern, check contradiction via Claude
    const contradictions = []
    const claudeService = _getClaudeService()
    if (!claudeService) return []

    for (const existing of similar) {
      if (existing.id === newPatternId) continue
      const existingText = existing.content || existing.rule || existing.name || ''
      if (!existingText) continue

      try {
        const response = await claudeService.classifyContradiction(newPatternText, existingText)
        if (response?.contradicts) {
          contradictions.push({
            existing_id: existing.id,
            existing_text: existingText.slice(0, 200),
            similarity: existing.score,
          })

          // Flag both for human review (don't auto-delete)
          try {
            await kg.runCypher(`
              MATCH (p:Pattern)
              WHERE elementId(p) = $id OR p.name = $id
              SET p.needs_human_review = true,
                  p.contradiction_flag = $flag
            `, {
              id: existing.id,
              flag: `Contradicts pattern ${newPatternId}: ${newPatternText.slice(0, 100)}`,
            })
          } catch {}

          logger.info('patternEvolution: contradiction detected', {
            new_pattern: newPatternId,
            existing_pattern: existing.id,
            similarity: existing.score,
          })
        }
      } catch {
        // Contradiction check failed for this pair — skip
      }
    }

    return contradictions
  } catch (err) {
    logger.warn('patternEvolution.checkContradiction failed', { error: err.message })
    return []
  }
}

function _getClaudeService() {
  try {
    const claude = require('./claudeService')
    if (typeof claude.classifyContradiction !== 'function') {
      // Provide a lightweight inline classifier
      return {
        classifyContradiction: async (textA, textB) => {
          const { callDeepSeek } = require('./deepseekService')
          const result = await callDeepSeek([
            { role: 'user', content: `Do these two rules contradict each other? Return JSON {contradicts: true/false, reason: "..."}.\n\nRule A: ${textA}\n\nRule B: ${textB}` },
          ], { module: 'pattern_evolution', model: 'claude-haiku-4-5-20251001', skipRetrieval: true, skipLogging: true })
          try {
            const parsed = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}')
            return { contradicts: !!parsed.contradicts }
          } catch {
            return { contradicts: false }
          }
        },
      }
    }
    return claude
  } catch {
    return null
  }
}

// ─── Weekly meta-learning analysis ──────────────────────────────────────────

async function weeklyMetaLearning() {
  try {
    const kg = require('./knowledgeGraphService')
    if (!kg || typeof kg.runCypher !== 'function') {
      logger.info('patternEvolution: KG not available, skipping weekly meta-learning')
      return null
    }

    // Query pattern usage and session outcomes from the past week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Most surfaced patterns this week
    const surfacedResult = await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE p.last_validated_at >= datetime('${weekAgo}')
      RETURN p.name AS name, p.priority AS priority, p.last_validated_at AS validated
      ORDER BY p.last_validated_at DESC
      LIMIT 10
    `)
    const recentlyValidated = surfacedResult?.records?.map(r => ({
      name: r.get('name'),
      priority: r.get('priority')?.toNumber?.() || r.get('priority'),
    })) || []

    // Stale patterns (not validated recently)
    const staleResult = await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE p.priority <= 0.1
      RETURN COUNT(p) AS stale_count
    `)
    const staleCount = staleResult?.records?.[0]?.get('stale_count')?.toNumber?.() || 0

    // Total pattern count
    const totalResult = await kg.runCypher(`
      MATCH (p:Pattern)
      RETURN COUNT(p) AS total
    `)
    const totalPatterns = totalResult?.records?.[0]?.get('total')?.toNumber?.() || 0

    // Untraced patterns
    const untracedResult = await kg.runCypher(`
      MATCH (p:Pattern)
      WHERE p.trace IS NULL
      RETURN COUNT(p) AS untraced
    `)
    const untracedCount = untracedResult?.records?.[0]?.get('untraced')?.toNumber?.() || 0

    const reflection = {
      week_ending: new Date().toISOString().slice(0, 10),
      total_patterns: totalPatterns,
      stale_demoted: staleCount,
      untraced: untracedCount,
      recently_validated: recentlyValidated.slice(0, 5).map(p => p.name),
      analysis: `Week ending ${new Date().toISOString().slice(0, 10)}: ${totalPatterns} total patterns, ${staleCount} demoted (stale), ${untracedCount} untraced. Top validated: ${recentlyValidated.slice(0, 3).map(p => p.name).join(', ') || 'none'}.`,
    }

    // Write Reflection node to Neo4j
    try {
      await kg.runCypher(`
        CREATE (r:Reflection {
          type: 'weekly_meta_learning',
          content: $content,
          data: $data,
          created_at: datetime()
        })
      `, {
        content: reflection.analysis,
        data: JSON.stringify(reflection),
      })
    } catch (writeErr) {
      logger.warn('patternEvolution: failed to write Reflection node', { error: writeErr.message })
    }

    logger.info('patternEvolution: weekly meta-learning complete', reflection)
    return reflection
  } catch (err) {
    logger.warn('patternEvolution.weeklyMetaLearning failed', { error: err.message })
    return null
  }
}

// ─── Cron scheduling ────────────────────────────────────────────────────────
// Weekly: Sunday 6am AEST (= Saturday 8pm UTC)

function _nextSunday6amAest() {
  const now = new Date()
  const aest = new Date(now.getTime() + AEST_OFFSET_HOURS * 60 * 60 * 1000)
  const dow = aest.getUTCDay()
  const daysUntilSunday = dow === 0 ? 7 : (7 - dow)
  const next = new Date(aest)
  next.setUTCDate(next.getUTCDate() + daysUntilSunday)
  next.setUTCHours(6, 0, 0, 0)
  return new Date(next.getTime() - AEST_OFFSET_HOURS * 60 * 60 * 1000)
}

const AEST_OFFSET_HOURS = 10

async function _weeklyCronTick() {
  logger.info('patternEvolution: weekly cron firing')
  await demoteStalePatterns()
  await weeklyMetaLearning()
}

function start() {
  // Run backfill on startup (idempotent)
  setImmediate(() => backfillLegacyPatterns().catch(() => {}))

  // Schedule weekly cron
  _scheduleWeekly()
  logger.info('patternEvolution: started')
}

function _scheduleWeekly() {
  const nextRun = _nextSunday6amAest()
  const delayMs = Math.max(0, nextRun.getTime() - Date.now())

  // Cap to 7 days to avoid overflow
  const cappedDelay = Math.min(delayMs, 7 * 24 * 60 * 60 * 1000)

  _weeklyTimer = setTimeout(async () => {
    await _weeklyCronTick()
    _scheduleWeekly()
  }, cappedDelay)
}

function stop() {
  if (_weeklyTimer) {
    clearTimeout(_weeklyTimer)
    _weeklyTimer = null
  }
  logger.info('patternEvolution: stopped')
}

module.exports = {
  start,
  stop,
  backfillLegacyPatterns,
  demoteStalePatterns,
  refreshPattern,
  checkContradiction,
  weeklyMetaLearning,
  PROBATION_DAYS,
}
