#!/usr/bin/env node
'use strict'

/**
 * setup-gmail-pubsub.js - one-shot GCP setup for Gmail push notifications.
 *
 * Assumes GOOGLE_SERVICE_ACCOUNT_JSON env is set (it is on the VPS where this
 * script runs). The service account must have the following IAM roles on the
 * GCP project:
 *   - roles/pubsub.admin
 *   - roles/iam.serviceAccountTokenCreator (on itself, for OIDC minting)
 *
 * Gmail API + Pub/Sub API must be enabled on the project (Tate confirmed
 * both enabled in EcodiaOS GCP project 2026-05-18).
 *
 * What this does (all idempotent):
 *   1. Reads GOOGLE_SERVICE_ACCOUNT_JSON, extracts project_id + client_email.
 *   2. Creates Pub/Sub topic `gmail-inbound` if not present.
 *   3. Grants gmail-api-push@system.gserviceaccount.com Pub/Sub Publisher
 *      on the topic.
 *   4. Creates push subscription `gmail-inbound-to-webhook` if not present.
 *      Audience = GMAIL_PUSH_EXPECTED_AUDIENCE (default
 *      https://api.admin.ecodia.au). Push endpoint = WEBHOOK_URL (default
 *      https://api.admin.ecodia.au/api/webhooks/gmail-push).
 *   5. Calls gmail.users.watch for each inbox in GMAIL_WATCH_INBOXES
 *      (default: tate@ecodia.au,code@ecodia.au,money@ecodia.au).
 *   6. Stamps kv_store.cowork.gmail_push.setup_state with last result.
 *
 * Re-runnable: every step checks existence first; safe to run any time.
 * Watch expires every 7 days - the gmail-watch-refresh cron re-fires
 * users.watch daily.
 *
 * Output: JSON to stdout summarising what happened. Non-zero exit on
 * unrecoverable error (missing creds, project not accessible).
 */

const fs = require('fs')
const path = require('path')

// Dotenv: load .env.production if present, falling back to .env
try {
  const envFile = process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env'
  require('dotenv').config({
    path: path.join(__dirname, '..', '..', envFile),
  })
} catch {}

const { google } = require('googleapis')

const WEBHOOK_URL = process.env.WEBHOOK_URL
  || 'https://api.admin.ecodia.au/api/webhooks/gmail-push'
const AUDIENCE = process.env.GMAIL_PUSH_EXPECTED_AUDIENCE
  || 'https://api.admin.ecodia.au'
const TOPIC_NAME = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-inbound'
const SUBSCRIPTION_NAME = process.env.GMAIL_PUBSUB_SUBSCRIPTION || 'gmail-inbound-to-webhook'
const INBOXES = (process.env.GMAIL_WATCH_INBOXES
  || 'tate@ecodia.au,code@ecodia.au,money@ecodia.au')
  .split(',').map(s => s.trim()).filter(Boolean)

function _serviceAccountFromEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw || raw === '{}') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env not set (or empty {})')
  }
  const sa = JSON.parse(raw)
  if (!sa.project_id) throw new Error('service account JSON missing project_id')
  if (!sa.client_email) throw new Error('service account JSON missing client_email')
  if (!sa.private_key) throw new Error('service account JSON missing private_key')
  return sa
}

async function _getPubSubAuth(sa) {
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/pubsub'],
  })
  await auth.authorize()
  return auth
}

