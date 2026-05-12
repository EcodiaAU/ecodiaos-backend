/**
 * meetingAnalysisService.js - Claude-powered meeting analysis.
 *
 * Runs after transcription completes. Produces:
 *   1. 12-section structured analysis (analysis_json)
 *   2. Structured action items array (action_items_json)
 *
 * Uses anthropicMessagesClient.createMessage() - OAuth token chain,
 * no separate ANTHROPIC_API_KEY needed.
 *
 * Authored: fork_mp22w23o_e286cd, 2026-05-12.
 */
'use strict'

const logger = require('../config/logger')
const { createMessage } = require('./anthropicMessagesClient')

// Model to use for analysis - claude-sonnet for quality, fast enough
const ANALYSIS_MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS_ANALYSIS = 8000
const MAX_TOKENS_ACTION_ITEMS = 4000

// Transcript truncation ceiling - Claude has large context but very long
// transcripts should be summarised to avoid token ceiling hits.
// 3hr at 150 WPM = ~27,000 words = ~36,000 tokens. With 200k context window
// for sonnet, we send the whole thing.
const TRANSCRIPT_MAX_CHARS = 200000

/**
 * Build the analysis system prompt.
 */
function buildAnalysisSystemPrompt() {
  return `You are a world-class meeting analyst. You produce precise, actionable, insight-dense analysis of business meeting transcripts. You never use filler. You never hedge. You name specifics. You use timestamps where provided. You quote directly when it matters. You are reading this for a founder who needs to make decisions from it.

STYLE RULES:
- No em-dashes (use hyphens or restructure)
- No "the meeting discussed various topics" filler
- No hedging language ("it seems", "perhaps", "might")
- Every bullet states a concrete fact, decision, or implication
- Timestamps in MM:SS or HH:MM:SS format where available
- Quote exact words for standout moments
- Be specific about WHO said or decided WHAT`
}

/**
 * Build the analysis user prompt.
 */
