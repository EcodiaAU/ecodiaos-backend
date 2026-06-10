'use strict'

/**
 * ecodia-climate - dedicated DB client (climate-disclosure W7).
 *
 * Client evidence lives in the DEDICATED `ecodia-climate` Supabase project,
 * NEVER the EcodiaOS substrate project (04-substrate-build-spec, Placement
 * decisions). So this module is a sibling of src/config/db.js, not a reuse
 * of it: same postgres.js client convention, same pgbouncer-safe options
 * (prepare:false is non-negotiable for transaction-pool mode, see the
 * 2026-05-28 lost-ledger-posts note in src/config/db.js), but pointed at
 * CLIMATE_DATABASE_URL (service-role pooler URL, minted on provisioning day,
 * stored beside the other cred values - kv_store / PRIVATE/ecodia-creds).
 *
 * Lazy: the project is client-gated (W10) and does not exist yet, so nothing
 * may connect (or throw) at require time. Handlers receive the client via the
 * router; tests inject a stub and never touch this module.
 */

const postgres = require('postgres')

let _client = null

function getClimateDb() {
  if (_client) return _client
  const url = process.env.CLIMATE_DATABASE_URL
  if (!url) {
    const err = new Error(
      'CLIMATE_DATABASE_URL not set: the dedicated ecodia-climate Supabase project is client-gated (W10) and has not been provisioned, or the env var was not injected'
    )
    err.code = 'climate_db_unprovisioned'
    err.httpStatus = 503
    throw err
  }
  _client = postgres(url, {
    max: parseInt(process.env.CLIMATE_DB_POOL_MAX || '5', 10),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 600,
    prepare: false,
    onnotice: () => {},
  })
  return _client
}

/** Test seam only. */
function _resetForTests() {
  _client = null
}

module.exports = { getClimateDb, _resetForTests }
