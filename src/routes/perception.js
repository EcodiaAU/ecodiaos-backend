/**
 * Perception route — GET /api/perception/recent
 *
 * Falls back to application-events.jsonl since perception_events table
 * does not exist. Returns last 20 lines parsed as PerceptionEvent objects.
 *
 * Powers the PERCEPTION panel in CortexAmbient Phase 2.
 *
 * No auth required — read-only ambient data.
 *
 * Origin: fork_mp3ndv83_63898a, 2026-05-13
 */
const { Router } = require('express')
const fs = require('fs')
const path = require('path')
const logger = require('../config/logger')

const router = Router()

// Canonical location per conductorStreamTagWatcher.js + scratchpadService.js
const JSONL_PATH = process.env.ECODIAOS_APPLICATION_EVENT_FILE
  || path.join(process.env.HOME || '/home/tate', 'ecodiaos/logs/telemetry/application-events.jsonl')

/**
 * Read last N lines of a file without loading the whole thing into memory.
 * Returns [] if file missing or unreadable.
 */
function readLastLines(filePath, n) {
  try {
    const stat = fs.statSync(filePath)
    const size = stat.size
    if (size === 0) return []

    // Read up to 64KB from the end — enough for 20 JSONL lines
    const bufSize = Math.min(size, 65536)
    const buf = Buffer.alloc(bufSize)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buf, 0, bufSize, size - bufSize)
    fs.closeSync(fd)

    const text = buf.toString('utf-8')
    const lines = text.split('\n').filter((l) => l.trim().length > 0)
    return lines.slice(-n)
  } catch {
    return []
  }
}

/**
 * Map a raw JSONL event to the PerceptionEvent shape the FE expects.
 * Handles both conductorStreamTagWatcher format and scratchpadService format.
 */
function mapEvent(raw) {
  // scratchpadService shape: { ts, kind, pattern_path, reason, session_id }
  if (raw.kind && raw.pattern_path) {
    return {
      type: raw.kind,           // 'pattern_applied' | 'pattern_not_applied'
      source: raw.session_id ?? 'conductor',
      summary: raw.pattern_path.split('/').pop()?.replace('.md', '') ?? raw.pattern_path,
      timestamp: raw.ts ?? new Date().toISOString(),
    }
  }

  // conductorStreamTagWatcher shape: { ts, hook_name, tool_name, kind, context, surfaces }
  if (raw.hook_name) {
    return {
      type: raw.kind ?? raw.hook_name,
      source: raw.hook_name,
      summary: raw.tool_name ?? '',
      timestamp: raw.ts ?? new Date().toISOString(),
    }
  }

  // Generic fallback — preserve whatever fields exist
  return {
    type: raw.type ?? raw.kind ?? 'event',
    source: raw.source ?? raw.hook_name ?? null,
    summary: raw.summary ?? raw.message ?? raw.pattern_path ?? '',
    timestamp: raw.ts ?? raw.timestamp ?? new Date().toISOString(),
  }
}

router.get('/recent', (_req, res) => {
  const lines = readLastLines(JSONL_PATH, 20)

  if (lines.length === 0) {
    // File doesn't exist yet — return graceful empty
    return res.json({ events: [], source: 'jsonl_unavailable' })
  }

  const events = []
  for (const line of lines) {
    try {
      const raw = JSON.parse(line)
      events.push(mapEvent(raw))
    } catch {
      // Skip malformed lines silently
    }
  }

  // Reverse so newest-first
  events.reverse()

  res.json({ events, source: 'jsonl' })
})

module.exports = router
