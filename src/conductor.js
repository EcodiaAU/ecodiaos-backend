// ---------------------------------------------------------------------
// ecodia-conductor - separate pm2 process that owns the conductor
// SDK stream + cron poller + os-session message queue.
//
// Detached from ecodia-api so that `pm2 restart ecodia-api` (which
// triggers on hot deploys, max_memory_restart, and many other paths)
// no longer kills the conductor session.
//
// Process boundary:
//   ecodia-api       -> HTTP routes, MCP endpoints, Edge handlers,
//                       WebSocket server, voice relay, factoryBridge,
//                       capability registry, listenerSubsystem.
//   ecodia-conductor -> SDK stream owner (osSessionService), scheduler
//                       poller, os-session message queue sweeper, OS
//                       heartbeat, Claude token refresh, nightly restart,
//                       claim verifier, proactivity engine.
//
// The two processes share Postgres + Neo4j via separate connection
// pools (no shared in-memory state besides DB). Cross-process signal
// from ecodia-api -> ecodia-conductor uses the HTTP loopback bridge
// on 127.0.0.1:3002 (CONDUCTOR_LOOPBACK_PORT). Auth via shared
// CONDUCTOR_LOOPBACK_SECRET read from kv_store at boot.
//
// Activation is multi-phase - see
//   docs/architecture/conductor-process-detach-2026-04-30.md
// for the migration ordering.
//
// fork_mol0vfnr_78c3e4 - Decision 3993 commit 2/3.
// fork_mp1mrgs4_f2ba17 - Phase 2 HTTP loopback bridge (12 May 2026).
// ---------------------------------------------------------------------

const http = require('http')
const crypto = require('crypto')
const env = require('./config/env')
const db = require('./config/db')
const logger = require('./config/logger')

// Boot identity tag - easy grep target in pm2 logs.
const BOOT_TAG = '[conductor]'

let shuttingDown = false

// -----------------------------------------------------------------------
// Loopback HTTP server (Phase 2 bridge)
// Binds to 127.0.0.1 only - never reachable from outside the host.
// Auth on every request via CONDUCTOR_LOOPBACK_SECRET (constant-time).
// -----------------------------------------------------------------------

// Cached secret so we read kv_store once per process lifetime.
let _loopbackSecret = null

async function getLoopbackSecret() {
  if (_loopbackSecret) return _loopbackSecret
  // Prefer explicit env var (useful for testing / CI where kv_store unavailable).
  if (process.env.CONDUCTOR_LOOPBACK_SECRET) {
    _loopbackSecret = process.env.CONDUCTOR_LOOPBACK_SECRET
    return _loopbackSecret
  }
  const rows = await db`SELECT value FROM kv_store WHERE key = 'creds.conductor_loopback_secret'`
  if (!rows.length) {
    throw new Error('CONDUCTOR_LOOPBACK_SECRET not found in kv_store - cannot start loopback server')
  }
  // kv_store.value column is TEXT, so rows[0].value is always a raw JSON string,
  // not a parsed object. Parse it first to reach the .value field.
  // Shape: '{"value":"<64-char hex>","created_at":"...","note":"..."}'
  const raw = rows[0].value
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Not JSON - treat raw string as the secret itself (bare-string rotation compat).
    parsed = raw
  }
  _loopbackSecret = typeof parsed === 'string' ? parsed : parsed.value
  if (!_loopbackSecret) {
    throw new Error('CONDUCTOR_LOOPBACK_SECRET kv_store value has no .value field - shape must be {"value":"<hex>",...}')
  }
  return _loopbackSecret
}

