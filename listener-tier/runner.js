#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')
const registry = require('./lib/registry')
const heartbeat = require('./lib/heartbeat')

const LISTENERS_DIR = path.join(__dirname, 'listeners')
const HEARTBEAT_INTERVAL_MS = 60_000

function _loadListeners() {
  const reg = registry.load()
  const enabled = (reg.listeners || []).filter(l => l.source === 'file-watcher' && l.enabled !== false)
  const loaded = []
  for (const entry of enabled) {
    const filePath = path.join(LISTENERS_DIR, entry.file)
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`[runner] missing listener file ${filePath}, skipping\n`)
      continue
    }
    try {
      const mod = require(filePath)
      if (!mod || typeof mod.start !== 'function') {
        process.stderr.write(`[runner] ${entry.file} has no start(), skipping\n`)
        continue
      }
      const watcher = mod.start()
      loaded.push({ name: mod.name, watcher })
    } catch (err) {
      process.stderr.write(`[runner] failed to load ${entry.file}: ${err.message}\n`)
    }
  }
  return loaded
}

async function _heartbeatLoop(names) {
  await heartbeat.writeHealth('runner', { status: 'ok', listeners_loaded: names })
  setInterval(() => {
    heartbeat.writeHealth('runner', { status: 'ok', listeners_loaded: names })
      .catch(() => {})
  }, HEARTBEAT_INTERVAL_MS).unref()
}

async function main() {
  const loaded = _loadListeners()
  const names = loaded.map(l => l.name)
  registry.recordBootedListeners(names)
  process.stderr.write(`[runner] booted with ${names.length} listeners: ${names.join(', ')}\n`)
  await _heartbeatLoop(names)
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[runner] fatal: ${err.stack || err.message}\n`)
    process.exit(1)
  })
}

module.exports = { _loadListeners }
