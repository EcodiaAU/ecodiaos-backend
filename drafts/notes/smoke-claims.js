// Smoke-test conductorClaimsService against live DB.
// Loads DATABASE_URL from D:/.code/eos-laptop-agent/.env (canonical local copy).
const fs = require('fs')
const path = require('path')

const envText = fs.readFileSync('D:/.code/eos-laptop-agent/.env', 'utf-8')
for (const line of envText.split('\n')) {
  const s = line.trim()
  if (!s || s.startsWith('#') || !s.includes('=')) continue
  const [k, v] = s.split('=', 2)
  if (!process.env[k.trim()]) process.env[k.trim()] = v.trim().replace(/^["']|["']$/g, '')
}
// Required by env validation in the EcodiaOS backend bundle.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-jwt-secret-32characters-long!'
process.env.DASHBOARD_PASSWORD_HASH = process.env.DASHBOARD_PASSWORD_HASH || '$2a$10$smokesmokesmokesmokesmoke'
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)

const claims = require('D:/.code/EcodiaOS/backend/src/services/conductorClaimsService.js')

;(async () => {
  const ref = 'smoke-ref-' + Date.now()
  const A = 'smoke-conductor-A'
  const B = 'smoke-conductor-B'

  console.log('--- test 1: A acquires, B blocked ---')
  const r1 = await claims.acquire({ entity_type: 'custom', entity_ref: ref, conductor_id: A, ttl_minutes: 1 })
  console.log('A acquire:', JSON.stringify(r1))
  const r2 = await claims.acquire({ entity_type: 'custom', entity_ref: ref, conductor_id: B, ttl_minutes: 1 })
  console.log('B acquire (should fail):', JSON.stringify(r2))

  console.log('--- test 2: A releases, B can take it ---')
  const rel = await claims.release(r1.claim.id, { outcome: 'smoke_done' })
  console.log('A release:', JSON.stringify(rel))
  const r3 = await claims.acquire({ entity_type: 'custom', entity_ref: ref, conductor_id: B, ttl_minutes: 1 })
  console.log('B acquire (should succeed):', JSON.stringify(r3))

  console.log('--- test 3: B touches, then withClaim wrapper ---')
  const t = await claims.touch(r3.claim.id, { ttl_minutes: 5 })
  console.log('B touch:', JSON.stringify(t))
  await claims.release(r3.claim.id, { outcome: 'smoke_cleanup' })

  const wc = await claims.withClaim(
    { entity_type: 'custom', entity_ref: ref + '-wc', conductor_id: A, ttl_minutes: 1 },
    async (claim) => {
      console.log('withClaim body running with claim id', claim.id)
      return { did: 'work' }
    },
  )
  console.log('withClaim result:', JSON.stringify(wc))

  console.log('--- test 4: sweep no-op ---')
  const sw = await claims.sweep()
  console.log('sweep:', JSON.stringify(sw))

  console.log('OK')
  process.exit(0)
})().catch(err => { console.error('FAIL:', err.message, err.stack); process.exit(1) })
