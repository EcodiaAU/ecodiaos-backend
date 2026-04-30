'use strict'

/**
 * PromptAssembler — single owner of the turn envelope.
 *
 * docs/PROMPT_ASSEMBLY_SPEC.md §3, §4.
 *
 * PR 2 scope: 4-breakpoint cache layout. The assembler emits v2 output as
 * a structured content-block array with Anthropic-native cache_control
 * markers so the prompt cache keys on four stable prefixes instead of one.
 *
 *   BP1 (most stable)   — CLAUDE.md + SELF.md
 *   BP2 (hourly stable) — env + behavior + fork + untrusted-input
 *   BP3 (per-session)   — doctrineSurface shim (replaced by Skills in PR 4)
 *   BP4 (per-turn)      — relevant_memory + forks_rollup + recent_exchanges
 *
 * Stability order matters for the Anthropic cache. The cache matches on
 * the longest prefix up to and including a cache_control marker; if blocks
 * are emitted out of stability order, BP2's cache_control invalidates BP1
 * on the next change to any BP2 content, collapsing cache hit rate. The
 * order BP1 → BP2 → BP3 → BP4 is load-bearing; asserted in tests.
 *
 * Design contract:
 *   assemble({ cwd, session_id, turn_context }) → {
 *     systemPrompt: string,           // v1-equivalent concatenation (BP1+BP2)
 *     userMessage: string | null,     // v1-equivalent concatenation of turn blocks
 *     contentBlocks: Array<{          // v2 structured form for canary/full
 *       tier: 1|2|3|4,
 *       text: string,
 *       cache_control: { type: 'ephemeral' },
 *     }>,
 *     cacheBreakpoints: Array<{ tier, offset }>,  // offset into assembled text
 *   }
 *
 * Shadow-mode invariant (enforced by tests + live audit writer):
 *   contentBlocks.map(b => b.text).join('') === systemPrompt + userMessage
 *
 * i.e. flattening the 4-block structure reproduces the v1 string byte-for-byte
 * for the stable-prefix portion (BP1+BP2 = systemPrompt) and the per-turn
 * portion (BP3+BP4 = userMessage concatenation). If a divergence appears in
 * the audit sink, either the assembler's duplication drifted from the live
 * path or a block shrunk unexpectedly — both are blockers for canary flip.
 *
 * PR 4 replaces the BP3 doctrineSurface shim with skillsSurfaceService behind
 * USE_SKILLS_SURFACE=1. PR 6 drops recent_exchanges from BP4 per §5.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const logger = require('../config/logger')
const { UNTRUSTED_INPUT_SYSTEM_CLAUSE } = require('../lib/untrustedInput')

// ─── BP1 + BP2 — stable system-prompt halves ──────────────────────────────────
// PR 2 duplication of osSessionService.buildCustomSystemPrompt, split at the
// CLAUDE+SELF / env+behavior+fork+untrusted boundary. PR 6 flips
// PROMPT_ASSEMBLY_V2 to full and deletes the duplicate.

let _cachedBp1 = null
let _cachedBp1Cwd = null

function _buildBp1(cwd) {
  if (_cachedBp1 && _cachedBp1Cwd === cwd) return _cachedBp1

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

  _cachedBp1 = [claudeMd, selfMd].filter(Boolean).join('\n\n---\n\n')
  _cachedBp1Cwd = cwd
  return _cachedBp1
}

function _buildBp2(cwd) {
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

  return [envBlock, behaviorBlock, forkBlock, untrustedInputBlock].join('\n\n---\n\n')
}

// ─── BP3 — per-session doctrine surface ──────────────────────────────────────
// PR 2: shim to doctrineSurface. Replaced by skillsSurfaceService in PR 4
// under USE_SKILLS_SURFACE=1. Do not populate if the caller didn't supply
// turn_context.user_content — BP3 is a function of the current turn's text.

function _buildBp3(turn_context) {
  const userContent = (turn_context && turn_context.user_content) || null
  if (!userContent) return ''

  // USE_SKILLS_SURFACE switches BP3 between the legacy doctrineSurface and
  // skillsSurfaceService (description-driven retrieval over
  // .claude/skills/*/SKILL.md). Default is '1' post-PR6 — Skills is the
  // primary path. '0' kept as emergency fallback during the first 48h
  // of production observation; removed entirely in the follow-up PR that
  // deletes doctrineSurface.js.
  let env
  try { env = require('../config/env') } catch { env = {} }
  const useSkills = env.USE_SKILLS_SURFACE !== '0'

  if (useSkills) {
    try {
      const skillsSurface = require('./skillsSurfaceService')
      return skillsSurface.surfaceSkillsBlock(userContent) || ''
    } catch (err) {
      logger.debug('promptAssembler: skillsSurface failed, falling through to doctrine', { error: err.message })
    }
  }

  // Legacy doctrineSurface path. Kept only so USE_SKILLS_SURFACE='0' has
  // somewhere to go. Removed in the doctrineSurface.js deletion PR once
  // schedulerPollerService is also migrated to Skills.
  try {
    const doctrineSurface = require('./doctrineSurface')
    const block = doctrineSurface.surfaceDoctrineBlock(userContent)
    return typeof block === 'string' ? block : ''
  } catch (err) {
    logger.debug('promptAssembler: doctrineSurface fallback failed, BP3 empty', { error: err.message })
    return ''
  }
}

