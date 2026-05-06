'use strict'

/**
 * Prompt-assembly audit writer - shadow-mode sink for the v1↔v2 comparison.
 *
 * docs/PROMPT_ASSEMBLY_SPEC.md §7.1. Writes to the prompt_assembly_audit
 * table created in migration 079. Gate for PR 6 flip is 48h of clean rows
 * (semantic_equivalent=true) visible via the partial index on
 * semantic_equivalent=false.
 *
 * FIRE-AND-FORGET dispatch. dispatch() returns immediately; the insert is
 * kicked off on a microtask and its failures are swallowed to .catch() with
 * a warn-level log. Rationale: losing one audit row is cheap, delaying a
 * turn is expensive. The turn hot path (osSessionService.sendMessage) must
 * NOT await this.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const promptAssembler = require('./promptAssembler')

/**
 * Compute the audit row shape for a given v1 output + v2 output pair.
 * Pure function, synchronous, no IO - safe to call on the hot path.
 *
 * Semantic equivalence is checked at two granularities:
 *   1. System prefix: BP1+BP2 content joined by '\n\n---\n\n' must equal
 *      v1 customSystemPrompt.
 *   2. Continuity envelope: BP3+BP4 content joined by '\n\n' must equal
 *      v1 continuityParts.join('\n\n').
 *
 * Caller can pass either:
 * - `v1Text` (legacy / simplified): a single concatenation of v1
 *     customSystemPrompt + '\n\n' + continuityParts.join('\n\n'). This
 *     is what osSessionService's shadow wire-in builds. The v2 side is
 *     reconstructed to match this shape using the separator rules above.
 * - `v1SystemText` + `v1UserText` (preferred): the two halves separately.
 *     Matches how the SDK actually receives them.
 *
 * @param {Object} args
 * @param {string} args.session_id
 * @param {string} [args.turn_id]
 * @param {string} args.mode - 'off' | 'shadow' | 'canary'
 * @param {string} [args.v1Text] - concatenated v1 form (sys + '\n\n' + user)
 * @param {string} [args.v1SystemText] - v1 custom system prompt (preferred)
 * @param {string} [args.v1UserText] - v1 continuity envelope (preferred)
 * @param {Object} args.v2Out - full result of promptAssembler.assemble()
 * @returns {Object} row payload ready for insert
 */
function buildAuditRow({ session_id, turn_id, mode, v1Text, v1SystemText, v1UserText, v2Out }) {
  // Reconstruct v1 form: either from the split halves, or fall back to the
  // single v1Text. Normalise to a single concatenated string for the diff.
  let effectiveV1
  if (typeof v1SystemText === 'string' || typeof v1UserText === 'string') {
    const sys = v1SystemText || ''
    const usr = v1UserText || ''
    effectiveV1 = usr ? `${sys}\n\n${usr}` : sys
  } else {
    effectiveV1 = v1Text || ''
  }

  // Reconstruct v2 into the same concatenated shape using the inter-block
  // separator rules. The structured contentBlocks still ship to the model
  // as a 4-breakpoint content array; this reconstruction exists only so
  // the audit can answer "would the model see the same text under v1 and v2?"
  const bp12 = v2Out.contentBlocks
    .filter(b => b.tier === 1 || b.tier === 2)
    .map(b => b.text)
    .join('\n\n---\n\n')
  const bp34 = v2Out.contentBlocks
    .filter(b => b.tier === 3 || b.tier === 4)
    .map(b => b.text)
    .join('\n\n')
  const v2Flat = bp34 ? `${bp12}\n\n${bp34}` : bp12

  const v1Bytes = effectiveV1.length
  const v2Bytes = v2Flat.length

  const divergenceIdx = promptAssembler.firstDivergenceIndex(effectiveV1, v2Flat)
  const semanticEquivalent = divergenceIdx === null

  const breakpointBytes = {}
  for (const block of v2Out.contentBlocks) {
    breakpointBytes[`bp${block.tier}`] = block.text.length
  }

  return {
    session_id: session_id || 'unknown',
    turn_id: turn_id || null,
    v1_bytes: v1Bytes,
    v2_bytes: v2Bytes,
    v1_blocks: 1,  // v1 is a single flat string
    v2_blocks: v2Out.contentBlocks.length,
    breakpoint_bytes: breakpointBytes,
    semantic_equivalent: semanticEquivalent,
    diff_first_divergence: divergenceIdx,
    mode,
  }
}

/**
 * Insert one audit row. Awaitable; used by tests and the compare script.
 * Do NOT call this from the turn hot path - use dispatch() instead.
 */
async function insertRow(row) {
  const [inserted] = await db`
    INSERT INTO prompt_assembly_audit
      (session_id, turn_id, v1_bytes, v2_bytes, v1_blocks, v2_blocks,
       breakpoint_bytes, semantic_equivalent, diff_first_divergence, mode)
    VALUES
      (${row.session_id}, ${row.turn_id}, ${row.v1_bytes}, ${row.v2_bytes},
       ${row.v1_blocks}, ${row.v2_blocks},
       ${JSON.stringify(row.breakpoint_bytes)}::jsonb,
       ${row.semantic_equivalent}, ${row.diff_first_divergence}, ${row.mode})
    RETURNING id, assembled_at
  `
  return inserted
}

/**
 * Fire-and-forget dispatch. Returns undefined immediately; the insert is
 * kicked off on a microtask and errors are swallowed with a warn log.
 *
 * If the audit insert fails or slows, the turn still ships. Losing an audit
 * row is cheap; delaying a turn is expensive.
 */
function dispatch(args) {
  let row
  try {
    row = buildAuditRow(args)
  } catch (err) {
    logger.warn('promptAssemblyAudit: buildAuditRow threw, skipping dispatch', {
      error: err.message,
    })
    return
  }
  // Kick off the insert; attach a .catch so unhandled-rejection warnings
  // don't fire on DB failures. No await - caller must not block on this.
  insertRow(row).catch(err => {
    logger.warn('promptAssemblyAudit: insert failed (swallowed, turn unaffected)', {
      session_id: row.session_id,
      mode: row.mode,
      error: err.message,
    })
  })
}

module.exports = {
  buildAuditRow,
  insertRow,
  dispatch,
}
