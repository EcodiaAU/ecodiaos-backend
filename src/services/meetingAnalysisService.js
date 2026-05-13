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

// Model: Opus 4.7 — most capable Claude. Worth the spend for a meeting that
// will inform real decisions. claude-opus-4-7[1m] supports 1M context, so the
// whole transcript fits in one call no matter how long the meeting was.
const ANALYSIS_MODEL = 'claude-opus-4-7'
// Opus 4.7 supports up to 128K output. We use 64K — comfortably more than
// any meeting will need but cheaper than 128K and avoids absurdly long
// generations. Exhaustive output is the point; we never want the model to
// choose what to leave out due to a token cap.
const MAX_TOKENS_ANALYSIS = 64000
const MAX_TOKENS_ACTION_ITEMS = 64000
// Generation can take several minutes for a multi-hour transcript with deep
// output. The default 60s timeout in anthropicMessagesClient is too short.
const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Build the analysis system prompt.
 */
function buildAnalysisSystemPrompt() {
  return `You are a world-class meeting analyst. You produce exhaustive, precise, actionable, insight-dense analysis of business meeting transcripts. You miss nothing. You name specifics. You use timestamps where provided. You quote directly when it matters. You are reading this for a founder who needs to make decisions from it and will not re-read the transcript — your analysis is their only record.

DEPTH RULES (most important):
- Be EXHAUSTIVE. Capture every decision, every commitment, every theme, every risk, every implication that comes up — not a "top 5" summary. If 18 themes emerge, list 18. If 25 commitments are made, list 25. The user wants the full picture, not the highlights.
- Long meetings (1hr+) typically yield 15+ key decisions, 10+ themes, 20+ commitments, 30+ action items. Aim for that density when the content supports it.
- Quote the actual words when they matter, not paraphrases. Long quotes are fine when the original wording is important.
- The executive summary should be 5-8 paragraphs for a multi-hour meeting, not 3. Cover the arc: what happened, what was decided, what's now in motion, what's open, what's at stake.
- The sentiment_arc should track tone shifts in detail — name the specific moments where energy changed.
- people_entities should include every named person and organisation, with what they care about based on their actual words.

STYLE RULES:
- No em-dashes (use hyphens or restructure)
- No filler ("the meeting discussed various topics", "they talked about many things")
- No hedging ("it seems", "perhaps", "might") — state what was said
- Every bullet states a concrete fact, decision, or implication
- Timestamps in MM:SS or HH:MM:SS format where available
- Be specific about WHO said or decided WHAT — use real names from the speaker roster, not "Speaker A"

OWNER ATTRIBUTION RULES:
- Use real names from the speaker roster. Never default to one person.
- When someone says "I will" or "I'll", the owner is that speaker.
- When "we will", attribute to the group of speakers actively engaged in that thread.
- When unclear, use "TBD" — do not guess.`
}

/**
 * Rewrite "Speaker A:" labels in the transcript to real names using the
 * speaker_names map. Speakers without a mapping keep their letter label.
 */
function applySpeakerNames(transcript, speakerNames) {
  if (!speakerNames || Object.keys(speakerNames).length === 0) return transcript
  return transcript.replace(/Speaker ([A-Z])/g, (_, code) => speakerNames[code] || `Speaker ${code}`)
}

function buildSpeakerRoster(speakerNames, attendees) {
  const hasNames = speakerNames && Object.keys(speakerNames).length > 0
  const hasAttendees = typeof attendees === 'string' && attendees.trim().length > 0
  if (!hasNames && !hasAttendees) return ''

  let block = `## People in this meeting\n`

  if (hasAttendees) {
    block += `The following people were present in this meeting:\n${attendees.trim()}\n\n`
    block += `The transcript may label some speakers as "Speaker A", "Speaker B" etc. (Deepgram diarisation labels). `
    block += `Figure out from context which speaker is which person — listen for self-introductions, when they're addressed by name, what role/expertise they show, and what they care about. `
    block += `Then attribute every commitment, decision, action, and quote to the real person, not the letter.\n\n`
  }

  if (hasNames) {
    const lines = Object.entries(speakerNames).map(([code, name]) => `- Speaker ${code} = ${name}`).join('\n')
    block += hasAttendees
      ? `Known speaker-letter mappings (use these directly, infer the rest from the attendee list and context):\n${lines}\n\n`
      : `The speakers in this transcript have been identified:\n${lines}\n\n`
  }

  block += `CRITICAL: Owner fields must be real names from the people list. NEVER use "Speaker A" or letter codes in the final output. Do NOT default to one person for everything — attribute each commitment, decision, and action to the actual speaker who took it on. If you genuinely cannot tell who from context, use "TBD".\n\n`

  return block
}

