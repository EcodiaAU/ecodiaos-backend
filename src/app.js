const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const errorHandler = require('./middleware/errorHandler')
const auth = require('./middleware/auth')
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
    // Single-operator admin posture. CORS is the FIRST gate, not the only
    // one — every /api/* route is auth-gated below by appAuth (unless on
    // PUBLIC_PATH_ALLOWLIST). Specific subdomains only; no wildcard
    // *.vercel.app / *.claude.ai (those let any free preview deploy carry
    // credentialled requests cross-origin against admin.ecodia.au).
    const allowed = [
      'https://admin.ecodia.au',
      'https://ecodia.au',
      'http://localhost:5173',
      // Anthropic claude.ai MCP custom connector (bare host only).
      'https://claude.ai',
      'https://anthropic.com',
    ]
    if (!origin) return callback(null, true)
    if (allowed.includes(origin)) return callback(null, true)
    // Tight subdomain allowlist for Ecodia's own Vercel deploys only.
    if (origin === 'https://ecodia-admin-frontend.vercel.app') return callback(null, true)
    if (/^https:\/\/ecodia-admin-frontend(-[\w-]+)?\.vercel\.app$/.test(origin)) return callback(null, true)
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

// Lane D fire-shim webhooks (2026-05-15) - parallel-mounted alongside the
// existing handlers during Phase 2 side-by-side validation. Each shim
// verifies its source-specific signature, dedupes via kv_store, and forwards
// the parsed payload to the corresponding Routine's /fire endpoint via
// kv_store.cowork.routine_registry.<account>.<routine_name>. After Phase 3
// cutover the existing /api/webhooks/{vercel,stripe} mounts are removed and
// these shims become the sole entry points. See backend/patterns/
// webhook-fire-shim-architecture-2026-05-15.md.
app.use('/api/webhooks/resend', require('./routes/webhooks/resend-fire-shim'))
app.use('/api/webhooks/stripe-fire', require('./routes/webhooks/stripe-fire-shim'))
app.use('/api/webhooks/vercel-fire', require('./routes/webhooks/vercel-fire-shim'))
app.use('/api/webhooks/github-fire', require('./routes/webhooks/github-fire-shim'))
app.use('/api/webhooks/apple-asn', require('./routes/webhooks/apple-asn-fire-shim'))

// Telegram Bot webhook -> Corazon reflex (Phase 2 Lane 05 ext, 2026-05-16).
// Replaces / runs alongside Twilio SMS path for $0/msg + native threading.
// Auth: URL-path secret + optional X-Telegram-Bot-Api-Secret-Token header.
// Allowlist: kv_store.creds.telegram_bot.allowed_user_ids (Tate's TG id).
// Mounted before express.json() ONLY for consistency; route declares its
// own json parser scoped to itself.
app.use('/api/webhooks/telegram', require('./routes/webhooks/telegram-bot'))

// Gmail Pub/Sub push receiver (2026-05-18). Receives OIDC-authed POSTs from
// the gmail-inbound-to-webhook subscription on every Gmail inbox change.
// Drops inbound-email latency from 60min (triage cron floor) to sub-30s.
// Auth: OIDC bearer JWT, audience checked against GMAIL_PUSH_EXPECTED_AUDIENCE,
// service account checked against GMAIL_PUSH_ALLOWED_SA_EMAIL.
app.use('/api/webhooks/gmail-push', require('./routes/webhooks/gmail-push'))

// GKG (GUI Knowledge Graph) ingest - capture daemon on Corazon POSTs
// HMAC-signed NDJSON. MUST mount before express.json() so the raw body
// the daemon HMACed is the body we verify. See src/routes/gkg.js +
// src/middleware/validateGkgSignature.js. Spec:
// ~/ecodiaos/docs/gkg-spec-v0.1.md. Authored 7 May 2026 fork_mov3r45p_73555d.
app.use('/api/gkg', require('./routes/gkg'))

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

