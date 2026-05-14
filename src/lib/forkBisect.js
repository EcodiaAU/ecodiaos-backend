'use strict'

/**
 * forkBisect — git-bisect over a range of commits with a test command.
 *
 * When a fork ships multiple commits and validation fails, this helper
 * narrows down which commit caused the break. Uses `git bisect run`, which
 * is a battle-tested binary search.
 *
 * Pre-condition: a clean working tree at a known-good commit (the "good"
 * end) and a known-bad commit (the "bad" end, typically HEAD of the fork
 * branch).
 *
 * The test command should return exit 0 on pass, non-zero on fail (the
 * standard git-bisect contract). Common shape: `npm test -- <pattern>` or
 * a custom node script that probes a specific invariant.
 *
 * Returns the first bad commit SHA, or null on inconclusive bisect.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13 — fork audit "no fork-bisection primitive
 * on test failure".
 */

const { execFile } = require('child_process')
const { promisify } = require('util')
const logger = require('../config/logger')

const execFileP = promisify(execFile)

async function _git(args, cwd, timeoutMs = 60_000) {
  try {
    const { stdout, stderr } = await execFileP('git', args, { cwd, timeout: timeoutMs })
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    return { ok: false, error: err.message, stderr: String(err.stderr || '').trim() }
  }
}

/**
 * Bisect a range using `git bisect run`. Returns { ok, firstBadSha, error? }.
 *
 * @param {object} params
 * @param {string} params.cwd                 — repo path (typically a fork worktree)
 * @param {string} params.goodSha             — known-good commit (older)
 * @param {string} params.badSha              — known-bad commit (newer, often HEAD)
 * @param {string} params.testCommand         — shell command for `git bisect run`
 * @param {number} [params.timeoutMs=600000]  — overall timeout (10min default)
 */
async function bisect({ cwd, goodSha, badSha, testCommand, timeoutMs = 10 * 60 * 1000 }) {
  if (!cwd || !goodSha || !badSha || !testCommand) {
    throw new Error('forkBisect.bisect: cwd, goodSha, badSha, testCommand required')
  }
  // Start a bisect session.
  const start = await _git(['bisect', 'start', badSha, goodSha], cwd, 30_000)
  if (!start.ok) return { ok: false, error: `bisect start failed: ${start.error}` }

  try {
    // `git bisect run` executes the command at each midpoint and uses its
    // exit code to navigate. Returns when range collapses.
    const run = await execFileP('git', ['bisect', 'run', 'bash', '-c', testCommand], {
      cwd,
      timeout: timeoutMs,
    }).catch(err => ({ stdout: '', stderr: String(err.stderr || err.message) }))
    const text = String(run.stdout || '') + '\n' + String(run.stderr || '')

    // Parse "<sha> is the first bad commit"
    const m = text.match(/([0-9a-f]{7,40})\s+is the first bad commit/)
    if (m) {
      logger.info('forkBisect: found first bad commit', { sha: m[1] })
      return { ok: true, firstBadSha: m[1], log: text.slice(-1000) }
    }
    return { ok: true, firstBadSha: null, log: text.slice(-1000) }
  } finally {
    await _git(['bisect', 'reset'], cwd, 30_000)
  }
}

/**
 * Verify a fork's claim by re-running its test command on a fresh worktree
 * at the fork's terminal commit. Independent verification — catches a fork
 * that lied about its tests passing.
 *
 * @param {object} params
 * @param {string} params.repoRoot     — main repo path
 * @param {string} params.commitSha    — commit the fork claims passes
 * @param {string} params.testCommand  — shell command, exit 0 = pass
 * @param {string} [params.worktreeDir] — explicit dir; defaults to /tmp/verify-<sha>
 * @param {number} [params.timeoutMs=300000] — 5 min default
 *
 * Returns { ok, verified, stdout, stderr, exitCode }
 */
async function verifyCommit({ repoRoot, commitSha, testCommand, worktreeDir, timeoutMs = 5 * 60 * 1000 }) {
  if (!repoRoot || !commitSha || !testCommand) {
    throw new Error('forkBisect.verifyCommit: repoRoot, commitSha, testCommand required')
  }
  const path = require('path')
  const wt = worktreeDir || path.join('/tmp', `verify-${commitSha.slice(0, 12)}`)

  // Create worktree at the target sha.
  const add = await _git(['worktree', 'add', '--detach', wt, commitSha], repoRoot, 60_000)
  if (!add.ok) return { ok: false, verified: false, error: `worktree add failed: ${add.error}` }

  try {
    const run = await execFileP('bash', ['-c', testCommand], { cwd: wt, timeout: timeoutMs })
      .then(r => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
      .catch(err => ({
        exitCode: typeof err.code === 'number' ? err.code : 1,
        stdout: String(err.stdout || ''),
        stderr: String(err.stderr || err.message),
      }))
    return {
      ok: true,
      verified: run.exitCode === 0,
      exitCode: run.exitCode,
      stdout: run.stdout.slice(-2000),
      stderr: run.stderr.slice(-2000),
    }
  } finally {
    await _git(['worktree', 'remove', '--force', wt], repoRoot, 60_000)
  }
}

module.exports = { bisect, verifyCommit }
