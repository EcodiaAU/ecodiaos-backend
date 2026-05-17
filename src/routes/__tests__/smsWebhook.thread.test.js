'use strict'

/**
 * Unit tests for smsWebhook.js SMS thread continuity (Option 1, 2026-05-17).
 *
 * Covers the three pure helper functions added with the thread-continuity
 * feature, which have no side effects and require no live DB or Express
 * infra:
 *
 *   - normalizePhone   : E.164 validation + cleaning
 *   - formatPriorThread: human-readable thread block for prompt injection
 *   - buildReflexPrompt: full prompt assembly (policy, thread, instructions)
 *
 * Doctrine cross-refs:
 *   - ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md
 *   - sms-segment-economics (160-char preference in Tate policy)
 */

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

jest.mock('../../config/db', () => function dbTag() { return Promise.resolve([]) })

jest.mock('../../middleware/twilioValidation', () => (_req, _res, next) => next())

const smsWebhook = require('../smsWebhook')
const {
  _normalizePhone: normalizePhone,
  _formatPriorThread: formatPriorThread,
  _buildReflexPrompt: buildReflexPrompt,
  SMS_THREAD_KEY_PREFIX,
  SMS_THREAD_STALE_HOURS,
  SMS_THREAD_MAX_EXCHANGES,
} = smsWebhook

