'use strict'

/**
 * /api/approval-queue
 *
 * The HTTP surface read by:
 *   - iOS native conductor app ("Queue" view)
 *   - Express /queue fallback HTML page (this file's GET /page)
 *   - Operations dashboards
 *
 * Routes:
 *   GET    /                pending list (?urgency=critical|normal|low, ?limit=)
 *   GET    /counts          { critical, normal, low, total }
 *   GET    /:id             single row + recent action_log entries
 *   POST   /:id/resolve     { verdict, edit_payload?, resolved_by? }
 *   POST   /reverse/:logId  { reason }
 *   GET    /page            simple HTML fallback for browser-clearing
 *
 * Per spec backend/docs/superpowers/specs/2026-05-26-tate-approval-queue-design.md §4.
 */

const { Router } = require('express')
const router = Router()

const db = require('../config/db')
const logger = require('../config/logger')
const queue = require('../services/approvalQueueService')
const resolution = require('../services/approvalQueueResolutionService')

router.get('/', async (req, res) => {
  const urgency = req.query.urgency || null
  const limit = Math.min(parseInt(req.query.limit || '50'), 200)
  const r = await queue.listPending({ urgency, limit })
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error })
  res.json({ ok: true, rows: r.rows, count: r.rows.length })
})

router.get('/counts', async (_req, res) => {
  const r = await queue.countsByUrgency()
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error })
  res.json({ ok: true, counts: r.counts })
})

router.get('/page', async (_req, res) => {
  const r = await queue.listPending({ limit: 100 })
  if (!r.ok) return res.status(500).send(`error: ${r.error}`)
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(renderFallbackPage(r.rows))
})

router.get('/:id', async (req, res) => {
  const r = await queue.getById(req.params.id)
  if (!r.ok) return res.status(404).json({ ok: false, error: r.error })
  let logEntries = []
  try {
    logEntries = await db`
      SELECT id, action_type, reversible_until, reversed_at, reversal_reason, created_at
      FROM approval_action_log
      WHERE approval_id = ${req.params.id}
      ORDER BY created_at DESC LIMIT 50
    `
  } catch (err) {
    logger.debug('approval action log read soft-failed', { error: err.message })
  }
  res.json({ ok: true, row: r.row, action_log: logEntries })
})

router.post('/:id/resolve', async (req, res) => {
  const { verdict, edit_payload, resolved_by } = req.body || {}
  if (!verdict) return res.status(400).json({ ok: false, error: 'verdict required' })
  const r = await resolution.resolve(req.params.id, verdict, edit_payload || null, resolved_by || 'tate')
  if (!r.ok) {
    const status = r.error === 'already_resolved' ? 409 : 500
    return res.status(status).json(r)
  }
  res.json(r)
})

router.post('/reverse/:logId', async (req, res) => {
  const { reason } = req.body || {}
  if (!reason) return res.status(400).json({ ok: false, error: 'reason required' })
  const r = await resolution.reverse(req.params.logId, reason)
  if (!r.ok) {
    const status = r.code === 'not_reversible' ? 409 : 500
    return res.status(status).json(r)
  }
  res.json(r)
})

// ---------- helpers ----------

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function _ageLabel(created_at) {
  const ms = Date.now() - new Date(created_at).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function _decayLabel(decay_at) {
  if (!decay_at) return 'no decay'
  const ms = new Date(decay_at).getTime() - Date.now()
  if (ms <= 0) return 'overdue'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m left`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h left`
  return `${Math.floor(h / 24)}d left`
}

function renderFallbackPage(rows) {
  const items = rows.map((r) => `
    <div class="card ${_esc(r.urgency)}">
      <div class="head">
        <span class="type">${_esc(r.item_type)}</span>
        <span class="age">${_esc(_ageLabel(r.created_at))} old</span>
        <span class="decay">${_esc(_decayLabel(r.decay_at))}</span>
      </div>
      <div class="title">${_esc(r.title)}</div>
      <div class="actions">
        <button onclick="resolve('${_esc(r.id)}','Y')">Approve</button>
        <button onclick="resolve('${_esc(r.id)}','N')">Decline</button>
        <a href="/api/approval-queue/${_esc(r.id)}">detail</a>
      </div>
    </div>
  `).join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>Approval queue</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:780px;margin:2em auto;padding:0 1em;background:#fafafa;color:#222}
  .card{border:1px solid #ddd;border-radius:6px;padding:12px;margin:10px 0;background:#fff}
  .card.critical{border-left:4px solid #c00}
  .card.normal{border-left:4px solid #777}
  .card.low{border-left:4px solid #bbb}
  .head{display:flex;gap:12px;font-size:12px;color:#666;margin-bottom:6px}
  .type{font-weight:600;text-transform:uppercase}
  .title{font-size:15px;margin-bottom:8px;line-height:1.3}
  .actions{display:flex;gap:8px}
  button{padding:6px 14px;border:1px solid #888;background:#fff;cursor:pointer;border-radius:4px}
  button:hover{background:#eee}
  a{font-size:12px;color:#0066cc;align-self:center;margin-left:auto}
</style>
<h1>Approval queue (${rows.length} pending)</h1>
<p style="font-size:12px;color:#666">Fallback page. Primary surface is the iOS native conductor app.</p>
${items || '<p>Queue is empty.</p>'}
<script>
async function resolve(id, verdict){
  const r = await fetch('/api/approval-queue/'+id+'/resolve', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({verdict, resolved_by:'tate'})
  })
  const j = await r.json()
  if (!j.ok) { alert('failed: ' + (j.error || 'unknown')); return }
  location.reload()
}
</script>`
}

module.exports = router
