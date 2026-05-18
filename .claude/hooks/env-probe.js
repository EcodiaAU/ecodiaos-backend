const fs = require('fs');
try {
  const dump = Object.entries(process.env)
    .filter(([k]) => k.startsWith('CLAUDE_') || k === 'TOOL_USE_INPUT')
    .map(([k, v]) => `${k}=${String(v).slice(0, 500)}`)
    .join('\n');
  const ts = new Date().toISOString();
  fs.appendFileSync('d:/tmp/claude-hook-probe.log', `\n=== ${ts} ===\n${dump || '(no CLAUDE_* vars)'}\n`);
} catch (e) {
  fs.appendFileSync('d:/tmp/claude-hook-probe.log', `ERR: ${e.message}\n`);
}
