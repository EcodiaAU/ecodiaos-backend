'use strict'

/**
 * Tests for src/lib/cypher/labelAllowlist.js
 *
 * Covers:
 *   - ALLOWED_LABELS exports a frozen array containing the production-
 *     confirmed labels (probed at audit time 2026-04-30) AND the §2.5
 *     quarantine twins.
 *   - isAllowedLabel returns true for known labels, false for everything
 *     else and for non-string input.
 *   - assertAllowedLabel returns the input unchanged for a hit, throws
 *     with a descriptive message on a miss.
 *   - REL_TYPE_REGEX matches the strict shape; rejects lowercase, empty,
 *     too-long, and Cypher-fragment strings.
 *   - coerceLabel and coerceRelType clean up LLM-emitted strings or
 *     return null when the input cannot be coerced cleanly.
 */

const {
  ALLOWED_LABELS,
  REL_TYPE_REGEX,
  isAllowedLabel,
  assertAllowedLabel,
  isAllowedRelType,
  assertAllowedRelType,
  coerceLabel,
  coerceRelType,
} = require('../labelAllowlist')

describe('labelAllowlist.ALLOWED_LABELS', () => {
  test('exports an array', () => {
    expect(Array.isArray(ALLOWED_LABELS)).toBe(true)
    expect(ALLOWED_LABELS.length).toBeGreaterThan(0)
  })

  test('is frozen', () => {
    expect(Object.isFrozen(ALLOWED_LABELS)).toBe(true)
  })

  test('contains the §2.4 spec allowlist baseline', () => {
    const baseline = ['Pattern', 'Decision', 'Episode', 'Reflection', 'Person', 'Project', 'Client']
    for (const label of baseline) {
      expect(ALLOWED_LABELS).toContain(label)
    }
  })

  test('contains the §2.5 quarantine twins', () => {
    expect(ALLOWED_LABELS).toContain('QuarantinedPattern')
    expect(ALLOWED_LABELS).toContain('QuarantinedDecision')
  })

  test('contains the high-traffic prod labels (probed 2026-04-30)', () => {
    // Sample of labels with >100 nodes in production at audit time.
    const required = [
      'Concept',
      'Problem',
      'Strategic_Direction',
      'Task',
      'System',
      'Action',
      'CCSession',
      'Process',
      'Component',
      'Entity',
      'Resource',
      'Organization',
      'Tool',
      'Error',
      'Artifact',
      'File',
      '__Embedded__',
    ]
    for (const label of required) {
      expect(ALLOWED_LABELS).toContain(label)
    }
  })

  test('contains the lowercase reflection-type canonicals', () => {
    // graph_reflect MCP writes reflection nodes under these exact
    // lowercase labels. Production has 86, 42, 40, 5 nodes respectively.
    expect(ALLOWED_LABELS).toContain('realization')
    expect(ALLOWED_LABELS).toContain('observation')
    expect(ALLOWED_LABELS).toContain('thought')
    expect(ALLOWED_LABELS).toContain('decision')
  })

  test('rejects the audit-flagged out-of-allowlist labels (Narrative, Insight, Peer) by inclusion - they are now allowed', () => {
    // The audit named these as out-of-allowlist; this PR EXPANDS the
    // allowlist to cover them per the brief's "if the label appears in
    // production data with non-trivial counts, include in allowlist".
    expect(ALLOWED_LABELS).toContain('Narrative')
    expect(ALLOWED_LABELS).toContain('Insight')
    expect(ALLOWED_LABELS).toContain('Peer')
  })

  test('does NOT contain noise labels (typos, one-off LLM hallucinations)', () => {
    // Labels with <5 nodes in production - exclude.
    expect(ALLOWED_LABELS).not.toContain('Microsoft_Forms')
    expect(ALLOWED_LABELS).not.toContain('forkService')
    expect(ALLOWED_LABELS).not.toContain('Co_Exist_excel_sync_Edge_Function')
    expect(ALLOWED_LABELS).not.toContain('osSessionService')
    expect(ALLOWED_LABELS).not.toContain('forkConductorTool')
  })
})

describe('labelAllowlist.isAllowedLabel', () => {
  test.each([
    ['Pattern'],
    ['Decision'],
    ['Episode'],
    ['QuarantinedPattern'],
    ['QuarantinedDecision'],
    ['__Embedded__'],
    ['realization'],
  ])('returns true for allowed label: %s', (label) => {
    expect(isAllowedLabel(label)).toBe(true)
  })

  test.each([
    ['NotInAllowlist'],
    ['Microsoft_Forms'],
    ['forkService'],
    ['Pattern; DROP DATABASE'],   // injection attempt
    ['Pattern Pattern'],          // space - not allowed in label syntax
    ['__Pattern__'],
    [''],
  ])('returns false for: %s', (label) => {
    expect(isAllowedLabel(label)).toBe(false)
  })

  test('returns false for non-string input', () => {
    expect(isAllowedLabel(null)).toBe(false)
    expect(isAllowedLabel(undefined)).toBe(false)
    expect(isAllowedLabel(123)).toBe(false)
    expect(isAllowedLabel({})).toBe(false)
    expect(isAllowedLabel([])).toBe(false)
  })
})

describe('labelAllowlist.assertAllowedLabel', () => {
  test('returns the label unchanged on a hit', () => {
    expect(assertAllowedLabel('Pattern')).toBe('Pattern')
    expect(assertAllowedLabel('QuarantinedDecision')).toBe('QuarantinedDecision')
  })

  test('throws with descriptive message on a miss', () => {
    expect(() => assertAllowedLabel('Microsoft_Forms')).toThrow(/Microsoft_Forms/)
    expect(() => assertAllowedLabel('Microsoft_Forms')).toThrow(/labelAllowlist/)
  })

  test('throws on injection attempt', () => {
    expect(() => assertAllowedLabel('Pattern; DROP')).toThrow()
    expect(() => assertAllowedLabel('Pattern\\u0000')).toThrow()
  })

  test('throws on non-string input', () => {
    expect(() => assertAllowedLabel(null)).toThrow()
    expect(() => assertAllowedLabel(undefined)).toThrow()
    expect(() => assertAllowedLabel(123)).toThrow()
  })
})

