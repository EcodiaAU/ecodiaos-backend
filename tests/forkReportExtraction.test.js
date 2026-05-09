'use strict'

/**
 * forkService _extractForkReport contract test.
 *
 * Locks the regex pair against the failure mode that produced ~127 of 186
 * fallback rows over 7 days of pre-fix telemetry (status_board row
 * "Phantom_bail extraction false-negatives", retro-fix script at
 * scripts/retro-fix-fork-result-fallback-extraction.js).
 *
 * Pre-2026-05-07 the regex used `[^\n]*` which greedily consumed same-line
 * body content. The brief tells the model to emit:
 *   [FORK_REPORT] <body on same line>
 * The pre-fix capture group then started after the first \n, body trimmed
 * to '', falsy → caller fell into FALLBACK_MARKER path even though a real
 * report had been emitted.
 *
 * Origin fork: fork_moyuikwe_c3bb61 (9 May 2026).
 */

const { _extractForkReport } = require('../src/services/forkService')

describe('_extractForkReport — same-line body (the bug)', () => {
  test('canonical brief shape: [FORK_REPORT] <body on same line> [NEXT_STEP] <next>', () => {
    const transcript = [
      'tool result: ok',
      'Now committing.',
      '[FORK_REPORT] Chambers F5 shipped end-to-end at commit e47b6a7. Migration 0007 + tenants.privacy_settings JSONB landed.\n[NEXT_STEP] no action needed',
    ]
    const r = _extractForkReport(transcript)
    expect(r.report).toMatch(/Chambers F5 shipped end-to-end at commit e47b6a7/)
    expect(r.report).toMatch(/tenants\.privacy_settings JSONB landed/)
    expect(r.nextStep).toBe('no action needed')
  })

  test('body wraps onto multiple paragraphs separated by blank line', () => {
    const transcript = [
      'preamble',
      '[FORK_REPORT] First paragraph of the body explains what shipped.\n\nSecond paragraph adds the commit SHA `abc1234`.\n\nThird paragraph notes the verification.\n[NEXT_STEP] verify in prod',
    ]
    const r = _extractForkReport(transcript)
    expect(r.report).toMatch(/First paragraph/)
    expect(r.report).toMatch(/Second paragraph/)
    expect(r.report).toMatch(/Third paragraph/)
    expect(r.nextStep).toBe('verify in prod')
  })

  test('FORK_REPORT emitted late in transcript, after many other assistant messages', () => {
    const transcript = []
    // Synthesise many earlier messages — the marker must still bind to the LAST occurrence's body.
    for (let i = 0; i < 30; i++) transcript.push(`message ${i} doing recon and grepping`)
    transcript.push('[FORK_REPORT] Late-emitted report body content with full sentence.\n[NEXT_STEP] ok')
    const r = _extractForkReport(transcript)
    expect(r.report).toBe('Late-emitted report body content with full sentence.')
    expect(r.nextStep).toBe('ok')
  })

  test('NEXT_STEP missing — body extends to end of transcript', () => {
    const transcript = [
      '[FORK_REPORT] Body content goes here on the same line as the marker.',
    ]
    const r = _extractForkReport(transcript)
    expect(r.report).toBe('Body content goes here on the same line as the marker.')
    expect(r.nextStep).toBeNull()
  })

  test('FORK_REPORT not emitted at all — null report, fullText preserved', () => {
    const transcript = [
      'fork did some work',
      'then ran out of context before emitting marker',
    ]
    const r = _extractForkReport(transcript)
    expect(r.report).toBeNull()
    expect(r.reportMatch).toBeNull()
    expect(r.fullText).toContain('ran out of context')
  })

  test('empty body — marker present, no body before [NEXT_STEP]', () => {
    const transcript = ['[FORK_REPORT]\n[NEXT_STEP] x']
    const r = _extractForkReport(transcript)
    // Match succeeded, body trimmed to ''
    expect(r.reportMatch).not.toBeNull()
    expect(r.report).toBe('')
    expect(r.nextStep).toBe('x')
  })

  test('empty transcript — null report, empty fullText', () => {
    const r = _extractForkReport([])
    expect(r.report).toBeNull()
    expect(r.fullText).toBe('')
  })

  test('handles undefined input defensively', () => {
    const r = _extractForkReport(undefined)
    expect(r.report).toBeNull()
    expect(r.fullText).toBe('')
  })
})

describe('_extractForkReport — regression guard against pre-fix [^\\n]* regex', () => {
  test("regex MUST capture body when marker is followed by content + newline + content + [NEXT_STEP] (the F5 / F3-redo failure shape)", () => {
    // Replicates fork_mos0swkk_564f27 / fork_mos0riap_f5910d transcript shape.
    // Pre-fix [^\n]* consumed same-line body, capture group was empty.
    // Post-fix \s* lets capture absorb the same-line content.
    const transcript = [
      'ten + chained ✓',
      '[FORK_REPORT] Chambers F5 shipped end-to-end on chambers-frontend at commit `e47b6a7`. Migration 0007_tenant_admin_config_expansion.sql adds `tenants.social_tiktok/social_threads/social_bluesky` + `tenants.privacy_settings` JSONB (with safe defaults).\n[NEXT_STEP] verify in prod',
    ]
    const r = _extractForkReport(transcript)
    // The pre-fix regex would have produced report='' here. Post-fix MUST capture.
    expect(r.report).not.toBe('')
    expect(r.report).toMatch(/Chambers F5 shipped end-to-end/)
    expect(r.report).toMatch(/social_tiktok\/social_threads\/social_bluesky/)
    expect(r.report).toMatch(/safe defaults/)
    expect(r.nextStep).toBe('verify in prod')
  })

  test('NEXT_STEP body must NOT be empty when content is on the same line as marker', () => {
    // Pre-fix the [NEXT_STEP] regex also had `[^\n]*`, losing same-line content.
    const transcript = ['[FORK_REPORT] body\n[NEXT_STEP] do the thing tomorrow morning']
    const r = _extractForkReport(transcript)
    expect(r.nextStep).toBe('do the thing tomorrow morning')
  })
})
