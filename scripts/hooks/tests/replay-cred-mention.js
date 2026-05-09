#!/usr/bin/env node
'use strict'

/**
 * replay-cred-mention.js
 *
 * Replays the cred-mention-surface.sh hook against the last N fork briefs
 * stored in os_forks (and optionally factory cc_sessions) to project the
 * post-fix silent-rate. Compares against the Phase C 7d telemetry baseline
 * to estimate whether the trigger narrowing has driven the silent-rate
 * below the <50% target.
 *
 * Usage:
 *   node ~/ecodiaos/scripts/hooks/tests/replay-cred-mention.js [N]
 *
 * N defaults to 50 (last 50 fork briefs).
 *
 * Output (stdout):
 *   - Per-brief: brief_id, fired (yes/no), surfaces_emitted (csv of paths)
 *   - Summary: total_briefs, total_fires, fires_per_brief, silent-rate
 *     PROJECTION (assuming ~6% real [APPLIED] rate observed historically).
 *
 * Doctrine: ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md.
 *           ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *           Layer 3 (Phase C Gap 4 close, 9 May 2026).
 *
 * Origin: status_board P3 commitment "cred-mention-surface.sh + macro-
 *   discovery hook still bare-noun matching". Phase C 7d silent-rate at
 *   90-100% on top vendor-noun cred files; replay verifies post-fix drop.
 */

const path = require('path')
const { spawnSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const HOOK_PATH = path.join(REPO_ROOT, 'scripts', 'hooks', 'cred-mention-surface.sh')

const N = parseInt(process.argv[2] || '50', 10)

// Load Supabase creds from env / kv_store fallback. Reuse the project's
// existing connection pattern.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[replay] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env. Source ecosystem.config.js or load via dotenv.')
  process.exit(2)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function runHook(brief) {
  const payload = JSON.stringify({
    tool_name: 'mcp__forks__spawn_fork',
    tool_input: { brief },
  })
  const result = spawnSync('bash', [HOOK_PATH], {
    input: payload,
    encoding: 'utf8',
    timeout: 5000,
  })
  const stderr = result.stderr || ''
  const stdout = result.stdout || ''
  const fired = /\[CRED-SURFACE WARN\]/.test(stderr) || /\[CRED-SURFACE WARN\]/.test(stdout)
  // Extract surfaces from warn lines (each warn cites a primary path in its
  // `Read: <file>.md` clause). For projection we count fire-vs-no-fire per
  // brief, not the per-surface count.
  const surfaceMatches = []
  const re = /Read[: ]+([a-z0-9_.-]+\.md)/g
  let m
  while ((m = re.exec(stderr)) !== null) surfaceMatches.push(m[1])
  while ((m = re.exec(stdout)) !== null) surfaceMatches.push(m[1])
  return { fired, surfaces: [...new Set(surfaceMatches)] }
}

;(async () => {
  // Pull the last N fork briefs. Order by started_at DESC. Filter null briefs.
  const { data, error } = await supabase
    .from('os_forks')
    .select('fork_id, brief, started_at')
    .not('brief', 'is', null)
    .order('started_at', { ascending: false })
    .limit(N)
  if (error) {
    console.error('[replay] os_forks query error:', error.message)
    process.exit(3)
  }
  if (!data || data.length === 0) {
    console.error('[replay] No fork briefs returned. Empty corpus.')
    process.exit(0)
  }

  console.log(`[replay] Replaying cred-mention-surface.sh against ${data.length} fork briefs...`)
  console.log()

  let totalFires = 0
  let totalSurfaces = 0
  const surfaceBreakdown = {}
  const perBrief = []

  for (const row of data) {
    const briefStr = typeof row.brief === 'string' ? row.brief : JSON.stringify(row.brief)
    const { fired, surfaces } = runHook(briefStr)
    if (fired) totalFires += 1
    totalSurfaces += surfaces.length
    for (const s of surfaces) {
      surfaceBreakdown[s] = (surfaceBreakdown[s] || 0) + 1
    }
    perBrief.push({ fork_id: row.fork_id, fired, surfaces })
  }

  // Print per-brief summary (tabular).
  console.log('per-brief replay results:')
  console.log('  fork_id                          fired  surfaces')
  for (const b of perBrief) {
    const fid = (b.fork_id || '').padEnd(32)
    const f = b.fired ? 'YES  ' : 'no   '
    const s = b.surfaces.join(',') || '-'
    console.log(`  ${fid} ${f}  ${s}`)
  }
  console.log()

  // Aggregate.
  const fireRate = (totalFires / data.length) * 100
  const surfacesPerBrief = totalSurfaces / data.length
  console.log('aggregate:')
  console.log(`  briefs replayed      : ${data.length}`)
  console.log(`  briefs that fired    : ${totalFires} (${fireRate.toFixed(1)}%)`)
  console.log(`  surfaces emitted     : ${totalSurfaces} (${surfacesPerBrief.toFixed(2)} per brief)`)
  console.log()
  console.log('surface breakdown:')
  const sorted = Object.entries(surfaceBreakdown).sort(([, a], [, b]) => b - a)
  for (const [s, n] of sorted) {
    console.log(`  ${s.padEnd(32)} ${n}`)
  }
  console.log()

  // Silent-rate projection. Phase C historical [APPLIED] rate for cred
  // surfaces was ~6% (i.e. 94% silent). Assuming the fix preserves all
  // genuine [APPLIED] cases AND eliminates only false-positive fires, the
  // post-fix silent-rate scales with surfaces_emitted: fewer surfaces ->
  // same numerator (real applies) over smaller denominator -> lower
  // silent-rate. Pre-fix surfaces_per_7d = ~423 across 10 vendor files.
  // For projection only.
  console.log('silent-rate projection vs Phase C 7d baseline:')
  console.log('  pre-fix total wasted surfaces (7d): ~423 across 10 vendor files')
  console.log('  pre-fix silent-rate range          : 90-100% on offending files')
  console.log(`  post-fix surfaces / brief          : ${surfacesPerBrief.toFixed(2)}`)
  console.log(`  post-fix surfaces / 50 briefs      : ${totalSurfaces}`)
  console.log()
  console.log('[replay] Done.')

  // Exit 0 on success regardless. The replay is informational, not a gate.
  process.exit(0)
})()