// ── App-level auth gate ───────────────────────────────────────────────
// Single source of truth for who can hit which route. Every /api/* path
// requires a JWT (or the MCP_INTERNAL_TOKEN long-lived bearer) unless its
// path is on PUBLIC_PATH_ALLOWLIST below. Public paths are: OAuth callbacks
// (canva/xero), webhook handlers that authenticate via their own HMAC/
// signature, the loopback ingestion endpoints, healthchecks, MCP discovery
// endpoints (per MCP spec — tools/call is still gated inside the router),
// and a handful of ambient read-only dashboards Tate's FE relies on.
//
// Anything NOT on this list (including /api/os-session/*, /api/dispatch-
// queue, /api/rescue, /api/meetings, /api/voice/*, /api/triage, /api/
// dashboard, /api/message-queue, /api/voice/chunk, /internal/cortex-state)
// REQUIRES auth. The previous audit (2026-05-13) found those routes were
// fully unauthenticated and reachable via internet, with CORS allowing
// any vercel.app preview deploy to drive the conductor cross-origin.
//
// IMPORTANT: webhooks raw-body routes (/api/webhooks/vercel, /api/webhooks/
// stripe, /api/gkg) were mounted BEFORE express.json(). Those auth-via-
// HMAC paths are also explicitly public here (defence in depth).
const PUBLIC_PATH_PATTERNS = [
  // Healthchecks
  /^\/api\/healthz?(\/|$)/,
  // Static files (already mounted above; listed for clarity)
  /^\/api\/files(\/|$)/,
  // Auth itself: login + refresh + ws-ticket are intentionally pre-auth
  // (the route is the path to GET a token). ws-ticket internally
  // re-checks the JWT — see routes/auth.js.
  /^\/api\/auth\/(login|refresh|ws-ticket)$/,
  // OAuth callbacks (must be unauthenticated; vendor POSTs back here)
  /^\/api\/canva\/oauth\/callback$/,
  /^\/api\/xero\/callback$/,
  // Webhooks — verified by HMAC at the route layer
  /^\/api\/webhooks\/(stripe|vercel|telegram)(\/|$)/, // telegram: URL-path secret + header secret check inside route
  /^\/api\/sms(\/|$)/, // Twilio request signature validated by twilioValidation middleware
  /^\/api\/native(\/|$)/, // ecodia-native iOS bearer validated by nativeAuth middleware
  /^\/api\/gkg(\/|$)/, // HMAC validated by validateGkgSignature
  /^\/api\/hands(\/|$)/, // HMAC validated inside the route by handsBridge.verifyInbound
  // MCP cowork discovery (initialize/tools/list/prompts/list/resources/list)
  // — auth on tools/call is enforced inside the router. Discovery must be
  // public per MCP spec so claude.ai can enumerate the surface.
  /^\/api\/mcp\/cowork(\/|$)/,
  // MCP ecodia-full discovery (Lane E, 2026-05-15). Same MCP-spec
  // public-discovery contract as cowork. Auth on tools/call enforced inside.
  /^\/api\/mcp\/ecodia-full(\/|$)/,
  // Phase 2 Lane 10 (2026-05-15): the 10 domain-scoped MCP connectors.
  // Same MCP-spec public-discovery contract; auth on tools/call enforced
  // inside connectorMcpShim via the per-connector bearer middleware.
  /^\/api\/mcp\/ecodia-core(\/|$)/,
  /^\/api\/mcp\/ecodia-comms(\/|$)/,
  /^\/api\/mcp\/ecodia-code(\/|$)/,
  /^\/api\/mcp\/ecodia-money(\/|$)/,
  /^\/api\/mcp\/ecodia-shell(\/|$)/,
  /^\/api\/mcp\/ecodia-supabase(\/|$)/,
  /^\/api\/mcp\/ecodia-scheduler(\/|$)/,
  /^\/api\/mcp\/ecodia-crm(\/|$)/,
  /^\/api\/mcp\/ecodia-graph(\/|$)/,
  /^\/api\/mcp\/ecodia-factory(\/|$)/,
  // OAuth wrapper for ecodia-full (Lane E). Flow-internal auth: PKCE +
  // pre-registered client_id with locked redirect_uri.
  /^\/api\/oauth\/mcp(\/|$)/,
  // Streaming substrate (Phase 2 Lane 06, 2026-05-15). Bearer auth
  // enforced inside the router via ecodiaFullAuth.
  /^\/api\/stream(\/|$)/,
  // Internal loopback endpoints — authenticated by their own bearer secret
  // (CONDUCTOR_LOOPBACK_SECRET) inside the route handler. These are
  // mounted at /internal/* on purpose; nginx should be configured to
  // refuse external traffic to /internal/* but we don't trust that alone.
  /^\/internal\/ws-broadcast(\/|$)/,
  /^\/internal\/cortex-state(\/|$)/,
  // Conductor-internal loopback (sessionAutoWake et al). These call
  // /api/os-session/message from localhost. We honour them via a
  // localhost + loopback-secret check inside appAuth (NOT a blanket
  // allowlist) — see code path below.
]

const REQUIRE_LOOPBACK_BEARER_PATTERNS = [
  // Endpoints that conductor-internal services hit on loopback. We accept
  // either a normal JWT (admin UI) OR the loopback secret.
  /^\/api\/os-session\/message$/,
]

function isPublicPath(p) {
  for (const re of PUBLIC_PATH_PATTERNS) if (re.test(p)) return true
  return false
}