// Constant-time bearer check. Returns true only when the presented
// token matches the expected secret byte-for-byte with no timing leak.
function checkBearer(authHeader, secret) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  if (token.length !== secret.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(secret, 'utf8'))
  } catch {
    return false
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) }
      catch (err) { reject(new Error('Invalid JSON in request body')) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

// Handle a single loopback request. osSession + saveHandoffState are
// required lazily so they load AFTER the boot sequence finishes.
async function handleLoopbackRequest(req, res, secret) {
  if (!checkBearer(req.headers['authorization'], secret)) {
    return sendJson(res, 401, { error: 'unauthorized' })
  }

  const url = (req.url || '/').split('?')[0]
  const method = req.method

  try {
    // POST /message - proxies osSessionService.sendMessage
    if (method === 'POST' && url === '/message') {
      const body = await parseBody(req)
      if (!body.message || typeof body.message !== 'string') {
        return sendJson(res, 400, { error: 'message is required' })
      }
      // Return accepted immediately - actual session work is fire-and-forget.
      sendJson(res, 200, { accepted: true, status: 'streaming' })
      const osSession = require('./services/osSessionService')
      osSession.sendMessage(body.message, { priority: false }).catch(err => {
        logger.error(`${BOOT_TAG} /message: sendMessage failed`, { error: err.message })
      })
      return
    }

    // POST /abort
    if (method === 'POST' && url === '/abort') {
      const osSession = require('./services/osSessionService')
      const result = await osSession.abort()
      return sendJson(res, 200, result)
    }

    // GET /status - conductor health + live osSession status
    if (method === 'GET' && url === '/status') {
      const osSession = require('./services/osSessionService')
      const forkService = require('./services/forkService')
      const sessionStatus = await osSession.getStatus()
      const liveForks = forkService.listForks().filter(
        f => !['done', 'aborted', 'error'].includes(f.status)
      )
      return sendJson(res, 200, {
        ...sessionStatus,
        conductor: {
          pid: process.pid,
          uptime_s: Math.floor(process.uptime()),
          active_fork_count: liveForks.length,
        },
      })
    }

    // POST /save-state
    if (method === 'POST' && url === '/save-state') {
      const body = await parseBody(req)
      const { current_work, active_plan, tate_last_direction, deliverables_status } = body
      const { saveHandoffState } = require('./services/sessionHandoff')
      const state = await saveHandoffState({ current_work, active_plan, tate_last_direction, deliverables_status })
      return sendJson(res, 200, { ok: true, saved_at: state.saved_at })
    }

    // GET /forks - list all live forks from conductor's forkService.
    // fix(forks): CONDUCTOR_DETACHED mode had live:[] because ecodia-api's
    // in-memory _forks Map is always empty — conductor owns it. fork_mp384bbz_f727f0.
    if (method === 'GET' && url === '/forks') {
      const forkService = require('./services/forkService')
      return sendJson(res, 200, {
        live: forkService.listForks(),
        hard_cap: forkService.HARD_FORK_CAP,
        energy_caps: forkService.ENERGY_FORK_CAPS,
      })
    }

    // POST /fork - spawn a fork (proxied from ecodia-api FE requests)
    if (method === 'POST' && url === '/fork') {
      const body = await parseBody(req)
      const { brief, context_mode, parent_fork_id } = body || {}
      const forkService = require('./services/forkService')
      try {
        const snapshot = await forkService.spawnFork({ brief, context_mode, parent_fork_id })
        return sendJson(res, 202, { accepted: true, fork: snapshot })
      } catch (err) {
        if (err && err.httpStatus) {
          return sendJson(res, err.httpStatus, { error: err.code || 'fork_spawn_failed', message: err.message })
        }
        throw err
      }
    }

    // GET /fork/:id - single fork snapshot
    const forkIdMatch = url.match(/^\/fork\/([^/]+)$/)
    if (method === 'GET' && forkIdMatch) {
      const forkService = require('./services/forkService')
      const snap = forkService.getFork(decodeURIComponent(forkIdMatch[1]))
      if (!snap) return sendJson(res, 404, { error: 'not_found' })
      return sendJson(res, 200, snap)
    }

    // POST /fork/:id/abort - abort a running fork
    const abortMatch = url.match(/^\/fork\/([^/]+)\/abort$/)
    if (method === 'POST' && abortMatch) {
      const body = await parseBody(req)
      const forkService = require('./services/forkService')
      const result = await forkService.abortFork(
        decodeURIComponent(abortMatch[1]),
        (body && body.reason) || 'manual_abort'
      )
      if (!result.aborted) return sendJson(res, 409, result)
      return sendJson(res, 200, result)
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (err) {
    logger.error(`${BOOT_TAG} loopback request error`, { url, method, error: err.message })
    sendJson(res, 500, { error: 'internal_server_error', message: err.message })
  }
}

let _loopbackServer = null

async function startLoopbackServer() {
  const secret = await getLoopbackSecret()
  const port = parseInt(process.env.CONDUCTOR_LOOPBACK_PORT || '3002', 10)

  _loopbackServer = http.createServer((req, res) => {
    handleLoopbackRequest(req, res, secret).catch(err => {
      logger.error(`${BOOT_TAG} loopback unhandled error`, { error: err.message })
      try { sendJson(res, 500, { error: 'internal_server_error' }) } catch {}
    })
  })

  await new Promise((resolve, reject) => {
    _loopbackServer.listen(port, '127.0.0.1', err => {
      if (err) return reject(err)
      resolve()
    })
  })

  logger.info(`${BOOT_TAG} HTTP loopback server listening on 127.0.0.1:${port}`)
}

// -----------------------------------------------------------------------
// Graceful shutdown
// -----------------------------------------------------------------------

async function gracefulShutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${BOOT_TAG} ${signal} received - shutting down`)

  // Close the loopback HTTP server first so ecodia-api stops receiving
  // new requests while we drain in-flight work.
  if (_loopbackServer) {
    await new Promise(resolve => {
      _loopbackServer.close(() => resolve())
      // Force-close after 3s in case keep-alive connections hold it open.
      setTimeout(() => resolve(), 3000).unref()
    })
    logger.info(`${BOOT_TAG} loopback server closed`)
  }

  // Drain active osSession queries so in-flight tool calls can land.
  try {
    const osSession = require('./services/osSessionService')
    if (typeof osSession.abort === 'function') {
      await osSession.abort().catch(() => {})
    }
  } catch (err) {
    logger.debug(`${BOOT_TAG} osSession drain failed`, { error: err.message })
  }

  // Stop services in reverse boot order. Each is best-effort -
  // a failure in one stop should not prevent the others from running.
  try {
    const proactivityEngine = require('./services/proactivityEngine')
    proactivityEngine.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} proactivityEngine.stop failed`, { error: err.message })
  }

  try {
    const claimVerifier = require('./workers/claimVerifierWorker')
    claimVerifier.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} claimVerifier.stop failed`, { error: err.message })
  }

  try {
    const nightlyRestart = require('./services/nightlyRestartService')
    nightlyRestart.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} nightlyRestart.stop failed`, { error: err.message })
  }

  try {
    const tokenRefresh = require('./services/claudeTokenRefreshService')
    tokenRefresh.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} tokenRefresh.stop failed`, { error: err.message })
  }

  try {
    const heartbeat = require('./services/osHeartbeatService')
    heartbeat.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} heartbeat.stop failed`, { error: err.message })
  }

  try {
    const messageQueue = require('./services/messageQueue')
    messageQueue.stopSweepPoller()
  } catch (err) {
    logger.debug(`${BOOT_TAG} messageQueue.stopSweepPoller failed`, { error: err.message })
  }

  try {
    const schedulerPoller = require('./services/schedulerPollerService')
    schedulerPoller.stop()
  } catch (err) {
    logger.debug(`${BOOT_TAG} schedulerPoller.stop failed`, { error: err.message })
  }

  // Drain any in-flight DB queries before exiting.
  try {
    await db.end({ timeout: 5 })
  } catch (err) {
    logger.debug(`${BOOT_TAG} db.end failed`, { error: err.message })
  }

  // Allow the event loop to flush pending stop callbacks; hard exit
  // after 5s so PM2's kill_timeout (45s in COMMON) does not SIGKILL us
  // before we cleanly close.
  setTimeout(() => {
    logger.info(`${BOOT_TAG} clean exit`)
    process.exit(0)
  }, 1000).unref()

  setTimeout(() => {
    logger.warn(`${BOOT_TAG} graceful shutdown timed out - forcing exit`)
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', async (err) => {
  logger.error(`${BOOT_TAG} Uncaught exception - triggering graceful shutdown`, {
    error: err.message,
    stack: err.stack,
  })
  await gracefulShutdown('uncaughtException').catch(() => {})
  process.exit(1)
})

