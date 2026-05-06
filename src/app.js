const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const errorHandler = require('./middleware/errorHandler')
const logger = require('./config/logger')

const authRoutes = require('./routes/auth')
const financeRoutes = require('./routes/finance')
const gmailRoutes = require('./routes/gmail')
const linkedinRoutes = require('./routes/linkedin')
const crmRoutes = require('./routes/crm')
const claudeCodeRoutes = require('./routes/claudeCode')
const taskRoutes = require('./routes/tasks')
const settingsRoutes = require('./routes/settings')
const kgRoutes = require('./routes/knowledgeGraph')
const codebaseRoutes = require('./routes/codebase')
const workerRoutes = require('./routes/workers')
const driveRoutes = require('./routes/drive')
const vercelRoutes = require('./routes/vercel')
const metaRoutes = require('./routes/meta')
const actionQueueRoutes = require('./routes/actionQueue')
const contextTrackingRoutes = require('./routes/contextTracking')
const kgExplorerRoutes = require('./routes/kgExplorer')
const momentumRoutes = require('./routes/momentum')
const internalCortexStateRoutes = require('./routes/internalCortexState')
const bookkeepingRoutes = require('./routes/bookkeeping')
const codingRoutes = require('./routes/coding')
const app = express()

// Middleware
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://admin.ecodia.au',
      'http://localhost:5173',
      // Anthropic - claude.ai custom MCP connector + general Anthropic surfaces.
      // Bare + subdomain forms (mcp.claude.ai, etc.) per Anthropic's MCP fetcher.
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
  // MCP fetcher sends Mcp-Session-Id + Mcp-Protocol-Version on streamable-http.
  // Authorization for bearer-gated tools/call. X-Requested-With kept for legacy.
  allowedHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'X-Requested-With'],
}))
app.use(compression())

// ── Webhook routes - MUST mount BEFORE express.json() ───────────────────
// Vercel + Stripe webhook handlers need the raw request body for HMAC
// signature verification. Each router declares its own express.raw() body
// parser scoped to the route, so once we hand the request off the global
// JSON middleware below cannot strip the bytes we need to verify.
// (Wave C C1, fork_mosn8o5x_7a0e54, 5 May 2026)
app.use('/api/webhooks/vercel', require('./routes/webhooks/vercel'))
app.use('/api/webhooks/stripe', require('./routes/webhooks/stripe'))

app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: false }))

// ─── HTTP access log ─────────────────────────────────────────────────
// Every inbound request gets one structured log line on finish: method,
// path, status, duration. Critical for triage: without it you cannot tell
// whether a "hung" OS turn actually received its request or not.
//
// Skips /api/healthz and /api/health (polled by monitors, would drown
// the log). Skips static /api/files (not useful to log an asset URL).
app.use((req, res, next) => {
  if (req.path === '/api/healthz' || req.path === '/api/health') return next()
  if (req.path.startsWith('/api/files')) return next()
  const startedAt = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - startedAt
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info'
    logger[level]('HTTP', {
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      ms,
      ip: req.ip,
      // User-Agent is too noisy for the default line; add on demand via debug.
    })
  })
  next()
})

// Health check (no auth) - heavier, includes route registration signal.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Ultra-lightweight liveness probe for external monitors (and the rescue
// process). No DB, no Neo4j, no shared state - just "the event loop is
// alive and Express is responding." If this fails, the process is dead.
app.get('/api/healthz', (_req, res) => {
  res.json({ ok: true, pid: process.pid, uptime: process.uptime(), ts: Date.now() })
})

// Static file serving - generated docs, invoices, reports (no auth needed, files are not guessable)
const path = require('path')
app.use('/api/files', express.static(path.join(__dirname, '../public')))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/gmail', gmailRoutes)
app.use('/api/linkedin', linkedinRoutes)
app.use('/api/crm', crmRoutes)
app.use('/api/cc', claudeCodeRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/kg', kgRoutes)
app.use('/api/codebase', codebaseRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/drive', driveRoutes)
app.use('/api/vercel', vercelRoutes)
app.use('/api/meta', metaRoutes)
app.use('/api/actions', actionQueueRoutes)
app.use('/api/context', contextTrackingRoutes)
app.use('/kg-explorer', kgExplorerRoutes)
app.use('/api/momentum', momentumRoutes)
app.use('/internal/cortex-state', internalCortexStateRoutes)
app.use('/api/bookkeeping', bookkeepingRoutes)
app.use('/api/coding', codingRoutes)
const xeroRoutes = require('./routes/xero')
app.use('/api/xero', xeroRoutes.publicRouter)
app.use('/api/xero', xeroRoutes)
const canvaRoutes = require('./routes/canva')
app.use('/api/canva', canvaRoutes.publicRouter)
app.use('/api/canva', canvaRoutes)
app.use('/api/message-queue', require('./routes/messageQueue'))
app.use('/api/os-session', require('./routes/osSession'))
app.use('/api/sms', require('./routes/smsWebhook'))
app.use('/api/docs', require('./routes/documents'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/rescue', require('./routes/rescue'))
app.use('/api/triage', require('./routes/triage'))
app.use('/api/telemetry', require('./routes/telemetry'))
app.use('/api/hands', require('./routes/hands'))
app.use('/api/mcp/cowork', require('./routes/mcp/cowork'))
app.use('/api/ops', require('./routes/ops'))
// /api/ops/listener-stats - perception-bus matcher + listener telemetry (B3, fork_mosmjqi4_20c41a)
app.use('/api/ops/listener-stats', require('./routes/ops/listenerStats'))
app.use('/api/dispatch-queue', require('./routes/dispatchQueue'))

// Error handler (must be last)
app.use(errorHandler)

module.exports = app
