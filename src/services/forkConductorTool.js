/**
 * forkConductorTool - exposes fork-mode to the conductor as native SDK tools.
 *
 * The conductor is the Claude Agent SDK process; tools registered here appear
 * in its tool list as `mcp__forks__spawn_fork`, `mcp__forks__list_forks`, and
 * `mcp__forks__abort_fork`. They run in-process (no MCP subprocess), share
 * memory with `forkService`, and return immediately - spawn_fork is fire-and-
 * forget from the conductor's perspective.
 *
 * Design: the conductor decides parallelism. It can fan out up to 5 forks for
 * a single request and then go back to its primary work; fork reports land in
 * its inbox via the message queue when each fork finishes.
 */
'use strict'

const logger = require('../config/logger')

// Lazy-load the SDK + zod at first use. Both are CJS-incompatible (SDK is ESM,
// zod is fine but sized) so we only pay the cost when the conductor actually
// spawns. The factory returns the SDK MCP server config object, which is
// passed verbatim into options.mcpServers.forks.
//
// IMPORTANT: do NOT cache the returned server instance across SDK queries.
// `@modelcontextprotocol/sdk` Server.connect() throws "Already connected to a
// transport" if the same Server instance is connected to a second transport
// (protocol.js:215-218). Sharing one instance across the conductor + every
// fork meant the second SDK query's connect() threw, the SDK silently caught
// it in connectSdkMcpServer() and removed the server from sdkMcpServerInstances,
// and the fork ended up without mcp__forks__* tools — even though
// `--allowedTools` listed them. The manager-fork primitive silently degraded:
// managers could describe sub-fork plans but could not actually call
// mcp__forks__spawn_fork. (Diagnosis: fork_mowkbcm4_ca76a0, 8 May 2026.
// Earlier signal: fork_mov38cpu_054df5 self-reported the same on 7 May 2026.)
//
// We DO cache the SDK module load + the tool wrappers (which are pure-data
// definitions) since rebuilding zod schemas + tool() wrappers on every spawn
// is wasted work. The createSdkMcpServer() call is the only thing that must
// run fresh per call so each query gets its own Server instance with its own
// _transport slot.
let _toolsCache = null
let _toolsBuilding = null
let _createSdkMcpServer = null