// ─── BP4 — per-turn dynamic blocks ───────────────────────────────────────────
// TODO(post-flip): drop recent_exchanges per PROMPT_ASSEMBLY §5 — the SDK
// already replays session history when session_id is passed, so tailing it
// again is pure duplication. Left as passthrough in PR 2 to keep shadow
// semantic_equivalent=true; deletion is a separate PR after PR 6 flip.

function _buildBp4(turn_context) {
  if (!turn_context) return ''
  const parts = []
  const {
    now,
    forks_rollup,
    recent_doctrine,
    relevant_memory,
    restart_recovery,
    recent_exchanges,
    last_turn_breadcrumb,
  } = turn_context

  // Order mirrors osSessionService.js:1762-1781 splice order after reconstruction:
  //   <now>, <doctrine_surface>, <forks_rollup>, <recent_doctrine>, <relevant_memory>, <restart_recovery>, <recent_exchanges|breadcrumb>
  // BP3 (doctrine_surface) is separate, not in BP4; everything else lands here.
  if (now) parts.push(`<now>${now}</now>`)
  if (forks_rollup) parts.push(forks_rollup)
  if (recent_doctrine) parts.push(recent_doctrine)
  if (relevant_memory) parts.push(relevant_memory)
  if (restart_recovery) parts.push(`<restart_recovery>\n${restart_recovery}\n</restart_recovery>`)
  if (recent_exchanges) {
    parts.push(`<recent_exchanges>\nBelow is the tail of the conversation before this session restarted. Pick up naturally — do NOT summarise or acknowledge the gap. Just continue as if nothing happened.\n\n${recent_exchanges}\n</recent_exchanges>`)
  } else if (last_turn_breadcrumb) {
    parts.push(`<last_turn_breadcrumb>\n${last_turn_breadcrumb}\n</last_turn_breadcrumb>`)
  }
  return parts.join('\n\n')
}

// ─── Deterministic canary bucketing ──────────────────────────────────────────
// sha256(session_id)[0] < threshold. 51/256 ≈ 19.9% ≈ 20%.
// Stable across process restarts: same session_id always lands in the same
// bucket for its lifetime. Not Math.random — mid-session prompt-shape swaps
// would corrupt the SDK's prompt cache and turn continuity.

const CANARY_THRESHOLD = 51  // 51/256 = 0.1992, just under 20%

function isInCanaryBucket(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false
  const firstByte = crypto.createHash('sha256').update(sessionId).digest()[0]
  return firstByte < CANARY_THRESHOLD
}

