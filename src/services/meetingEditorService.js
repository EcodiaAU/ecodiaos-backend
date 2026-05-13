/**
 * meetingEditorService.js - Meeting Analysis Editor: chat agent + edit ops.
 *
 * Phase 2 of the Meeting Analysis Editor.
 *
 * Exposes:
 *   getOrCreateSession(meetingId)         -> session row
 *   getMessages(sessionId, limit)         -> message rows
 *   getMeetingAnalysis(meetingId)         -> structured_analysis jsonb or null
 *   applyEditOp(meetingId, op, args, sessionId?) -> { success, affected_ids, cascade_flags }
 *   processMessage(meetingId, sessionId, userContent) -> { message, edit_ops_applied, cascade_flags, needs_review_count, email_dirty }
 *
 * Phase 3 (cascade) and Phase 4 (reanalysis) are NOT implemented here.
 *
 * Authored: fork_mp3e39xm_a77e6f, 2026-05-13.
 */
'use strict'

const logger = require('../config/logger')
const db = require('../config/db')

// ---------------------------------------------------------------------------
// LLM call - OS provider chain with tool use support
// ---------------------------------------------------------------------------

const EDITOR_MODEL = 'claude-haiku-4-5'
const EDITOR_MAX_TOKENS = 2048
const ANTHROPIC_HOST = 'https://api.anthropic.com'
const EDITOR_REQUEST_TIMEOUT_MS = 60_000

/**
 * Resolve bearer token for Anthropic API calls.
 * Uses the OS OAuth token chain first, falls back to ANTHROPIC_API_KEY.
 */
function resolveBearerToken() {
  const tateToken = process.env.CLAUDE_CODE_OAUTH_TOKEN_TATE
  if (tateToken) return { token: tateToken, isOAuth: true }
  const codeToken = process.env.CLAUDE_CODE_OAUTH_TOKEN_CODE
  if (codeToken) return { token: codeToken, isOAuth: true }
  const moneyToken = process.env.CLAUDE_CODE_OAUTH_TOKEN_MONEY
  if (moneyToken) return { token: moneyToken, isOAuth: true }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) return { token: apiKey, isOAuth: false }
  return null
}

/**
 * Single call to /v1/messages with tool use support.
 * Supports the full Anthropic messages shape including tools + tool_choice.
 */
async function callClaudeWithTools({ messages, system, tools, tool_choice }) {
  const auth = resolveBearerToken()
  if (!auth) throw new Error('No Anthropic credentials available (checked OAuth chain + ANTHROPIC_API_KEY)')

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  if (auth.isOAuth) {
    headers['Authorization'] = `Bearer ${auth.token}`
    headers['anthropic-beta'] = 'oauth-2025-04-20'
  } else {
    headers['x-api-key'] = auth.token
  }

  const payload = {
    model: EDITOR_MODEL,
    max_tokens: EDITOR_MAX_TOKENS,
    messages,
    tools,
  }
  if (system) payload.system = system
  if (tool_choice) payload.tool_choice = tool_choice

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EDITOR_REQUEST_TIMEOUT_MS)

  let resp
  try {
    resp = await fetch(`${ANTHROPIC_HOST}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Claude API error ${resp.status}: ${text.slice(0, 500)}`)
  }

  return resp.json()
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function padNum(n) {
  return String(n).padStart(3, '0')
}

/**
 * Find the next available ID in a collection given a prefix.
 * E.g. if actions have ai-001..ai-005, returns ai-006.
 */
