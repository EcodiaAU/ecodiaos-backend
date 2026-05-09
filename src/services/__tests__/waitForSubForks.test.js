'use strict'

// Contract tests for the wait_for_sub_forks tool exposed via forkConductorTool.
//
// Background
// ──────────
// Manager forks were phantom-bailing at 37% (19/51 over the 7d ending 10 May
// 2026) because there was no manager-poll-loop in code — the brief instructed
// the model to poll list_forks/db_query, but managers often emitted no further
// tool calls after spawning workers, the SDK saw nothing to iterate, the turn
// ended with terminal_reason='completed', the iterator closed, [FORK_REPORT]
// was never written, and the fork was marked done with the FALLBACK_MARKER
// prefix. ~374k tokens wasted in re-dispatch cycles.
//
// The structural fix: a blocking MCP tool that polls os_forks server-side
// while the SDK keeps the manager's turn alive (a tool call in flight cannot
// end a turn). This test asserts the tool's contract:
//
//   1. Polls until every sub_fork_id reaches a terminal status
//   2. Returns aggregate {fork_id, status, result_head, next_step}
//   3. result_head is sliced to ≤ 600 chars
//   4. Timeout returns still_pending instead of throwing
//   5. Honours deadline (does not block past max_wait_sec)
//   6. Handles empty/missing rows gracefully
//
// Doctrine:
//   ~/ecodiaos/docs/decisions/manager-fork-bail-architecture-decision-2026-05-10.md
//   ~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md
//   ~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md
//   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

// ── DB mock ─────────────────────────────────────────────────────────────────
// The handler does `require('../config/db')` and then `db\`SELECT … FROM
// os_forks WHERE fork_id = ANY(${ids})\``. We mock the postgres-tagged-template
// callable: each call shifts one fixture off a queue, so the test can stage
// rows transitioning running → done across multiple polls.
// `mock`-prefixed names are exempt from jest's mock-factory out-of-scope guard.
const mockDbCalls = []
const mockDbQueue = []

jest.mock('../../config/db', () => {
  function dbTag(/* strings, ...values */) {
    mockDbCalls.push(Array.from(arguments))
    if (mockDbQueue.length === 0) return Promise.resolve([])
    const next = mockDbQueue.shift()
    if (next instanceof Error) return Promise.reject(next)
    return Promise.resolve(next)
  }
  return dbTag
})

// forkService is required transitively via forkConductorTool._buildTools().
// Stub it so the require doesn't pull half the world (and accidentally try to
// connect to db / load env). We don't exercise any of these in this test.
jest.mock('../forkService', () => ({
  spawnFork: jest.fn(),
  listForks: jest.fn(() => []),
  abortFork: jest.fn(),
  sendMessageToFork: jest.fn(),
  HARD_FORK_CAP: 4,
}))

// Capture the handlers passed to the SDK's tool() factory so we can invoke
// wait_for_sub_forks directly without spinning a real MCP server. Wired into
// forkConductorTool via the _setSdkOverrideForTest seam below.
const mockCapturedTools = {}
const sdkOverride = {
  tool: (name, description, schema, handler) => {
    mockCapturedTools[name] = { name, description, schema, handler }
    return { name, description, schema, handler }
  },
  createSdkMcpServer: (cfg) => ({ ...cfg, _isMockMcpServer: true }),
}

const forkConductorTool = require('../forkConductorTool')
forkConductorTool._setSdkOverrideForTest(sdkOverride)

beforeEach(() => {
  mockDbCalls.length = 0
  mockDbQueue.length = 0
  // Reset the tools cache so per-test invariants (e.g. fresh server config
  // identity) hold. Then re-install the SDK override.
  forkConductorTool._resetForTest()
  forkConductorTool._setSdkOverrideForTest(sdkOverride)
})

// ── Helper: invoke the handler directly ─────────────────────────────────────
async function callWaitTool(args) {
  // Force tool wrappers to be built (they're cached after first build).
  await forkConductorTool.getForkConductorMcpServer()
  const handler = mockCapturedTools.wait_for_sub_forks?.handler
  if (!handler) throw new Error('wait_for_sub_forks handler not registered')
  return handler(args)
}

