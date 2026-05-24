'use strict'

/**
 * entityIndex.js (2026-05-24)
 *
 * Voice context substrate. Replaces the brittle `status_board WHERE priority<=3
 * LIMIT 8` picker with relevance-driven retrieval: extract entities from the
 * user's utterance + return the facts genuinely about THAT entity, ranked.
 *
 * Loaded by voiceCallService at boot. Refreshes the in-memory index every 5 min
 * via setInterval. No separate service or DB process - this lives inside the
 * voice-call PM2 process. Memory footprint at ~7k facts: <50MB.
 *
 * Sources:
 *   - status_board (active + last 30d archived)
 *   - thread_log (last 30d, voice + ide + away channels)
 *   - case_files (open + resolved last 30d)
 *   - kv_store.cowork.message_thread.* (cross-channel mirrors)
 *   - backend/clients/*.md (curated client knowledge files)
 *
 * Per spec backend/drafts/voice-fast-and-intelligent-2026-05-24.md §3.1.
 */

const db = require('../config/db')
const logger = require('../config/logger')
const fs = require('fs').promises
const path = require('path')

const REFRESH_INTERVAL_MS = 5 * 60 * 1000  // 5 min
const MAX_FACTS_PER_REQUEST = 20
const MAX_BODY_CHARS_PER_FACT = 280
const CLIENTS_DIR = path.resolve(__dirname, '../../clients')

// Known entity dictionary. Built dynamically from status_board entity names +
// client file slugs + the seed canon below. Lowercased keys for case-insensitive
// matching.
const ENTITY_CANON = {
  // Clients/projects
  'coexist': { canonical: 'Co-Exist', aliases: ['co exist', 'co-exist', 'coexist'] },
  'glovebox': { canonical: 'Glovebox', aliases: ['glovebox', 'glove box', 'roam'] },
  'goodreach': { canonical: 'Goodreach', aliases: ['goodreach', 'good reach', 'good rate', 'good wreath'] },
  'resonaverde': { canonical: 'Resonaverde', aliases: ['resonaverde', 'reson averde', 'resonaverdi'] },
  'chambers': { canonical: 'Chambers', aliases: ['chambers'] },
  'wattle': { canonical: 'Wattle', aliases: ['wattle'] },
  'wildmountains': { canonical: 'Wildmountains', aliases: ['wildmountains', 'wild mountains'] },
  'woodfordia': { canonical: 'Woodfordia', aliases: ['woodfordia'] },
  'cetin': { canonical: 'CETIN', aliases: ['cetin', 'see tin'] },
  'context': { canonical: 'Context', aliases: ['context app'] },  // careful - 'context' alone is too noisy
  '[redacted]': { canonical: '[redacted]', aliases: ['[redacted]'] },
  'nav': { canonical: 'Nav', aliases: ['nav app'] },  // also too generic alone
  // People
  'tate': { canonical: 'Tate', aliases: ['tate'] },
  'tom': { canonical: 'Tom', aliases: ['tom grote', 'tom'] },
  'kurt': { canonical: 'Kurt', aliases: ['kurt jones', 'kurt'] },
  'angelica': { canonical: 'Angelica', aliases: ['angelica'] },
  // Systems
  'corazon': { canonical: 'Corazon', aliases: ['corazon', 'core a zone'] },
  'vps': { canonical: 'VPS', aliases: ['vps', 'v p s'] },
  'voice-call': { canonical: 'voice-call', aliases: ['voice call', 'voice-call'] },
  'away-conductor': { canonical: 'away-conductor', aliases: ['away conductor', 'away-conductor', 'workstation'] },
  'ecodia-api': { canonical: 'ecodia-api', aliases: ['ecodia api'] },
  // Vendors/services
  'stripe': { canonical: 'Stripe', aliases: ['stripe'] },
  'vercel': { canonical: 'Vercel', aliases: ['vercel'] },
  'supabase': { canonical: 'Supabase', aliases: ['supabase'] },
  'apple': { canonical: 'Apple', aliases: ['apple', 'asc', 'app store connect', 'testflight'] },
  'github': { canonical: 'GitHub', aliases: ['github', 'git hub'] },
}

