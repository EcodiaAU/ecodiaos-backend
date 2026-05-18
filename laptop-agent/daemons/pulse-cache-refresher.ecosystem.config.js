// PM2 ecosystem for the Corazon-local pulse-cache-refresher daemon.
//
// Boot:
//   pm2 start backend/laptop-agent/daemons/pulse-cache-refresher.ecosystem.config.js
//   pm2 save && pm2 startup
//
// Logs:
//   pm2 logs pulse-cache-refresher
//   pm2 logs pulse-cache-refresher --err
//
// Cache file:
//   C:/Users/tjdTa/.claude/hooks/ecodia/state/pulse_blocks_cache.txt
//
// Env vars:
//   ECODIA_FULL_BEARER          - required; bearer for /api/mcp/ecodia-full
//   ECODIA_FULL_MCP_URL         - optional override (defaults to
//                                 https://api.admin.ecodia.au/api/mcp/ecodia-full)
//   PULSE_CACHE_PATH            - optional override for cache file path
//   PULSE_REFRESH_TICK_MS       - optional, default 30000 (30s)
//   PULSE_HTTP_TIMEOUT_MS       - optional, default 8000 (8s)

const path = require('path')

module.exports = {
  apps: [
    {
      name: 'pulse-cache-refresher',
      script: path.join(__dirname, 'pulse-cache-refresher.js'),
      cwd: __dirname,
      watch: false,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '128M',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
