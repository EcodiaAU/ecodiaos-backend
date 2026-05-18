// clipboard.js - read + write the Windows clipboard.
//
// The bridge for moving data between Chrome / IDE / filesystem / network.
// Used by vscode.read_active_editor (Ctrl+A + Ctrl+C + clipboard.read)
// and by any flow that needs to grab text content from any UI.

const { spawnSync } = require('child_process')

function runPs(script, timeoutMs) {
  timeoutMs = timeoutMs || 4000
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
  })
  return { exitCode: r.status, stdout: (r.stdout || ''), stderr: (r.stderr || '') }
}

// clipboard.read - return current clipboard text (preserves trailing newlines)
async function read() {
  // Get-Clipboard -Raw returns the unmodified content; if not text, returns empty.
  const r = runPs('Get-Clipboard -Raw')
  if (r.exitCode !== 0) throw new Error('clipboard read failed: ' + r.stderr)
  return { ok: true, text: r.stdout, length: r.stdout.length }
}

// clipboard.write - set clipboard to given text.
async function write(params) {
  params = params || {}
  const text = params.text
  if (typeof text !== 'string') throw new Error('text (string) required')
  // Use Set-Clipboard via a literal-string heredoc-style approach to avoid escaping.
  // PowerShell here-strings @' ... '@ preserve content literally.
  // Pipe via base64 to fully sidestep any quoting concerns.
  const b64 = Buffer.from(text, 'utf8').toString('base64')
  const script = '$bytes = [Convert]::FromBase64String("' + b64 + '")\n' +
    '$txt = [System.Text.Encoding]::UTF8.GetString($bytes)\n' +
    'Set-Clipboard -Value $txt'
  const r = runPs(script)
  if (r.exitCode !== 0) throw new Error('clipboard write failed: ' + r.stderr)
  return { ok: true, written: text.length }
}

// clipboard.clear
async function clear() {
  const r = runPs('Set-Clipboard -Value $null')
  if (r.exitCode !== 0) throw new Error('clipboard clear failed: ' + r.stderr)
  return { ok: true }
}

module.exports = {
  read: read,
  write: write,
  clear: clear,
}
