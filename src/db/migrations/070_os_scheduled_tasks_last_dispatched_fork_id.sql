-- 070: os_scheduled_tasks.last_dispatched_fork_id for fork-route telemetry
--
-- Decision 3993 commit 3/3 — cron refactor to forks-as-primitive
-- (fork_mol0wkdk_917c40, 30 Apr 2026). When `cronForkDispatcher` spawns a
-- fork to handle a cron's intent, it stamps the resulting fork_id back here
-- so post-mortem reconciliation can trace cron → fork without grep'ing logs.
--
-- Spec reference: ~/CLAUDE.md "Decision 3993 forks-as-primitive bootstrap" +
-- Strategic_Direction 3986. Doctrine: ~/ecodiaos/patterns/scheduled-prompt-
-- cold-start-adequacy.md.
--
-- Backward compatibility: column is nullable. Pre-existing cron rows have
-- NULL last_dispatched_fork_id until their next fire under the new
-- routing path. The dispatcher tolerates a missing column (column-missing
-- branch in cronForkDispatcher._stampForkIdOnCron) so deploys can land
-- before this migration runs.

ALTER TABLE os_scheduled_tasks
  ADD COLUMN IF NOT EXISTS last_dispatched_fork_id TEXT;

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_last_dispatched_fork_id_idx
  ON os_scheduled_tasks(last_dispatched_fork_id)
  WHERE last_dispatched_fork_id IS NOT NULL;

COMMENT ON COLUMN os_scheduled_tasks.last_dispatched_fork_id IS
  'When cronForkDispatcher routes a cron via forks-as-primitive (Decision 3993), the fork_id of the spawned fork is stamped here. NULL means either the cron has never fired under fork-routing, or it stayed on the conductor / direct-exec path. See src/config/cronPriority.js for routing rules.';
