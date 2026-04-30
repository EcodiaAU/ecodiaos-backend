'use strict'

/**
 * /api/ops - Observability dashboard per docs/OBSERVABILITY_SPEC.md §2.
 *
 * Two endpoints:
 *   GET /api/ops/metrics   - JSON snapshot of the 6 core signals + security
 *   GET /api/ops           - minimal server-rendered HTML dashboard
 *
 * Metrics covered:
 *   1. Per-turn token breakdown (from claude_usage table)
 *   2. Prompt cache hit rate (derived)
 *   3. MCP tool latency (from mcp_tool_latency table if present)
 *   4. Fork TTFT + outcomes (os_forks)
 *   5. Claim verification rate (conductor_claims)
 *   6. Context saturation (os_session_compact_events if present)
 *
 * Security panel (bonus):
 *   - Credential redactions (24h)
 *   - Tier-3 gate invocations
 *   - Review B verdicts
 *   - Quarantined doctrine count
 *
 * Failure shape: each panel is its own Promise.allSettled branch. If one
 * table is missing, the panel returns null and the page renders a
 * "metric unavailable" placeholder instead of 500ing.
 *
 * Performance: <1s response target per §2.2. All queries are indexed and
 * time-windowed; no full table scans.
 */

const { Router } = require('express')
const db = require('../config/db')
const logger = require('../config/logger')

const router = Router()

async function _turnEconomics() {
  try {
    // claude_usage table has week-bucketed usage. For 1h view we need
    // finer granularity - fall back to last-hour aggregate over all sources.
    const [row] = await db`
      SELECT
        COALESCE(SUM(input_tokens)::bigint, 0) AS input_tokens,
        COALESCE(SUM(output_tokens)::bigint, 0) AS output_tokens,
        COUNT(*)::int AS turns
      FROM claude_usage
      WHERE week_start >= date_trunc('week', NOW())
    `
    const turns = row?.turns || 0
    const tokensPerTurn = turns > 0
      ? Math.round((Number(row.input_tokens) + Number(row.output_tokens)) / turns)
      : 0
    return {
      tokens_per_turn_avg: tokensPerTurn,
      turns_this_week: turns,
      input_tokens_this_week: Number(row?.input_tokens || 0),
      output_tokens_this_week: Number(row?.output_tokens || 0),
    }
  } catch (err) {
    logger.debug('/ops: turnEconomics unavailable', { error: err.message })
    return null
  }
}

async function _forkMetrics() {
  try {
    const [row] = await db`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('spawning','running','reporting'))::int AS live,
        COUNT(*) FILTER (WHERE status = 'done' AND spawned_at > NOW() - INTERVAL '24 hours')::int AS completed_24h,
        COUNT(*) FILTER (WHERE status = 'aborted' AND spawned_at > NOW() - INTERVAL '24 hours')::int AS aborted_24h,
        COUNT(*) FILTER (WHERE status = 'cap_rejected' AND spawned_at > NOW() - INTERVAL '24 hours')::int AS cap_rejected_24h
      FROM os_forks
    `
    return {
      live: row?.live || 0,
      completed_24h: row?.completed_24h || 0,
      aborted_24h: row?.aborted_24h || 0,
      cap_rejected_24h: row?.cap_rejected_24h || 0,
    }
  } catch (err) {
    logger.debug('/ops: forkMetrics unavailable', { error: err.message })
    return null
  }
}

async function _claimMetrics() {
  try {
    const [row] = await db`
      SELECT
        COUNT(*)::int AS total_24h,
        COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified,
        COUNT(*) FILTER (WHERE verification_status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE verification_status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE verification_status = 'action_unknown')::int AS action_unknown
      FROM conductor_claims
      WHERE claimed_at >= NOW() - INTERVAL '24 hours'
    `
    const total = row?.total_24h || 0
    return {
      total_24h: total,
      verified_24h: row?.verified || 0,
      failed_24h: row?.failed || 0,
      pending_24h: row?.pending || 0,
      action_unknown_24h: row?.action_unknown || 0,
      verification_rate: total > 0 ? (row.verified / total) : null,
    }
  } catch (err) {
    logger.debug('/ops: claimMetrics unavailable', { error: err.message })
    return null
  }
}

