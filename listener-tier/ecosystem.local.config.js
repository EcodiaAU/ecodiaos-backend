// PM2 ecosystem for the Corazon-local listener tier.
//
// Boot:
//   pm2 start backend/listener-tier/ecosystem.local.config.js
//   pm2 save && pm2 startup
//
// Logs:
//   pm2 logs eos-listener-tier
//   pm2 logs eos-listener-tier --err
//
// Health:
//   /listener-health  (skill at ~/.claude/skills/listener-health/SKILL.md)
//
// Env vars:
//   COWORK_MCP_BEARER  - required for kv_store heartbeats and P3 row creation
//   LISTENER_TIER_GIT_DIR - override for commit-pattern-detector (default: <backend>/../.git)

const path = require('path')

module.exports = {
  apps: [
    {
      name: 'eos-listener-tier',
      script: path.join(__dirname, 'runner.js'),
      cwd: __dirname,
      watch: false,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '256M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        // Backend is its own git repo at D:/.code/ecodiaos/backend/.git
        // (not the parent D:/.code/ecodiaos/). Override the default so the
        // commit-pattern-detector listener can resolve. 2026-05-18 ship.
        LISTENER_TIER_GIT_DIR: 'D:\\.code\\ecodiaos\\backend\\.git',
      },
    },
  ],
}
