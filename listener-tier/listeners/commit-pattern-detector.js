'use strict'

const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const { watch, debounce } = require('../lib/sentinel')
const registry = require('../lib/registry')
const heartbeat = require('../lib/heartbeat')

const execFileP = promisify(execFile)

const NAME = 'commit-pattern-detector'
const SOURCE = 'file-watcher'

const GIT_DIR = process.env.LISTENER_TIER_GIT_DIR || path.resolve(__dirname, '..', '..', '..', '.git')
const REFS_GLOB = path.join(GIT_DIR, 'refs', 'heads', '**')

const PATTERN_WORTHY_KEYWORDS = [
  /\bfix\b/i,
  /\bworkaround\b/i,
  /\bgotcha\b/i,
  /\bregression\b/i,
  /\bdo not\b/i,
  /\bnever\b/i,
  /\bmust\b/i,
  /\binstead of\b/i,
  /\bcorrectly\b/i,
  /\bsubtle\b/i,
  /\bsurprise\b/i,
]

function _scoreDiff(commitMessage, diffStat) {
  let score = 0
  const reasons = []
  for (const re of PATTERN_WORTHY_KEYWORDS) {
    if (re.test(commitMessage)) {
      score += 1
      reasons.push(`msg-keyword:${re.source}`)
    }
  }
  if (/\d+\s+files? changed/.test(diffStat)) {
    const m = diffStat.match(/(\d+)\s+files? changed/)
    const filesChanged = m ? parseInt(m[1], 10) : 0
    if (filesChanged >= 1 && filesChanged <= 5) {
      score += 1
      reasons.push(`narrow-change:${filesChanged}-files`)
    }
  }
  if (/patterns\//.test(diffStat) || /\.md\b/.test(diffStat)) {
    score += 1
    reasons.push('touches-doctrine')
  }
  return { score, reasons }
}

async function _analyse(refPath) {
  const repoRoot = path.dirname(GIT_DIR)
  let log
  try {
    log = await execFileP('git', ['log', '-1', '--pretty=format:%H%n%s%n%an%n%aI'], { cwd: repoRoot, timeout: 5000 })
  } catch (err) {
    return { error: 'git-log-failed:' + err.message }
  }
  const [sha, subject, author, when] = log.stdout.split('\n')
  let stat = { stdout: '' }
  try {
    stat = await execFileP('git', ['show', '--stat', '--format=', sha], { cwd: repoRoot, timeout: 5000 })
  } catch (err) {
    return { sha, subject, author, when, error: 'git-show-failed:' + err.message }
  }
  const { score, reasons } = _scoreDiff(subject, stat.stdout)
  return { sha, subject, author, when, stat: stat.stdout.trim().split('\n').slice(-1)[0], score, reasons }
}

async function _fire(refPath) {
  const startedAt = Date.now()
  let result
  try {
    result = await _analyse(refPath)
  } catch (err) {
    registry.recordFire(NAME, { status: 'error', error: err.message })
    await heartbeat.writeHealth(NAME, { status: 'error', error: err.message })
    return
  }
  const durationMs = Date.now() - startedAt
  if (result.error) {
    registry.recordFire(NAME, { status: 'error', durationMs, error: result.error, payload: result })
    await heartbeat.writeHealth(NAME, { status: 'error', error: result.error })
    return
  }
  registry.recordFire(NAME, {
    status: 'ok',
    durationMs,
    payload: {
      sha: result.sha,
      subject: result.subject,
      score: result.score,
      reasons: result.reasons,
    },
  })
  await heartbeat.writeHealth(NAME, {
    status: 'ok',
    sha: result.sha,
    score: result.score,
  })
  if (result.score >= 2) {
    await heartbeat.statusBoardP3(
      NAME,
      `Commit ${result.sha.slice(0, 8)} looks pattern-worthy (score ${result.score}). Subject: ${result.subject}. Reasons: ${result.reasons.join(', ')}. Author: ${result.author}. Consider authoring a pattern file or adding to an existing one.`,
      `Stat tail: ${result.stat}. Detected by listener-tier commit-pattern-detector on ${new Date().toISOString()}.`,
    )
  }
}

function start() {
  if (!fs.existsSync(GIT_DIR)) {
    process.stderr.write(`[${NAME}] GIT_DIR not found at ${GIT_DIR} - listener idle until a git repo exists. Set LISTENER_TIER_GIT_DIR to override.\n`)
    return null
  }
  const watcher = watch(REFS_GLOB, { debounceMs: 400 })
  const fire = debounce(p => _fire(p), 600)
  watcher
    .on('add', p => fire(p))
    .on('change', p => fire(p))
    .on('error', err => {
      process.stderr.write(`[${NAME}] watcher error: ${err.message}\n`)
    })
  process.stderr.write(`[${NAME}] watching ${REFS_GLOB}\n`)
  return watcher
}

module.exports = { name: NAME, source: SOURCE, start, _fire, _scoreDiff }
