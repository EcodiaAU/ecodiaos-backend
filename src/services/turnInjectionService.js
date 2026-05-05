'use strict'

/**
 * turnInjectionService - centralised gating + dedupe + telemetry for the
 * per-turn continuity blocks stitched into user messages by
 * osSessionService._sendMessageImpl.
 *
 * Background:
 *   Each turn currently emits up to 8 blocks (<now>, <doctrine_surface>,
 *   <forks_rollup>, <recent_doctrine>, <relevant_memory>,
 *   <perception_summary>, <restart_recovery>, <last_turn_breadcrumb>) and
 *   a typical turn was carrying ~10-12k tokens of repeated injected
 *   context. This service applies three reductions:
 *
 *   (1) Hard caps per block (skills_surface 5->3, memory below threshold
 *       skip, perception requires NEW events vs previous turn).
 *   (2) Per-block dedupe: if this turn's emitted content is byte-identical
 *       to last turn's emission for the same session+block, skip emit.
 *   (3) context_minimal_mode kv_store flag: when enabled (`true`), apply
 *       the most aggressive trim regardless of dedupe - keep only <now> and
 *       any block whose content is genuinely new since previous turn.
 *
 * Always-on blocks (never deduped):
 *   - <now>  - load-bearing per ~/ecodiaos/CLAUDE.md "Temporal Injection".
 *
 * Conditionally on:
 *   - <forks_rollup>  - only emit when active forks > 0 OR includeRecentDone
 *                        produced lines (forkService already handles this).
 *   - <last_turn_breadcrumb>  - only when a previous turn exists (ts present).
 *
 * Dedupe-eligible (compared against previous turn's emission):
 *   - <skills_surface> / <doctrine_surface>
 *   - <recent_doctrine>
 *   - <relevant_memory>
 *   - <perception_summary>
 *   - <restart_recovery>  (already one-shot via consumeHandoffState, but the
 *                           ledger still records emitted=true for telemetry)
 *
 * Storage:
 *   - Per-session ledger: kv_store key `session.injection_ledger.<sessionId>`
 *     {
 *       turn_idx: 42,
 *       prev: { '<now>': '...', '<skills_surface>': '...', ... },
 *       updated_at: '2026-05-01T...'
 *     }
 *   - Per-block telemetry: rows in `injection_event` table (see migration
 *     083_injection_event.sql), exposed via /api/telemetry/per-turn-injection-cost.
 *
 * Cache discipline:
 *   - The dedupe path SKIPS emission. It does NOT replace the block with a
 *     stub - that would itself bust the SDK prompt cache for downstream
 *     blocks. Skip means "this block is absent from this turn's user message
 *     entirely". Per-turn block presence is already cache-busting (the
 *     <now> block always varies); skipping a block reduces cost without
 *     introducing additional cache churn.
 *
 * Brief ref: fork_momarm6e_60920d - "trim per-turn injection blocks - dedupe
 * + relevance-gate + telemetry".
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const db = require('../config/db')
const logger = require('../config/logger')

// ─── Constants ─────────────────────────────────────────────────────────────

const LEDGER_KEY_PREFIX = 'session.injection_ledger.'
const MINIMAL_MODE_KEY = 'context.minimal_mode'

// Telemetry sink: append-only JSONL on the same disk path the dispatch event
// consumer uses. Keeps per-turn cost rows out of the main event hot-path
// while still being queryable from the new endpoint.
const TELEMETRY_DIR = process.env.TELEMETRY_DIR
  || path.resolve(__dirname, '..', '..', 'logs', 'telemetry')
const TELEMETRY_FILE = path.join(TELEMETRY_DIR, 'injection-events.jsonl')

// Block hierarchy. Order matters for the assembler's splice logic in
// osSessionService — we mirror it here so the caller can iterate in the
// same order without leaking ordering knowledge to two places.
//
// `always` means the block is ALWAYS emitted when its content is non-empty.
// `dedupe` means dedupe against previous turn (skip if byte-identical).
//
// Note: "no_new" is implemented purely via dedupe. <recent_doctrine> and
// <perception_summary> producers already roll up the latest snapshot of
// their data; if no new Decision/Episode/observation has landed since
// last turn the producers return byte-identical strings and dedupe skips
// the emission. This avoids a separate "compute hasNewDoctrineSinceTs"
// round-trip per turn.
const BLOCK_RULES = {
  '<now>':                     { always: true,  dedupe: false },
  '<doctrine_surface>':        { always: false, dedupe: true  },
  '<skills_surface>':          { always: false, dedupe: true  },
  '<forks_rollup>':            { always: true,  dedupe: false }, // forkService already filters empty
  '<conductor_commitments>':   { always: false, dedupe: true  }, // status_board snapshot
  '<thread_carry_forward>':    { always: false, dedupe: true  }, // kv_store snapshot
  '<recent_doctrine>':         { always: false, dedupe: true  },
  '<relevant_memory>':         { always: false, dedupe: true  },
  '<perception_summary>':      { always: false, dedupe: true  },
  '<restart_recovery>':        { always: false, dedupe: false }, // already one-shot via consumeHandoffState
  '<last_turn_breadcrumb>':    { always: false, dedupe: false },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function _safeMkdirSync(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  catch (err) { logger.debug('turnInjectionService: mkdir failed (non-fatal)', { dir, error: err.message }) }
}

function _hashContent(s) {
  return crypto.createHash('sha256').update(s || '').digest('hex').slice(0, 16)
}

/**
 * blockTagOf(text) — extract the leading XML-ish tag from a block.
 * `<skills_surface>\n...` => '<skills_surface>'. Returns null when the
 * input isn't a recognised tagged block (handled gracefully upstream).
 */
