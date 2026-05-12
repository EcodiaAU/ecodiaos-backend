'use strict'

/**
 * capabilityRouter — deterministic routing tool.
 *
 * Pure JS scoring function; NO LLM call. Takes a task shape and returns the
 * cheapest correct execution route. Logs every decision to routing_decisions
 * (fire-and-forget) so rules can be tuned from observed corrections after 7d.
 *
 * Routing rules (in priority order):
 *  1. intent=tate_response                         → main (never outsource voice)
 *  2. intent=creative + tate_visible               → main (conductor's voice)
 *  3. intent=info_lookup + steps <= 2              → main
 *  4. intent=creative + !tate_visible              → fork (offline drafting)
 *  5. intent=info_lookup + steps <= 6 + parallel  → subagent by domain OR main
 *  6. intent=state_mutation + clear domain         → that subagent
 *  7. intent=state_mutation + no clear domain      → main
 *  8. intent=orchestration + steps >= 3 + parallel → fork_manager
 *  9. intent=orchestration + steps >= 3            → fork
 * 10. fallback                                     → main
 */

const logger = require('../config/logger')

// ─── Domain keyword sets ────────────────────────────────────────────────────
// Keep intentionally small; tune from routing_decisions logs after 7d.
const DOMAIN_KEYWORDS = {
  comms: [
    'gmail', 'email', 'calendar', 'crm', 'contact', 'meeting', 'sms', 'text',
    'message', 'inbox', 'draft', 'reply', 'send email', 'schedule meeting',
    'twilio', 'google workspace', 'mail',
  ],
  finance: [
    'bookkeeping', 'stripe', 'xero', 'invoice', 'payment', 'transaction',
    'ledger', 'bas', 'gst', 'reconcile', 'payable', 'receivable', 'revenue',
    'bank', 'billing', 'subscription', 'charge', 'refund', 'pnl', 'profit',
    'balance sheet', 'cash flow', 'categorize',
  ],
  ops: [
    'pm2', 'deploy', 'vps', 'server', 'restart', 'digitalocean', 'vercel',
    'shell', 'process', 'migration', 'supabase', 'database', 'infrastructure',
    'devops', 'ci', 'build', 'pipeline', 'logs', 'health check', 'uptime',
    'pm2 restart', 'pm2 list', 'psql', 'postgres',
  ],
  social: [
    'zernio', 'linkedin', 'instagram', 'facebook', 'twitter', 'social',
    'post', 'newsletter', 'quorum', 'content', 'publish', 'schedule post',
    'analytics', 'engagement', 'followers', 'feed',
  ],
}

/**
 * Match task_description against domain keyword sets.
 * Returns the best-matching domain or null if no clear match.
 * Scores by hit count; requires at least 1 hit; ties go to null (ambiguous).
 */
function keywordDomainMatch(taskDescription) {
  const lower = (taskDescription || '').toLowerCase()
  const scores = {}
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.filter(kw => lower.includes(kw)).length
  }
  const maxScore = Math.max(...Object.values(scores))
  if (maxScore === 0) return null
  const winners = Object.entries(scores).filter(([, s]) => s === maxScore).map(([d]) => d)
  // Ambiguous tie → null
  return winners.length === 1 ? winners[0] : null
}

// ─── Core routing logic ─────────────────────────────────────────────────────

/**
 * route(input) → { route, rationale, alternates }
 *
 * @param {object} input
 * @param {string} input.task_description
 * @param {'info_lookup'|'state_mutation'|'orchestration'|'creative'|'tate_response'} input.intent
 * @param {number}  [input.estimated_steps=1]
 * @param {boolean} [input.parallelisable=false]
 * @param {boolean} [input.tate_visible=true]
 * @param {string}  [input.session_id]
 * @returns {{ route: string, rationale: string, alternates: Array<{route:string,why_not:string}> }}
 */
