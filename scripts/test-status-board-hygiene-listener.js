#!/usr/bin/env node
'use strict'

/**
 * One-shot test harness for statusBoardHygieneHaikuListener.
 *
 * Bypasses the pg_notify substrate by importing the listener module and
 * invoking its exported runHygieneSweep() handler directly. Verifies that
 * a stale row gets archived. Final cleanup hard-deletes the test row since
 * it is a fork-stamped test artefact.
 *
 * Exit codes: 0 pass, 1 fail.
 *
 * Origin: fork_mowk9wfl_0b18b8 spring-clean worker 1, 2026-05-08.
 */

const path = require('path')
const db = require(path.join(__dirname, '..', 'src', 'config', 'db'))
const listener = require(path.join(__dirname, '..', 'src', 'services', 'listeners', 'statusBoardHygieneHaikuListener.js'))

const TEST_ROW_NAME = 'hygiene-listener-test-row-fork_mowk9wfl_0b18b8'

function log(msg, extra) {
  console.log(`[hygiene-test] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`)
}

async function main() {
  let testRowId = null
  let pass = false
  const failures = []

  try {
    // Pre-cleanup: delete any prior test rows from previous runs.
    await db`DELETE FROM status_board WHERE name = ${TEST_ROW_NAME}`

    // Insert the stale test row: next_action_due 8 days ago, archived_at NULL.
    const inserted = await db`
      INSERT INTO status_board (
        entity_type, name, status, next_action,
        next_action_by, next_action_due, last_touched, priority, archived_at
      )
      VALUES (
        'task', ${TEST_ROW_NAME}, 'open', 'hygiene listener test',
        'ecodiaos', NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day', 4, NULL
      )
      RETURNING id
    `
    if (!inserted.length) {
      failures.push('insert returned no row')
      throw new Error('insert returned no row')
    }
    testRowId = inserted[0].id
    log('inserted test row', { id: testRowId })

    // Sanity: confirm pre-state.
    const preRows = await db`
      SELECT id, archived_at, context FROM status_board WHERE id = ${testRowId}
    `
    if (preRows.length !== 1 || preRows[0].archived_at !== null) {
      failures.push(`pre-state wrong: ${JSON.stringify(preRows[0])}`)
      throw new Error('pre-state wrong')
    }
    log('pre-state confirmed: archived_at IS NULL')

    // Invoke the sweep directly (bypasses pg_notify substrate).
    log('invoking runHygieneSweep() directly...')
    const sweep = await listener.runHygieneSweep()
    log('sweep result', sweep)

    if (!sweep || sweep.errors.length > 0) {
      failures.push(`sweep had errors: ${JSON.stringify(sweep && sweep.errors)}`)
    }

    // Verify post-state: archived_at IS NOT NULL, context contains the marker.
    const postRows = await db`
      SELECT id, archived_at, context, status FROM status_board WHERE id = ${testRowId}
    `
    if (postRows.length !== 1) {
      failures.push(`test row vanished post-sweep`)
      throw new Error('test row vanished')
    }
    const post = postRows[0]
    log('post-state', {
      archived_at: post.archived_at,
      context: post.context,
    })

    if (post.archived_at === null) {
      failures.push('archived_at IS NULL after sweep (rule 1 did not fire)')
    } else {
      log('PASS: archived_at IS NOT NULL')
    }

    if (!post.context || !post.context.includes('hygiene-listener auto-archived 2026-05-08')) {
      failures.push(`context missing hygiene marker: ${JSON.stringify(post.context)}`)
    } else {
      log('PASS: context contains hygiene marker')
    }

    // Verify heartbeat was written.
    const heartbeat = await db`
      SELECT key, value, updated_at FROM kv_store
      WHERE key = 'health.status_board_hygiene_listener'
    `
    if (heartbeat.length === 1) {
      log('PASS: heartbeat written', {
        updated_at: heartbeat[0].updated_at,
        value: heartbeat[0].value,
      })
    } else {
      failures.push('heartbeat row missing in kv_store')
    }

    pass = failures.length === 0
  } catch (err) {
    failures.push(`exception: ${err.message}`)
    log('TEST EXCEPTION', { error: err.message, stack: err.stack })
  } finally {
    // Final cleanup: hard delete the fork-stamped test artefact.
    if (testRowId) {
      try {
        await db`DELETE FROM status_board WHERE id = ${testRowId}`
        log('cleanup: test row deleted', { id: testRowId })
      } catch (err) {
        log('cleanup: delete failed (manual cleanup required)', { id: testRowId, error: err.message })
      }
    }
  }

  if (pass) {
    log('VERDICT: PASS')
    process.exit(0)
  } else {
    log('VERDICT: FAIL', { failures })
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[hygiene-test] unhandled', err)
  process.exit(1)
})
