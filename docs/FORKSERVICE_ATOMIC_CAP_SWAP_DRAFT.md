# forkService atomic cap swap — SMS-OTP-gated draft

**Status:** DRAFT — NOT APPLIED. `src/services/forkService.js` is on the §2.3
self-mod denylist. This swap requires:

1. Tate SMS-OTP approval via `tier3GateService`.
2. A factory session dispatched with `self_modification: true` targeting
   `src/services/forkService.js`.
3. The factory session will be halted by `factoryOversightService` and Review B
   (§2.2) until Tate OTP-confirms.
4. The diff described below is what the factory session should produce. This
   doc is the brief + review artefact.

The goal is closing the TOCTOU race in `spawnFork` (SECURITY_HARDENING:
FORK_ATOMICITY §2). Two concurrent spawns both read `_activeCount()=4`, both
pass the `>= HARD_FORK_CAP` check, both INSERT, both end up in `_forks` —
cap of 3 is violated. Previously observed in prod as 7/5.

The fix: replace the read-then-decide pattern with a single atomic CTE that
holds a Postgres advisory lock and conditionally INSERTs only when
`COUNT(*) < cap` inside the same transaction. The helper is already shipped
as `src/lib/forkCapAtomic.js` (PR #35, merged, 155 lines of tests).

## Exact swap (unified-diff flavour)

**File:** `src/services/forkService.js`

**Before (lines ~361-377 on current main):**

```js
  // Cap check: hard cap first (always 3), then energy soft cap.
  const active = _activeCount()
  if (active >= HARD_FORK_CAP) {
    throw Object.assign(new Error('fork_cap_reached'), {
      httpStatus: 429,
      code: 'fork_cap_reached',
      details: { active_forks: listForks(), hard_cap: HARD_FORK_CAP },
    })
  }
  const eCap = await _energyCap()
  if (active >= eCap) {
    throw Object.assign(new Error('fork_energy_cap_reached'), {
      httpStatus: 429,
      code: 'fork_energy_cap_reached',
      details: { active_forks: listForks(), energy_cap: eCap },
    })
  }
```

**After (same range):**

```js
  // Atomic cap reservation: hard + energy combined into one advisory-locked
  // CTE so concurrent spawns cannot both pass a count gate. See
  // src/lib/forkCapAtomic.js. Replaces the TOCTOU _activeCount() check.
  const { tryReserveForkSlot } = require('../lib/forkCapAtomic')
  const fork_id = _newForkId()
  const eCap = await _energyCap()
  let reservedRow
  try {
    reservedRow = await tryReserveForkSlot({
      fork_id,
      brief,
      context_mode,
      hard_cap: HARD_FORK_CAP,
      energy_cap: eCap,
    })
  } catch (err) {
    if (err.code === 'fork_cap_reached') {
      err.details = { ...err.details, active_forks: listForks() }
    }
    throw err
  }
```

**And then (lines ~379-415 on current main):** remove the existing
`const fork_id = _newForkId()` plus the in-memory `_forks.set(fork_id, state)`
and `await _dbInsert(state)` calls — `tryReserveForkSlot` already
INSERT-returned the row. Instead, populate the in-memory Map AFTER the DB
commit (the whole point of the fix):

```js
  // ... keep all the state = {...} construction (abort controller, provider,
  //     queryHandle placeholders, etc.) exactly as it was ...
  state.db_row = reservedRow  // for forensics; not read by spawn-path code
  _forks.set(fork_id, state)  // AFTER the DB insert returned — this is the
                              // invariant the old code violated under races.
  _emitForkEvent('spawned', state)
  // No _dbInsert(state) — forkCapAtomic did it.
```

**Net effect:** the `_activeCount()` → check → `_dbInsert` → `_forks.set`
sequence becomes one atomic `tryReserveForkSlot` call followed by an
in-memory Map population. Under N concurrent spawns with cap=C, at most
C of them will see `reservedRow` truthy; the rest throw `fork_cap_reached`.

## Tests to run BEFORE Tate approves deployment

- `npx jest src/lib/__tests__/forkCapAtomic.test.js` — already passing on main.
- A new concurrent-spawn smoke test (not yet written) — see below.

## Concurrent-spawn verification test

After deployment, run this script on the VPS against a staging/ephemeral
DB to prove the race is closed (do NOT run against production — it spawns
10 real forks):

```bash
cd ~/ecodiaos
node scripts/test-fork-cap-race.js
```

Script (to be committed alongside the swap):

```js
// scripts/test-fork-cap-race.js
'use strict'
const forkService = require('../src/services/forkService')
const { liveForkCount } = require('../src/lib/forkCapAtomic')

async function main() {
  const HARD_CAP = 3  // HARD_FORK_CAP
  const attempts = 10
  const startBefore = await liveForkCount()
  console.log(`pre-test live count: ${startBefore}`)

  const results = await Promise.allSettled(
    Array.from({ length: attempts }, (_, i) =>
      forkService.spawnFork({ brief: `race-test-${i}`, context_mode: 'brief' })
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

  console.log(`attempts=${attempts} ok=${ok} rejected=${rejected} cap=${capReached} other=${other}`)
  console.log(`live count after all settled: ${liveAfter}`)

  // Invariants:
  //   live count must never exceed HARD_CAP
  //   ok + rejected === attempts
  //   other (non-cap rejections) should be 0 on a healthy run
  if (liveAfter > HARD_CAP) {
    console.error(`FAIL: live count ${liveAfter} exceeds hard cap ${HARD_CAP}`)
    process.exit(1)
  }
  if (other > 0) {
    console.error(`WARN: ${other} non-cap rejections — inspect manually`)
  }
  console.log('PASS: fork cap atomicity holds under concurrent spawn')

  // Cleanup: abort all the test forks we just spawned.
  const forks = forkService.listForks()
  for (const f of forks) {
    if (f.brief.startsWith('race-test-')) {
      await forkService.abortFork(f.fork_id, 'race-test cleanup')
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
```

## Factory session brief (for when Tate OTP-approves)

Copy this into the OS Session's "dispatch a factory coding session" prompt:

> **Goal:** close the TOCTOU race in `src/services/forkService.js::spawnFork`
> by swapping the `_activeCount()` pre-check for the atomic
> `tryReserveForkSlot` helper from `src/lib/forkCapAtomic.js` (already
> shipped).
>
> **Context:** the race has been observed in prod as 7/5 and 6/5 cap
> violations under adversarial concurrent spawn load. Each excess fork burns
> Claude Max usage and duplicates work. The helper is tested (155 lines of
> unit tests, all green). What's missing is the call-site migration.
>
> **Exact diff:** see `docs/FORKSERVICE_ATOMIC_CAP_SWAP_DRAFT.md` for the
> before/after blocks. Replace the cap-check + `_dbInsert` + `_forks.set`
> sequence (lines ~361-415 on current main) with the atomic-reserve +
> in-memory populate ordering. Do NOT change any other function in the file
> and do NOT change `HARD_FORK_CAP` / `ENERGY_FORK_CAPS` constants.
>
> **Tests:** must not remove any existing test. Add a new test
> `src/services/__tests__/forkService.atomicCap.test.js` that mocks
> `../../lib/forkCapAtomic.js::tryReserveForkSlot` and asserts that:
> (a) `spawnFork` calls it with the expected params, (b) a
> `fork_cap_reached` rejection from the helper is re-thrown with
> `active_forks` attached to `details`, (c) on success the in-memory Map
> is populated AFTER the helper returns — i.e. spying on `_forks.set`
> shows it called strictly after `tryReserveForkSlot` resolved.
>
> **Deployment smoke test:** add `scripts/test-fork-cap-race.js` (see the
> spec doc). Do NOT invoke it from `package.json` scripts — it spawns
> real forks and is run manually post-deploy.
>
> **Constraints:**
> - Keep `abortFork`, `sendMessageToFork`, `recoverStaleForks`, and all
>   other exports byte-identical.
> - Do not add or remove any require().
> - Do not change the in-memory `state = {...}` shape beyond adding
>   `db_row`.
> - No refactoring beyond the specified range.
>
> **Expected review flow:** factoryOversightService will block the deploy
> until §2.2 dual-reviewer verdicts are posted and Tate SMS-OTP-approves
> (§2.3 denylist gate). Do not attempt to bypass.

## What gets released when this ships

Closing SELF.md goal #4 ("Close FORK_ATOMICITY §2 atomic spawn transaction
before the VPS comes back under load"). The 7/5 cap violation becomes a
fixed bug rather than a known one, and the Phase 0.5 security ring closes
fully in code.
