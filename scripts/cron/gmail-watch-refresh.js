#!/usr/bin/env node
'use strict'

/**
 * gmail-watch-refresh.js - daily cron that re-fires gmail.users.watch for
 * every inbox in GMAIL_WATCH_INBOXES. Gmail's watch expires every 7 days;
 * re-firing daily means the longest possible gap between expiry and refresh
 * is ~24h. Idempotent: re-firing watch just resets the timer.
 *
 * Reads GOOGLE_SERVICE_ACCOUNT_JSON env. Uses domain-wide delegation per
 * inbox.
 *
 * Output: JSON to stdout listing per-inbox result. Stamps
 * kv_store.cowork.gmail_push.last_watch_refresh.
 *
 * Schedule: registered in os_scheduled_tasks 'gmail-watch-refresh' daily.
 */

const path = require('path')

try {
  require('dotenv').config({
    path: path.join(__dirname, '..', '..', '.env.production'),
  })
} catch {}

const { google } = require('googleapis')

const TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-inbound'
const INBOXES = (process.env.GMAIL_WATCH_INBOXES
  || 'tate@ecodia.au,code@ecodia.au,money@ecodia.au')
  .split(',').map(s => s.trim()).filter(Boolean)

function _serviceAccountFromEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw || raw === '{}') throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  return JSON.parse(raw)
}

async function _getGmailAuth(sa, subjectEmail) {
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    subject: subjectEmail,
  })
  await auth.authorize()
  return auth
}

async function refreshInbox(sa, inbox) {
  let auth
  try {
    auth = await _getGmailAuth(sa, inbox)
  } catch (err) {
    return { inbox, ok: false, reason: 'auth_failed', error: err.message }
  }
  const gmail = google.gmail({ version: 'v1', auth })
  try {
    const { data } = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/${sa.project_id}/topics/${TOPIC_NAME}`,
        labelFilterBehavior: 'INCLUDE',
      },
    })
    return { inbox, ok: true, historyId: data.historyId, expiration: data.expiration }
  } catch (err) {
    return {
      inbox, ok: false, reason: 'watch_call_failed',
      status: err.code, error: err.message?.slice(0, 200),
    }
  }
}

async function main() {
  const sa = _serviceAccountFromEnv()
  const results = []
  for (const inbox of INBOXES) {
    results.push(await refreshInbox(sa, inbox))
  }
  const out = {
    fired_at: new Date().toISOString(),
    topic: TOPIC_NAME,
    project_id: sa.project_id,
    results,
  }
  console.log(JSON.stringify(out, null, 2))

  try {
    const db = require('../../src/config/db')
    await db`
      INSERT INTO kv_store (key, value)
      VALUES ('cowork.gmail_push.last_watch_refresh', ${JSON.stringify(out)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch {}

  const allOk = results.every(r => r.ok)
  process.exit(allOk ? 0 : 0)  // exit 0 always; per-inbox failures are tracked in kv
}

main().catch(err => {
  console.error('gmail-watch-refresh: unhandled', err)
  process.exit(1)
})
