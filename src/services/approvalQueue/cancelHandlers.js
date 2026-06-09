'use strict'

/**
 * cancelHandlers.js
 *
 * Per-item-type "N" executors. Run when Tate declines. Each returns
 * { ok, summary, log_payload }. Cancel actions are rarely reversible
 * (declined-spend stays declined, archived-board-row stays archived).
 */

const db = require('../../config/db')
const logger = require('../../config/logger')

// ---------- email_send ----------
// Cancel = trash the draft (we never actually had a real draft in Gmail; we
// only had the proposed body). So this is a pure substrate-level decline.

async function emailSend(action) {
  return {
    ok: true,
    summary: `Email to ${action?.recipient || '(unknown)'} declined; no message sent`,
    log_payload: { action, declined: true },
  }
}

// ---------- free_text ----------
// Cancel = archive the linked status_board row with a decline outcome.

async function freeText(action) {
  const status_board_id = action.status_board_id
  if (!status_board_id) {
    return { ok: false, summary: 'free_text cancel missing status_board_id', log_payload: { action } }
  }
  try {
    const before = await db`SELECT name, archived_at FROM status_board WHERE id = ${status_board_id}`
    if (before.length === 0) {
      return { ok: false, summary: 'status_board row not found', log_payload: { action } }
    }
    if (before[0].archived_at) {
      return { ok: true, summary: 'status_board row already archived; no-op', log_payload: { action } }
    }
    await db`
      UPDATE status_board
      SET archived_at = NOW(), last_touched = NOW(),
          context = COALESCE(context, '') || E'\n[approval_queue.N declined by Tate ' || NOW()::text || ']'
      WHERE id = ${status_board_id}
    `
    return {
      ok: true,
      summary: `status_board row "${before[0].name}" archived (declined by Tate)`,
      log_payload: { action, status_board_id, archived: true },
    }
  } catch (err) {
    return { ok: false, summary: `free_text cancel threw: ${err.message}`, log_payload: { action, error: err.message } }
  }
}

// ---------- stubs ----------

async function releaseShip(action) {
  return { ok: true, summary: `Release ${action?.app_slug || ''} ship declined`, log_payload: { action, declined: true } }
}
async function spendExecute(action) {
  return { ok: true, summary: `Spend $${action?.amount_aud || ''} to ${action?.vendor || ''} declined`, log_payload: { action, declined: true } }
}
async function doctrineWrite(action) {
  return { ok: true, summary: `Doctrine proposal at ${action?.pattern_path || ''} declined; not written`, log_payload: { action, declined: true } }
}
async function observerAck(action) {
  // Cancel = dismiss the observer signal rather than ack it.
  const signal_id = action?.signal_id
  if (!signal_id) {
    return { ok: false, summary: 'observer_ack cancel missing signal_id', log_payload: { action } }
  }
  try {
    const updated = await db`
      UPDATE observer_signals SET dismissed_at = NOW()
      WHERE id = ${signal_id} AND dismissed_at IS NULL
      RETURNING id
    `
    return {
      ok: true,
      summary: `observer signal ${signal_id} dismissed (Tate said N)`,
      log_payload: { action, dismissed: updated.length > 0 },
    }
  } catch (err) {
    // observer_signals may not exist in this env; degrade
    logger.debug('observer dismiss soft-failed', { error: err.message })
    return { ok: true, summary: `observer signal ${signal_id} marked declined (substrate write soft-failed)`, log_payload: { action, error: err.message } }
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

async function execute(item_type, action) {
  const fn = HANDLERS[item_type]
  if (!fn) throw new Error(`cancelHandler unknown item_type ${item_type}`)
  return fn(action)
}

module.exports = { execute, HANDLERS }
