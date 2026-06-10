'use strict'

/**
 * render-template - turns a climate-cron prompt template into a prompt string.
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W8).
 *
 * Pure beyond the single template-file read: no clock, no DB, no env. The two
 * global templates (standards-watch, factors-watch) carry zero placeholders
 * and render with an empty vars object; the three per-engagement templates
 * (monthly-cycle, weekly-chase, daily-anchor) carry {{engagement_id}},
 * {{entity_name}}, {{ingest_address}} and are rendered at R1 instantiation.
 *
 * Missing vars throw rather than rendering a literal "{{engagement_id}}" into
 * a live cron prompt, where it would fail silently at fire time.
 */

const fs = require('fs')

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

/**
 * @param {string} templatePath absolute or cwd-relative path to a template .md
 * @param {Record<string, string|number>} [vars] placeholder values
 * @returns {string} the rendered prompt body
 * @throws {Error} when the template references a placeholder absent from vars
 */
function renderTemplate(templatePath, vars = {}) {
  const template = fs.readFileSync(templatePath, 'utf8')

  const referenced = new Set()
  let match
  PLACEHOLDER_RE.lastIndex = 0
  while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
    referenced.add(match[1])
  }

  const missing = [...referenced].filter(
    (name) => vars[name] === undefined || vars[name] === null
  )
  if (missing.length > 0) {
    throw new Error(
      `renderTemplate: missing placeholder vars [${missing.join(', ')}] for ${templatePath}`
    )
  }

  return template.replace(PLACEHOLDER_RE, (_, name) => String(vars[name]))
}

module.exports = { renderTemplate, PLACEHOLDER_RE }
