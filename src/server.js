const env = require('./config/env')
const app = require('./app')
const { createServer } = require('http')
const { initWS } = require('./websocket/wsManager')
const db = require('./config/db')
const logger = require('./config/logger')

// ── Boot: Capability Registry ────────────────────────────────────────
// Must load BEFORE server.listen() so that incoming requests never hit
// an empty registry during the boot window.
try {
  require('./capabilities/index')
} catch (err) {
  logger.error('Capability registry failed to boot - actions will not work', { error: err.message })
}

// Start DeepSeek proxy (strips thinking blocks so V4 Pro works in multi-turn)
try {
  require('./services/deepseekProxyService').start()
} catch (err) {
  logger.error('DeepSeek proxy failed to start', { error: err.message })
}

const server = createServer(app)
initWS(app, server)

// Voice relay - Twilio Media Streams ↔ Deepgram STT/TTS ↔ Agent SDK Haiku
const { initVoiceRelay } = require('./routes/voiceRelay')
initVoiceRelay(app)

// Meetings live transcription - browser mic WS ↔ Deepgram Nova-3 streaming
require('./services/meetingsLiveTranscription').register(app)

// Track open connections so we can force-destroy them on shutdown.
// Without this, server.close() hangs on long-lived WebSocket connections
// and PM2 SIGKILLs the process before process.exit() fires → orphans.
const openConnections = new Set()
server.on('connection', (conn) => {
  openConnections.add(conn)
  conn.on('close', () => openConnections.delete(conn))
})

// Orphan cleanup has moved to factoryRunner - it owns CC session lifecycle.

// Graceful shutdown - registered at module level so it fires regardless of
// whether the server has finished starting. PM2 sends SIGTERM on restart/delete
// and SIGINT in some shutdown paths.
let shuttingDown = false
async function gracefulShutdown(signal) {
  if (shuttingDown) return // Prevent double-shutdown from SIGTERM+SIGINT race
  shuttingDown = true
  logger.info(`${signal} received - shutting down`)

  // Audit 2026-05-13 P1: drain the forkComplete wake-batch window
  // BEFORE everything else. The 20s batch holds fork_report wakes in
  // process memory; if SIGTERM lands mid-window the batch is GC'd and
  // those wakes are lost (the messageQueue durability shadow recovers
  // most cases but the synchronous flush here is belt-and-braces).
  try {
    const forkComplete = require('./services/listeners/forkComplete')
    if (forkComplete && typeof forkComplete.flushPendingWakes === 'function') {
      await forkComplete.flushPendingWakes()
    }
  } catch {}

  // CC sessions now run in the separate ecodia-factory process.
  // No session drain needed - that's the entire point of the separation.
  // Shutdown the bridge subscriber cleanly.
  try {
    const bridge = require('./services/factoryBridge')
    await bridge.shutdown()
  } catch {}

  try {
    const maintenance = require('./workers/autonomousMaintenanceWorker')
    maintenance.stop()
  } catch {}

  try {
    const schedulerPoller = require('./services/schedulerPollerService')
    schedulerPoller.stop()
  } catch {}

  try {
    const messageQueue = require('./services/messageQueue')
    messageQueue.stopSweepPoller()
  } catch {}

  try {
    const tokenRefresh = require('./services/claudeTokenRefreshService')
    tokenRefresh.stop()
  } catch {}

  try {
    const claimVerifier = require('./workers/claimVerifierWorker')
    claimVerifier.stop()
  } catch {}

  try {
    const delayQueueWorker = require('./workers/outboundEmailDelayQueueWorker')
    delayQueueWorker.stop()
  } catch {}

  try {
    const proactivityEngine = require('./services/proactivityEngine')
    proactivityEngine.stop()
  } catch {}

  try {
    const patternEvolution = require('./services/patternEvolution')
    patternEvolution.stop()
  } catch {}

  // Force-destroy open connections (especially WebSockets) so server.close()
  // doesn't hang waiting for them to end. Without this, PM2 SIGKILLs the
  // process at kill_timeout and sessions that weren't yet marked in DB become orphans.
  for (const conn of openConnections) {
    try { conn.destroy() } catch {}
  }

  // Close the DB connection pool - prevents connection leaks across restarts
  // and ensures in-flight queries complete before the process exits.
  try { await db.end({ timeout: 5 }) } catch {}

  server.close(() => process.exit(0))

  // Hard exit fallback - if server.close() still hangs (e.g. connections
  // that survive destroy()), exit before PM2's 12s kill_timeout SIGKILLs us
  setTimeout(() => {
    logger.warn('Graceful shutdown timed out - forcing exit')
    process.exit(1)
  }, 11000).unref()
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Crash handlers - without these, uncaught errors kill the process
// without triggering SIGTERM/SIGINT, leaving sessions orphaned in DB.
//
// Audit 2026-05-13 P0 #36: previously this handler awaited the full
// gracefulShutdown chain (up to 11s of timers, db.end, factoryBridge
// shutdown, etc.) BEFORE process.exit(1). An uncaught at a non-
// recoverable point thus extended hung time by up to 11s and blocked
// PM2's restart. Standard practice on uncaughtException is fast-exit
// and let PM2 restart cleanly. We still flush the wake-batch + DB
// close synchronously (fire-and-forget short timeout) so the most
// urgent recovery substrates aren't abandoned, but the process exits
// within ~2s regardless.
const UNCAUGHT_FLUSH_TIMEOUT_MS = 2000
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception - fast-exiting (PM2 will restart)', {
    error: err.message, stack: err.stack,
  })
  // Best-effort flush of fork-wake batch + db pool close, but capped.
  const flushPromise = (async () => {
    try {
      const forkComplete = require('./services/listeners/forkComplete')
      if (forkComplete && typeof forkComplete.flushPendingWakes === 'function') {
        await forkComplete.flushPendingWakes()
      }
    } catch {}
    try { await db.end({ timeout: 1 }) } catch {}
  })()
  Promise.race([
    flushPromise,
    new Promise((r) => setTimeout(r, UNCAUGHT_FLUSH_TIMEOUT_MS)),
  ]).finally(() => {
    process.exit(1)
  })
  // Also schedule a hard exit in case the flushPromise hangs in a way
  // that defeats Promise.race (shouldn't happen, but be paranoid).
  setTimeout(() => process.exit(1), UNCAUGHT_FLUSH_TIMEOUT_MS + 500).unref()
})
// Track unhandled rejections - crash only on repeated rapid-fire failures
// (a sign of systemic breakage, not transient hiccups during shutdown/restart).
let _unhandledRejectionCount = 0
let _unhandledRejectionWindowStart = Date.now()
const REJECTION_CRASH_THRESHOLD = parseInt(env.UNHANDLED_REJECTION_CRASH_THRESHOLD || '20')
const REJECTION_CRASH_WINDOW_MS = parseInt(env.UNHANDLED_REJECTION_CRASH_WINDOW_MS || '60000')

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  logger.error('Unhandled rejection (non-fatal)', { error: msg, stack })

  // If we're already shutting down, swallow - don't compound the shutdown
  if (shuttingDown) return

  // Track rate - crash only if rejections are piling up (systemic failure)
  const now = Date.now()
  if (now - _unhandledRejectionWindowStart > REJECTION_CRASH_WINDOW_MS) {
    _unhandledRejectionCount = 0
    _unhandledRejectionWindowStart = now
  }
  _unhandledRejectionCount++

  if (REJECTION_CRASH_THRESHOLD > 0 && _unhandledRejectionCount >= REJECTION_CRASH_THRESHOLD) {
    logger.error(`${_unhandledRejectionCount} unhandled rejections in ${REJECTION_CRASH_WINDOW_MS}ms - triggering shutdown`)
    gracefulShutdown('unhandledRejection:flood').catch(err => logger.debug('bg task error', { err: err.message }))
  }
})

