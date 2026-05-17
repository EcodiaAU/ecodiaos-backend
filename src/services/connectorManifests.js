'use strict'

/**
 * connectorManifests - CONNECTORS registry for Phase 2 Lane 10 domain-scoped
 * MCP endpoints (2026-05-15).
 *
 * STUB: Real CONNECTORS object maps connector names to their stdio server
 * config, bearer scope, and mountPath. Currently empty so app.js
 * mountDomainScopedConnectors() loop iterates zero entries (safe no-op).
 *
 * See: backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md
 * Connectors planned:
 *   ecodia-core, ecodia-comms, ecodia-code, ecodia-money, ecodia-shell,
 *   ecodia-supabase, ecodia-scheduler, ecodia-crm, ecodia-graph, ecodia-factory
 */

const CONNECTORS = {
  // Populated when each stdio MCP server is wired (Phase 2 Lane 10).
  // Each entry shape:
  //   name: string          connector identifier (matches PUBLIC_PATH_PATTERNS)
  //   mountPath: string     path segment under /api/mcp/
  //   stdioCommand: string  path to the MCP server binary / node script
  //   bearerScope: string   scope to check in the bearer token
}

module.exports = { CONNECTORS }
