/**
 * Cron Session Mode — orthogonal session-substrate dimension
 *
 * The priority classifier (cronPriority.js) decides budget+route:
 *   conductor / direct_exec / high_priority_fork / low_priority_fork.
 *
 * The session-mode classifier (this file) decides the SUBSTRATE the cron's
 * intent runs on. Tier and session_mode are orthogonal — a HIGH_PRIORITY_FORK
 * can be brief_fork OR inherit_fork; a LOW_PRIORITY_FORK can be brief_fork
 * too. Don't conflate them.
 *
 * The motivating problem: PR #28 routed all fork-eligible crons through
 * cronForkDispatcher with a HARDCODED `context_mode: 'brief'`. That was
 * coincidentally correct for most mechanical crons but wrong for the few
 * that genuinely need the conductor's recent conversation tail (email-triage
 * needs to know which threads are live; meta-loop needs the judgment-loop
 * context). Conversely, every cron NOT in DIRECT_EXEC was unnecessarily
 * inheriting ~25k tokens of context from the conductor's recent tail.
 *
 * Tate refinement, 30 Apr 2026 16:45 AEST: introduce session_mode as a
 * first-class dimension so each cron explicitly opts into the substrate
 * that matches its intent.
 *
 * Five session modes:
 *
 *   direct_exec        — pure shell call (`node script.js --once`); no
 *                        Claude session at all. Maps 1:1 to the existing
 *                        DIRECT_EXEC_CRONS list — those crons POST a tiny
 *                        shell-exec dispatch to /api/os-session/message
 *                        which the conductor immediately runs as a shell
 *                        command without burning model context.
 *
 *   brief_fork         — spawn_fork with context_mode='brief'. Cold-start,
 *                        zero conductor-context inheritance. Default for
 *                        mechanical/repetitive crons whose brief is
 *                        cold-start adequate (they re-orient via
 *                        status_board / kv_store / Neo4j as needed).
 *
 *   inherit_fork       — spawn_fork with context_mode='recent'. Inherits
 *                        the conductor's last-N message tail (~25k tokens).
 *                        Reserved for crons that genuinely need recent
 *                        conversation context (email-triage knows which
 *                        threads are live; meta-loop is the judgment
 *                        loop). Use sparingly — every inherit_fork
 *                        spawn costs ~25k tokens of context.
 *
 *   conductor_inline   — handle on conductor main, no fork. Returned as a
 *                        sentinel by the dispatcher. Reserved for the
 *                        small set of crons that MUST run on the conductor
 *                        (judgment loop). Currently only meta-loop, and
 *                        it's also priority='conductor', so the dispatcher
 *                        never even reaches the session_mode branch for it
 *                        — but the explicit classification documents
 *                        intent.
 *
 *   factory_cc_session — start_cc_session for long implementation work.
 *                        Manual dispatch only. The dispatcher never
 *                        auto-routes here; if a cron is classified
 *                        factory_cc_session, the dispatcher logs a warning
 *                        and skips. Tate or the conductor must dispatch
 *                        these by hand.
 *
 * Default fallback for unknown cron names: 'inherit_fork' (conservative —
 * matches pre-session_mode behavior of forkService.spawnFork's default).
 *
 * Spec: ~/ecodiaos/drafts/pyramid-architecture-sketch-2026-04-30-evening.md
 *
 * Origin: fork_mol4qpm9_7421ca, 30 Apr 2026.
 */
'use strict'

// All five session modes. Used for validation in the dispatcher and tests.
const SESSION_MODES = Object.freeze([
  'direct_exec',
  'brief_fork',
  'inherit_fork',
  'conductor_inline',
  'factory_cc_session',
])

// ─── direct_exec ────────────────────────────────────────────────────────────
// Crons whose prompt is a tiny shell-exec dispatch. No Claude session needed.
// Mirrors the DIRECT_EXEC_CRONS list in cronPriority.js — the priority and
// session-mode dimensions agree on these by construction (a shell-only cron
// has no Claude-substrate dimension to vary).
const DIRECT_EXEC_CRONS = new Set([
  'telemetry-dispatch-consumer',
  'decision-quality-classifier',   // failure-classifier-tick equivalent
  'os-forks-reaper',               // fork-reaper equivalent
  'telemetry-outcome-inference',
  'kg-consolidation',
  'kg-embedding',
  'neo4j-keepalive',
  'daily-telemetry',
  'coexist-sync-health',
  'peer-monitor',
  'cowork-fork-budget-reset',
])