async function _buildTools() {
  if (_toolsCache) return _toolsCache
  if (_toolsBuilding) return _toolsBuilding

  _toolsBuilding = (async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    const { createSdkMcpServer, tool } = sdk
    const z = require('zod')
    const fork = require('./forkService')
    _createSdkMcpServer = createSdkMcpServer

    const spawn_fork_tool = tool(
      'spawn_fork',
      'Spawn a parallel fork sub-session that works on `brief` while you continue your own work. Returns immediately with a fork_id. The fork runs independently - it does NOT share state with you, and you cannot talk to it while it works. When it finishes, its [FORK_REPORT] arrives in your inbox as a [SYSTEM: fork_report] queue message on your next turn. Use this whenever a piece of work can run in parallel with whatever else you are doing. You can spawn up to 5 concurrent forks. MANAGER FORKS: if you include MANAGER: true in the brief, the fork is expected to decompose its task, spawn its own sub-forks (passing its own fork_id as parent_fork_id), and return a consolidated [FORK_REPORT] to you. Sub-fork reports go to the manager, not to you - you only see the manager summary. This gives you one clean line per piece of work regardless of how many workers are running under it.',
      {
        brief: z.string().min(1).describe('A complete brief describing what the fork should do. The fork will not have your context; write the brief as if you are handing the task to a fresh OS instance - include the goal, any constraints, and what counts as done. Include MANAGER: true if the fork should decompose and spawn its own sub-forks.'),
        context_mode: z.enum(['recent', 'brief']).optional().default('recent').describe('"recent" (default): fork inherits the recent conversation tail. "brief": fork gets only the brief, no context - use when the brief is self-contained and you want to minimize the fork token cost.'),
        parent_fork_id: z.string().optional().describe('Set this to your own fork_id when spawning sub-forks from within a manager fork. Sub-fork reports will route to you (the manager) instead of the conductor. Leave unset when spawning from main.'),
      },
      async (args) => {
        try {
          const snap = await fork.spawnFork({
            brief: args.brief,
            context_mode: args.context_mode || 'recent',
            parent_fork_id: args.parent_fork_id || 'main',
          })
          return {
            content: [{
              type: 'text',
              text: `Fork spawned: ${snap.fork_id}\nstatus: ${snap.status}\nbrief: ${(snap.brief || '').slice(0, 200)}${snap.brief && snap.brief.length > 200 ? '…' : ''}\n\nThe fork is running in parallel. Its [FORK_REPORT] arrives on a future turn.`,
            }],
          }
        } catch (err) {
          // Cap-rejected spawns return a recognisable shape so the conductor
          // can decide whether to retry, queue the brief, or hand it back to
          // the user. We surface the error message verbatim - the model is
          // smart enough to read it and adapt.
          const detail = err && err.code
            ? `${err.code}: ${err.message}${err.details ? ' - ' + JSON.stringify(err.details) : ''}`
            : err && err.message ? err.message : String(err)
          return {
            content: [{
              type: 'text',
              text: `Fork spawn rejected - ${detail}\n\nIf cap_reached: wait for an active fork to finish, or do this work yourself. If energy_cap_reached: the weekly Claude Max budget is tight and parallelism is being throttled.`,
            }],
            isError: true,
          }
        }
      },
    )

    const list_forks_tool = tool(
      'list_forks',
      'List all currently-active forks (and recently-finished ones, last 5 min). Use this if you want to know what is running in parallel before deciding to spawn another, or if you want to check on a fork by id.',
      {},
      async () => {
        try {
          const live = fork.listForks()
          if (!live.length) {
            return { content: [{ type: 'text', text: 'No forks running.' }] }
          }
          const rows = live.map(f => {
            const ageSec = f.started_at ? Math.round((Date.now() - new Date(f.started_at).getTime()) / 1000) : 0
            return `- ${f.fork_id} [${f.status}] (${ageSec}s, ${f.tool_calls} tools)\n    brief: ${(f.brief || '').slice(0, 200)}\n    position: ${(f.position || '').slice(0, 200)}${f.result ? '\n    result: ' + (f.result || '').slice(0, 200) : ''}`
          })
          return {
            content: [{
              type: 'text',
              text: `Active forks (${live.length}/${fork.HARD_FORK_CAP}):\n${rows.join('\n')}`,
            }],
          }
        } catch (err) {
          return { content: [{ type: 'text', text: `list_forks error: ${err.message}` }], isError: true }
        }
      },
    )

    const abort_fork_tool = tool(
      'abort_fork',
      'Abort a running fork by id. Use sparingly - the report you would have received is lost. Useful when the same work has been superseded by a later instruction or when a fork is clearly going wrong.',
      {
        fork_id: z.string().describe('The fork id to abort, as returned by spawn_fork.'),
        reason: z.string().optional().describe('Short reason - recorded in the fork registry for post-hoc analysis.'),
      },
      async (args) => {
        try {
          const result = await fork.abortFork(args.fork_id, args.reason || 'conductor_abort')
          if (!result.aborted) {
            return { content: [{ type: 'text', text: `abort_fork: ${result.reason || 'not aborted'}` }] }
          }
          return { content: [{ type: 'text', text: `Fork ${args.fork_id} aborted.` }] }
        } catch (err) {
          return { content: [{ type: 'text', text: `abort_fork error: ${err.message}` }], isError: true }
        }
      },
    )

    const send_message_tool = tool(
      'send_message',
      'Inject a new user message into a running fork\'s SDK stream without aborting it. Use this when Tate (or new context on main) gives input that is relevant to a fork that is still running. The fork will receive the message on its next SDK turn and decide what to do with it. The fork remains responsible for its [FORK_REPORT] - your message becomes additional context, not a new task. If you want a different task, abort and respawn.',
      {
        fork_id: z.string().describe('The fork id to send a message to, as returned by spawn_fork.'),
        message: z.string().min(1).describe('The message text to inject into the fork\'s SDK stream.'),
      },
      async (args) => {
        try {
          const result = fork.sendMessageToFork(args.fork_id, args.message)
          if (!result.accepted) {
            return {
              content: [{ type: 'text', text: `send_message rejected: ${result.reason}` }],
              isError: true,
            }
          }
          return {
            content: [{
              type: 'text',
              text: `Message injected into fork ${result.fork_id}. Queued messages waiting to be consumed: ${result.queued_messages}.`,
            }],
          }
        } catch (err) {
          return { content: [{ type: 'text', text: `send_message error: ${err.message}` }], isError: true }
        }
      },
    )

    const tools = [spawn_fork_tool, list_forks_tool, abort_fork_tool, send_message_tool]
    logger.info('forkConductorTool: tool wrappers built (per-query server factory ready)', {
      tools: ['spawn_fork', 'list_forks', 'abort_fork', 'send_message'],
    })
    _toolsCache = tools
    return tools
  })()

  return _toolsBuilding
}

async function getForkConductorMcpServer() {
  // Always build a fresh Server instance — see header comment for why caching
  // the wrapper across SDK queries breaks the second-and-later connect() call.
  const tools = await _buildTools()
  return _createSdkMcpServer({
    name: 'forks',
    version: '1.0.0',
    tools,
  })
}

module.exports = { getForkConductorMcpServer }
