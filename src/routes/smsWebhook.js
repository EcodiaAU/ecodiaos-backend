/**
 * SMS Webhook - Twilio inbound SMS → OS Session → SMS response.
 *
 * Allowlist: TATE_MOBILE env var, plus any phone number in crm_contacts
 * whose parent client has can_sms = true (or is explicitly a partner).
 * All numbers normalized to E.164 on both sides before comparison.
 */
const express = require('express')
const router = express.Router()
const osSession = require('../services/osSessionService')
const db = require('../config/db')
const validateTwilioSignature = require('../middleware/twilioValidation')
const { wrapUntrusted } = require('../lib/untrustedInput')

// E.164: +<country><number>, 8–15 digits total. Anything else is rejected
// before reaching sendMessage - stops spoofed / malformed senders from
// burning OS quota.
const E164 = /^\+[1-9]\d{7,14}$/

function normalizePhone(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/[\s()\-.]/g, '').replace(/['"]/g, '')
  return E164.test(cleaned) ? cleaned : null
}

const TATE_MOBILE = normalizePhone(process.env.TATE_MOBILE || '')
if (!TATE_MOBILE) {
  console.warn('[SMS Webhook] TATE_MOBILE is missing or not E.164 - Tate will not be recognized')
}

async function lookupContact(phone) {
  // Audit 2026-05-13 P1: previously this returned any crm_contacts row
  // matching the phone, but the SMS doctrine only allows messages from
  // contacts whose parent client has `can_sms = true`. The predicate
  // was documented at the top of this file but never enforced in the
  // SQL. Tighten the SELECT to honour the doctrine: a contact attached
  // to a client with `can_sms != true` (or no parent client) is treated
  // as unknown.
  try {
    const rows = await db`
      SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
      FROM crm_contacts c
      INNER JOIN clients cl ON cl.id = c.client_id
      WHERE c.phone = ${phone}
        AND cl.can_sms = true
      LIMIT 1
    `
    return rows[0] || null
  } catch (err) {
    // If the `can_sms` column doesn't exist in this schema generation,
    // fall back to the legacy SELECT — but log a warning so the gap is
    // visible (the doctrine has been written; the column should land).
    if (/column.*can_sms.*does not exist/i.test(err.message || '')) {
      console.warn('[SMS] clients.can_sms column missing - falling back to permissive lookup (add column to enforce)')
      try {
        const rows = await db`
          SELECT c.name, c.role, c.notes, cl.name AS client_name, cl.status AS client_status
          FROM crm_contacts c
          LEFT JOIN clients cl ON cl.id = c.client_id
          WHERE c.phone = ${phone}
          LIMIT 1
        `
        return rows[0] || null
      } catch (err2) {
        console.error('[SMS] Contact lookup fallback failed:', err2.message)
        return null
      }
    }
    console.error('[SMS] Contact lookup failed:', err.message)
    return null
  }
}

router.post('/incoming', validateTwilioSignature, async (req, res) => {
  const { From, Body } = req.body
  const from = normalizePhone(From)

  // Malformed / spoofed number - reject immediately, no OS turn burn.
  if (!from) {
    console.warn('[SMS Webhook] Rejected non-E.164 sender', { raw: From })
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
    return
  }

  const isTate = !!TATE_MOBILE && from === TATE_MOBILE
  const contact = isTate ? null : await lookupContact(from)
  const isKnown = isTate || !!contact
  const senderName = isTate ? 'Tate' : (contact?.name || 'Unknown')

  console.log(`[SMS Webhook] From: ${from} | Known: ${isKnown} | Sender: ${senderName} | Body: ${(Body || '').slice(0, 80)}`)

  if (!isKnown) {
    console.log(`[SMS Webhook] Rejected unknown number: ${from}`)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
    return
  }

  try {
    const contextBits = []
    if (contact?.client_name)   contextBits.push(`client: ${contact.client_name}${contact.client_status ? ` (${contact.client_status})` : ''}`)
    if (contact?.role)          contextBits.push(`role: ${contact.role}`)
    if (contact?.notes)         contextBits.push(`notes: ${contact.notes}`)
    const context = contextBits.length ? `Context - ${contextBits.join(' · ')}.` : ''

    // Audit 2026-05-13 P2: previously `${senderName}`, `${from}`, and
    // `${Body}` were interpolated into the prompt without any
    // untrusted-input envelope. SECURITY_HARDENING.md §2.1 mandates that
    // every external-text boundary (SMS, email, voice, upload) is wrapped
    // in the random-suffix `<untrusted_input>` block so the model treats
    // the contents as data, never instructions. Apply it now.
    const untrustedBody = wrapUntrusted(String(Body || ''), {
      source: 'sms',
      sender: isTate ? 'tate' : senderName,
      from,
    })
    const prompt = `[SMS from ${senderName} (${from})]\n\n${untrustedBody}\n\n${context}\n\nRespond concisely (SMS length). Send your reply back via the send_sms tool to ${from}. Aim for under 320 chars. Tone should match the relationship - warm and direct with Tate, professional with clients, appropriate with the person.`

    // priority: false - queue behind the active turn (same as chat /message).
    // Hard-interrupting with priority:true broke the interrupt/reply/end cycle:
    // SMS would abort mid-turn, I'd reply, turn would end, prior work never resumed.
    // Tate flagged 2026-04-23 22:10 AEST. Queue behaviour: if idle, fires immediately
    // (wake case still works); if mid-turn, fires after current turn completes
    // (preserves flow). See CLAUDE.md "Turn Completion Discipline".
    osSession.sendMessage(prompt, { priority: false }).catch(err => {
      console.error('[SMS Webhook] OS session error:', err.message)
    })
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  } catch (err) {
    console.error('[SMS Webhook] Error:', err.message)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  }
})

module.exports = router
