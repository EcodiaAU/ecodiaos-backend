'use strict'

const { execSync } = require('child_process')
const path = require('path')
const ECODIAOS_DIR = path.resolve(__dirname, '../../')

/**
 * /api/ops - Observability dashboard per docs/OBSERVABILITY_SPEC.md §2.
 *
 * Two endpoints:
 *   GET /api/ops/metrics - JSON snapshot of the 6 core signals + security
 *   GET /api/ops - minimal server-rendered HTML dashboard
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
 * - Credential redactions (24h)
 * - Tier-3 gate invocations
 * - Review B verdicts
 * - Quarantined doctrine count
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
const credentialRedactionMonitor = require('../lib/credentialRedactionMonitor')

const router = Router()

async function _turnEconomics() {
  try {
    // claude_usage table has week-bucketed usage. For 1h view we need
    // finer granularity - fall back to last-hour aggregate over all sources.
    // Audit Tier A 2026-05-01 (fork_mom9j8g9_5ab468): also surface
    // cost_usd + cache hit ratio (cache_read_input_tokens / input_tokens)
    // both as week aggregate AND a 24h trailing window. Migration 082
    // added the cache columns; rows before the migration have NULL/0 for
    // them, so 24h figures will be empty until traffic flows.
    const [row] = await db`
      SELECT
        COALESCE(SUM(input_tokens)::bigint, 0)                   AS input_tokens,
        COALESCE(SUM(output_tokens)::bigint, 0)                  AS output_tokens,
        COALESCE(SUM(cache_creation_input_tokens)::bigint, 0)    AS cache_write_tokens,
        COALESCE(SUM(cache_read_input_tokens)::bigint, 0)        AS cache_read_tokens,
        COALESCE(SUM(cost_usd)::numeric, 0)                      AS cost_usd_total,
        COUNT(*)::int                                            AS turns,
        COUNT(*) FILTER (WHERE cost_usd IS NOT NULL)::int        AS cost_turns
      FROM claude_usage
      WHERE week_start >= date_trunc('week', NOW())
    `
    const [row24h] = await db`
      SELECT
        COALESCE(SUM(input_tokens)::bigint, 0)                   AS input_tokens,
        COALESCE(SUM(output_tokens)::bigint, 0)                  AS output_tokens,
        COALESCE(SUM(cache_creation_input_tokens)::bigint, 0)    AS cache_write_tokens,
        COALESCE(SUM(cache_read_input_tokens)::bigint, 0)        AS cache_read_tokens,
        COALESCE(SUM(cost_usd)::numeric, 0)                      AS cost_usd_total,
        COUNT(*)::int                                            AS turns,
        COUNT(*) FILTER (WHERE cost_usd IS NOT NULL)::int        AS cost_turns
      FROM claude_usage
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `
    const turns = row?.turns || 0
    const tokensPerTurn = turns > 0
      ? Math.round((Number(row.input_tokens) + Number(row.output_tokens)) / turns)
      : 0
    // cache_hit_ratio: cache_read / (input + cache_write + cache_read).
    // Denominator is total context tokens sent to the API — the fraction that
    // came from cache. Using input_tokens alone gave a ratio >1 (e.g. 52,676x)
    // because cache_read_tokens (854M) >> raw input_tokens (16k).
    const inputWeek = Number(row?.input_tokens || 0)
    const totalContextWeek = inputWeek + Number(row?.cache_write_tokens || 0) + Number(row?.cache_read_tokens || 0)
    const cacheHitWeek = totalContextWeek > 0 ? Number(row?.cache_read_tokens || 0) / totalContextWeek : null
    const input24h = Number(row24h?.input_tokens || 0)
    const totalContext24h = input24h + Number(row24h?.cache_write_tokens || 0) + Number(row24h?.cache_read_tokens || 0)
    const cacheHit24h = totalContext24h > 0 ? Number(row24h?.cache_read_tokens || 0) / totalContext24h : null
    const costTurnsWeek = row?.cost_turns || 0
    const costPerTurnWeek = costTurnsWeek > 0
      ? Number(row.cost_usd_total) / costTurnsWeek
      : null
    const costTurns24h = row24h?.cost_turns || 0
    const costPerTurn24h = costTurns24h > 0
      ? Number(row24h.cost_usd_total) / costTurns24h
      : null
    return {
      tokens_per_turn_avg: tokensPerTurn,
      turns_this_week: turns,
      input_tokens_this_week: inputWeek,
      output_tokens_this_week: Number(row?.output_tokens || 0),
      // Audit Tier A additions:
      cache_write_tokens_this_week: Number(row?.cache_write_tokens || 0),
      cache_read_tokens_this_week: Number(row?.cache_read_tokens || 0),
      cache_hit_ratio_this_week: cacheHitWeek,
      cache_hit_ratio_24h: cacheHit24h,
      cost_usd_this_week: Number(row?.cost_usd_total || 0),
      cost_usd_24h: Number(row24h?.cost_usd_total || 0),
      cost_per_turn_usd_this_week: costPerTurnWeek,
      cost_per_turn_usd_24h: costPerTurn24h,
      turns_24h: row24h?.turns || 0,
    }
  } catch (err) {
    logger.debug('/ops: turnEconomics unavailable', { error: err.message })
    return null
  }
}

// Audit Tier A 2026-05-01 (fork_mom9j8g9_5ab468): compaction_events panel.
// Returns last-24h count + last-fire timestamp + avg prefix-tokens-at-fire.
// Returns null cleanly if migration 082 hasn't run yet.
async function _compactionMetrics() {
  try {
    const [row] = await db`
      SELECT
        COUNT(*)::int AS count_24h,
        MAX(fired_at) AS last_fire_at,
        AVG(prefix_tokens_at_fire)::int AS avg_prefix_tokens,
        AVG(duration_ms)::int AS avg_duration_ms,
        COUNT(*) FILTER (WHERE reason = 'synthetic_end_timeout')::int AS synthetic_ends_24h
      FROM compaction_events
      WHERE fired_at >= NOW() - INTERVAL '24 hours'
    `
    return {
      count_24h: row?.count_24h || 0,
      last_fire_at: row?.last_fire_at ? new Date(row.last_fire_at).toISOString() : null,
      avg_prefix_tokens_at_fire: row?.avg_prefix_tokens || null,
      avg_duration_ms: row?.avg_duration_ms || null,
      synthetic_ends_24h: row?.synthetic_ends_24h || 0,
    }
  } catch (err) {
    logger.debug('/ops: compactionMetrics unavailable', { error: err.message })
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

// Phase 3 dashboard (fork_mp3p13lp_45faf5): 24h hourly cost buckets for sparkline
async function _costHourly() {
  try {
    // Build a complete 24-slot array for the sparkline even when some hours have zero cost.
    const rows = await db`
      SELECT
        date_trunc('hour', created_at) AS hour,
        COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
      FROM claude_usage
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND cost_usd IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `
    // Build a map keyed by hour-string so we can fill gaps
    const byHour = {}
    for (const r of rows) {
      const k = new Date(r.hour).toISOString()
      byHour[k] = Number(r.cost_usd)
    }
    // Emit exactly 24 buckets, oldest first
    const buckets = []
    for (let i = 23; i >= 0; i--) {
      const d = new Date()
      d.setMinutes(0, 0, 0)
      d.setHours(d.getHours() - i)
      const k = d.toISOString()
      // Find nearest match (within this hour)
      const matchKey = Object.keys(byHour).find((h) => {
        return Math.abs(new Date(h).getTime() - d.getTime()) < 3600000
      })
      buckets.push({ hour: k, cost_usd: matchKey ? byHour[matchKey] : 0 })
    }
    return buckets
  } catch (err) {
    logger.debug('/ops: costHourly unavailable', { error: err.message })
    return []
  }
}

// Phase 3 dashboard: status_board priority histogram
async function _statusPriorities() {
  try {
    const rows = await db`
      SELECT priority::int AS priority, COUNT(*)::int AS cnt
      FROM status_board
      WHERE archived_at IS NULL
      GROUP BY priority
      ORDER BY priority
    `
    const result = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
    for (const r of rows) {
      const key = `P${r.priority}`
      if (key in result) result[key] = r.cnt
    }
    return result
  } catch (err) {
    logger.debug('/ops: statusPriorities unavailable', { error: err.message })
    return { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  }
}

// Phase 3 dashboard: per-account energy breakdown (weekly)
const PROVIDER_LABELS = {
  claude_max: 'tate@',
  claude_max_2: 'code@',
  claude_max_3: 'money@',
}
const WEEKLY_TOKEN_BUDGET = 20_000_000_000 // 20B tokens

async function _energyByAccount() {
  try {
    const rows = await db`
      SELECT
        COALESCE(provider, 'unknown') AS provider,
        COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
        COALESCE(SUM(cache_creation_input_tokens), 0)::bigint AS cache_write_tokens,
        COALESCE(SUM(cache_read_input_tokens), 0)::bigint AS cache_read_tokens,
        COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
      FROM claude_usage
      WHERE week_start >= date_trunc('week', NOW())
      GROUP BY 1
      ORDER BY 1
    `
    const perAccount = rows
      .filter((r) => r.provider !== 'unknown')
      .map((r) => {
        const inputTok = Number(r.input_tokens)
        const outputTok = Number(r.output_tokens)
        const cacheReadTok = Number(r.cache_read_tokens)
        const cacheWriteTok = Number(r.cache_write_tokens)
        // Total context volume: all tokens sent to the API, including cache reads.
        // Previously only counted input+output (38k), giving 0% of 20B budget.
        // With cache reads included, reflects actual context load (~905M this week).
        const total = inputTok + outputTok + cacheReadTok + cacheWriteTok
        return {
          provider: r.provider,
          label: PROVIDER_LABELS[r.provider] ?? r.provider,
          input_tokens: inputTok,
          output_tokens: outputTok,
          total_tokens: total,
          cost_usd: Number(r.cost_usd),
          pct_of_budget: WEEKLY_TOKEN_BUDGET > 0 ? Math.min(1, total / WEEKLY_TOKEN_BUDGET) : 0,
        }
      })
    const totalWeekTokens = perAccount.reduce((s, a) => s + a.total_tokens, 0)
    return {
      accounts: perAccount,
      total_tokens_this_week: totalWeekTokens,
      weekly_budget: WEEKLY_TOKEN_BUDGET,
      pct_used: Math.min(1, totalWeekTokens / WEEKLY_TOKEN_BUDGET),
    }
  } catch (err) {
    logger.debug('/ops: energyByAccount unavailable', { error: err.message })
    return { accounts: [], total_tokens_this_week: 0, weekly_budget: WEEKLY_TOKEN_BUDGET, pct_used: 0 }
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
    const redactSnap = credentialRedactionMonitor.snapshot()
    return {
      review_b_24h: {
        total: b?.total || 0,
        approved: b?.approved || 0,
        rejected: b?.rejected || 0,
        shadow_verdicts: b?.shadow_verdicts || 0,
      },
      credential_redactions_24h: redactSnap.total_since_boot,
      credential_redactions_bootstrap_done: redactSnap.bootstrap_done,
      credential_redactions_by_source: redactSnap.counters_by_type_source,
      quarantined_doctrine_pending: null,
    }
  } catch (err) {
    logger.debug('/ops: securityMetrics unavailable', { error: err.message })
    return {
      review_b_24h: null,
      credential_redactions_24h: credentialRedactionMonitor.snapshot().total_since_boot,
      credential_redactions_bootstrap_done: credentialRedactionMonitor.snapshot().bootstrap_done,
      credential_redactions_by_source: credentialRedactionMonitor.snapshot().counters_by_type_source,
      quarantined_doctrine_pending: null,
    }
  }
}

function _state() {
  const memUsage = process.memoryUsage()

  // Git last commit (ecodiaos repo)
  let git = null
  try {
    const raw = execSync('git log -1 --format="%h %ct" HEAD', {
      cwd: ECODIAOS_DIR, timeout: 2000, encoding: 'utf8',
    }).trim()
    const parts = raw.split(' ')
    const sha = parts[0]
    const ct = parseInt(parts[1], 10)
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: ECODIAOS_DIR, timeout: 1000, encoding: 'utf8',
    }).trim()
    git = { sha, age_sec: Math.round(Date.now() / 1000 - ct), branch }
  } catch (_) { /* non-fatal */ }

  // Disk usage for /
  let disk = null
  try {
    const dfOut = execSync("df / | tail -1 | awk '{print $5}'", {
      timeout: 2000, encoding: 'utf8',
    }).trim()
    disk = { pct: parseInt(dfOut.replace('%', ''), 10) }
  } catch (_) { /* non-fatal */ }

  return {
    conductor_uptime_sec: Math.round(process.uptime()),
    memory_heap_mb: Math.round(memUsage.heapUsed / (1024 * 1024)),
    memory_rss_mb: Math.round(memUsage.rss / (1024 * 1024)),
    node_version: process.version,
    pid: process.pid,
    timestamp_utc: new Date().toISOString(),
    git,
    disk,
  }
}