function blockTagOf(text) {
  if (!text || typeof text !== 'string') return null
  const m = text.match(/^<([a-z_][a-z0-9_]*)>/)
  return m ? `<${m[1]}>` : null
}

// ─── Ledger I/O ────────────────────────────────────────────────────────────

async function _readLedger(sessionId) {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${LEDGER_KEY_PREFIX + sessionId}`
    if (!rows.length) return { turn_idx: 0, prev: {} }
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      turn_idx: Number(parsed.turn_idx) || 0,
      prev: parsed.prev || {},
    }
  } catch (err) {
    logger.debug('turnInjectionService: ledger read failed (treating as fresh)', { error: err.message })
    return { turn_idx: 0, prev: {} }
  }
}

async function _writeLedger(sessionId, ledger) {
  try {
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${LEDGER_KEY_PREFIX + sessionId}, ${JSON.stringify({
        turn_idx: ledger.turn_idx,
        prev: ledger.prev,
        updated_at: new Date().toISOString(),
      })})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  } catch (err) {
    logger.debug('turnInjectionService: ledger write failed (non-fatal)', { error: err.message })
  }
}

async function _readMinimalMode() {
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${MINIMAL_MODE_KEY}`
    if (!rows.length) return false
    const raw = rows[0].value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed === true || parsed?.enabled === true
  } catch (err) {
    return false
  }
}

// ─── Telemetry sink ─────────────────────────────────────────────────────────