// Track unhandled rejection rate so a temporary spike does not crash
// the conductor (PM2 will restart but the SDK stream cold-start cost
// is significant). Mirrors the policy in src/server.js.
let _unhandledRejectionCount = 0
let _unhandledRejectionWindowStart = Date.now()
const REJECTION_CRASH_THRESHOLD = parseInt(env.UNHANDLED_REJECTION_CRASH_THRESHOLD || '20')
const REJECTION_CRASH_WINDOW_MS = parseInt(env.UNHANDLED_REJECTION_CRASH_WINDOW_MS || '60000')

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  logger.error(`${BOOT_TAG} Unhandled rejection (non-fatal)`, { error: msg, stack })

  if (shuttingDown) return

  const now = Date.now()
  if (now - _unhandledRejectionWindowStart > REJECTION_CRASH_WINDOW_MS) {
    _unhandledRejectionCount = 0
    _unhandledRejectionWindowStart = now
  }
  _unhandledRejectionCount++

  if (REJECTION_CRASH_THRESHOLD > 0 && _unhandledRejectionCount >= REJECTION_CRASH_THRESHOLD) {
    logger.error(
      `${BOOT_TAG} ${_unhandledRejectionCount} unhandled rejections in ${REJECTION_CRASH_WINDOW_MS}ms - triggering shutdown`
    )
    gracefulShutdown('unhandledRejection:flood').catch(() => {})
  }
})

