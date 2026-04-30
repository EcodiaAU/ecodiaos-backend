/**
 * Cron Priority Allowlist — Decision 3993 commit 3/3
 *
 * Classifies every active cron in `os_scheduled_tasks` into one of four routes:
 *
 *   CONDUCTOR_CRONS       → POST to /api/os-session/message (status quo).
 *                           Reserved for the conductor judgment loop only.
 *
 *   DIRECT_EXEC_CRONS     → POST to /api/os-session/message (status quo) — but
 *                           kept on this path because the prompt is essentially
 *                           a tiny shell_exec dispatch ("node foo.js --once")
 *                           and the conductor-context pollution is negligible.
 *                           Refactoring these would be churn for no gain.
 *
 *   HIGH_PRIORITY_FORK_CRONS  → spawn an ephemeral fork via cronForkDispatcher.
 *                               Always runs, even when budget < 25%.
 *                               These are the watchdogs and ops-critical loops.
 *
 *   LOW_PRIORITY_FORK_CRONS   → spawn an ephemeral fork via cronForkDispatcher.
 *                               Skipped when budget < 25% to preserve the
 *                               daily fork budget for HIGH-priority work.
 *
 * Budget circuit-breaker tiers (kv_store.cowork.daily_fork_budget_remaining
 * starts at 100000 each midnight UTC):
 *
 *   budget >= 25%   → HIGH and LOW both run
 *   budget <  25%   → HIGH runs, LOW skips (status_board P3 deferred row)
 *   budget <   5%   → emergency: only HIGH + CONDUCTOR + DIRECT_EXEC paths fire
 *
 * Tate-direct messages always bypass the budget gate (handled in osSession).
 *
 * A cron name not in any list defaults to LOW_PRIORITY (conservative — opts
 * into the budget gate rather than running unconditionally).
 *
 * Spec: ~/CLAUDE.md "Decision 3993 forks-as-primitive bootstrap" + Strategic
 * Direction 3986. Doctrine: ~/ecodiaos/patterns/scheduled-prompt-cold-start-
 * adequacy.md (rewritten cron prompts must be cold-start-adequate self-
 * contained briefs since the fork has zero prior context).
 */
'use strict'

// ─── Route 1: stays on conductor (judgment loop, must run ON main) ──────────
const CONDUCTOR_CRONS = new Set([
  'meta-loop', // The main CEO judgment cron. Reclaims the 80% of context the
                // other crons no longer pollute.
])

// ─── Route 2: direct-exec (small shell-exec dispatch, leave on os-session) ──
// Verified by reading prompt: each is essentially `shell_exec node foo.js
// --once` or `shell_exec curl <internal-endpoint>`. Pollution footprint is
// minimal and refactoring to fork-spawn adds overhead with no context savings.
const DIRECT_EXEC_CRONS = new Set([
  'telemetry-dispatch-consumer',   // shell_exec node telemetry/dispatchConsumer.js --once
  'decision-quality-classifier',   // shell_exec node telemetry/failureClassifier.js --once
  'os-forks-reaper',               // shell_exec node forks/reaper.js --once
  'telemetry-outcome-inference',   // shell_exec node telemetry/outcomeInferrer.js --once
  'kg-consolidation',              // shell_exec curl <internal>/kg/consolidate
  'kg-embedding',                  // shell_exec curl <internal>/kg/embed
  'neo4j-keepalive',               // single graph_query heartbeat
  'daily-telemetry',               // KPI snapshot insert
  'coexist-sync-health',           // shell_exec node coexistSyncHealth.js --once
  'peer-monitor',                  // small WebSearch + cache diff
  'cowork-fork-budget-reset',      // resets the dispatcher's own budget; must not be budget-gated
])

// ─── Route 3: HIGH-priority forks (always run, never budget-gated) ──────────
// These are the watchdogs and ops loops. If they defer because of budget, the
// system loses its self-healing signal.
const HIGH_PRIORITY_FORK_CRONS = new Set([
  'email-triage',           // Tate's inbox hygiene — visible to him daily.
  'system-health',          // PM2/disk/memory/error-log probe.
  'morning-briefing',       // Daily 09:00 email to Tate.
  'silent-loop-detector',   // Watch the watchers — must not silently fail.
  'parallel-builder',       // Factory-orchestration cron (queued in design).
  'tate-blocked-nudge-weekly',  // Sunday SMS — the one signal that flatlined autonomy notices.
  'phase-G-adversarial-audit',  // Daily critic-fork (Layer 8 of decision-quality architecture).
])