function nextId(collection, prefix) {
  if (!Array.isArray(collection) || collection.length === 0) {
    return `${prefix}-001`
  }
  let max = 0
  for (const item of collection) {
    if (!item.id) continue
    const dashIdx = item.id.lastIndexOf('-')
    if (dashIdx === -1) continue
    const itemPrefix = item.id.slice(0, dashIdx)
    if (itemPrefix !== prefix) continue
    const n = parseInt(item.id.slice(dashIdx + 1), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${prefix}-${padNum(max + 1)}`
}

// ---------------------------------------------------------------------------
// Op executor - applies an edit op to the structured_analysis object in memory
// Returns array of affected_ids
// ---------------------------------------------------------------------------

function applyOpToObject(sa, op, args) {
  // Helper: merge fields into an item by id
  function mergeInto(collection, id, fields) {
    const item = (collection || []).find(x => x.id === id)
    if (!item) throw new Error(`Item ${id} not found`)
    Object.assign(item, fields)
    return [id]
  }

  // Helper: push new item with auto-assigned id
  function addTo(collection, prefix, fields) {
    const id = nextId(collection, prefix)
    const newItem = { id, needs_review: false, review_reason: null, ...fields }
    collection.push(newItem)
    return [id]
  }

  // Helper: remove item by id
  function removeFrom(collection, id) {
    const idx = (collection || []).findIndex(x => x.id === id)
    if (idx === -1) throw new Error(`Item ${id} not found`)
    collection.splice(idx, 1)
    return [id]
  }

  // Helper: find item across all main collections (for clear_review_flag / flag_for_reanalysis)
  function findAcrossAll(targetId) {
    const cols = ['actions', 'decisions', 'deepdive_sections', 'open_questions',
      'commitments', 'risks', 'opportunities', 'participants', 'themes',
      'standout_moments', 'people_entities', 'strategic_implications']
    for (const col of cols) {
      if (!Array.isArray(sa[col])) continue
      const found = sa[col].find(x => x.id === targetId)
      if (found) return found
    }
    return null
  }

  switch (op) {
    // ---- Actions ----
    case 'update_action':
      return mergeInto(sa.actions, args.id, args.fields)

    case 'add_action': {
      const fields = args.fields || args
      delete fields.id // ensure auto-assigned
      return addTo(sa.actions, 'ai', fields)
    }

    case 'remove_action':
      return removeFrom(sa.actions, args.id)

    case 'merge_actions': {
      const source = (sa.actions || []).find(x => x.id === args.source_id)
      const target = (sa.actions || []).find(x => x.id === args.target_id)
      if (!source) throw new Error(`Source action ${args.source_id} not found`)
      if (!target) throw new Error(`Target action ${args.target_id} not found`)
      // Copy source fields into target (excluding id)
      const { id: _ignore, ...sourceCopy } = source
      Object.assign(target, sourceCopy)
      target.id = args.target_id
      sa.actions = sa.actions.filter(x => x.id !== args.source_id)
      return [args.source_id, args.target_id]
    }

    case 'reassign_action': {
      const item = (sa.actions || []).find(x => x.id === args.id)
      if (!item) throw new Error(`Action ${args.id} not found`)
      item.owner = args.new_owner
      return [args.id]
    }

    case 'reprioritise_action': {
      const item = (sa.actions || []).find(x => x.id === args.id)
      if (!item) throw new Error(`Action ${args.id} not found`)
      item.priority = args.priority
      return [args.id]
    }

    // ---- Decisions ----
    case 'update_decision':
      return mergeInto(sa.decisions, args.id, args.fields)

    case 'add_decision': {
      const fields = args.fields || args
      delete fields.id
      return addTo(sa.decisions, 'dec', fields)
    }

    case 'remove_decision':
      return removeFrom(sa.decisions, args.id)

    // ---- Deep dive sections ----
    case 'update_deepdive_section':
      return mergeInto(sa.deepdive_sections, args.id, args.fields)

    case 'add_deepdive_section': {
      if (!sa.deepdive_sections) sa.deepdive_sections = []
      const fields = args.fields || args
      delete fields.id
      return addTo(sa.deepdive_sections, 'dd', fields)
    }

    case 'remove_deepdive_section':
      return removeFrom(sa.deepdive_sections, args.id)

    case 'reorder_deepdive_sections': {
      const orderedIds = args.ordered_ids || []
      const reordered = orderedIds
        .map(id => (sa.deepdive_sections || []).find(x => x.id === id))
        .filter(Boolean)
      // Append any items not in ordered_ids at the end
      const mentioned = new Set(orderedIds)
      const extras = (sa.deepdive_sections || []).filter(x => !mentioned.has(x.id))
      sa.deepdive_sections = [...reordered, ...extras]
      return reordered.map(x => x.id)
    }

    // ---- Open questions ----
    case 'update_open_question':
      return mergeInto(sa.open_questions, args.id, args.fields)

    case 'add_open_question': {
      if (!sa.open_questions) sa.open_questions = []
      const fields = args.fields || args
      delete fields.id
      return addTo(sa.open_questions, 'oq', fields)
    }

    case 'remove_open_question':
      return removeFrom(sa.open_questions, args.id)

    case 'resolve_open_question': {
      const item = (sa.open_questions || []).find(x => x.id === args.id)
      if (item) {
        item.resolved = true
      } else {
        // If not found, it may have already been removed
        logger.warn('[MeetingEditor] resolve_open_question: item not found', { id: args.id })
      }
      return [args.id]
    }

    // ---- Commitments ----
    case 'update_commitment':
      return mergeInto(sa.commitments, args.id, args.fields)

    case 'remove_commitment':
      return removeFrom(sa.commitments, args.id)

    // ---- Risks ----
    case 'update_risk':
      return mergeInto(sa.risks, args.id, args.fields)

    case 'remove_risk':
      return removeFrom(sa.risks, args.id)

    // ---- Participants ----
    case 'rename_participant': {
      if (!sa.participants) sa.participants = []
      const par = sa.participants.find(x => x.id === args.id)
      const oldName = par ? par.name : null
      if (par) par.name = args.new_name

      // Cascade: update owner/decided_by across actions and decisions (case-insensitive)
      if (oldName) {
        const oldLower = oldName.toLowerCase()
        for (const action of (sa.actions || [])) {
          if (action.owner && action.owner.toLowerCase() === oldLower) {
            action.owner = args.new_name
          }
        }
        for (const decision of (sa.decisions || [])) {
          if (decision.decided_by && decision.decided_by.toLowerCase() === oldLower) {
            decision.decided_by = args.new_name
          }
        }
        for (const commitment of (sa.commitments || [])) {
          if (commitment.owner && commitment.owner.toLowerCase() === oldLower) {
            commitment.owner = args.new_name
          }
        }
      }
      return [args.id]
    }

    case 'add_participant': {
      if (!sa.participants) sa.participants = []
      const fields = args.fields || args
      delete fields.id
      return addTo(sa.participants, 'par', fields)
    }

    case 'update_participant':
      if (!sa.participants) sa.participants = []
      return mergeInto(sa.participants, args.id, args.fields)

    // ---- Summary ----
    case 'update_summary': {
      if (!sa.summary) sa.summary = {}
      Object.assign(sa.summary, args.fields)
      return ['summary']
    }

    // ---- Review flags ----
    case 'clear_review_flag': {
      const item = findAcrossAll(args.id)
      if (item) {
        item.needs_review = false
        item.review_reason = null
      }
      return [args.id]
    }

    case 'flag_for_reanalysis': {
      const item = findAcrossAll(args.id)
      if (item) {
        item.needs_review = true
        item.review_reason = args.reason || 'flagged'
      }
      return [args.id]
    }

    default:
      throw new Error(`Unknown edit op: ${op}`)
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/**
 * Get the active editor session for a meeting, or create one if none exists.
 * Always updates last_active_at on the found/created row.
 */
async function getOrCreateSession(meetingId) {
  const [existing] = await db`
    SELECT * FROM meeting_editor_sessions
    WHERE meeting_id = ${meetingId}::uuid AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `

  if (existing) {
    const [updated] = await db`
      UPDATE meeting_editor_sessions
      SET last_active_at = now()
      WHERE id = ${existing.id}::uuid
      RETURNING *
    `
    return updated
  }

  const [created] = await db`
    INSERT INTO meeting_editor_sessions (meeting_id)
    VALUES (${meetingId}::uuid)
    RETURNING *
  `
  return created
}

// ---------------------------------------------------------------------------
// Message history
// ---------------------------------------------------------------------------

/**
 * Load messages for a session, oldest first.
 */
async function getMessages(sessionId, limit = 50) {
  return db`
    SELECT id, session_id, meeting_id, role, content, edit_ops, created_at
    FROM meeting_editor_messages
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
}

// ---------------------------------------------------------------------------
// Analysis access
// ---------------------------------------------------------------------------

/**
 * Read the current structured_analysis for a meeting.
 * Returns the jsonb object or null.
 */
async function getMeetingAnalysis(meetingId) {
  const [row] = await db`
    SELECT structured_analysis
    FROM meeting_recordings
    WHERE id = ${meetingId}::uuid
  `
  return row?.structured_analysis || null
}

// ---------------------------------------------------------------------------
// Edit op application
// ---------------------------------------------------------------------------

/**
 * Apply a single edit op to structured_analysis inside a transaction with
 * advisory lock to prevent concurrent clobber.
 *
 * Returns { success, affected_ids, cascade_flags }
 */
async function applyEditOp(meetingId, op, args, sessionId) {
  let affectedIds = []

  await db.begin(async sql => {
    // Advisory lock - transaction-scoped, released on commit/rollback
    await sql`SELECT pg_advisory_xact_lock(hashtext(${meetingId}))`

    // Read current state
    const [row] = await sql`
      SELECT structured_analysis
      FROM meeting_recordings
      WHERE id = ${meetingId}::uuid
    `
    if (!row) throw new Error(`Meeting ${meetingId} not found`)
    if (!row.structured_analysis) {
      throw new Error('Meeting has no structured_analysis yet. Run the backfill script first.')
    }

    // Deep-clone via JSON to avoid reference surprises
    const sa = JSON.parse(JSON.stringify(row.structured_analysis))

    // Apply op in memory - modifies sa in-place, returns affected ids
    affectedIds = applyOpToObject(sa, op, args)

    // Mark email as dirty and stamp last_edited_at
    sa.last_edited_at = new Date().toISOString()
    if (!sa.email_render) {
      sa.email_render = { subject: '', recipients: [], body_md: '', last_rendered_at: null, dirty: false }
    }
    sa.email_render.dirty = true

    // Write back
    await sql`
      UPDATE meeting_recordings
      SET structured_analysis = ${JSON.stringify(sa)}::jsonb
      WHERE id = ${meetingId}::uuid
    `

    // Audit log - cast sessionId to uuid (null::uuid is valid Postgres)
    await sql`
      INSERT INTO meeting_analysis_edits
        (meeting_id, session_id, edit_op, args, affected_ids, cascade_flags, applied_by)
      VALUES (
        ${meetingId}::uuid,
        ${sessionId || null}::uuid,
        ${op},
        ${JSON.stringify(args)}::jsonb,
        ${affectedIds},
        '[]'::jsonb,
        'tate'
      )
    `
  })

  return { success: true, affected_ids: affectedIds, cascade_flags: [] }
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildEditorSystemPrompt(analysis) {
  let contextBlock = '(No analysis loaded yet)'

  if (analysis) {
    // Compact summary of IDs so the model knows what exists without full JSON
    const compact = {
      actions: (analysis.actions || []).map(a => ({
        id: a.id,
        action: (a.action || '').slice(0, 90),
        owner: a.owner,
        priority: a.priority,
      })),
      decisions: (analysis.decisions || []).map(d => ({
        id: d.id,
        decision: (d.decision || '').slice(0, 90),
      })),
      open_questions: (analysis.open_questions || []).map(q => ({
        id: q.id,
        question: (q.question || '').slice(0, 80),
      })),
      commitments: (analysis.commitments || []).map(c => ({
        id: c.id,
        commitment: (c.commitment || '').slice(0, 80),
        owner: c.owner,
      })),
      risks: (analysis.risks || []).map(r => ({
        id: r.id,
        risk: (r.risk || '').slice(0, 80),
        severity: r.severity,
      })),
      participants: (analysis.participants || []).map(p => ({
        id: p.id,
        name: p.name,
      })),
    }
    contextBlock = '## Current analysis (IDs + previews)\n```json\n' + JSON.stringify(compact, null, 2) + '\n```'
  }

  return `You are the EcodiaOS Meeting Analysis Editor. You help Tate correct and refine the analysis of a specific meeting by applying precise edits via the editMeetingAnalysis tool.

RULES:
- Apply edits via the tool, do not narrate what you are about to do - just do it.
- After each edit, briefly confirm what changed and surface any cascade flags in one sentence.
- If multiple items need the same change (e.g. rename an owner across all actions), apply them in a single turn.
- Never suggest sending the email. That is Tate's call.
- If the request is ambiguous, state your interpretation and apply it. Do not ask clarifying questions.
- Keep responses under 100 words unless Tate asks for explanation.
- No em-dashes.

${contextBlock}`
}

// ---------------------------------------------------------------------------
// Editor tool definitions
// ---------------------------------------------------------------------------

const EDITOR_TOOLS = [
  {
    name: 'editMeetingAnalysis',
    description: 'Apply a structured edit operation to the meeting analysis',
    input_schema: {
      type: 'object',
      properties: {
        edit_op: { type: 'string', description: 'The operation to perform (e.g. update_action, add_action, remove_action, reassign_action, reprioritise_action, update_decision, add_decision, remove_decision, update_deepdive_section, add_deepdive_section, remove_deepdive_section, reorder_deepdive_sections, update_open_question, add_open_question, remove_open_question, resolve_open_question, update_commitment, remove_commitment, update_risk, remove_risk, rename_participant, add_participant, update_participant, update_summary, clear_review_flag, flag_for_reanalysis)' },
        args: { type: 'object', description: 'Arguments for the operation. For update_* ops: {id, fields:{...}}. For add_* ops: {fields:{...}} or the fields directly. For remove_* ops: {id}. For reassign_action: {id, new_owner}. For reprioritise_action: {id, priority}. For merge_actions: {source_id, target_id}. For rename_participant: {id, new_name}. For reorder_deepdive_sections: {ordered_ids:[...]}.' },
      },
      required: ['edit_op', 'args'],
    },
  },
  {
    name: 'getMeetingAnalysis',
    description: 'Read the current structured analysis to understand item IDs and current state before making edits',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

// ---------------------------------------------------------------------------
// processMessage - agentic editor loop
// ---------------------------------------------------------------------------

/**
 * Process a user message through the editor agent.
 * Runs an agentic loop: call Claude, execute tool calls, continue until done.
 * Persists user + assistant messages to DB.
 * Returns the assistant's final response.
 */
async function processMessage(meetingId, sessionId, userContent) {
  // Load current analysis for the system prompt context
  const analysis = await getMeetingAnalysis(meetingId)
  const systemPrompt = buildEditorSystemPrompt(analysis)

  // Load message history (last 50) for conversation continuity
  const history = await getMessages(sessionId)

  // Build API-format message array from history
  const apiMessages = history.map(m => ({ role: m.role, content: m.content }))
  apiMessages.push({ role: 'user', content: userContent })

  const editOpsApplied = []
  let finalContent = ''
  let iterations = 0
  const MAX_ITERATIONS = 10

  let loopMessages = [...apiMessages]

  // Agentic loop - run until no tool_use in response or MAX_ITERATIONS reached
  while (iterations < MAX_ITERATIONS) {
    iterations++

    let response
    try {
      response = await callClaudeWithTools({
        messages: loopMessages,
        system: systemPrompt,
        tools: EDITOR_TOOLS,
      })
    } catch (err) {
      logger.error('[MeetingEditor] Claude call failed', { meetingId, sessionId, error: err.message, iteration: iterations })
      throw err
    }

    const contentBlocks = response.content || []
    const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use')
    const textBlocks = contentBlocks.filter(b => b.type === 'text')

    // Capture any text content as the ongoing final response
    if (textBlocks.length > 0) {
      finalContent = textBlocks.map(b => b.text).join('\n')
    }

    // Done if no tool calls or stop_reason is end_turn
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      break
    }

    // Add the assistant turn to the rolling message history for next iteration
    loopMessages.push({ role: 'assistant', content: contentBlocks })

    // Execute all tool calls in this response
    const toolResults = []
    for (const toolUse of toolUseBlocks) {
      let resultContent
      try {
        if (toolUse.name === 'getMeetingAnalysis') {
          const currentAnalysis = await getMeetingAnalysis(meetingId)
          resultContent = JSON.stringify(currentAnalysis)
        } else if (toolUse.name === 'editMeetingAnalysis') {
          const { edit_op, args } = toolUse.input
          const editResult = await applyEditOp(meetingId, edit_op, args, sessionId)
          editOpsApplied.push({ edit_op, args, affected_ids: editResult.affected_ids })
          resultContent = JSON.stringify({ success: true, affected_ids: editResult.affected_ids })
        } else {
          resultContent = JSON.stringify({ error: `Unknown tool: ${toolUse.name}` })
        }
      } catch (err) {
        logger.error('[MeetingEditor] tool execution failed', {
          tool: toolUse.name,
          meetingId,
          error: err.message,
        })
        resultContent = JSON.stringify({ error: err.message })
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
      })
    }

    // Add tool results as the next user turn
    loopMessages.push({ role: 'user', content: toolResults })
  }

  if (iterations >= MAX_ITERATIONS) {
    logger.warn('[MeetingEditor] hit MAX_ITERATIONS', { meetingId, sessionId, MAX_ITERATIONS })
  }

  // Count items currently flagged needs_review
  let needsReviewCount = 0
  try {
    const currentAnalysis = await getMeetingAnalysis(meetingId)
    if (currentAnalysis) {
      const reviewCols = ['actions', 'decisions', 'deepdive_sections', 'open_questions', 'commitments', 'risks']
      for (const col of reviewCols) {
        if (Array.isArray(currentAnalysis[col])) {
          needsReviewCount += currentAnalysis[col].filter(x => x.needs_review).length
        }
      }
    }
  } catch (err) {
    logger.warn('[MeetingEditor] could not count needs_review', { error: err.message })
  }

  // Persist: user message
  await db`
    INSERT INTO meeting_editor_messages (session_id, meeting_id, role, content)
    VALUES (${sessionId}::uuid, ${meetingId}::uuid, 'user', ${userContent})
  `

  // Persist: assistant message (with edit_ops if any were applied)
  const [assistantMsg] = await db`
    INSERT INTO meeting_editor_messages (session_id, meeting_id, role, content, edit_ops)
    VALUES (
      ${sessionId}::uuid,
      ${meetingId}::uuid,
      'assistant',
      ${finalContent},
      ${editOpsApplied.length > 0 ? JSON.stringify(editOpsApplied) : null}::jsonb
    )
    RETURNING id, created_at
  `

  // Update session counters
  await db`
    UPDATE meeting_editor_sessions
    SET last_active_at = now(),
        message_count = message_count + 1
    WHERE id = ${sessionId}::uuid
  `

  return {
    message: {
      id: assistantMsg.id,
      role: 'assistant',
      content: finalContent,
      created_at: assistantMsg.created_at,
      edit_ops: editOpsApplied.length > 0 ? editOpsApplied : undefined,
    },
    edit_ops_applied: editOpsApplied,
    cascade_flags: [],
    needs_review_count: needsReviewCount,
    email_dirty: editOpsApplied.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getOrCreateSession,
  getMessages,
  getMeetingAnalysis,
  applyEditOp,
  processMessage,
}
