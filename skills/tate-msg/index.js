'use strict'

/**
 * tate-msg - primary contact channel via iMessage on SY094 (MacInCloud).
 *
 * Tate-directed 4 May 2026 18:30+18:39+18:46 AEST: wire iMessage as the
 * primary path to Tate, Twilio SMS as fallback. Apple ID is `code@ecodia.au`
 * which Tate signs into Messages.app on SY094 in parallel; this module is
 * just the wiring code.
 *
 * Mechanics:
 *   1. Read SY094 SSH config from kv_store.creds.macincloud once per
 *      process lifetime (module-scope cache). Single targeted query;
 *      we never enumerate kv_store or echo the secret.
 *   2. Send iMessage by SSH'ing to SY094 and running osascript that
 *      addresses Messages.app -> 1st service whose service type is
 *      iMessage -> buddy "+61404247153" (Tate's mobile).
 *   3. Return { ok: true, sid: 'imsg-<ts>' } on success or
 *      { ok: false, error: '...' } on failure. Caller decides fallback.
 *
 * Failure modes detected:
 * - SSH connection refused / timeout
 * - osascript exit -10810 (Messages.app not running / not signed in)
 * - Apple delivery error in stderr
 * - kv_store config missing (surfaced once, then caches the gap)
 *
 * No internal retry. No fallback to Twilio inside this module - the
 * caller chooses the fallback path so the wiring stays explicit.
 *
 * Authored: 4 May 2026 by fork_moqyjzox_763fdb.
 */

const { spawn } = require('child_process')
const logger = require('../../src/config/logger')
const db = require('../../src/config/db')

const TATE_BUDDY = '+61404247153'

// Module-scope cache. Keyed by process lifetime so we read kv_store at most
// once per ecodia-api boot. Failure to read is also cached (so we don't
// hammer the DB on every alert).
let _config = null
let _configError = null
let _configLoaded = false

async function _loadConfig() {
  if (_configLoaded) return _config
  _configLoaded = true
  try {
    const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.macincloud'`
    if (!rows || rows.length === 0) {
      _configError = 'kv_store row creds.macincloud not found'
      return null
    }
    const raw = rows[0].value
    let parsed
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        _configError = 'creds.macincloud value is not valid JSON'
        return null
      }
    } else if (typeof raw === 'object' && raw !== null) {
      parsed = raw
    } else {
      _configError = 'creds.macincloud value has unexpected type'
      return null
    }

    // Accept several plausible field names so we don't have to know the
    // exact JSON shape ahead of time. Brief said username + password +
    // hostname. macincloud cred file mentions agent_token + ssh creds.
    const username =
      parsed.ssh_user || parsed.username || parsed.user
    const password =
      parsed.ssh_password || parsed.password || parsed.passwd
    const hostname =
      parsed.ssh_host || parsed.hostname || parsed.host

    if (!username || !password || !hostname) {
      _configError = 'creds.macincloud missing one of {username, password, hostname}'
      return null
    }
    _config = { username, password, hostname }
    return _config
  } catch (err) {
    _configError = `kv_store query failed: ${err.message}`
    return null
  }
}

/**
 * Escape a message string for use inside an osascript double-quoted
 * literal that itself sits inside a single-quoted SSH command. Two
 * layers of quoting:
 * - inside osascript "...": escape \ and "
 * - inside SSH '...':       escape ' (we're in bash single-quote)
 * Newlines become "\n" (osascript literal).
 */