function _emitTelemetry(row) {
  try {
    _safeMkdirSync(TELEMETRY_DIR)
    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(row) + '\n')
  } catch (err) {
    logger.debug('turnInjectionService: telemetry append failed (non-fatal)', { error: err.message })
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * processBlocks - apply gating + dedupe + telemetry to a candidate set of
 * blocks for THIS turn.
 *
 * @param {Object} params
 * @param {string} params.sessionId   - dbSessionId from osSessionService
 * @param {Object} params.candidates  - map of blockTag => block content (or null)
 *                                       e.g. { '<now>': '<now>...</now>', '<skills_surface>': '<skills_surface>...' }
 * @returns {Promise<{ emitted: Object, skipped: Object, stats: Object }>}
 *           emitted: { tag: content }   - blocks to splice into the user message
 *           skipped: { tag: skipReason } - blocks gated/deduped (reason ∈
 *                                          'not_present' | 'dedupe' | 'minimal_mode')
 *           stats: { turn_idx, total_emit_chars, total_skip_chars,
 *                    minimal_mode, blocks_in, blocks_out }
 */
async function processBlocks({ sessionId, candidates }) {
  const startedAt = Date.now()
  if (!sessionId || !candidates || typeof candidates !== 'object') {
    return { emitted: {}, skipped: {}, stats: { turn_idx: 0, total_emit_chars: 0, total_skip_chars: 0 } }
  }

  const minimalMode = await _readMinimalMode()
  const ledger = await _readLedger(sessionId)
  const turnIdx = ledger.turn_idx + 1

  const emitted = {}
  const skipped = {}
  const nextPrev = {}
  let totalEmit = 0
  let totalSkip = 0

  for (const [tag, content] of Object.entries(candidates)) {
    if (!content) {
      // Caller produced nothing for this block — record as not_present and move on.
      _emitTelemetry({
        ts: new Date().toISOString(),
        session_id: sessionId,
        turn_idx: turnIdx,
        block_name: tag,
        char_count: 0,
        emitted: false,
        skip_reason: 'not_present',
      })
      skipped[tag] = 'not_present'
      continue
    }

    const rule = BLOCK_RULES[tag] || { always: false, dedupe: true }
    const len = content.length
    const hash = _hashContent(content)
    let skipReason = null

    // Always-on blocks bypass dedupe.
    if (rule.always) {
      // pass through
    } else {
      // Dedupe: same content as previous turn -> skip. This is also the
      // "no_new signal" implementation for <recent_doctrine> and
      // <perception_summary> — when no new data has arrived, the producer
      // returns the same snapshot and the byte-identical hash short-circuits
      // emission.
      if (rule.dedupe) {
        const prevHash = ledger.prev?.[tag]
        if (prevHash && prevHash === hash) {
          skipReason = 'dedupe'
        }
      }
      // Minimal mode: aggressive trim. Skip everything except <now> and
      // <forks_rollup> (always-on / load-bearing) unless the block is
      // brand-new for this session (no prev hash recorded yet).
      if (!skipReason && minimalMode) {
        const isBrandNew = !ledger.prev?.[tag]
        if (!isBrandNew) {
          skipReason = 'minimal_mode'
        }
      }
    }

    if (skipReason) {
      skipped[tag] = skipReason
      totalSkip += len
    } else {
      emitted[tag] = content
      totalEmit += len
      // Only record dedupe-eligible blocks in the ledger - the others are
      // either always-emitted or one-shot consumed and don't need a hash.
      if (rule.dedupe) nextPrev[tag] = hash
    }

    _emitTelemetry({
      ts: new Date().toISOString(),
      session_id: sessionId,
      turn_idx: turnIdx,
      block_name: tag,
      char_count: len,
      emitted: !skipReason,
      skip_reason: skipReason,
      hash_prefix: hash,
      minimal_mode: minimalMode,
    })
  }

  // Persist ledger. Carry forward un-touched dedupe hashes from previous turn
  // so a block that was skipped this turn (because its provider returned null)
  // can still be deduped on the next turn.
  const mergedPrev = { ...ledger.prev, ...nextPrev }
  await _writeLedger(sessionId, { turn_idx: turnIdx, prev: mergedPrev })

  const stats = {
    turn_idx: turnIdx,
    total_emit_chars: totalEmit,
    total_skip_chars: totalSkip,
    blocks_in: Object.keys(candidates).filter(k => candidates[k]).length,
    blocks_out: Object.keys(emitted).length,
    minimal_mode: minimalMode,
    elapsed_ms: Date.now() - startedAt,
  }
  logger.info('turnInjectionService: processed blocks', stats)

  return { emitted, skipped, stats }
}

/**
 * setMinimalMode - flip the kv_store flag. Used by ops/admin tooling.
 */
async function setMinimalMode(enabled) {
  await db`
    INSERT INTO kv_store (key, value)
    VALUES (${MINIMAL_MODE_KEY}, ${JSON.stringify({ enabled: !!enabled, set_at: new Date().toISOString() })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
  logger.info('turnInjectionService: minimal_mode set', { enabled: !!enabled })
}

async function getMinimalMode() {
  return _readMinimalMode()
}

/**
 * resetLedgerForSession - call on session reset / forced cold-start so the
 * NEW first turn never dedupe-skips a block.
 */
async function resetLedgerForSession(sessionId) {
  if (!sessionId) return
  try {
    await db`DELETE FROM kv_store WHERE key = ${LEDGER_KEY_PREFIX + sessionId}`
  } catch (err) {
    logger.debug('turnInjectionService: ledger reset failed (non-fatal)', { error: err.message })
  }
}

module.exports = {
  processBlocks,
  setMinimalMode,
  getMinimalMode,
  resetLedgerForSession,
  blockTagOf,
  // exposed for tests + telemetry endpoint
  _LEDGER_KEY_PREFIX: LEDGER_KEY_PREFIX,
  _MINIMAL_MODE_KEY: MINIMAL_MODE_KEY,
  _TELEMETRY_FILE: TELEMETRY_FILE,
  BLOCK_RULES,
}
