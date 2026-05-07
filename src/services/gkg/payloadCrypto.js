'use strict'

/**
 * GKG payload encryption helper - AES-256-GCM.
 *
 * Per spec ~/ecodiaos/docs/gkg-spec-v0.1.md §4 (privacy posture): every
 * event payload is encrypted at rest. The daemon does NOT hold the key;
 * the VPS encrypts on receipt before persisting. Anyone with DB read sees
 * only ciphertext + per-row IV/auth_tag.
 *
 * Key source: kv_store.gkg.tate_payload_key (32 random bytes, base64).
 * Cipher:     AES-256-GCM with random 12-byte IV per row.
 * Output:     { ciphertext, iv, authTag } each base64.
 *
 * Note: the same encryption helper is reused for screenshot frames stored
 * in Supabase Storage bucket `gkg-frames` (frame storage out of scope for
 * Phase 1 ingest path; daemon currently stores frames locally on Corazon
 * and Phase 2 will push them).
 *
 * Authored 7 May 2026 fork_mov3r45p_73555d for GKG Phase 1.
 */

const crypto = require('crypto')
const db = require('../../config/db')
const logger = require('../../config/logger')

const KV_KEY = 'gkg.tate_payload_key'
const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const AUTH_TAG_LEN = 16

let _cachedKey = null  // Buffer of 32 bytes

async function _loadKey() {
  if (_cachedKey) return _cachedKey
  const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
  if (!rows || !rows.length) {
    throw new Error(`gkg.payloadCrypto: ${KV_KEY} missing from kv_store`)
  }
  let v = rows[0].value
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { /* keep */ }
  }
  if (typeof v !== 'string') {
    throw new Error(`gkg.payloadCrypto: ${KV_KEY} not a string`)
  }
  const buf = Buffer.from(v, 'base64')
  if (buf.length !== 32) {
    throw new Error(`gkg.payloadCrypto: key wrong length (${buf.length}, want 32)`)
  }
  _cachedKey = buf
  return buf
}

/**
 * Encrypt a UTF-8 string (intended: JSON.stringify of an event payload).
 * @param {string} plaintext
 * @returns {Promise<{ciphertext:string, iv:string, authTag:string}>}
 */
async function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('gkg.encrypt: plaintext must be string')
  }
  const key = await _loadKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/**
 * Decrypt a previously encrypted payload. Used by Phase 2 graph-builder
 * cron and any debug tooling. NOT used in the ingest hot path.
 */
async function decrypt({ ciphertext, iv, authTag }) {
  const key = await _loadKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}

function _resetForTest() { _cachedKey = null }

module.exports = { encrypt, decrypt, _resetForTest, ALGO }