// ─── brief_fork ─────────────────────────────────────────────────────────────
// Cold-start adequate fork-eligible crons. Their prompt is self-contained
// (most start with "You are EcodiaOS in fork form, no prior context") and
// they re-orient via status_board / kv_store / Neo4j as needed. This is the
// 25k-token-saving substrate for mechanical workers.
const BRIEF_FORK_CRONS = new Set([
  // Watchdog / ops
  'cowork-account-revert-probe',
  'silent-loop-detector',
  'vercel-deploy-monitor',
  'system-health',
  'morning-briefing',
  'tate-blocked-nudge-weekly',
  'phase-G-adversarial-audit',
  'ambient-os-cleanup-coordinator',
  'tate-night-update',
  'weekly-mum-text',

  // Intelligence + growth (all cold-start adequate; their prompts spell
  // out the topic to research / reflect on).
  'deep-research',
  'strategic-thinking',
  'inner-life',

  // Operations (longer cadence, cold-start safe).
  'weekly-financial-review',
  'claude-md-reflection',

  // Doctrine / KG maintenance.
  'daily-codification-scan',
  'daily-index-regen',
  'weekly-doctrine-synthesis',

  // Reconciliation / drift.
  'status-board-reconciliation',
  'external-blocker-freshness-probe',
  'decision-quality-drift-check',
])

// ─── inherit_fork ───────────────────────────────────────────────────────────
// Crons that genuinely need the conductor's recent conversation tail.
// Use sparingly — each spawn costs ~25k tokens of context inheritance.
const INHERIT_FORK_CRONS = new Set([
  'email-triage',  // needs to know which threads / clients are currently live
  'meta-loop',     // judgment loop; usually priority='conductor' so dispatcher
                   // skips; explicit here so if priority ever changes to fork,
                   // session_mode is preserved.
])

// ─── conductor_inline ───────────────────────────────────────────────────────
// Crons that must run on the conductor main session (no fork at all). The
// dispatcher returns a sentinel; the caller keeps these on the existing
// /api/os-session/message path. Currently empty — meta-loop is in
// inherit_fork above (and priority='conductor' which already short-circuits
// the dispatcher), but the set exists as a first-class concept.
const CONDUCTOR_INLINE_CRONS = new Set([
  // Reserved for future explicit conductor-only crons.
])

// ─── factory_cc_session ─────────────────────────────────────────────────────
// Long implementation work that warrants a Factory CLI session. The
// dispatcher never auto-routes here; manual dispatch only. Currently empty
// — listed for completeness of the session-mode dimension.
const FACTORY_CC_SESSION_CRONS = new Set([
  // Reserved for future manually-dispatched factory_cc_session crons.
])

const DEFAULT_SESSION_MODE = 'inherit_fork'

/**
 * Classify a cron name into a session mode.
 *
 * @param {string} name - cron name from os_scheduled_tasks
 * @returns {'direct_exec'|'brief_fork'|'inherit_fork'|'conductor_inline'|'factory_cc_session'}
 *   Defaults to 'inherit_fork' for unknown names (conservative — preserves
 *   pre-session_mode behavior of forkService.spawnFork's default).
 */
function getCronSessionMode(name) {
  if (DIRECT_EXEC_CRONS.has(name)) return 'direct_exec'
  if (BRIEF_FORK_CRONS.has(name)) return 'brief_fork'
  if (INHERIT_FORK_CRONS.has(name)) return 'inherit_fork'
  if (CONDUCTOR_INLINE_CRONS.has(name)) return 'conductor_inline'
  if (FACTORY_CC_SESSION_CRONS.has(name)) return 'factory_cc_session'
  return DEFAULT_SESSION_MODE
}

/**
 * Map a session mode to the forkService context_mode value.
 * Only valid for fork-spawn modes (brief_fork / inherit_fork). Returns
 * null for non-fork session modes — caller must short-circuit before
 * calling spawnFork.
 *
 * @param {string} sessionMode
 * @returns {'brief'|'recent'|null}
 */
function sessionModeToContextMode(sessionMode) {
  if (sessionMode === 'brief_fork') return 'brief'
  if (sessionMode === 'inherit_fork') return 'recent'
  return null
}

/**
 * Build a name->session_mode map for telemetry and tests.
 * @returns {Object<string,string>}
 */
function allClassifications() {
  const out = {}
  for (const n of DIRECT_EXEC_CRONS) out[n] = 'direct_exec'
  for (const n of BRIEF_FORK_CRONS) out[n] = 'brief_fork'
  for (const n of INHERIT_FORK_CRONS) out[n] = 'inherit_fork'
  for (const n of CONDUCTOR_INLINE_CRONS) out[n] = 'conductor_inline'
  for (const n of FACTORY_CC_SESSION_CRONS) out[n] = 'factory_cc_session'
  return out
}

module.exports = {
  SESSION_MODES,
  DIRECT_EXEC_CRONS,
  BRIEF_FORK_CRONS,
  INHERIT_FORK_CRONS,
  CONDUCTOR_INLINE_CRONS,
  FACTORY_CC_SESSION_CRONS,
  DEFAULT_SESSION_MODE,
  getCronSessionMode,
  sessionModeToContextMode,
  allClassifications,
}
