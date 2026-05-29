#!/usr/bin/env node
/*
 * reachability-probe-2026-05-29.js
 * Deterministic require()-graph reachability over src/.
 *
 * Purpose: ground the "dead VPS conductor substrate" audit in FACT, not grep.
 * A file is "loaded by a live process" iff it is reachable via static
 * require('relative') edges from a RUNNING PM2 entry point. Everything else
 * is an orphan (loaded by nobody) or loaded-only-by-a-dead-process.
 *
 * Running PM2 processes (probed 2026-05-29 via mcp pm2_list):
 *   ecodia-api        -> src/server.js
 *   ecodia-conductor  -> src/conductor.js
 *   ecodia-meetings   -> src/meetingsServer.js
 *   voice-call        -> (unknown entry; surfaces in orphan set)
 *
 * NOT running (their exclusive subtrees = dead-process-only):
 *   ecodia-factory          -> src/workers/factoryRunner.js
 *   ecodia-rescue           -> src/rescue/rescueRunner.js
 *   ecodia-observer-watchdog-> src/workers/observerWatchdog.js
 *   corazon-watchdog        -> src/services/corazonWatchdog.js
 *   (+ commented workers: gmailPoller, linkedinWorker, financePoller,
 *      kgEmbeddingWorker, kgConsolidationWorker)
 *
 * Caveat: static parse misses require(variable) / require(path.join(...)).
 * Those files are listed under dynamicRequireFiles so they are NEVER
 * auto-classified as orphan.
 */
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '..', 'src')

const RUNNING_ROOTS = [
  'server.js',          // ecodia-api  (via scripts/ensure-deps.sh bash wrapper)
  'conductor.js',       // ecodia-conductor
  'meetingsServer.js',  // ecodia-meetings
  // voice-call process entry is scripts/voice-call-server.js (outside src/),
  // which `require('../src/services/voiceCallService')`. Add as proxy root so
  // the voice subtree (voiceCallService, entityIndex, ...) is correctly ALIVE.
  'services/voiceCallService.js',
]
const DEAD_PROCESS_ROOTS = [
  'workers/factoryRunner.js',
  'rescue/rescueRunner.js',
  'workers/observerWatchdog.js',
  'services/corazonWatchdog.js',
  'workers/gmailPoller.js',
  'workers/linkedinWorker.js',
  'workers/financePoller.js',
  'workers/kgEmbeddingWorker.js',
  'workers/kgConsolidationWorker.js',
]

// ---- collect all .js files under src ----
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile() && p.endsWith('.js')) out.push(p)
  }
  return out
}
const allFiles = walk(SRC)
const rel = (abs) => path.relative(SRC, abs).split(path.sep).join('/')

const isTest = (r) =>
  r.includes('__tests__/') || r.endsWith('.test.js') || r.endsWith('.spec.js')

