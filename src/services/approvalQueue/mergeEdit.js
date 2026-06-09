'use strict'

/**
 * mergeEdit.js
 *
 * Per-item-type "apply Tate's edit to the action object" logic.
 * Called by approvalQueueResolutionService.resolve when verdict='edit'.
 *
 * edit_payload shape varies by item_type:
 *   email_send:    { body?, subject?, recipient? }    -- structured patch
 *   release_ship:  { release_notes?, version? }       -- structured patch
 *   spend_execute: { amount_aud? }                    -- structured patch
 *   doctrine_write:{ body? }                          -- structured patch
 *   observer_ack:  edits not supported (throws)
 *   free_text:     { next_action? }                   -- structured patch
 */

class EditNotSupportedError extends Error {
  constructor(item_type) {
    super(`edit not supported for item_type ${item_type}`)
    this.name = 'EditNotSupportedError'
  }
}

class InvalidEditError extends Error {
  constructor(item_type, reason) {
    super(`invalid edit for ${item_type}: ${reason}`)
    this.name = 'InvalidEditError'
  }
}

function mergeEditIntoAction(action, edit, item_type) {
  if (!edit || typeof edit !== 'object') {
    throw new InvalidEditError(item_type, 'edit must be an object')
  }
  const merged = { ...action }
  switch (item_type) {
    case 'email_send': {
      if ('body' in edit) {
        if (typeof edit.body !== 'string' || edit.body.length === 0) {
          throw new InvalidEditError(item_type, 'body must be non-empty string')
        }
        merged.body = edit.body
      }
      if ('subject' in edit && typeof edit.subject === 'string') {
        merged.subject = edit.subject
      }
      if ('recipient' in edit && typeof edit.recipient === 'string') {
        merged.recipient = edit.recipient
      }
      return merged
    }
    case 'release_ship': {
      if ('release_notes' in edit) merged.release_notes = String(edit.release_notes || '')
      if ('version' in edit) merged.version = String(edit.version || '')
      return merged
    }
    case 'spend_execute': {
      if ('amount_aud' in edit) {
        const n = Number(edit.amount_aud)
        if (!Number.isFinite(n) || n <= 0) {
          throw new InvalidEditError(item_type, 'amount_aud must be positive number')
        }
        merged.amount_aud = n
      }
      return merged
    }
    case 'doctrine_write': {
      if ('body' in edit) {
        if (typeof edit.body !== 'string' || edit.body.length === 0) {
          throw new InvalidEditError(item_type, 'body must be non-empty string')
        }
        merged.body = edit.body
      }
      return merged
    }
    case 'observer_ack': {
      throw new EditNotSupportedError(item_type)
    }
    case 'free_text': {
      if ('next_action' in edit) merged.next_action = String(edit.next_action || '')
      return merged
    }
    default:
      throw new EditNotSupportedError(item_type)
  }
}

module.exports = {
  mergeEditIntoAction,
  EditNotSupportedError,
  InvalidEditError,
}
