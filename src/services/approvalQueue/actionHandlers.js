'use strict'

/**
 * actionHandlers.js
 *
 * Per-item-type "Y / edit" executors. Each handler returns
 *   { ok, summary, log_payload }
 * where:
 *   summary     - one-paragraph human-readable outcome (stored on approval_queue.outcome)
 *   log_payload - everything needed for the corresponding reverse handler later
 *
 * Concrete:  email_send, free_text
 * Stubs:     release_ship, spend_execute, doctrine_write, observer_ack
 *            (throw NotImplementedError until their producers are wired)
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

class NotImplementedError extends Error {
  constructor(handler) {
    super(`actionHandler not implemented: ${handler}`)
    this.name = 'NotImplementedError'
  }
}

// ---------- email_send ----------

async function emailSend(action) {
  // action: { thread_id, body, subject?, recipient? }
  const { thread_id, body } = action
  if (!thread_id || !body) {
    return { ok: false, summary: 'email_send action missing thread_id or body', log_payload: { action } }
  }
  // Lazy-require to avoid circular import via gmailService -> approvalQueue producer
  const gmail = require('../gmailService')
  try {
    const result = await gmail.sendReply(thread_id, body)
    if (!result?.ok) {
      return {
        ok: false,
        summary: `email_send failed: ${result?.error || 'gmail.sendReply returned not-ok'}`,
        log_payload: { action, error: result?.error || 'unknown' },
      }
    }
    const messageId = result.message_id || result.id || null
    return {
      ok: true,
      summary: `Sent reply in thread ${thread_id}${messageId ? ` (message ${messageId})` : ''}`,
      log_payload: {
        action,
        gmail_thread_id: thread_id,
        gmail_message_id: messageId,
        sent_body: body,
      },
    }
  } catch (err) {
    logger.warn('email_send handler error', { error: err.message, thread_id })
    return {
      ok: false,
      summary: `email_send threw: ${err.message}`,
      log_payload: { action, error: err.message },
    }
  }
}

// ---------- free_text ----------
// status_board-backed row. Y means "Tate cleared it: hand the action back to
// ecodiaos to execute." We flip next_action_by and let the scheduled work
// substrate pick it up via existing paths.

async function freeText(action) {
  const status_board_id = action.status_board_id
  if (!status_board_id) {
    return { ok: false, summary: 'free_text missing status_board_id', log_payload: { action } }
  }
  try {
    const before = await db`
      SELECT id, name, next_action, next_action_by
      FROM status_board WHERE id = ${status_board_id}
    `
    if (before.length === 0) {
      return { ok: false, summary: 'status_board row not found', log_payload: { action } }
    }
    const prior = before[0]
    await db`
      UPDATE status_board
      SET next_action_by = 'ecodiaos', last_touched = NOW()
      WHERE id = ${status_board_id}
    `
    return {
      ok: true,
      summary: `status_board row "${prior.name}" handed back to ecodiaos for execution`,
      log_payload: {
        action,
        status_board_id,
        prior_next_action_by: prior.next_action_by,
        prior_next_action: prior.next_action,
      },
    }
  } catch (err) {
    return { ok: false, summary: `free_text threw: ${err.message}`, log_payload: { action, error: err.message } }
  }
}

// ---------- stubs ----------
// These throw until producers are wired. Catches in resolutionService surface as
// outcome='failed: NotImplementedError'.

async function releaseShip(_action) { throw new NotImplementedError('release_ship') }
async function spendExecute(_action) { throw new NotImplementedError('spend_execute') }
async function doctrineWrite(_action) { throw new NotImplementedError('doctrine_write') }
async function observerAck(_action) { throw new NotImplementedError('observer_ack') }

// ---------- dispatcher ----------

const HANDLERS = {
  email_send: emailSend,
  free_text: freeText,
  release_ship: releaseShip,
  spend_execute: spendExecute,
  doctrine_write: doctrineWrite,
  observer_ack: observerAck,
}

async function execute(item_type, action) {
  const fn = HANDLERS[item_type]
  if (!fn) throw new NotImplementedError(`unknown item_type ${item_type}`)
  return fn(action)
}

module.exports = { execute, HANDLERS, NotImplementedError }
