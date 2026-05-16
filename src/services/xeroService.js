const axios = require('axios')
const db = require('../config/db')
const env = require('../config/env')
const logger = require('../config/logger')
const { encrypt, decrypt } = require('../utils/encryption')
const { createNotification } = require('../db/queries/transactions')
const kgHooks = require('./kgIngestionHooks')

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// Exponential-backoff axios.get wrapper for Xero API calls.
// Retries on transient errors (429 rate-limit, 5xx server errors).
// AUTONOMY_AUDIT_2026-05-13 finding 18.
async function _xeroGetWithBackoff(url, config = {}, { maxAttempts = 4, initialDelayMs = 500 } = {}) {
  let attempt = 0
  let delay = initialDelayMs
  while (true) {
    attempt += 1
    try {
      return await axios.get(url, config)
    } catch (err) {
      const status = err.response?.status
      const retriable = status === 429 || (status >= 500 && status < 600)
      if (!retriable || attempt >= maxAttempts) throw err
      // Honour Retry-After if present, otherwise use exponential backoff with jitter.
      const retryAfter = parseInt(err.response?.headers?.['retry-after'], 10)
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : delay + Math.floor(Math.random() * 250)
      logger.info('xeroService: transient error, retrying', { url: url.slice(0, 100), status, attempt, waitMs })
      await new Promise(r => setTimeout(r, waitMs))
      delay = Math.min(delay * 2, 16_000)
    }
  }
}

