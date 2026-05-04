#!/usr/bin/env node
'use strict';

/**
 * phantom-bail-telemetry.js
 *
 * Daily telemetry for the phantom_bail signal documented in
 *   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md
 *
 * The pattern's verification SQL block declares the threshold:
 *
 *   "If `fallback / (fallback + real_report)` > 30% over a 7-day window,
 *    the doctrine bug is upstream: forks are systematically running out of
 *    budget before emitting the tag. Investigate spawn-prompt instructions,
 *    token budgets, and tool-call ceilings rather than blaming individual forks."
 *
 * This script materialises that verification SQL as a recurring measurement.
 *
 * Substrate: `os_forks.result` carries the FALLBACK_MARKER prefix
 *   `(no [FORK_REPORT] emitted` when forkService.js fell back to the
 *   transcript-tail path because the closing tag was absent. (Constant defined
 *   in src/services/forkService.js as FALLBACK_MARKER, exported.)
 *
 * Writes (in --write mode):
 *   - kv_store key `ceo.phantom_bail_telemetry.last_run`
 *       latest snapshot (window stats, rate, per-day breakdown)
 *   - kv_store key `ceo.phantom_bail_telemetry.daily_history`
 *       rolling array of the last <historyDays> daily snapshots, newest first.
 *       Each snapshot: { day, done, phantom_bail, rate }.
 *   - status_board P3 row "phantom-bail rate above 30% threshold (7d)"
 *       upserted when rate >= 0.30 AND decided >= 10 (sample-size guard).
 *       Archived when rate falls back under threshold for 2 consecutive runs.
 *   - Neo4j Decision when threshold first crossed in a run (one per crossing).
 *
 * Modes:
 *   --report         JSON snapshot to stdout (default)
 *   --write          report + persist to kv_store + status_board (+ Neo4j)
 *   --window-days N  7d window for the headline rate (default 7)
 *   --history-days N per-day breakdown depth (default 14)
 *   --threshold X    rate at which the status_board row trips (default 0.30)
 *   --min-sample N   minimum decided sample to trip threshold (default 10)
 *   --verbose        full report instead of slim
 *
 * Exit code: 0 always (advisory, never blocks). All errors to stderr.
 *
 * Cross-refs:
 *   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md (canonical doctrine)
 *   ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md
 *   ~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md
 *
 * Author: fork_moqhxg1z_68ea5d self-evolution rotation D session 4 May 2026
 */

require('dotenv').config({ path: '/home/tate/ecodiaos/.env' });

const { createClient } = require('@supabase/supabase-js');
const neo4j = require('neo4j-driver');

const FORK_ID = 'fork_moqhxg1z_68ea5d';
const FALLBACK_MARKER = '(no [FORK_REPORT] emitted';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const STATUS_BOARD_ROW_NAME = 'phantom-bail rate above 30% threshold (7d)';
const KV_LAST_RUN = 'ceo.phantom_bail_telemetry.last_run';
const KV_HISTORY = 'ceo.phantom_bail_telemetry.daily_history';

// --------------- arg parsing ---------------
function parseArgs(argv) {
  const out = {
    mode: 'report',
    windowDays: 7,
    historyDays: 14,
    threshold: 0.3,
    minSample: 10,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--write') out.mode = 'write';
    else if (a === '--report') out.mode = 'report';
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--window-days') out.windowDays = parseInt(argv[++i], 10);
    else if (a === '--history-days') out.historyDays = parseInt(argv[++i], 10);
    else if (a === '--threshold') out.threshold = parseFloat(argv[++i]);
    else if (a === '--min-sample') out.minSample = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        'phantom-bail-telemetry.js [--report|--write] [--window-days N] [--history-days N] [--threshold X] [--min-sample N] [--verbose]\n'
      );
      process.exit(0);
    }
  }
  return out;
}

// --------------- supabase / neo4j init ---------------
function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing in env');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function initNeo4j() {
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) return null;
  try {
    return neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      connectionTimeout: 5000,
    });
  } catch (err) {
    process.stderr.write(`neo4j driver init failed: ${err.message}\n`);
    return null;
  }
}

