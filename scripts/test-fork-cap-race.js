#!/usr/bin/env node
'use strict'

/**
 * test-fork-cap-race.js - load test for fork-cap atomicity (TOCTOU race fix).
 *
 * Authored 2026-05-01 by fork_momlilgp_34d36f under Wave 1 Fork D brief.
 *
 * Tests forkCapAtomic.tryReserveForkSlot() under N concurrent invocations.
 * The atomic primitive uses pg_advisory_xact_lock + conditional INSERT in
 * a single CTE, so concurrent callers must be serialised through the lock
 * with at most (hard_cap - live_count_before_test) successes.
 *
 * Usage:
 *   node scripts/test-fork-cap-race.js [concurrency=50]
 *
 * Methodology:
 *   1. Read live_count baseline.
 *   2. Start sampler (polls active count every 100ms for 30s).
 *   3. Fire N concurrent tryReserveForkSlot calls with hard_cap=5.
 *      Each uses unique fork_id prefixed 'test_capload_' so cleanup is safe.
 *   4. Wait for all settled. Count successes vs fork_cap_reached.
 *   5. Stop sampler.
 *   6. DELETE FROM os_forks WHERE fork_id LIKE 'test_capload_%'.
 *   7. Report results.
 *
 * Pass criterion:
 * - Sampler observes NO active count > 5 across the run.
 * - Successes = max(0, hard_cap - baseline_live).
 * - All other invocations reject with fork_cap_reached.
 * - Cleanup leaves DB at baseline.
 */

const path = require('path')

// Load env from .env if present (for DATABASE_URL)
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }) } catch (_) {}

const db = require('../src/config/db')
const { tryReserveForkSlot, liveForkCount } = require('../src/lib/forkCapAtomic')

const HARD_CAP = 5
const CONCURRENCY = parseInt(process.argv[2] || '50', 10)
const SAMPLE_INTERVAL_MS = 100
const SAMPLE_DURATION_MS = 30_000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function newTestForkId(i) {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `test_capload_${ts}_${String(i).padStart(3, '0')}_${rand}`
}