// ──────────────────────────────────────────────────────────────────────────────
describe('forkConductorTool.wait_for_sub_forks', () => {
  test('returns aggregate when every sub_fork_id is already terminal on first poll', async () => {
    mockDbQueue.push([
      { fork_id: 'fork_a', status: 'done', result: 'Built X. Tests pass.', next_step: 'no action needed', ended_at: new Date() },
      { fork_id: 'fork_b', status: 'done', result: 'Shipped Y commit deadbeef.', next_step: 'verify on prod', ended_at: new Date() },
    ])

    const t0 = Date.now()
    const res = await callWaitTool({
      sub_fork_ids: ['fork_a', 'fork_b'],
      max_wait_sec: 30,
      poll_interval_sec: 5,
    })
    const elapsed = Date.now() - t0

    expect(res.isError).toBeUndefined()
    expect(res.content).toHaveLength(1)
    const text = res.content[0].text
    expect(text).toMatch(/All 2 sub-forks terminal/)
    // Aggregate JSON contains both ids with status + result_head + next_step
    expect(text).toMatch(/"fork_id": "fork_a"/)
    expect(text).toMatch(/"fork_id": "fork_b"/)
    expect(text).toMatch(/"status": "done"/)
    expect(text).toMatch(/"result_head": "Built X\. Tests pass\."/)
    expect(text).toMatch(/"next_step": "no action needed"/)
    expect(text).toMatch(/"next_step": "verify on prod"/)
    // Took only one db call, returned within a single poll cycle (no sleep).
    expect(mockDbCalls).toHaveLength(1)
    expect(elapsed).toBeLessThan(500)
  })

  test('keeps polling until status transitions running → done, then returns aggregate', async () => {
    // First poll: fork_a still running. Second poll: both terminal.
    mockDbQueue.push([
      { fork_id: 'fork_a', status: 'running', result: null, next_step: null, ended_at: null },
      { fork_id: 'fork_b', status: 'done', result: 'b done', next_step: 'nil', ended_at: new Date() },
    ])
    mockDbQueue.push([
      { fork_id: 'fork_a', status: 'done', result: 'a done', next_step: 'nil', ended_at: new Date() },
      { fork_id: 'fork_b', status: 'done', result: 'b done', next_step: 'nil', ended_at: new Date() },
    ])

    const res = await callWaitTool({
      sub_fork_ids: ['fork_a', 'fork_b'],
      max_wait_sec: 30,
      poll_interval_sec: 1,
    })

    expect(res.isError).toBeUndefined()
    expect(res.content[0].text).toMatch(/All 2 sub-forks terminal/)
    expect(mockDbCalls.length).toBeGreaterThanOrEqual(2)
  })

  test('result_head is sliced to ≤ 600 chars to bound payload size', async () => {
    const longResult = 'X'.repeat(2000)
    mockDbQueue.push([
      { fork_id: 'fork_long', status: 'done', result: longResult, next_step: null, ended_at: new Date() },
    ])

    const res = await callWaitTool({
      sub_fork_ids: ['fork_long'],
      max_wait_sec: 30,
      poll_interval_sec: 5,
    })

    const aggregate = JSON.parse(res.content[0].text.split('\n\n')[1])
    expect(aggregate[0].result_head).toHaveLength(600)
    expect(aggregate[0].result_head).toBe('X'.repeat(600))
  })

  test('timeout returns still_pending instead of throwing', async () => {
    // Every poll says fork_slow is still running.
    for (let i = 0; i < 50; i++) {
      mockDbQueue.push([
        { fork_id: 'fork_slow', status: 'running', result: null, next_step: null, ended_at: null },
      ])
    }
    // The final timeout-path query (separate from the loop).
    mockDbQueue.push([
      { fork_id: 'fork_slow', status: 'running', result: 'partial work so far', next_step: null, ended_at: null },
    ])

    const t0 = Date.now()
    const res = await callWaitTool({
      sub_fork_ids: ['fork_slow'],
      max_wait_sec: 1,            // 1 sec total budget
      poll_interval_sec: 1,       // 1 sec per poll cycle
    })
    const elapsed = Date.now() - t0

    expect(res.isError).toBeUndefined()
    const text = res.content[0].text
    expect(text).toMatch(/Timed out after 1s/)
    expect(text).toMatch(/still_pending: \["fork_slow"\]/)
    expect(text).toMatch(/Decide: call wait_for_sub_forks again/)
    // Deadline math: must not block more than ~2s for max_wait_sec=1.
    expect(elapsed).toBeLessThan(2500)
  })

  test('reports missing rows in timeout payload (sub_fork_id never appeared in os_forks)', async () => {
    // Loop polls return one of the two ids only.
    for (let i = 0; i < 50; i++) {
      mockDbQueue.push([
        { fork_id: 'fork_present', status: 'running', result: null, next_step: null, ended_at: null },
      ])
    }
    // Final timeout-path query.
    mockDbQueue.push([
      { fork_id: 'fork_present', status: 'running', result: null, next_step: null, ended_at: null },
    ])

    const res = await callWaitTool({
      sub_fork_ids: ['fork_present', 'fork_missing'],
      max_wait_sec: 1,
      poll_interval_sec: 1,
    })

    expect(res.isError).toBeUndefined()
    expect(res.content[0].text).toMatch(/missing rows: \["fork_missing"\]/)
  })

  test('db error returns isError envelope (no throw)', async () => {
    mockDbQueue.push(new Error('connection refused'))

    const res = await callWaitTool({
      sub_fork_ids: ['fork_x'],
      max_wait_sec: 5,
      poll_interval_sec: 1,
    })

    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/wait_for_sub_forks error: connection refused/)
  })

  test('honours deadline boundary — does not loop past max_wait_sec', async () => {
    // Always-running, very fast poll cadence.
    for (let i = 0; i < 200; i++) {
      mockDbQueue.push([
        { fork_id: 'fork_loop', status: 'running', result: null, next_step: null, ended_at: null },
      ])
    }
    mockDbQueue.push([
      { fork_id: 'fork_loop', status: 'running', result: null, next_step: null, ended_at: null },
    ])

    const t0 = Date.now()
    const res = await callWaitTool({
      sub_fork_ids: ['fork_loop'],
      max_wait_sec: 2,
      poll_interval_sec: 1,
    })
    const elapsed = Date.now() - t0

    expect(res.isError).toBeUndefined()
    expect(res.content[0].text).toMatch(/Timed out after 2s/)
    // Hard upper bound: should never exceed (max_wait_sec * 1000) + one full poll
    // interval + small overhead. 4s is comfortable headroom for 2s budget.
    expect(elapsed).toBeLessThan(4000)
    // Lower bound: must actually have waited near the budget, not returned early.
    expect(elapsed).toBeGreaterThanOrEqual(1500)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('forkConductorTool.getForkConductorMcpServer (regression — tools registered)', () => {
  test('builds an MCP server containing all 5 tools including wait_for_sub_forks', async () => {
    const server = await forkConductorTool.getForkConductorMcpServer()
    expect(server.name).toBe('forks')
    const toolNames = server.tools.map(t => t.name)
    expect(toolNames).toEqual(expect.arrayContaining([
      'spawn_fork', 'list_forks', 'abort_fork', 'send_message', 'wait_for_sub_forks',
    ]))
    expect(toolNames).toHaveLength(5)
  })

  test('every getForkConductorMcpServer() call returns a fresh server config (per-query factory contract)', async () => {
    // Per ~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md
    // the wrapper must NOT cache the createSdkMcpServer return value across calls.
    const a = await forkConductorTool.getForkConductorMcpServer()
    const b = await forkConductorTool.getForkConductorMcpServer()
    expect(a).not.toBe(b)
    // Same tool list (cached wrappers) but different server-config objects.
    expect(a.tools).toBe(b.tools)
  })
})
