#!/usr/bin/env node
'use strict'

/**
 * populateRegistry.js
 *
 * Parse backend/routines/REGISTRY.md and upsert each non-empty row into
 * kv_store.cowork.routine_registry.<account>.<routine_name> as JSON
 * { fire_url, fire_token, scope_hint }.
 *
 * Usage: node backend/scripts/populateRegistry.js [--dry] [--registry path]
 *
 * Authored 2026-05-15 as part of Lane D of the VPS-to-local migration.
 */

const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { Pool } = require('pg')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const registryArg = args.indexOf('--registry')
const registryPath = registryArg >= 0
  ? args[registryArg + 1]
  : path.join(__dirname, '..', 'routines', 'REGISTRY.md')

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set in env. Source backend/.env or run from a directory where dotenv finds it.')
  process.exit(2)
}

if (!fs.existsSync(registryPath)) {
  console.error(`ERROR: registry not found at ${registryPath}`)
  process.exit(2)
}

const raw = fs.readFileSync(registryPath, 'utf8')
const lines = raw.split('\n')

const rows = []
for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) continue
  if (trimmed.startsWith('|---')) continue
  const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())
  if (cells.length < 4) continue
  if (cells[0].toLowerCase() === 'account') continue
  const [account, routine_name, fire_url, fire_token, scope_hint = ''] = cells
  if (!account || !routine_name || !fire_url || !fire_token) continue
  if (fire_url.startsWith('<') || fire_token.startsWith('<')) continue
  rows.push({
    account,
    routine_name,
    fire_url,
    fire_token,
    scope_hint: scope_hint ? scope_hint.split(',').map(s => s.trim()).filter(Boolean) : [],
  })
}

console.log(`Parsed ${rows.length} rows from ${registryPath}`)
if (rows.length === 0) {
  console.log('Nothing to populate. Did you fill in fire_url + fire_token columns?')
  process.exit(0)
}

if (dryRun) {
  console.log('--- DRY RUN, would upsert ---')
  for (const r of rows) {
    console.log(`  cowork.routine_registry.${r.account}.${r.routine_name} -> { fire_url: ${r.fire_url.slice(0, 60)}..., fire_token: <redacted>, scope_hint: ${JSON.stringify(r.scope_hint)} }`)
  }
  process.exit(0)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function upsert(row) {
  const key = `cowork.routine_registry.${row.account}.${row.routine_name}`
  const value = {
    fire_url: row.fire_url,
    fire_token: row.fire_token,
    scope_hint: row.scope_hint,
    populated_at: new Date().toISOString(),
  }
  await pool.query(
    `INSERT INTO kv_store (key, value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  )
  console.log(`  upserted ${key}`)
}

;(async () => {
  try {
    for (const r of rows) await upsert(r)
    console.log(`Done. Upserted ${rows.length} routine_registry entries.`)
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exit(1)
  }
})()
