'use strict'

// Unit tests for forkService.recoverStaleForks's probe-then-flip behavior
// (refactored 2026-05-01 by fork_mom8e913_73a492 per
// ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md and
// ~/ecodiaos/patterns/continuation-aware-fork-redispatch.md).
//
// The pre-refactor function blanket-flipped every stale row to
// status='crashed' and emitted a generic [SYSTEM: fork_crashed] message
// telling main to "go check substrates". The new function probes git for
// fork-coauthored commits BEFORE classifying status, so a fork that was
// killed mid-flight but whose work shipped (committed and pushed) is now
// classified status='done' with the SHAs in result.

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const mockDbCalls = []
const mockDbQueue = []
jest.mock('../../config/db', () => {
  function dbTag(strings, ...values) {
    const sql = strings.join('?').trim()
    mockDbCalls.push({ sql, values })
    if (mockDbQueue.length === 0) return Promise.resolve([])
    const next = mockDbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

// usageEnergyService is loaded by forkService at require-time but only used
// inside spawnFork; stubbing avoids env-dep flakiness.
jest.mock('../usageEnergyService', () => ({
  getEnergy: jest.fn(async () => ({ level: 'healthy' })),
}))

jest.mock('../../websocket/wsManager', () => ({
  broadcast: jest.fn(),
}))

const forkService = require('../forkService')

beforeEach(() => {
  mockDbCalls.length = 0
  mockDbQueue.length = 0
  forkService._resetForTest()
})

function makeMq() {
  const enqueued = []
  return {
    enqueued,
    enqueueMessage: jest.fn(async (msg) => { enqueued.push(msg) }),
  }
}

function makeGitFake(map) {
  // map: { 'log --all --grep=...': { stdout, stderr, error } }
  return jest.fn(async (args /*, cwd*/) => {
    const key = args.join(' ')
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key]
    // Look for prefix match (grep keys are dynamic via since timestamp)
    for (const k of Object.keys(map)) {
      if (key.startsWith(k.split('--since=')[0]) && k.includes('--since=')) return map[k]
      if (k.endsWith('*') && key.startsWith(k.slice(0, -1))) return map[k]
    }
    return { stdout: '', stderr: '' }
  })
}

const FAKE_FORK_ID = 'fork_mom80wlq_8709d4'
const FAKE_STARTED_AT = new Date('2026-05-01T00:00:00Z')

describe('forkService.recoverStaleForks (probe-then-flip)', () => {
  test('case 1: stale fork with commit on origin/main → status=done, result names SHA', async () => {
    // candidate query
    mockDbQueue.push([{
      fork_id: FAKE_FORK_ID,
      brief: 'fix something',
      position: '',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 100,
      tokens_output: 200,
      tool_calls: 5,
    }])
    // per-row UPDATE returns nothing
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) {
        return { stdout: '1db0c0ffeed1234567890abcdef\tfix(forkService): something\n', stderr: '' }
      }
      if (k.startsWith('log --format=%B -n 1 1db0c0f')) {
        return { stdout: `fix(forkService): something\n\nCo-Authored-By: ${FAKE_FORK_ID}\n`, stderr: '' }
      }
      if (k.startsWith('branch -r --contains 1db0c0f')) {
        return { stdout: '  origin/main\n  origin/HEAD -> origin/main\n', stderr: '' }
      }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      return { stdout: '', stderr: '' }
    }))

    const result = await forkService.recoverStaleForks()

    expect(result.recovered).toBe(1)
    expect(result.results[0].status).toBe('done')
    expect(result.results[0].commits).toBe(1)

    // Per-row UPDATE - second db call (after candidate SELECT)
    const update = mockDbCalls[1]
    expect(update.sql).toContain('UPDATE os_forks')
    expect(update.values).toContain('done')

    // result text contains SHA prefix
    const resultText = update.values.find(v => typeof v === 'string' && v.includes('1db0c0f'))
    expect(resultText).toBeTruthy()
    expect(resultText).toContain('shipped')
    expect(resultText).toContain('all on origin/main')

    // [SYSTEM: fork_done] enqueued, NOT fork_crashed
    expect(mq.enqueued).toHaveLength(1)
    expect(mq.enqueued[0].body).toContain('[SYSTEM: fork_done')
    expect(mq.enqueued[0].body).not.toContain('[SYSTEM: fork_crashed')
    expect(mq.enqueued[0].body).toContain('1db0c0f')
  })

  test('case 2: local-only commit → push attempted → status=done', async () => {
    mockDbQueue.push([{
      fork_id: FAKE_FORK_ID,
      brief: 'fix B',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 0, tokens_output: 0, tool_calls: 1,
    }])
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    let pushed = false
    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) {
        return { stdout: 'abc123def456\tlocal commit\n', stderr: '' }
      }
      if (k.startsWith('log --format=%B -n 1 abc123')) {
        return { stdout: `local commit\n\nCo-Authored-By: ${FAKE_FORK_ID}\n`, stderr: '' }
      }
      if (k.startsWith('branch -r --contains abc123')) {
        // First call (pre-push): not on origin. Post-push: on origin.
        return { stdout: pushed ? '  origin/main\n' : '', stderr: '' }
      }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      if (k === 'rev-list --count origin/main..main') return { stdout: '1\n', stderr: '' }
      if (k === 'rev-list --count main..origin/main') return { stdout: '0\n', stderr: '' }
      if (k === 'push origin main') { pushed = true; return { stdout: 'ok', stderr: '' } }
      return { stdout: '', stderr: '' }
    }))

    const result = await forkService.recoverStaleForks()
    expect(result.results[0].status).toBe('done')
    expect(result.results[0].pushed).toBe(true)

    const resultText = mockDbCalls[1].values.find(v => typeof v === 'string' && v.includes('abc123'))
    expect(resultText).toBeTruthy()
    // Either it ended up classified as all-on-origin (post-push recheck) or
    // as some-local with push note. Both paths are correct outcomes.
    expect(resultText).toMatch(/shipped|fork-recovery|pushed/i)

    expect(mq.enqueued[0].body).toContain('[SYSTEM: fork_done')
  })

  test('case 3: dirty working tree, no commits → status=crashed, dirty files in result', async () => {
    mockDbQueue.push([{
      fork_id: FAKE_FORK_ID,
      brief: 'partial work',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 0, tokens_output: 0, tool_calls: 2,
    }])
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) return { stdout: '', stderr: '' }
      if (k === 'status --porcelain') {
        return { stdout: ' M src/foo.js\n M src/bar.js\n?? newfile.js\n', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    }))

    const result = await forkService.recoverStaleForks()
    expect(result.results[0].status).toBe('crashed')
    expect(result.results[0].dirty).toBe(3)

    const update = mockDbCalls[1]
    const resultText = update.values.find(v => typeof v === 'string' && v.includes('dirty'))
    expect(resultText).toBeTruthy()
    expect(resultText).toContain('src/foo.js')

    const nextStep = update.values.find(v => typeof v === 'string' && v.includes('Review fork worktree'))
    expect(nextStep).toBeTruthy()

    expect(mq.enqueued[0].body).toContain('[SYSTEM: fork_crashed')
    expect(mq.enqueued[0].body).toContain('src/foo.js')
  })

  test('case 4: clean tree, no commits → status=crashed with redispatch recommendation', async () => {
    mockDbQueue.push([{
      fork_id: FAKE_FORK_ID,
      brief: 'never started',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 0, tokens_output: 0, tool_calls: 0,
    }])
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) return { stdout: '', stderr: '' }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      return { stdout: '', stderr: '' }
    }))

    const result = await forkService.recoverStaleForks()
    expect(result.results[0].status).toBe('crashed')
    expect(result.results[0].dirty).toBe(0)
    expect(result.results[0].commits).toBe(0)

    const update = mockDbCalls[1]
    const nextStep = update.values.find(v => typeof v === 'string' && v.includes('continuation-aware-fork-redispatch'))
    expect(nextStep).toBeTruthy()

    expect(mq.enqueued[0].body).toContain('[SYSTEM: fork_crashed')
    expect(mq.enqueued[0].body).toContain('SIGTERMed before any commit')
    expect(mq.enqueued[0].body).toContain('continuation-aware-fork-redispatch')
  })

  test('case 5: probe failure (git error) → recovery proceeds, error logged in result.errors', async () => {
    mockDbQueue.push([{
      fork_id: FAKE_FORK_ID,
      brief: 'will-error',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 0, tokens_output: 0, tool_calls: 0,
    }])
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    // All git commands "fail" - but probeForkDeliverables captures the error
    // in errors[] and returns. Recovery should still flip the row to crashed.
    forkService._setExecGitForTest(jest.fn(async () => {
      return { stdout: '', stderr: 'fatal: not a git repository', error: 'fatal: not a git repository' }
    }))

    const result = await forkService.recoverStaleForks()
    expect(result.recovered).toBe(1)
    expect(result.results[0].status).toBe('crashed')
    expect(result.results[0].errors).toBeGreaterThan(0)

    // The UPDATE still happened (defence in depth - probe never blocks recovery).
    expect(mockDbCalls.length).toBe(2)
    expect(mockDbCalls[1].sql).toContain('UPDATE os_forks')

    // Message still enqueued.
    expect(mq.enqueued).toHaveLength(1)
  })

  test('candidate query empty → no-op', async () => {
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const result = await forkService.recoverStaleForks()
    expect(result.recovered).toBe(0)
    expect(mq.enqueued).toHaveLength(0)
  })

  test('candidate query throws → returns recovered:0 with error, never throws', async () => {
    mockDbQueue.push(new Error('db unreachable'))

    const result = await forkService.recoverStaleForks()
    expect(result.recovered).toBe(0)
    expect(result.error).toBe('db unreachable')
  })

  test('safety: malformed fork_id → probe rejects without shelling out', async () => {
    mockDbQueue.push([{
      fork_id: 'not-a-fork-id; rm -rf /',
      brief: 'evil',
      started_at: FAKE_STARTED_AT,
      last_heartbeat: FAKE_STARTED_AT,
      tokens_input: 0, tokens_output: 0, tool_calls: 0,
    }])
    mockDbQueue.push([])

    const mq = makeMq()
    forkService._setMessageQueueForTest(mq)

    const gitSpy = jest.fn(async () => ({ stdout: '', stderr: '' }))
    forkService._setExecGitForTest(gitSpy)

    const result = await forkService.recoverStaleForks()
    expect(result.recovered).toBe(1)
    // probeForkDeliverables short-circuits before any git call when the id
    // fails the safety regex. status falls through to 'crashed' (no commits,
    // no dirty file probe even attempted).
    expect(gitSpy).not.toHaveBeenCalled()
    expect(result.results[0].status).toBe('crashed')
    expect(result.results[0].errors).toBeGreaterThan(0)
  })
})

