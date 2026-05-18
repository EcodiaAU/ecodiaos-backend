'use strict'

const fs = require('fs')
const path = require('path')

const REGISTRY_PATH = path.resolve(__dirname, '..', 'registry.json')

function _read() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
}

function _writeAtomic(obj) {
  const tmp = REGISTRY_PATH + '.tmp.' + process.pid + '.' + Date.now()
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))
  fs.renameSync(tmp, REGISTRY_PATH)
}

function load() {
  return _read()
}

function recordFire(name, { status, durationMs, error, payload } = {}) {
  const reg = _read()
  const entry = (reg.listeners || []).find(l => l.name === name)
  if (!entry) {
    fs.appendFileSync(
      path.resolve(__dirname, '..', 'logs', 'registry-unknown-fires.log'),
      JSON.stringify({ ts: new Date().toISOString(), name, status, error }) + '\n',
    )
    return
  }
  entry.last_fired_ts = new Date().toISOString()
  entry.last_status = status || 'ok'
  entry.last_duration_ms = typeof durationMs === 'number' ? durationMs : null
  entry.last_error = error ? String(error).slice(0, 500) : null
  entry.fire_count = (entry.fire_count || 0) + 1
  if (status === 'error') entry.error_count = (entry.error_count || 0) + 1
  if (payload && typeof payload === 'object') {
    entry.last_payload = payload
  }
  _writeAtomic(reg)
}

function recordBootedListeners(names) {
  const reg = _read()
  reg.last_boot_ts = new Date().toISOString()
  reg.last_boot_listeners = names
  _writeAtomic(reg)
}

module.exports = { load, recordFire, recordBootedListeners, REGISTRY_PATH }
