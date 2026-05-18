-- 129: recurring-billing-monthly cron registration in os_scheduled_tasks.
--
-- Origin: backend/patterns/cron-must-be-registered-not-just-documented-2026-05-18.md
-- audit surfaced `recurring-billing-monthly` as documented in
-- src/services/billingScheduleEngine.js:12 and clients/coexist.md:132 but
-- absent from every cron substrate. Co-Exist INV-2026-004 was sitting on a
-- manual-fire status_board row because the doc claim was treated as
-- substrate and the substrate did not exist.
--
-- This migration is the registration. The runner lives at
-- backend/scripts/cron/recurring-billing-monthly.js. The runner is internally
-- safe to call multiple times per day per schedule (sequence advance via
-- kv_store.cowork.billing.next_invoice_seq + same-UTC-day dedupe on
-- client_billing_generations), so even an over-eager poller does not
-- double-generate.
--
-- Cron expression `0 9 * * *` = 09:00 UTC daily. AEST conversion is handled
-- inside the schedulerPollerService; we encode the wall-clock cron the way
-- os_scheduled_tasks expects (UTC, matching the rest of the existing rows).
-- The schedule itself filters internally on next_due_date so a daily fire is
-- cheaper than seeding per-schedule rows.
--
-- Doctrine cross-refs:
--   ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md
--   ~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md
--   ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md

-- Idempotent: re-running this migration upgrades the row in place rather
-- than duplicating. Uses (name, type='cron') as the natural key.

-- 2026-05-18 SCHEMA DRIFT FIX: live DB os_scheduled_tasks has columns
-- (id, type, name, prompt text, cron_expression, run_at, chain_after,
--  status, last_run_at, next_run_at, run_count, max_runs, result,
--  last_dispatched_fork_id, session_mode, created_at, updated_at, last_deferred_at).
-- NO 'priority' column. NO 'payload' jsonb column. Prompt is a plain text
-- field. Migration was authored against the migration-057 schema but the
-- live table diverged. This corrects to the live shape - name is unique so
-- ON CONFLICT (name) is safe.

-- The row already exists in the live DB from a 7 May 2026 fork-era insert,
-- but its prompt dispatched a fork (dead substrate post local-first migration).
-- This migration rewrites the prompt to invoke the new deterministic runner
-- directly. No unique constraint on (name) in the live DB, so use UPDATE,
-- fall back to INSERT if missing.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM os_scheduled_tasks WHERE name = 'recurring-billing-monthly') THEN
    UPDATE os_scheduled_tasks
       SET cron_expression = '0 9 * * *',
           prompt = 'Run node backend/scripts/cron/recurring-billing-monthly.js and surface generated invoices. Drafts land in backend/drafts/invoices/<INV-NUM>-<slug>.md and trigger a P2 status_board task per generation. Never auto-send to client. Doctrine: backend/patterns/cron-must-be-registered-not-just-documented-2026-05-18.md + no-client-contact-without-tate-goahead.md.',
           status = 'active',
           type = 'cron',
           updated_at = now()
     WHERE name = 'recurring-billing-monthly';
  ELSE
    INSERT INTO os_scheduled_tasks (name, type, status, cron_expression, prompt)
    VALUES (
      'recurring-billing-monthly',
      'cron',
      'active',
      '0 9 * * *',
      'Run node backend/scripts/cron/recurring-billing-monthly.js and surface generated invoices. Drafts land in backend/drafts/invoices/<INV-NUM>-<slug>.md and trigger a P2 status_board task per generation. Never auto-send to client. Doctrine: backend/patterns/cron-must-be-registered-not-just-documented-2026-05-18.md + no-client-contact-without-tate-goahead.md.'
    );
  END IF;
END $$;
