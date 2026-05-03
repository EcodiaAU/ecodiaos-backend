#!/usr/bin/env node
// Regenerate ~/ecodiaos/patterns/INDEX.md from frontmatter triggers.
//
// Idempotent: walks patterns/*.md, reads first `triggers:` line per frontmatter,
// rewrites the `| File | Triggers |` table, preserves narrative header/footer.
// Running twice in a row produces no diff.
//
// Exit codes:
//   0  success (table written, even if some patterns lack frontmatter — those get
//      a placeholder row AND a stderr warning naming the file)
//   1  structural error (cannot find table boundaries in INDEX.md)
//
// Wired as the directly-executed cron deliverable for `daily-index-regen`
// (os_scheduled_tasks.id = c2606d3b-f115-4387-b41e-9b16c8c552ca, 22:00 AEST daily).
// Moved off cowork-fork dispatch on 4 May 2026 to bypass the daily-fork-budget
// exhaustion that was deferring regen since 30 Apr 2026 (status_board e86b6437).
// Stamp: fork_moq0zdpm_98ef83.

const fs = require('fs');
const path = require('path');

const PATTERNS_DIR = path.resolve(__dirname, '..', 'patterns');
const INDEX_PATH = path.join(PATTERNS_DIR, 'INDEX.md');

// Read existing INDEX to preserve header (above table) and footer (below table)
const current = fs.readFileSync(INDEX_PATH, 'utf-8');
const lines = current.split('\n');

// Find table boundaries: header is line "| File | Triggers |" then "|---|---|"
let tableStart = -1;
let tableEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '| File | Triggers |' && lines[i + 1] && lines[i + 1].trim() === '|---|---|') {
    tableStart = i;
  } else if (tableStart >= 0 && tableEnd < 0 && lines[i].trim() === '' && i > tableStart + 2) {
    tableEnd = i;
    break;
  }
}
if (tableStart < 0 || tableEnd < 0) {
  console.error('ERROR: could not find table boundaries in INDEX.md (expected `| File | Triggers |` followed by `|---|---|` then table rows then a blank line)');
  process.exit(1);
}

const header = lines.slice(0, tableStart + 2).join('\n');
const footer = lines.slice(tableEnd).join('\n');

// Walk patterns directory (sorted alphabetically for stable output)
const files = fs.readdirSync(PATTERNS_DIR)
  .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
  .sort();

const rows = [];
let missingTriggers = 0;
const missingFiles = [];
for (const file of files) {
  const filePath = path.join(PATTERNS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Find first triggers: line in YAML frontmatter
  const triggerMatch = content.match(/^triggers:\s*(.+?)(?:\r?\n|$)/m);
  let triggers = '';
  if (triggerMatch) {
    triggers = triggerMatch[1].trim();
  } else {
    triggers = '(no triggers frontmatter - surfaces via semantic match on title)';
    missingTriggers++;
    missingFiles.push(file);
    // Per brief spec: stderr line indicating which pattern file lacked frontmatter
    console.error(`WARN: ${file} has no triggers: frontmatter`);
  }

  // Strip any em-dashes (defensive; should already be clean per voice doctrine)
  triggers = triggers.replace(/—/g, ' - ');

  rows.push(`| [${file}](${file}) | ${triggers} |`);
}

const newTable = rows.join('\n');
const out = header + '\n' + newTable + '\n' + footer;

// Idempotency: only write if content changed (avoid touching mtime when no diff)
if (out !== current) {
  fs.writeFileSync(INDEX_PATH, out);
  console.log(`Wrote INDEX.md (changed)`);
} else {
  console.log(`INDEX.md unchanged`);
}
console.log(`Files listed: ${files.length}`);
console.log(`Files missing triggers: ${missingTriggers}`);
console.log(`Rows written: ${rows.length}`);
