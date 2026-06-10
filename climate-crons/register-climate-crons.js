#!/usr/bin/env node
'use strict'

/**
 * register-climate-crons - registers the climate-disclosure GLOBAL crons on
 * the ecodia-scheduler (laptop-agent scheduler at localhost:7456, backed by
 * os_scheduled_tasks).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W8).
 *
 * Default is --dry-run: prints the exact scheduler.schedule_cron calls (name,
 * UTC cron expression, full rendered prompt) and makes no HTTP call.
 * --execute registers for real via the laptop-agent tool convention used by
 * scripts/cron_corpus_installer.py: POST {AGENT_URL}/api/tool with
 * {tool: "scheduler.schedule_cron", params: {name, schedule, tz, prompt}},
 * bearer from ~/.ecodiaos/laptop-agent.token.
 *
 * Scope: the two GLOBAL crons only (standards-watch, factors-watch), per the
 * W8 spec line "register on ecodia-scheduler at ship time, not at first
 * client". The three per-engagement templates (monthly-cycle, weekly-chase,
 * daily-anchor) are rendered and registered at R1 engagement instantiation,
 * never by this script.
 *
 * Duplicate-name safety: os_scheduled_tasks carries a DB unique index on cron
 * names since PR #61 (scheduler-spine-and-dupe-guard-2026-06-10), so a
 * re-run cannot silently create a duplicate row; on --execute this script
 * additionally cancels visible same-name rows first (schedule_list hides
 * paused rows; the unique index is the structural guard for those).
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { renderTemplate } = require('./render-template')

const TEMPLATES_DIR = path.join(__dirname, 'templates')
const AGENT_URL = process.env.LAPTOP_AGENT_URL || 'http://127.0.0.1:7456'
const AGENT_TOKEN_PATH =
  process.env.LAPTOP_AGENT_TOKEN ||
  path.join(os.homedir(), '.ecodiaos', 'laptop-agent.token')

// Cron expressions are UTC (tz: "UTC" passed explicitly). AEST = UTC+10,
// Brisbane, no DST. Fire times sit in the AEST afternoon so the UTC and AEST
// calendar dates match (an AEST-morning fire would cross the UTC midnight
// boundary and land on the previous UTC day-of-month).
const GLOBAL_CRONS = [
  {
    name: 'climate-standards-watch',
    template: 'standards-watch.md',
    // 03:07 UTC on the 1st = 13:07 AEST on the 1st of every month.
    cron: '7 3 1 * *',
    tz: 'UTC',
    aest: '13:07 AEST, 1st of the month',
  },
  {
    name: 'climate-factors-watch',
    template: 'factors-watch.md',
    // 03:21 UTC on the 2nd = 13:21 AEST on the 2nd of every month
    // (day after standards-watch, so a standards delta is already logged
    // when the factors fire reads the monitoring feed).
    cron: '21 3 2 * *',
    tz: 'UTC',
    aest: '13:21 AEST, 2nd of the month',
  },
]

function buildCalls() {
  return GLOBAL_CRONS.map((entry) => ({
    tool: 'scheduler.schedule_cron',
    params: {
      name: entry.name,
      schedule: entry.cron,
      tz: entry.tz,
      prompt: renderTemplate(path.join(TEMPLATES_DIR, entry.template), {}),
    },
    aest: entry.aest,
  }))
}

function readToken() {
  try {
    return fs.readFileSync(AGENT_TOKEN_PATH, 'utf8').trim()
  } catch {
    return ''
  }
}

async function postTool(tool, params) {
  const token = readToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${AGENT_URL}/api/tool`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, params }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`laptop-agent ${tool} HTTP ${response.status}: ${text.slice(0, 500)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`laptop-agent ${tool} returned non-JSON: ${text.slice(0, 200)}`)
  }
}

function unwrap(result) {
  return result && typeof result.result === 'object' && result.result !== null
    ? result.result
    : result
}

async function cancelVisibleByName(name) {
  let cancelled = 0
  try {
    const listed = unwrap(await postTool('scheduler.schedule_list', {}))
    const rows = Array.isArray(listed) ? listed : listed.tasks || listed.rows || []
    for (const row of rows) {
      if (row && row.name === name && row.id) {
        await postTool('scheduler.schedule_cancel', { id: row.id })
        cancelled += 1
      }
    }
  } catch (err) {
    console.error(`  warn: list/cancel pass for ${name} failed: ${err.message}`)
  }
  return cancelled
}

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node register-climate-crons.js [--dry-run|--execute]')
    console.log('  --dry-run (default): print the exact schedule_cron calls, no HTTP')
    console.log('  --execute: register the two GLOBAL climate crons on the scheduler')
    return
  }

  const calls = buildCalls()

  if (!execute) {
    console.log(`[dry-run] ${calls.length} global climate crons; no HTTP calls made.`)
    console.log('[dry-run] per-engagement templates (monthly-cycle, weekly-chase,')
    console.log('[dry-run] daily-anchor) register at R1 instantiation, not here.\n')
    for (const call of calls) {
      console.log('='.repeat(72))
      console.log(`POST ${AGENT_URL}/api/tool`)
      console.log(`tool: ${call.tool}`)
      console.log(`name: ${call.params.name}`)
      console.log(`schedule: ${call.params.schedule} (tz ${call.params.tz}; fires ${call.aest})`)
      console.log(`prompt (${call.params.prompt.length} chars):`)
      console.log('-'.repeat(72))
      console.log(call.params.prompt)
    }
    console.log('='.repeat(72))
    console.log(`[dry-run] done: ${calls.length} calls rendered.`)
    return
  }

  for (const call of calls) {
    const cancelled = await cancelVisibleByName(call.params.name)
    if (cancelled > 0) {
      console.log(`${call.params.name}: cancelled ${cancelled} existing row(s) for recreate`)
    }
    const result = unwrap(await postTool(call.tool, call.params))
    const id = result.id || result.taskId
    if (!id) {
      throw new Error(`schedule_cron returned no id for ${call.params.name}: ${JSON.stringify(result)}`)
    }
    console.log(`${call.params.name}: registered id=${id} schedule="${call.params.schedule}" tz=${call.params.tz}`)
  }
  console.log(`registered ${calls.length} global climate crons.`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`register-climate-crons failed: ${err.message}`)
    process.exit(1)
  })
}

module.exports = { GLOBAL_CRONS, buildCalls }