/**
 * Build the analysis user prompt. No truncation: we send the full transcript.
 * Opus 4.7 1M-context handles multi-hour meetings without compression.
 */
function buildAnalysisPrompt(transcript, meetingMeta, speakerNames, attendees) {
  const labelled = applySpeakerNames(transcript, speakerNames)

  const metaBlock = [
    meetingMeta.title ? `Title: ${meetingMeta.title}` : null,
    meetingMeta.duration_seconds ? `Duration: ${Math.round(meetingMeta.duration_seconds / 60)} minutes` : null,
    meetingMeta.client_name ? `Client: ${meetingMeta.client_name}` : null,
  ].filter(Boolean).join('\n')

  return `${metaBlock ? `## Meeting Context\n${metaBlock}\n\n` : ''}${buildSpeakerRoster(speakerNames, attendees)}## Transcript\n\n${labelled}

---

Produce an EXHAUSTIVE meeting analysis. Capture everything of substance — no summarising down to a top-N list. A 3-hour meeting easily has 15+ key decisions, 10-20 themes, 20+ commitments, dozens of standout moments. Lean toward inclusion. Return as a JSON object with these keys:

{
  "one_line_summary": "Under 25 words. The meeting in a tweet. No em-dashes.",
  "executive_summary": "5-8 paragraphs for a multi-hour meeting (3-4 for shorter ones). Cover: what happened, what was decided, what's in motion now, what's open, what's at stake. Dense and specific — name people, projects, numbers, dates. No filler.",
  "key_decisions": [
    { "decision": "what was decided", "rationale": "why this was the call, including any tradeoffs discussed", "timestamp": "HH:MM:SS or null", "owner": "who or TBD", "stakeholders": "comma-separated names who were part of this decision" }
  ],
  "unresolved_questions": [
    { "question": "the open question", "context": "why it matters and what would unblock it", "timestamp": "or null", "blocked_on": "person/info/decision needed to resolve, or null" }
  ],
  "themes": [
    { "theme": "theme name", "description": "2-4 sentences. Specific — what about this theme, not just that it came up.", "timestamp_range": "start-end or null", "weight": "primary|secondary", "key_speakers": "who drove this theme" }
  ],
  "standout_moments": [
    { "quote": "exact quote — long quotes are fine when the wording matters", "speaker": "real name from the roster", "timestamp": "HH:MM:SS or null", "significance": "why this mattered — could be insight, conflict, vulnerability, breakthrough, etc." }
  ],
  "sentiment_arc": "2-4 paragraphs describing how energy/tone/tension evolved. Name the specific moments where it shifted (with timestamps). Note dynamics between speakers — who was driving, who was resisting, where alignment formed.",
  "people_entities": [
    { "name": "person or org name", "role": "their role in this meeting and in the broader context they're operating in", "key_interests": "what they care about based on what they actually said — quote when useful", "stance": "where they sit on the main questions being discussed" }
  ],
  "commitments": [
    { "commitment": "what was committed", "owner": "who committed", "to_whom": "to whom", "deadline": "by when or TBD", "timestamp": "or null", "context": "why this came up" }
  ],
  "risks_red_flags": [
    { "risk": "the risk or red flag", "severity": "high|medium|low", "context": "why this is a concern, what it could break, and any mitigation that was discussed" }
  ],
  "strategic_implications": [
    { "implication": "what changes for the business/project", "timeframe": "immediate|short-term|long-term", "rationale": "why this is the implication, based on what was said" }
  ],
  "recommended_next_actions": [
    { "action": "concrete next action", "owner": "who should do it", "priority": "P1|P2|P3", "rationale": "1-2 sentences why this is the move and what it unlocks" }
  ],
  "opportunities": [
    { "opportunity": "an opening surfaced in the meeting — a person to follow up with, a partnership angle, a market signal, a capability gap to fill", "context": "why this is interesting", "timestamp": "or null" }
  ]
}

Return ONLY valid JSON. No markdown fences. No explanation outside the JSON.`
}

/**
 * Build the action items prompt.
 */
function buildActionItemsPrompt(transcript, existingAnalysis, speakerNames, attendees) {
  // Use the commitments + recommended actions from the analysis as context
  const analysisContext = existingAnalysis ? JSON.stringify({
    commitments: existingAnalysis.commitments,
    recommended_next_actions: existingAnalysis.recommended_next_actions,
    decisions: existingAnalysis.key_decisions,
  }, null, 2) : ''

  const labelled = applySpeakerNames(transcript, speakerNames)

  return `Extract EVERY action item from this meeting transcript. Be exhaustive — capture every commitment, task, follow-up, deliverable, and implied next-step. If the meeting was long and substantive, expect 25+ items; do not stop at 10. Include implicit ones (something clearly needs to happen but wasn't explicitly assigned).
${buildSpeakerRoster(speakerNames, attendees)}${analysisContext ? `\nFor context, the analysis already identified these commitments, recommendations and decisions — your action items should cover these AND any additional ones the analysis missed:\n${analysisContext}\n` : ''}
Transcript:
${labelled}

Return a JSON array of action items:
[
  {
    "id": "ai-001",
    "action": "concrete action verb-led description. Start with a verb (Send, Build, Review, Schedule, etc.)",
    "owner": "person name (from speaker roster) or TBD",
    "due": "specific date, natural language deadline, or TBD",
    "priority": "P1 (urgent/blocking) | P2 (important/this week) | P3 (eventually)",
    "context": "1-2 sentences: why this came up and what outcome it enables",
    "timestamp_range": "MM:SS-MM:SS or HH:MM:SS-HH:MM:SS or null",
    "dependencies": ["ai-002", "ai-003"],
    "source": "explicit (someone said they would do it) | implicit (it was clearly needed but not assigned)",
    "blocking_for": "what this unblocks if relevant, else null"
  }
]

Rules:
- P1 = must happen before next meeting or blocks others
- P2 = this week
- P3 = whenever, no urgency
- If multiple people own an item, list the primary owner and note others in context
- Use real names from the speaker roster — never "Speaker A"
- Cover the entire meeting, not just the parts that felt action-heavy
- No em-dashes anywhere
- Return ONLY valid JSON array. No markdown fences.`
}

/**
 * Call Claude for analysis. Returns parsed JSON object.
 * Throws on API error or JSON parse failure.
 */
async function callClaudeForAnalysis(transcript, meetingMeta, speakerNames, attendees) {
  const systemPrompt = buildAnalysisSystemPrompt()
  const userPrompt = buildAnalysisPrompt(transcript, meetingMeta, speakerNames, attendees)

  logger.info('[MeetingAnalysis] calling Claude for analysis', {
    transcriptChars: transcript.length,
    model: ANALYSIS_MODEL,
  })

  const { json } = await createMessage({
    model: ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_ANALYSIS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    requestTimeoutMs: ANALYSIS_TIMEOUT_MS,
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
async function callClaudeForActionItems(transcript, existingAnalysis, speakerNames, attendees) {
  const systemPrompt = buildAnalysisSystemPrompt()
  const userPrompt = buildActionItemsPrompt(transcript, existingAnalysis, speakerNames, attendees)

  logger.info('[MeetingAnalysis] calling Claude for action items', {
    transcriptChars: transcript.length,
  })

  const { json } = await createMessage({
    model: ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_ACTION_ITEMS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    requestTimeoutMs: ANALYSIS_TIMEOUT_MS,
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
    // Load transcript + meeting metadata + speaker names + attendees
    const [row] = await db`
      SELECT m.transcript_text, m.title, m.duration_seconds, m.speaker_names, m.attendees,
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
    const speakerNames = row.speaker_names || {}
    const attendees = row.attendees || null

    // Step 1: Full analysis
    const analysisJson = await callClaudeForAnalysis(transcript, meetingMeta, speakerNames, attendees)

    // Step 2: Action items (with analysis context for richer extraction)
    const actionItemsJson = await callClaudeForActionItems(transcript, analysisJson, speakerNames, attendees)

    // Store both
    await db`
      UPDATE meeting_recordings SET
        analysis_json = ${analysisJson},
        action_items_json = ${actionItemsJson},
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