function _escapeForOsascript(message) {
  return String(message || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
}

function _escapeForBashSingleQuote(s) {
  // Close single-quote, escaped literal single, reopen single-quote.
  return String(s).replace(/'/g, `'\\''`)
}

/**
 * Run sshpass + ssh + osascript with the given message. Returns the
 * spawn result without throwing. Timeout via signal. Stderr captured.
 */
function _spawnSshOsascript({ username, password, hostname, message, timeoutMs }) {
  return new Promise((resolve) => {
    const escapedMsg = _escapeForOsascript(message)
    const osa = `tell application "Messages" to send "${escapedMsg}" to buddy "${TATE_BUDDY}" of (1st service whose service type is iMessage)`
    const remoteCmd = `osascript -e '${_escapeForBashSingleQuote(osa)}'`

    const args = [
      '-p', password,
      'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'PubkeyAuthentication=no',
      '-o', 'ConnectTimeout=10',
      `${username}@${hostname}`,
      remoteCmd,
    ]
    const child = spawn('sshpass', args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
    }, timeoutMs || 20_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: -1, stdout, stderr: stderr || err.message, transportError: true })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, stdout, stderr, transportError: false })
    })
  })
}

/**
 * Inspect the spawn result and classify it. Returns
 *   { ok: true, sid }  on success
 *   { ok: false, error, classification } on failure
 */
function _classifyResult({ exitCode, stderr, transportError }) {
  if (transportError) {
    return { ok: false, error: 'ssh_transport_error', detail: stderr.slice(0, 200) }
  }
  if (exitCode === 0) {
    // osascript exits 0 even when Messages.app is not running on some
    // configs; check stderr for Apple delivery error markers as a sanity
    // pass.
    if (/error/i.test(stderr) && /(-10810|-1728|delivery)/i.test(stderr)) {
      return { ok: false, error: 'apple_delivery_error', detail: stderr.slice(0, 200) }
    }
    return { ok: true }
  }
  // Non-zero exit. Common cases:
  //   exitCode=255  → SSH connection refused / timeout / auth failed
  //   exitCode=1    → osascript -10810 (Messages.app not running, no service)
  //   exitCode=null → killed by timeout
  if (exitCode === 255) {
    return { ok: false, error: 'ssh_connection_failed', detail: stderr.slice(0, 200) }
  }
  if (exitCode === null) {
    return { ok: false, error: 'ssh_timeout', detail: 'killed after timeout' }
  }
  if (/(-10810)/.test(stderr)) {
    return { ok: false, error: 'messages_app_not_running', detail: stderr.slice(0, 200) }
  }
  return { ok: false, error: 'osascript_failed', detail: stderr.slice(0, 200) || `exit ${exitCode}` }
}

/**
 * Send an iMessage to Tate. Returns:
 *   { ok: true,  sid: 'imsg-<ts>' }
 *   { ok: false, error: '<class>', detail?: string }
 *
 * Never throws. Caller decides fallback. Body is sent verbatim - the
 * caller is responsible for length / formatting.
 */
async function sendImessage(body, opts) {
  const o = opts || {}
  const message = String(body || '').trim()
  if (!message) {
    return { ok: false, error: 'empty_body' }
  }

  const cfg = await _loadConfig()
  if (!cfg) {
    return { ok: false, error: 'config_unavailable', detail: _configError || 'unknown' }
  }

  const result = await _spawnSshOsascript({
    username: cfg.username,
    password: cfg.password,
    hostname: cfg.hostname,
    message,
    timeoutMs: o.timeoutMs || 20_000,
  })
  const classified = _classifyResult(result)
  if (classified.ok) {
    const sid = `imsg-${Date.now()}`
    logger.info('tate-msg: iMessage sent', { sid, length: message.length })
    return { ok: true, sid }
  }
  logger.warn('tate-msg: iMessage send failed', {
    error: classified.error,
    detail: classified.detail,
  })
  return classified
}

/**
 * Health probe - verifies the SSH path is reachable and Messages.app is
 * running, without actually sending Tate a message. Used by the
 * imessage-path-health-check cron.
 *
 * Returns:
 *   { ok: true,  detail: 'ssh ok, Messages.app running' }
 *   { ok: false, error: '<class>', detail?: string }
 *
 * Mechanics: SSH to SY094 and run `pgrep -lf Messages.app | head -1`.
 * Exit 0 with non-empty stdout = Messages.app running.
 */
async function healthCheck() {
  const cfg = await _loadConfig()
  if (!cfg) {
    return { ok: false, error: 'config_unavailable', detail: _configError || 'unknown' }
  }
  return new Promise((resolve) => {
    const remoteCmd = `pgrep -lf 'Messages.app' || pgrep -lf 'Messages' | head -1 || true`
    const args = [
      '-p', cfg.password,
      'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'PubkeyAuthentication=no',
      '-o', 'ConnectTimeout=10',
      `${cfg.username}@${cfg.hostname}`,
      remoteCmd,
    ]
    const child = spawn('sshpass', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 15_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: 'ssh_transport_error', detail: err.message })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        if (stdout.trim().length > 0) {
          resolve({ ok: true, detail: 'ssh ok, Messages.app running' })
        } else {
          // SSH worked but pgrep matched nothing - Messages.app not running.
          resolve({ ok: false, error: 'messages_app_not_running', detail: 'pgrep empty' })
        }
      } else if (code === 255) {
        resolve({ ok: false, error: 'ssh_connection_failed', detail: stderr.slice(0, 200) })
      } else {
        resolve({ ok: false, error: 'pgrep_failed', detail: stderr.slice(0, 200) || `exit ${code}` })
      }
    })
  })
}

/**
 * Test-only: reset the module-scope cache so unit tests can rewire the
 * loader.
 */
function _resetForTest() {
  _config = null
  _configError = null
  _configLoaded = false
}

module.exports = {
  sendImessage,
  healthCheck,
  _resetForTest,
  TATE_BUDDY,
}
