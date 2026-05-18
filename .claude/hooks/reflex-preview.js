#!/usr/bin/env node
// reflex-preview.js - explicit "open a preview NOW" reflex.
//
// Replaces the deprecated PostToolUse Write|Edit|MultiEdit auto-fire on
// open-preview.js. Auto-firing on every write opened a preview tab for every
// .md/.html the agent touched, even when those files were never meant for
// Tate. Tate verbatim 2026-05-17 Telegram 05:32Z: "it should be more of a
// reflex that you can do at will + it should open in a new tab but within
// any currently open."
//
// Usage:
//   node d:/.code/EcodiaOS/backend/.claude/hooks/reflex-preview.js <abs-path>
//
// Reads the IDE registry at %USERPROFILE%/.ecodia-preview/instances.json and
// POSTs /open-preview to every IDE whose workspace covers the file. Falls
// back to all registered IDEs if none cover it. Exits 0 on dispatch, 1 on no
// targets.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const filePath = process.argv[2];
if (!filePath) {
  console.error('reflex-preview: missing <path> arg');
  process.exit(2);
}

const ext = path.extname(filePath).toLowerCase();
const PREVIEWABLE = ['.md', '.markdown', '.html', '.htm', '.pdf', '.svg', '.ipynb'];
if (!PREVIEWABLE.includes(ext)) {
  console.error(`reflex-preview: ${ext} not previewable (allowed: ${PREVIEWABLE.join(',')})`);
  process.exit(2);
}

if (!fs.existsSync(filePath)) {
  console.error(`reflex-preview: file does not exist: ${filePath}`);
  process.exit(2);
}

const REGISTRY_FILE = path.join(os.homedir(), '.ecodia-preview', 'instances.json');
let reg;
try { reg = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
catch (e) {
  console.error(`reflex-preview: no IDE registry at ${REGISTRY_FILE}`);
  process.exit(1);
}

const instances = Object.values(reg);
if (instances.length === 0) {
  console.error('reflex-preview: no IDEs registered');
  process.exit(1);
}

const norm = filePath.replace(/\\/g, '/').toLowerCase();
const matches = instances.filter(inst =>
  (inst.workspaceRoots || []).some(root =>
    norm.startsWith(root.replace(/\\/g, '/').toLowerCase())
  )
);
const targets = matches.length ? matches : instances;

const post = JSON.stringify({ path: filePath });
let pending = targets.length;
let errors = 0;

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
  }, (res) => {
    if (res.statusCode >= 400) errors += 1;
    res.resume();
    res.on('end', () => { if (--pending === 0) finish(); });
  });
  req.on('error', () => { errors += 1; if (--pending === 0) finish(); });
  req.on('timeout', () => { req.destroy(); errors += 1; if (--pending === 0) finish(); });
  req.write(post);
  req.end();
}

function finish() {
  const ok = targets.length - errors;
  console.log(`reflex-preview: dispatched to ${ok}/${targets.length} IDE(s) - ${path.basename(filePath)}`);
  process.exit(errors === targets.length ? 1 : 0);
}