// --------------- probes ---------------
// Aggregate counts over a window. Uses COALESCE(ended_at, started_at) so
// running forks (no ended_at) are included via started_at without distorting
// completed forks (which have both).
async function aggregateWindow(supabase, fromIso, toIso) {
  // Page through results — Supabase JS client default cap is 1000.
  const PAGE = 1000;
  let from = 0;
  let done = 0;
  let phantomBail = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('os_forks')
      .select('status, result, started_at, ended_at')
      .or(`ended_at.gte.${fromIso},and(ended_at.is.null,started_at.gte.${fromIso})`)
      .lte('started_at', toIso)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`os_forks page query: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.status !== 'done') continue;
      done += 1;
      if (typeof row.result === 'string' && row.result.startsWith(FALLBACK_MARKER)) {
        phantomBail += 1;
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { done, phantomBail };
}

// Per-day breakdown for the last historyDays days. UTC day boundaries.
async function dailyBreakdown(supabase, historyDays) {
  const out = [];
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < historyDays; i += 1) {
    const dayStart = new Date(todayUtc.getTime() - i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const { done, phantomBail } = await aggregateWindow(
      supabase,
      dayStart.toISOString(),
      dayEnd.toISOString()
    );
    const rate = done > 0 ? phantomBail / done : null;
    out.push({
      day: dayStart.toISOString().slice(0, 10),
      done,
      phantom_bail: phantomBail,
      rate: rate === null ? null : Number(rate.toFixed(3)),
    });
  }
  return out;
}

// --------------- kv_store helpers ---------------
async function kvUpsert(supabase, key, valueObj) {
  const value = JSON.stringify(valueObj);
  const { error } = await supabase
    .from('kv_store')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`kv_store upsert ${key}: ${error.message}`);
}

async function kvGet(supabase, key) {
  const { data, error } = await supabase
    .from('kv_store')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`kv_store read ${key}: ${error.message}`);
  if (!data) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return data.value;
  }
}

// --------------- status_board upsert ---------------
async function upsertStatusBoardRow(supabase, snapshot) {
  const { window, daily } = snapshot;
  const tripped = window.tripped;

  // Look up existing row (active or archived) by name.
  const { data: existing, error: lookupErr } = await supabase
    .from('status_board')
    .select('id, archived_at, context')
    .eq('name', STATUS_BOARD_ROW_NAME)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lookupErr) {
    process.stderr.write(`status_board lookup failed: ${lookupErr.message}\n`);
    return { action: 'lookup_failed' };
  }

  const nowIso = new Date().toISOString();
  const topDays = daily
    .filter((d) => d.rate !== null)
    .slice(0, 3)
    .map((d) => `${d.day}=${d.rate !== null ? (d.rate * 100).toFixed(0) + '%' : 'n/a'}(${d.phantom_bail}/${d.done})`)
    .join(', ');

  const context = JSON.stringify({
    fork_id: FORK_ID,
    last_check: snapshot.generated_at,
    window_days: window.window_days,
    decided: window.done,
    phantom_bail: window.phantom_bail,
    rate: Number(window.rate.toFixed(3)),
    threshold: snapshot.threshold,
    min_sample: snapshot.min_sample,
    last3_days: topDays,
    pattern_ref: '~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md',
  });

  const row = existing && existing.length > 0 ? existing[0] : null;

  if (tripped) {
    // Active P3 row needed.
    const status = `phantom_bail_${(window.rate * 100).toFixed(0)}pct_${window.window_days}d`;
    const nextAction =
      'investigate spawn-prompt / token-budget / tool-call ceiling per pattern doctrine; cross-ref ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md verification block';
    if (row) {
      const { error: updErr } = await supabase
        .from('status_board')
        .update({
          status,
          next_action: nextAction,
          next_action_by: 'ecodiaos',
          last_touched: nowIso,
          context,
          priority: 3,
          archived_at: null, // un-archive if previously cleared
        })
        .eq('id', row.id);
      if (updErr) {
        process.stderr.write(`status_board update failed: ${updErr.message}\n`);
        return { action: 'update_failed' };
      }
      return { action: row.archived_at ? 'unarchived_and_updated' : 'updated', id: row.id };
    } else {
      const { error: insErr } = await supabase.from('status_board').insert({
        entity_type: 'infrastructure',
        entity_ref: 'phantom_bail_telemetry',
        name: STATUS_BOARD_ROW_NAME,
        status,
        next_action: nextAction,
        next_action_by: 'ecodiaos',
        last_touched: nowIso,
        context,
        priority: 3,
        source: FORK_ID,
      });
      if (insErr) {
        process.stderr.write(`status_board insert failed: ${insErr.message}\n`);
        return { action: 'insert_failed' };
      }
      return { action: 'inserted' };
    }
  }

  // Not tripped this run. Archive an active row only after 2 consecutive
  // under-threshold runs (anti-flap). Track the "consecutive_under" counter
  // inside context so it survives across runs.
  if (!row || row.archived_at) {
    return { action: 'no_action' };
  }
  let prevUnder = 0;
  try {
    const ctx = JSON.parse(row.context || '{}');
    prevUnder = parseInt(ctx.consecutive_under || 0, 10) || 0;
  } catch {
    /* ignore */
  }
  const consecutive = prevUnder + 1;
  if (consecutive >= 2) {
    const { error: archErr } = await supabase
      .from('status_board')
      .update({
        status: 'cleared_under_threshold',
        next_action: 'no action - rate fell back under threshold',
        last_touched: nowIso,
        archived_at: nowIso,
        context: JSON.stringify({
          ...JSON.parse(context),
          consecutive_under: consecutive,
          archived_reason: 'rate_under_threshold_for_2_consecutive_runs',
        }),
      })
      .eq('id', row.id);
    if (archErr) {
      process.stderr.write(`status_board archive failed: ${archErr.message}\n`);
      return { action: 'archive_failed' };
    }
    return { action: 'archived', id: row.id };
  } else {
    const { error: bumpErr } = await supabase
      .from('status_board')
      .update({
        last_touched: nowIso,
        context: JSON.stringify({
          ...JSON.parse(context),
          consecutive_under: consecutive,
        }),
      })
      .eq('id', row.id);
    if (bumpErr) process.stderr.write(`status_board bump failed: ${bumpErr.message}\n`);
    return { action: 'bumped_consecutive_under', id: row.id, consecutive };
  }
}

// --------------- neo4j Decision (one per fresh crossing) ---------------
async function maybeWriteNeo4jDecision(driver, snapshot, statusBoardOutcome) {
  if (!driver) return;
  // Only write a Decision when this run was the one that moved the row from
  // "not tripped" to "tripped" (action === 'inserted' OR 'unarchived_and_updated').
  if (
    statusBoardOutcome.action !== 'inserted' &&
    statusBoardOutcome.action !== 'unarchived_and_updated'
  ) {
    return;
  }
  const { window } = snapshot;
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    const name = `phantom-bail threshold crossed ${snapshot.generated_at.slice(0, 16)}Z rate=${(window.rate * 100).toFixed(0)}%`;
    const description = [
      `phantom-bail-telemetry run by ${FORK_ID} at ${snapshot.generated_at}.`,
      `Window=${window.window_days}d, threshold=${(snapshot.threshold * 100).toFixed(0)}%, min_sample=${snapshot.min_sample}.`,
      `Decided=${window.done}, phantom_bail=${window.phantom_bail}, rate=${(window.rate * 100).toFixed(1)}%.`,
      `Doctrine (fork-result-fallback-must-be-marked.md verification block): >30% over 7d means the bug is upstream — investigate spawn-prompt instructions, token budgets, and tool-call ceilings rather than blaming individual forks.`,
      `status_board action=${statusBoardOutcome.action}.`,
      `Cross-ref: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md`,
    ].join(' ');
    await session.run(
      `
      MERGE (d:Decision {name: $name})
      ON CREATE SET d.created_at = datetime(), d.date = datetime()
      SET d.description = $description,
          d.updated_at = datetime(),
          d.fork_id = $fork_id,
          d.phantom_bail_rate = $rate,
          d.decided_count = $decided,
          d.window_days = $window_days
      `,
      {
        name,
        description,
        fork_id: FORK_ID,
        rate: window.rate,
        decided: window.done,
        window_days: window.window_days,
      }
    );
  } catch (err) {
    process.stderr.write(`neo4j Decision write failed: ${err.message}\n`);
  } finally {
    await session.close();
  }
}

// --------------- main ---------------
async function main() {
  const args = parseArgs(process.argv);
  const supabase = initSupabase();
  const driver = args.mode === 'write' ? initNeo4j() : null;

  const now = new Date();
  const windowStart = new Date(now.getTime() - args.windowDays * 86400000);

  const { done, phantomBail } = await aggregateWindow(
    supabase,
    windowStart.toISOString(),
    now.toISOString()
  );
  const rate = done > 0 ? phantomBail / done : 0;

  const daily = await dailyBreakdown(supabase, args.historyDays);

  const tripped = rate >= args.threshold && done >= args.minSample;

  const snapshot = {
    generated_at: now.toISOString(),
    fork_id: FORK_ID,
    threshold: args.threshold,
    min_sample: args.minSample,
    window: {
      window_days: args.windowDays,
      from: windowStart.toISOString(),
      to: now.toISOString(),
      done,
      phantom_bail: phantomBail,
      rate,
      tripped,
    },
    daily,
  };

  // Output
  if (args.verbose) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  } else {
    process.stdout.write(
      JSON.stringify(
        {
          generated_at: snapshot.generated_at,
          rate: Number(rate.toFixed(3)),
          phantom_bail: phantomBail,
          done,
          tripped,
          last3_days: daily.slice(0, 3),
        },
        null,
        2
      ) + '\n'
    );
  }

  if (args.mode !== 'write') {
    if (driver) await driver.close();
    process.exit(0);
  }

  // Persist to kv_store
  try {
    await kvUpsert(supabase, KV_LAST_RUN, snapshot);
  } catch (err) {
    process.stderr.write(`kv_store last_run upsert failed: ${err.message}\n`);
  }

  try {
    const prevHistory = (await kvGet(supabase, KV_HISTORY)) || [];
    const todayKey = snapshot.generated_at.slice(0, 10);
    const headlineToday = daily.find((d) => d.day === todayKey) || {
      day: todayKey,
      done: 0,
      phantom_bail: 0,
      rate: null,
    };
    const prevArr = Array.isArray(prevHistory) ? prevHistory : [];
    // Replace today's entry if already present, else prepend.
    const filtered = prevArr.filter((e) => e && e.day !== todayKey);
    const newHistory = [headlineToday, ...filtered].slice(0, args.historyDays);
    await kvUpsert(supabase, KV_HISTORY, newHistory);
  } catch (err) {
    process.stderr.write(`kv_store history upsert failed: ${err.message}\n`);
  }

  // status_board
  let sbOutcome = { action: 'skipped' };
  try {
    sbOutcome = await upsertStatusBoardRow(supabase, snapshot);
  } catch (err) {
    process.stderr.write(`status_board upsert failed: ${err.message}\n`);
  }

  // Neo4j Decision (only on threshold crossing transition)
  try {
    await maybeWriteNeo4jDecision(driver, snapshot, sbOutcome);
  } catch (err) {
    process.stderr.write(`neo4j Decision write outer failed: ${err.message}\n`);
  }

  if (args.verbose) {
    process.stderr.write(`status_board outcome: ${JSON.stringify(sbOutcome)}\n`);
  }

  if (driver) await driver.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`phantom-bail-telemetry fatal: ${err.message}\n${err.stack}\n`);
  process.exit(0);
});