// Words too short or too common to entity-match against
const STOPWORDS = new Set([
  'a','an','and','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','should','could','can','may','might','must','to',
  'for','of','in','on','at','by','from','with','about','as','into','through','during',
  'i','me','my','we','us','our','you','your','he','him','his','she','her','it','its',
  'they','them','their','this','that','these','those','what','which','who','when',
  'where','why','how','okay','ok','yeah','yes','no','nah','hey','yo','hi','hello',
  'just','really','actually','very','too','also','please','thanks',
])

// ===== Index state =====

let _facts = []           // [{entity, source, ts, body, ref}]
let _entityCache = new Map()  // canonical entity -> array index of facts
let _entityNames = new Set()  // lowercase canonical + aliases for tokenizing utterances
let _lastRefreshAt = 0
let _refreshing = false
let _refreshTimer = null

// ===== Tokenization + matching =====

function _tokenize(s) {
  return (s || '').toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(Boolean)
}

function _normalizeForMatch(s) {
  return _tokenize(s).join(' ')
}

function _extractEntities(utterance) {
  const norm = _normalizeForMatch(utterance)
  const tokens = _tokenize(utterance)
  const found = new Set()

  // Multi-word alias match (most specific first)
  const sortedAliases = []
  for (const [, e] of Object.entries(ENTITY_CANON)) {
    for (const a of e.aliases) sortedAliases.push({ alias: a, canonical: e.canonical, len: a.length })
  }
  sortedAliases.sort((a, b) => b.len - a.len)

  for (const { alias, canonical } of sortedAliases) {
    if (norm.includes(alias)) found.add(canonical)
  }

  // Single-token match with fuzzy fallback for STT errors
  for (const tok of tokens) {
    if (tok.length < 4 || STOPWORDS.has(tok)) continue
    for (const [key, e] of Object.entries(ENTITY_CANON)) {
      if (tok === key) found.add(e.canonical)
      // Levenshtein-1 fuzzy match for STT errors on short names
      else if (e.aliases.includes(tok)) found.add(e.canonical)
      else if (key.length >= 5 && _levenshtein(tok, key) <= 1) found.add(e.canonical)
    }
  }

  // Dynamic entity names from index (status_board row names, client file slugs)
  for (const tok of tokens) {
    if (tok.length < 4 || STOPWORDS.has(tok)) continue
    for (const name of _entityNames) {
      if (name === tok) {
        const canonical = ENTITY_CANON[name]?.canonical || name
        found.add(canonical)
      }
    }
  }

  return Array.from(found)
}

function _levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99
  const m = a.length, n = b.length
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

// ===== Index builders =====

const SOURCE_WEIGHT = {
  client_file: 100,
  status_board_active: 80,
  case_file_open: 70,
  status_board_archived: 50,
  thread_log: 40,
  case_file_resolved: 30,
  message_mirror: 20,
}

function _extractEntitiesFromText(text) {
  if (!text) return []
  const norm = _normalizeForMatch(text)
  const found = []
  for (const [key, e] of Object.entries(ENTITY_CANON)) {
    for (const a of e.aliases) {
      // Word-boundary check via regex against original text
      const re = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(text)) { found.push(e.canonical); break }
    }
  }
  return Array.from(new Set(found))
}

async function _loadStatusBoard() {
  try {
    const rows = await db`
      SELECT id, name, status, next_action, next_action_by, priority, last_touched, context, entity_type, archived_at
      FROM status_board
      WHERE archived_at IS NULL OR archived_at > NOW() - interval '30 days'
      ORDER BY COALESCE(last_touched, created_at) DESC
      LIMIT 1000
    `
    return rows.map((r) => {
      const txtBlob = `${r.name} ${r.status || ''} ${r.next_action || ''} ${r.context || ''}`
      const entities = _extractEntitiesFromText(txtBlob)
      // Also: the row's NAME itself is an entity token
      const nameWords = _tokenize(r.name).filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      nameWords.forEach((w) => _entityNames.add(w))
      const summary = [
        r.status ? `status: ${String(r.status).slice(0, 120)}` : null,
        r.next_action ? `next: ${String(r.next_action).slice(0, 120)} [${r.next_action_by || '?'}]` : null,
      ].filter(Boolean).join(' | ')
      return {
        entities,
        source: r.archived_at ? 'status_board_archived' : 'status_board_active',
        ts: r.last_touched || new Date(),
        ref: `status_board:${r.id}`,
        title: r.name,
        body: summary || r.name,
      }
    })
  } catch (err) {
    logger.warn('[entityIndex] status_board load failed', { error: err.message })
    return []
  }
}