function isLoopbackAuthorisedRequest(req) {
  // Conductor-internal callers (sessionAutoWake, schedulerPollerService
  // _fireDirectExecTask, etc.) POST to /api/os-session/message from
  // localhost. Accept either:
  //   (a) Authorization: Bearer <CONDUCTOR_LOOPBACK_SECRET>, OR
  //   (b) X-Internal-Loopback-Secret header == CONDUCTOR_LOOPBACK_SECRET
  // Both compared with crypto.timingSafeEqual.
  const env = require('./config/env')
  const expected = env.CONDUCTOR_LOOPBACK_SECRET
  if (!expected) return false
  const auth = req.headers.authorization || ''
  const headerToken = req.headers['x-internal-loopback-secret'] || ''
  let provided = ''
  if (auth.startsWith('Bearer ')) provided = auth.slice(7)
  else if (headerToken) provided = String(headerToken)
  if (!provided) return false
  try {
    const crypto = require('crypto')
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function appAuth(req, res, next) {
  const reqPath = req.path
  // OPTIONS pre-flight requests pass through (cors middleware handled it)
  if (req.method === 'OPTIONS') return next()
  // Allowlisted public paths
  if (isPublicPath(reqPath)) return next()
  // Loopback-authorised endpoints (conductor self-fire)
  for (const re of REQUIRE_LOOPBACK_BEARER_PATTERNS) {
    if (re.test(reqPath) && isLoopbackAuthorisedRequest(req)) {
      req.user = { id: 'loopback', role: 'loopback' }
      return next()
    }
  }
  // Everything else gets full JWT auth
  return auth(req, res, next)
}

app.use(appAuth)

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
// /internal/ws-broadcast — bridge from ecodia-conductor (which owns the
// SDK stream + osSessionService) to ecodia-api's local WS clients. Phase 3
// of CONDUCTOR_DETACHED orphaned streaming WS events because conductor has
// no FE-connected sockets. See backend/src/lib/wsBridgeForward.js. 13 May 2026.
app.use('/internal/ws-broadcast', require('./routes/internalWsBroadcast'))
app.use('/api/bookkeeping', bookkeepingRoutes)
app.use('/api/coding', codingRoutes)
const xeroRoutes = require('./routes/xero')
app.use('/api/xero', xeroRoutes.publicRouter)
app.use('/api/xero', xeroRoutes)
const canvaRoutes = require('./routes/canva')
app.use('/api/canva', canvaRoutes.publicRouter)
app.use('/api/canva', canvaRoutes)
app.use('/api/message-queue', require('./routes/messageQueue'))
app.use('/api/cortex', require('./routes/cortexAttachments'))
app.use('/api/os-session', require('./routes/osSession'))
app.use('/api/sms', require('./routes/smsWebhook'))
// /api/native - ecodia-native iOS channel adapter (third channel alongside
// SMS + Telegram). All decision logic lives in headlessConductor; this is
// inbound envelope ingest + outbound APNs + tate_priority widget surface.
// Per backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md.
app.use('/api/native', require('./routes/native'))
app.use('/api/docs', require('./routes/documents'))
app.use('/api/dashboard', require('./routes/dashboard'))
// /api/status-board - read-only active rows for the Cortex Ambient FE
// constellation view. fork_mowceb8n_e20af9 2026-05-08.
app.use('/api/status-board', require('./routes/statusBoard'))
app.use('/api/status_board', require('./routes/statusBoard'))
app.use('/api/rescue', require('./routes/rescue'))
app.use('/api/triage', require('./routes/triage'))
app.use('/api/telemetry', require('./routes/telemetry'))
app.use('/api/hands', require('./routes/hands'))
// DEPRECATED MCP gateways unmounted 2026-05-29 (status_board 2bf2c734, Tate
// "everything native"). The /api/mcp/cowork (gen-1) + /api/mcp/ecodia-full
// (gen-2 monolith) gateways + the OAuth PKCE wrapper that fronted ecodia-full
// are retired: the Anthropic Routines that consumed them are deleted, the
// webhook shims now dispatch natively (src/routes/webhooks/*), and the conductor
// uses the 10 narrow domain-scoped connectors below. Route files
// (routes/mcp/cowork.js, ecodiaFull.js, oauth/mcpOauth.js) remain on disk for
// one verification cycle, then get deleted. NB: this is unrelated to the ALIVE
// cowork.dispatch_worker laptop-agent primitive the scheduler poller uses.
//   app.use('/api/mcp/cowork', require('./routes/mcp/cowork'))
//   app.use('/api/mcp/ecodia-full', require('./routes/mcp/ecodiaFull'))
//   app.use('/api/oauth/mcp', require('./routes/oauth/mcpOauth'))
// Phase 2 Lane 10 (2026-05-15) - 10 domain-scoped MCP connectors. Each is a
// narrow HTTP endpoint with its own bearer + OAuth client_id + scope subset.
// These are now the canonical MCP surface.
;(function mountDomainScopedConnectors() {
  const mountConnector = require('./routes/mcp/mountConnector')
  const { CONNECTORS } = require('./services/connectorManifests')
  for (const name of Object.keys(CONNECTORS)) {
    const connector = CONNECTORS[name]
    app.use('/api/mcp/' + connector.mountPath, mountConnector(connector))
  }
})()
// ecodia-climate (climate-disclosure W7) - INERT until provisioning day.
// Self-contained connector (manifest + zod cd_* tools + dedicated DB client
// at src/services/climate/connector/), client-gated per W10: the dedicated
// ecodia-climate Supabase project, the bearer at
// kv_store.creds.ecodia_climate_mcp_bearer and CLIMATE_DATABASE_URL do not
// exist before a signed engagement. To mount: uncomment the next line AND add
// /^\/api\/mcp\/ecodia-climate(\/|$)/ to the public-discovery exempt list
// beside the sibling connectors (~line 210).
//   app.use('/api/mcp/ecodia-climate', require('./routes/mcp/ecodiaClimate')())
// /api/stream/* - streaming substrate (Phase 2 Lane 06, 2026-05-15). SSE
// channel hub complementing MCP. Channel registry at backend/streaming/channels.json.
app.use('/api/stream', require('./routes/streaming'))
// CortexAmbient Phase 2 live panels (fork_mp3ndv83_63898a, 2026-05-13)
app.use('/api/working-set', require('./routes/workingSet'))
app.use('/api/observer-signals', require('./routes/observerSignals'))
// Observer Framework v2: firehose ingestion + state read for systemPulse.
app.use('/api/observer-pulse', require('./routes/observerPulse'))
app.use('/api/perception', require('./routes/perception'))
app.use('/api/restart-requests', require('./routes/restartRequests'))
app.use('/api/ops', require('./routes/ops'))
// /api/ops/listener-stats - perception-bus matcher + listener telemetry (B3, fork_mosmjqi4_20c41a)
app.use('/api/ops/listener-stats', require('./routes/ops/listenerStats'))
// /api/ops/listener-health - per-listener fires/drops/errors + derived status (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/ops/listener-health', require('./routes/ops/listenerHealth'))
// /api/ops/pattern-fire - pattern surfacing telemetry, ranked + cold views (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/ops/pattern-fire', require('./routes/ops/patternFire'))
// /api/ops/stuck - "what is the conductor stuck on?" diagnostic (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/ops/stuck', require('./routes/ops/stuck'))
// /api/ops/mcp-discovery - snapshot of MCP servers available to forks (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/ops/mcp-discovery', require('./routes/ops/mcpDiscovery'))
// /api/approval-queue - unified Tate-approval queue (spec 2026-05-26-tate-approval-queue-design.md)
app.use('/api/approval-queue', require('./routes/approvalQueue'))
// /api/ops/approval-queue - producer-side HTTP wrappers (ship-ios.py + stripe webhooks)
app.use('/api/ops/approval-queue', require('./routes/ops/approvalQueueEnqueue'))
// /api/web-search - Brave-Search-backed web search w/ 24h cache (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/web-search', require('./routes/webSearch'))
// /api/documents-extract - PDF + OCR extraction (AUTONOMY_AUDIT_2026-05-13)
app.use('/api/documents-extract', require('./routes/documentsExtract'))
// Phase 4 dashboard endpoints (fork_mp3pkavh_12c438)
app.use('/api/scheduler', require('./routes/scheduler'))
app.use('/api/kv-store', require('./routes/kvStore'))
app.use('/api/dispatch-queue', require('./routes/dispatchQueue'))
// /api/push - mobile device push token registration (APNs / FCM).
// fork_mov3s5fq_a7009b 2026-05-07.
app.use('/api/push', require('./routes/push'))
// /api/voice/chunk - Whisper transcription of short browser-uploaded
// audio blobs (Tate brainstorming aloud while walking) -> coalesced
// [VOICE] messages into the conductor chat. Sister to /api/voice/incoming
// (Twilio call relay). fork_mownezy2_77bebd 2026-05-08 (W2).
app.use(require('./routes/voiceChunk'))
// /api/meetings - durable meeting recorder + Whisper transcription.
// Phase 1: capture + storage + async transcription. fork_mp1utwce_96fdc9 2026-05-12.
app.use('/api/meetings', require('./routes/meetings'))
// /api/voice/* REST tools - Deepgram transcribe/synthesize/live-session.
// /api/voice/incoming and /api/voice/relay are registered directly in
// voiceRelay.js (TwiML POST + Twilio Media Streams WS). Express matches the
// direct app.post/app.ws routes first, then falls through to this router.
app.use('/api/voice', require('./routes/voiceTools'))

// Error handler (must be last)
app.use(errorHandler)

module.exports = app
