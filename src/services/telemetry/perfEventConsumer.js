/**
 * perfEventConsumer.js
 *
 * Phase E (Layer 6) of the Decision Quality Self-Optimization Architecture.
 * See: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
 *
 * Reads JSONL perf events emitted by hook scripts (via
 * scripts/hooks/lib/emit-perf.sh) into the primitive_perf_event table. Hooks
 * append a single line per fire to ~/ecodiaos/logs/telemetry/perf-events.jsonl
 * with shape:
 *   {ts, primitive_name, duration_ms, status, payload_size_bytes, metadata}
 *
 * This consumer runs out-of-band (every 15 minutes) and normalises the
 * accumulated events into queryable Postgres rows. Modelled on
 * dispatchEventConsumer.js: rotate-before-insert, per-line try/catch,
 * processed/<timestamp>-perf-events.jsonl atomic move, 7-day retention.
 *
 * Wired by fork_moxci516_f30b5d on 8 May 2026 to escape paper-architecture
 * state per ~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md.
 *
 * Invocation:
 *   - One-shot CLI: `node src/services/telemetry/perfEventConsumer.js --once`
 *   - Loop:         `node src/services/telemetry/perfEventConsumer.js`
 *   - Cron:         scheduled task `telemetry-perf-consumer` (every 15m)
 *
 * Exits:
 *   - 0 on clean run (or empty queue)
 *   - 1 on unrecoverable error
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

let _env = null
function getEnv() {
  if (_env) return _env
  _env = require('../../config/env')
  return _env
}

const TELEMETRY_DIR = process.env.ECODIAOS_PERF_TELEMETRY_DIR || process.env.ECODIAOS_TELEMETRY_DIR || '/home/tate/ecodiaos/logs/telemetry'
const PERF_FILE = process.env.ECODIAOS_PERF_TELEMETRY_FILE || path.join(TELEMETRY_DIR, 'perf-events.jsonl')
const PROCESSED_DIR = path.join(TELEMETRY_DIR, 'processed')
const RETENTION_DAYS = 7
const TICK_INTERVAL_MS = 15 * 60 * 1000

async function consumeFile(filePath, client) {
  const stats = await fs.promises.stat(filePath).catch(() => null)
  if (!stats) {
    return { processed: 0, perfInserts: 0, lineErrors: 0 }
  }

  const content = await fs.promises.readFile(filePath, 'utf8')
  const lines = content.split('\n').filter(l => l.trim().length > 0)

  let perfInserts = 0
  let lineErrors = 0

  for (const raw of lines) {
    try {
      const line = JSON.parse(raw)
      const ts = line.ts || new Date().toISOString()
      const primitiveName = line.primitive_name || 'unknown'
      const durationMs = Number.isFinite(line.duration_ms) ? Math.max(0, parseInt(line.duration_ms, 10)) : 0
      const status = typeof line.status === 'string' ? line.status : null
      const payloadSizeBytes = (line.payload_size_bytes === null || line.payload_size_bytes === undefined)
        ? null
        : (Number.isFinite(line.payload_size_bytes) ? parseInt(line.payload_size_bytes, 10) : null)
      const metadata = (line.metadata && typeof line.metadata === 'object') ? line.metadata : {}

      try {
        await client.query(
          `INSERT INTO primitive_perf_event (ts, primitive_name, duration_ms, status, payload_size_bytes, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ts, primitiveName, durationMs, status, payloadSizeBytes, metadata]
        )
        perfInserts += 1
      } catch (err) {
        lineErrors += 1
        console.error('[perf-consumer] insert failed:', err.message)
      }
    } catch (err) {
      lineErrors += 1
      console.error('[perf-consumer] failed to parse JSONL line:', err.message, 'raw:', raw.slice(0, 200))
    }
  }

  return { processed: lines.length, perfInserts, lineErrors }
}

async function pruneOldProcessedFiles() {
  try {
    const entries = await fs.promises.readdir(PROCESSED_DIR).catch(() => [])
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const e of entries) {
      // Only prune perf-events processed files; leave dispatch-events alone.
      if (!e.endsWith('-perf-events.jsonl')) continue
      const p = path.join(PROCESSED_DIR, e)
      try {
        const st = await fs.promises.stat(p)
        if (st.mtimeMs < cutoffMs) {
          await fs.promises.unlink(p)
        }
      } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }
}

async function rotateAndConsume() {
  await fs.promises.mkdir(PROCESSED_DIR, { recursive: true })

  const srcStat = await fs.promises.stat(PERF_FILE).catch(() => null)
  if (!srcStat) {
    return { ok: true, processed: 0, perfInserts: 0, lineErrors: 0, note: 'no source file' }
  }
  if (srcStat.size === 0) {
    return { ok: true, processed: 0, perfInserts: 0, lineErrors: 0, note: 'source file empty' }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const processedPath = path.join(PROCESSED_DIR, `${stamp}-perf-events.jsonl`)
  await fs.promises.rename(PERF_FILE, processedPath)

  const env = getEnv()
  const client = new Client({ connectionString: env.DATABASE_URL })
  try {
    await client.connect()
  } catch (err) {
    console.error('[perf-consumer] cannot connect to Postgres:', err.message)
    try { await fs.promises.rename(processedPath, PERF_FILE) } catch { /* ignore */ }
    throw err
  }

  let result
  try {
    result = await consumeFile(processedPath, client)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }

  await pruneOldProcessedFiles()

  return { ok: true, ...result, processedPath }
}

async function runOnce() {
  try {
    const result = await rotateAndConsume()
    console.log('[perf-consumer] tick complete:', JSON.stringify(result))
    return { ok: result.ok !== false, ...result }
  } catch (err) {
    console.error('[perf-consumer] tick failed:', err.message)
    return { ok: false, error: err.message }
  }
}

async function runLoop() {
  console.log(`[perf-consumer] starting periodic loop, interval=${TICK_INTERVAL_MS / 1000}s, file=${PERF_FILE}`)
  await runOnce()
  setInterval(runOnce, TICK_INTERVAL_MS).unref()
  setInterval(() => {}, 60_000).unref()
}

if (require.main === module) {
  const onceMode = process.argv.includes('--once')
  if (onceMode) {
    runOnce()
      .then(result => process.exit(result && result.ok ? 0 : 1))
      .catch(err => { console.error(err); process.exit(1) })
  } else {
    runLoop().catch(err => { console.error(err); process.exit(1) })
  }
}

module.exports = {
  rotateAndConsume,
  runOnce,
  consumeFile,
}
