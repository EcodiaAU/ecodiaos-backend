'use strict'

/**
 * decisionQualityService unit tests - Jest.
 *
 * Covers the dormant_pattern_candidate mtime-filter introduced after the
 * drift-check post-processor audit on 1 May 2026
 * (drafts/drift-check-1-may-2026-1940-aest.md).
 *
 * Behaviour under test:
 *   - A pattern with mtime < DORMANT_PATTERN_MIN_AGE_DAYS (14d) returns no
 *     dormant flag, because the 90-day surface lookback is structurally
 *     impossible to satisfy for files that young.
 *   - A pattern with mtime > 14d still returns the dormant flag.
 *
 * The test exercises computeDriftSignals indirectly by:
 *   - mocking the `pg` Client so .query() returns canned rows
 *   - mocking `fs.readdirSync` and `fs.statSync` so the patterns dir is a
 *     deterministic synthetic fixture
 *
 * Origin: fork_moms2pr5_9259aa, self-evolution session 1 May 2026 20:35 AEST.
 */

const path = require('path')

// ---- pg mock --------------------------------------------------------------

// All pg.Client.query() calls are routed through a single dispatcher so each
// test can declare what each query returns. Default = empty rowsets.
const fakePgState = { handler: () => ({ rows: [] }) }

jest.mock('pg', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation((sql, params) => {
        return Promise.resolve(fakePgState.handler(sql, params))
      }),
    })),
  }
})

// ---- env mock -------------------------------------------------------------

jest.mock('../../../config/env', () => ({
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
}), { virtual: true })

// ---- fs mock --------------------------------------------------------------

// We mock fs.readdirSync and fs.statSync so we can supply a synthetic patterns
// directory with controlled mtimes. The rest of fs (used elsewhere) keeps the
// real implementation.
const realFs = jest.requireActual('fs')
const fakeFsState = { files: [], stats: {} }
jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    readdirSync: jest.fn().mockImplementation((dir) => {
      if (dir === '/home/tate/ecodiaos/patterns') return fakeFsState.files
      return actual.readdirSync(dir)
    }),
    statSync: jest.fn().mockImplementation((p) => {
      if (p in fakeFsState.stats) return fakeFsState.stats[p]
      return actual.statSync(p)
    }),
  }
})

// ---- helpers --------------------------------------------------------------

const PATTERNS_DIR = '/home/tate/ecodiaos/patterns'
const DAY_MS = 24 * 60 * 60 * 1000

function setPatterns(files) {
  // files: [{ name, ageDays }]
  fakeFsState.files = files.map(f => f.name)
  fakeFsState.stats = {}
  const now = Date.now()
  for (const f of files) {
    const full = path.join(PATTERNS_DIR, f.name)
    fakeFsState.stats[full] = { mtimeMs: now - f.ageDays * DAY_MS }
  }
}

function setQueries({ surfaced = [], regression = [], recentLayers = [] } = {}) {
  fakePgState.handler = (sql) => {
    if (/FROM surface_event\s+WHERE ts > NOW\(\) - INTERVAL '90 days'/.test(sql)) {
      return { rows: surfaced.map(p => ({ pattern_path: p })) }
    }
    if (/FROM dispatch_event d/.test(sql)) {
      return { rows: regression }
    }
    if (/FROM surface_event\s+WHERE ts > NOW\(\) - INTERVAL '24 hours'/.test(sql)) {
      return { rows: recentLayers.map(l => ({ source_layer: l })) }
    }
    return { rows: [] }
  }
}

// Suppress all silent_hook_candidate flags for this test by claiming all known
// layers had recent traffic. Lets us isolate dormant_pattern_candidate.
const ALL_KNOWN_LAYERS = [
  'hook:brief-consistency',
  'hook:cred-mention',
  'hook:doctrine-edit-cross-ref',
  'hook:status-board-write',
]

// ---- tests ----------------------------------------------------------------

describe('computeDriftSignals - dormant_pattern_candidate mtime filter', () => {
  beforeEach(() => {
    jest.resetModules()
    fakePgState.handler = () => ({ rows: [] })
    fakeFsState.files = []
    fakeFsState.stats = {}
  })

  test('skips dormant flag for newly-authored pattern (mtime < 14d)', async () => {
    setPatterns([
      { name: 'newly-authored-pattern.md', ageDays: 1 },
    ])
    setQueries({ surfaced: [], recentLayers: ALL_KNOWN_LAYERS })

    const { computeDriftSignals } = require('../decisionQualityService')
    const flags = await computeDriftSignals()
    const dormant = flags.filter(f => f.flag_type === 'dormant_pattern_candidate')

    expect(dormant).toHaveLength(0)
  })

  test('emits dormant flag for old pattern (mtime > 14d)', async () => {
    setPatterns([
      { name: 'genuinely-dormant.md', ageDays: 120 },
    ])
    setQueries({ surfaced: [], recentLayers: ALL_KNOWN_LAYERS })

    const { computeDriftSignals } = require('../decisionQualityService')
    const flags = await computeDriftSignals()
    const dormant = flags.filter(f => f.flag_type === 'dormant_pattern_candidate')

    expect(dormant).toHaveLength(1)
    expect(dormant[0].name).toContain('genuinely-dormant.md')
  })

  test('mixed corpus: only old, unsurfaced files emit dormant flags', async () => {
    setPatterns([
      { name: 'just-authored.md', ageDays: 0.5 },
      { name: 'still-too-new.md', ageDays: 13 },
      { name: 'borderline-old-enough.md', ageDays: 30 },
      { name: 'ancient-and-surfaced.md', ageDays: 200 },
      { name: 'ancient-and-dormant.md', ageDays: 365 },
    ])
    setQueries({
      surfaced: [path.join(PATTERNS_DIR, 'ancient-and-surfaced.md')],
      recentLayers: ALL_KNOWN_LAYERS,
    })

    const { computeDriftSignals } = require('../decisionQualityService')
    const flags = await computeDriftSignals()
    const dormant = flags.filter(f => f.flag_type === 'dormant_pattern_candidate')
    const names = dormant.map(d => d.name).sort()

    expect(names).toEqual([
      'Dormant pattern: ancient-and-dormant.md',
      'Dormant pattern: borderline-old-enough.md',
    ])
  })

  test('age boundary: exactly 14 days emits flag (>= boundary), strictly < skips', async () => {
    setPatterns([
      { name: 'just-under-14d.md', ageDays: 13.99 },
      { name: 'just-over-14d.md', ageDays: 14.01 },
    ])
    setQueries({ surfaced: [], recentLayers: ALL_KNOWN_LAYERS })

    const { computeDriftSignals } = require('../decisionQualityService')
    const flags = await computeDriftSignals()
    const names = flags
      .filter(f => f.flag_type === 'dormant_pattern_candidate')
      .map(d => d.name)

    expect(names).toEqual(['Dormant pattern: just-over-14d.md'])
  })
})