async function _loadThreadLog() {
  try {
    const rows = await db`
      SELECT ts, channel, role, body, voice_call_id
      FROM thread_log
      WHERE thread_id = 'tate' AND ts > NOW() - interval '30 days'
      ORDER BY ts DESC
      LIMIT 500
    `
    return rows.map((r) => {
      const entities = _extractEntitiesFromText(r.body)
      if (!entities.length) return null  // skip thread_log entries with no entity mention
      const who = r.role === 'tate' ? 'Tate' : r.role === 'ecodia' ? 'You' : 'system'
      return {
        entities,
        source: 'thread_log',
        ts: r.ts,
        ref: `thread_log:${r.ts}`,
        title: `${who} via ${r.channel}`,
        body: String(r.body).slice(0, MAX_BODY_CHARS_PER_FACT),
      }
    }).filter(Boolean)
  } catch (err) {
    logger.warn('[entityIndex] thread_log load failed', { error: err.message })
    return []
  }
}

async function _loadCaseFiles() {
  try {
    const rows = await db`
      SELECT id, status, opened_at, opened_by, prompt, result, resolved_at
      FROM case_files
      WHERE thread_id = 'tate'
        AND (status IN ('open','working','blocked') OR resolved_at > NOW() - interval '30 days')
      ORDER BY COALESCE(resolved_at, opened_at) DESC
      LIMIT 200
    `
    return rows.map((r) => {
      const txt = `${r.prompt || ''} ${r.result || ''}`
      const entities = _extractEntitiesFromText(txt)
      if (!entities.length) return null
      const isOpen = ['open','working','blocked'].includes(r.status)
      const body = isOpen
        ? `[${r.status}] Q: ${String(r.prompt).slice(0, 200)}`
        : `Q: ${String(r.prompt).slice(0, 100)} -> A: ${String(r.result || '').slice(0, 180)}`
      return {
        entities,
        source: isOpen ? 'case_file_open' : 'case_file_resolved',
        ts: r.resolved_at || r.opened_at,
        ref: `case_file:${r.id}`,
        title: `case (${r.status})`,
        body,
      }
    }).filter(Boolean)
  } catch (err) {
    logger.warn('[entityIndex] case_files load failed (table may not exist on this VPS)', { error: err.message })
    return []
  }
}

