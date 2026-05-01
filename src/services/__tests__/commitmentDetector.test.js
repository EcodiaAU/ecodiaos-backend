'use strict'

/**
 * Tests for src/services/commitmentDetector.js (§3.3).
 *
 * Pure-function module with an optional Claude escalation. Tests cover:
 *   - Deterministic rule coverage per category
 *   - Risk classification (low/medium/high per category combo)
 *   - analyze() happy path when deterministic wins
 *   - analyze() escalation to Claude when deterministic is clean
 *   - analyze() graceful fallback when Claude throws
 *   - requiresManualTier3() policy helper
 */

const cd = require('../commitmentDetector')

describe('commitmentDetector.analyzeDeterministic - category coverage', () => {
  test.each([
    ['Total is $500 for the first invoice', 'price_or_dollar_figure'],
    ['My rate is AU$150 per hour', 'price_or_dollar_figure'],
    ['Happy to do it for AUD 2,500', 'price_or_dollar_figure'],
    ['Need this done by Friday', 'deadline_or_date_commitment'],
    ['We need to deliver within 5 business days', 'deadline_or_date_commitment'],
    ['I agree to the terms and conditions', 'legal_or_contractual_language'],
    ['We warrant that the system will work', 'legal_or_contractual_language'],
    ['I accept responsibility for this', 'legal_or_contractual_language'],
    ['I am sorry for the confusion', 'apology_or_fault_admission'],
    ['We made a mistake and want to fix it', 'apology_or_fault_admission'],
  ])('flags %s', (text, category) => {
    const r = cd.analyzeDeterministic(text)
    expect(r.contains_commitment).toBe(true)
    expect(r.categories).toContain(category)
  })

  test('clean text returns low risk + no categories', () => {
    const r = cd.analyzeDeterministic('Thanks for the meeting today. Looking forward to more chats.')
    expect(r.contains_commitment).toBe(false)
    expect(r.risk).toBe('low')
    expect(r.categories).toEqual([])
    expect(r.source).toBe('deterministic')
  })

  test('empty input is low risk', () => {
    expect(cd.analyzeDeterministic('').risk).toBe('low')
    expect(cd.analyzeDeterministic(null).risk).toBe('low')
    expect(cd.analyzeDeterministic(undefined).risk).toBe('low')
  })
})

describe('commitmentDetector.analyzeDeterministic - risk classification', () => {
  test('price alone = high', () => {
    expect(cd.analyzeDeterministic('Total $500').risk).toBe('high')
  })
  test('legal alone = high', () => {
    expect(cd.analyzeDeterministic('I agree to the terms').risk).toBe('high')
  })
  test('fault alone = high', () => {
    expect(cd.analyzeDeterministic("We're sorry for the bug").risk).toBe('high')
  })
  test('deadline alone = medium', () => {
    expect(cd.analyzeDeterministic('Need this by Friday').risk).toBe('medium')
  })
  test('price + deadline = high (price dominates)', () => {
    expect(cd.analyzeDeterministic('$500 by next Monday').risk).toBe('high')
  })
})

describe('commitmentDetector.analyze - Claude escalation', () => {
  test('deterministic hit: no Claude call', async () => {
    const claude = jest.fn()
    const r = await cd.analyze('Total is $500', { callClaudeJSON: claude })
    expect(r.source).toBe('deterministic')
    expect(r.risk).toBe('high')
    expect(claude).not.toHaveBeenCalled()
  })

  test('deterministic clean: Claude called', async () => {
    const claude = jest.fn().mockResolvedValue({
      contains_commitment: false,
      categories: [],
      risk: 'low',
    })
    const r = await cd.analyze('Just saying hi', { callClaudeJSON: claude })
    expect(claude).toHaveBeenCalled()
    expect(r.source).toBe('claude')
    expect(r.risk).toBe('low')
  })

  test('Claude escalates a soft commitment det-rule missed', async () => {
    const claude = jest.fn().mockResolvedValue({
      contains_commitment: true,
      categories: ['deadline_or_date_commitment'],
      risk: 'medium',
    })
    const r = await cd.analyze('we aim to wrap things up soon', { callClaudeJSON: claude })
    expect(r.source).toBe('claude')
    expect(r.risk).toBe('medium')
    expect(r.contains_commitment).toBe(true)
  })

  test('Claude throws: falls back to deterministic', async () => {
    const claude = jest.fn().mockRejectedValue(new Error('net down'))
    const r = await cd.analyze('nothing notable', { callClaudeJSON: claude })
    expect(r.source).toBe('deterministic')
    expect(r.risk).toBe('low')
  })

  test('Claude returns bad shape: falls back to deterministic', async () => {
    const claude = jest.fn().mockResolvedValue('not an object')
    const r = await cd.analyze('nothing notable', { callClaudeJSON: claude })
    expect(r.source).toBe('deterministic')
  })

  test('no callClaudeJSON provided: deterministic only', async () => {
    const r = await cd.analyze('nothing notable')
    expect(r.source).toBe('deterministic')
    expect(r.risk).toBe('low')
  })

  test('Claude returns unknown risk: clamps to low (bad input tolerated)', async () => {
    const claude = jest.fn().mockResolvedValue({
      contains_commitment: true,
      categories: ['price_or_dollar_figure'],
      risk: 'EXTREME_DANGER',
    })
    const r = await cd.analyze('clean text', { callClaudeJSON: claude })
    expect(r.risk).toBe('low')
  })
})

describe('commitmentDetector.requiresManualTier3', () => {
  test('null → manual (fail-closed)', () => {
    expect(cd.requiresManualTier3(null)).toBe(true)
  })
  test('low + no commit → auto-authorized ok', () => {
    expect(cd.requiresManualTier3({
      risk: 'low', contains_commitment: false, categories: [],
    })).toBe(false)
  })
  test('medium → manual', () => {
    expect(cd.requiresManualTier3({
      risk: 'medium', contains_commitment: true, categories: ['deadline_or_date_commitment'],
    })).toBe(true)
  })
  test('high → manual', () => {
    expect(cd.requiresManualTier3({ risk: 'high', contains_commitment: true, categories: [] })).toBe(true)
  })
  test('low but contains_commitment=true → manual (defense in depth)', () => {
    expect(cd.requiresManualTier3({
      risk: 'low', contains_commitment: true, categories: [],
    })).toBe(true)
  })
})
