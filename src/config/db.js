const postgres = require('postgres')
const env = require('./env')
const logger = require('./logger')

// Supabase's pgbouncer pooler closes idle connections silently after ~60s.
// postgres.js doesn't always notice before the next write lands, which
// surfaces as `write CONNECTION_ENDED aws-1-ap-southeast-2.pooler.supabase.com`.
// prepare:false is non-negotiable for pgbouncer transaction-pool mode -
// without it, prepared statements get cached on a backend connection that
// the next query is routed to a different backend, surfacing as
// `prepared statement "abc123" does not exist` and silently rolling back
// writes (bookkeeperService.postStagedTransaction lost 11 ba_ecodia ledger
// posts to this exact bug on 2026-05-28 to 2026-05-29).
const db = postgres(env.DATABASE_URL, {
  max: parseInt(env.DB_POOL_MAX || '10'),
  idle_timeout: parseInt(env.DB_IDLE_TIMEOUT || '20'),
  connect_timeout: parseInt(env.DB_CONNECT_TIMEOUT || '10'),
  max_lifetime: parseInt(env.DB_MAX_LIFETIME || '600'),
  prepare: false,
  onnotice: () => {},
})

module.exports = db
