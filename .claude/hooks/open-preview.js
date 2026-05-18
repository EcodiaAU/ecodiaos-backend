// DEPRECATED 2026-05-17 - no longer wired as a hook.
// Retired because firing on EVERY Write/Edit/MultiEdit opened a preview for
// every .md/.html the agent touched (incl. patterns, docs, drafts that were
// never meant for Tate). Replaced by reflex-preview.js (sibling), which the
// conductor calls explicitly only when the artefact is for Tate.
//
// Kept on disk in case the auto-fire behaviour is ever re-enabled for a
// narrower matcher (e.g. only drafts/preview-* paths). To re-wire, add back
// the PostToolUse entry in backend/.claude/settings.json with a path filter.
//
// PostToolUse hook: when Write / Edit / MultiEdit lands a previewable file
// (md, html, pdf, svg, ipynb), POST the path to every registered IDE's
// preview extension so the file opens in-IDE without manual Ctrl+Shift+V.
//
// Claude Code passes the tool invocation as a JSON blob on stdin:
//   {
//     session_id, transcript_path, cwd, permission_mode, effort,
//     hook_event_name: "PostToolUse",
//     tool_name: "Write" | "Edit" | "MultiEdit",
//     tool_input: { file_path, ... }
//   }
//
// Env vars like CLAUDE_TOOL_INPUT_FILE_PATH do NOT exist in current Claude
// Code (they were the convention in an older version). Confirmed live
// 2026-05-17 via env-probe: only CLAUDE_PROJECT_DIR + other config-level
// vars are exported; the per-invocation context is stdin-only.
//
// Registry of running IDE preview extensions:
//   %USERPROFILE%/.ecodia-preview/instances.json
// Each entry: { port, ide, workspaceRoots, startedAt }.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return '';
    const fd = 0;
    const chunks = [];
    const buf = Buffer.alloc(256 * 1024);
    // Single read - hook payloads are well under 256KB.
    const n = fs.readSync(fd, buf, 0, buf.length, null);
    return n > 0 ? buf.slice(0, n).toString('utf8') : '';
  } catch {
    return '';
  }
}

const raw = readStdinSync();
if (!raw) process.exit(0);

let payload;
try { payload = JSON.parse(raw); }
catch { process.exit(0); }

const toolInput = payload && payload.tool_input;
const filePath = toolInput && (toolInput.file_path || toolInput.path || toolInput.notebook_path);
if (!filePath) process.exit(0);

const ext = path.extname(filePath).toLowerCase();
const PREVIEWABLE = ['.md', '.markdown', '.html', '.htm', '.pdf', '.svg', '.ipynb'];
if (!PREVIEWABLE.includes(ext)) process.exit(0);

const REGISTRY_FILE = path.join(os.homedir(), '.ecodia-preview', 'instances.json');
let reg;
try { reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
catch { process.exit(0); }

const instances = Object.values(reg);
if (instances.length === 0) process.exit(0);

const norm = filePath.replace(/\\/g, '/').toLowerCase();
const matches = instances.filter(inst =>
  (inst.workspaceRoots || []).some(root =>
    norm.startsWith(root.replace(/\\/g, '/').toLowerCase())
  )
);
const targets = matches.length ? matches : instances;

const post = JSON.stringify({ path: filePath });
for (const inst of targets) {
  const req = http.request({
    host: '127.0.0.1',
    port: inst.port,
    path: '/open-preview',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(post),
    },
    timeout: 1500,
  });
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.write(post);
  req.end();
}

setTimeout(() => process.exit(0), 100);