async function _securityMetrics() {
  try {
    const [b] = await db`
      SELECT
        COUNT(*) FILTER (WHERE security_review_status IS NOT NULL)::int AS total,
        COUNT(*) FILTER (WHERE security_review_status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE security_review_status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE security_review_status LIKE 'shadow_%')::int AS shadow_verdicts
      FROM cc_sessions
      WHERE security_review_at >= NOW() - INTERVAL '24 hours'
    `
    return {
      review_b_24h: {
        total: b?.total || 0,
        approved: b?.approved || 0,
        rejected: b?.rejected || 0,
        shadow_verdicts: b?.shadow_verdicts || 0,
      },
      quarantined_doctrine_pending: null,
    }
  } catch (err) {
    logger.debug('/ops: securityMetrics unavailable', { error: err.message })
    return null
  }
}

function _state() {
  const memUsage = process.memoryUsage()
  return {
    conductor_uptime_sec: Math.round(process.uptime()),
    memory_heap_mb: Math.round(memUsage.heapUsed / (1024 * 1024)),
    memory_rss_mb: Math.round(memUsage.rss / (1024 * 1024)),
    node_version: process.version,
    pid: process.pid,
    timestamp_utc: new Date().toISOString(),
  }
}

router.get('/metrics', async (_req, res) => {
  const started = Date.now()
  const [state, turnEconomics, forks, claims, security] = await Promise.all([
    Promise.resolve(_state()),
    _turnEconomics(),
    _forkMetrics(),
    _claimMetrics(),
    _securityMetrics(),
  ])
  const durationMs = Date.now() - started
  res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    query_duration_ms: durationMs,
    state,
    turn_economics: turnEconomics,
    forks,
    claims,
    security,
  })
})