function route(input) {
  const {
    task_description = '',
    intent,
    estimated_steps = 1,
    parallelisable = false,
    tate_visible = true,
    session_id = null,
  } = input

  let chosen_route
  let rationale
  const alternates = []

  // ── Rule 1: tate_response always stays on main ───────────────────────────
  if (intent === 'tate_response') {
    chosen_route = 'main'
    rationale = 'tate_response: conducting voice work — never outsource replies to Tate'
    alternates.push({ route: 'fork', why_not: 'would lose conductor voice; Tate-facing output must come from main' })

  // ── Rule 2: creative + tate_visible → main ───────────────────────────────
  } else if (intent === 'creative' && tate_visible) {
    chosen_route = 'main'
    rationale = 'creative + tate_visible: conductor voice is the product — must stay on main'
    alternates.push({ route: 'fork', why_not: 'forked drafts lose the conductor voice that makes creative output useful' })

  // ── Rule 3: info_lookup tiny → main ──────────────────────────────────────
  } else if (intent === 'info_lookup' && estimated_steps <= 2) {
    chosen_route = 'main'
    rationale = `info_lookup with ${estimated_steps} step(s): trivially small, main is cheapest`
    alternates.push({ route: 'fork', why_not: 'fork overhead exceeds work cost for ≤2-step lookups' })

  // ── Rule 4: creative + !tate_visible → fork (offline drafting) ───────────
  } else if (intent === 'creative' && !tate_visible) {
    chosen_route = 'fork'
    rationale = 'creative + not tate_visible: offline drafting — fork can draft without polluting conductor context'
    alternates.push({ route: 'main', why_not: 'burns conductor context for work Tate won\'t see directly' })

  // ── Rule 5: info_lookup medium + parallelisable → subagent or main ───────
  } else if (intent === 'info_lookup' && estimated_steps <= 6 && parallelisable) {
    const domain = keywordDomainMatch(task_description)
    if (domain) {
      chosen_route = `subagent:${domain}`
      rationale = `info_lookup parallelisable lookup in ${domain} domain — subagent keeps conductor context clean`
      alternates.push({ route: 'main', why_not: 'would burn conductor context budget on domain-specific lookup' })
    } else {
      chosen_route = 'main'
      rationale = 'info_lookup parallelisable but no clear domain match — main avoids subagent spawn overhead'
      alternates.push({ route: 'fork', why_not: 'fork overhead not justified for ambiguous medium lookup' })
    }

  // ── Rule 6: state_mutation + clear domain → that subagent ────────────────
  } else if (intent === 'state_mutation') {
    const domain = keywordDomainMatch(task_description)
    if (domain) {
      chosen_route = `subagent:${domain}`
      rationale = `state_mutation in ${domain} domain — delegate to specialist subagent`
      alternates.push({ route: 'main', why_not: 'conductor doing domain mutation burns cross-domain context budget' })
    } else {
      // Rule 7: no clear domain
      chosen_route = 'main'
      rationale = 'state_mutation with no clear domain match — conductor handles directly to avoid wrong-subagent risk'
      alternates.push({ route: 'fork', why_not: 'state mutation is often latency-sensitive; fork adds round-trip cost' })
    }

  // ── Rule 8: orchestration + parallel + big → fork_manager ────────────────
  } else if (intent === 'orchestration' && estimated_steps >= 3 && parallelisable) {
    chosen_route = 'fork_manager'
    rationale = `orchestration with ${estimated_steps} parallelisable steps — manager fork coordinates workers, returns one consolidated report`
    alternates.push({ route: 'fork', why_not: 'single fork serialises what could run concurrently' })
    alternates.push({ route: 'main', why_not: 'multi-step orchestration pollutes conductor context' })

  // ── Rule 9: orchestration + sequential + big → fork ──────────────────────
  } else if (intent === 'orchestration' && estimated_steps >= 3) {
    chosen_route = 'fork'
    rationale = `orchestration with ${estimated_steps} sequential steps — fork isolates conductor context`
    alternates.push({ route: 'fork_manager', why_not: 'steps are not parallelisable; manager adds overhead with no concurrency gain' })
    alternates.push({ route: 'main', why_not: 'multi-step orchestration burns conductor context budget' })

  // ── Rule 10: fallback → main ──────────────────────────────────────────────
  } else {
    chosen_route = 'main'
    rationale = `fallback: intent=${intent}, steps=${estimated_steps}, parallelisable=${parallelisable} — defaulting to main`
    alternates.push({ route: 'fork', why_not: 'insufficient signal to justify fork overhead' })
  }

  // ── Log to routing_decisions (fire-and-forget) ───────────────────────────
  _logDecision({
    session_id,
    task_description,
    intent,
    estimated_steps,
    parallelisable,
    tate_visible,
    chosen_route,
    rationale,
  }).catch(err => {
    logger.warn('capabilityRouter: failed to log routing decision', { error: err.message })
  })

  return { route: chosen_route, rationale, alternates: alternates.slice(0, 2) }
}

// ─── DB logging ─────────────────────────────────────────────────────────────

async function _logDecision(fields) {
  try {
    const db = require('../config/db')
    await db`
      INSERT INTO routing_decisions
        (session_id, task_description, intent, estimated_steps, parallelisable, tate_visible, chosen_route, rationale)
      VALUES
        (${fields.session_id || null},
         ${fields.task_description},
         ${fields.intent},
         ${fields.estimated_steps},
         ${fields.parallelisable},
         ${fields.tate_visible},
         ${fields.chosen_route},
         ${fields.rationale})
    `
  } catch (err) {
    // Non-fatal — routing still works even if logging fails
    logger.warn('capabilityRouter: DB log failed', { error: err.message })
  }
}

module.exports = { route, keywordDomainMatch, _logDecision }
