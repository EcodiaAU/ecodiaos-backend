'use strict'

/**
 * accountRouter - balance ad-hoc Routine /fire calls across the three Max 20x
 * subscription accounts (tate@, code@, money@).
 *
 * Background: post-VPS-to-local-migration (2026-05-15) the 16 Routines are
 * spread across the three accounts to balance the daily-routine-cap. But ad-hoc
 * /fire calls (from webhook shims, voice commands, Tate-issued slash commands)
 * need to land on the least-loaded account. This module is the router.
 *
 * The cap itself is undocumented by Anthropic. We start with a 50/day estimate
 * per account and tune as we observe actual cap-hit behaviour.
 *
 * Interface:
 *   pickAccount({ exclude=[], require_scope=null }) -> account email string
 *   getAccountUsage(account) -> { fires_today, cap_estimate, headroom_pct }
 *   routeAdhocFire({ routine_name, payload, exclude=[] }) -> fire result
 *
 * The routine_registry (kv_store.cowork.routine_registry.<account>.<routine>)
 * is populated by Tate via REGISTRY.md handoff after creating the Routines in
 * claude.ai web UI. Each entry: { fire_url, fire_token, scope_hint }.
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 */

const db = require('../config/db')
const logger = require('../config/logger')

const ACCOUNTS = ['tate@ecodia.au', 'code@ecodia.au', 'money@ecodia.au']
const DEFAULT_CAP_ESTIMATE = 50
const USAGE_KEY_PREFIX = 'cowork.account_usage.'
const METRICS_KEY = 'cowork.metrics.account_router'

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

async function getAccountUsage(account) {
  const today = todayUtc()
  const usageKey = `${USAGE_KEY_PREFIX}${account}.${today}`
  const capKey = `${USAGE_KEY_PREFIX}${account}.cap_estimate`

  const [usageRows, capRows] = await Promise.all([
    db`SELECT value FROM kv_store WHERE key = ${usageKey} LIMIT 1`,
    db`SELECT value FROM kv_store WHERE key = ${capKey} LIMIT 1`,
  ])

  const fires_today = Number(usageRows?.[0]?.value?.fires_today || 0)
  const cap_estimate = Number(capRows?.[0]?.value?.cap || DEFAULT_CAP_ESTIMATE)
  const headroom_pct = cap_estimate > 0 ? Math.max(0, (cap_estimate - fires_today) / cap_estimate) : 0

  return { account, fires_today, cap_estimate, headroom_pct }
}

async function pickAccount({ exclude = [], require_scope = null } = {}) {
  const candidates = ACCOUNTS.filter(a => !exclude.includes(a))
  if (candidates.length === 0) throw new Error('accountRouter: no candidates after exclusion')

  const usages = await Promise.all(candidates.map(getAccountUsage))

  let filtered = usages
  if (require_scope) {
    const scoped = await Promise.all(usages.map(async u => {
      const rows = await db`
        SELECT value FROM kv_store
        WHERE key LIKE ${`cowork.routine_registry.${u.account}.%`}
        LIMIT 50
      `
      const hasScope = rows.some(r => {
        const hint = r.value?.scope_hint
        return Array.isArray(hint) ? hint.includes(require_scope) : hint === require_scope
      })
      return hasScope ? u : null
    }))
    filtered = scoped.filter(Boolean)
    if (filtered.length === 0) {
      logger.warn('accountRouter: no account satisfies require_scope, falling back to all', { require_scope })
      filtered = usages
    }
  }

  filtered.sort((a, b) => b.headroom_pct - a.headroom_pct)
  const picked = filtered[0]

  await incrementMetric('route_decisions', { account: picked.account, headroom_pct: picked.headroom_pct })

  if (picked.headroom_pct === 0) {
    await incrementMetric('cap_hits', { account: picked.account })
    logger.warn('accountRouter: picked account at 0% headroom', { account: picked.account })
  }

  return picked.account
}

async function incrementUsage(account) {
  const today = todayUtc()
  const key = `${USAGE_KEY_PREFIX}${account}.${today}`
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
  await db`
    INSERT INTO kv_store (key, value, expires_at)
    VALUES (${key}, ${JSON.stringify({ fires_today: 1, last_fired_at: new Date().toISOString() })}::jsonb, ${expiresAt}::timestamptz)
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
      'fires_today', (COALESCE((kv_store.value->>'fires_today')::int, 0) + 1),
      'last_fired_at', ${new Date().toISOString()}
    )
  `
}

async function incrementMetric(metricName, extra = {}) {
  const entry = { timestamp: new Date().toISOString(), metric: metricName, ...extra }
  try {
    await db`
      INSERT INTO kv_store (key, value)
      VALUES (${METRICS_KEY}, ${JSON.stringify([entry])}::jsonb)
      ON CONFLICT (key) DO UPDATE
      SET value = (
        CASE
          WHEN jsonb_array_length(kv_store.value) >= 5000
          THEN (kv_store.value - 0) || ${JSON.stringify(entry)}::jsonb
          ELSE kv_store.value || ${JSON.stringify(entry)}::jsonb
        END
      )
    `
  } catch (err) {
    logger.debug('accountRouter: metric append failed (non-fatal)', { error: err.message })
  }
}

async function getRoutineConfig({ account, routine_name }) {
  const key = `cowork.routine_registry.${account}.${routine_name}`
  const rows = await db`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`
  return rows?.[0]?.value || null
}

async function routeAdhocFire({ routine_name, payload, exclude = [], require_scope = null, source = 'adhoc' }) {
  const triedAccounts = []
  const failedAccounts = []

  for (let attempt = 0; attempt < ACCOUNTS.length; attempt++) {
    const account = await pickAccount({ exclude: [...exclude, ...failedAccounts], require_scope })
    triedAccounts.push(account)

    const cfg = await getRoutineConfig({ account, routine_name })
    if (!cfg || !cfg.fire_url || !cfg.fire_token) {
      logger.warn('accountRouter: routine not registered on picked account', { account, routine_name })
      await incrementMetric('account_excluded_no_routine', { account, routine_name })
      failedAccounts.push(account)
      continue
    }

    try {
      const resp = await fetch(cfg.fire_url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.fire_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: typeof payload === 'string' ? payload : JSON.stringify({ source, payload }) }),
      })

      if (resp.status >= 200 && resp.status < 300) {
        await incrementUsage(account)
        return { ok: true, account, status: resp.status, attempt: attempt + 1, tried: triedAccounts }
      }

      if (resp.status === 429 || resp.status === 402) {
        await incrementMetric('cap_hit_429', { account, routine_name, status: resp.status })
        failedAccounts.push(account)
        continue
      }

      const errText = await resp.text().catch(() => '')
      await incrementMetric('route_failure', { account, routine_name, status: resp.status, error: errText.slice(0, 200) })
      return { ok: false, account, status: resp.status, error: errText.slice(0, 500), tried: triedAccounts }
    } catch (err) {
      logger.warn('accountRouter: fire request threw', { account, routine_name, error: err.message })
      await incrementMetric('route_failure', { account, routine_name, error: err.message })
      failedAccounts.push(account)
    }
  }

  await incrementMetric('route_exhausted', { routine_name, tried: triedAccounts })
  return { ok: false, account: null, status: 0, error: 'all_accounts_exhausted', tried: triedAccounts }
}

module.exports = {
  ACCOUNTS,
  pickAccount,
  getAccountUsage,
  routeAdhocFire,
  incrementUsage,
}
