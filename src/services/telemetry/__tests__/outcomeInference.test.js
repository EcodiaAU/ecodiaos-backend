'use strict'

/**
 * outcomeInference unit tests - Jest.
 *
 * Phase G Critique #1 fix: validates the 4-state outcome model
 * (success / correction / failure / unverified) introduced to replace the
 * pre-Phase-G "graceful default success" survivorship bias.
 *
 * The test exercises inferDispatchOutcome directly with a mock pg client
 * (per-method query stubbing). No real database. The mock client implements
 * just the surface inferDispatchOutcome touches:
 *   - tableExists() -> SELECT 1 FROM information_schema.tables
 *   - findTateSignal() -> SELECT body, ts FROM <smsTable>
 *   - inferForkSpawnOutcome() -> SELECT status, result FROM os_forks
 *   - inferFactoryDispatchOutcome() -> SELECT status, ..., commit_sha, deploy_status FROM cc_sessions
 *
 * The mock dispatcher (mkClient) returns canned rowsets keyed off SQL
 * substring matching.
 *
 * Origin: Phase G Critique #1 fix, fork_molg9isk_302330.
 */

const {
  inferDispatchOutcome,
  AFFIRMATION_KEYWORDS,
  CORRECTION_KEYWORDS,
  UNVERIFIED_AGE_MS,
} = require('../outcomeInference')

// ---- mock pg client factory ----------------------------------------------

/**
 * mkClient(plan) returns a fake pg client whose query(sql, params) returns
 * the first plan entry whose `match` substring is in `sql`. Plan entries:
 *   { match: 'FROM os_forks', rows: [{...}] }
 *   { match: 'FROM cc_sessions', rows: [{...}] }
 *   { match: 'FROM information_schema.tables', rows: [{ '?column?': 1 }], when: (sql, params) => ... }
 *
 * If no entry matches, returns { rows: [], rowCount: 0 }. This means a test
 * that doesn't stub a particular table behaves as if the table is missing
 * (which exercises the silent-skip branches).
 *
 * Use plan.tables: Set<string> to declare which tables exist for the
 * tableExists() check.
 */