// ---- parse require edges ----
const REQ_RE = /require\(\s*(['"`])([^'"`]+)\1\s*\)/g
const DYN_RE = /require\(\s*[^'"`)]/ // require( not immediately followed by a quote

const graph = new Map() // rel -> Set(rel)
const dynamicRequireFiles = new Set()

function resolveSpec(fromAbs, spec) {
  if (!spec.startsWith('.')) return null // external / bare module
  const base = path.resolve(path.dirname(fromAbs), spec)
  const cands = [base, base + '.js', path.join(base, 'index.js')]
  for (const c of cands) {
    try {
      const st = fs.statSync(c)
      if (st.isFile()) return c
      if (st.isDirectory()) {
        const idx = path.join(c, 'index.js')
        if (fs.existsSync(idx)) return idx
      }
    } catch {}
  }
  return null
}

for (const abs of allFiles) {
  const src = fs.readFileSync(abs, 'utf8')
  const edges = new Set()
  let m
  REQ_RE.lastIndex = 0
  while ((m = REQ_RE.exec(src))) {
    const target = resolveSpec(abs, m[2])
    if (target && target.startsWith(SRC)) edges.add(rel(target))
  }
  if (DYN_RE.test(src)) dynamicRequireFiles.add(rel(abs))
  graph.set(rel(abs), edges)
}

// ---- KNOWN dynamic-load edges the static parser cannot follow ----
// Verified by reading the loader source 2026-05-29. Without these, every
// dynamically-loaded module AND its transitive require subtree is mis-marked
// orphan (e.g. calendarService looks orphan only because its real consumer
// capabilities/calendar.js is dynamic-loaded).
const DYNAMIC_EDGES = {
  // capabilities/index.js:39  for (const domain of domains) require(domain)
  'capabilities/index.js': [
    'capabilities/gmail.js', 'capabilities/calendar.js', 'capabilities/drive.js',
    'capabilities/crm.js', 'capabilities/social.js', 'capabilities/factory.js',
    'capabilities/finance.js', 'capabilities/system.js', 'capabilities/selfhood.js',
    'capabilities/self_observability.js', 'capabilities/context.js',
    'capabilities/growth.js', 'capabilities/bookkeeping.js', 'capabilities/coding.js',
    'capabilities/laptop.js',
  ],
  // services/listeners/registry.js  LISTENER_FILES allow-list (path.join load)
  'services/listeners/registry.js': [
    'services/listeners/_smoke.js', 'services/listeners/ccSessionsFailure.js',
    'services/listeners/conductorStreamTagWatcher.js', 'services/listeners/dbBridge.js',
    'services/listeners/dispatchQueueListener.js', 'services/listeners/emailArrival.js',
    'services/listeners/factorySessionComplete.js', 'services/listeners/forkComplete.js',
    'services/listeners/invoicePaymentState.js', 'services/listeners/statusBoardDrift.js',
    'services/listeners/statusBoardHygieneHaikuListener.js',
    'services/listeners/stripePaymentToLedger.js',
    'services/observers/coherenceObserver.js', 'services/observers/actionAuditObserver.js',
  ],
  // server.js  dashNoteObservers array (require(path) var) + inlineWorkers
  'server.js': [
    'services/observers/dashboardNotePatternObserver.js',
    'services/observers/dashboardNoteCadenceObserver.js',
    'services/observers/dashboardNoteConnectionObserver.js',
    'services/observers/dashboardNoteProgressObserver.js',
    'workers/cacheKeepaliveWorker.js',
  ],
}
for (const [from, targets] of Object.entries(DYNAMIC_EDGES)) {
  const set = graph.get(from) || new Set()
  for (const t of targets) if (graph.has(t)) set.add(t)
  graph.set(from, set)
}

// ---- BFS reachability ----
function reachable(roots) {
  const seen = new Set()
  const q = []
  for (const r of roots) {
    if (graph.has(r)) { seen.add(r); q.push(r) }
  }
  while (q.length) {
    const cur = q.shift()
    for (const nxt of graph.get(cur) || []) {
      if (!seen.has(nxt)) { seen.add(nxt); q.push(nxt) }
    }
  }
  return seen
}

const aliveSet = reachable(RUNNING_ROOTS)
const deadProcSet = reachable(DEAD_PROCESS_ROOTS)

const allRel = [...graph.keys()]
const nonTest = allRel.filter((r) => !isTest(r))

const alive = nonTest.filter((r) => aliveSet.has(r))
const deadProcOnly = nonTest.filter((r) => !aliveSet.has(r) && deadProcSet.has(r))
const orphan = nonTest.filter((r) => !aliveSet.has(r) && !deadProcSet.has(r))

// Among orphans, which are dynamic-require (uncertain, do not delete)
const orphanDynamic = orphan.filter((r) => dynamicRequireFiles.has(r))
const orphanStatic = orphan.filter((r) => !dynamicRequireFiles.has(r))

// ---- reverse-dependency analysis for orphans ----
// For each orphan, who require()s it, and what bucket is that requirer in?
// If every requirer is non-alive (orphan/dead-process/test), the orphan is
// confirmed safe (no live path reaches it). If ANY requirer is alive, the
// reachability is wrong and the file must NOT be deleted.
function bucketOf(r) {
  if (isTest(r)) return 'TEST'
  if (aliveSet.has(r)) return 'ALIVE'
  if (deadProcSet.has(r)) return 'DEADPROC'
  return 'ORPHAN'
}
const reverse = new Map() // rel -> [{from, bucket}]
for (const [from, edges] of graph) {
  for (const to of edges) {
    if (!reverse.has(to)) reverse.set(to, [])
    reverse.get(to).push({ from, bucket: bucketOf(from) })
  }
}
const orphanReverseDeps = {}
let anyAliveRequirer = []
for (const o of orphan) {
  const rd = reverse.get(o) || []
  orphanReverseDeps[o] = rd.map((x) => `${x.from} [${x.bucket}]`)
  if (rd.some((x) => x.bucket === 'ALIVE')) anyAliveRequirer.push(o)
}

const out = {
  ALIVE_REQUIRER_PRESENT_DO_NOT_DELETE: anyAliveRequirer,
  orphan_reverse_deps: orphanReverseDeps,
  counts: {
    total_js: allRel.length,
    non_test: nonTest.length,
    alive_from_running: alive.length,
    dead_process_only: deadProcOnly.length,
    orphan_total: orphan.length,
    orphan_static_candidates: orphanStatic.length,
    orphan_dynamic_uncertain: orphanDynamic.length,
  },
  orphan_static_candidates: orphanStatic.sort(),
  orphan_dynamic_uncertain: orphanDynamic.sort(),
  dead_process_only: deadProcOnly.sort(),
}
console.log(JSON.stringify(out, null, 2))
