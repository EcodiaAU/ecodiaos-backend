// Hot-loaded by extension.js. Tracks per-Claude-Code-tab activity and closes
// idle tabs based on a TTL.
//
// Activity signals (any one resets the idle clock for a tab):
//   - tab became active (user focused it)
//   - tab label changed (assistant updated chat title - common during streaming)
//   - assistant Stop hook fired for the tab's workspace folder (chat-heartbeats.json)
//
// A tab is eligible for close when:
//   - it is a Claude Code webview tab (viewType match), AND
//   - it is NOT currently active (the user isn't looking at it), AND
//   - its last activity is older than TTL_MIN minutes.
//
// Default TTL = 8 minutes. Configurable via ECODIA_CHAT_IDLE_TTL_MIN env var
// read at extension activation time (passed in via init()).

const fs = require('fs');
const path = require('path');
const os = require('os');

const HEARTBEAT_FILE = path.join(os.homedir(), '.ecodia-preview', 'chat-heartbeats.json');
const CLAUDE_VIEWTYPE_HINTS = ['claude-vscode', 'claude-code', 'claudeChat'];

// Cowork-dispatched worker markers. dispatch_worker writes a .spawned file
// per worker on registration; workers heartbeat into the same dir each turn.
// If any marker is fresh (mtime within WORKER_FRESHNESS_MS), the sweep cycle
// suspends entirely - we don't want to nuke an in-flight dispatched worker
// tab mid-state-write. Trades off some over-retention of idle non-worker
// chat tabs for safety; acceptable for v1.
const COWORK_STATE_DIR = 'D:\\.code\\EcodiaOS\\coordination\\state';
const WORKER_FRESHNESS_MS = 5 * 60 * 1000;  // 5 minutes

// In-memory tracker: Map<tabKey, { lastActiveAt: number, label: string, workspace: string|null }>
const tabTracker = new Map();
let sweepTimer = null;
let ttlMinutes = 8;

function readHeartbeats() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); }
  catch { return { sessions: {} }; }
}

function isClaudeCodeTab(tab) {
  if (!tab || !tab.input) return false;
  const input = tab.input;
  // Webview tabs expose viewType via the input property
  const viewType = input.viewType || input.notebookType || '';
  if (typeof viewType === 'string') {
    for (const hint of CLAUDE_VIEWTYPE_HINTS) {
      if (viewType.toLowerCase().includes(hint.toLowerCase())) return true;
    }
  }
  // Fallback: label-based detection
  const label = String(tab.label || '').toLowerCase();
  if (label.startsWith('claude code') || label === 'claude') return true;
  return false;
}

function tabKey(tab) {
  // Stable identifier for a tab within this VS Code window. Tab objects don't
  // carry a unique ID in the VS Code API, so we synthesize one from viewType +
  // label + group column. Collisions are possible but rare; if two tabs share
  // a key they will share an idle clock which is acceptable for V1.
  const viewType = tab?.input?.viewType || 'unknown';
  const label = tab?.label || 'unknown';
  const column = tab?.group?.viewColumn ?? -1;
  return `${viewType}::${label}::${column}`;
}

function tabWorkspace(tab, vscode) {
  // Best-effort: use the first workspace folder visible to this VS Code window
  // as the workspace for ALL CC tabs in this window. CC chats inherit the
  // launching window's workspace folder so this is usually correct.
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return null;
  return folders[0].uri.fsPath;
}

function touchTab(tab, vscode) {
  if (!isClaudeCodeTab(tab)) return;
  const key = tabKey(tab);
  tabTracker.set(key, {
    lastActiveAt: Date.now(),
    label: tab.label,
    workspace: tabWorkspace(tab, vscode),
  });
}

function workspaceRecentlyActive(workspacePath) {
  if (!workspacePath) return false;
  const data = readHeartbeats();
  const sessions = data.sessions || {};
  const cutoff = Date.now() - ttlMinutes * 60 * 1000;
  const normalized = path.normalize(workspacePath).toLowerCase();
  for (const entry of Object.values(sessions)) {
    if (!entry?.cwd || !entry?.last_stop_at) continue;
    const entryCwd = path.normalize(entry.cwd).toLowerCase();
    if (entryCwd === normalized || entryCwd.startsWith(normalized) || normalized.startsWith(entryCwd)) {
      const stopMs = new Date(entry.last_stop_at).getTime();
      if (stopMs > cutoff) return true;
    }
  }
  return false;
}