// -----------------------------------------------------------------------
// Boot sequence
// -----------------------------------------------------------------------
;(async () => {
  logger.info(`${BOOT_TAG} starting (Phase 2 HTTP loopback bridge - fork_mp1mrgs4_f2ba17)`)
  logger.info(`${BOOT_TAG} pid=${process.pid} node=${process.version}`)

  // -- Boot: Stale fork recovery ----------------------------------------
  // Mirrors the recovery in src/server.js. When ecodia-conductor
  // restarts (max_memory_restart, crash, deploy), in-flight forks
  // would otherwise vanish silently. Idempotent across both processes -
  // whoever boots first runs it. (Schema ensures only non-terminal
  // rows are flipped to 'crashed'.)
  try {
    const forkService = require('./services/forkService')
    const recovery = await forkService.recoverStaleForks({ bootMode: true })
    if (recovery && recovery.recovered > 0) {
      logger.warn(`${BOOT_TAG} recovered stale forks at boot`, recovery)
    }
  } catch (err) {
    logger.warn(`${BOOT_TAG} fork recovery at boot failed (non-fatal)`, { error: err.message })
  }

  // -----------------------------------------------------------------------
  // Worker ownership gate (Phase 2 / Phase 3 boundary)
  //
  // Phase 2 (pre-activation): CONDUCTOR_OWNS_WORKERS is unset.
  //   conductor boots ONLY the HTTP bridge. ecodia-api keeps all its
  //   in-process workers (schedulerPoller, messageQueue, heartbeat, etc).
  //   No double-running. Safe to start conductor without touching api.
  //
  // Phase 3 (activation): worker ownership transfers atomically:
  //   Step 1 - this commit is already on main; ecodia-conductor is stopped.
  //   Step 2 - pm2 start ecosystem.config.js --only ecodia-conductor
  //            (CONDUCTOR_OWNS_WORKERS absent -> bridge-only, no workers)
  //   Step 3 - Smoke: SECRET=$(node -e "const r=require('./src/config/db');
  //            r\`SELECT value FROM kv_store WHERE key='creds.conductor_loopback_secret'\`
  //            .then(rows=>{console.log(JSON.parse(rows[0].value).value);r.end()})");
  //            curl -s -H "Authorization: Bearer $SECRET" http://127.0.0.1:3002/status | jq .conductor
  //            -> expect {"pid":N,"uptime_s":N,"active_fork_count":0}
  //   Step 4 - pm2 restart ecodia-api --update-env
  //            (CONDUCTOR_DETACHED=true already in ecosystem.config.js ->
  //             api drops its workers, proxies /message /abort /status /save-state
  //             to conductor bridge; api re-checks env on restart)
  //   Step 5 - Confirm api healthy: pm2 list + curl http://localhost:3001/api/health
  //   Step 6 - Add CONDUCTOR_OWNS_WORKERS:'true' to ecodia-conductor entry in
  //            ecosystem.config.js, then: pm2 restart ecodia-conductor --update-env
  //            (conductor now owns workers; api's workers are already down from Step 4)
  //   Step 7 - Confirm workers running: pm2 logs ecodia-conductor --lines 30
  //
  // fork_mp1n7bm3_a5d11f - Phase 2 follow-up fix (12 May 2026)
  // -----------------------------------------------------------------------
  const ownsWorkers = process.env.CONDUCTOR_OWNS_WORKERS === 'true'
  if (ownsWorkers) {
    logger.info(`${BOOT_TAG} CONDUCTOR_OWNS_WORKERS=true - starting all background workers`)
  } else {
    logger.info(`${BOOT_TAG} CONDUCTOR_OWNS_WORKERS not set - HTTP bridge only (Phase 2 mode, no worker double-run)`)
  }

  if (ownsWorkers) {
  // -- Boot: Scheduler Poller -------------------------------------------
  // The cron engine. Polls os_scheduled_tasks every 30s, fires due
  // tasks at /api/os-session/message which lives in ecodia-api. The
  // poller itself does not need to live in api - it is a tick loop with
  // session-busy gating + energy-adjusted cadence. Moving it here
  // means api hot-reloads no longer interrupt the cron engine.
  try {
    require('./services/schedulerPollerService').start()
    logger.info(`${BOOT_TAG} scheduler poller started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} scheduler poller failed to start`, { error: err.message })
  }

  // -- Boot: Message Queue Sweep ----------------------------------------
  // Promotes delayed messages past their max_age_hours threshold.
  // Backend-internal, no http dependency, naturally belongs on the
  // conductor side.
  try {
    require('./services/messageQueue').startSweepPoller()
    logger.info(`${BOOT_TAG} message queue sweep started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} message queue sweep failed to start`, { error: err.message })
  }

  // -- Boot: OS Heartbeat -----------------------------------------------
  // Wakes the OS Session periodically with an open-ended check-in
  // prompt when Tate is not messaging. Belongs on conductor side
  // because it is the conductor's autonomous-mode primitive.
  try {
    require('./services/osHeartbeatService').start()
    logger.info(`${BOOT_TAG} OS heartbeat started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} OS heartbeat failed to start`, { error: err.message })
  }

  // -- Boot: Claude Token Refresh ---------------------------------------
  // Refreshes OAuth tokens every 30 min so the SDK stream never stalls
  // on an expired token. The SDK stream lives here; the refresher
  // belongs alongside it.
  try {
    require('./services/claudeTokenRefreshService').start()
    logger.info(`${BOOT_TAG} Claude token refresh started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} Claude token refresh failed to start`, { error: err.message })
  }

  // -- Boot: Nightly Restart --------------------------------------------
  // Schedules pm2 restart ecodia-api at 03:00 AEST. The fact that the
  // scheduler issues the restart is precisely WHY the SDK stream must
  // not live in ecodia-api. Keeping this in conductor means a planned
  // api restart no longer kills the in-flight conductor session.
  try {
    require('./services/nightlyRestartService').start()
    logger.info(`${BOOT_TAG} nightly restart service started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} nightly restart failed to start`, { error: err.message })
  }

  // -- Boot: Claim Verifier Worker --------------------------------------
  // OBSERVABILITY_SPEC section 3. Every 30s sweeps conductor_claims rows
  // with verification_status='pending' and dispatches action-specific
  // verifiers. Gated on CONDUCTOR_OWNS_WORKERS so it only runs once
  // across both processes (previously could double-run with server.js).
  try {
    const claimVerifier = require('./workers/claimVerifierWorker')
    claimVerifier.start()
    logger.info(`${BOOT_TAG} claim verifier worker started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} claim verifier worker failed to start`, { error: err.message })
  }

  // -- Boot: Proactivity Engine -----------------------------------------
  // Layer-2 proactivity. Gated on CONDUCTOR_OWNS_WORKERS alongside the
  // claim verifier above.
  try {
    const proactivityEngine = require('./services/proactivityEngine')
    proactivityEngine.start()
    logger.info(`${BOOT_TAG} proactivity engine started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} proactivity engine failed to start (non-fatal)`, { error: err.message })
  }

  } // end if (ownsWorkers)

  // -- Boot: HTTP Loopback Server ---------------------------------------
  // Phase 2 bridge. ecodia-api proxies /message, /abort, /status, and
  // /save-state to this server when CONDUCTOR_DETACHED=true. Binds
  // exclusively to 127.0.0.1; never reachable from outside the host.
  // Auth via CONDUCTOR_LOOPBACK_SECRET (kv_store.creds.conductor_loopback_secret).
  try {
    await startLoopbackServer()
  } catch (err) {
    // Loopback failure is FATAL in conductor mode - without it, ecodia-api
    // cannot reach the session and every /message call from the frontend
    // would silently drop. Hard exit so PM2 restarts us quickly.
    logger.error(`${BOOT_TAG} HTTP loopback server FAILED TO START - fatal`, { error: err.message })
    process.exit(1)
  }

  // -- Boot: SDK Stream Lazy-Load ---------------------------------------
  // osSessionService loads the @anthropic-ai/claude-agent-sdk module
  // lazily on first use (see getQuery() in osSessionService.js).
  // We do not eager-init it here because the cold-start cost is paid
  // by the first /message that lands. The conductor process is alive
  // and ready; the SDK stream attaches when invoked.

  logger.info(`${BOOT_TAG} boot complete - conductor ready`)
})().catch((err) => {
  logger.error(`${BOOT_TAG} boot failed`, { error: err.message, stack: err.stack })
  process.exit(1)
})
