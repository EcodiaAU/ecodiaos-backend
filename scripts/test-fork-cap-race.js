'use strict'

/**
 * Concurrent-spawn smoke test for the forkService atomic cap swap.
 *
 * DO NOT RUN AGAINST PRODUCTION. Spawns 10 real forks via forkService.spawnFork
 * and asserts the live-count never exceeds HARD_FORK_CAP. Intended to run on a
 * fresh staging API after the §6 forkService atomic cap swap is deployed.
 *
 * Usage:
 *   node scripts/test-fork-cap-race.js
 *
 * Exit code:
 *   0 — cap held under concurrent load
 *   1 — cap violated (live count > HARD_FORK_CAP)
 */

const forkService = require('../src/services/forkService')
const { liveForkCount } = require('../src/lib/forkCapAtomic')

const HARD_CAP = forkService.HARD_FORK_CAP || 3
const ATTEMPTS = parseInt(process.env.FORK_RACE_ATTEMPTS || '10', 10)

async function main() {
  const startBefore = await liveForkCount()
  console.log(`pre-test live count: ${startBefore} (hard cap: ${HARD_CAP})`)

  if (startBefore >= HARD_CAP) {
    console.error(`REFUSE: live count already at cap; abort stale forks first.`)
    process.exit(1)
  }

  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      forkService.spawnFork({ brief: `race-test-${i}-${Date.now()}`, context_mode: 'brief' })
    )
  )

  const ok = results.filter(r => r.status === 'fulfilled').length
  const rejected = results.filter(r => r.status === 'rejected').length
  const capReached = results.filter(
    r => r.status === 'rejected' &&
         (r.reason?.code === 'fork_cap_reached' ||
          r.reason?.code === 'fork_energy_cap_reached')
  ).length
  const other = rejected - capReached

  const liveAfter = await liveForkCount()
  console.log(`attempts=${ATTEMPTS} ok=${ok} rejected=${rejected} cap_hit=${capReached} other=${other}`)
  console.log(`live count after all settled: ${liveAfter}`)

  let exitCode = 0
  if (liveAfter > HARD_CAP) {
    console.error(`FAIL: live count ${liveAfter} exceeds hard cap ${HARD_CAP}`)
    exitCode = 1
  } else {
    console.log(`PASS: fork cap atomicity held under concurrent spawn`)
  }

  // Cleanup: abort all the test forks we just spawned.
  try {
    const forks = forkService.listForks()
    for (const f of forks) {
      if (typeof f.brief === 'string' && f.brief.startsWith('race-test-')) {
        await forkService.abortFork(f.fork_id, 'race-test cleanup')
      }
    }
  } catch (err) {
    console.warn('cleanup failed:', err.message)
  }

  process.exit(exitCode)
}

main().catch((err) => { console.error(err); process.exit(1) })