// Audit 2026-05-13 P0 #19: this function had two critical bugs.
//   (a) UPDATE xero_tokens SET ... had no WHERE clause. With one row it
//       worked; the moment a second row exists every row gets clobbered
//       with the same tokens.
//   (b) No concurrency lock. Xero refresh tokens are SINGLE-USE — two
//       concurrent callers (financePoller every 6h overlapping a real
//       call) both attempt the same refresh; the second hits Xero with
//       a now-invalidated refresh token and the integration goes dead.
// Fix: scope the UPDATE by id, do the read + refresh + write inside a
// single transaction with SELECT FOR UPDATE so concurrent callers
// serialize (mirrors canvaService.refreshAccessToken pattern). Also
// widen the expiry buffer from 60s → 120s to absorb VPS clock skew +
// Xero round-trip latency.
//
// Returns: decrypted access token (string). Throws on auth failure.
const REFRESH_EXPIRY_BUFFER_MS = 120_000
async function getValidAccessToken() {
  // Fast-path read outside the transaction. If the token is comfortably
  // fresh we don't pay the FOR UPDATE round-trip.
  const [row] = await db`SELECT id, access_token, expires_at FROM xero_tokens ORDER BY id LIMIT 1`
  if (!row) throw new Error('No Xero tokens found - run OAuth flow first')
  if (new Date(row.expires_at) >= new Date(Date.now() + REFRESH_EXPIRY_BUFFER_MS)) {
    return decrypt(row.access_token)
  }

  // Slow path: refresh inside a transaction with row-lock to serialize
  // concurrent refreshers.
  return db.begin(async (tx) => {
    const [locked] = await tx`
      SELECT id, access_token, refresh_token, expires_at
      FROM xero_tokens
      WHERE id = ${row.id}
      FOR UPDATE
    `
    if (!locked) throw new Error('xero_tokens row vanished mid-refresh')
    // Re-check: another caller may have refreshed while we were waiting
    // for the lock. If so, just return the new access token.
    if (new Date(locked.expires_at) >= new Date(Date.now() + REFRESH_EXPIRY_BUFFER_MS)) {
      return decrypt(locked.access_token)
    }
    const response = await axios.post(
      XERO_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decrypt(locked.refresh_token),
        client_id: env.XERO_CLIENT_ID,
        client_secret: env.XERO_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    await tx`
      UPDATE xero_tokens SET
        access_token = ${encrypt(response.data.access_token)},
        refresh_token = ${encrypt(response.data.refresh_token)},
        expires_at = ${new Date(Date.now() + response.data.expires_in * 1000)},
        updated_at = now()
      WHERE id = ${locked.id}
    `
    return response.data.access_token
  })
}

async function exchangeCode(code) {
  const response = await axios.post(
    XERO_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.XERO_REDIRECT_URI,
      client_id: env.XERO_CLIENT_ID,
      client_secret: env.XERO_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  // Upsert token row
  await db`DELETE FROM xero_tokens`
  await db`
    INSERT INTO xero_tokens (access_token, refresh_token, expires_at, tenant_id)
    VALUES (
      ${encrypt(response.data.access_token)},
      ${encrypt(response.data.refresh_token)},
      ${new Date(Date.now() + response.data.expires_in * 1000)},
      ${env.XERO_TENANT_ID}
    )
  `

  logger.info('Xero OAuth tokens stored successfully')
}

function parseXeroDate(xeroDate) {
  const match = xeroDate.match(/\/Date\((\d+)([+-]\d{4})?\)\//)
  if (!match) throw new Error(`Unrecognised Xero date format: ${xeroDate}`)
  return new Date(parseInt(match[1])).toISOString().split('T')[0]
}

async function pollTransactions() {
  const token = await getValidAccessToken()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let response
  try {
    response = await _xeroGetWithBackoff(
      `${XERO_API_BASE}/BankTransactions?where=Date>DateTime(${since.replace(/-/g, ',')})&order=Date DESC`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'xero-tenant-id': env.XERO_TENANT_ID,
          Accept: 'application/json',
        },
      }
    )
  } catch (err) {
    if (err.response?.status === 403) {
      logger.warn('Xero API returned 403 - resource may be locked. Skipping this poll cycle.')
      return
    }
    throw err
  }

  const deepseekService = require('./deepseekService')

  for (const tx of response.data.BankTransactions) {
    const [existing] = await db`SELECT id, category FROM transactions WHERE xero_id = ${tx.BankTransactionID}`

    if (!existing) {
      const txDate = parseXeroDate(tx.Date)
      const [inserted] = await db`
        INSERT INTO transactions (xero_id, bank_account_id, date, description, amount_aud, type, raw_xero_data)
        VALUES (${tx.BankTransactionID}, ${tx.BankAccount.AccountID},
                ${txDate}, ${tx.Reference || tx.Contact?.Name || 'Unknown'},
                ${tx.Total}, ${tx.Type === 'SPEND' ? 'debit' : 'credit'},
                ${JSON.stringify(tx)})
        RETURNING id
      `

      try {
        const result = await deepseekService.categorize({
          description: tx.Reference || tx.Contact?.Name || 'Unknown',
          amount: tx.Total,
          type: tx.Type === 'SPEND' ? 'debit' : 'credit',
          date: txDate,
        })

        await db`
          UPDATE transactions SET
            category = ${result.category},
            category_confidence = ${result.confidence},
            xero_category = ${result.xeroAccountCode},
            status = 'categorized',
            updated_at = now()
          WHERE id = ${inserted.id}
        `

        // Fire-and-forget KG ingestion
        kgHooks.onTransactionCategorized({
          transaction: {
            description: tx.Reference || tx.Contact?.Name || 'Unknown',
            amount_aud: tx.Total,
            type: tx.Type === 'SPEND' ? 'debit' : 'credit',
            date: txDate,
            category: result.category,
          },
          clientName: tx.Contact?.Name || null,
        }).catch(err => logger.debug('bg task error', { err: err.message }))

        // Surface low-confidence categorizations to action queue for human review
        if (result.confidence < parseFloat(env.XERO_CATEGORIZATION_CONFIDENCE_MIN || '0.7')) {
          const actionQueue = require('./actionQueueService')
          actionQueue.enqueue({
            source: 'xero',
            sourceRefId: String(inserted.id),
            actionType: 'create_task',
            title: `Review: ${tx.Reference || tx.Contact?.Name || 'Unknown'} ($${Math.abs(tx.Total)})`,
            summary: `Auto-categorized as "${result.category}" with ${(result.confidence * 100).toFixed(0)}% confidence. ${result.notes || ''}`,
            preparedData: {
              title: `Review transaction categorization: ${tx.Reference || tx.Contact?.Name}`,
              description: `Amount: $${Math.abs(tx.Total)} (${tx.Type === 'SPEND' ? 'debit' : 'credit'})\nAuto-category: ${result.category} (${(result.confidence * 100).toFixed(0)}% confidence)\nRationale: ${result.notes}`,
            },
            context: { from: tx.Contact?.Name || null, transactionId: inserted.id, amount: tx.Total, category: result.category },
            resourceKey: `xero:transaction:${inserted.id}`,
            priority: Math.abs(tx.Total) > 500 ? 'high' : 'medium',
          }).catch(err => logger.debug('bg task error', { err: err.message }))
        }
      } catch (catErr) {
        logger.warn(`Failed to categorize transaction ${inserted.id}`, { error: catErr.message })
      }
    }
  }

  logger.info('Xero poll complete')
}

async function getInvoices({ status, limit = 50 } = {}) {
  const token = await getValidAccessToken()
  const params = [`pageSize=${Math.min(limit, 200)}`, 'order=Date DESC']
  if (status) params.push(`where=Status=="${status}"`)

  const response = await _xeroGetWithBackoff(
    `${XERO_API_BASE}/Invoices?${params.join('&')}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'xero-tenant-id': env.XERO_TENANT_ID,
        Accept: 'application/json',
      },
    }
  )
  return response.data.Invoices || []
}

async function getContacts({ limit = 50 } = {}) {
  const token = await getValidAccessToken()
  const response = await _xeroGetWithBackoff(
    `${XERO_API_BASE}/Contacts?pageSize=${Math.min(limit, 200)}&order=Name ASC`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'xero-tenant-id': env.XERO_TENANT_ID,
        Accept: 'application/json',
      },
    }
  )
  return response.data.Contacts || []
}

async function categorizeTransaction(txId, { account_code, category } = {}) {
  const [transaction] = await db`
    UPDATE transactions
    SET
      xero_category = ${account_code},
      ${category ? db`category = ${category},` : db``}
      status = 'categorized',
      updated_at = now()
    WHERE id = ${txId}
    RETURNING *
  `
  return transaction || null
}

module.exports = { getValidAccessToken, exchangeCode, pollTransactions, getInvoices, getContacts, categorizeTransaction }
