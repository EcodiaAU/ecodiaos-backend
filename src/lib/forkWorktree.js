'use strict'

/**
 * forkWorktree — per-fork git worktree isolation.
 *
 * Closes the shared-cwd race documented in FORK_ATOMICITY_SPEC §3 and surfaced
 * by AUTONOMY_AUDIT_2026-05-13 (fork audit, CRITICAL). Before this lands, every
 * fork ran with cwd = '/home/tate/ecodiaos' and concurrent `git add` / `git
 * checkout` / `git pull` between two forks corrupted `.git/index` and `.git/HEAD`.
 *
 * Worktree layout:
 *
 *   $WORKTREE_ROOT/<fork_id>           ← isolated working tree
 *   .git/worktrees/<fork_id>           ← git's metadata for it (inside main repo)
 *
 * Each worktree is bound to a fresh branch `fork/<fork_id>` based on main HEAD
 * at spawn time. The worktree directory is removed on fork termination via
 * `git worktree remove --force`, which both cleans the on-disk dir AND prunes
 * the metadata pointer.
 *
 * Feature flag: FORK_WORKTREE_ISOLATION=true activates the new path. When unset
 * or false, callers fall through to the shared cwd (legacy behaviour). This is
 * intentional — landing the code without flipping the flag means we can
 * canary on staging before enabling in prod. Flip the env var on
 * ecosystem.config.js for ecodia-conductor (where forks now run since Phase 3
 * activation 2026-05-12) and pm2 reload.
 *
 * The helper is fail-safe: if `git worktree add` fails (disk full, repo lock,
 * not a git repo), we log a warn and return null. Caller should fall back to
 * the shared cwd on null so spawn does not break.
 *
 * Cron forks bypass worktree isolation by default — they tend to do read-only
 * work and the worktree-add latency (~150ms) outweighs the safety win.
 */

const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')
const env = require('../config/env')
const logger = require('../config/logger')

const execFileP = promisify(execFile)

const REPO_ROOT = env.OS_SESSION_CWD || '/home/tate/ecodiaos'
const WORKTREE_ROOT = process.env.FORK_WORKTREE_ROOT || '/home/tate/fork_worktrees'

function isEnabled({ is_cron = false } = {}) {
  if (process.env.FORK_WORKTREE_ISOLATION !== 'true') return false
  // Cron forks skip worktree isolation by default unless explicitly opted in.
  if (is_cron && process.env.FORK_WORKTREE_ISOLATION_CRON !== 'true') return false
  return true
}

async function _git(args, cwd) {
  try {
    const { stdout } = await execFileP('git', args, { cwd, timeout: 30_000 })
    return { ok: true, stdout: stdout.trim() }
  } catch (err) {
    return { ok: false, error: err.message, stderr: String(err.stderr || '').trim() }
  }
}

/**
 * Create an isolated worktree for the given fork_id.
 * @returns {Promise<string|null>} absolute path to the new worktree, or null on failure.
 */
async function createWorktree(fork_id) {
  if (!fork_id) return null
  try {
    if (!fs.existsSync(WORKTREE_ROOT)) {
      fs.mkdirSync(WORKTREE_ROOT, { recursive: true })
    }
  } catch (err) {
    logger.warn('forkWorktree: failed to create WORKTREE_ROOT, falling back', {
      WORKTREE_ROOT, error: err.message,
    })
    return null
  }

  const wt = path.join(WORKTREE_ROOT, fork_id)
  const branch = `fork/${fork_id}`

  // If for any reason the worktree dir already exists (interrupted previous
  // fork with the same id — extremely rare given the ulid suffix), nuke it
  // first so the create succeeds.
  if (fs.existsSync(wt)) {
    await _git(['worktree', 'remove', '--force', wt], REPO_ROOT)
  }

  const result = await _git(
    ['worktree', 'add', '-b', branch, wt, 'HEAD'],
    REPO_ROOT,
  )
  if (!result.ok) {
    logger.warn('forkWorktree: `git worktree add` failed, falling back to shared cwd', {
      fork_id, error: result.error, stderr: result.stderr,
    })
    return null
  }
  logger.info('forkWorktree: created isolated worktree', { fork_id, path: wt, branch })
  return wt
}

/**
 * Remove the worktree on fork termination. Safe to call multiple times.
 * Does NOT delete the fork/<fork_id> branch — that may carry shipped commits
 * the conductor wants to inspect; cleanup of stale branches is a separate cron.
 */
async function removeWorktree(fork_id, worktreePath) {
  if (!worktreePath) return
  const result = await _git(['worktree', 'remove', '--force', worktreePath], REPO_ROOT)
  if (!result.ok) {
    logger.warn('forkWorktree: removeWorktree failed (non-fatal)', {
      fork_id, worktreePath, error: result.error, stderr: result.stderr,
    })
    // Belt-and-braces: prune any dangling metadata even if the directory is gone.
    await _git(['worktree', 'prune'], REPO_ROOT)
  } else {
    logger.info('forkWorktree: worktree removed', { fork_id, path: worktreePath })
  }
}

module.exports = {
  isEnabled,
  createWorktree,
  removeWorktree,
  REPO_ROOT,
  WORKTREE_ROOT,
}
