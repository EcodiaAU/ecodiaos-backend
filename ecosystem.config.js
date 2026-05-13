// Sync deps if package-lock.json changed since last run. Cheap no-op when
// nothing's changed (one sha256sum). Runs once per `pm2 start/restart/reload`
// invocation, not once per app, because the config is evaluated once.
// See scripts/ensure-deps.sh.
try {
  require('child_process').execFileSync('bash', ['scripts/ensure-deps.sh'], {
    cwd: '/home/tate/ecodiaos',
    stdio: 'inherit',
  })
} catch (err) {
  console.error('[ecosystem] ensure-deps failed - continuing anyway:', err.message)
}

const COMMON = {
  cwd: '/home/tate/ecodiaos',
  watch: false,
  max_restarts: 200, // bumped from 20 after Apr 15-19 outage: PM2 gave up on api after Anthropic credential pause caused crash storm. External watchdog (scripts/api-watchdog.sh) is the real safety net but raise this so PM2 doesn't bail prematurely.
  min_uptime: '10s',
  restart_delay: 2000,
  exp_backoff_restart_delay: 100,
  kill_timeout: 45000,
  env: { NODE_ENV: 'production' },
}
module.exports = {
  apps: [
    // max_memory_restart raised 2G -> 3G on 8 May 2026 (fork_mowu3mib_992987) to
    // reduce fork-killing PM2 reaps. SDK forks run in-process inside ecodia-api
    // (CONDUCTOR_DETACHED never activated, see docs/architecture/conductor-process-detach-2026-04-30.md).
    // 36 api_memory_restart events in the prior 7 days killed forks at avg age
    // 410s. System has 3.5G+ available headroom; 3G ceiling is safe in practice.
    // The durable architectural fix is Option B (activate ecodia-conductor) per
    // ~/ecodiaos/drafts/fork-survival-options-2026-05-08.md. This is the cheap
    // ~30% reduction that ships tonight without pm2 reload (takes effect on
    // next natural api restart).
    // CONDUCTOR_DETACHED=true tells ecodia-api to proxy /message, /abort, /status,
    // and /save-state to the ecodia-conductor loopback server on 127.0.0.1:3002
    // instead of calling osSessionService in-process.  Takes effect on the NEXT
    // pm2 restart ecodia-api (Phase 3 activation step).  Belt-and-braces alongside
    // the route-level flag read from process.env.CONDUCTOR_DETACHED.
    // Phase 2 bridge: fork_mp1mrgs4_f2ba17, 12 May 2026.
    { ...COMMON, name: 'ecodia-api', script: 'src/server.js', max_memory_restart: '3G', env: { ...COMMON.env, PORT: 3001, OS_CONV_LOG_ENABLED: 'true', KG_CONTEXT_MAX_DEPTH: '3', KG_CONTEXT_MAX_SEEDS: '8', CONDUCTOR_DETACHED: 'true' } },
    // Meeting recorder - decoupled from ecodia-api so API restarts don't drop
    // in-flight chunk uploads. Handles all /api/meetings/* routes. Nginx routes
    // /api/meetings/* → :3003 before the catch-all → :3001.
    // Origin: fork_mp26bxy3_2dccf4, 2026-05-12. See drafts/meeting-recorder-decoupling-proposal-2026-05-12.md
    { ...COMMON, name: 'ecodia-meetings', script: 'src/meetingsServer.js', max_memory_restart: '512M', env: { ...COMMON.env, MEETINGS_PORT: 3003 } },
    // Factory runner - owns all CC session child processes.
    // Runs separately from ecodia-api so CC sessions survive API restarts (e.g. self-modification deploys).
    // Communicates with ecodia-api via Redis pub/sub (factoryBridge).
    { ...COMMON, name: 'ecodia-factory', script: 'src/workers/factoryRunner.js', max_memory_restart: '3G', max_restarts: 10, restart_delay: 5000 },
    // Rescue - narrow coding-focused CC session that stays alive when
    // ecodia-api is wedged. Always running but idle until a message is
    // sent via the rescue bridge. See src/rescue/rescueRunner.js.
    { ...COMMON, name: 'ecodia-rescue', script: 'src/rescue/rescueRunner.js', max_memory_restart: '1G', max_restarts: 50, restart_delay: 3000, env: { ...COMMON.env, RESCUE_REPO_PATH: '/home/tate/ecodiaos' } },
    // Conductor - owns the Claude Agent SDK stream + cron poller +
    // os-session message queue + OS heartbeat + Claude token refresh +
    // nightly restart. Detached from ecodia-api so api hot-reloads
    // (max_memory_restart, deploys, nightly restart) no longer kill
    // the in-flight conductor session.
    //
    // Decision 3993 commit 2/3 (fork_mol0vfnr_78c3e4, 2026-04-30).
    // See docs/architecture/conductor-process-detach-2026-04-30.md
    // for the multi-phase activation plan. The CONDUCTOR_DETACHED env
    // var on ecodia-api flips conductor service boot OFF in api once
    // ecodia-conductor is taking over.
    // CONDUCTOR_LOOPBACK_PORT: loopback HTTP server port (default 3002).
    // CONDUCTOR_LOOPBACK_SECRET is NOT set here - it is read from
    // kv_store.creds.conductor_loopback_secret at boot time so the value
    // never appears in a committed file.  See docs/secrets/conductor-loopback-secret.md.
    // CONDUCTOR_OWNS_WORKERS: 'true' added Phase 3 activation (fork_mp1wwwl0_6d2263, 12 May 2026).
    //   Phase 2 bridge: fork_mp1mrgs4_f2ba17. Phase 2 follow-up (bearer + worker gate): fork_mp1n7bm3_a5d11f.
    //   Phase 3: conductor now owns all workers (cron poller, os-session queue, listeners).
    //   ecodia-api keeps CONDUCTOR_DETACHED=true and proxies session calls to 127.0.0.1:3002.
    // max_memory_restart raised 2G -> 3G on 13 May 2026 (fork_mp3blcb9_767722) to
    // match the same fix applied to ecodia-api on 8 May 2026. After Phase 3
    // activation (fork_mp1wwwl0_6d2263, 12 May 2026) forks run in ecodia-conductor
    // (CONDUCTOR_OWNS_WORKERS=true), not ecodia-api. The 2G ceiling was triggering
    // PM2 max_memory_restart during fork-heavy sessions (4 concurrent Claude SDK
    // streams), killing all in-flight forks. recoverStaleForks() then stamps them
    // abort_reason='api_memory_restart' (misleading label - conductor, not api).
    // VPS has 8GB total / ~4GB available; 3G ceiling is safe in practice.
    { ...COMMON, name: 'ecodia-conductor', script: 'src/conductor.js', max_memory_restart: '3G', max_restarts: 200, restart_delay: 2000, env: { ...COMMON.env, CONDUCTOR_PROCESS: 'true', OS_CONV_LOG_ENABLED: 'true', KG_CONTEXT_MAX_DEPTH: '3', KG_CONTEXT_MAX_SEEDS: '8', CONDUCTOR_LOOPBACK_PORT: '3002', CONDUCTOR_OWNS_WORKERS: 'true' } },
    // ─────────────────────────────────────────────────────────────────
    // DISABLED 2026-04-15 - OS Session is the sole driver of work.
    // It invokes poll/consolidate/embed functions on-demand as tools.
    // Autonomous loops were interrupting the SDK stream and corrupting
    // session state. Worker source files remain in src/workers/ so OS
    // Session can call their exported functions directly.
    // ─────────────────────────────────────────────────────────────────
    // { ...COMMON, name: 'ecodia-gmail', script: 'src/workers/gmailPoller.js' },
    // { ...COMMON, name: 'ecodia-linkedin', script: 'src/workers/linkedinWorker.js', max_restarts: 30, restart_delay: 5000 },
    // { ...COMMON, name: 'ecodia-finance', script: 'src/workers/financePoller.js' },
    // { ...COMMON, name: 'ecodia-kg-embed', script: 'src/workers/kgEmbeddingWorker.js' },
    // { ...COMMON, name: 'ecodia-kg-consolidation', script: 'src/workers/kgConsolidationWorker.js' },
  ],
}
