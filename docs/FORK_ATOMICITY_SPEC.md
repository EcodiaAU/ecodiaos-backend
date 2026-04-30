# Fork Atomicity & Worktree Isolation Spec
## Fixing the 7/5 Violation Properly — 2026-04-30

**Status:** Supersedes Phase 3.1 in `IMMEDIATE_RECOVERY_CHECKLIST.md`.
**Context:** The checklist's proposed fix ("add `SELECT COUNT(*)` gate") is **still TOCTOU**. This spec documents the real fix, verified against current code.

---

## 1. WHAT'S ACTUALLY BROKEN

### 1.1 The race (verified, not speculated)

[forkService.js:362-412](../src/services/forkService.js#L362-L412) is a classic check-then-act:

```javascript
// line 362
const active = _activeCount()
// line 363
if (active >= HARD_FORK_CAP) {
  throw Object.assign(new Error('fork_cap_reached'), { ... })
}
// lines 364–411: several awaits, DB queries, event emissions…
// line 412
_forks.set(fork_id, state)
// line 415 (fire-and-forget)
_dbInsert(state)
```

Two concurrent `spawnFork()` calls initiated by the same conductor turn:
- Both read `_activeCount() === 4`.
- Both pass the `>= 5` check.
- Both reach `_forks.set()`.
- Result: 6 live forks. Observed in production: **7/5** (tool-use batches can emit 3 parallel spawns).

JavaScript's single-threaded event loop does not save you here. The awaits between lines 362 and 412 are the race window.

### 1.2 DB as source of truth is stale

`_activeCount()` at [forkService.js:187-193](../src/services/forkService.js#L187-L193) reads the in-memory `_forks` Map. The DB table `os_forks` is written fire-and-forget at [line 146-161](../src/services/forkService.js#L146-L161) with errors swallowed. If the DB insert fails, the cap count is wrong but no one knows.

### 1.3 No worktree isolation

Every fork runs with `cwd = env.OS_SESSION_CWD || '/home/tate/ecodiaos'` ([forkService.js:380](../src/services/forkService.js#L380)). Two concurrent forks:
- Both do `git pull` → race on ref updates.
- Both do `git commit` → interleaved staging.
- Both do `git push` → one gets rejected non-fast-forward, and the one who "wins" may contain the other's uncommitted changes.

The pattern file `authorised-branch-push-is-not-client-contact.md` does not prevent this. It's a doctrine-level guard against a physics-level problem.

### 1.4 Eviction race (60s linger)

[forkService.js:674](../src/services/forkService.js#L674) — completed forks linger in `_forks` for 60 seconds before deletion. During that window they still count toward the cap. If the process dies during the window, `recoverStaleForks()` ([forkService.js:787-844](../src/services/forkService.js#L787-L844)) only inspects non-terminal DB rows and never clears the in-memory slot. Leaked slot, invisible to recovery.

---

## 2. THE ATOMIC CAP FIX

Postgres handles this natively. Replace the check-then-act with a conditional insert that **atomically enforces the cap within a single transaction**.

### 2.1 Schema addition

```sql
-- Add a partial unique index / constraint that enforces the cap at insert time.
-- The cleanest approach: gate the INSERT on a subquery.

-- Required index for performance (fast count of live forks)
CREATE INDEX IF NOT EXISTS os_forks_live_status_idx
  ON os_forks (status)
  WHERE status IN ('spawning','running','reporting');
```

### 2.2 Atomic spawn

Replace the cap check in [forkService.js spawnFork()](../src/services/forkService.js) with:

```sql
WITH live_count AS (
  SELECT COUNT(*) AS n
  FROM os_forks
  WHERE status IN ('spawning','running','reporting')
),
attempted AS (
  INSERT INTO os_forks (fork_id, brief, status, spawned_at, ...)
  SELECT $1, $2, 'spawning', now(), ...
  FROM live_count
  WHERE live_count.n < $3        -- $3 = HARD_FORK_CAP (5)
  RETURNING fork_id
)
SELECT fork_id FROM attempted;
```

If the returned rowset is empty, the cap was reached. No race. Postgres serializes concurrent INSERT statements on the same predicate via row-level locking on the subquery's scan.

**Then** populate `_forks` Map from the DB row. Memory is now a cache of DB state, not the source of truth.

### 2.3 Concurrent-insert correctness

Postgres READ COMMITTED (the default) is sufficient if we use advisory locks to serialize the count:

```javascript
async function spawnFork(params) {
  return await db.transaction(async (tx) => {
    // advisory lock for the "fork_cap" domain
    await tx`SELECT pg_advisory_xact_lock(hashtext('fork_cap'))`

    const [{ n }] = await tx`
      SELECT COUNT(*)::int AS n
      FROM os_forks
      WHERE status IN ('spawning','running','reporting')
    `

    if (n >= HARD_FORK_CAP) {
      const err = new Error('fork_cap_reached')
      err.httpStatus = 429
      err.code = 'fork_cap_reached'
      throw err
    }

    const [row] = await tx`
      INSERT INTO os_forks (fork_id, brief, status, spawned_at, context_mode, parent_session_id, depth)
      VALUES (${params.fork_id}, ${params.brief}, 'spawning', now(),
              ${params.context_mode}, ${params.parent_session_id}, ${params.depth})
      RETURNING *
    `
    return row
  })
}
```

The advisory xact lock serializes all spawn attempts. Contention is trivial at this scale (max ~5 concurrent spawns per second). The lock is released automatically at transaction commit/rollback.

The in-memory `_forks.set()` happens **after** the transaction commits, not inside it. Memory reflects DB, never the other way around.

### 2.4 Energy-aware cap stays as a separate check

The energy-based cap (`eCap` in [line 371](../src/services/forkService.js#L371)) runs *inside* the transaction too, against the same lock. It's the *minimum* of `HARD_FORK_CAP` and the energy cap.

---

## 3. WORKTREE ISOLATION

### 3.1 Per-fork worktrees

Every fork gets its own git worktree. No shared cwd.

```javascript
// At spawn, after cap check passes:
const worktreePath = `/home/tate/fork_worktrees/${fork_id}`
const worktreeBranch = `fork/${fork_id}`

await execa('git', ['worktree', 'add', '-b', worktreeBranch, worktreePath, 'main'], {
  cwd: '/home/tate/ecodiaos',
})

state.worktree_path = worktreePath
state.worktree_branch = worktreeBranch
```

Fork process gets `cwd: worktreePath`. Fork operates on an isolated filesystem view, its own branch.

### 3.2 Merge back on success

On fork completion, the conductor (not the fork itself) merges the fork's branch into `main`:

```javascript
// In forkFinalizer.finalize() on success path:
if (state.worktree_branch && state.committed_changes) {
  await execa('git', ['fetch', 'origin', state.worktree_branch], { cwd: mainCwd })
  await execa('git', ['merge', '--ff-only', state.worktree_branch], { cwd: mainCwd })
  // If merge fails (not fast-forward), log incident, don't auto-resolve.
}
```

Non-fast-forward = two forks touched overlapping files. Flag as a pattern-mineable event ("forks X and Y both edited `/services/foo.js`"). Do not auto-merge — the parent conductor decides.

### 3.3 Cleanup

Transactional cleanup in `forkFinalizer`:

```javascript
await execa('git', ['worktree', 'remove', '--force', worktreePath], { cwd: mainCwd })
await execa('git', ['branch', '-D', worktreeBranch], { cwd: mainCwd }).catch(() => {
  // branch already deleted if merged; ignore
})
```

Add a sweeper cron: any `fork_worktrees/*` directory whose fork_id is not in `_forks` and whose mtime is >1 hour old gets force-removed.

### 3.4 Disk budget

Each worktree is ~200MB (node_modules not copied; git reuses objects via the main repo's `.git`). 5 concurrent forks = 1GB. VPS has headroom.

**Do not use `git worktree add --no-checkout`** — the fork needs working files to edit.

---

## 4. SPLIT-BRAIN BETWEEN VPS AND CORAZON

Two brains, one task queue, no arbitration. Fix with Postgres advisory session locks keyed on task_id.

### 4.1 Lease acquisition

```javascript
// taskLease.js (new service)
async function acquireTaskLease(task_id, brain_id /* 'vps-conductor' | 'corazon-agent' */, ttl_sec = 120) {
  const key = hashTaskId(task_id)  // bigint from sha256(task_id)[0:8]
  const got = await db`SELECT pg_try_advisory_lock(${key}) AS got`
  if (!got[0].got) return null

  // Record who holds it and when it expires.
  await db`
    INSERT INTO task_leases (task_id, brain_id, acquired_at, expires_at, lock_key)
    VALUES (${task_id}, ${brain_id}, now(), now() + interval '${ttl_sec} seconds', ${key})
    ON CONFLICT (task_id) DO UPDATE
      SET brain_id = EXCLUDED.brain_id,
          acquired_at = EXCLUDED.acquired_at,
          expires_at = EXCLUDED.expires_at
  `
  return { key, ttl_sec }
}

async function releaseTaskLease({ key }) {
  await db`SELECT pg_advisory_unlock(${key})`
}
```

### 4.2 Heartbeat to extend lease

Long-running tasks must refresh the lease every `ttl_sec/2`. Missed refresh = lease expires = other brain can take over.

### 4.3 Usage sites

Any action initiated by either brain that could be duplicated (email send, git push, status board write, Canva autofill, etc.) takes a lease first:

```javascript
const lease = await acquireTaskLease(task.id, 'vps-conductor')
if (!lease) {
  // Corazon holds it. Back off.
  return { skipped: true, reason: 'lease_held_elsewhere' }
}
try {
  await doTheThing(task)
} finally {
  await releaseTaskLease(lease)
}
```

### 4.4 Where to wire it

- `handsBridge.js` — every delegation to the laptop agent.
- `osSessionService.js` — every outbound MCP tool call that causes a side effect.
- `peerMonitor.js` — refactor to use leases, not just observation.

---

## 5. LIFECYCLE FIXES

### 5.1 Terminal status clears cap slot immediately

Current: 60-second linger in `_forks` Map before deletion ([forkService.js:674](../src/services/forkService.js#L674)).

Problem: a crashed-but-terminal fork holds a cap slot in memory.

Fix: under the atomic model (§2), the cap count comes from the DB, not memory. Memory is cosmetic (frontend UI). Drop the 60s linger for cap purposes; keep it only for UI-poll cushion, and add a separate `ui_cache` Map that doesn't participate in `_activeCount()`.

### 5.2 Recovery reconciles memory against DB

On boot:

```javascript
// forkService.js recoverStaleForks (enhanced)
const liveInDb = await db`
  SELECT * FROM os_forks
  WHERE status IN ('spawning','running','reporting')
`

const now = Date.now()
for (const row of liveInDb) {
  const hb = row.last_heartbeat_at?.getTime() ?? 0
  if (now - hb > 2 * 60 * 1000) {
    // Stale. Mark crashed.
    await db`
      UPDATE os_forks
      SET status = 'crashed', ended_at = now(),
          abort_reason = 'recovered_stale_on_boot'
      WHERE fork_id = ${row.fork_id}
    `
    await cleanupWorktree(row.fork_id)
    // Enqueue a [SYSTEM: fork_crashed] message for the parent session.
    await mq.enqueueMessage({
      body: `[SYSTEM: fork_crashed ${row.fork_id}] Brief: ${row.brief.slice(0,200)}`,
      source: `system:fork_recovery`,
      mode: 'queue',
    })
  } else {
    // Still fresh — process may have been restarted but fork was quiesced legitimately (e.g., PM2 reload).
    // Reattach: populate _forks Map from row, but do NOT re-spawn SDK stream.
    // Instead, mark for conductor attention.
    _forks.set(row.fork_id, hydrateFromDbRow(row))
  }
}
```

### 5.3 No more fire-and-forget DB writes in the spawn path

Every `_dbInsert`, `_dbUpdate` call in the spawn/terminate path **awaits** the DB result. Errors in those paths are fatal for the spawn (rolls back). Only transient event emissions (status pings) may remain fire-and-forget.

---

## 6. RETRY AMPLIFICATION

### 6.1 Current risk

cronForkDispatcher ([cronForkDispatcher.js:249-277](../src/services/cronForkDispatcher.js#L249-L277)) optimistically decrements budget, spawns, refunds on failure. If the cron re-queues on failure and the brief implies parallelism, you can get: 1 cron → 3 forks → each fails → next cron fires → 3 more forks → …

### 6.2 Fix

- **Exponential backoff with jitter per cron task.** First failure: retry after 5 min. Second: 30 min. Third: 2 hr. Fourth: 1 day. Fifth: page Tate.
- **Parent-task budget**: each top-level goal gets an aggregate fork budget that spans its entire fork-chain (children, grandchildren). Stored in `goals.fork_budget_remaining`. Every spawn attributable to that goal decrements. At 0, new spawns are rejected with `parent_budget_exhausted`.
- **Ancestry tag**: every `os_forks` row carries `root_goal_id`. Budget check in §2.3's transaction includes a second SELECT against the root goal's remaining budget.

---

## 7. TEST PLAN

### 7.1 Cap enforcement
- Fire 10 concurrent `spawnFork()` calls with `HARD_FORK_CAP=5`. Assert exactly 5 succeed and 5 receive `fork_cap_reached`. Repeat 1000× in CI.

### 7.2 Worktree isolation
- Spawn two forks. Each writes different content to `backend/test_marker.txt` concurrently. Assert no git conflict, each sees its own worktree content, and merge-back completes cleanly for both (different file paths) or produces a detectable conflict for same-file edits.

### 7.3 Split-brain
- From VPS-conductor test harness and Corazon-agent test harness, race to acquire lease on `task_id='test_race_1'`. Assert exactly one succeeds; the other receives `null`.

### 7.4 Recovery
- Kill `ecodia-conductor` mid-fork (`pm2 kill`). Restart. Assert:
  - Fork marked `crashed` in DB within 3s of boot.
  - Worktree cleaned up.
  - `[SYSTEM: fork_crashed]` message in queue for parent session.
  - No leaked disk (check `fork_worktrees/` has no stale dirs).

---

## 8. MIGRATION

### 8.1 Backward compatibility

`os_forks` schema gains three columns: `worktree_path`, `worktree_branch`, `root_goal_id`. All nullable to start. Deploy DB migration first, code change second.

### 8.2 Rollout

1. Deploy migration (nullable columns). Zero behavior change.
2. Deploy new spawn transaction (atomic cap). Old `_activeCount()` becomes a cache check only; real cap enforced in DB.
3. Monitor `fork_cap_reached` 429 rate vs baseline for 3 days. Should be ≥0 and not skyrocket (would indicate the cap check is stricter than before).
4. Deploy worktree isolation. Enable via env flag `FORK_WORKTREES=1` for a day, observe, then make default.
5. Deploy split-brain leases (flag `TASK_LEASES=1`), observe, default.
6. Retire old in-memory-first cap check.

### 8.3 Rollback

Each step has an independent flag. Revert by flipping the flag; no DB changes to reverse.

---

## 9. WHAT THIS SPEC DOES NOT ADDRESS

- **Fork CPU/memory limits.** Worktrees isolate filesystem, not compute. A runaway fork can still starve siblings on the same VPS. Accepted for now; revisit at Stage 3 (Autonomous Partner).
- **Cross-VPS fork distribution.** All forks run on the single VPS. Scaling beyond that is post-suburb-level concern.
- **Factory session concurrency.** This spec is about `forkService`. Factory sessions have their own pool ([factoryOversightService.js](../src/services/factoryOversightService.js)) that may have similar races. Separate audit needed.

---

**Document status:** v1 authored 2026-04-30 replacing Phase 3.1 of IMMEDIATE_RECOVERY_CHECKLIST.
**Blocker for:** Track A (token economy fixes are amplified by the fork-crash loop), all parallel-fork work in Track B/C.
**Next review:** After ships, measure cap-violation rate. Expectation: 0 violations. Observed baseline: ~20% of high-load sessions.