describe('labelAllowlist.REL_TYPE_REGEX', () => {
  test.each([
    ['MENTIONS'],
    ['BLOCKED_BY'],
    ['IS_PIVOTING_TOWARDS'],
    ['FRUSTRATED_WITH'],
    ['A'],                       // single char
    ['ABC123_DEF'],
    ['X'.repeat(64)],            // max length
  ])('matches valid rel type: %s', (rt) => {
    expect(REL_TYPE_REGEX.test(rt)).toBe(true)
  })

  test.each([
    ['mentions'],                // lowercase start
    ['Mentions'],                // titlecase
    [''],                        // empty
    ['_LEADING_UNDERSCORE'],     // must start with a letter
    ['1_LEADING_DIGIT'],         // must start with a letter
    ['SPACE BAD'],               // space
    ['DASH-BAD'],                // dash
    ['QUOTE\'BAD'],              // quote
    ['X'.repeat(65)],            // exceeds max length
    ['MENTIONS; DROP'],          // injection attempt
    ['MENTIONS]->(x)'],          // cypher-fragment attempt
  ])('rejects invalid rel type: %s', (rt) => {
    expect(REL_TYPE_REGEX.test(rt)).toBe(false)
  })
})

describe('labelAllowlist.isAllowedRelType / assertAllowedRelType', () => {
  test('isAllowedRelType returns boolean', () => {
    expect(isAllowedRelType('MENTIONS')).toBe(true)
    expect(isAllowedRelType('mentions')).toBe(false)
    expect(isAllowedRelType(null)).toBe(false)
    expect(isAllowedRelType(123)).toBe(false)
  })

  test('assertAllowedRelType returns input on a hit', () => {
    expect(assertAllowedRelType('MENTIONS')).toBe('MENTIONS')
    expect(assertAllowedRelType('IS_PIVOTING_TOWARDS')).toBe('IS_PIVOTING_TOWARDS')
  })

  test('assertAllowedRelType throws on a miss', () => {
    expect(() => assertAllowedRelType('mentions')).toThrow(/rejected rel type/)
    expect(() => assertAllowedRelType('')).toThrow()
    expect(() => assertAllowedRelType(null)).toThrow()
  })
})

describe('labelAllowlist.coerceLabel', () => {
  test('returns the label unchanged when already valid', () => {
    expect(coerceLabel('Pattern')).toBe('Pattern')
    expect(coerceLabel('Decision')).toBe('Decision')
  })

  test('strips non-alphanumeric chars then re-validates', () => {
    expect(coerceLabel('Pattern!')).toBe('Pattern')
    expect(coerceLabel('Pattern;')).toBe('Pattern')
  })

  test('returns null when the result is not in the allowlist', () => {
    expect(coerceLabel('Microsoft_Forms')).toBeNull()
    expect(coerceLabel('NotALabel')).toBeNull()
  })

  test('returns null on empty / non-string', () => {
    expect(coerceLabel('')).toBeNull()
    expect(coerceLabel(null)).toBeNull()
    expect(coerceLabel(undefined)).toBeNull()
    expect(coerceLabel(123)).toBeNull()
  })

  test('returns null on a string that becomes empty after stripping', () => {
    expect(coerceLabel('!!!')).toBeNull()
    expect(coerceLabel('___')).toBeNull()
  })
})

describe('labelAllowlist.coerceRelType', () => {
  test('uppercases lowercase rel types into the strict shape', () => {
    expect(coerceRelType('mentions')).toBe('MENTIONS')
    expect(coerceRelType('blocked_by')).toBe('BLOCKED_BY')
  })

  test('replaces non-alphanumeric runs with single underscore', () => {
    expect(coerceRelType('frustrated with')).toBe('FRUSTRATED_WITH')
    expect(coerceRelType('is-pivoting-towards')).toBe('IS_PIVOTING_TOWARDS')
    expect(coerceRelType('blocked   by')).toBe('BLOCKED_BY')
  })

  test('trims leading and trailing underscores', () => {
    expect(coerceRelType('___MENTIONS___')).toBe('MENTIONS')
    expect(coerceRelType('!mentions!')).toBe('MENTIONS')
  })

  test('truncates length to 64 chars', () => {
    const long = 'a'.repeat(100)
    const result = coerceRelType(long)
    expect(result).not.toBeNull()
    expect(result.length).toBeLessThanOrEqual(64)
  })

  test('returns null for inputs that cannot land cleanly', () => {
    expect(coerceRelType('')).toBeNull()
    expect(coerceRelType(null)).toBeNull()
    expect(coerceRelType('!!!')).toBeNull()
    expect(coerceRelType('___')).toBeNull()
    expect(coerceRelType(123)).toBeNull()
  })

  test('coerces an injection attempt into a safe rel type', () => {
    // The injection content is stripped to alphanumerics, leaving a
    // benign uppercased token. Either it becomes MENTIONS_DROP_TABLE_X
    // (which then passes the strict shape) or it returns null. Both
    // are safe outcomes - the input does NOT survive as a Cypher
    // fragment.
    const injection = 'mentions]; DROP TABLE x; --'
    const result = coerceRelType(injection)
    if (result !== null) {
      expect(REL_TYPE_REGEX.test(result)).toBe(true)
    }
  })
})
