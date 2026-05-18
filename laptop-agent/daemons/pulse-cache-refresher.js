#!/usr/bin/env node
'use strict'

/**
 * pulse-cache-refresher.js
 *
 * Long-running Node daemon. Every 30 seconds, refreshes the local pulse
 * blocks cache at C:/Users/tjdTa/.claude/hooks/ecodia/state/pulse_blocks_cache.txt
 * so the Corazon conductor's UserPromptSubmit hook can read continuity
 * blocks without a live MCP round-trip on every turn.
 *
 * Sources (both via the ecodia-full HTTP MCP at
 * https://api.admin.ecodia.au/api/mcp/ecodia-full):
 *   - kv_store key cowork.ceo.finance_now  -> <finance_pulse>
 *   - clients table (top 5 by recent contact) -> <client_pulse>
 *
 * Format mirrors scripts/render-pulse-cli.js. If the MCP is unreachable
 * or a tool call fails, the cache is overwritten with a "stale" marker
 * block stamped with the last successful refresh; the loop continues.
 *
 * Atomic write: .tmp -> rename, so partial reads never occur.
 *
 * PM2:
 *   pm2 start backend/laptop-agent/daemons/pulse-cache-refresher.js \
 *     --name pulse-cache-refresher
 *
 * Idempotency: re-starting the daemon does not duplicate work; each tick
 * is a complete overwrite of the cache file.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')

const MCP_URL = process.env.ECODIA_FULL_MCP_URL
  || 'https://api.admin.ecodia.au/api/mcp/ecodia-full'
const BEARER = process.env.ECODIA_FULL_BEARER || ''
const CACHE_PATH = process.env.PULSE_CACHE_PATH
  || 'C:/Users/tjdTa/.claude/hooks/ecodia/state/pulse_blocks_cache.txt'
const TICK_MS = parseInt(process.env.PULSE_REFRESH_TICK_MS, 10) || 30_000
const HTTP_TIMEOUT_MS = parseInt(process.env.PULSE_HTTP_TIMEOUT_MS, 10) || 8_000
const COMBINED_CAP = 3000
const FINANCE_BLOCK_CAP = 1500
const CLIENT_BLOCK_CAP = 1500

let _lastGoodAt = null
let _rpcId = 1
let _shuttingDown = false

// ── HTTP / JSON-RPC ──────────────────────────────────────────────────────────

function _httpJsonRpc(method, params) {
  return new Promise((resolve, reject) => {
    let urlObj
    try {
      urlObj = new URL(MCP_URL)
    } catch (err) {
      reject(new Error('invalid ECODIA_FULL_MCP_URL: ' + err.message))
      return
    }
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: _rpcId++,
      method,
      params: params || {},
    })
    const opts = {
      method: 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
        ...(BEARER ? { 'Authorization': 'Bearer ' + BEARER } : {}),
      },
      timeout: HTTP_TIMEOUT_MS,
    }
    const transport = urlObj.protocol === 'https:' ? https : http
    const req = transport.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('http ' + res.statusCode + ': ' + raw.slice(0, 200)))
          return
        }
        try {
          const parsed = JSON.parse(raw)
          if (parsed.error) {
            reject(new Error('rpc error: ' + JSON.stringify(parsed.error)))
            return
          }
          resolve(parsed.result)
        } catch (err) {
          reject(new Error('json parse failed: ' + err.message))
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('http timeout after ' + HTTP_TIMEOUT_MS + 'ms'))
    })
    req.on('error', (err) => reject(err))
    req.write(body)
    req.end()
  })
}

// MCP tools/call envelope. Returns the unwrapped content (parsed if JSON).
async function _callTool(name, args) {
  const result = await _httpJsonRpc('tools/call', { name, arguments: args || {} })
  // Standard MCP shape: { content: [{ type: 'text', text: '...' }] }
  // Some servers return the value directly; handle both.
  if (result && Array.isArray(result.content)) {
    const text = result.content
      .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('')
    if (!text) return result
    try {
      return JSON.parse(text)
    } catch (_) {
      return text
    }
  }
  return result
}

// ── Data fetchers ────────────────────────────────────────────────────────────

async function _fetchFinanceNow() {
  try {
    const out = await _callTool('kv_store.get', { key: 'cowork.ceo.finance_now' })
    // Expected shape: { value: <obj or string> } or directly the object.
    let val = null
    if (out && typeof out === 'object') {
      if ('value' in out) val = out.value
      else if ('cowork.ceo.finance_now' in out) val = out['cowork.ceo.finance_now']
      else val = out
    } else if (typeof out === 'string') {
      val = out
    }
    if (typeof val === 'string') {
      try { val = JSON.parse(val) } catch (_) { /* leave as string */ }
    }
    if (!val || typeof val !== 'object') return null
    return val
  } catch (err) {
    console.warn('[pulse-refresher] kv_store.get finance_now failed:', err.message)
    return null
  }
}