async function main() {
  console.log(`[test-fork-cap-race] concurrency=${CONCURRENCY} hard_cap=${HARD_CAP}`)

  const baseline = await liveForkCount()
  console.log(`[baseline] live count = ${baseline}/${HARD_CAP}`)

  // Sampler - runs concurrently with the test.
  const samples = []
  let samplerStop = false
  const sampler = (async () => {
    const t0 = Date.now()
    while (!samplerStop && (Date.now() - t0) < SAMPLE_DURATION_MS) {
      try {
        const n = await liveForkCount()
        samples.push({ t: Date.now(), n })
      } catch (e) {
        samples.push({ t: Date.now(), err: e.message })
      }
      await sleep(SAMPLE_INTERVAL_MS)
    }
  })()

  // Fire CONCURRENCY parallel reservations.
  console.log(`[fire] ${CONCURRENCY} concurrent tryReserveForkSlot calls`)
  const t0 = Date.now()
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) => {
      const fork_id = newTestForkId(i)
      return tryReserveForkSlot({
        fork_id,
        brief: `TEST fork-cap-race ${fork_id} - DELETE ME`,
        context_mode: 'brief',
        parent_id: 'test_capload',
        hard_cap: HARD_CAP,
      }).then(row => ({ fork_id, ok: true, row }))
        .catch(err => ({ fork_id, ok: false, code: err.code, msg: err.message }))
    })
  )
  const fireDuration = Date.now() - t0
  console.log(`[fire] settled in ${fireDuration}ms`)

  // Sampler may run a bit longer to catch any lagging cap-violations,
  // but for a sub-second fire we have enough samples. Stop now.
  samplerStop = true
  await sampler

  // Tally.
  const successes = results.filter(r => r.status === 'fulfilled' && r.value.ok)
  const capRejects = results.filter(r => r.status === 'fulfilled' && !r.value.ok && r.value.code === 'fork_cap_reached')
  // Pool-exhaustion errors (XX000 / EMAXCONNSESSION) are orthogonal-substrate noise from pgbouncer session-mode pool_size=15 contested by sibling forks/api-server. They occur BEFORE the atomic primitive runs and are not cap-atomicity failures.
  const poolExhaustion = results.filter(r => r.status === 'fulfilled' && !r.value.ok && r.value.code !== 'fork_cap_reached' && (r.value.msg || '').includes('EMAXCONNSESSION'))
  const otherFails = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok && r.value.code !== 'fork_cap_reached' && !(r.value.msg || '').includes('EMAXCONNSESSION')))

  const expectedSuccesses = Math.max(0, HARD_CAP - baseline)
  const sampledMax = samples.reduce((m, s) => Math.max(m, s.n || 0), 0)
  const violationSamples = samples.filter(s => (s.n || 0) > HARD_CAP)

  console.log('')
  console.log(`[results] ${CONCURRENCY} concurrent calls, ${fireDuration}ms`)
  console.log(`  successes:        ${successes.length} (expected ${expectedSuccesses})`)
  console.log(`  cap_rejects:      ${capRejects.length}`)
  console.log(`  pool_exhaustion:  ${poolExhaustion.length} (orthogonal - pgbouncer pool ceiling)`)
  console.log(`  other_fails:      ${otherFails.length}`)
  console.log(`  samples taken:    ${samples.length}`)
  console.log(`  sampled_max:      ${sampledMax}/${HARD_CAP}`)
  console.log(`  violations:       ${violationSamples.length} samples > cap`)

  if (otherFails.length > 0) {
    console.log('')
    console.log('[other_fails detail]')
    otherFails.slice(0, 5).forEach(f => {
      const v = f.value || f.reason
      console.log('  ', JSON.stringify(v).slice(0, 200))
    })
  }

  if (violationSamples.length > 0) {
    console.log('')
    console.log('[violation samples]')
    violationSamples.forEach(s => console.log(`  t=${s.t} n=${s.n}`))
  }

  // Cleanup - delete all rows we created.
  const cleanupRows = await db`
    DELETE FROM os_forks
    WHERE fork_id LIKE 'test_capload_%'
    RETURNING fork_id
  `
  console.log('')
  console.log(`[cleanup] deleted ${cleanupRows.length} test rows`)

  const post = await liveForkCount()
  console.log(`[post-cleanup] live count = ${post}/${HARD_CAP}`)

  // Verdict.
  const correctSuccessCount = successes.length === expectedSuccesses
  const noViolation = violationSamples.length === 0 && sampledMax <= HARD_CAP
  const noOtherFails = otherFails.length === 0
  const cleanupClean = post === baseline

  // Total settled accounts for everyone who didn't error pathologically.
  const accounted = successes.length + capRejects.length + poolExhaustion.length + otherFails.length
  const allAccounted = accounted === CONCURRENCY

  // Cap-atomicity verdict: pool exhaustion is orthogonal substrate, not a cap fail.
  // PASS criterion (per brief): zero cap-violations across the run.
  const pass = correctSuccessCount && noViolation && noOtherFails && cleanupClean && allAccounted
  console.log('')
  console.log(`[verdict] ${pass ? 'PASS' : 'FAIL'}`)
  console.log(`  correct_success_count: ${correctSuccessCount} (got ${successes.length}, expected ${expectedSuccesses})`)
  console.log(`  no_violation:          ${noViolation} (max=${sampledMax})`)
  console.log(`  no_other_fails:        ${noOtherFails} (n=${otherFails.length})`)
  console.log(`  cleanup_clean:         ${cleanupClean} (post=${post}, baseline=${baseline})`)
  console.log(`  all_accounted:         ${allAccounted} (${accounted}/${CONCURRENCY})`)

  // Emit JSON result for downstream parsing.
  console.log('')
  console.log('[json]')
  console.log(JSON.stringify({
    concurrency: CONCURRENCY,
    hard_cap: HARD_CAP,
    baseline,
    successes: successes.length,
    expected_successes: expectedSuccesses,
    cap_rejects: capRejects.length,
    pool_exhaustion: poolExhaustion.length,
    other_fails: otherFails.length,
    samples_taken: samples.length,
    sampled_max: sampledMax,
    violation_samples: violationSamples.length,
    fire_duration_ms: fireDuration,
    cleanup_deleted: cleanupRows.length,
    post_cleanup: post,
    pass,
  }, null, 2))

  process.exit(pass ? 0 : 1)
}

main().catch(err => {
  console.error('[fatal]', err)
  process.exit(2)
}).finally(() => {
  // db connection is a postgres.js singleton; allow open handles to exit.
  setTimeout(() => process.exit(0), 500).unref()
})
