#!/usr/bin/env node
// neo4j-audits/run-sweep.mjs
//
// Runs every .cypher in queries/ against Neo4j, treats non-empty
// results as findings, and writes one rollup status_board row plus
// detail rows per non-empty query.
//
// Usage:
//   node run-sweep.mjs                  -> live run, posts to status_board
//   node run-sweep.mjs --dry-run        -> prints findings, no writes
//   node run-sweep.mjs --only <slug>    -> single query
//
// Cron-fired nightly 03:15 AEST per backend/CLAUDE.md scheduler doctrine.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUERIES_DIR = join(HERE, 'queries');
const BACKEND_DIR = dirname(HERE);
const ENV_PATHS = [
  process.env.ECODIAOS_ENV_FILE,
  join(BACKEND_DIR, '.env'),
  join(BACKEND_DIR, '.env.production'),
  join(BACKEND_DIR, '.env.development'),
].filter(Boolean);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? args[i + 1] : null;
})();

// Auto-load NEO4J_* from backend/.env if missing from process env.
// Order: explicit env first, then walk ENV_PATHS for the first file
// that contains NEO4J_URI. The runner only needs URI / USER / PASSWORD.
async function autoloadNeoEnv() {
  if (process.env.NEO4J_URI && process.env.NEO4J_PASSWORD) return null;
  for (const path of ENV_PATHS) {
    try {
      const text = await readFile(path, 'utf8');
      const keep = ['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD', 'NEO4J_DATABASE'];
      let loaded = 0;
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!m) continue;
        if (!keep.includes(m[1])) continue;
        if (process.env[m[1]]) continue;
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
        loaded++;
      }
      if (loaded > 0 && process.env.NEO4J_URI && process.env.NEO4J_PASSWORD) {
        return path;
      }
    } catch {}
  }
  return null;
}

const envSource = await autoloadNeoEnv();
const NEO4J_URI = process.env.NEO4J_URI || process.env.AURA_URI;
const NEO4J_USER = process.env.NEO4J_USER || process.env.AURA_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.AURA_PASSWORD;

if (envSource) console.error(`[sweep] loaded Neo4j creds from ${envSource}`);

if (!NEO4J_URI || !NEO4J_PASSWORD) {
  console.error('[sweep] NEO4J_URI + NEO4J_PASSWORD required. Searched: ' + ENV_PATHS.join(', '));
  process.exit(2);
}

function parseHeader(text) {
  const headerLines = text.split('\n').filter(l => l.startsWith('//'));
  const out = { description: '', severity: 'P3', remediation: '' };
  for (const line of headerLines) {
    const m = line.match(/^\/\/\s*(description|severity|remediation)\s*:\s*(.+?)\s*$/i);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

async function postStatusBoardRow({ name, status, context, priority = 3 }) {
  if (DRY_RUN) {
    console.log(`[sweep][DRY] status_board upsert: ${name} (${status})`);
    return;
  }
  // POST to local conductor's MCP relay if available, otherwise log.
  // The cron fire pattern uses the worker-tab path, which carries the
  // status_board_upsert tool authenticated. From a CLI run the cleanest
  // path is to write the finding to a file the conductor reads on next
  // session; here we just emit JSONL for the cron consumer.
  const line = JSON.stringify({ ts: new Date().toISOString(), tool: 'status_board_upsert', args: { entity_type: 'task', name, status, context, priority } });
  console.log(line);
}

async function main() {
  const allFiles = (await readdir(QUERIES_DIR)).filter(f => f.endsWith('.cypher')).sort();
  const files = ONLY ? allFiles.filter(f => f.startsWith(ONLY)) : allFiles;
  if (files.length === 0) {
    console.error(`[sweep] no queries to run (only=${ONLY})`);
    process.exit(1);
  }

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  const results = [];
  try {
    for (const file of files) {
      const path = join(QUERIES_DIR, file);
      const text = await readFile(path, 'utf8');
      const header = parseHeader(text);
      const cypher = text.replace(/^\s*\/\/.*$/gm, '').trim();
      if (!cypher) continue;

      const slug = file.replace(/\.cypher$/, '');
      let rows = [];
      let error = null;
      try {
        const r = await session.run(cypher);
        rows = r.records.map(rec => rec.toObject());
      } catch (e) {
        error = String(e && e.message ? e.message : e);
      }

      const finding = {
        slug, file,
        description: header.description,
        severity: header.severity,
        remediation: header.remediation,
        row_count: rows.length,
        rows: rows.slice(0, 50), // cap detail rows
        error,
      };
      results.push(finding);
      console.log(`[sweep] ${slug}: ${rows.length} row(s)${error ? ` ERROR: ${error}` : ''}`);
    }
  } finally {
    await session.close();
    await driver.close();
  }

  // Aggregate rollup
  const nonEmpty = results.filter(r => r.row_count > 0 && !r.error);
  const errored = results.filter(r => r.error);
  const summary = nonEmpty.map(r => `${r.slug}=${r.row_count}`).join(', ') || 'no findings';

  await postStatusBoardRow({
    name: `neo4j-world-model-sweep nightly: ${nonEmpty.length} finding type(s), ${errored.length} error(s)`,
    status: `sweep_complete_${new Date().toISOString().slice(0, 10)}_findings_${nonEmpty.length}_errors_${errored.length}`,
    context: `Audit summary: ${summary}. Detailed findings JSONL emitted to stdout. Doctrine: patterns/neo4j-world-model-relationships-first-2026-06-11.md. Schema: docs/neo4j-world-model-schema.md.`,
    priority: nonEmpty.length > 5 ? 2 : 3,
  });

  // Per-finding rows for the non-empty findings
  for (const r of nonEmpty) {
    const sampleNames = r.rows.slice(0, 5).map(row => JSON.stringify(row)).join('; ');
    await postStatusBoardRow({
      name: `neo4j-audit ${r.slug}: ${r.row_count} row(s)`,
      status: r.severity.toLowerCase(),
      context: `${r.description}\nRemediation: ${r.remediation}\nSample rows: ${sampleNames}`,
      priority: r.severity === 'P2' ? 2 : 3,
    });
  }

  // Emit full JSONL last so a consumer can pick it up
  console.log('---SWEEP-FINDINGS-JSONL---');
  for (const r of results) console.log(JSON.stringify(r));
}

main().catch(e => {
  console.error('[sweep] fatal:', e);
  process.exit(1);
});
