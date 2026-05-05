#!/usr/bin/env node
/**
 * Scheduler MCP Server - MCP tool surface ONLY.
 *
 * Single responsibility: expose schedule_cron / schedule_delayed / schedule_chain /
 * schedule_list / schedule_cancel / schedule_pause / schedule_resume /
 * schedule_run_now / os_signal_handoff to whichever Claude session loads this
 * stdio MCP server.
 *
 * Polling is OWNED by `src/services/schedulerPollerService.js` inside the
 * persistent ecodia-api process. That poller is the single canonical fire path
 * and it routes every cron through `cronForkDispatcher` / `cronPriority.js` so
 * non-`meta-loop` crons spawn ephemeral forks instead of polluting the
 * conductor's chat stream.
 *
 * History (5 May 2026): this MCP server previously ran its own setInterval
 * polling loop (`pollOnce` -> `fireTask` -> POST /api/os-session/message),
 * which DUPLICATED the canonical poller and bypassed the fork-route entirely.
 * Every Claude session that loaded this stdio server brought up a parallel
 * poller that POSTed cron prompts straight into the conductor's message queue.
 * That was the proximate cause of `[SCHEDULED: telemetry-dispatch-consumer]`,
 * `[SCHEDULED: vercel-deploy-monitor]`, `[SCHEDULED: kg-consolidation]`, etc.
 * still landing in chat after the 4 May 2026 routing fix shipped: the
 * canonical poller respected the fork-route, this duplicate one did not.
 *
 * Tate verbatim 5 May 2026 ~12:09 AEST: "bro youshouldnt be dealing with this
 * shit... why has this poluted the conductor chat... put that shit in a fork
 * in future by default."
 *
 * `fireTask` is preserved (used by `schedule_run_now`) but no longer fires on
 * its own schedule - only when explicitly invoked by an MCP tool call.
 *
 * Doctrine: ~/ecodiaos/patterns/crons-route-to-forks-by-default.md.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import postgres from 'postgres'

const db = postgres(process.env.DATABASE_URL, { max: 3, idle_timeout: 30 })
const API_PORT = process.env.PORT || 3001
// POLL_INTERVAL removed 5 May 2026: polling is owned by ecodia-api/
// schedulerPollerService.js. See header comment.
const TZ_OFFSET_HOURS = 10 // Australia/Brisbane (AEST, no DST)

const server = new McpServer({ name: 'scheduler', version: '1.1.0' })

// ── Parse human-readable schedules ──
// All "daily HH:MM" times are interpreted as Brisbane (AEST, UTC+10).

function parseSchedule(schedule) {
  // "every 30m", "every 2h", "every 72h", "daily 09:00"
  const everyMatch = schedule.match(/^every\s+(\d+)(m|h)$/i)
  if (everyMatch) {
    const val = parseInt(everyMatch[1])
    const unit = everyMatch[2].toLowerCase()
    const ms = unit === 'm' ? val * 60000 : val * 3600000
    return { type: 'interval', ms }
  }
  const dailyMatch = schedule.match(/^daily\s+(\d{1,2}):(\d{2})$/i)
  if (dailyMatch) {
    // Convert AEST to UTC by subtracting offset
    let utcHour = parseInt(dailyMatch[1]) - TZ_OFFSET_HOURS
    if (utcHour < 0) utcHour += 24
    return { type: 'daily', hour: utcHour, minute: parseInt(dailyMatch[2]), localHour: parseInt(dailyMatch[1]) }
  }
  return null
}

function computeNextRun(cronExpr) {
  const parsed = parseSchedule(cronExpr)
  if (!parsed) return null
  const now = new Date()
  if (parsed.type === 'interval') {
    return new Date(now.getTime() + parsed.ms)
  }
  if (parsed.type === 'daily') {
    const next = new Date(now)
    next.setUTCHours(parsed.hour, parsed.minute, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next
  }
  return null
}

// ── MCP Tools ──

server.tool('schedule_cron', 'Create a recurring scheduled task', {
  name: z.string().describe('Unique task name'),
  schedule: z.string().describe('Schedule: "every 30m", "every 2h", "daily 09:00"'),
  prompt: z.string().describe('The prompt to fire when task is due'),
}, async ({ name, schedule, prompt }) => {
  const parsed = parseSchedule(schedule)
  if (!parsed) return { content: [{ type: 'text', text: `Can't parse schedule: "${schedule}". Use "every Xm", "every Xh", "daily HH:MM".` }] }
  const nextRun = computeNextRun(schedule)
  const [row] = await db`
    INSERT INTO os_scheduled_tasks (type, name, prompt, cron_expression, status, next_run_at, run_count, max_runs)
    VALUES ('cron', ${name}, ${prompt}, ${schedule}, 'active', ${nextRun}, 0, 0)
    RETURNING id, next_run_at
  `
  return { content: [{ type: 'text', text: `Cron "${name}" created. Next run: ${row.next_run_at}. Schedule: ${schedule}. Runs indefinitely.` }] }
})

server.tool('schedule_delayed', 'Create a one-shot delayed task', {
  name: z.string().describe('Task name'),
  delay: z.string().describe('Delay: "in 3d", "in 2h", "in 30m" or ISO datetime'),
  prompt: z.string().describe('The prompt to fire'),
}, async ({ name, delay, prompt }) => {
  let runAt
  const delayMatch = delay.match(/^in\s+(\d+)(m|h|d)$/i)
  if (delayMatch) {
    const val = parseInt(delayMatch[1])
    const unit = delayMatch[2].toLowerCase()
    const ms = unit === 'm' ? val * 60000 : unit === 'h' ? val * 3600000 : val * 86400000
    runAt = new Date(Date.now() + ms)
  } else {
    runAt = new Date(delay)
    if (isNaN(runAt.getTime())) return { content: [{ type: 'text', text: `Can't parse delay: "${delay}"` }] }
  }
  const [row] = await db`
    INSERT INTO os_scheduled_tasks (type, name, prompt, status, run_at, next_run_at, run_count, max_runs)
    VALUES ('delayed', ${name}, ${prompt}, 'active', ${runAt}, ${runAt}, 0, 1)
    RETURNING id, next_run_at
  `
  return { content: [{ type: 'text', text: `Delayed task "${name}" created. Fires at: ${row.next_run_at}` }] }
})

server.tool('schedule_chain', 'Create a task that runs after another completes', {
  name: z.string().describe('Task name'),
  afterTaskId: z.string().describe('UUID of task to run after'),
  prompt: z.string().describe('The prompt to fire'),
}, async ({ name, afterTaskId, prompt }) => {
  const [row] = await db`
    INSERT INTO os_scheduled_tasks (type, name, prompt, chain_after, status, run_count, max_runs)
    VALUES ('chain', ${name}, ${prompt}, ${afterTaskId}, 'active', 0, 1)
    RETURNING id
  `
  return { content: [{ type: 'text', text: `Chained task "${name}" created. Fires after task ${afterTaskId} completes.` }] }
})

server.tool('schedule_list', 'List all scheduled tasks', {
  status: z.string().optional().describe('Filter by status: active, paused, completed, cancelled, all'),
}, async ({ status }) => {
  const filter = status === 'all' ? undefined : (status || 'active')
  const tasks = filter
    ? await db`SELECT * FROM os_scheduled_tasks WHERE status = ${filter} ORDER BY next_run_at NULLS LAST`
    : await db`SELECT * FROM os_scheduled_tasks ORDER BY status, next_run_at NULLS LAST`
  return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] }
})

server.tool('schedule_cancel', 'Cancel a scheduled task', {
  taskId: z.string().describe('Task UUID'),
}, async ({ taskId }) => {
  await db`UPDATE os_scheduled_tasks SET status = 'cancelled' WHERE id = ${taskId}`
  return { content: [{ type: 'text', text: `Task ${taskId} cancelled.` }] }
})

server.tool('schedule_pause', 'Pause a scheduled task', {
  taskId: z.string().describe('Task UUID'),
}, async ({ taskId }) => {
  await db`UPDATE os_scheduled_tasks SET status = 'paused' WHERE id = ${taskId}`
  return { content: [{ type: 'text', text: `Task ${taskId} paused.` }] }
})

server.tool('schedule_resume', 'Resume a paused task', {
  taskId: z.string().describe('Task UUID'),
}, async ({ taskId }) => {
  const nextRun = new Date()
  await db`UPDATE os_scheduled_tasks SET status = 'active', next_run_at = ${nextRun} WHERE id = ${taskId}`
  return { content: [{ type: 'text', text: `Task ${taskId} resumed. Next run: now.` }] }
})

server.tool('schedule_run_now', 'Fire a task immediately', {
  taskId: z.string().describe('Task UUID'),
}, async ({ taskId }) => {
  const [task] = await db`SELECT * FROM os_scheduled_tasks WHERE id = ${taskId}`
  if (!task) return { content: [{ type: 'text', text: 'Task not found.' }] }
  await fireTask(task)
  return { content: [{ type: 'text', text: `Task "${task.name}" fired.` }] }
})

server.tool(
  'os_signal_handoff',
  'Signal that the OS is at a handoff point and ready to receive queued messages from Tate. Delivers all pending queued messages as a single synthesised turn. Call this when you finish a thread and are ready for new input.',
  {
    summary: z.string().optional().describe('One-line description of the thread just completed. Prepended to the delivered queue batch for context.'),
  },
  async ({ summary }) => {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/message-queue/signal-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summary || null }),
        signal: AbortSignal.timeout(10_000),
      })
      const data = await res.json().catch(() => ({}))
      return { content: [{ type: 'text', text: JSON.stringify(data) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `signal-handoff failed: ${err.message}` }] }
    }
  }
)

// ── Fire a task - POST to OS session ──

async function fireTask(task) {
  try {
    const prefixed = `[SCHEDULED: ${task.name}] ${task.prompt}`
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/os-session/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prefixed }),
      signal: AbortSignal.timeout(300_000), // 5 min timeout
    })
    const result = await res.json().catch(() => ({}))
    
    // Update task
    const now = new Date()
    if (task.type === 'cron') {
      const nextRun = computeNextRun(task.cron_expression)
      await db`UPDATE os_scheduled_tasks SET 
        last_run_at = ${now}, 
        next_run_at = ${nextRun}, 
        run_count = run_count + 1,
        result = ${JSON.stringify(result).slice(0, 500)}
      WHERE id = ${task.id}`
    } else {
      // One-shot or chain - mark completed
      await db`UPDATE os_scheduled_tasks SET 
        last_run_at = ${now}, 
        run_count = run_count + 1, 
        status = 'completed',
        result = ${JSON.stringify(result).slice(0, 500)}
      WHERE id = ${task.id}`
      
      // Fire any chained tasks
      const chained = await db`SELECT * FROM os_scheduled_tasks WHERE chain_after = ${task.id} AND status = 'active'`
      for (const c of chained) await fireTask(c)
    }
    
    console.error(`[Scheduler] Fired "${task.name}" - success`)
  } catch (err) {
    console.error(`[Scheduler] Failed to fire "${task.name}": ${err.message}`)
    // Don't mark as failed - just skip this run, try next time
    if (task.type === 'cron') {
      const nextRun = computeNextRun(task.cron_expression)
      await db`UPDATE os_scheduled_tasks SET next_run_at = ${nextRun}, result = ${err.message} WHERE id = ${task.id}`
    }
  }
}

// ── Polling loop REMOVED 5 May 2026 ─────────────────────────────────────────
// The previous setInterval(pollOnce, 30s) + setTimeout(pollOnce, 5s) loop +
// pollOnce + isSessionBusy lived here. They duplicated the canonical poller
// in ecodia-api (`src/services/schedulerPollerService.js`) and bypassed the
// fork-route by POSTing every fire to /api/os-session/message via fireTask().
// That was the root cause of `[SCHEDULED: <name>]` cron prompts continuing to
// pollute the conductor's chat stream after the 4 May 2026 routing fix
// (commit df030e7) shipped. The canonical poller respects the fork-route;
// this stdio MCP server's duplicate did not. See header doctrine block.
//
// Polling is now owned solely by ecodia-api. This stdio server is a pure MCP
// tool surface.
// ────────────────────────────────────────────────────────────────────────────

// ── Connect MCP ──

const transport = new StdioServerTransport()
await server.connect(transport)