async function _loadClientFiles() {
  try {
    let entries = []
    try { entries = await fs.readdir(CLIENTS_DIR) } catch { return [] }
    const cards = []
    for (const fname of entries) {
      if (!fname.endsWith('.md')) continue
      const slug = fname.replace(/\.md$/, '').toLowerCase()
      _entityNames.add(slug)
      const fp = path.join(CLIENTS_DIR, fname)
      let content
      try {
        const stat = await fs.stat(fp)
        if (!stat.isFile()) continue
        content = await fs.readFile(fp, 'utf8')
      } catch { continue }
      // First 800 chars as the summary card
      const summary = content
        .replace(/^---[\s\S]*?---/m, '')  // strip frontmatter
        .replace(/^#+\s*/gm, '')           // strip heading markers
        .trim()
        .slice(0, 800)
      const entities = _extractEntitiesFromText(`${slug} ${summary}`)
      if (entities.length === 0) entities.push(slug)
      cards.push({
        entities,
        source: 'client_file',
        ts: new Date(),
        ref: `clients/${fname}`,
        title: slug,
        body: summary,
      })
    }
    return cards
  } catch (err) {
    logger.warn('[entityIndex] client files load failed', { error: err.message })
    return []
  }
}

// ===== Main refresh =====

async function refresh() {
  if (_refreshing) return { ok: false, reason: 'already refreshing' }
  _refreshing = true
  const started = Date.now()
  try {
    _entityNames = new Set()
    const [sb, tl, cf, clients] = await Promise.all([
      _loadStatusBoard(),
      _loadThreadLog(),
      _loadCaseFiles(),
      _loadClientFiles(),
    ])
    _facts = [...sb, ...tl, ...cf, ...clients]

    // Build the entity -> fact-indices cache
    _entityCache = new Map()
    for (let i = 0; i < _facts.length; i++) {
      for (const e of _facts[i].entities) {
        if (!_entityCache.has(e)) _entityCache.set(e, [])
        _entityCache.get(e).push(i)
      }
    }
    _lastRefreshAt = Date.now()
    logger.info('[entityIndex] refreshed', {
      facts: _facts.length,
      entities: _entityCache.size,
      dynamic_entity_names: _entityNames.size,
      ms: Date.now() - started,
    })
    return { ok: true, facts: _facts.length, entities: _entityCache.size, ms: Date.now() - started }
  } catch (err) {
    logger.error('[entityIndex] refresh failed', { error: err.message })
    return { ok: false, error: err.message }
  } finally {
    _refreshing = false
  }
}

// ===== Public API =====

/**
 * Extract entities from the utterance + return ranked fact-cards.
 * Returns { facts: [{entities, source, ts, body, ref, title}], matched_entities: [], total_candidates }
 */
function getFacts(utterance, { max = MAX_FACTS_PER_REQUEST } = {}) {
  if (!_facts.length) return { facts: [], matched_entities: [], total_candidates: 0, index_empty: true }
  const matched = _extractEntities(utterance)
  if (!matched.length) {
    // No entity match - fall back to top-N most recent client_file + status_board_active facts
    const fallback = _facts
      .filter((f) => f.source === 'client_file' || f.source === 'status_board_active')
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, max)
    return { facts: fallback, matched_entities: [], total_candidates: fallback.length, fallback: true }
  }
  const candidateIdx = new Set()
  for (const e of matched) {
    const idxs = _entityCache.get(e)
    if (idxs) idxs.forEach((i) => candidateIdx.add(i))
  }
  const candidates = Array.from(candidateIdx).map((i) => _facts[i])
  candidates.sort((a, b) => {
    const wa = SOURCE_WEIGHT[a.source] || 0
    const wb = SOURCE_WEIGHT[b.source] || 0
    if (wa !== wb) return wb - wa
    return new Date(b.ts) - new Date(a.ts)
  })
  return {
    facts: candidates.slice(0, max),
    matched_entities: matched,
    total_candidates: candidates.length,
  }
}

function formatFactsForPrompt(facts) {
  if (!facts.length) return ''
  return facts.map((f) => {
    const ageMs = Date.now() - new Date(f.ts).getTime()
    const ageStr = ageMs < 3600000 ? `${Math.round(ageMs / 60000)}m`
      : ageMs < 86400000 ? `${Math.round(ageMs / 3600000)}h`
      : `${Math.round(ageMs / 86400000)}d`
    return `- [${f.source} ${ageStr}ago] ${f.title}: ${f.body.replace(/\s+/g, ' ')}`
  }).join('\n')
}

function status() {
  return {
    ok: _lastRefreshAt > 0,
    last_refresh_at: _lastRefreshAt ? new Date(_lastRefreshAt).toISOString() : null,
    age_ms: _lastRefreshAt ? Date.now() - _lastRefreshAt : null,
    facts: _facts.length,
    entities: _entityCache.size,
    dynamic_entity_names: _entityNames.size,
  }
}

function start() {
  if (_refreshTimer) return
  refresh().catch(() => {})
  _refreshTimer = setInterval(() => { refresh().catch(() => {}) }, REFRESH_INTERVAL_MS)
}

function stop() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null }
}

module.exports = { start, stop, refresh, getFacts, formatFactsForPrompt, status }
