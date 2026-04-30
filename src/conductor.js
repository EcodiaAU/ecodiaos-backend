// ─────────────────────────────────────────────────────────────────────
// ecodia-conductor — separate pm2 process that owns the conductor
// SDK stream + cron poller + os-session message queue.
//
// Detached from ecodia-api so that `pm2 restart ecodia-api` (which
// triggers on hot deploys, max_memory_restart, and many other paths)
// no longer kills the conductor session.
//
// Process boundary:
//   ecodia-api       → HTTP routes, MCP endpoints, Edge handlers,
//                      WebSocket server, voice relay, factoryBridge,
//                      capability registry, listenerSubsystem.
//   ecodia-conductor → SDK stream owner (osSessionService), scheduler
//                      poller, os-session message queue sweeper, OS
//                      heartbeat, Claude token refresh, nightly restart.
//
// The two processes share Postgres + Neo4j via separate connection
// pools (no shared in-memory state besides DB). Cross-process signal
// from ecodia-api → ecodia-conductor uses the existing /api/os-session
// HTTP route surface (a follow-up commit will replace direct in-process
// osSession.sendMessage() calls in ecodia-api with HTTP delegation).
//
// Activation is multi-phase — see
//   docs/architecture/conductor-process-detach-2026-04-30.md
// for the migration ordering.
//
// fork_mol0vfnr_78c3e4 — Decision 3993 commit 2/3.
// ─────────────────────────────────────────────────────────────────────

const env = require('./config/env')
const db = require('./config/db')
const logger = require('./config/logger')

// Boot identity tag — easy grep target in pm2 logs.
const BOOT_TAG = '[conductor]'

let shuttingDown = false

async function gracefulShutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${BOOT_TAG} ${signal} received - shutting down`)

  // Stop services in reverse boot order. Each is best-effort —
  // a failure in one stop should not prevent the others from running.
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
  // after 5s so PM2's kill_timeout (45s in COMMON) doesn't SIGKILL us
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

// Track unhandled rejection rate so a temporary spike doesn't crash
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

// ─────────────────────────────────────────────────────────────────────
// Boot sequence
// ─────────────────────────────────────────────────────────────────────
;(async () => {
  logger.info(`${BOOT_TAG} starting (Decision 3993 commit 2/3 - pm2 detach)`)
  logger.info(`${BOOT_TAG} pid=${process.pid} node=${process.version}`)

  // ── Boot: Stale fork recovery ─────────────────────────────────────
  // Mirrors the recovery in src/server.js. When ecodia-conductor
  // restarts (max_memory_restart, crash, deploy), in-flight forks
  // would otherwise vanish silently. Idempotent across both processes —
  // whoever boots first runs it. (Schema ensures only non-terminal
  // rows are flipped to 'crashed'.)
  try {
    const forkService = require('./services/forkService')
    const recovery = await forkService.recoverStaleForks()
    if (recovery && recovery.recovered > 0) {
      logger.warn(`${BOOT_TAG} recovered stale forks at boot`, recovery)
    }
  } catch (err) {
    logger.warn(`${BOOT_TAG} fork recovery at boot failed (non-fatal)`, { error: err.message })
  }

  // ── Boot: Scheduler Poller ────────────────────────────────────────
  // The cron engine. Polls os_scheduled_tasks every 30s, fires due
  // tasks at /api/os-session/message which lives in ecodia-api. The
  // poller itself doesn't need to live in api — it's a tick loop with
  // session-busy gating + energy-adjusted cadence. Moving it here
  // means api hot-reloads no longer interrupt the cron engine.
  try {
    require('./services/schedulerPollerService').start()
    logger.info(`${BOOT_TAG} scheduler poller started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} scheduler poller failed to start`, { error: err.message })
  }

  // ── Boot: Message Queue Sweep ─────────────────────────────────────
  // Promotes delayed messages past their max_age_hours threshold.
  // Backend-internal, no http dependency, naturally belongs on the
  // conductor side.
  try {
    require('./services/messageQueue').startSweepPoller()
    logger.info(`${BOOT_TAG} message queue sweep started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} message queue sweep failed to start`, { error: err.message })
  }

  // ── Boot: OS Heartbeat ────────────────────────────────────────────
  // Wakes the OS Session periodically with an open-ended check-in
  // prompt when Tate isn't messaging. Belongs on conductor side
  // because it's the conductor's autonomous-mode primitive.
  try {
    require('./services/osHeartbeatService').start()
    logger.info(`${BOOT_TAG} OS heartbeat started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} OS heartbeat failed to start`, { error: err.message })
  }

  // ── Boot: Claude Token Refresh ────────────────────────────────────
  // Refreshes OAuth tokens every 30 min so the SDK stream never stalls
  // on an expired token. The SDK stream lives here; the refresher
  // belongs alongside it.
  try {
    require('./services/claudeTokenRefreshService').start()
    logger.info(`${BOOT_TAG} Claude token refresh started`)
  } catch (err) {
    logger.warn(`${BOOT_TAG} Claude token refresh failed to start`, { error: err.message })
  }

  // ── Boot: Nightly Restart ─────────────────────────────────────────
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

  // ── Boot: SDK Stream Lazy-Load ────────────────────────────────────
  // osSessionService loads the @anthropic-ai/claude-agent-sdk module
  // lazily on first use (see getQuery() in osSessionService.js:729).
  // We do not eager-init it here because the cold-start cost is paid
  // by the first /message that lands. The conductor process is alive
  // and ready; the SDK stream attaches when invoked.
  //
  // Cross-process signaling from ecodia-api → conductor uses the
  // existing HTTP /api/os-session/message route surface, which is
  // routed to the conductor process by a follow-up commit.

  logger.info(`${BOOT_TAG} boot complete - conductor ready`)
})().catch((err) => {
  logger.error(`${BOOT_TAG} boot failed`, { error: err.message, stack: err.stack })
  process.exit(1)
})
