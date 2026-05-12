'use strict'

/**
 * capabilityRouterTool — exposes the deterministic capability router as a
 * native in-process SDK MCP tool: mcp__router__route_work.
 *
 * Mirrors forkConductorTool.js exactly:
 *  - Tool wrappers built ONCE per process (cached in _toolsCache).
 *  - createSdkMcpServer() called FRESH per SDK query so each query gets its
 *    own Server instance with its own _transport slot.
 *
 * See ~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md
 * for why the singleton pattern breaks the second-and-later SDK query.
 */

const logger = require('../config/logger')

let _toolsCache = null
let _toolsBuilding = null
let _createSdkMcpServer = null

// Test seam — mirrors forkConductorTool pattern. NEVER set in production.
let _sdkOverride = null
function _setSdkOverrideForTest(sdkLike) { _sdkOverride = sdkLike }
function _resetForTest() {
  _toolsCache = null
  _toolsBuilding = null
  _createSdkMcpServer = null
  _sdkOverride = null
}

async function _buildTools() {
  if (_toolsCache) return _toolsCache
  if (_toolsBuilding) return _toolsBuilding

  _toolsBuilding = (async () => {
    const sdk = _sdkOverride || await import('@anthropic-ai/claude-agent-sdk')
    const { createSdkMcpServer, tool } = sdk
    const z = require('zod')
    const capabilityRouter = require('./capabilityRouter')
    _createSdkMcpServer = createSdkMcpServer

    const route_work_tool = tool(
      'route_work',
      'Deterministic routing tool. Given a task shape, returns the cheapest correct execution route WITHOUT making an LLM call. Call this before any non-trivial action to decide whether to run on main, delegate to a domain subagent (comms/finance/ops/social), spawn a fork, or spawn a fork_manager. Trust its answer unless you have a specific reason to override (note the reason in your scratchpad). NEVER narrate routing decisions — just call this and proceed. Routes: "main" (do it yourself), "subagent:comms" (gmail/calendar/crm/sms), "subagent:finance" (bookkeeping/stripe/xero), "subagent:ops" (pm2/deploy/vps), "subagent:social" (zernio/linkedin/instagram), "fork" (isolated parallel work), "fork_manager" (parallel orchestration needing sub-fork coordination).',
      {
        task_description: z.string().min(1).describe('One-sentence description of what needs to be done. Include domain keywords (e.g. "send email via gmail", "restart pm2 service") to help domain matching.'),
        intent: z.enum(['info_lookup', 'state_mutation', 'orchestration', 'creative', 'tate_response']).describe('"info_lookup": reading/querying data. "state_mutation": writing/changing state. "orchestration": coordinating multiple steps/systems. "creative": generating content, drafts, voice work. "tate_response": forming a reply directly to Tate.'),
        estimated_steps: z.number().int().positive().optional().default(1).describe('How many tool calls / steps this task needs. 1-2 = trivial, 3-6 = medium, 7+ = heavy.'),
        parallelisable: z.boolean().optional().default(false).describe('True if the work can be broken into concurrent independent sub-tasks. False if steps must be sequential.'),
        tate_visible: z.boolean().optional().default(true).describe('True if the output is shown directly to Tate. False for background/internal work (drafts, research, offline computation).'),
        session_id: z.string().optional().describe('Current session id for log correlation. Pass through if available.'),
      },
      async (args) => {
        try {
          const result = capabilityRouter.route({
            task_description: args.task_description,
            intent: args.intent,
            estimated_steps: args.estimated_steps ?? 1,
            parallelisable: args.parallelisable ?? false,
            tate_visible: args.tate_visible ?? true,
            session_id: args.session_id || null,
          })

          const lines = [
            `route: ${result.route}`,
            `rationale: ${result.rationale}`,
          ]
          if (result.alternates && result.alternates.length > 0) {
            lines.push('alternates:')
            for (const alt of result.alternates) {
              lines.push(`  - ${alt.route}: ${alt.why_not}`)
            }
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          }
        } catch (err) {
          const detail = err && err.message ? err.message : String(err)
          return {
            content: [{ type: 'text', text: `route_work error: ${detail}` }],
            isError: true,
          }
        }
      },
    )

    const tools = [route_work_tool]
    logger.info('capabilityRouterTool: tool wrappers built (per-query server factory ready)', {
      tools: ['route_work'],
    })
    _toolsCache = tools
    return tools
  })()

  return _toolsBuilding
}

async function getCapabilityRouterMcpServer() {
  // Always build a fresh Server instance — see header comment for why caching
  // the wrapper across SDK queries breaks the second-and-later connect() call.
  const tools = await _buildTools()
  return _createSdkMcpServer({
    name: 'router',
    version: '1.0.0',
    tools,
  })
}

module.exports = { getCapabilityRouterMcpServer, _setSdkOverrideForTest, _resetForTest }