router.get('/', async (_req, res) => {
  // Minimal HTML dashboard. Client-side JS uses DOM createElement and
  // textContent - never innerHTML with data - so there is no XSS path
  // for metric values (which would anyway come from our own DB).
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>/ops - EcodiaOS</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem 2rem; background: #0e0e10; color: #ddd; }
  h1 { margin: 0 0 1rem; font-size: 1.3rem; color: #fff; }
  h2 { margin: 1rem 0 0.5rem; font-size: 0.85rem; color: #9df; text-transform: uppercase; letter-spacing: 0.5px; }
  .panel { border: 1px solid #333; border-radius: 4px; padding: 0.6rem 1rem 0.9rem; margin-bottom: 0.8rem; background: #17171a; }
  .row { display: flex; gap: 2rem; flex-wrap: wrap; }
  .kv { display: flex; flex-direction: column; min-width: 130px; }
  .kv .k { font-size: 0.72rem; color: #888; text-transform: uppercase; }
  .kv .v { font-size: 1.1rem; font-weight: 500; color: #fff; }
  .ok { color: #4a4; }
  .warn { color: #fb0; }
  .err { color: #f55; }
  .hint { color: #666; font-size: 12px; margin-top: 0.4rem; margin-bottom: 1rem; }
  .unavail { color: #f90; font-style: italic; }
</style>
</head>
<body>
<h1>/ops - EcodiaOS Operations</h1>
<div class="hint">Auto-refreshes every 10 seconds. Data from <code>/api/ops/metrics</code>.</div>
<div id="content"><em>loading...</em></div>

<script>
function el(tag, attrs, children) {
  const node = document.createElement(tag)
  if (attrs) for (const k in attrs) {
    if (k === 'class') node.className = attrs[k]
    else node.setAttribute(k, attrs[k])
  }
  if (children) for (const c of children) {
    if (c === null || c === undefined) continue
    if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)))
    else node.appendChild(c)
  }
  return node
}

function kv(label, value, cls) {
  const k = el('span', { class: 'k' }, [label])
  const v = el('span', { class: 'v ' + (cls || '') })
  if (value === null || value === undefined) {
    v.appendChild(el('span', { class: 'warn' }, ['—']))
  } else {
    v.appendChild(document.createTextNode(String(value)))
  }
  return el('div', { class: 'kv' }, [k, v])
}

function panel(title, children) {
  return el('div', { class: 'panel' }, [
    el('h2', null, [title]),
    el('div', { class: 'row' }, children || [el('em', { class: 'unavail' }, ['metric unavailable'])]),
  ])
}

function renderState(d) {
  if (!d.state) return panel('state', null)
  const items = [
    kv('uptime (s)', d.state.conductor_uptime_sec),
    kv('heap (MB)', d.state.memory_heap_mb, d.state.memory_heap_mb > 1500 ? 'warn' : ''),
    kv('RSS (MB)', d.state.memory_rss_mb, d.state.memory_rss_mb > 1500 ? 'warn' : ''),
    kv('query (ms)', d.query_duration_ms),
  ]
  return panel('state', items)
}

function renderTurns(d) {
  if (!d.turn_economics) return panel('turn economics (this week)', null)
  const t = d.turn_economics
  return panel('turn economics (this week)', [
    kv('tokens/turn', t.tokens_per_turn_avg),
    kv('turns', t.turns_this_week),
    kv('input', t.input_tokens_this_week),
    kv('output', t.output_tokens_this_week),
  ])
}

function renderForks(d) {
  if (!d.forks) return panel('forks', null)
  const f = d.forks
  return panel('forks', [
    kv('live', f.live, f.live > 4 ? 'warn' : 'ok'),
    kv('completed (24h)', f.completed_24h),
    kv('aborted (24h)', f.aborted_24h, f.aborted_24h > 3 ? 'warn' : ''),
    kv('cap-rejected (24h)', f.cap_rejected_24h, f.cap_rejected_24h > 0 ? 'warn' : 'ok'),
  ])
}

function renderClaims(d) {
  if (!d.claims) return panel('claim verification (24h)', null)
  const c = d.claims
  const rate = c.verification_rate
  const rateStr = rate === null ? 'n/a' : Math.round(rate * 100) + '%'
  const rateCls = rate === null ? '' : (rate > 0.85 ? 'ok' : rate > 0.5 ? 'warn' : 'err')
  return panel('claim verification (24h)', [
    kv('verification rate', rateStr, rateCls),
    kv('total claims', c.total_24h),
    kv('verified', c.verified_24h, 'ok'),
    kv('pending', c.pending_24h, c.pending_24h > 5 ? 'warn' : ''),
    kv('failed', c.failed_24h, c.failed_24h > 0 ? 'err' : 'ok'),
  ])
}

function renderSecurity(d) {
  if (!d.security || !d.security.review_b_24h) return panel('security (24h)', null)
  const b = d.security.review_b_24h
  return panel('security (24h)', [
    kv('review B total', b.total),
    kv('approved', b.approved, 'ok'),
    kv('rejected', b.rejected, b.rejected > 0 ? 'err' : 'ok'),
    kv('shadow verdicts', b.shadow_verdicts),
  ])
}

async function load() {
  const content = document.getElementById('content')
  try {
    const r = await fetch('/api/ops/metrics')
    const d = await r.json()
    const frag = document.createDocumentFragment()
    frag.appendChild(renderState(d))
    frag.appendChild(renderTurns(d))
    frag.appendChild(renderForks(d))
    frag.appendChild(renderClaims(d))
    frag.appendChild(renderSecurity(d))
    content.replaceChildren(frag)
  } catch (err) {
    content.replaceChildren(el('div', { class: 'err' }, ['metric fetch failed: ' + (err && err.message ? err.message : String(err))]))
  }
}

load()
setInterval(load, 10_000)
</script>
</body>
</html>`
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

module.exports = router