// ─── Mode resolution ─────────────────────────────────────────────────────────
// Returns the effective path (v1|v2) and whether the audit writer should log
// this turn. PR 2 ships all three modes infra-complete; spec §7 gates the
// flip from shadow→canary→full on 48h of clean audit rows.

function resolveMode(modeEnv, sessionId) {
  const mode = (modeEnv || 'off').toLowerCase()
  if (mode === 'off') return { mode: 'off', path: 'v1', audit: false }
  if (mode === 'shadow') return { mode: 'shadow', path: 'v1', audit: true }
  if (mode === 'canary') {
    const v2 = isInCanaryBucket(sessionId)
    return { mode: 'canary', path: v2 ? 'v2' : 'v1', audit: true }
  }
  logger.warn('promptAssembler: unknown PROMPT_ASSEMBLY_V2 value, defaulting to off', { modeEnv })
  return { mode: 'off', path: 'v1', audit: false }
}

// ─── Main assemble() ────────────────────────────────────────────────────────

function assemble({ cwd, session_id, turn_context } = {}) {
  if (!cwd || typeof cwd !== 'string') {
    throw new TypeError('promptAssembler.assemble: cwd (string) is required')
  }

  const bp1Text = _buildBp1(cwd)
  const bp2Text = _buildBp2(cwd)
  const bp3Text = _buildBp3(turn_context)
  const bp4Text = _buildBp4(turn_context)

  // v1-equivalent string forms. systemPrompt reproduces the current
  // buildCustomSystemPrompt output (BP1 + BP2 with the same `---` separator).
  // userMessage reproduces the current user-message continuity-parts stitch
  // (BP3 + BP4 joined by `\n\n`).
  const systemPrompt = [bp1Text, bp2Text].filter(Boolean).join('\n\n---\n\n')
  const userParts = [bp3Text, bp4Text].filter(Boolean)
  const userMessage = userParts.length > 0 ? userParts.join('\n\n') : null

  // v2 structured form. Only non-empty tiers get a cache_control marker —
  // emitting empty blocks would waste cache slots (Anthropic allows 4 total).
  // Blocks contain RAW content without inter-block separators. Semantic
  // equivalence against v1 is verified at two granularities in the audit:
  //   - BP1+BP2 joined by '\n\n---\n\n' must equal v1 customSystemPrompt
  //   - BP3+BP4 joined by '\n\n' must equal v1 continuityParts.join('\n\n')
  // See promptAssemblyAudit.buildAuditRow for the exact comparison logic.
  const contentBlocks = []
  const pushBlock = (tier, text) => {
    if (!text) return
    contentBlocks.push({
      tier,
      text,
      cache_control: { type: 'ephemeral' },
    })
  }
  pushBlock(1, bp1Text)
  pushBlock(2, bp2Text)
  pushBlock(3, bp3Text)
  pushBlock(4, bp4Text)

  // cacheBreakpoints records the cumulative offset (in characters) of each
  // tier in the concatenated text — useful for /api/ops telemetry and for
  // PR 5's keepalive worker (which must send the BP1+BP2 prefix exactly).
  const cacheBreakpoints = []
  let offset = 0
  for (const block of contentBlocks) {
    offset += block.text.length
    cacheBreakpoints.push({ tier: block.tier, offset })
  }

  return {
    systemPrompt,
    userMessage,
    contentBlocks,
    cacheBreakpoints,
  }
}

// ─── Semantic-equivalence check ──────────────────────────────────────────────
// Used by the audit writer (and compareV1V2 script) to prove v2's structured
// output reproduces v1's string output byte-for-byte. Returns null on parity,
// or an integer byte index of first divergence otherwise.

function firstDivergenceIndex(a, b) {
  if (a === b) return null
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return i
  }
  return minLen  // one is a prefix of the other
}

// ─── Test hooks ──────────────────────────────────────────────────────────────

function _resetCacheForTest() {
  _cachedBp1 = null
  _cachedBp1Cwd = null
}

module.exports = {
  assemble,
  isInCanaryBucket,
  resolveMode,
  firstDivergenceIndex,
  CANARY_THRESHOLD,
  _resetCacheForTest,
}
