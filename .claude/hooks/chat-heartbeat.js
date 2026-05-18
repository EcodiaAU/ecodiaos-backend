#!/usr/bin/env node
'use strict';

/**
 * Stop hook - fires when the assistant finishes its turn.
 *
 * Writes/updates a heartbeat in ~/.ecodia-preview/chat-heartbeats.json so the
 * idle-tab sweeper in the Ecodia Preview extension knows when this workspace
 * last had assistant activity. The sweeper closes Claude Code webview tabs
 * whose corresponding workspace has been idle past TTL_MIN.
 *
 * Companion to laptop-agent/cursor-preview-extension/extension.js (sweep loop).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REGISTRY_DIR = path.join(os.homedir(), '.ecodia-preview');
const HEARTBEAT_FILE = path.join(REGISTRY_DIR, 'chat-heartbeats.json');

function readHeartbeats() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); }
  catch { return { sessions: {} }; }
}

function writeHeartbeats(data) {
  try {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // Heartbeat failures must never block the hook chain
  }
}

try {
  const sessionId = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || `unknown-${process.pid}`;
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const now = new Date().toISOString();

  const data = readHeartbeats();
  if (!data.sessions) data.sessions = {};
  data.sessions[sessionId] = {
    last_stop_at: now,
    cwd: cwd,
    pid: process.ppid || process.pid,
  };

  // Prune entries older than 24h to keep the file bounded.
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [sid, entry] of Object.entries(data.sessions)) {
    if (entry.last_stop_at && new Date(entry.last_stop_at).getTime() < cutoff) {
      delete data.sessions[sid];
    }
  }

  writeHeartbeats(data);
} catch (e) {
  // Silent - hook must not break the agent loop
}

process.exit(0);
