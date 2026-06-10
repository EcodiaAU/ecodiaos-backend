'use strict'

/**
 * W8 verify gate: template lint asserts deliverable + verify + integrity_ok +
 * coord.close_my_tab strings in every template read from disk, placeholder
 * substitution works, missing vars throw, and no em-dash appears anywhere.
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W8).
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { renderTemplate } = require('../render-template')
const { GLOBAL_CRONS, buildCalls } = require('../register-climate-crons')

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')

const GLOBAL_TEMPLATES = ['standards-watch.md', 'factors-watch.md']
const ENGAGEMENT_TEMPLATES = ['monthly-cycle.md', 'weekly-chase.md', 'daily-anchor.md']
const ALL_TEMPLATES = [...GLOBAL_TEMPLATES, ...ENGAGEMENT_TEMPLATES]

const ENGAGEMENT_VARS = {
  engagement_id: '00000000-0000-4000-8000-000000000001',
  entity_name: 'Exemplar Pty Ltd',
  ingest_address: 'evidence+exemplar@ecodia.au',
}

describe('renderTemplate', () => {
  test('substitutes placeholders exactly', () => {
    const tmp = path.join(os.tmpdir(), `w8-render-test-${process.pid}.md`)
    fs.writeFileSync(tmp, 'Cycle for {{entity_name}} ({{engagement_id}}) at {{ingest_address}}; {{entity_name}} again.')
    try {
      const out = renderTemplate(tmp, ENGAGEMENT_VARS)
      expect(out).toBe(
        'Cycle for Exemplar Pty Ltd (00000000-0000-4000-8000-000000000001) at evidence+exemplar@ecodia.au; Exemplar Pty Ltd again.'
      )
    } finally {
      fs.unlinkSync(tmp)
    }
  })

  test('throws on missing placeholder vars, naming them', () => {
    const target = path.join(TEMPLATES_DIR, 'monthly-cycle.md')
    expect(() => renderTemplate(target, {})).toThrow(/missing placeholder vars/)
    expect(() => renderTemplate(target, { engagement_id: 'x', entity_name: 'y' })).toThrow(
      /ingest_address/
    )
  })

  test.each(ENGAGEMENT_TEMPLATES)('%s renders fully with engagement vars', (name) => {
    const out = renderTemplate(path.join(TEMPLATES_DIR, name), ENGAGEMENT_VARS)
    expect(out).toContain(ENGAGEMENT_VARS.engagement_id)
    expect(out).toContain(ENGAGEMENT_VARS.entity_name)
    expect(out).not.toMatch(/\{\{/)
  })

  test.each(GLOBAL_TEMPLATES)('%s is placeholder-free (renders with empty vars)', (name) => {
    const out = renderTemplate(path.join(TEMPLATES_DIR, name), {})
    expect(out).not.toMatch(/\{\{/)
    expect(out.length).toBeGreaterThan(500)
  })
})

describe('template lint (W8 verify gate)', () => {
  test('the template set on disk is exactly the five W8 templates', () => {
    expect(fs.readdirSync(TEMPLATES_DIR).sort()).toEqual([...ALL_TEMPLATES].sort())
  })

  test.each(ALL_TEMPLATES)(
    '%s carries deliverable + verify + integrity_ok + coord.close_my_tab',
    (name) => {
      const body = fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8')
      expect(body.toLowerCase()).toContain('deliverable')
      expect(body.toLowerCase()).toContain('verify')
      expect(body).toContain('integrity_ok')
      expect(body).toContain('coord.close_my_tab')
    }
  )

  // The em-dash is constructed from its code point so this test file itself
  // stays clean under the character-level grep (U+2014 never appears, anywhere).
  const EM_DASH = String.fromCharCode(0x2014)

  test.each(ALL_TEMPLATES)('%s contains no em-dash (U+2014)', (name) => {
    const body = fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8')
    expect(body.includes(EM_DASH)).toBe(false)
  })

  test('renderer and registration script contain no em-dash either', () => {
    for (const file of ['render-template.js', 'register-climate-crons.js']) {
      const body = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
      expect(body.includes(EM_DASH)).toBe(false)
    }
  })
})

describe('register-climate-crons global set', () => {
  test('registers exactly the two GLOBAL crons with UTC cron expressions', () => {
    expect(GLOBAL_CRONS.map((c) => c.name).sort()).toEqual([
      'climate-factors-watch',
      'climate-standards-watch',
    ])
    for (const entry of GLOBAL_CRONS) {
      expect(entry.tz).toBe('UTC')
      expect(entry.cron).toMatch(/^(\S+\s+){4}\S+$/)
    }
  })

  test('buildCalls renders full prompts for both global crons', () => {
    const calls = buildCalls()
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.tool).toBe('scheduler.schedule_cron')
      expect(call.params.prompt).toContain('coord.close_my_tab')
      expect(call.params.prompt).toContain('integrity_ok')
      expect(call.params.prompt).not.toMatch(/\{\{/)
    }
  })
})
