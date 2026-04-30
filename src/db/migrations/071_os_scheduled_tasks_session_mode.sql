-- 071: os_scheduled_tasks.session_mode — orthogonal session-substrate dimension
--
-- Phase 1 of the pyramid-architecture refactor (fork_mol4qpm9_7421ca,
-- 30 Apr 2026). PR #28 routed all fork-eligible crons through
-- cronForkDispatcher with a HARDCODED `context_mode: 'brief'`. That was
-- coincidentally correct for most mechanical crons but wrong for the few
-- (email-triage, meta-loop) that genuinely need the conductor's recent
-- conversation tail.
--
-- This column adds session_mode as a first-class per-cron dimension so
-- each cron explicitly opts into one of:
--
--   direct_exec        — pure shell call (no Claude session)
--   brief_fork         — spawn_fork with context_mode='brief'
--   inherit_fork       — spawn_fork with context_mode='recent' (~25k tail)
--   conductor_inline   — handle on conductor main, no fork
--   factory_cc_session — start_cc_session, manual dispatch only
--
-- session_mode is ORTHOGONAL to the priority tier (HIGH/LOW fork). A
-- HIGH_PRIORITY_FORK can be brief_fork OR inherit_fork; a LOW_PRIORITY_FORK
-- can be brief_fork too. Don't conflate.
--
-- Default: 'inherit_fork' for any unknown cron. Conservative — preserves
-- pre-session_mode behavior (forkService.spawnFork's default is 'recent').
--
-- Source of truth: src/config/cronSessionMode.js. The migration's UPDATEs
-- below mirror that file's classification of the active cron set as of
-- 30 Apr 2026. New crons added later will get session_mode='inherit_fork'
-- via the column default until explicitly classified in cronSessionMode.js.
--
-- Spec: ~/ecodiaos/drafts/pyramid-architecture-sketch-2026-04-30-evening.md.

ALTER TABLE os_scheduled_tasks
  ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'inherit_fork';

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_session_mode_idx
  ON os_scheduled_tasks(session_mode);

COMMENT ON COLUMN os_scheduled_tasks.session_mode IS
  'Per-cron substrate selection (orthogonal to priority tier). Values: direct_exec | brief_fork | inherit_fork | conductor_inline | factory_cc_session. Source of truth: src/config/cronSessionMode.js. Default inherit_fork (preserves pre-session_mode behavior).';

-- ─── direct_exec: shell-exec dispatch, no Claude session needed ────────────
UPDATE os_scheduled_tasks
SET session_mode = 'direct_exec'
WHERE type = 'cron'
  AND name IN (
    'telemetry-dispatch-consumer',
    'decision-quality-classifier',
    'os-forks-reaper',
    'telemetry-outcome-inference',
    'kg-consolidation',
    'kg-embedding',
    'neo4j-keepalive',
    'daily-telemetry',
    'coexist-sync-health',
    'peer-monitor',
    'cowork-fork-budget-reset'
  );

-- ─── brief_fork: cold-start adequate, no conductor context needed ──────────
UPDATE os_scheduled_tasks
SET session_mode = 'brief_fork'
WHERE type = 'cron'
  AND name IN (
    -- Watchdog / ops
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

    -- Intelligence + growth
    'deep-research',
    'strategic-thinking',
    'inner-life',

    -- Operations
    'weekly-financial-review',
    'claude-md-reflection',

    -- Doctrine / KG maintenance
    'daily-codification-scan',
    'daily-index-regen',
    'weekly-doctrine-synthesis',

    -- Reconciliation / drift
    'status-board-reconciliation',
    'external-blocker-freshness-probe',
    'decision-quality-drift-check'
  );

-- ─── inherit_fork: needs conductor's recent conversation tail ──────────────
UPDATE os_scheduled_tasks
SET session_mode = 'inherit_fork'
WHERE type = 'cron'
  AND name IN (
    'email-triage',
    'meta-loop'
  );
