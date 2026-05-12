'use strict'

/**
 * scratchpadTool - exposes the scratchpad substrate to the conductor as a native SDK tool.
 *
 * The conductor calls mcp__scratchpad__write() to record reasoning, pattern
 * applications, and decisions silently to DB — replacing [APPLIED]/[NOT-APPLIED]
 * chat-tag narration that polluted Tate's chat stream.
 *
 * Design mirrors forkConductorTool.js EXACTLY:
 *   - Per-query rebuild via getScratchpadMcpServer() — never cache the Server instance.
 *   - Tool wrappers (_toolsCache) are built once per process and reused across queries.
 *   - Non-fatal: if unavailable, the conductor turn proceeds without the tool.
 *
 * Per ~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md:
 *   Server.connect() throws "Already connected to a transport" if the same Server
 *   instance is reused across SDK queries. The createSdkMcpServer() call must run
 *   fresh per call. The tool wrapper array IS cached (pure-data, no server state).
 *
 * Origin: fork_mp27sa0a_67954f, 2026-05-12.
 * Doctrine: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md Layer 3.
 */

const logger = require('../config/logger')

let _toolsCache = null
let _toolsBuilding = null
let _createSdkMcpServer = null

// Test seam - mirrors forkConductorTool.js pattern.
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
    const scratchpad = require('./scratchpadService')
    _createSdkMcpServer = createSdkMcpServer

    const write_tool = tool(
      'write',
      'Record reasoning, pattern applications, or decisions to the scratchpad. This REPLACES emitting [APPLIED]/[NOT-APPLIED] tags as chat text — never narrate those tags. Use this whenever you: (1) apply or consciously skip a doctrine pattern, (2) plan your next steps, (3) make a significant decision, (4) hit a blocker, (5) note an observation or retry. The entry is stored in DB and appears in <scratchpad_recent> context on subsequent turns.',
      {
        kind: z.enum(['plan', 'pattern_applied', 'pattern_not_applied', 'decision', 'observation', 'retry', 'blocker'])
          .describe('"pattern_applied": you read and applied a pattern. "pattern_not_applied": you consciously skipped a pattern with a reason. "plan": your intent for the current arc. "decision": a significant architectural or operational call. "observation": something you noticed. "retry": documenting a retry attempt. "blocker": something blocking progress.'),
        content: z.string().min(1).max(2000)
          .describe('The reasoning content. For pattern_applied/not_applied: what you decided and why. For plan: your intent. For decision: what you decided and the reasoning.'),
        pattern_path: z.string().optional()
          .describe('Path to the pattern file, e.g. "~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md". Required for pattern_applied and pattern_not_applied kinds.'),
        reason: z.string().max(500).optional()
          .describe('Short one-sentence reason. Required for pattern_not_applied (why skipping). Optional for pattern_applied (what specifically applied).'),
        thread_id: z.string().uuid().optional()
          .describe('UUID of the working_set thread this entry relates to, if any.'),
      },
      async (args) => {
        try {
          // Resolve session_id from context. We use the DB session's id, falling back
          // to a process-level sentinel so writes always land somewhere queryable.
          let session_id = 'conductor_main'
          try {
            const sessionService = require('./osSessionService')
            if (sessionService && typeof sessionService.currentDbSessionId === 'function') {
              session_id = sessionService.currentDbSessionId() || 'conductor_main'
            } else if (sessionService && sessionService._currentDbSessionId) {
              session_id = sessionService._currentDbSessionId || 'conductor_main'
            }
          } catch { /* non-fatal */ }

          const result = await scratchpad.write({
            session_id,
            kind: args.kind,
            content: args.content,
            thread_id: args.thread_id || null,
            pattern_path: args.pattern_path || null,
            reason: args.reason || null,
          })
          return {
            content: [{
              type: 'text',
              text: `Scratchpad entry recorded (id=${result.id}, kind=${args.kind})${args.pattern_path ? `, pattern=${args.pattern_path.split('/').pop()}` : ''}.`,
            }],
          }
        } catch (err) {
          const detail = err && err.message ? err.message : String(err)
          return {
            content: [{ type: 'text', text: `scratchpad.write failed: ${detail}` }],
            isError: true,
          }
        }
      },
    )

    const tools = [write_tool]
    logger.info('scratchpadTool: tool wrappers built (per-query server factory ready)', {
      tools: ['write'],
    })
    _toolsCache = tools
    return tools
  })()

  return _toolsBuilding
}

async function getScratchpadMcpServer() {
  // Always build a fresh Server instance per sdk-mcp-server-instances-must-be-per-query-not-singleton.md.
  const tools = await _buildTools()
  return _createSdkMcpServer({
    name: 'scratchpad',
    version: '1.0.0',
    tools,
  })
}

module.exports = { getScratchpadMcpServer, _setSdkOverrideForTest, _resetForTest }
