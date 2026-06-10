'use strict'

/**
 * ecodia-climate MCP connector - public surface (climate-disclosure W7).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W7)
 *
 * The router lives at src/routes/mcp/ecodiaClimate.js (beside the sibling
 * connector shims); this module is the service-side surface: the connector
 * manifest, the 12 cd_* tool definitions (explicit zod schemas + handlers),
 * and the dedicated-project DB client.
 */

const { CONNECTOR, CD_TOOL_NAMES, CLIMATE_SCOPES } = require('./manifest')
const { TOOLS, TOOL_MAP, getTool, toolError, normaliseForChain, appendEvidenceRow } = require('./tools')
const { getClimateDb } = require('./climateDb')

module.exports = {
  CONNECTOR,
  CD_TOOL_NAMES,
  CLIMATE_SCOPES,
  TOOLS,
  TOOL_MAP,
  getTool,
  toolError,
  normaliseForChain,
  appendEvidenceRow,
  getClimateDb,
}
