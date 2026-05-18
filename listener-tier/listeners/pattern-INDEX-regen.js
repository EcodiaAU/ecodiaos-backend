'use strict'

const path = require('path')
const { spawn } = require('child_process')
const { watch, debounce } = require('../lib/sentinel')
const registry = require('../lib/registry')
const heartbeat = require('../lib/heartbeat')

const NAME = 'pattern-INDEX-regen'
const SOURCE = 'file-watcher'
const PATTERNS_GLOB = path.resolve(__dirname, '..', '..', 'patterns', '*.md')
const REGEN_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'regen-patterns-index.js')

function _runRegen() {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(process.execPath, [REGEN_SCRIPT], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', err => reject(err))
    child.on('close', code => {
      const durationMs = Date.now() - started
      if (code === 0) {
        resolve({ durationMs, stderr })
      } else {
        reject(Object.assign(new Error(`regen exited ${code}`), { stderr, durationMs }))
      }
    })
  })
}

async function _fire(reason) {
  const startedAt = new Date().toISOString()
  try {
    const { durationMs, stderr } = await _runRegen()
    registry.recordFire(NAME, {
      status: 'ok',
      durationMs,
      payload: { reason, started_at: startedAt, stderr_lines: stderr ? stderr.split('\n').length - 1 : 0 },
    })
    await heartbeat.writeHealth(NAME, { status: 'ok', duration_ms: durationMs, reason })
  } catch (err) {
    registry.recordFire(NAME, {
      status: 'error',
      durationMs: err.durationMs,
      error: err.message + (err.stderr ? `\n${err.stderr}` : ''),
      payload: { reason, started_at: startedAt },
    })
    await heartbeat.writeHealth(NAME, { status: 'error', reason, error: err.message })
  }
}

function start() {
  const watcher = watch(PATTERNS_GLOB, { debounceMs: 600 })
  const fire = debounce((eventType, filePath) => _fire(`${eventType}:${path.basename(filePath)}`), 800)
  watcher
    .on('add', p => fire('add', p))
    .on('change', p => fire('change', p))
    .on('unlink', p => fire('unlink', p))
    .on('error', err => {
      process.stderr.write(`[${NAME}] watcher error: ${err.message}\n`)
    })
  process.stderr.write(`[${NAME}] watching ${PATTERNS_GLOB}\n`)
  return watcher
}

module.exports = { name: NAME, source: SOURCE, start, _fire }
