'use strict'

/**
 * observerMcpTool — exposes the observer_signals substrate to the conductor
 * as native SDK MCP tools. Closes the ack loop the v1 framework left open
 * (the <observer_signals> block told the conductor "Acknowledge via
 * mcp__observer__ack(id) when actioned" but the tool didn't exist).
 *
 * Tools:
 *   mcp__observer__ack(id, reason)          — explicit ack, conductor acted on signal
 *   mcp__observer__dismiss(id, reason)      — explicit dismiss with disagreement reason
 *   mcp__observer__list_recent(name?, hrs?) — pull recent signals on demand
 *   mcp__observer__mark_false_positive(id)  — tuning signal for the weekly cron
 *
 * Design mirrors scratchpadTool.js EXACTLY:
 *   - Per-query rebuild via getObserverMcpServer() — never cache Server.
 *   - Tool wrappers are pure data, cached at module level.
 *   - Non-fatal: turn proceeds without these tools if anything fails.
 *
 * Per ~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md.
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

const logger = require('../config/logger')

let _toolsCache = null
let _toolsBuilding = null
let _createSdkMcpServer = null

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
    const observerSignals = require('./observerSignalsService')
    _createSdkMcpServer = createSdkMcpServer

    function _currentTurnId() {
      try {
        const sessionService = require('./osSessionService')
        if (sessionService && typeof sessionService.currentTurnId === 'function') {
          return sessionService.currentTurnId() || null
        }
      } catch { /* non-fatal */ }
      return null
    }

    const ack_tool = tool(
      'ack',
      'Acknowledge an observer signal that you have ACTED ON. Provide a short reason naming the action you took. This closes the loop so the tuning cron can tell which signals are useful vs noise. Use this whenever the <observer_signals> block surfaces a signal that influenced your next action.',
      {
        id: z.number().int().positive().describe('Signal id from the <observer_signals> block, e.g. id=42.'),
        reason: z.string().min(3).max(500)
          .describe('One short sentence on what you did in response. e.g. "Forked the diagnose pass as the signal suggested." or "Reprioritised: paused current task and addressed storage concern."'),
      },
      async (args) => {
        try {
          const result = await observerSignals.acknowledgeExplicit(args.id, {
            turn_id: _currentTurnId(),
            reason: args.reason,
          })
          if (!result.acknowledged) {
            return {
              content: [{ type: 'text', text: `observer.ack: signal ${args.id} could not be acknowledged${result.error ? ` (${result.error})` : ''}.` }],
              isError: true,
            }
          }
          return { content: [{ type: 'text', text: `observer.ack: signal ${args.id} acked.` }] }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `observer.ack failed: ${err.message || err}` }],
            isError: true,
          }
        }
      },
    )

    const dismiss_tool = tool(
      'dismiss',
      'Dismiss an observer signal you DISAGREE with or have decided NOT to act on. Provide a short reason. This is critical telemetry for tuning — repeated dismissals of the same observer narrow its triggers automatically.',
      {
        id: z.number().int().positive().describe('Signal id from the <observer_signals> block.'),
        reason: z.string().min(3).max(500)
          .describe('Why you disagreed or chose not to act. e.g. "False positive: I did spawn the fork — observer is blind to tool_use events." or "Stale: the work it flagged already completed 2 turns ago."'),
      },
      async (args) => {
        try {
          const result = await observerSignals.dismiss(args.id, {
            turn_id: _currentTurnId(),
            reason: args.reason,
          })
          if (!result.acknowledged) {
            return {
              content: [{ type: 'text', text: `observer.dismiss: signal ${args.id} could not be dismissed${result.error ? ` (${result.error})` : ''}.` }],
              isError: true,
            }
          }
          return { content: [{ type: 'text', text: `observer.dismiss: signal ${args.id} dismissed.` }] }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `observer.dismiss failed: ${err.message || err}` }],
            isError: true,
          }
        }
      },
    )

    const list_recent_tool = tool(
      'list_recent',
      'Pull recent observer signals on demand. Use when the ambient <observer_signals> block has been truncated and you want full context, or to look back further than 30min.',
      {
        observer_name: z.string().optional().describe('Filter to one observer, e.g. "coherence" or "systemPulse". Omit for all.'),
        hours: z.number().min(0.1).max(24).optional().default(1).describe('Look-back window in hours, default 1h, max 24h.'),
        include_acknowledged: z.boolean().optional().default(false).describe('Include already-acked signals. Default false.'),
      },
      async (args) => {
        try {
          const rows = await observerSignals.listRecent({
            observer_name: args.observer_name || null,
            hours: args.hours || 1,
            include_acknowledged: !!args.include_acknowledged,
          })
          if (rows.length === 0) {
            return { content: [{ type: 'text', text: 'observer.list_recent: 0 signals in window.' }] }
          }
          const lines = rows.map(r => {
            const ageMin = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000)
            const ack = r.acknowledged ? ` [acked: ${r.ack_mode || 'unknown'}]` : ''
            const conf = r.confidence != null ? ` conf=${Number(r.confidence).toFixed(2)}` : ''
            return `  [id=${r.id} ${r.observer_name}/${r.signal_kind} p${r.priority || 3} ${ageMin}m ago${conf}${ack}] ${String(r.message).slice(0, 200)}`
          })
          return { content: [{ type: 'text', text: `observer.list_recent: ${rows.length} signals\n${lines.join('\n')}` }] }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `observer.list_recent failed: ${err.message || err}` }],
            isError: true,
          }
        }
      },
    )

    const mark_fp_tool = tool(
      'mark_false_positive',
      'Mark an observer signal as a false positive. This is a strong tuning signal — the weekly tuning cron narrows triggers / archives observers with high false-positive rates. Use sparingly: only when the signal is factually wrong, not just unactionable.',
      {
        id: z.number().int().positive().describe('Signal id.'),
        reason: z.string().min(3).max(500).describe('Why it is factually wrong. e.g. "Claimed I did not spawn fork X, but fork_mp3lt8oa was active at that time."'),
      },
      async (args) => {
        try {
          const result = await observerSignals.markFalsePositive(args.id, {
            turn_id: _currentTurnId(),
            reason: args.reason,
          })
          if (!result.ok) {
            return {
              content: [{ type: 'text', text: `observer.mark_false_positive: signal ${args.id} could not be marked${result.error ? ` (${result.error})` : ''}.` }],
              isError: true,
            }
          }
          return { content: [{ type: 'text', text: `observer.mark_false_positive: signal ${args.id} flagged. Tuning cron will pick this up.` }] }
        } catch (err) {
          return {
            content: [{ type: 'text', text: `observer.mark_false_positive failed: ${err.message || err}` }],
            isError: true,
          }
        }
      },
    )

    const tools = [ack_tool, dismiss_tool, list_recent_tool, mark_fp_tool]
    logger.info('observerMcpTool: tool wrappers built (per-query server factory ready)', {
      tools: ['ack', 'dismiss', 'list_recent', 'mark_false_positive'],
    })
    _toolsCache = tools
    return tools
  })()

  return _toolsBuilding
}

async function getObserverMcpServer() {
  const tools = await _buildTools()
  return _createSdkMcpServer({
    name: 'observer',
    version: '1.0.0',
    tools,
  })
}

module.exports = { getObserverMcpServer, _setSdkOverrideForTest, _resetForTest }