async function _fetchRecentClients() {
  // Top 5 clients ordered by last_contact_at desc, NULLs last.
  // Schema cribbed from clientPulseService + matchers/clientMention.
  const sql = `
    SELECT name, slug, status, last_contact_at, health_score
    FROM clients
    WHERE archived_at IS NULL
    ORDER BY last_contact_at DESC NULLS LAST
    LIMIT 5
  `
  try {
    const out = await _callTool('db_query', { sql })
    if (!out) return []
    if (Array.isArray(out)) return out
    if (Array.isArray(out.rows)) return out.rows
    if (Array.isArray(out.result)) return out.result
    if (out.data && Array.isArray(out.data.rows)) return out.data.rows
    return []
  } catch (err) {
    console.warn('[pulse-refresher] db_query clients failed:', err.message)
    return []
  }
}

// ── Rendering (mirrors render-pulse-cli format) ──────────────────────────────

function _formatDollars(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '$0.00'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n) / 100
  return sign + '$' + abs.toFixed(2)
}

function _formatAge(iso) {
  if (!iso) return 'never'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'unknown'
  const ageMs = Date.now() - ts
  if (ageMs < 0) return 'just now'
  const mins = Math.round(ageMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.round(hrs / 24)
  return days + 'd ago'
}

function _daysSince(iso) {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return null
  const ms = Date.now() - ts
  if (ms < 0) return 0
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function _renderFinanceBlock(shape) {
  if (!shape) {
    return [
      '<finance_pulse>',
      '  status: stale (mcp_unavailable)',
      '  last_good: ' + (_lastGoodAt ? _formatAge(_lastGoodAt) : 'never'),
      '</finance_pulse>',
    ].join('\n')
  }
  const runway = shape.runway_days === null || shape.runway_days === undefined
    ? 'n/a' : String(shape.runway_days)
  const lines = [
    '<finance_pulse>',
    '  cash_business: ' + _formatDollars(shape.cash_business),
    '  director_loan: ' + _formatDollars(shape.director_loan_balance),
    '  gst_accrued: ' + _formatDollars(shape.gst_owed_accrued),
    '  income_tax_accrued: ' + _formatDollars(shape.income_tax_provisional_accrued),
    '  next_30d_inflows: ' + _formatDollars(shape.next_30d_inflows),
    '  runway_days: ' + runway,
    '  updated: ' + _formatAge(shape.last_updated),
    '</finance_pulse>',
  ]
  const block = lines.join('\n')
  if (Buffer.byteLength(block, 'utf8') <= FINANCE_BLOCK_CAP) return block
  return [
    '<finance_pulse>',
    '  cash_business: ' + _formatDollars(shape.cash_business),
    '  updated: ' + _formatAge(shape.last_updated),
    '</finance_pulse>',
  ].join('\n')
}

function _renderClientBlock(clients) {
  if (!clients || !clients.length) {
    return [
      '<client_pulse>',
      '  status: stale (mcp_unavailable_or_empty)',
      '  last_good: ' + (_lastGoodAt ? _formatAge(_lastGoodAt) : 'never'),
      '</client_pulse>',
    ].join('\n')
  }
  const lines = ['<client_pulse>']
  for (const c of clients) {
    const name = c.name || c.slug || 'unknown'
    const status = c.status || 'unknown'
    const days = _daysSince(c.last_contact_at)
    const daysStr = days === null ? 'never recorded' : days + 'd silent'
    lines.push('  ' + name + ': ' + daysStr + ' (' + status + ')')
  }
  lines.push('</client_pulse>')
  const block = lines.join('\n')
  if (Buffer.byteLength(block, 'utf8') <= CLIENT_BLOCK_CAP) return block
  // Truncate row-wise from the end until under cap.
  while (lines.length > 2 && Buffer.byteLength(lines.join('\n'), 'utf8') > CLIENT_BLOCK_CAP) {
    lines.splice(lines.length - 2, 1)
  }
  return lines.join('\n')
}

// ── Atomic write ─────────────────────────────────────────────────────────────

function _atomicWrite(targetPath, content) {
  const dir = path.dirname(targetPath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (_) { /* exists or unwritable; let rename surface it */ }
  const tmp = targetPath + '.tmp'
  fs.writeFileSync(tmp, content, { encoding: 'utf8' })
  fs.renameSync(tmp, targetPath)
}

// ── Tick ─────────────────────────────────────────────────────────────────────

async function _tick() {
  const startedAt = new Date().toISOString()
  if (!BEARER) {
    const stale = [
      _renderFinanceBlock(null),
      _renderClientBlock([]),
      '<!-- pulse-refresher: ECODIA_FULL_BEARER missing; cache stale at '
        + startedAt + ' -->',
    ].join('\n')
    try {
      _atomicWrite(CACHE_PATH, stale.slice(0, COMBINED_CAP))
      console.warn('[pulse-refresher] tick (skipped, no bearer) at', startedAt)
    } catch (err) {
      console.error('[pulse-refresher] cache write failed:', err.message)
    }
    return
  }

  const [finance, clients] = await Promise.all([
    _fetchFinanceNow(),
    _fetchRecentClients(),
  ])

  const financeBlock = _renderFinanceBlock(finance)
  const clientBlock = _renderClientBlock(clients)

  if (finance || (clients && clients.length)) {
    _lastGoodAt = startedAt
  }

  let combined = [financeBlock, clientBlock].join('\n')
  if (Buffer.byteLength(combined, 'utf8') > COMBINED_CAP) {
    combined = combined.slice(0, COMBINED_CAP)
  }

  try {
    _atomicWrite(CACHE_PATH, combined)
    console.log('[pulse-refresher] tick OK at', startedAt,
      'finance=' + (finance ? 'live' : 'stale'),
      'clients=' + (clients ? clients.length : 0))
  } catch (err) {
    console.error('[pulse-refresher] cache write failed:', err.message)
  }
}

// ── Loop ─────────────────────────────────────────────────────────────────────

async function _loop() {
  if (_shuttingDown) return
  try {
    await _tick()
  } catch (err) {
    // Last-resort guard; _tick already catches per-fetch.
    console.error('[pulse-refresher] tick threw:', err.message)
  }
  if (_shuttingDown) return
  setTimeout(_loop, TICK_MS)
}

function _shutdown(signal) {
  if (_shuttingDown) return
  _shuttingDown = true
  console.log('[pulse-refresher] shutting down on', signal)
  // Best-effort flush; nothing pending past the rename.
  setTimeout(() => process.exit(0), 100)
}

process.on('SIGINT', () => _shutdown('SIGINT'))
process.on('SIGTERM', () => _shutdown('SIGTERM'))
process.on('uncaughtException', (err) => {
  console.error('[pulse-refresher] uncaughtException:', err && err.stack || err)
})
process.on('unhandledRejection', (err) => {
  console.error('[pulse-refresher] unhandledRejection:', err && err.stack || err)
})

if (require.main === module) {
  console.log('[pulse-refresher] starting; mcp=' + MCP_URL
    + ' tick=' + TICK_MS + 'ms cache=' + CACHE_PATH
    + ' bearer=' + (BEARER ? 'set' : 'MISSING'))
  _loop()
}

module.exports = {
  _tick,
  _renderFinanceBlock,
  _renderClientBlock,
  _atomicWrite,
}
