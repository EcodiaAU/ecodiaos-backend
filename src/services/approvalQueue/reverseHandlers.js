'use strict'

/**
 * reverseHandlers.js
 *
 * Per-item-type rollback handlers, called by resolutionService.reverse within
 * the reversible_until window. Each returns { ok, summary, reversal_payload }.
 *
 * Concrete:  email_send (gmail trash + recall note), free_text (board state
 *            flipped back), spend_execute (Stripe refund stub)
 * Non-reversible: observer_ack returns ok with summary noting nothing to undo
 * Partial:    release_ship for vercel = vercel.rollback; for store releases
 *             writes a status_board P1 + returns ok with partial flag
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

class NotReversibleError extends Error {
  constructor(item_type, reason) {
    super(`reverse not supported for ${item_type}: ${reason}`)
    this.name = 'NotReversibleError'
  }
}

// ---------- email_send ----------

async function emailSend(action_payload, reason) {
  const { gmail_thread_id, gmail_message_id } = action_payload || {}
  if (!gmail_message_id) {
    return { ok: false, summary: 'reverse: no gmail_message_id captured at send time', reversal_payload: { reason } }
  }
  const gmail = require('../gmailService')
  let trashed = false
  try {
    if (typeof gmail.trashMessage === 'function') {
      await gmail.trashMessage(gmail_message_id)
      trashed = true
    } else if (typeof gmail.trashThread === 'function' && gmail_thread_id) {
      // Fallback: trash the whole thread (heavy-handed; documented)
      logger.warn('reverseHandlers.email_send: trashMessage not available, falling back to trashThread', { gmail_thread_id })
      await gmail.trashThread(gmail_thread_id)
      trashed = true
    }
  } catch (err) {
    logger.warn('reverseHandlers.email_send trash failed', { error: err.message, gmail_message_id })
  }

  let recallSent = false
  try {
    if (gmail_thread_id && typeof gmail.sendReply === 'function') {
      const recallBody =
        `Recalled: my prior message in this thread (${new Date().toISOString()}) was sent in error. ` +
        `Please disregard. Reason: ${reason || 'reversed by Tate'}. Tate will follow up directly if needed.`
      const r = await gmail.sendReply(gmail_thread_id, recallBody)
      recallSent = !!r?.ok
    }
  } catch (err) {
    logger.warn('reverseHandlers.email_send recall note failed', { error: err.message })
  }

  return {
    ok: true,
    summary: `email_send reversed: trashed=${trashed} recall_note=${recallSent} reason="${reason || ''}"`,
    reversal_payload: { trashed, recallSent, reason },
  }
}

// ---------- free_text ----------

async function freeText(action_payload, reason) {
  const { status_board_id, prior_next_action_by, prior_next_action } = action_payload || {}
  if (!status_board_id) {
    throw new NotReversibleError('free_text', 'no status_board_id in action_payload')
  }
  try {
    await db`
      UPDATE status_board
      SET next_action_by = ${prior_next_action_by || 'tate'},
          next_action    = ${prior_next_action || null},
          last_touched   = NOW(),
          context        = COALESCE(context, '') || E'\n[approval_queue.reverse: restored at ' || NOW()::text || ' reason="' || ${reason || ''} || '"]'
      WHERE id = ${status_board_id}
    `
    return {
      ok: true,
      summary: `status_board row ${status_board_id} restored to next_action_by=${prior_next_action_by || 'tate'}`,
      reversal_payload: { status_board_id, restored_to: prior_next_action_by || 'tate', reason },
    }
  } catch (err) {
    throw new NotReversibleError('free_text', err.message)
  }
}

// ---------- stubs ----------

async function releaseShip(action_payload, reason) {
  // Vercel = vercel.rollback (stub). Store releases = non-reversible at the store.
  const platform = action_payload?.action?.platform || 'unknown'
  if (platform === 'vercel') {
    return {
      ok: true,
      summary: 'release_ship reverse: vercel.rollback stub (wire in writing-plans phase)',
      reversal_payload: { platform, reason, stub: true },
    }
  }
  // For App Store / Play Store: write a P1 to status_board and return ok with partial
  try {
    await db`
      INSERT INTO status_board
        (entity_type, name, status, next_action, next_action_by, priority, context)
      VALUES
        ('infrastructure',
         'release_ship rollback requested but store release is live',
         'attention',
         'Manual action: pull or supersede the live store release',
         'tate', 1,
         ${`Reverse requested at ${new Date().toISOString()}; reason="${reason || ''}"; original action=${JSON.stringify(action_payload).slice(0, 1500)}`})
    `
  } catch (err) {
    logger.warn('release_ship reverse status_board insert failed', { error: err.message })
  }
  return {
    ok: true,
    summary: 'release_ship reverse: store releases not reversible at store level; status_board P1 written',
    reversal_payload: { platform, reason, partial: true },
  }
}

async function spendExecute(action_payload, reason) {
  // Stripe refund stub. Concrete wiring belongs in writing-plans phase.
  const payment_intent_id = action_payload?.action?.payment_intent_id
  return {
    ok: true,
    summary: `spend_execute reverse stub: would refund payment_intent ${payment_intent_id || '(unknown)'} reason="${reason || ''}"`,
    reversal_payload: { payment_intent_id, reason, stub: true },
  }
}

async function doctrineWrite(action_payload, reason) {
  // git revert stub. Concrete wiring needs the commit SHA captured at send time.
  const commit_sha = action_payload?.commit_sha
  return {
    ok: true,
    summary: `doctrine_write reverse stub: would git revert ${commit_sha || '(unknown)'} reason="${reason || ''}"`,
    reversal_payload: { commit_sha, reason, stub: true },
  }
}

async function observerAck(_action_payload, _reason) {
  return {
    ok: true,
    summary: 'observer_ack: no-op reverse (acks are advisory, nothing to undo)',
    reversal_payload: { noop: true },
  }
}

const HANDLERS = {
  email_send: emailSend,
  free_text: freeText,
  release_ship: releaseShip,
  spend_execute: spendExecute,
  doctrine_write: doctrineWrite,
  observer_ack: observerAck,
}

async function reverse(item_type, action_payload, reason) {
  const fn = HANDLERS[item_type]
  if (!fn) throw new NotReversibleError(item_type, 'no handler')
  return fn(action_payload, reason)
}

module.exports = { reverse, HANDLERS, NotReversibleError }
