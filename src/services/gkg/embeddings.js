'use strict'

/**
 * GKG Phase 2 - Embeddings.
 *
 * For each enriched UIAction (purpose available OR vision_skipped_reason
 * set), compute an embedding vector that fuels semantic retrieval over
 * the GKG. The embedding text is the concatenation of:
 *   handler_name + " | " + window_title + " | " + anchor.name (+role) +
 *   " | " + (purpose OR fallback anchor description)
 *
 * Provider: text-embedding-3-small (1536-dim) via the existing
 * knowledgeGraphService.getBatchEmbeddings helper. Anthropic does not
 * yet ship a GA embeddings API; per the brief, OpenAI is the chosen
 * fallback and matches what the rest of EcodiaOS uses for the cortex
 * memory vector index.
 *
 * Re-using knowledgeGraphService.getBatchEmbeddings means:
 *   - One axios path, one rate-limit pool.
 *   - Sanitisation (max 8000 chars, fallback to per-item on batch fail)
 *     comes for free.
 *   - Future swap to Anthropic embeddings only changes that single
 *     module - GKG callsite is stable.
 *
 * Spec: ~/ecodiaos/docs/gkg-spec-v0.1.md §3.4 (vector retrieval) + §5.3
 * (vector index registration).
 * Authored 7 May 2026 fork_mov80as1_c968cc for GKG Phase 2.
 */

const db = require('../../config/db')
const logger = require('../../config/logger')
const kg = require('../knowledgeGraphService')

const EMBEDDING_DIM = 1536

function _embeddingTextFor(action) {
  const a = action.anchor || {}
  const parts = []
  parts.push(action.handler_name || 'unknown-handler')
  if (action.window_title) parts.push(action.window_title)
  if (a.name) parts.push(`click:"${a.name}"${a.role ? ` (${a.role})` : ''}`)
  else if (a.role) parts.push(`click:${a.role}`)
  if (action.purpose) {
    parts.push(`purpose:${action.purpose}`)
  } else if (action.vision_skipped_reason) {
    // Fallback embedding text uses the structural anchor.
    const neighborStr = Array.isArray(a.neighbors) && a.neighbors.length
      ? ` neighbors:${a.neighbors.slice(0, 3).join(',')}`
      : ''
    parts.push(`anchor:${a.automation_id || a.name || a.role || 'unknown'}${neighborStr}`)
  }
  return parts.filter(Boolean).join(' | ')
}

/**
 * Compute embeddings for a list of enriched actions and mark embedded_at
 * row-by-row. Returns the list with `embedding` + `embedding_text`
 * attached when successful.
 */
async function embedActionsBatch(actions) {
  if (!actions || !actions.length) return []

  const texts = actions.map(_embeddingTextFor)

  // Sanity-check the helper exists before calling. Hot-fix forensic note:
  // pre-8 May 2026, kg.getBatchEmbeddings was DEFINED in
  // knowledgeGraphService.js but NOT EXPORTED, so this call evaluated to
  // `undefined(...)` and threw `TypeError: kg.getBatchEmbeddings is not a
  // function`. The catch silently swallowed it and every batch returned
  // all-nulls. Surface it loudly so the same drift can't recur silently.
  if (typeof kg.getBatchEmbeddings !== 'function') {
    logger.error('gkg.embeddings: kg.getBatchEmbeddings is not a function (export drift?)', {
      typeofValue: typeof kg.getBatchEmbeddings,
      kgKeys: Object.keys(kg).slice(0, 30),
    })
    throw new Error('gkg.embeddings: knowledgeGraphService.getBatchEmbeddings is not exported')
  }

  let vectors
  try {
    vectors = await kg.getBatchEmbeddings(texts)
  } catch (err) {
    logger.error('gkg.embeddings: getBatchEmbeddings threw', {
      err: err.message,
      stack: err.stack,
      sampleText: texts[0]?.slice(0, 200),
    })
    vectors = texts.map(() => null)
  }

  const out = []
  for (let i = 0; i < actions.length; i++) {
    const v = vectors[i]
    const enriched = {
      ...actions[i],
      embedding_text: texts[i],
      embedding: Array.isArray(v) && v.length === EMBEDDING_DIM ? v : null,
    }
    out.push(enriched)

    try {
      await db`
        UPDATE gkg_events SET embedded_at = NOW()
        WHERE id = ${actions[i].event_id}::uuid AND embedded_at IS NULL
      `
    } catch (err) {
      logger.warn('gkg.embeddings: embedded_at update failed', {
        event_id: actions[i].event_id, err: err.message,
      })
    }
  }

  const successCount = out.filter(a => a.embedding).length
  logger.info('gkg.embeddings: batch embedded', {
    requested: actions.length,
    succeeded: successCount,
    failed: out.length - successCount,
  })

  return out
}

module.exports = {
  embedActionsBatch,
  _embeddingTextFor,
  EMBEDDING_DIM,
}
