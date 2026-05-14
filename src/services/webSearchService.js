'use strict'

/**
 * webSearchService — Brave Search API wrapper.
 *
 * Closes the AUTONOMY_AUDIT_2026-05-13 capability gap "no web search" — the
 * system could only query Neo4j semantic memory, never the live web.
 *
 * API: https://api.search.brave.com/res/v1/web/search
 * Auth: header `X-Subscription-Token: <token>` from kv_store.creds.brave_search
 * Free tier: 2k queries/month at the time of this writing.
 *
 * Cache: 24h sha256-keyed in `web_search_cache` (migration 122). Same query
 * returns the cached result, no double-billing.
 */

const crypto = require('crypto')
const db = require('../config/db')
const env = require('../config/env')
const logger = require('../config/logger')

const KV_KEY = 'creds.brave_search'
const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

let _tokenCache = { value: null, expiresAt: 0 }

async function _loadToken() {
  const now = Date.now()
  if (_tokenCache.expiresAt > now) return _tokenCache.value
  let value = null
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = ${KV_KEY}`
    const raw = rows?.[0]?.value
    if (typeof raw === 'string') value = raw
    else if (raw && typeof raw === 'object') value = raw.token || raw.api_key || raw.value || null
  } catch (err) {
    logger.warn('webSearch: kv_store token read failed', { error: err.message })
  }
  // Allow env override for quick rotation / local dev.
  if (!value && env.BRAVE_SEARCH_API_KEY) value = env.BRAVE_SEARCH_API_KEY
  _tokenCache = { value, expiresAt: now + 5 * 60 * 1000 }
  return value
}

function _hashQuery(query, opts) {
  const norm = JSON.stringify({
    q: String(query || '').toLowerCase().trim(),
    count: opts.count || 10,
    country: opts.country || 'AU',
    safesearch: opts.safesearch || 'moderate',
  })
  return crypto.createHash('sha256').update(norm).digest('hex')
}

async function _getCached(qHash) {
  try {
    const rows = await db`
      SELECT result, fetched_at FROM web_search_cache
      WHERE query_hash = ${qHash} AND fetched_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `
    if (rows.length) return rows[0].result
  } catch (err) {
    logger.debug('webSearch: cache lookup failed (non-fatal)', { error: err.message })
  }
  return null
}

async function _setCached(qHash, query, result) {
  try {
    await db`
      INSERT INTO web_search_cache (query_hash, query, result, fetched_at)
      VALUES (${qHash}, ${query.slice(0, 500)}, ${JSON.stringify(result)}::jsonb, NOW())
      ON CONFLICT (query_hash) DO UPDATE
        SET result = EXCLUDED.result, fetched_at = EXCLUDED.fetched_at
    `
  } catch (err) {
    logger.debug('webSearch: cache write failed (non-fatal)', { error: err.message })
  }
}

/**
 * Search the web. Returns { ok, source, results, cached?, error? } where
 * `results` is a normalised array of { title, url, snippet, age?, source_url? }.
 *
 * @param {string} query
 * @param {object} [opts]
 * @param {number} [opts.count=10]
 * @param {string} [opts.country='AU']
 * @param {string} [opts.safesearch='moderate']
 * @param {boolean} [opts.bypassCache=false]
 */
async function search(query, opts = {}) {
  if (!query || typeof query !== 'string') {
    return { ok: false, error: 'query required (string)' }
  }
  const count = Math.max(1, Math.min(20, parseInt(opts.count, 10) || 10))
  const country = String(opts.country || 'AU').toUpperCase()
  const safesearch = String(opts.safesearch || 'moderate')

  const qHash = _hashQuery(query, { count, country, safesearch })

  if (!opts.bypassCache) {
    const cached = await _getCached(qHash)
    if (cached) return { ok: true, source: 'cache', cached: true, ...cached }
  }

  const token = await _loadToken()
  if (!token) {
    return { ok: false, error: 'web search disabled (no brave_search token in kv_store)' }
  }

  const url = new URL(ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('country', country)
  url.searchParams.set('safesearch', safesearch)

  let raw
  try {
    const res = await fetch(url.toString(), {
      headers: { 'X-Subscription-Token': token, 'Accept': 'application/json' },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `brave HTTP ${res.status}`, detail: body.slice(0, 400) }
    }
    raw = await res.json()
  } catch (err) {
    return { ok: false, error: `brave fetch failed: ${err.message}` }
  }

  const results = (raw?.web?.results || []).slice(0, count).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || r.snippet || '',
    age: r.age || null,
    source_url: r.profile?.url || null,
  }))
  const payload = { query, count: results.length, results }
  await _setCached(qHash, query, payload)
  return { ok: true, source: 'brave', cached: false, ...payload }
}

module.exports = { search }
