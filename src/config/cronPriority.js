/**
 * Cron Priority Allowlist - Decision 3993 commit 3/3 + Decision 4 May 2026
 * "Crons route to forks by default, NEVER main chat"
 *
 * Classifies every active cron in `os_scheduled_tasks` into one of four routes:
 *
 *   CONDUCTOR_CRONS       → POST to /api/os-session/message (lands on main).
 *                           Reserved EXCLUSIVELY for the conductor's CEO
 *                           judgment loop (meta-loop). Adding any other cron
 *                           to this list pollutes Tate's chat stream and
 *                           interrupts active work - do not extend without
 *                           Tate's explicit go-ahead.
 *
 *   DIRECT_EXEC_CRONS     → DEPRECATED (4 May 2026). Empty by design. Was a
 *                           "tiny shell-exec dispatch" carve-out that POSTed
 *                           into the conductor's message queue under the
 *                           reasoning "pollution footprint negligible,
 *                           refactoring is churn for no gain." Tate's verbatim
 *                           4 May 2026 19:30 AEST: "More those crong jobs to
 *                           forks, make sure they automatically go to
 *                           background forks, NEVER to main chat... thats such
 *                           a waste and interupts our work." Every entry
 *                           previously in this set was moved to
 *                           HIGH_PRIORITY_FORK (operational watchdogs/telemetry
 *                           that must always run) so they spawn ephemeral forks
 *                           and never hit /api/os-session/message. The set is
 *                           kept (empty) for forward-compatibility with the
 *                           classifier function and any future infra cron that
 *                           legitimately must run as a fire-and-forget shell
 *                           call without spawning a fork (none today).
 *
 *   HIGH_PRIORITY_FORK_CRONS  → spawn an ephemeral fork via cronForkDispatcher.
 *                               Always runs, even when budget < 25%.
 *                               Watchdogs, telemetry, ops-critical loops, and
 *                               any cron that previously lived in DIRECT_EXEC.
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
 *   budget <   5%   → emergency: only HIGH + CONDUCTOR fire
 *
 * Tate-direct messages always bypass the budget gate (handled in osSession).
 *
 * A cron name not in any list defaults to LOW_PRIORITY (conservative - opts
 * into the budget gate rather than running unconditionally).
 *
 * Spec: ~/CLAUDE.md "Decision 3993 forks-as-primitive bootstrap" + Strategic
 * Direction 3986. Doctrine: ~/ecodiaos/patterns/scheduled-prompt-cold-start-
 * adequacy.md (rewritten cron prompts must be cold-start-adequate self-
 * contained briefs since the fork has zero prior context),
 * ~/ecodiaos/patterns/crons-route-to-forks-by-default.md (4 May 2026 rule
 * collapsing DIRECT_EXEC into fork-route).
 */
'use strict'

// ─── Route 1: stays on conductor (judgment loop, must run ON main) ──────────
// EXCLUSIVE membership rule (4 May 2026): meta-loop is the ONLY cron permitted
// here. It is by design the conductor's CEO judgment cycle and IS the main
// chat. Every other cron - including small shell-exec dispatches and
// telemetry consumers - routes to a fork via cronForkDispatcher so it never
// pollutes Tate's working chat stream. Adding a second entry here re-creates
// the failure mode Tate flagged 4 May 2026 19:30 AEST.
const CONDUCTOR_CRONS = new Set([
  'meta-loop',
])

// ─── Route 2: direct-exec — deterministic shell scripts, no fork needed ──────
// A cron in this set causes schedulerPollerService to run its shell command
// directly via spawnSync (no fork spawned, no credits consumed, no account
// exhaustion risk). The command is looked up from DIRECT_EXEC_COMMANDS below.
//
// Canonical use case (12 May 2026, fork_mp28xkeh_b611b0): JSONL→Postgres
// telemetry rotation scripts. These are fully deterministic, agentic-decision-
// free, and run every 15 minutes. Routing them through the fork system caused
// credit-exhaustion floods: when all three Max accounts hit their weekly cap,
// every 15-minute fire produced a fork error row, triggering the anti-flood
// pattern each time (~3+ consecutive errors at 06:18-06:23 UTC 12 May 2026
// against fork_mp28p0q6, fork_mp28ugfu, fork_mp28uibh).
//
// Precedent: the `daily-index-regen` cron was moved to direct node-script
// execution for the same reason (Decision 2026-05-04, commit 773697d).
//
// Pattern: ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md
// (failure mode this prevents). Only add crons here when: (1) fully
// deterministic with no agentic decisions, (2) zero branching logic needing
// the conductor's MCP surface, (3) credit-exhaustion-tolerant (must run even
// when all Claude Max accounts are exhausted).
const DIRECT_EXEC_CRONS = new Set([
  'telemetry-dispatch-consumer',  // every 15m — JSONL→Postgres consumer (Layer 4 decision-quality)
  'telemetry-perf-consumer',      // every 15m — JSONL→Postgres consumer for perf events (Layer 6 Phase E)
  'observation-retention-cleanup',// daily 02:00 AEST — purge observer_*, os_observations, session_memory_chunks, gkg_events. Deterministic SQL, no agentic decisions. Migration 118.
  'approval-queue-reconciler',    // hourly — safety-net backfill of status_board->approval_queue mirrors the trigger missed. Deterministic INSERT...SELECT...ON CONFLICT, no agentic decisions.
])

