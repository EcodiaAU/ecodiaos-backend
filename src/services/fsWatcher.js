'use strict'

/**
 * Filesystem watcher — closes Wave B's doctrine_authored matcher loop.
 *
 * Manager: fork_mosn8o5x_7a0e54 (Wave C, worker C1, 5 May 2026).
 *
 * Watches /home/tate/ecodiaos/patterns/*.md and publishes
 *   { source: 'fs', kind: 'pattern_file_<created|updated>', data: { path, mtime, size_bytes }, confidence: 1 }
 * to the perception bus on actual change events (NOT on initial scan).
 *
 * Wave B's doctrineAuthored matcher subscribes via:
 *   - kind === 'pattern_file_created' || kind === 'pattern_file_updated'
 *   - OR (event.source === 'fs_watcher' && data.path includes '/patterns/')
 * The kind-based path is what fires for us; matching the brief verbatim.
 *
 * Strategy: prefer chokidar (richer events, ignoreInitial flag). If chokidar
 * isn't installed, fall back to built-in fs.watch with manual debouncing.
 * fs.watch is inherently change-driven post-init (no synthetic initial-scan
 * events) which satisfies the "do NOT fire 'created' for every existing file"
 * requirement automatically.
 *
 * Idempotent: start() checked against `_started`; second call no-ops.
 */

const path = require('path')
const fs = require('fs')

const logger = require('../config/logger')
const perceptionBus = require('./perceptionBus')

const PATTERNS_DIR = '/home/tate/ecodiaos/patterns'
const DEBOUNCE_MS = 250 // collapse rapid-fire write events from editors

let _started = false
let _watcher = null
const _debounceTimers = new Map() // filePath → timeout
const _knownFiles = new Set()     // populated from initial scan, for created vs updated decisions in fs.watch path

function _publishChange(filePath, action) {
  // action: 'created' | 'updated'
  const stat = (() => {
    try { return fs.statSync(filePath) } catch { return null }
  })()
  if (!stat || !stat.isFile()) return

  const kind = action === 'created' ? 'pattern_file_created' : 'pattern_file_updated'
  perceptionBus.publish({
    source: 'fs',
    kind,
    data: {
      path: filePath,
      mtime: stat.mtimeMs ? new Date(stat.mtimeMs).toISOString() : null,
      size_bytes: stat.size,
    },
    confidence: 1,
  }).catch(err => {
    logger.debug('fsWatcher: perceptionBus.publish failed', { error: err.message, kind, path: filePath })
  })
}

function _debounced(filePath, action) {
  const existing = _debounceTimers.get(filePath)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => {
    _debounceTimers.delete(filePath)
    _publishChange(filePath, action)
  }, DEBOUNCE_MS)
  _debounceTimers.set(filePath, t)
}

function _seedKnownFiles() {
  try {
    const entries = fs.readdirSync(PATTERNS_DIR, { withFileTypes: true })
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.md')) {
        _knownFiles.add(path.join(PATTERNS_DIR, ent.name))
      }
    }
  } catch (err) {
    logger.warn('fsWatcher: initial scan failed', { error: err.message, dir: PATTERNS_DIR })
  }
}

function _startChokidar(chokidar) {
  const watcher = chokidar.watch(path.join(PATTERNS_DIR, '*.md'), {
    persistent: true,
    ignoreInitial: true, // critical: no synthetic 'created' for existing files
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  })
  watcher.on('add', filePath => _debounced(filePath, 'created'))
  watcher.on('change', filePath => _debounced(filePath, 'updated'))
  watcher.on('error', err => logger.warn('fsWatcher (chokidar): watcher error', { error: err.message }))
  return watcher
}

function _startFsWatch() {
  // fs.watch on a directory emits { eventType: 'rename'|'change', filename }.
  // 'rename' fires for both create and delete, so we statSync to disambiguate.
  // No synthetic initial-scan events — change-driven only.
  if (!fs.existsSync(PATTERNS_DIR)) {
    logger.warn('fsWatcher: patterns dir does not exist, skipping fs.watch start', { dir: PATTERNS_DIR })
    return null
  }
  let watcher
  try {
    watcher = fs.watch(PATTERNS_DIR, { persistent: true })
  } catch (err) {
    logger.warn('fsWatcher: fs.watch failed to start', { error: err.message, dir: PATTERNS_DIR })
    return null
  }
  watcher.on('change', (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return
    const filePath = path.join(PATTERNS_DIR, filename)
    let exists = false
    try { exists = fs.statSync(filePath).isFile() } catch { exists = false }
    if (!exists) {
      // delete — not part of the brief's published kinds, ignore
      _knownFiles.delete(filePath)
      return
    }
    if (eventType === 'rename') {
      // rename + exists post-event = create (or move-in). If we already
      // knew about it, treat as update.
      const action = _knownFiles.has(filePath) ? 'updated' : 'created'
      _knownFiles.add(filePath)
      _debounced(filePath, action)
    } else {
      // 'change' — content updated. Always update; if we somehow didn't
      // know about it, also treat as created.
      const action = _knownFiles.has(filePath) ? 'updated' : 'created'
      _knownFiles.add(filePath)
      _debounced(filePath, action)
    }
  })
  watcher.on('error', err => logger.warn('fsWatcher (fs.watch): watcher error', { error: err.message }))
  return watcher
}

function start() {
  if (_started) return
  _started = true

  let chokidar = null
  try {
    chokidar = require('chokidar')
  } catch {
    chokidar = null
  }

  if (chokidar) {
    try {
      _watcher = _startChokidar(chokidar)
      logger.info('fsWatcher: started (chokidar)', { dir: PATTERNS_DIR })
    } catch (err) {
      logger.warn('fsWatcher: chokidar start failed, falling back to fs.watch', { error: err.message })
      _seedKnownFiles()
      _watcher = _startFsWatch()
      if (_watcher) logger.info('fsWatcher: started (fs.watch fallback)', { dir: PATTERNS_DIR })
    }
  } else {
    _seedKnownFiles()
    _watcher = _startFsWatch()
    if (_watcher) logger.info('fsWatcher: started (fs.watch, chokidar not installed)', { dir: PATTERNS_DIR })
  }
}

function stop() {
  if (!_started) return
  _started = false
  for (const t of _debounceTimers.values()) clearTimeout(t)
  _debounceTimers.clear()
  if (_watcher) {
    try {
      if (typeof _watcher.close === 'function') _watcher.close()
    } catch {}
    _watcher = null
  }
}

module.exports = { start, stop, PATTERNS_DIR }
