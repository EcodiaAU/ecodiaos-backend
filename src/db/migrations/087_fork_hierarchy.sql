-- 087: Fork hierarchy — root_fork_id column for per-tree cap tracking
--
-- The fork hierarchy design (Tate 2026-05-05) adds a manager/worker tree:
--   Conductor (main) → Manager fork → Worker fork(s)
-- Reports from workers go to their parent manager; conductor only sees manager
-- summaries. Per-tree cap = 5 forks per tree root (not a global raise).
--
-- Only one new column needed:
--   root_fork_id  — the tree root (= fork_id for root forks, = root of parent
--                   for sub-forks). Used by forkCapAtomic per-tree count query.
--
-- The existing parent_id column (migration 062, default 'main') already tracks
-- the direct parent. root_fork_id is derived at spawn time by the service layer.

ALTER TABLE os_forks ADD COLUMN IF NOT EXISTS root_fork_id TEXT;

-- Back-fill: existing rows are all root-level (parent_id = 'main'), so root = self.
UPDATE os_forks SET root_fork_id = fork_id WHERE root_fork_id IS NULL;

-- Index for per-tree cap count (WHERE root_fork_id = $1 AND status IN (...)).
CREATE INDEX IF NOT EXISTS os_forks_root_idx ON os_forks (root_fork_id)
  WHERE status IN ('spawning', 'running', 'reporting');

COMMENT ON COLUMN os_forks.root_fork_id IS
  'Tree root fork_id. Equals fork_id for conductor-spawned forks; equals the root of the spawning fork for sub-forks. Used for per-tree concurrency cap (max 5 active per tree root).';
