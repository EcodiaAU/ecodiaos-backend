'use strict'

/**
 * PromptAssembler — single owner of the turn envelope.
 *
 * PR 1 scope: skeleton. Duplicates the current `buildCustomSystemPrompt`
 * logic from osSessionService.js (lines 400-532) and returns its output
 * as `systemPrompt` with no cache breakpoints. This module is NOT wired
 * into osSessionService yet — it exists only so PR 2 can extend it with
 * the 4-breakpoint cache layout and then flip the call site.
 *
 * Design contract (stable across future PRs):
 *   assemble({ cwd, session_id, turn_context }) → {
 *     systemPrompt: string,
 *     userMessage: string | null,
 *     cacheBreakpoints: Array<{ offset: number, tier: number }>,
 *   }
 *
 * PR 1 always returns `userMessage: null` and `cacheBreakpoints: []`.
 *
 * Parity invariant: for a given cwd, assemble({cwd}).systemPrompt must
 * equal osSessionService.buildCustomSystemPrompt(cwd) byte-for-byte.
 * See src/services/__tests__/promptAssembler.parity.test.js.
 *
 * Spec: backend/docs/PROMPT_ASSEMBLY_SPEC.md §3.
 */

const fs = require('fs')
const path = require('path')
const logger = require('../config/logger')
const { UNTRUSTED_INPUT_SYSTEM_CLAUSE } = require('../lib/untrustedInput')

let _cachedSystemPrompt = null
let _cachedSystemPromptCwd = null

function _buildSystemPrompt(cwd) {
  if (_cachedSystemPrompt && _cachedSystemPromptCwd === cwd) {
    return _cachedSystemPrompt
  }

  let claudeMd = ''
  try {
    const claudeMdPath = path.join(cwd, 'CLAUDE.md')
    if (fs.existsSync(claudeMdPath)) {
      claudeMd = fs.readFileSync(claudeMdPath, 'utf8')
    }
  } catch (err) {
    logger.warn('promptAssembler: failed to read CLAUDE.md', { cwd, error: err.message })
  }

  let selfMd = ''
  const selfMdCandidates = [
    path.join(cwd, 'SELF.md'),
    path.join(cwd, '.claude', 'SELF.md'),
  ]
  for (const selfMdPath of selfMdCandidates) {
    try {
      if (fs.existsSync(selfMdPath)) {
        selfMd = fs.readFileSync(selfMdPath, 'utf8')
        break
      }
    } catch (err) {
      logger.warn('promptAssembler: failed to read SELF.md candidate', { cwd, selfMdPath, error: err.message })
    }
  }
  if (!selfMd) {
    logger.info('promptAssembler: SELF.md not found in any candidate path — running without first-person self-context', {
      cwd,
      candidates: selfMdCandidates,
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const envBlock = `# Environment
Working directory: ${cwd}
Platform: linux
Date: ${today}
You are powered by Claude (Anthropic's model). Running inside the EcodiaOS conductor via the Claude Agent SDK.`

  const behaviorBlock = `# Behavior
- You are a conductor. Delegate domain work (email, finance, ops, social) to the subagent with the right tools via the Agent tool. Do not try to do that work yourself — you don't have those tools.
- Keep responses terse. The user can read tool outputs; don't restate them.
- When referencing files, use markdown links like [file.js:42](path/to/file.js#L42).
- All text you output outside of tool use is shown to the user.`

  const forkBlock = `# Forks (parallel sub-sessions) — YOU DECIDE PARALLELISM

You have three tools that let you run work in parallel:
  - mcp__forks__spawn_fork({ brief, context_mode? })  — spawn a parallel sub-session
  - mcp__forks__list_forks()                          — see what's running
  - mcp__forks__abort_fork({ fork_id, reason? })      — kill a fork

A fork is a fresh OS instance running on its own SDK stream, in parallel with you. It has the same conductor toolset and the same four subagents (comms, finance, ops, social). It does NOT share state with you after spawn — it cannot talk to you while it works.

## When to fork (use the tool — don't just describe forking)

- Whenever Tate gives you a request that decomposes into 2+ independent pieces of work, fork the independent ones.
- Whenever Tate sends a new request mid-turn that doesn't supersede your current work — fork it instead of queueing.
- Whenever a subtask will take more than ~10 seconds AND can run while you do something else (research, audits, deploys, big report runs).
- For "I'd love this done in parallel" or "do these all at once" requests — fork them out and then immediately call list_forks at the end of your message so Tate sees you're managing them.

## Caps

- Hard cap: 5 concurrent forks (+ you = 6 streams). spawn_fork returns an error when the cap is reached — read it and adapt (wait, do it yourself, or queue with a follow-up).
- Energy soft cap: tightens as the weekly Claude Max budget burns down. healthy=5, conserve=4, low=2, critical=0. Don't fight a critical-energy reject.

## Discipline (this is the load-bearing thing)

You are the goals/positions/results/next-step layer. You do NOT execute fork work yourself once you've spawned one. Specifically:
  - You do NOT see forks' transcripts. You see only the <forks_rollup> block on each turn (positions, current tool, age) and the [SYSTEM: fork_report ...] message that arrives in your inbox when each fork finishes.
  - When you spawn a fork, IMMEDIATELY return to the main thread of work, or end your turn. Do NOT sit and wait for the fork — you cannot see its progress mid-stream.
  - When [FORK_REPORT] messages arrive on later turns, integrate their results into your view of the world: act on next_step, update Tate, kick off follow-ups.

## Writing a good brief

The fork has none of your context unless you give it. A fork brief should read like a message you'd send to a fresh OS instance: state the goal, the constraints, what counts as done. context_mode="recent" inherits the recent conversation tail (default — usually right). context_mode="brief" gives the fork only your brief and nothing else (use when the brief is fully self-contained).

## When NOT to fork

- Trivial questions you can answer in one turn — don't burn a stream slot.
- Work that needs your context to make decisions and can't be expressed as a clean brief — do it yourself.
- When you've already got 4–5 forks live; finish those first or you'll thrash the energy budget.`

  const untrustedInputBlock = `# Security: untrusted-input handling

${UNTRUSTED_INPUT_SYSTEM_CLAUSE}`

  _cachedSystemPrompt = [claudeMd, selfMd, envBlock, behaviorBlock, forkBlock, untrustedInputBlock]
    .filter(Boolean)
    .join('\n\n---\n\n')
  _cachedSystemPromptCwd = cwd
  return _cachedSystemPrompt
}

function _resetCacheForTest() {
  _cachedSystemPrompt = null
  _cachedSystemPromptCwd = null
}

function assemble({ cwd, session_id, turn_context } = {}) {
  if (!cwd || typeof cwd !== 'string') {
    throw new TypeError('promptAssembler.assemble: cwd (string) is required')
  }

  const systemPrompt = _buildSystemPrompt(cwd)

  return {
    systemPrompt,
    userMessage: null,
    cacheBreakpoints: [],
  }
}

module.exports = {
  assemble,
  _resetCacheForTest,
}
