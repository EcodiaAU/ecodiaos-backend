/**
 * dispatchEventConsumer.test.js
 *
 * Regression guard for the Stop-event applied-tag FK rewire (2026-06-09).
 *
 * Root incident: applied_tag_telemetry.py (Stop hook) emits one
 * application-event row per surfaced pattern with tool_name=stop_event and
 * a session_id. The legacy FK lookup in consumeApplicationEventFile keyed on
 * tool_name+ts, and nothing in the PreToolUse hook chain emits
 * tool_name=stop_event rows into dispatch_event. Every Stop-event row hit
 * the orphan-skip branch and application_event flatlined from
 * 2026-05-12T05:53Z forward.
 *
 * These tests cover the three resolution paths the rewire introduces and
 * the NULL-allowed fallback that prevents another silent flatline:
 *   1. exact session_id+ts match on dispatch_event.metadata
 *   2. fuzzy +/-5min session_id match
 *   3. most-recent session dispatch fallback
 *   4. NULL dispatch_event_id when no session dispatch exists
 *   5. legacy PreToolUse path still orphan-skips when tool_name+ts misses
 *
 * Doctrine:
 *   backend/patterns/stop-event-applied-tag-rewire-needs-dispatch-event-row-for-fk-resolution-2026-06-09.md
 *   backend/patterns/layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26.md
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const { consumeApplicationEventFile } = require('../../telemetry/dispatchEventConsumer')

function writeJsonl(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-event-test-'))
  const file = path.join(dir, 'application-events.jsonl')
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  return file
}

function makeFixedClient({ exactRows = [], fuzzyRows = [], tailRows = [], legacyExactRows = [], legacyFuzzyRows = [] } = {}) {
  const inserts = []
  const queries = []
  return {
    inserts,
    queries,
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params })
      if (/INSERT INTO application_event/i.test(sql)) {
        inserts.push(params)
        return { rows: [], rowCount: 1 }
      }
      // Stop-event resolution path: WHERE metadata->>'session_id'
      if (/metadata->>'session_id'/i.test(sql)) {
        if (/ts = \$1::timestamptz/i.test(sql)) {
          return { rows: exactRows, rowCount: exactRows.length }
        }
        if (/ts BETWEEN/i.test(sql)) {
          return { rows: fuzzyRows, rowCount: fuzzyRows.length }
        }
        if (/ts <= \$1::timestamptz/i.test(sql)) {
          return { rows: tailRows, rowCount: tailRows.length }
        }
      }
      // Legacy tool_name path.
      if (/tool_name = \$2/i.test(sql) && /ts = \$1::timestamptz/i.test(sql)) {
        return { rows: legacyExactRows, rowCount: legacyExactRows.length }
      }
      if (/tool_name = \$2/i.test(sql) && /ts BETWEEN/i.test(sql)) {
        return { rows: legacyFuzzyRows, rowCount: legacyFuzzyRows.length }
      }
      return { rows: [], rowCount: 0 }
    }),
  }
}

const STOP_TS = '2026-06-09T12:30:00.000Z'
const SESSION_ID = 'e6def4af-91bd-48db-91c7-66185d0913b8'

function stopRow(overrides = {}) {
  return {
    ts: STOP_TS,
    matched_dispatch_ts: STOP_TS,
    tool_name: 'stop_event',
    pattern_path: 'inner-life-notice-calibration-not-chase-pre-calibration-self.md',
    trigger_keyword: '',
    source_layer: 'hook:applied-tag-telemetry-stop:user_context',
    applied: null,
    tagged_silent: true,
    was_false_positive: null,
    reason: '',
    hook_name: 'applied-tag-telemetry-stop',
    session_id: SESSION_ID,
    ...overrides,
  }
}

describe('consumeApplicationEventFile - Stop-event session_id resolution', () => {
  test('exact session_id+ts hit binds dispatch_event_id', async () => {
    const file = writeJsonl([stopRow()])
    const client = makeFixedClient({ exactRows: [{ id: 'd-exact-1' }] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(1)
    expect(result.orphanSkips).toBe(0)
    expect(client.inserts).toHaveLength(1)
    expect(client.inserts[0][0]).toBe('d-exact-1')
  })

  test('fuzzy +/-5min session_id hit binds dispatch_event_id when no exact', async () => {
    const file = writeJsonl([stopRow()])
    const client = makeFixedClient({ exactRows: [], fuzzyRows: [{ id: 'd-fuzzy-1' }] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(1)
    expect(result.orphanSkips).toBe(0)
    expect(client.inserts[0][0]).toBe('d-fuzzy-1')
  })

  test('session-tail fallback binds most-recent dispatch when neither exact nor fuzzy match', async () => {
    const file = writeJsonl([stopRow()])
    const client = makeFixedClient({ exactRows: [], fuzzyRows: [], tailRows: [{ id: 'd-tail-1' }] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(1)
    expect(result.orphanSkips).toBe(0)
    expect(client.inserts[0][0]).toBe('d-tail-1')
  })

  test('no session dispatch at all still inserts with NULL dispatch_event_id (does NOT orphan-skip)', async () => {
    const file = writeJsonl([stopRow()])
    const client = makeFixedClient({ exactRows: [], fuzzyRows: [], tailRows: [] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(1)
    expect(result.orphanSkips).toBe(0)
    expect(client.inserts[0][0]).toBeNull()
  })

  test('preserves pattern_path, applied, tagged_silent on the inserted row', async () => {
    const row = stopRow({
      pattern_path: 'decision-quality-self-optimization-architecture.md',
      applied: true,
      tagged_silent: false,
      reason: 'applied because the rewire matched',
    })
    const file = writeJsonl([row])
    const client = makeFixedClient({ exactRows: [{ id: 'd-exact-2' }] })

    await consumeApplicationEventFile(file, client)

    const params = client.inserts[0]
    expect(params[2]).toBe('decision-quality-self-optimization-architecture.md')
    expect(params[5]).toBe(true)
    expect(params[6]).toBe(false)
  })
})

describe('consumeApplicationEventFile - legacy PreToolUse path', () => {
  test('non-stop_event row with no tool_name+ts match still orphan-skips', async () => {
    const file = writeJsonl([
      {
        ts: STOP_TS,
        matched_dispatch_ts: STOP_TS,
        tool_name: 'Bash',
        pattern_path: 'foo.md',
        applied: null,
        tagged_silent: true,
        reason: '',
        hook_name: 'post-action-applied-tag-check',
      },
    ])
    const client = makeFixedClient({ legacyExactRows: [], legacyFuzzyRows: [] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(0)
    expect(result.orphanSkips).toBe(1)
    expect(client.inserts).toHaveLength(0)
  })

  test('non-stop_event row with tool_name+ts exact match binds and inserts', async () => {
    const file = writeJsonl([
      {
        ts: STOP_TS,
        matched_dispatch_ts: STOP_TS,
        tool_name: 'mcp__forks__spawn_fork',
        pattern_path: 'foo.md',
        applied: true,
        tagged_silent: false,
        reason: 'applied',
        hook_name: 'post-action-applied-tag-check',
      },
    ])
    const client = makeFixedClient({ legacyExactRows: [{ id: 'd-legacy-1' }] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(1)
    expect(result.orphanSkips).toBe(0)
    expect(client.inserts[0][0]).toBe('d-legacy-1')
  })
})

describe('consumeApplicationEventFile - stop_event with no session_id', () => {
  test('stop_event without session_id falls back to legacy tool_name path and orphan-skips when no match', async () => {
    // Legacy post-action-applied-tag-check.sh shape: tool_name=stop_event but
    // no session_id (this shape never appeared in production but the contract
    // says: missing session_id falls back to the existing path).
    const row = stopRow({ session_id: '' })
    const file = writeJsonl([row])
    const client = makeFixedClient({ legacyExactRows: [], legacyFuzzyRows: [] })

    const result = await consumeApplicationEventFile(file, client)

    expect(result.applicationInserts).toBe(0)
    expect(result.orphanSkips).toBe(1)
  })
})