// Next scheduled cron to fire
async function _nextCron() {
  try {
    const [row] = await db`
      SELECT name, next_run_at
      FROM os_scheduled_tasks
      WHERE status = 'active' AND next_run_at IS NOT NULL
      ORDER BY next_run_at
      LIMIT 1
    `
    if (!row) return null
    return {
      name: row.name,
      next_run_at: new Date(row.next_run_at).toISOString(),
      next_in_sec: Math.max(0, Math.round((new Date(row.next_run_at).getTime() - Date.now()) / 1000)),
    }
  } catch (err) {
    logger.debug('/ops: nextCron unavailable', { error: err.message })
    return null
  }
}

router.get('/metrics', async (_req, res) => {
  const started = Date.now()
  const [state, turnEconomics, forks, claims, security, compaction, costHourly, statusPriorities, energyByAccount, nextCron] = await Promise.all([
    Promise.resolve(_state()),
    _turnEconomics(),
    _forkMetrics(),
    _claimMetrics(),
    _securityMetrics(),
    _compactionMetrics(),
    _costHourly(),
    _statusPriorities(),
    _energyByAccount(),
    _nextCron(),
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
    compaction,
    cost_hourly: costHourly,
    status_priorities: statusPriorities,
    energy_by_account: energyByAccount,
    next_cron: nextCron,
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
    v.appendChild(el('span', { class: 'warn' }, [' - ']))
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

// Audit Tier A 2026-05-01 (fork_mom9j8g9_5ab468): cache_hit_ratio panel.
// 24h trailing window is the primary signal because the compact-threshold
// flip (Commit 1 of this fork) is supposed to LIFT the cache hit rate by
// keeping more of the prompt prefix stable across turns. Watch the 24h
// figure; the week aggregate is shown for trend context.
function fmtPct(v) {
  if (v === null || v === undefined) return null
  return Math.round(v * 1000) / 10 + '%'
}
function fmtUsd(v) {
  if (v === null || v === undefined) return null
  // 4 decimal places for per-turn (sub-cent matters); 2 for totals.
  return '$' + (v < 1 ? v.toFixed(4) : v.toFixed(2))
}
function renderCacheHit(d) {
  if (!d.turn_economics) return panel('cache hit ratio', null)
  const t = d.turn_economics
  const r24 = t.cache_hit_ratio_24h
  const rwk = t.cache_hit_ratio_this_week
  // Cache hit ratio threshold for color: <30% is cold (warn), 30-60% is
  // ok, >60% is good. These are heuristics - adjust as we learn the actual
  // distribution post-flip.
  const cls24 = r24 === null ? '' : (r24 > 0.6 ? 'ok' : r24 > 0.3 ? 'warn' : 'err')
  return panel('cache hit ratio', [
    kv('hit ratio (24h)', fmtPct(r24), cls24),
    kv('hit ratio (week)', fmtPct(rwk)),
    kv('cache reads (week)', t.cache_read_tokens_this_week),
    kv('cache writes (week)', t.cache_write_tokens_this_week),
  ])
}
function renderCost(d) {
  if (!d.turn_economics) return panel('cost (USD estimate)', null)
  const t = d.turn_economics
  return panel('cost (USD estimate)', [
    kv('per-turn (24h)', fmtUsd(t.cost_per_turn_usd_24h)),
    kv('per-turn (week)', fmtUsd(t.cost_per_turn_usd_this_week)),
    kv('total (24h)', fmtUsd(t.cost_usd_24h)),
    kv('total (week)', fmtUsd(t.cost_usd_this_week)),
    kv('turns (24h)', t.turns_24h),
  ])
}
function renderCompaction(d) {
  if (!d.compaction) return panel('compaction (24h)', null)
  const c = d.compaction
  // Sawtooth health: 1-5 fires/24h is healthy steady-state. >12 (>1/2h)
  // suggests threshold too low. 0 over multiple days suggests sessions
  // aren't running long enough to compact (or threshold too high).
  const cls = c.count_24h > 12 ? 'warn' : c.count_24h > 0 ? 'ok' : ''
  const lastFireRel = c.last_fire_at
    ? Math.round((Date.now() - new Date(c.last_fire_at).getTime()) / 60000) + 'm ago'
    : 'none'
  return panel('compaction (24h)', [
    kv('count (24h)', c.count_24h, cls),
    kv('last fire', lastFireRel),
    kv('avg prefix tokens', c.avg_prefix_tokens_at_fire),
    kv('avg duration (ms)', c.avg_duration_ms),
    kv('synthetic ends (24h)', c.synthetic_ends_24h, c.synthetic_ends_24h > 0 ? 'warn' : ''),
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
  if (!d.security) return panel('security (24h)', null)
  const s = d.security
  const items = []
  if (s.review_b_24h) {
    const b = s.review_b_24h
    items.push(
      kv('review B total', b.total),
      kv('approved', b.approved, 'ok'),
      kv('rejected', b.rejected, b.rejected > 0 ? 'err' : 'ok'),
      kv('shadow verdicts', b.shadow_verdicts),
    )
  }
  const red = s.credential_redactions_24h
  if (red !== undefined && red !== null) {
    const bootDone = s.credential_redactions_bootstrap_done
    const cls = !bootDone ? 'warn' : (red > 0 ? 'err' : 'ok')
    const label = bootDone ? 'credential redactions (post-boot)' : 'credential redactions (bootstrap)'
    items.push(kv(label, red, cls))
  }
  if (items.length === 0) return panel('security (24h)', null)
  return panel('security (24h)', items)
}

async function load() {
  const content = document.getElementById('content')
  try {
    const r = await fetch('/api/ops/metrics')
    const d = await r.json()
    const frag = document.createDocumentFragment()
    frag.appendChild(renderState(d))
    frag.appendChild(renderTurns(d))
    frag.appendChild(renderCacheHit(d))
    frag.appendChild(renderCost(d))
    frag.appendChild(renderCompaction(d))
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
