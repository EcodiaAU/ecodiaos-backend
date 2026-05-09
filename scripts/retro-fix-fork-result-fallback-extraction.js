#!/usr/bin/env node
/**
 * Retro-fix os_forks rows where the result column carries the FALLBACK_MARKER
 * prefix BUT the appended transcript-tail actually contains a real
 * [FORK_REPORT] marker.
 *
 * Root cause: pre-2026-05-07 the extractor regex used `[^\n]*` after the
 * `[FORK_REPORT]` marker, which greedily consumed the same-line body that
 * the fork brief literally instructs the model to emit. The capture group
 * came up empty, the inline conditional fell through to the FALLBACK_MARKER
 * write, and forks that DID emit a clean report were tagged phantom_bail.
 * 127/186 fallback rows over the last 7 days of pre-fix telemetry came in
 * via this exact path (status_board "Phantom_bail extraction false-negatives").
 *
 * Upstream regex was repaired in commit 58bb87a (7 May 2026); this script
 * is the retroactive re-classifier for rows that landed before the fix.
 *
 * Mechanism: for each candidate row, strip the FALLBACK_MARKER prefix line,
 * re-run the post-fix _extractForkReport helper against the appended
 * transcript-tail. If a non-empty report body is recovered, REPLACE the
 * result column with the recovered report (and update next_step + position
 * for downstream rollup correctness). Idempotent — re-running on already-
 * fixed rows is a no-op because their result no longer starts with the
 * fallback prefix.
 *
 * Conservative: rows where the tail does NOT contain `[FORK_REPORT]` (true
 * phantom bails) are left untouched.
 *
 * Usage:
 *   node scripts/retro-fix-fork-result-fallback-extraction.js [--days=7] [--dry-run]
 *
 * Origin fork: fork_moyuikwe_c3bb61 (9 May 2026).
 * Doctrine: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
 */

'use strict'

const db = require('../src/config/db')
const { _extractForkReport, FALLBACK_MARKER } = require('../src/services/forkService')

function parseArgs() {
  const argv = process.argv.slice(2)
  const args = { days: 7, dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true
    else if (a.startsWith('--days=')) args.days = parseInt(a.split('=')[1], 10) || 7
  }
  return args
}

function recoverFromFallbackResult(result) {
  // Strip the FALLBACK_MARKER prefix line (everything up to the first \n\n
  // double-newline boundary). The remainder is the transcript-tail that the
  // live writer appended at line ~1106 of forkService.js.
  const sepIdx = result.indexOf('\n\n')
  if (sepIdx < 0) return null
  const tail = result.slice(sepIdx + 2)

  // Branch A — clean recovery: marker IS in tail, run the post-fix extractor.
  if (tail.includes('[FORK_REPORT]')) {
    const { report, nextStep } = _extractForkReport([tail])
    if (!report) return null
    return { report, nextStep, mode: 'clean' }
  }

  // Branch B — long-body truncation: pre-fix the regex captured empty body
  // (because `[^\n]*` ate the same-line body content), the FALLBACK path
  // wrote `slice(-2000)` of fullText, and the marker fell OUTSIDE that
  // 2000-char window because the body itself was >2000 chars on one line.
  // The tail still ends with `[NEXT_STEP] …` (the original closing tag).
  // Recover the truncated body from `tail-start` up to `[NEXT_STEP]` and
  // mark it explicitly as truncated so the conductor knows the head is
  // missing. Better than nothing — gives the conductor real work-product
  // context to anchor probes to. F3-redo (fork_mos0riap_f5910d) is the
  // canonical example.
  const nextStepIdx = tail.search(/\[NEXT_STEP\]/i)
  if (nextStepIdx <= 0) return null
  const truncatedBody = tail.slice(0, nextStepIdx).trim()
  if (!truncatedBody) return null
  const nextMatch = tail.match(/\[NEXT_STEP\]\s*([\s\S]*?)$/i)
  const nextStep = nextMatch ? nextMatch[1].trim() : null
  const report = `(report body truncated — head exceeded 2000-char fallback window; tail follows)\n\n${truncatedBody}`
  return { report, nextStep, mode: 'truncated' }
}

async function main() {
  const { days, dryRun } = parseArgs()
  console.log(`retro-fix-fork-result-fallback-extraction: scanning last ${days} days, dry-run=${dryRun}`)

  let candidates = []
  try {
    candidates = await db`
      SELECT fork_id, started_at, result, next_step, position
      FROM os_forks
      WHERE result LIKE ${FALLBACK_MARKER + '%'}
        AND started_at > now() - (${days} || ' days')::interval
      ORDER BY started_at DESC
    `
  } catch (err) {
    console.error('candidate query failed:', err.message)
    process.exitCode = 1
    await db.end()
    return
  }

  console.log(`  ${candidates.length} candidate fallback-prefixed rows`)

  let recovered_clean = 0
  let recovered_truncated = 0
  let skipped_true_phantom_bail = 0
  const sampleRecovered = []

  for (const row of candidates) {
    const recover = recoverFromFallbackResult(row.result)
    if (!recover) {
      skipped_true_phantom_bail++
      continue
    }

    if (sampleRecovered.length < 4) {
      sampleRecovered.push({
        fork_id: row.fork_id,
        mode: recover.mode,
        body_head: recover.report.slice(0, 120),
        next_step: recover.nextStep ? recover.nextStep.slice(0, 80) : null,
      })
    }

    if (dryRun) {
      if (recover.mode === 'clean') recovered_clean++
      else recovered_truncated++
      continue
    }

    const positionTag = recover.mode === 'clean'
      ? ' :: retro-fixed-fallback-to-report'
      : ' :: retro-fixed-fallback-to-truncated-report'
    try {
      await db`
        UPDATE os_forks
        SET result    = ${recover.report},
            next_step = COALESCE(${recover.nextStep}, next_step),
            position  = COALESCE(position, '') || ${positionTag}
        WHERE fork_id = ${row.fork_id}
      `
      if (recover.mode === 'clean') recovered_clean++
      else recovered_truncated++
    } catch (err) {
      console.error(`  UPDATE failed for ${row.fork_id}:`, err.message)
    }
  }
  const recovered = recovered_clean + recovered_truncated

  console.log()
  console.log(`Summary:`)
  console.log(`  recovered_total:           ${recovered}`)
  console.log(`    recovered_clean:         ${recovered_clean}  (marker in tail, full body recoverable)`)
  console.log(`    recovered_truncated:     ${recovered_truncated}  (marker fell outside 2000-char window, partial body recovered)`)
  console.log(`  skipped_true_phantom_bail: ${skipped_true_phantom_bail}  (no marker, no NEXT_STEP — left untouched)`)
  console.log()
  if (sampleRecovered.length) {
    console.log(`Sample recovered rows:`)
    for (const s of sampleRecovered) {
      console.log(`  ${s.fork_id}`)
      console.log(`    body_head: ${s.body_head}…`)
      console.log(`    next_step: ${s.next_step || '(null)'}`)
    }
  }

  await db.end()
}

main().catch(err => {
  console.error('fatal:', err)
  process.exit(1)
})