async function _getGmailAuth(sa, subjectEmail) {
  // Domain-wide delegation: the service account impersonates the inbox owner.
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

async function ensureTopic(pubsub, projectId) {
  const fullName = `projects/${projectId}/topics/${TOPIC_NAME}`
  try {
    await pubsub.projects.topics.get({ topic: fullName })
    return { name: fullName, action: 'already_exists' }
  } catch (err) {
    if (err.code !== 404) throw err
  }
  await pubsub.projects.topics.create({ name: fullName })
  return { name: fullName, action: 'created' }
}

async function ensureGmailPublisherIam(pubsub, topicFullName) {
  // Read current policy, add the gmail-api-push principal if absent.
  const { data: policy } = await pubsub.projects.topics.getIamPolicy({
    resource: topicFullName,
  })
  const bindings = policy.bindings || []
  const target = 'serviceAccount:gmail-api-push@system.gserviceaccount.com'
  const targetRole = 'roles/pubsub.publisher'
  let pubBinding = bindings.find(b => b.role === targetRole)
  if (pubBinding && (pubBinding.members || []).includes(target)) {
    return { action: 'already_granted' }
  }
  if (pubBinding) {
    pubBinding.members = [...(pubBinding.members || []), target]
  } else {
    bindings.push({ role: targetRole, members: [target] })
  }
  await pubsub.projects.topics.setIamPolicy({
    resource: topicFullName,
    requestBody: { policy: { ...policy, bindings } },
  })
  return { action: 'granted' }
}

async function ensureSubscription(pubsub, projectId, topicFullName, sa) {
  const subFullName = `projects/${projectId}/subscriptions/${SUBSCRIPTION_NAME}`
  try {
    await pubsub.projects.subscriptions.get({ subscription: subFullName })
    return { name: subFullName, action: 'already_exists' }
  } catch (err) {
    if (err.code !== 404) throw err
  }
  await pubsub.projects.subscriptions.create({
    name: subFullName,
    requestBody: {
      topic: topicFullName,
      pushConfig: {
        pushEndpoint: WEBHOOK_URL,
        oidcToken: {
          serviceAccountEmail: sa.client_email,
          audience: AUDIENCE,
        },
      },
      ackDeadlineSeconds: 60,
      messageRetentionDuration: '86400s',
      // To make a subscription never expire, set ttl to '0s' OR omit the
      // expirationPolicy entirely. Empty-string ttl is invalid (must end 's').
      expirationPolicy: { ttl: '0s' },
    },
  })
  return { name: subFullName, action: 'created' }
}

async function watchInbox(sa, projectId, inbox) {
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
        topicName: `projects/${projectId}/topics/${TOPIC_NAME}`,
        labelFilterBehavior: 'INCLUDE',
      },
    })
    return {
      inbox, ok: true, historyId: data.historyId, expiration: data.expiration,
    }
  } catch (err) {
    return {
      inbox, ok: false, reason: 'watch_call_failed',
      status: err.code, error: err.message?.slice(0, 200),
    }
  }
}

async function main() {
  const out = { started_at: new Date().toISOString(), steps: {} }
  let sa
  try {
    sa = _serviceAccountFromEnv()
    out.project_id = sa.project_id
    out.client_email = sa.client_email
  } catch (err) {
    out.fatal = err.message
    console.log(JSON.stringify(out, null, 2))
    process.exit(2)
  }

  const auth = await _getPubSubAuth(sa)
  const pubsub = google.pubsub({ version: 'v1', auth })

  try {
    out.steps.topic = await ensureTopic(pubsub, sa.project_id)
  } catch (err) {
    out.steps.topic = { error: err.message, code: err.code }
  }

  if (out.steps.topic?.name) {
    try {
      out.steps.iam = await ensureGmailPublisherIam(pubsub, out.steps.topic.name)
    } catch (err) {
      out.steps.iam = { error: err.message, code: err.code }
    }

    try {
      out.steps.subscription = await ensureSubscription(
        pubsub, sa.project_id, out.steps.topic.name, sa,
      )
    } catch (err) {
      out.steps.subscription = { error: err.message, code: err.code }
    }
  }

  out.steps.watches = []
  for (const inbox of INBOXES) {
    out.steps.watches.push(await watchInbox(sa, sa.project_id, inbox))
  }

  // Stamp kv_store with the result so the conductor can probe state without
  // re-running the script.
  try {
    const db = require('../../src/config/db')
    await db`
      INSERT INTO kv_store (key, value)
      VALUES ('cowork.gmail_push.setup_state', ${JSON.stringify(out)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `
  } catch (err) {
    out.kv_stamp_warning = err.message
  }

  out.finished_at = new Date().toISOString()
  console.log(JSON.stringify(out, null, 2))

  const anyFatal = !!out.fatal
  process.exit(anyFatal ? 1 : 0)
}

main().catch(err => {
  console.error('setup-gmail-pubsub: unhandled', err)
  process.exit(1)
})