function buildAnalysisPrompt(transcript, meetingMeta) {
  const truncated = transcript.length > TRANSCRIPT_MAX_CHARS
    ? transcript.slice(0, TRANSCRIPT_MAX_CHARS) + '\n\n[TRANSCRIPT TRUNCATED AT ' + TRANSCRIPT_MAX_CHARS + ' CHARS]'
    : transcript

  const metaBlock = [
    meetingMeta.title ? `Title: ${meetingMeta.title}` : null,
    meetingMeta.duration_seconds ? `Duration: ${Math.round(meetingMeta.duration_seconds / 60)} minutes` : null,
    meetingMeta.client_name ? `Client: ${meetingMeta.client_name}` : null,
  ].filter(Boolean).join('\n')

  return `${metaBlock ? `## Meeting Context\n${metaBlock}\n\n` : ''}## Transcript\n\n${truncated}

---

Produce a comprehensive meeting analysis with these exact sections. Return as a JSON object with these keys:

{
  "one_line_summary": "Under 25 words. The meeting in a tweet. No em-dashes.",
  "executive_summary": "3 paragraphs. Dense, specific, no filler.",
  "key_decisions": [
    { "decision": "what was decided", "rationale": "why", "timestamp": "HH:MM:SS or null", "owner": "who or null" }
  ],
  "unresolved_questions": [
    { "question": "the open question", "context": "why it matters", "timestamp": "or null" }
  ],
  "themes": [
    { "theme": "theme name", "description": "2 sentences. Specific.", "timestamp_range": "start-end or null", "weight": "primary|secondary" }
  ],
  "standout_moments": [
    { "quote": "exact quote or close paraphrase", "speaker": "name or Speaker A/B or Unknown", "timestamp": "HH:MM:SS or null", "significance": "1 sentence why this mattered" }
  ],
  "sentiment_arc": "Narrative paragraph describing how energy/tone/tension evolved across the meeting. Note specific turning points with timestamps.",
  "people_entities": [
    { "name": "person or org name", "role": "their role in this meeting", "key_interests": "what they care about based on what they said" }
  ],
  "commitments": [
    { "commitment": "what was committed", "owner": "who committed", "to_whom": "to whom", "deadline": "by when or TBD", "timestamp": "or null" }
  ],
  "risks_red_flags": [
    { "risk": "the risk or red flag", "severity": "high|medium|low", "context": "why this is a concern" }
  ],
  "strategic_implications": [
    { "implication": "what changes for the business/project", "timeframe": "immediate|short-term|long-term" }
  ],
  "recommended_next_actions": [
    { "action": "concrete next action", "owner": "who should do it", "priority": "P1|P2|P3", "rationale": "1 sentence why this is the move" }
  ]
}

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON.`
}

/**
 * Build the action items prompt.
 */
function buildActionItemsPrompt(transcript, existingAnalysis) {
  // Use the commitments + recommended actions from the analysis as context
  const analysisContext = existingAnalysis ? JSON.stringify({
    commitments: existingAnalysis.commitments,
    recommended_next_actions: existingAnalysis.recommended_next_actions,
  }, null, 2) : ''

  const truncated = transcript.length > TRANSCRIPT_MAX_CHARS
    ? transcript.slice(0, TRANSCRIPT_MAX_CHARS)
    : transcript

  return `Extract all action items from this meeting transcript. Be exhaustive - capture every commitment, task, follow-up, and deliverable mentioned, even implicit ones.
${analysisContext ? `\nFor context, the analysis already identified these commitments and recommended actions:\n${analysisContext}\n` : ''}
Transcript:
${truncated}

Return a JSON array of action items:
[
  {
    "id": "ai-001",
    "action": "concrete action verb-led description. Start with a verb (Send, Build, Review, Schedule, etc.)",
    "owner": "person name or TBD",
    "due": "specific date, natural language deadline, or TBD",
    "priority": "P1 (urgent/blocking) | P2 (important/this week) | P3 (eventually)",
    "context": "1 sentence: why this came up and what outcome it enables",
    "timestamp_range": "MM:SS-MM:SS or HH:MM:SS-HH:MM:SS or null",
    "dependencies": [],
    "source": "explicit (someone said they would do it) | implicit (it was clearly needed but not assigned)"
  }
]

Rules:
- P1 = must happen before next meeting or blocks others
- P2 = this week
- P3 = whenever, no urgency
- If multiple people own an item, list the primary owner and note others in context
- No em-dashes anywhere
- Return ONLY valid JSON array. No markdown fences.`
}

/**
 * Call Claude for analysis. Returns parsed JSON object.
 * Throws on API error or JSON parse failure.
 */
async function callClaudeForAnalysis(transcript, meetingMeta) {
  const systemPrompt = buildAnalysisSystemPrompt()
  const userPrompt = buildAnalysisPrompt(transcript, meetingMeta)

  logger.info('[MeetingAnalysis] calling Claude for analysis', {
    transcriptChars: transcript.length,
    model: ANALYSIS_MODEL,
  })

  const { json } = await createMessage({
    model: ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_ANALYSIS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = json?.content?.[0]?.text || ''
  if (!content) throw new Error('Claude returned empty analysis response')

  // Strip any accidental markdown fences
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch (parseErr) {
    logger.error('[MeetingAnalysis] JSON parse failed', { content: content.slice(0, 500) })
    throw new Error(`Analysis JSON parse failed: ${parseErr.message}`)
  }
}

/**
 * Call Claude for action items. Returns parsed JSON array.
 */
async function callClaudeForActionItems(transcript, existingAnalysis) {
  const systemPrompt = buildAnalysisSystemPrompt()
  const userPrompt = buildActionItemsPrompt(transcript, existingAnalysis)

  logger.info('[MeetingAnalysis] calling Claude for action items', {
    transcriptChars: transcript.length,
  })

  const { json } = await createMessage({
    model: ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_ACTION_ITEMS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = json?.content?.[0]?.text || ''
  if (!content) throw new Error('Claude returned empty action items response')

  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const items = JSON.parse(cleaned)
    if (!Array.isArray(items)) throw new Error('Expected JSON array')
    return items
  } catch (parseErr) {
    logger.error('[MeetingAnalysis] action items JSON parse failed', { content: content.slice(0, 500) })
    throw new Error(`Action items JSON parse failed: ${parseErr.message}`)
  }
}

/**
 * runAnalysis(meetingId) - main entry point.
 *
 * Called async after transcription completes. Does NOT block the HTTP response.
 * Reads transcript_text from DB, calls Claude twice (analysis + action items),
 * stores results.
 *
 * @param {string} meetingId - UUID
 * @param {object} db - postgres-js tagged template client
 */
async function runAnalysis(meetingId, db) {
  logger.info('[MeetingAnalysis] starting', { meetingId })

  // Mark as processing
  await db`
    UPDATE meeting_recordings SET
      analysis_status = 'processing',
      analysis_started_at = NOW(),
      analysis_error = NULL
    WHERE id = ${meetingId}::uuid
  `

  try {
    // Load transcript + meeting metadata
    const [row] = await db`
      SELECT m.transcript_text, m.title, m.duration_seconds,
             c.name AS client_name
      FROM meeting_recordings m
      LEFT JOIN clients c ON c.id = m.client_id
      WHERE m.id = ${meetingId}::uuid
    `

    if (!row) throw new Error('Meeting not found')

    const transcript = row.transcript_text || ''
    if (transcript.length < 50) {
      throw new Error('Transcript too short for analysis (< 50 chars)')
    }

    const meetingMeta = {
      title: row.title,
      duration_seconds: row.duration_seconds,
      client_name: row.client_name,
    }

    // Step 1: Full analysis
    const analysisJson = await callClaudeForAnalysis(transcript, meetingMeta)

    // Step 2: Action items (with analysis context for richer extraction)
    const actionItemsJson = await callClaudeForActionItems(transcript, analysisJson)

    // Store both
    await db`
      UPDATE meeting_recordings SET
        analysis_json = ${JSON.stringify(analysisJson)}::jsonb,
        action_items_json = ${JSON.stringify(actionItemsJson)}::jsonb,
        analysis_status = 'done',
        analysis_completed_at = NOW(),
        analysis_error = NULL
      WHERE id = ${meetingId}::uuid
    `

    logger.info('[MeetingAnalysis] completed', {
      meetingId,
      decisions: analysisJson.key_decisions?.length,
      actionItems: actionItemsJson.length,
      themes: analysisJson.themes?.length,
    })
  } catch (err) {
    logger.error('[MeetingAnalysis] failed', { meetingId, error: err.message })
    await db`
      UPDATE meeting_recordings SET
        analysis_status = 'error',
        analysis_error = ${err.message}
      WHERE id = ${meetingId}::uuid
    `.catch(() => {})
    throw err
  }
}

module.exports = { runAnalysis, callClaudeForAnalysis, callClaudeForActionItems }
