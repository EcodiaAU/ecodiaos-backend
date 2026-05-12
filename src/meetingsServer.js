'use strict'
/**
 * meetingsServer.js - standalone meeting-recorder process.
 *
 * Listens on MEETINGS_PORT (default 3003). Handles all /api/meetings/*
 * routes. Deliberately decoupled from ecodia-api so API restarts
 * (deploys, nightly cron, conductedRestart) do not kill in-flight
 * recording chunk uploads.
 *
 * Chunks go to Supabase Storage immediately on receipt - the only
 * coupling to this process is the short HTTP window when a chunk POST
 * arrives. Nginx routes /api/meetings/* to :3003; everything else
 * continues to :3001 (ecodia-api).
 *
 * See ~/ecodiaos/drafts/meeting-recorder-decoupling-proposal-2026-05-12.md
 * Origin: fork_mp26bxy3_2dccf4, 2026-05-12.
 */

const express = require('express')
const cors = require('cors')
const logger = require('./config/logger')

const app = express()

// Same CORS allowlist as ecodia-api/app.js
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://admin.ecodia.au',
      'http://localhost:5173',
      'https://claude.ai',
      'https://anthropic.com',
    ]
    if (!origin) return callback(null, true)
    if (allowed.includes(origin)) return callback(null, true)
    if (origin.endsWith('.vercel.app')) return callback(null, true)
    if (origin.endsWith('.claude.ai')) return callback(null, true)
    if (origin.endsWith('.anthropic.com')) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
}))

app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: false }))

// Liveness probe - no deps
app.get('/api/healthz', (_req, res) =>
  res.json({ ok: true, service: 'ecodia-meetings', pid: process.pid, uptime: process.uptime(), ts: Date.now() })
)
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'ecodia-meetings' })
)

app.use('/api/meetings', require('./routes/meetings'))

const PORT = Number(process.env.MEETINGS_PORT) || 3003
app.listen(PORT, '127.0.0.1', () => {
  logger.info(`[ecodia-meetings] listening on :${PORT}`)
})
