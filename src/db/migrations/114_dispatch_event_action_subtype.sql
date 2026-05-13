-- 114_dispatch_event_action_subtype.sql
--
-- Phase G Critique 04: add action_subtype column to dispatch_event so
-- synthetic/test dispatches (SMOKE TEST, PONG, healthcheck, ping) can be
-- excluded from Layer 4 success_rate denominator.
--
-- Problem
-- -------
-- Layer 4 decision-quality dashboard success_rate is contaminated by synthetic
-- dispatches. These are forks/cron-fire events with brief text matching known
-- health-check or smoke-test patterns (e.g. "SMOKE TEST: foo", "PONG",
-- "healthcheck-cron", "ping"). Because synthetic dispatches always resolve to
-- outcome='success' (they are designed to pass), they inflate the success
-- numerator AND denominator without representing real conductor decisions.
-- Result: a structurally optimistic success_rate that masks genuine failure
-- signal in the real decision fleet.
--
-- Fix
-- ---
-- 1. Add TEXT column action_subtype. NULL = real conductor decision.
--    'synthetic_pass' = synthetic/test brief (classified by producer).
-- 2. Partial index on the non-null values for fast dashboard filtering.
-- 3. Backfill: classify existing rows whose metadata->>'brief_excerpt'
--    matches the synthetic regex patterns.
--
-- The producer (dispatchEventConsumer.js) is updated in a paired code change
-- to classify briefs at INSERT time and set action_subtype='synthetic_pass'
-- for matching patterns.
--
-- The Layer 4 summary() function in decisionQualityService.js is updated
-- in a paired code change to filter (action_subtype IS NULL OR
-- action_subtype != 'synthetic_pass') on dispatch_count and outcome_event
-- joined counts so success_rate excludes synthetics.
--
-- Origin: fork_mp3opd2q_d44cc8, Phase G critique-04, 13 May 2026.
-- See ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md

ALTER TABLE dispatch_event ADD COLUMN IF NOT EXISTS action_subtype TEXT;

-- Partial index: fast lookup of synthetic rows and fast exclusion filter.
CREATE INDEX IF NOT EXISTS dispatch_event_action_subtype_idx
  ON dispatch_event (action_subtype)
  WHERE action_subtype IS NOT NULL;

-- Backfill: classify existing synthetic rows.
-- Patterns (case-insensitive where noted):
--   'SMOKE TEST'  - any brief containing this string
--   '^PONG$'      - brief is exactly "PONG" (trimmed)
--   'healthcheck' - any brief containing this substring
--   '^ping$'      - brief is exactly "ping" (trimmed)
--
-- Uses metadata->>'brief_excerpt' as the brief content field, which is
-- populated by the hook layer for fork_spawn and cron_fork_spawn events.
-- Non-fork events (db_execute, write, etc.) have no brief_excerpt and will
-- correctly remain NULL.
UPDATE dispatch_event
SET action_subtype = 'synthetic_pass'
WHERE action_subtype IS NULL
  AND (
    metadata->>'brief_excerpt' ~* 'SMOKE TEST'
    OR (metadata->>'brief_excerpt' IS NOT NULL AND TRIM(metadata->>'brief_excerpt') ~* '^PONG$')
    OR metadata->>'brief_excerpt' ~* 'healthcheck'
    OR (metadata->>'brief_excerpt' IS NOT NULL AND TRIM(metadata->>'brief_excerpt') ~* '^ping$')
  );