// Shell commands for each direct-exec cron. Keyed by task name (must match
// os_scheduled_tasks.name). spawnSync runs these via `bash -c <cmd>`.
// IMPORTANT: keep in sync with DIRECT_EXEC_CRONS membership.
const DIRECT_EXEC_COMMANDS = new Map([
  ['telemetry-dispatch-consumer',   'cd /home/tate/ecodiaos && node src/services/telemetry/dispatchEventConsumer.js --once'],
  ['telemetry-perf-consumer',       'cd /home/tate/ecodiaos && node src/services/telemetry/perfEventConsumer.js --once'],
  ['observation-retention-cleanup', 'cd /home/tate/ecodiaos && node src/db/cron/observationRetention.js --once'],
  ['approval-queue-reconciler',     'cd /home/tate/ecodiaos && node src/db/cron/approvalQueueReconciler.js --once'],
])

// ─── Route 3: HIGH-priority forks (always run, never budget-gated) ──────────
// These are the watchdogs and ops loops. If they defer because of budget, the
// system loses its self-healing signal.
//
// Tate-comms doctrine (1 May 2026): any cron whose deliverable is an outbound
// signal to Tate (SMS, email-to-Tate, escalation alert) MUST be HIGH-priority.
// Silently skipping a comms cron during an autonomous window is exactly the
// failure that breaks the trust in autonomous-pilot - Tate has no ground-truth
// signal that the system is alive. Origin: `autonomous-window-evening-sms` and
// `claude-md-reflection` both silently skipped 1 May 2026 (budget=0 at 15:36
// AEST, evening crons silently no-op'd, conductor manually recovered at 20:19).
const HIGH_PRIORITY_FORK_CRONS = new Set([
  'email-triage',           // Tate's inbox hygiene - visible to him daily.
  'system-health',          // PM2/disk/memory/error-log probe.
  'morning-briefing',       // Daily 09:00 email to Tate.
  'silent-loop-detector',   // Watch the watchers - must not silently fail.
  'parallel-builder',       // Factory-orchestration cron (queued in design).
  'tate-blocked-nudge-weekly',  // Sunday SMS - the one signal that flatlined autonomy notices.
  'phase-G-adversarial-audit',  // Daily critic-fork (Layer 8 of decision-quality architecture).
  'autonomous-window-evening-sms',  // Daily SMS to Tate during autonomous window - mission-critical comms.
  'claude-md-reflection',   // Doctrine evolution cron - silent skip = no doctrine learning that day.
  'vercel-deploy-monitor',  // Failed-deploy alerts - silent skip = client-visible breakage missed.

  // ── Promoted from DIRECT_EXEC 4 May 2026 (Tate verbatim 19:30 AEST: "More ─
  //    those crong jobs to forks... NEVER to main chat"). All operational
  //    watchdogs/telemetry/maintenance loops that previously POSTed into the
  //    conductor's message queue. Each spawns an ephemeral fork via
  //    cronForkDispatcher; HIGH classification means budget bypass so the
  //    self-healing signals never silently skip. ──────────────────────────────
  // NOTE: telemetry-dispatch-consumer and telemetry-perf-consumer were moved
  //   to DIRECT_EXEC_CRONS on 12 May 2026 (fork_mp28xkeh_b611b0). Both are
  //   deterministic JSONL→Postgres rotation scripts with zero agentic decision
  //   component. Routing through the fork system caused credit-exhaustion
  //   floods every 15 minutes when all Max accounts were exhausted. Pattern:
  //   ~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md
  'decision-quality-classifier',   // every 1h - Phase D failure classifier.
  'telemetry-outcome-inference',   // every 30m - outcome inferrer.
  'os-forks-reaper',               // every 30m - auto-reconcile stuck forks (in-mem GC vs DB drift).
  'kg-consolidation',              // every 6h - knowledge-graph dedup pipeline.
  'kg-embedding',                  // every 4h - embed unembedded Neo4j nodes.
  'neo4j-keepalive',               // every 6h - Aura free-tier auto-pause prevention.
  'daily-telemetry',               // daily 23:00 - KPI snapshot insert.
  'coexist-sync-health',           // daily 09:00 - Forms↔App sync drift probe.
  'peer-monitor',                  // every 72h - peer-paradigm WebSearch scan.
  'cowork-fork-budget-reset',      // daily 10:00 - bootstraps the fork budget itself.
                                    //   HIGH membership is mandatory: budget reset must
                                    //   bypass the budget gate (otherwise zero-budget = no
                                    //   reset = stuck zero forever).
  'gkg-phase-2-pipeline',          // every 5m - GKG classifier + vision-enrich +
                                    //   embed + graph-upsert. HIGH because the GKG is the
                                    //   memory layer Anthropic computer-use will query;
                                    //   silent skip = stale graph = degraded replay.
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

  // Conductor and (deprecated) direct-exec always fire - they don't consume
  // the fork budget. direct_exec is empty by design as of 4 May 2026 but the
  // classifier still recognises the name; preserve the bypass so any future
  // entry behaves correctly.
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
  DIRECT_EXEC_COMMANDS,
  HIGH_PRIORITY_FORK_CRONS,
  LOW_PRIORITY_FORK_CRONS,
  BUDGET_TIER_NORMAL,
  BUDGET_TIER_EMERGENCY,
  DAILY_FORK_BUDGET_DEFAULT,
  classifyCron,
  budgetGateDecision,
}