function mkClient({ tables = new Set(), forkRow = null, ccRow = null, smsRows = [] } = {}) {
  return {
    async query(sql, params) {
      // information_schema.tables -> tableExists()
      if (sql.includes('FROM information_schema.tables')) {
        const t = params && params[0]
        if (tables.has(t)) {
          return { rows: [{ '?column?': 1 }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      }
      // os_forks lookup
      if (sql.includes('FROM os_forks') || sql.includes('FROM forks')) {
        if (forkRow) return { rows: [forkRow], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      }
      // cc_sessions lookup
      if (sql.includes('FROM cc_sessions')) {
        if (ccRow) return { rows: [ccRow], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      }
      // sms_messages / sms_inbound / sms_log
      if (
        sql.includes('FROM sms_messages') ||
        sql.includes('FROM sms_inbound') ||
        sql.includes('FROM sms_log')
      ) {
        return { rows: smsRows, rowCount: smsRows.length }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

// Helper to build a dispatch row N minutes in the past.
function dispatch({ action_type = 'tool_call:db_execute', minutesAgo = 60, metadata = {} } = {}) {
  return {
    id: 'disp_test',
    ts: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    actor: 'main',
    action_type,
    tool_name: action_type,
    metadata,
  }
}

// ---- the 7 tests from the brief acceptance criteria ----------------------

describe('inferDispatchOutcome - Phase G 4-state outcome model', () => {
  test('1. tool call older than 30min with no signal -> outcome=unverified, classification=NULL', async () => {
    // tool_call:db_execute dispatch, 60 min old, no SMS, no fork/cc rows.
    const client = mkClient({ tables: new Set(['sms_messages']), smsRows: [] })
    const result = await inferDispatchOutcome(client, dispatch({ minutesAgo: 60 }), 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('unverified')
    // classification is left NULL by the inferrer; classifyOutcome assigns it later.
    expect(result.evidence).toMatch(/no positive or negative signal/)
  })

  test('2. tool call with Tate SMS thanks within 30min -> outcome=success', async () => {
    const smsTs = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const d = dispatch({ minutesAgo: 10 })
    // SMS arrives 5 min ago, dispatch was 10 min ago, so SMS is within window.
    const client = mkClient({
      tables: new Set(['sms_messages']),
      smsRows: [{ body: 'thanks for shipping that', ts: smsTs }],
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('success')
    expect(result.evidence).toMatch(/affirmation/)
    expect(result.evidence).toMatch(/thanks/)
  })

  test('3. tool call with Tate SMS correction within 30min -> outcome=correction', async () => {
    const smsTs = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const d = dispatch({ minutesAgo: 10 })
    const client = mkClient({
      tables: new Set(['sms_messages']),
      smsRows: [{ body: 'no that is wrong fork', ts: smsTs }],
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('correction')
    expect(result.correction_text).toBe('no that is wrong fork')
    expect(result.evidence).toMatch(/correction/)
  })

  test('4. factory_dispatch status=deployed AND commit_sha + deploy_status=deployed -> outcome=success', async () => {
    const d = dispatch({
      action_type: 'factory_dispatch',
      minutesAgo: 60,
      metadata: { session_id: 'cc_test_42' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'cc_sessions']),
      ccRow: {
        status: 'deployed',
        pipeline_stage: 'deployed',
        commit_sha: 'abc123def456',
        deploy_status: 'deployed',
      },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('success')
    expect(result.evidence).toMatch(/cc_sessions\.id=cc_test_42/)
    expect(result.evidence).toMatch(/commit_sha=abc123de/)
  })

  test('4b. factory_dispatch status=deployed BUT deploy_status missing -> outcome=unverified (not success)', async () => {
    // Critical: this guards against the JARVIS §8 "claimed-done-but-unverified"
    // anti-pattern. status=deployed alone is not enough.
    const d = dispatch({
      action_type: 'factory_dispatch',
      minutesAgo: 60,
      metadata: { session_id: 'cc_test_43' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'cc_sessions']),
      ccRow: {
        status: 'deployed',
        pipeline_stage: 'deployed',
        commit_sha: null,           // <- missing
        deploy_status: null,        // <- missing
      },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('unverified')
  })

  test('5. factory_dispatch status=error -> outcome=failure', async () => {
    const d = dispatch({
      action_type: 'factory_dispatch',
      minutesAgo: 60,
      metadata: { session_id: 'cc_test_99' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'cc_sessions']),
      ccRow: {
        status: 'error',
        pipeline_stage: 'failed',
        commit_sha: null,
        deploy_status: null,
      },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('failure')
    expect(result.evidence).toMatch(/cc_sessions\.id=cc_test_99 status=error/)
  })

  test('6. fork_spawn status=error -> outcome=failure', async () => {
    const d = dispatch({
      action_type: 'fork_spawn',
      minutesAgo: 60,
      metadata: { fork_id: 'fork_test_xx' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'os_forks']),
      forkRow: { status: 'error', result: null },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('failure')
    expect(result.evidence).toMatch(/os_forks\.fork_id=fork_test_xx status=error/)
  })

  test('7. fork_spawn status=done AND result.length > 0 -> outcome=success', async () => {
    const d = dispatch({
      action_type: 'fork_spawn',
      minutesAgo: 60,
      metadata: { fork_id: 'fork_test_yy' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'os_forks']),
      forkRow: { status: 'done', result: '[FORK_REPORT] fixed the thing, PR #123' },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('success')
    expect(result.evidence).toMatch(/result_length=/)
  })

  test('7b. fork_spawn status=done BUT result empty -> outcome=unverified (not success)', async () => {
    // Guards against treating a terminal-done fork with no work product as success.
    const d = dispatch({
      action_type: 'fork_spawn',
      minutesAgo: 60,
      metadata: { fork_id: 'fork_test_zz' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'os_forks']),
      forkRow: { status: 'done', result: '' },
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).not.toBeNull()
    expect(result.outcome).toBe('unverified')
  })

  test('8. dispatch younger than 30min with no signal -> defer (returns null)', async () => {
    // Within the verification window, no signal yet. We should NOT prematurely
    // mark as unverified - revisit next tick.
    const d = dispatch({ minutesAgo: 10 })
    const client = mkClient({ tables: new Set(['sms_messages']), smsRows: [] })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result).toBeNull()
  })

  test('9. failure beats correction beats affirmation in priority', async () => {
    // factory_dispatch with status=error AND a Tate "thanks" SMS in the
    // window. Failure must win - the cc_sessions error is a stronger signal
    // than a generic affirmation.
    const smsTs = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const d = dispatch({
      action_type: 'factory_dispatch',
      minutesAgo: 10,
      metadata: { session_id: 'cc_priority_test' },
    })
    const client = mkClient({
      tables: new Set(['sms_messages', 'cc_sessions']),
      ccRow: { status: 'error', pipeline_stage: 'failed', commit_sha: null, deploy_status: null },
      smsRows: [{ body: 'thanks', ts: smsTs }],
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result.outcome).toBe('failure')
  })

  test('10. correction beats affirmation in same SMS body', async () => {
    // Defensive: a body containing both correction and affirmation keywords
    // resolves to correction (the rebuke is the actionable signal).
    const smsTs = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const d = dispatch({ minutesAgo: 10 })
    const client = mkClient({
      tables: new Set(['sms_messages']),
      smsRows: [{ body: 'no thats wrong but thanks for trying', ts: smsTs }],
    })
    const result = await inferDispatchOutcome(client, d, 'sms_messages')
    expect(result.outcome).toBe('correction')
  })

  test('11. AFFIRMATION_KEYWORDS does not include too-short ambiguous tokens', async () => {
    // The affirmation list intentionally excludes 'ok' / 'k' / 'sure' to
    // avoid false-positive successes. This is a regression guard.
    expect(AFFIRMATION_KEYWORDS).not.toContain('ok')
    expect(AFFIRMATION_KEYWORDS).not.toContain('k')
    expect(AFFIRMATION_KEYWORDS).not.toContain('sure')
  })

  test('12. UNVERIFIED_AGE_MS is exposed and is 30 minutes', async () => {
    // Architecture invariant: the verification window is the same as the SMS
    // correction window. If you change one, change both deliberately.
    expect(UNVERIFIED_AGE_MS).toBe(30 * 60 * 1000)
  })
})
