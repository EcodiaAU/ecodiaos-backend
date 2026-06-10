'use strict'

/**
 * ecodia-climate MCP connector - manifest (climate-disclosure W7).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W7)
 *
 * Shape mirrors one entry of src/services/connectorManifests.js CONNECTORS
 * exactly (name / title / mountPath / bearerKey / clientId / scopes / tools)
 * so the bearer middleware (src/middleware/connectorAuth.js) and the OAuth
 * registration script can consume it unchanged.
 *
 * DELIBERATELY NOT added to connectorManifests.CONNECTORS:
 *   1. connectorManifests._validateScopes() throws at boot for any scope
 *      outside ecodiaFullScope.SCOPES, and the climate scopes are climate-only
 *      by design (client evidence never shares a permission lattice with the
 *      EcodiaOS organs).
 *   2. app.js auto-mounts every CONNECTORS entry; this connector is
 *      client-gated (W10) and must stay unmounted until provisioning day.
 * Mount is one line in app.js (see the inert commented registration there).
 *
 * Scope model (checked against req.connectorScopes by the router, same
 * mechanics + error envelope as ecodiaFullScope.requireScope):
 *   read.climate  - all query/read tools, including cd_integrity_check
 *                   (whose integrity_ok/integrity_fail monitoring event is
 *                   intrinsic to the check per the health-canary doctrine)
 *   write.climate - engagement/evidence/calc/draft/event writes
 */

const CLIMATE_SCOPES = Object.freeze(['read.climate', 'write.climate'])

const CD_TOOL_NAMES = Object.freeze([
  'cd_engagement_create',
  'cd_engagement_query',
  'cd_evidence_stage',
  'cd_evidence_commit',
  'cd_register_query',
  'cd_coverage_query',
  'cd_calc_run',
  'cd_draft_upsert',
  'cd_drafts_query',
  'cd_pack_export',
  'cd_integrity_check',
  'cd_event_log',
])

const CONNECTOR = Object.freeze({
  name: 'ecodia-climate',
  title: 'EcodiaOS Climate',
  mountPath: 'ecodia-climate',
  bearerKey: 'creds.ecodia_climate_mcp_bearer',
  clientId: 'ecodia_climate_connector',
  scopes: CLIMATE_SCOPES,
  tools: CD_TOOL_NAMES,
})

module.exports = { CONNECTOR, CD_TOOL_NAMES, CLIMATE_SCOPES }
