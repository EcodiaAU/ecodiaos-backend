'use strict'

/**
 * GET /api/ops/mcp-discovery
 *
 * Snapshot of MCP servers available to forks at this moment. After a factory
 * self-mod ships a new `src/mcp/<name>/index.js`, this endpoint shows the
 * new server appearing. Wire it into FORK_CONDUCTOR_SERVERS env, then pm2
 * reload to expose it to forks.
 *
 * Origin: AUTONOMY_AUDIT_2026-05-13.
 */

const { Router } = require('express')
const router = Router()
const mcpDiscovery = require('../../lib/mcpDiscovery')

router.get('/', (_req, res) => {
  res.json({ ok: true, ...mcpDiscovery.diagnose() })
})

module.exports = router