// Returns true if any dispatched-worker marker is fresh (mtime < WORKER_FRESHNESS_MS).
// When true, sweep() suspends to avoid killing in-flight workers mid-state-write.
function liveWorkersPresent() {
  try {
    if (!fs.existsSync(COWORK_STATE_DIR)) return false;
    const cutoff = Date.now() - WORKER_FRESHNESS_MS;
    const files = fs.readdirSync(COWORK_STATE_DIR);
    for (const f of files) {
      if (!f.endsWith('.spawned') && !f.endsWith('.heartbeat')) continue;
      try {
        const st = fs.statSync(path.join(COWORK_STATE_DIR, f));
        if (st.mtime.getTime() > cutoff) return true;
      } catch {}
    }
    return false;
  } catch { return false; }
}

async function sweep(vscode, opts = {}) {
  const dryRun = !!opts.dryRun;
  const ttlMs = ttlMinutes * 60 * 1000;
  const now = Date.now();
  const closed = [];
  const kept = [];

  // Sweeper-skip: if any dispatched-worker is alive (fresh marker), bail out.
  // Trades over-retention of idle non-worker tabs for guaranteed worker safety.
  if (liveWorkersPresent()) {
    return { closed: [], kept: [], ttl_min: ttlMinutes, swept_at: new Date(now).toISOString(), skipped: 'live_workers_present' };
  }

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!isClaudeCodeTab(tab)) continue;

      const key = tabKey(tab);
      const entry = tabTracker.get(key);
      const lastActive = entry?.lastActiveAt ?? now;
      const ageMs = now - lastActive;

      // Three reasons to keep:
      //  1. tab is currently active (user is looking at it)
      //  2. tab activity within TTL window
      //  3. workspace had a Stop-hook fire within TTL window
      const workspace = tabWorkspace(tab, vscode);
      const workspaceActive = workspaceRecentlyActive(workspace);

      if (tab.isActive) {
        // Refresh the clock when active
        touchTab(tab, vscode);
        kept.push({ key, reason: 'active', ageMs: 0 });
        continue;
      }
      if (ageMs < ttlMs) {
        kept.push({ key, reason: 'within-ttl', ageMs });
        continue;
      }
      if (workspaceActive) {
        kept.push({ key, reason: 'workspace-recent-stop', ageMs });
        continue;
      }

      if (!dryRun) {
        try {
          await vscode.window.tabGroups.close(tab, false);
          closed.push({ key, ageMs, label: tab.label });
          tabTracker.delete(key);
        } catch (e) {
          kept.push({ key, reason: `close-failed:${String(e && e.message || e)}`, ageMs });
        }
      } else {
        closed.push({ key, ageMs, label: tab.label, dryRun: true });
      }
    }
  }

  return { closed, kept, ttl_min: ttlMinutes, swept_at: new Date(now).toISOString() };
}

function init(vscode, opts = {}) {
  ttlMinutes = Number(opts.ttlMinutes || process.env.ECODIA_CHAT_IDLE_TTL_MIN || 8);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1) ttlMinutes = 8;

  // Seed the tracker with currently-open tabs
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (isClaudeCodeTab(tab)) touchTab(tab, vscode);
    }
  }

  const disposables = [];

  disposables.push(vscode.window.tabGroups.onDidChangeTabs((event) => {
    for (const tab of event.opened || []) touchTab(tab, vscode);
    for (const tab of event.changed || []) touchTab(tab, vscode);
    for (const tab of event.closed || []) tabTracker.delete(tabKey(tab));
  }));

  // onDidChangeActiveTab signals user focus
  if (vscode.window.tabGroups.onDidChangeActiveTab) {
    disposables.push(vscode.window.tabGroups.onDidChangeActiveTab((tab) => {
      if (tab) touchTab(tab, vscode);
    }));
  }

  // Sweep every 90s
  sweepTimer = setInterval(() => {
    sweep(vscode).catch(() => {});
  }, 90 * 1000);

  return {
    dispose: () => {
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = null;
      for (const d of disposables) { try { d.dispose(); } catch {} }
    },
  };
}

module.exports = { init, sweep, isClaudeCodeTab, tabTracker };