describe('forkService.probeForkDeliverables (direct)', () => {
  test('returns commits with correct pushed flag', async () => {
    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) {
        return { stdout: 'aaaaaaa\tA\nbbbbbbb\tB\n', stderr: '' }
      }
      if (k.startsWith('log --format=%B -n 1 aaaaaaa')) {
        return { stdout: `A\n\nCo-Authored-By: ${FAKE_FORK_ID}\n`, stderr: '' }
      }
      if (k.startsWith('log --format=%B -n 1 bbbbbbb')) {
        return { stdout: `B\n\nCo-Authored-By: ${FAKE_FORK_ID}\n`, stderr: '' }
      }
      if (k.startsWith('branch -r --contains aaaaaaa')) return { stdout: '  origin/main\n', stderr: '' }
      if (k.startsWith('branch -r --contains bbbbbbb')) return { stdout: '', stderr: '' }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      // For local-only B, push will attempt fast-forward
      if (k === 'rev-list --count origin/main..main') return { stdout: '1\n', stderr: '' }
      if (k === 'rev-list --count main..origin/main') return { stdout: '0\n', stderr: '' }
      if (k === 'push origin main') return { stdout: 'ok', stderr: '' }
      return { stdout: '', stderr: '' }
    }))

    const probe = await forkService.probeForkDeliverables(FAKE_FORK_ID, FAKE_STARTED_AT)
    expect(probe.commits).toHaveLength(2)
    expect(probe.commits[0].pushed).toBe(true)
    expect(probe.pushAttempted).toBe(true)
  })

  test('skips candidate commit whose body does not actually contain forkId', async () => {
    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) {
        return { stdout: 'cccccccc\tnoise\n', stderr: '' }
      }
      if (k.startsWith('log --format=%B -n 1 cccccccc')) {
        // Body does NOT contain forkId - defence vs grep regex mishaps.
        return { stdout: 'unrelated commit, no co-author tag\n', stderr: '' }
      }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      return { stdout: '', stderr: '' }
    }))

    const probe = await forkService.probeForkDeliverables(FAKE_FORK_ID, FAKE_STARTED_AT)
    expect(probe.commits).toHaveLength(0)
  })

  test('non-fast-forward (behind origin) → push aborted with note', async () => {
    forkService._setExecGitForTest(jest.fn(async (args) => {
      const k = args.join(' ')
      if (k.startsWith('log --all --grep=')) return { stdout: 'ddddddd\tlocal\n', stderr: '' }
      if (k.startsWith('log --format=%B -n 1 ddddddd')) {
        return { stdout: `local\n\nCo-Authored-By: ${FAKE_FORK_ID}\n`, stderr: '' }
      }
      if (k.startsWith('branch -r --contains ddddddd')) return { stdout: '', stderr: '' }
      if (k === 'status --porcelain') return { stdout: '', stderr: '' }
      if (k === 'rev-list --count origin/main..main') return { stdout: '1\n', stderr: '' }
      if (k === 'rev-list --count main..origin/main') return { stdout: '3\n', stderr: '' } // diverged
      if (k === 'push origin main') throw new Error('should not call push when diverged')
      return { stdout: '', stderr: '' }
    }))

    const probe = await forkService.probeForkDeliverables(FAKE_FORK_ID, FAKE_STARTED_AT)
    expect(probe.pushAttempted).toBe(true)
    expect(probe.pushSucceeded).toBe(false)
    expect(probe.pushNote).toMatch(/diverged/i)
  })
})