server.listen(env.PORT, async () => {
  logger.info(`Ecodia API running on :${env.PORT}`)

  // ── Boot: Neo4j Retrieval Warmup ──────────────────────────────────
  // Warm the Neo4j retrieval path so the first user-turn injection doesn't pay
  // the ~2.4s driver cold-start cost (vs the 2s outer timeout in _injectRelevantMemory).
  setImmediate(() => {
    require('./services/neo4jRetrieval')
      .semanticSearch('warmup', { limit: 1, minScore: 0.99 })
      .catch(() => {}) // intentional - fire and forget
  })

  // ── Boot: Schema Constraint Validator ─────────────────────────────
  // Advisory check - warns if code enum values don't match DB constraints
  try {
    const { validateSchemaConstraints } = require('./utils/schemaValidator')
    await validateSchemaConstraints(db)
  } catch (err) {
    logger.warn('Schema constraint validation failed (non-fatal)', { error: err.message })
  }

  // ── Boot: Recover stale forks from prior api process ──────────────
  // PM2 max_memory_restart SIGTERMs ecodia-api roughly every 6 minutes at
  // peak load. Without recovery, all in-flight forks just vanish - main
  // never sees [FORK_REPORT], the 5/5 slot count is wrong, and the
  // continuation-aware redispatch path can't fire. recoverStaleForks
  // flips non-terminal os_forks rows to 'crashed' and enqueues a
  // [SYSTEM: fork_crashed] message per fork onto main's durable queue.
  // Idempotent, never throws. (fork-persistence Option A, fork_mokpm24w_4daefb)
  try {
    const forkService = require('./services/forkService')
    const recovery = await forkService.recoverStaleForks({ bootMode: true })
    if (recovery && recovery.recovered > 0) {
      logger.warn('Recovered stale forks at boot', recovery)
    }
  } catch (err) {
    logger.warn('Fork recovery at boot failed (non-fatal)', { error: err.message })
  }

  // ── Boot: Factory Bridge ──────────────────────────────────────────
  // Subscribe to Redis channels from factoryRunner for:
  // 1. Session completions → trigger oversight pipeline
  // 2. WS broadcast relay → push to connected WebSocket clients
  try {
    const bridge = require('./services/factoryBridge')
    const { broadcastToSession, broadcast } = require('./websocket/wsManager')

    bridge.subscribeMany({
      // Session completed → OS Session reviews and decides deploy/reject
      [bridge.CHANNELS.SESSION_COMPLETE]: async (data) => {
        try {
          logger.info(`Factory session ${data.sessionId} completed (${data.status}) - routing to OS Session for review`)
          const oversight = require('./services/factoryOversightService')
          const osSession = require('./services/osSessionService')

          // For failed sessions: run mechanical cleanup directly (nothing to review)
          // For completed sessions with changes: hand off to OS Session
          const [session] = await db`SELECT status, files_changed FROM cc_sessions WHERE id = ${data.sessionId}`

          if (!session || session.status !== 'complete') {
            // Failed - run mechanical pipeline (stash/clean) directly, no review needed
            oversight.runPostSessionPipeline(data.sessionId).catch(err => {
              logger.error(`Oversight pipeline (failure path) failed for session ${data.sessionId}`, { error: err.message })
            })
            return
          }

          const filesChanged = session.files_changed || []
          if (filesChanged.length === 0) {
            // No changes - run mechanical no-change handling directly
            oversight.runPostSessionPipeline(data.sessionId).catch(err => {
              logger.error(`Oversight pipeline (no-change path) failed for session ${data.sessionId}`, { error: err.message })
            })
            return
          }

          // Has changes - hand to OS Session for judgment
          const osStatus = await osSession.getStatus().catch(() => null)
          if (!osStatus || osStatus.status === 'error') {
            // OS Session not available - fall back to automated pipeline
            logger.warn(`OS Session unavailable for Factory review (${data.sessionId}) - falling back to automated pipeline`)
            oversight.runPostSessionPipeline(data.sessionId).catch(err => {
              logger.error(`Oversight pipeline (fallback) failed for session ${data.sessionId}`, { error: err.message })
            })
            return
          }

          // Send review request to OS Session
          const [fullSession] = await db`
            SELECT cs.initial_prompt, cb.name AS codebase_name
            FROM cc_sessions cs LEFT JOIN codebases cb ON cs.codebase_id = cb.id
            WHERE cs.id = ${data.sessionId}
          `
          const prompt = (fullSession?.initial_prompt || '').slice(0, 300)
          const codebase = fullSession?.codebase_name || 'unknown'

          await osSession.sendMessage(
            `FACTORY SESSION COMPLETE - review required.\n\n` +
            `Session ID: ${data.sessionId}\n` +
            `Codebase: ${codebase}\n` +
            `Task: ${prompt}\n` +
            `Files changed: ${filesChanged.length}\n\n` +
            `Call review_factory_session("${data.sessionId}") to see the diff and validation results, ` +
            `then call approve_factory_deploy("${data.sessionId}") to deploy or reject_factory_session("${data.sessionId}", reason) to reject. ` +
            `After deciding, extract any learnings into the knowledge graph.`
          )

          logger.info(`Factory session ${data.sessionId} handed to OS Session for review`)
        } catch (err) {
          logger.error('Failed to handle session completion from factory runner', { error: err.message })
          // Emergency fallback
          try {
            const oversight = require('./services/factoryOversightService')
            oversight.runPostSessionPipeline(data.sessionId).catch(err => logger.debug('bg task error', { err: err.message }))
          } catch {}
        }
      },

      // WS relay - factory runner publishes, we push to connected clients
      [bridge.CHANNELS.WS_BROADCAST]: (data) => {
        try {
          if (data.sessionId) {
            broadcastToSession(data.sessionId, data.type, data.data)
          } else {
            broadcast(data.type, data.data)
          }
        } catch (err) {
          logger.debug('WS relay from factory runner failed', { error: err.message })
        }
      },
    })

    logger.info('Factory bridge subscriptions active (completions + WS relay)')
  } catch (err) {
    logger.warn('Failed to initialize factory bridge subscriptions', { error: err.message })
  }

  // ── Boot: Workers ─────────────────────────────────────────────────
  // DISABLED (2026-04-15): All autonomous workers are off. OS Session is
  // the ONE brain - it calls worker module functions as tools on-demand
  // (e.g. run_calendar_poll, run_kg_consolidation) when it decides the
  // work is needed. Worker source files stay put so OS Session can call
  // their exported functions directly; nothing loops on its own.
  //
  // Logged here only so `workspacePoller` (used on-demand by other code
  // paths that still require() it) can still be loaded by those callers - 
  // no auto-start happens in either case because `start: true` was never
  // set on any entry in this list. Kept as a reference surface.

  const inlineWorkers = [
    // { name: 'calendarPoller',              path: './workers/calendarPoller' },
    // { name: 'codebaseIndexWorker',         path: './workers/codebaseIndexWorker' },
    // { name: 'workspacePoller',             path: './workers/workspacePoller' },
    // { name: 'kgEmbeddingWorker',           path: './workers/kgEmbeddingWorker' },
    // { name: 'kgConsolidationWorker',       path: './workers/kgConsolidationWorker' },
    // { name: 'financePoller',               path: './workers/financePoller' },
    // docs/PROMPT_ASSEMBLY_SPEC.md §4.3 - Anthropic prompt-cache TTL refresh
    // worker. Default ON in production, off in local dev (NODE_ENV !==
    // 'production'). Explicit override via CACHE_KEEPALIVE_ENABLED=true|false.
    // Cost is ~100 input tokens per 45-min fire during work hours
    // (6am-10pm AEST), savings ~15K tokens per prevented cache miss.
    // See docs/ANTHROPIC_NATIVE_LEVERAGE.md §4.
    {
      name: 'cacheKeepaliveWorker',
      path: './workers/cacheKeepaliveWorker',
      start: (() => {
        const flag = process.env.CACHE_KEEPALIVE_ENABLED
        if (flag === 'true') return true
        if (flag === 'false') return false
        return process.env.NODE_ENV === 'production'
      })(),
    },
  ]

  for (const w of inlineWorkers) {
    try {
      const mod = require(w.path)
      if (w.start && typeof mod.start === 'function') {
        mod.start()
      }
    } catch (err) {
      logger.debug(`${w.name} not started`, { error: err.message })
    }
  }

  // ── Conductor-detach feature flag ─────────────────────────────────
  // Decision 3993 commit 2/3 (fork_mol0vfnr_78c3e4, 2026-04-30).
  // Once ecodia-conductor is the active owner of these services,
  // setting CONDUCTOR_DETACHED=true on ecodia-api stops the api process
  // from booting them. Default (unset/false) preserves the current
  // behaviour - backward-compatible. See
  // docs/architecture/conductor-process-detach-2026-04-30.md
  const CONDUCTOR_DETACHED = process.env.CONDUCTOR_DETACHED === 'true'
  if (CONDUCTOR_DETACHED) {
    logger.info('CONDUCTOR_DETACHED=true - conductor services delegated to ecodia-conductor process')
  }

  // ── Boot: Scheduler Poller ────────────────────────────────────────
  // Re-enabled 2026-04-20 with:
  // - session-busy gate (checks /api/os-session/status before firing)
  // - energy-adjusted cadence (poll interval / scheduleMultiplier)
  // - critical-energy deferral (non-essential tasks pushed out 1h)
  // The original disable reason (mid-stream interruption) is now covered
  // by the busy gate in schedulerPollerService.isSessionBusy().
  if (!CONDUCTOR_DETACHED) {
    try {
      const schedulerPoller = require('./services/schedulerPollerService')
      schedulerPoller.start()
    } catch (err) {
      logger.warn('Scheduler poller failed to start', { error: err.message })
    }
  }

  // ── Boot: Message Queue Sweep ─────────────────────────────────────
  // Promotes and delivers any messages that have exceeded their max_age_hours.
  // Runs every 30 minutes in-process (backend-internal, does not require OS session).
  if (!CONDUCTOR_DETACHED) {
    try {
      const messageQueue = require('./services/messageQueue')
      messageQueue.startSweepPoller()
    } catch (err) {
      logger.warn('Message queue sweep poller failed to start', { error: err.message })
    }
  }

  // ── Boot: Claim Verifier Worker (OBSERVABILITY_SPEC §3) ───────────
  // Every 30s, sweeps conductor_claims.pending rows claimed in the last
  // 5 minutes and dispatches per-action verifiers (git rev-parse for
  // deployed/committed, email/scheduled/fork table lookups otherwise).
  // Self-guards against overlap via an _inFlight flag.
  if (!CONDUCTOR_DETACHED) {
    try {
      const claimVerifier = require('./workers/claimVerifierWorker')
      claimVerifier.start()
    } catch (err) {
      logger.warn('Claim verifier worker failed to start', { error: err.message })
    }
  }

  // ── Boot: Outbound Email Delay Queue Worker ─────────────────────────
  // Closes the 24h delay-queue safety net: Tate-approved rows ready to
  // send get atomically claimed and dispatched. Audit 2026-05-13 P0 #21
  // (the only consumer for outboundEmailDelayQueue.listReadyToSend).
  if (!CONDUCTOR_DETACHED) {
    try {
      const delayQueueWorker = require('./workers/outboundEmailDelayQueueWorker')
      delayQueueWorker.start()
    } catch (err) {
      logger.warn('Delay queue worker failed to start', { error: err.message })
    }
  }

  // ── Boot: OS Heartbeat ────────────────────────────────────────────
  // Wakes the OS Session periodically with an open-ended "check in" prompt
  // when Tate isn't messaging. Makes the OS genuinely autonomous during the
  // 3-month Africa trip instead of silent until prompted.
  if (!CONDUCTOR_DETACHED) {
    try {
      const osHeartbeat = require('./services/osHeartbeatService')
      osHeartbeat.start()
    } catch (err) {
      logger.warn('OS Heartbeat failed to start', { error: err.message })
    }
  }

  // ── Boot: TLS Cert Monitor ────────────────────────────────────────
  // Hourly check of the production cert's remaining validity. Alerts via
  // email at 14 days (warn), bypasses cooldown at 3 days (urgent). Catches
  // certbot autorenew failures before the cert silently expires mid-trip.
  try {
    const certMonitor = require('./services/certMonitorService')
    certMonitor.start()
  } catch (err) {
    logger.warn('TLS cert monitor failed to start', { error: err.message })
  }

  // ── Boot: Credential Redaction Monitor (§5.1 + §7.2) ──────────────
  // Polls credentialFilter counters every 30s. During the 2h bootstrap
  // window, increments are observed but don't fire. After bootstrap, any
  // increment fires credential_redaction_burst via securityIncidentResponse.
  try {
    const credRedactMonitor = require('./lib/credentialRedactionMonitor')
    const incidentResponse = require('./services/securityIncidentResponse')
    credRedactMonitor.start({
      fireIncident: (args) => incidentResponse.fireIncident(args),
    })
  } catch (err) {
    logger.warn('credentialRedactionMonitor failed to start', { error: err.message })
  }
  process.stderr.write('[boot] post-credentialRedactionMonitor\n')

  // ── Boot: Claude Token Refresh ────────────────────────────────────
  // Proactively refreshes OAuth tokens before they expire so the VPS
  // never needs manual `claude /login`. Runs every 30 min.
  if (!CONDUCTOR_DETACHED) {
    try {
      const tokenRefresh = require('./services/claudeTokenRefreshService')
      tokenRefresh.start()
    } catch (err) {
      logger.warn('Claude token refresh service failed to start', { error: err.message })
    }
  }
  process.stderr.write('[boot] post-claudeTokenRefreshService\n')

  // ── Boot: Security Incident Response wiring (§7.2) ────────────────
  // Injects the four actuator closures the securityIncidentResponse
  // module needs to carry out kill-switch duties:
  //   setEmergencyMode - writes kv_store.system.emergency_mode JSON,
  //     which tier3GateService reads to revoke pending Tier-3 tokens.
  //   pauseCrons - stops the scheduler poller (manual restart to
  //     resume - this is the intended one-way door).
  //   haltForks - iterates forkService.listForks() and calls
  //     abortFork(id, reason) on each in-flight fork. Uses only the
  //     already-exported public API; does not modify forkService.
  //   smsTate - osAlertingService.sendSmsToTate, Twilio SMS
  //     bypassing the alert-cooldown table (incidents are not rate-limited).
  //
  // All closures are defensive: any one throwing must not take down the
  // incident response chain. The module itself wraps each in its own
  // Promise.allSettled; here we just need to not throw synchronously.
  try {
    const ir = require('./services/securityIncidentResponse')
    const schedulerPoller = require('./services/schedulerPollerService')
    const forkService = require('./services/forkService')
    const alerting = require('./services/osAlertingService')

    ir.wireServices({
      setEmergencyMode: async (flag, reason) => {
        try {
          await db`
            INSERT INTO kv_store (key, value)
            VALUES (
              'system.emergency_mode',
              ${JSON.stringify({ active: !!flag, reason: reason || null, at: new Date().toISOString() })}
            )
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
          `
        } catch (err) {
          logger.error('setEmergencyMode: kv_store upsert failed', { error: err.message, flag, reason })
        }
      },
      pauseCrons: () => {
        try { schedulerPoller.stop() } catch (err) {
          logger.error('pauseCrons: schedulerPoller.stop threw', { error: err.message })
        }
      },
      haltForks: async (reason) => {
        try {
          const live = forkService.listForks()
          for (const f of live) {
            if (['done', 'aborted', 'error'].includes(f.status)) continue
            try { await forkService.abortFork(f.fork_id, reason || 'security_incident') }
            catch (err) { logger.warn('haltForks: abortFork failed', { fork_id: f.fork_id, error: err.message }) }
          }
        } catch (err) {
          logger.error('haltForks: listForks threw', { error: err.message })
        }
      },
      // Twilio SMS only. iMessage substrate removed Tate-directed 11 May 2026 16:44 AEST.
      smsTate: async (msg) => {
        try { await alerting.sendSmsToTate(msg) } catch (err) {
          logger.error('smsTate: sendSmsToTate threw', { error: err.message })
        }
      },
    })
  } catch (err) {
    logger.warn('securityIncidentResponse.wireServices failed to boot', { error: err.message })
  }
  process.stderr.write('[boot] post-securityIncidentResponse.wireServices\n')

  // ── Boot: Rescue Service (api-side subscriber) ────────────────────
  // Subscribes to Redis channels published by the ecodia-rescue process
  // and relays rescue events over WS to the frontend. The rescue process
  // itself runs separately (see ecosystem.config.js). If rescue isn't
  // running, this subscriber silently waits - no error.
  try {
    const rescueService = require('./services/rescueService')
    rescueService.start().catch(err => logger.warn('Rescue service start failed', { error: err.message }))
  } catch (err) {
    logger.warn('Rescue service failed to load', { error: err.message })
  }
  process.stderr.write('[boot] post-rescueService\n')

  // ── Boot: Nightly Restart ─────────────────────────────────────────
  // Scheduled `pm2 restart ecodia-api` at 03:00 AEST with a T-5min heads-up
  // (WS broadcast + [SYSTEM] message posted into the OS inbox so it sees
  // the warning in-turn). If the OS is busy at T-0, waits up to 10 min for
  // idle before force-restarting. Disable with NIGHTLY_RESTART_ENABLED=false.
  if (!CONDUCTOR_DETACHED) {
    try {
      const nightlyRestart = require('./services/nightlyRestartService')
      nightlyRestart.start()
    } catch (err) {
      logger.warn('Nightly restart service failed to start', { error: err.message })
    }
  }
  process.stderr.write('[boot] post-nightlyRestartService\n')

  // ── Boot: Process Restart Alert + Alive Beacon ────────────────────
  // Emails Tate when ecodia-api restarts. Uses kv_store to record the
  // previous "I'm alive" beacon timestamp so we can compute prior uptime.
  // Short uptime (<10m) usually means a crash loop - worth knowing.
  try {
    const alerting = require('./services/osAlertingService')
    const row = await db`SELECT value FROM kv_store WHERE key = 'osalive_last'`.catch(() => [])
    const rawPrev = row.length ? row[0].value : null
    const prevAlive = (rawPrev && typeof rawPrev === 'object' && Number.isFinite(rawPrev.ts))
      ? rawPrev.ts
      : Number(typeof rawPrev === 'string' ? rawPrev : NaN)
    const validPrev = Number.isFinite(prevAlive) ? prevAlive : null
    const uptimeMs = validPrev ? Date.now() - validPrev : 0

    // Deploy-sentinel: if a .deploy-sentinel file exists and is <5 min old,
    // this restart is intentional (deploy script wrote it). Skip the alert
    // and clear the sentinel so the next unexpected restart fires normally.
    // Exported to global so the auto-wake block below can see the decision.
    let deployMarker = false
    try {
      const fs = require('fs')
      const path = require('path')
      const sentinelPath = path.join(process.cwd(), '.deploy-sentinel')
      if (fs.existsSync(sentinelPath)) {
        const stat = fs.statSync(sentinelPath)
        const ageMs = Date.now() - stat.mtimeMs
        if (ageMs < 5 * 60 * 1000) {
          deployMarker = true
          logger.info('Deploy sentinel found - skipping restart alert', { ageMs })
        }
        try { fs.unlinkSync(sentinelPath) } catch {}
      }
    } catch (err) {
      logger.debug('Deploy sentinel check failed', { error: err.message })
    }
    // Persist for auto-wake (fires 90s later, after sentinel is gone)
    global.__ecodia_last_restart_was_planned = deployMarker

    if (!deployMarker && validPrev && uptimeMs > 30_000) {
      // Previous beacon >30s ago and no deploy in progress - unplanned restart.
      alerting.alertProcessRestart(uptimeMs).catch(err => logger.debug('bg task error', { err: err.message }))
    }

    // Alive beacon - ticks every 60s. A restart alert will compute prior
    // uptime as (now - beacon), giving a tight bound on silent-death time.
    // JSONB payload so the schema (value JSONB) is honored explicitly.
    const tickAlive = async () => {
      try {
        await db`
          INSERT INTO kv_store (key, value)
          VALUES ('osalive_last', ${{ ts: Date.now() }})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `
      } catch {}
    }
    tickAlive()
    const aliveTimer = setInterval(tickAlive, 60_000)
    if (typeof aliveTimer.unref === 'function') aliveTimer.unref()
  } catch (err) {
    logger.warn('Process restart alert setup failed', { error: err.message })
  }
  process.stderr.write('[boot] post-processRestartAlert\n')

  // ── Boot: Session Auto-Wake ───────────────────────────────────────
  // If a recent handoff state exists, fires a wake message after 15s so the
  // OS resumes interrupted work automatically - no need to wait for Tate.
  try {
    require('./services/sessionAutoWake').triggerAutoWakeIfNeeded()
  } catch (err) {
    logger.warn('Session auto-wake setup failed (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-sessionAutoWake\n')

  // ── Boot: Listener Subsystem ──────────────────────────────────────
  // Always-on in-process Haiku agents that read the WS event stream
  // and handle bookkeeping, memory capture, etc. without interrupting
  // the main OS Opus context. Failure is non-fatal - server stays up.
  try {
    require('./services/listeners').startListenerSubsystem().catch(err => {
      logger.warn('Listener subsystem async boot failed', { error: err.message })
    })
  } catch (err) {
    logger.warn('Listener subsystem failed to start', { error: err.message })
  }
  process.stderr.write('[boot] post-listenerSubsystem\n')

  // ── Boot: Proactivity Engine (Layer 2) ───────────────────────────
  if (!CONDUCTOR_DETACHED) {
    try {
      const proactivityEngine = require('./services/proactivityEngine')
      proactivityEngine.start()
    } catch (err) {
      logger.warn('Proactivity engine failed to start (non-fatal)', { error: err.message })
    }
  }
  process.stderr.write('[boot] post-proactivityEngine\n')

  // ── Boot: Perception Dispatcher (universal domain-reactive listener) ──
  try {
    const perceptionDispatcher = require('./services/perceptionDispatcher')
    perceptionDispatcher.start()
  } catch (err) {
    logger.warn('Perception dispatcher failed to start (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-perceptionDispatcher\n')

  // ── Boot: Filesystem Watcher (publisher for doctrine_authored matcher) ──
  // Watches ~/ecodiaos/patterns/*.md and publishes pattern_file_<created|updated>
  // perception events. Wave C C1, fork_mosn8o5x_7a0e54.
  try {
    const fsWatcher = require('./services/fsWatcher')
    fsWatcher.start()
  } catch (err) {
    logger.warn('fsWatcher failed to start (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-fsWatcher\n')

  // ── Boot: Pattern Evolution (Layer 10) ───────────────────────────
  try {
    const patternEvolution = require('./services/patternEvolution')
    patternEvolution.start()
  } catch (err) {
    logger.warn('Pattern evolution failed to start (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-patternEvolution\n')

  // ── Boot: Attention Economy Observer (Observer C) ─────────────────
  // 5-min poller that checks whether the conductor is working on the
  // highest-leverage task. Not a listener (no stream subscription) —
  // wired here as a setInterval worker. Failure is non-fatal.
  // Companions (Observer A coherence, Observer B actionAudit) are stream
  // listeners registered via the listener subsystem above.
  // Origin: fork_mp27tdp1_eaa05e, 12 May 2026.
  try {
    const attentionEconomy = require('./services/observers/attentionEconomyObserver')
    attentionEconomy.start()
  } catch (err) {
    logger.warn('Attention economy observer failed to start (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-attentionEconomyObserver\n')

  // ── Boot: systemPulse observer (Observer Framework v2) ───────────────
  // Firehose observer that ingests perceptionBus events + Pino warn+error
  // entries + frontend POSTs into pulseEventBuffer, and runs a rolling
  // Haiku state-summary every 5min with anomaly detection. Anomalies
  // surface to the conductor via the standard observer_signals channel.
  // Non-fatal: failure here never blocks boot.
  // Origin: Observer Framework v2, 13 May 2026.
  try {
    const systemPulse = require('./services/observers/systemPulseObserver')
    systemPulse.start()
  } catch (err) {
    logger.warn('systemPulse observer failed to start (non-fatal)', { error: err.message })
  }
  process.stderr.write('[boot] post-systemPulseObserver\n')

  // ── Boot: Dashboard Note Observers (Phase 11) ─────────────────────
  // Four Haiku-powered polling observers that write ambient notes to
  // dashboard_notes for display in the frontend NotesPanel. All are
  // non-fatal; observer failure never blocks server startup.
  // Origin: fork_mp3ziqzn_34ac39, 2026-05-13.
  const dashNoteObservers = [
    { name: 'dashboardNotePattern',    path: './services/observers/dashboardNotePatternObserver' },
    { name: 'dashboardNoteCadence',    path: './services/observers/dashboardNoteCadenceObserver' },
    { name: 'dashboardNoteConnection', path: './services/observers/dashboardNoteConnectionObserver' },
    { name: 'dashboardNoteProgress',   path: './services/observers/dashboardNoteProgressObserver' },
  ]
  for (const { name, path } of dashNoteObservers) {
    try {
      require(path).start()
    } catch (err) {
      logger.warn(`${name} observer failed to start (non-fatal)`, { error: err.message })
    }
  }
  process.stderr.write('[boot] post-dashboardNoteObservers\n')

  // ── Boot: Dashboard Notes Cleanup (hourly) ────────────────────────
  // Purge expired notes so the table stays small and ephemeral.
  const _dashNotesCleanup = async () => {
    try {
      const dbPg = require('./config/db')
      await dbPg`DELETE FROM dashboard_notes WHERE expires_at < NOW()`
    } catch (err) {
      logger.debug('dashboard_notes cleanup error (non-fatal)', { error: err.message })
    }
  }
  // Run once after 5 minutes, then hourly
  setTimeout(() => {
    _dashNotesCleanup().catch(err => logger.debug('bg task error', { err: err.message }))
    setInterval(() => _dashNotesCleanup().catch(err => logger.debug('bg task error', { err: err.message })), 60 * 60 * 1000)
  }, 5 * 60 * 1000)
})

// ── Boot: Conditional Auto-wake OS Session ───────────────────────────
// Re-enabled 2026-04-20 with strict conditions to avoid the old bug
// (auto-wake colliding with a real user message during boot).
//
// Only fires when ALL true:
//   1. This was an UNPLANNED restart (no .deploy-sentinel). Planned deploys
//      don't need auto-wake because Tate is right there deploying.
//   2. A recent breadcrumb exists (<30min old). Means there was an active
//      conversation to resume. No breadcrumb = cold start, don't invent work.
//   3. 60 seconds pass with no real user message. If the user texts/messages
//      during that window their message wins, auto-wake defers.
//
// Fires ONE heartbeat-style turn. The breadcrumb is stitched in by the
// existing recovery path so the OS rehydrates and picks up naturally.
setTimeout(async () => {
  try {
    // Condition 1: unplanned restart. Decision was made at boot and stashed
    // on `global.__ecodia_last_restart_was_planned` because the .deploy-
    // sentinel file is consumed/deleted during the process-restart alert
    // block above - by the time this setTimeout fires the file is gone.
    if (global.__ecodia_last_restart_was_planned === true) {
      logger.info('Auto-wake skipped: last restart was a planned deploy')
      return
    }

    // Condition 2: recent breadcrumb
    const db = require('./config/db')
    const bcRows = await db`SELECT value FROM kv_store WHERE key = 'session.last_breadcrumb'`.catch(() => [])
    const raw = bcRows?.[0]?.value
    let bc = null
    if (raw && typeof raw === 'object') bc = raw
    else if (typeof raw === 'string') { try { bc = JSON.parse(raw) } catch {} }
    if (!bc || !Number.isFinite(bc.ts)) {
      logger.info('Auto-wake skipped: no breadcrumb (cold start)')
      return
    }
    const ageMs = Date.now() - bc.ts
    if (ageMs > 30 * 60 * 1000) {
      logger.info('Auto-wake skipped: breadcrumb too old', { ageMin: Math.round(ageMs / 60000) })
      return
    }

    // Condition 3: no user activity since boot. If the OS is currently
    // streaming (Tate messaged during / just after boot), the busy check
    // fails and we bail.
    const osSession = require('./services/osSessionService')
    const status = await osSession.getStatus().catch(() => null)
    if (status?.active || status?.status === 'streaming') {
      logger.info('Auto-wake skipped: user message arrived during grace window')
      return
    }

    // Fire the wake. Prompt is deliberately minimal - breadcrumb stitching
    // in _sendMessageImpl does the heavy lifting of restoring context.
    logger.info('Auto-wake: firing OS rehydration turn')
    const osIncident = require('./services/osIncidentService')
    osIncident.log({
      kind: 'subsystem_recovered',
      severity: 'info',
      component: 'os_session',
      message: 'auto-wake fired after unplanned restart with recent breadcrumb',
      context: { breadcrumbAgeMin: Math.round(ageMs / 60000) },
    })
    await osSession.sendMessage(
      '[AUTO_WAKE] ecodia-api just restarted unexpectedly ~' +
      Math.round(ageMs / 60000) + ' min ago. The <recent_exchanges> block in this message is the literal tail of the conversation you were in the middle of. ' +
      'Pick up naturally - continue whatever was in flight. Do NOT summarise the gap, do NOT announce that you restarted, do NOT ask Tate to repeat himself. If the last exchange is complete and nothing is pressing, stay silent (empty response is fine). Tate should not notice the restart at all.'
    ).catch(err => logger.warn('Auto-wake turn failed', { error: err.message }))
  } catch (err) {
    logger.warn('Auto-wake setup failed', { error: err.message })
  }
}, 90_000)  // 90s = 30s for boot to settle + 60s grace already baked into the prompt flow. Timer starts fresh.