// ─── Route 4: LOW-priority forks (skipped when budget tight) ────────────────
const LOW_PRIORITY_FORK_CRONS = new Set([
  // Intelligence + growth (3-6h cadence, intentionally slow)
  'deep-research',
  'self-evolution',
  'strategic-thinking',
  'inner-life',
  'outreach-engine',
  'marketing-outreach',

  // Operations (longer cadence, can defer one cycle without harm)
  'weekly-financial-review',
  'claude-md-reflection',
  'vercel-deploy-monitor',

  // Doctrine / KG maintenance (skip-friendly)
  'daily-codification-scan',
  'daily-index-regen',
  'weekly-doctrine-synthesis',

  // Reconciliation / drift (skip a cycle, next cycle picks up)
  'status-board-reconciliation',
  'external-blocker-freshness-probe',
  'decision-quality-drift-check',
  'cowork-account-revert-probe',

  // Personal / weekly
  'weekly-mum-text',
])

// ── Budget tier thresholds (percent of daily budget remaining) ──────────────
const BUDGET_TIER_NORMAL = 0.25      // >= 25%: HIGH + LOW both run
const BUDGET_TIER_EMERGENCY = 0.05   // <  5%: only HIGH + CONDUCTOR + DIRECT_EXEC
const DAILY_FORK_BUDGET_DEFAULT = 100_000

/**
 * Classify a cron name into one of the four routes.
 * Returns: 'conductor' | 'direct_exec' | 'high_priority_fork' | 'low_priority_fork'.
 * Unknown names default to 'low_priority_fork' (conservative).
 */
function classifyCron(name) {
  if (CONDUCTOR_CRONS.has(name)) return 'conductor'
  if (DIRECT_EXEC_CRONS.has(name)) return 'direct_exec'
  if (HIGH_PRIORITY_FORK_CRONS.has(name)) return 'high_priority_fork'
  if (LOW_PRIORITY_FORK_CRONS.has(name)) return 'low_priority_fork'
  return 'low_priority_fork' // conservative default
}

/**
 * Decide whether a fork-route cron should fire given current budget.
 * Returns: { allow: boolean, reason: string, tier: 'normal'|'low'|'emergency' }
 */
function budgetGateDecision({ classification, budgetRemaining, budgetMax }) {
  const ratio = budgetMax > 0 ? budgetRemaining / budgetMax : 0
  let tier = 'normal'
  if (ratio < BUDGET_TIER_EMERGENCY) tier = 'emergency'
  else if (ratio < BUDGET_TIER_NORMAL) tier = 'low'

  // Conductor and direct-exec always fire — they don't consume the fork budget.
  if (classification === 'conductor' || classification === 'direct_exec') {
    return { allow: true, reason: 'route_does_not_consume_fork_budget', tier }
  }

  // HIGH always fires.
  if (classification === 'high_priority_fork') {
    return { allow: true, reason: 'high_priority_fork_always_runs', tier }
  }

  // LOW: gated by tier.
  if (classification === 'low_priority_fork') {
    if (tier === 'normal') return { allow: true, reason: 'low_priority_fork_within_budget', tier }
    return {
      allow: false,
      reason: tier === 'emergency'
        ? 'budget_emergency_low_priority_skipped'
        : 'budget_low_low_priority_skipped',
      tier,
    }
  }

  return { allow: false, reason: 'unknown_classification', tier }
}

module.exports = {
  CONDUCTOR_CRONS,
  DIRECT_EXEC_CRONS,
  HIGH_PRIORITY_FORK_CRONS,
  LOW_PRIORITY_FORK_CRONS,
  BUDGET_TIER_NORMAL,
  BUDGET_TIER_EMERGENCY,
  DAILY_FORK_BUDGET_DEFAULT,
  classifyCron,
  budgetGateDecision,
}
