'use strict'

/**
 * cronSessionMode.test.js — verify the orthogonal session-substrate
 * classifier (src/config/cronSessionMode.js).
 *
 * Covers:
 *   - Default unknown cron → 'inherit_fork' (conservative fallback).
 *   - Each named cron returns the expected mode.
 *   - All five session modes are exposed.
 *   - sessionModeToContextMode maps fork-spawn modes correctly.
 *   - allClassifications() returns no overlap between sets.
 *   - Public API surface is stable.
 */

const cronSessionMode = require('../../src/config/cronSessionMode')

describe('cronSessionMode', () => {
  describe('public API', () => {
    test('exports the expected surface', () => {
      expect(cronSessionMode).toEqual(
        expect.objectContaining({
          SESSION_MODES: expect.any(Array),
          DIRECT_EXEC_CRONS: expect.any(Set),
          BRIEF_FORK_CRONS: expect.any(Set),
          INHERIT_FORK_CRONS: expect.any(Set),
          CONDUCTOR_INLINE_CRONS: expect.any(Set),
          FACTORY_CC_SESSION_CRONS: expect.any(Set),
          DEFAULT_SESSION_MODE: 'inherit_fork',
          getCronSessionMode: expect.any(Function),
          sessionModeToContextMode: expect.any(Function),
          allClassifications: expect.any(Function),
        })
      )
    })

    test('SESSION_MODES enumerates all five modes', () => {
      expect(cronSessionMode.SESSION_MODES).toEqual([
        'direct_exec',
        'brief_fork',
        'inherit_fork',
        'conductor_inline',
        'factory_cc_session',
      ])
    })

    test('SESSION_MODES is frozen (immutable)', () => {
      expect(Object.isFrozen(cronSessionMode.SESSION_MODES)).toBe(true)
    })
  })

  describe('default fallback', () => {
    test('unknown cron name → inherit_fork', () => {
      expect(cronSessionMode.getCronSessionMode('this-cron-does-not-exist')).toBe('inherit_fork')
    })

    test('empty string → inherit_fork', () => {
      expect(cronSessionMode.getCronSessionMode('')).toBe('inherit_fork')
    })

    test('undefined → inherit_fork', () => {
      expect(cronSessionMode.getCronSessionMode(undefined)).toBe('inherit_fork')
    })
  })

  describe('direct_exec classification (shell-exec dispatch, no Claude session)', () => {
    test.each([
      ['telemetry-dispatch-consumer'],
      ['decision-quality-classifier'],
      ['os-forks-reaper'],
      ['telemetry-outcome-inference'],
      ['kg-consolidation'],
      ['kg-embedding'],
      ['neo4j-keepalive'],
      ['daily-telemetry'],
      ['coexist-sync-health'],
      ['peer-monitor'],
      ['cowork-fork-budget-reset'],
    ])('%s → direct_exec', (name) => {
      expect(cronSessionMode.getCronSessionMode(name)).toBe('direct_exec')
    })
  })

  describe('brief_fork classification (cold-start adequate, no conductor context)', () => {
    test.each([
      ['cowork-account-revert-probe'],
      ['silent-loop-detector'],
      ['vercel-deploy-monitor'],
      ['system-health'],
      ['morning-briefing'],
      ['tate-blocked-nudge-weekly'],
      ['phase-G-adversarial-audit'],
      ['ambient-os-cleanup-coordinator'],
      ['tate-night-update'],
      ['weekly-mum-text'],
      ['deep-research'],
      ['strategic-thinking'],
      ['inner-life'],
      ['weekly-financial-review'],
      ['claude-md-reflection'],
      ['daily-codification-scan'],
      ['daily-index-regen'],
      ['weekly-doctrine-synthesis'],
      ['status-board-reconciliation'],
      ['external-blocker-freshness-probe'],
      ['decision-quality-drift-check'],
    ])('%s → brief_fork', (name) => {
      expect(cronSessionMode.getCronSessionMode(name)).toBe('brief_fork')
    })
  })

  describe('inherit_fork classification (needs conductor recent context)', () => {
    test.each([
      ['email-triage'],
      ['meta-loop'],
    ])('%s → inherit_fork', (name) => {
      expect(cronSessionMode.getCronSessionMode(name)).toBe('inherit_fork')
    })
  })

  describe('sessionModeToContextMode', () => {
    test('brief_fork → brief', () => {
      expect(cronSessionMode.sessionModeToContextMode('brief_fork')).toBe('brief')
    })

    test('inherit_fork → recent', () => {
      expect(cronSessionMode.sessionModeToContextMode('inherit_fork')).toBe('recent')
    })

    test('direct_exec → null (non-fork mode)', () => {
      expect(cronSessionMode.sessionModeToContextMode('direct_exec')).toBeNull()
    })

    test('conductor_inline → null', () => {
      expect(cronSessionMode.sessionModeToContextMode('conductor_inline')).toBeNull()
    })

    test('factory_cc_session → null', () => {
      expect(cronSessionMode.sessionModeToContextMode('factory_cc_session')).toBeNull()
    })

    test('unknown mode → null', () => {
      expect(cronSessionMode.sessionModeToContextMode('garbage')).toBeNull()
    })
  })

  describe('classification set discipline', () => {
    test('no overlap between session-mode sets', () => {
      const sets = [
        ['DIRECT_EXEC_CRONS', cronSessionMode.DIRECT_EXEC_CRONS],
        ['BRIEF_FORK_CRONS', cronSessionMode.BRIEF_FORK_CRONS],
        ['INHERIT_FORK_CRONS', cronSessionMode.INHERIT_FORK_CRONS],
        ['CONDUCTOR_INLINE_CRONS', cronSessionMode.CONDUCTOR_INLINE_CRONS],
        ['FACTORY_CC_SESSION_CRONS', cronSessionMode.FACTORY_CC_SESSION_CRONS],
      ]
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const [nameA, setA] = sets[i]
          const [nameB, setB] = sets[j]
          for (const x of setA) {
            expect({ in: nameA, name: x, alsoIn: nameB, present: setB.has(x) })
              .toEqual({ in: nameA, name: x, alsoIn: nameB, present: false })
          }
        }
      }
    })

    test('allClassifications returns name → mode map', () => {
      const all = cronSessionMode.allClassifications()
      expect(all['email-triage']).toBe('inherit_fork')
      expect(all['system-health']).toBe('brief_fork')
      expect(all['neo4j-keepalive']).toBe('direct_exec')
      // Unknown name should not be in the map (the map only contains
      // explicitly classified crons; unknown names get the default at
      // lookup time via getCronSessionMode).
      expect(all['this-cron-does-not-exist']).toBeUndefined()
    })

    test('allClassifications size matches union of all sets', () => {
      const all = cronSessionMode.allClassifications()
      const total = (
        cronSessionMode.DIRECT_EXEC_CRONS.size +
        cronSessionMode.BRIEF_FORK_CRONS.size +
        cronSessionMode.INHERIT_FORK_CRONS.size +
        cronSessionMode.CONDUCTOR_INLINE_CRONS.size +
        cronSessionMode.FACTORY_CC_SESSION_CRONS.size
      )
      expect(Object.keys(all).length).toBe(total)
    })
  })
})