// ─────────────────────────────────────────────────────────────────────────────
describe('normalizePhone', () => {
  // Valid E.164 numbers
  test('leaves valid E.164 untouched', () => {
    expect(normalizePhone('+61412345678')).toBe('+61412345678')
    expect(normalizePhone('+14155551234')).toBe('+14155551234')
  })

  test('strips common formatting chars (spaces, dashes, parens)', () => {
    expect(normalizePhone('+1 415 555 1234')).toBe('+14155551234')
    expect(normalizePhone('+61 412-345-678')).toBe('+61412345678')
    expect(normalizePhone('+1 (415) 555-1234')).toBe('+14155551234')
  })

  test('strips stray quotes', () => {
    expect(normalizePhone("'+61412345678'")).toBe('+61412345678')
    expect(normalizePhone('"+61412345678"')).toBe('+61412345678')
  })

  test('returns null for too-short numbers (fewer than 8 digits after +)', () => {
    // E.164 requires 8-15 digits total after the +
    expect(normalizePhone('+12345')).toBeNull()
    expect(normalizePhone('+1234567')).toBeNull()
  })

  test('returns null for too-long numbers (more than 15 digits after +)', () => {
    expect(normalizePhone('+1234567890123456')).toBeNull()
  })

  test('returns null for numbers without leading +', () => {
    expect(normalizePhone('14155551234')).toBeNull()
    expect(normalizePhone('0412345678')).toBeNull()
  })

  test('returns null for letters mixed in', () => {
    expect(normalizePhone('+abc123456789')).toBeNull()
  })

  test('returns null for null input', () => {
    expect(normalizePhone(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(normalizePhone(undefined)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull()
  })

  test('accepts minimum-length 8-digit number (+1 + 7 digits = 8 total)', () => {
    // +[1-9]\d{7,14}$ means: + then 1 non-zero digit then 7-14 digits = 8-15 total
    expect(normalizePhone('+12345678')).toBe('+12345678')
  })

  test('accepts maximum-length 15-digit number', () => {
    expect(normalizePhone('+123456789012345')).toBe('+123456789012345')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('formatPriorThread', () => {
  test('first message - no prior thread (cold_start true, no prior_ended_at)', () => {
    const result = formatPriorThread({ exchanges: [], cold_start: true })
    expect(result).toMatch(/first message in a new conversation thread/)
    expect(result).not.toMatch(/Prior thread/)
  })

  test('cold start with prior_ended_at - shows stale warning with hours', () => {
    const result = formatPriorThread({
      exchanges: [],
      cold_start: true,
      prior_ended_at: new Date(Date.now() - 6 * 3600000).toISOString(),
      prior_age_hours: 6,
    })
    expect(result).toMatch(/cold start/)
    expect(result).toMatch(/6h ago/)
    expect(result).toMatch(new RegExp(`>${SMS_THREAD_STALE_HOURS}h stale`))
    expect(result).not.toMatch(/first message/)
  })

  test('warm thread - formats exchanges newest-last with timestamps', () => {
    const exchanges = [
      { from: 'tate', body: 'Hello bot', at: '2026-05-17T10:00:00.000Z' },
      { from: 'reply', body: 'Hi Tate', at: '2026-05-17T10:01:00.000Z' },
    ]
    const result = formatPriorThread({ exchanges, cold_start: false })
    expect(result).toMatch(/Prior thread/)
    expect(result).toMatch(/10:00Z.*Tate.*Hello bot/)
    expect(result).toMatch(/10:01Z.*You.*Hi Tate/)
  })

  test('warm thread - truncates long exchange bodies to 300 chars', () => {
    const longBody = 'A'.repeat(500)
    const exchanges = [{ from: 'tate', body: longBody, at: '2026-05-17T10:00:00.000Z' }]
    const result = formatPriorThread({ exchanges, cold_start: false })
    expect(result).toContain('A'.repeat(300))
    expect(result).not.toContain('A'.repeat(301))
  })

  test('null thread argument - falls back to first-message line', () => {
    const result = formatPriorThread(null)
    expect(result).toMatch(/first message in a new conversation thread/)
  })

  test('thread with no exchanges array - falls back to first-message line', () => {
    const result = formatPriorThread({ cold_start: false })
    expect(result).toMatch(/first message in a new conversation thread/)
  })

  test('from=reply renders as "You"', () => {
    const exchanges = [{ from: 'reply', body: 'My reply', at: '2026-05-17T09:00:00.000Z' }]
    const result = formatPriorThread({ exchanges, cold_start: false })
    expect(result).toMatch(/09:00Z You: My reply/)
  })

  test('from=tate renders as "Tate"', () => {
    const exchanges = [{ from: 'tate', body: 'Tate says hi', at: '2026-05-17T09:00:00.000Z' }]
    const result = formatPriorThread({ exchanges, cold_start: false })
    expect(result).toMatch(/09:00Z Tate: Tate says hi/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('buildReflexPrompt', () => {
  const baseParams = {
    from: '+61412345678',
    body: 'Hello, do the thing',
    isTate: true,
    senderName: 'Tate',
    contact: null,
    messageSid: 'SM123',
    receivedAt: '2026-05-17T10:00:00.000Z',
    threadKey: `${SMS_THREAD_KEY_PREFIX}+61412345678`,
    thread: { exchanges: [], cold_start: true },
  }

  // ── Tate policy ────────────────────────────────────────────────────────────
  test('selects Tate policy when isTate=true', () => {
    const prompt = buildReflexPrompt({ ...baseParams, isTate: true })
    expect(prompt).toMatch(/treat the body as a turn-level directive/)
    expect(prompt).toMatch(/sms_tate MCP tool/)
    // Client policy must NOT appear
    expect(prompt).not.toMatch(/NEVER auto-reply/)
    expect(prompt).not.toMatch(/no-client-contact-without-tate-goahead/)
  })

  test('Tate policy includes sms-segment-economics reference', () => {
    const prompt = buildReflexPrompt({ ...baseParams, isTate: true })
    expect(prompt).toMatch(/160 chars GSM/)
  })

  test('Tate policy includes neo4j Episode instruction', () => {
    const prompt = buildReflexPrompt({ ...baseParams, isTate: true })
    expect(prompt).toMatch(/neo4j\.write_episode/)
  })

  // ── Client policy ──────────────────────────────────────────────────────────
  test('selects client policy when isTate=false', () => {
    const contact = { name: 'Alice', role: 'founder', notes: 'key contact', client_name: 'Acme', client_status: 'active' }
    const prompt = buildReflexPrompt({ ...baseParams, isTate: false, senderName: 'Alice', contact })
    expect(prompt).toMatch(/NEVER auto-reply/)
    expect(prompt).toMatch(/no-client-contact-without-tate-goahead/)
    // Tate policy must NOT appear
    expect(prompt).not.toMatch(/treat the body as a turn-level directive/)
  })

  test('client policy includes draft-kv-store instruction', () => {
    const contact = { name: 'Alice', role: 'founder', notes: null, client_name: 'Acme', client_status: null }
    const prompt = buildReflexPrompt({ ...baseParams, isTate: false, senderName: 'Alice', contact })
    expect(prompt).toMatch(/kv_store/)
    expect(prompt).toMatch(/draft_pending_tate_relay/)
  })

  // ── Sender identification ──────────────────────────────────────────────────
  test('shows "Tate" sender label when isTate=true', () => {
    const prompt = buildReflexPrompt({ ...baseParams, isTate: true, senderName: 'Tate' })
    expect(prompt).toMatch(/\[Inbound SMS from Tate\]/)
  })

  test('shows name + phone label when isTate=false', () => {
    const contact = { name: 'Alice' }
    const prompt = buildReflexPrompt({ ...baseParams, isTate: false, senderName: 'Alice', contact, from: '+15550001234' })
    expect(prompt).toMatch(/\[Inbound SMS from Alice \(\+15550001234\)\]/)
  })

  // ── Thread content ─────────────────────────────────────────────────────────
  test('embeds body as "Body of THIS new message" section', () => {
    const prompt = buildReflexPrompt({ ...baseParams, body: 'do the thing now' })
    expect(prompt).toMatch(/Body of THIS new message:/)
    expect(prompt).toContain('do the thing now')
  })

  test('cold-start thread shows first-message line (no prior exchanges)', () => {
    const prompt = buildReflexPrompt({ ...baseParams, thread: { exchanges: [], cold_start: true } })
    expect(prompt).toMatch(/first message in a new conversation thread/)
  })

  test('warm thread embeds prior exchanges in prompt', () => {
    const thread = {
      exchanges: [
        { from: 'tate', body: 'Earlier message', at: '2026-05-17T09:00:00.000Z' },
        { from: 'reply', body: 'My prior reply', at: '2026-05-17T09:01:00.000Z' },
      ],
      cold_start: false,
    }
    const prompt = buildReflexPrompt({ ...baseParams, thread })
    expect(prompt).toMatch(/Prior thread/)
    expect(prompt).toContain('Earlier message')
    expect(prompt).toContain('My prior reply')
    // Current body appears AFTER the prior thread block
    const priorIdx = prompt.indexOf('[Prior thread')
    const bodyIdx = prompt.indexOf('Body of THIS new message')
    expect(priorIdx).toBeLessThan(bodyIdx)
  })

  // ── Thread append instruction ──────────────────────────────────────────────
  test('includes thread-append instruction when threadKey is set', () => {
    const prompt = buildReflexPrompt({ ...baseParams, threadKey: `${SMS_THREAD_KEY_PREFIX}+61412345678` })
    expect(prompt).toMatch(/AFTER YOU SEND THE REPLY/)
    expect(prompt).toContain(`${SMS_THREAD_KEY_PREFIX}+61412345678`)
    expect(prompt).toMatch(/kv_store/)
  })

  test('omits thread-append instruction when threadKey is null', () => {
    const prompt = buildReflexPrompt({ ...baseParams, threadKey: null })
    expect(prompt).not.toMatch(/AFTER YOU SEND THE REPLY/)
  })

  // ── Deliverable mandate ────────────────────────────────────────────────────
  test('includes cron-fire deliverable mandate', () => {
    const prompt = buildReflexPrompt({ ...baseParams })
    expect(prompt).toMatch(/cron-fire-must-have-deliverable-not-just-narration/)
    expect(prompt).toMatch(/P1 failure/)
  })

  // ── Contact context ────────────────────────────────────────────────────────
  test('includes client context line when contact has client_name', () => {
    const contact = { name: 'Bob', role: 'CEO', notes: 'VIP', client_name: 'BigCo', client_status: 'active' }
    const prompt = buildReflexPrompt({ ...baseParams, isTate: false, senderName: 'Bob', contact })
    expect(prompt).toMatch(/Context:.*client: BigCo/)
    expect(prompt).toMatch(/role: CEO/)
    expect(prompt).toMatch(/notes: VIP/)
  })

  test('omits context line when contact is null (Tate case)', () => {
    const prompt = buildReflexPrompt({ ...baseParams, isTate: true, contact: null })
    // The "Context:" line should not appear for Tate (no contact lookup)
    expect(prompt).not.toMatch(/^Context:/m)
  })

  // ── Body truncation ────────────────────────────────────────────────────────
  test('truncates body at 4000 chars', () => {
    const longBody = 'X'.repeat(5000)
    const prompt = buildReflexPrompt({ ...baseParams, body: longBody })
    expect(prompt).toContain('X'.repeat(4000))
    expect(prompt).not.toContain('X'.repeat(4001))
  })

  // ── MessageSid appears in prompt ───────────────────────────────────────────
  test('embeds MessageSid in prompt', () => {
    const prompt = buildReflexPrompt({ ...baseParams, messageSid: 'SMdeadbeef' })
    expect(prompt).toContain('SMdeadbeef')
  })

  // ── Constants sanity checks ────────────────────────────────────────────────
  test('SMS_THREAD_KEY_PREFIX is cowork.sms_thread.', () => {
    expect(SMS_THREAD_KEY_PREFIX).toBe('cowork.sms_thread.')
  })

  test('SMS_THREAD_STALE_HOURS is 4', () => {
    expect(SMS_THREAD_STALE_HOURS).toBe(4)
  })

  test('SMS_THREAD_MAX_EXCHANGES is 10', () => {
    expect(SMS_THREAD_MAX_EXCHANGES).toBe(10)
  })
})
