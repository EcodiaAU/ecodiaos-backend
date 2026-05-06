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
 * --- Slicing (added 2026-05-04 by fork_moqqickb_dee99b, rotation C) ---
 *
 * The headline rate (all phantom_bail / all done) is dominated by cron-fired
 * forks whose deliverables are explicitly conditional ("exit silent on health
 * window", "no unread email", etc - see
 * ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md).
 * On 4 May 2026 those forks make up >70% of phantom_bail volume but represent
 * 0% of the upstream-bug signal the doctrine threshold was designed to catch.
 *
 * To deflate the headline noise, every fork is classified by brief prefix:
 * - cron_intent       : brief contains '[ORIGINAL CRON INTENT BELOW'
 *                          → expected_silent (conditional deliverable)
 * - self_evolution    : brief starts with 'SELF-EVOLUTION SESSION'
 *                          → expected_silent (long-transcript build sessions)
 * - fork_recon_no_cron: brief starts with the cron wrapper preamble but
 *                          lacks the CRON INTENT header
 *                          → expected_silent (brief-template variant)
 * - interactive       : everything else (Tate-typed dispatches, factory work,
 *                          audit findings, demand-driven dispatches)
 *                          → INVESTIGATE - true upstream-bug signal
 *
 * The trip threshold is now applied to the `investigate_rate`
 * (interactive-class phantom_bail / interactive-class done) with `min_sample`
 * applied to interactive class only. Headline rate is preserved for
 * back-compat in the snapshot shape but no longer drives the alert.
 *
 * Writes (in --write mode):
 * - kv_store key `ceo.phantom_bail_telemetry.last_run`
 *       latest snapshot (window stats, headline rate, investigate rate,
 *       per-class breakdown, per-day breakdown)
 * - kv_store key `ceo.phantom_bail_telemetry.daily_history`
 *       rolling array of the last <historyDays> daily snapshots, newest first.
 *       Each snapshot: { day, done, phantom_bail, rate, investigate, by_class }.
 * - status_board P3 row "phantom-bail rate above 30% threshold (7d)"
 *       upserted when investigate.rate >= 0.30 AND investigate.done >= 10
 *       (sample-size guard). Archived when investigate rate falls back under
 *       threshold for 2 consecutive runs.
 * - Neo4j Decision when threshold first crossed in a run (one per crossing).
 *
 * Modes:
 *   --report         JSON snapshot to stdout (default)
 *   --write          report + persist to kv_store + status_board (+ Neo4j)
 *   --window-days N  7d window for the headline rate (default 7)
 *   --history-days N per-day breakdown depth (default 14)
 *   --threshold X    rate at which the status_board row trips (default 0.30)
 *   --min-sample N   minimum decided sample to trip threshold (default 10)
 *   --legacy-trip    fall back to headline_rate for tripping (debug only)
 *   --verbose        full report instead of slim
 *
 * Exit code: 0 always (advisory, never blocks). All errors to stderr.
 *
 * Cross-refs:
 *   ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md (canonical doctrine)
 *   ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md (sibling rule)
 *   ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md
 *   ~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md
 *
 * Authors:
 * - fork_moqhxg1z_68ea5d  self-evolution rotation D 4 May 2026 (initial)
 * - fork_moqqickb_dee99b  self-evolution rotation C 4 May 2026 (slicing)
 */

require('dotenv').config({ path: '/home/tate/ecodiaos/.env' });

const { createClient } = require('@supabase/supabase-js');
const neo4j = require('neo4j-driver');

const FORK_ID = 'fork_moqqickb_dee99b';
const FALLBACK_MARKER = '(no [FORK_REPORT] emitted';

// Fork classification by brief prefix.
// `interactive` is the only class that contributes to investigate_rate (the
// authoritative trip metric). Other classes are expected-silent because their
// deliverables are conditional or their transcripts run long enough that the
// terminal [FORK_REPORT] line falls outside the tail-grab window.
const CLASS_INTERACTIVE = 'interactive';
const CLASS_CRON_INTENT = 'cron_intent';
const CLASS_SELF_EVOLUTION = 'self_evolution';
const CLASS_FORK_RECON_NO_CRON = 'fork_recon_no_cron';
const ALL_CLASSES = [
  CLASS_INTERACTIVE,
  CLASS_CRON_INTENT,
  CLASS_SELF_EVOLUTION,
  CLASS_FORK_RECON_NO_CRON,
];

function classifyFork(brief) {
  if (typeof brief !== 'string' || brief.length === 0) return CLASS_INTERACTIVE;
  // Order matters: SELF-EVOLUTION header is checked before the cron-wrapper
  // prefix because a self-evolution brief never carries the cron preamble,
  // and cron_intent is checked before fork_recon_no_cron because a fork can
  // carry both the wrapper and the CRON INTENT header.
  if (brief.startsWith('SELF-EVOLUTION SESSION')) return CLASS_SELF_EVOLUTION;
  if (brief.includes('[ORIGINAL CRON INTENT BELOW')) return CLASS_CRON_INTENT;
  if (brief.startsWith('You are EcodiaOS in fork form, no prior context')) {
    return CLASS_FORK_RECON_NO_CRON;
  }
  return CLASS_INTERACTIVE;
}

function emptyClassMap() {
  const m = {};
  for (const c of ALL_CLASSES) m[c] = { done: 0, phantom_bail: 0 };
  return m;
}

function rateOf(slice) {
  return slice.done > 0 ? slice.phantom_bail / slice.done : null;
}

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
    else if (a === '--legacy-trip') out.legacyTrip = true;
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        'phantom-bail-telemetry.js [--report|--write] [--window-days N] [--history-days N] [--threshold X] [--min-sample N] [--legacy-trip] [--verbose]\n'
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
// Aggregate counts over a window, sliced by classifyFork(brief).
//
// Returns:
//   {
//     done, phantomBail,                     // headline totals
//     byClass: { interactive: {done, phantom_bail}, cron_intent: {...}, ... }
//   }
//
// Uses ended_at as the window boundary for completed forks; running forks
// (no ended_at) are included via started_at >= fromIso so a long-running
// interactive fork is visible immediately.
async function aggregateWindow(supabase, fromIso, toIso) {
  // Page through results - Supabase JS client default cap is 1000.
  const PAGE = 1000;
  let from = 0;
  let done = 0;
  let phantomBail = 0;
  const byClass = emptyClassMap();
  for (;;) {
    const { data, error } = await supabase
      .from('os_forks')
      .select('status, result, brief, started_at, ended_at')
      .or(`ended_at.gte.${fromIso},and(ended_at.is.null,started_at.gte.${fromIso})`)
      .lte('started_at', toIso)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`os_forks page query: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.status !== 'done') continue;
      done += 1;
      const cls = classifyFork(row.brief);
      byClass[cls].done += 1;
      if (typeof row.result === 'string' && row.result.startsWith(FALLBACK_MARKER)) {
        phantomBail += 1;
        byClass[cls].phantom_bail += 1;
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { done, phantomBail, byClass };
}

// Per-day breakdown for the last historyDays days. UTC day boundaries.
// Each entry includes headline rate, sliced by_class breakdown, and the
// derived `investigate` slice (interactive class only).
async function dailyBreakdown(supabase, historyDays) {
  const out = [];
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < historyDays; i += 1) {
    const dayStart = new Date(todayUtc.getTime() - i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const { done, phantomBail, byClass } = await aggregateWindow(
      supabase,
      dayStart.toISOString(),
      dayEnd.toISOString()
    );
    const rate = done > 0 ? phantomBail / done : null;
    const interactive = byClass[CLASS_INTERACTIVE];
    const investigateRate = rateOf(interactive);
    out.push({
      day: dayStart.toISOString().slice(0, 10),
      done,
      phantom_bail: phantomBail,
      rate: rate === null ? null : Number(rate.toFixed(3)),
      investigate: {
        done: interactive.done,
        phantom_bail: interactive.phantom_bail,
        rate: investigateRate === null ? null : Number(investigateRate.toFixed(3)),
      },
      by_class: Object.fromEntries(
        ALL_CLASSES.map((c) => {
          const r = rateOf(byClass[c]);
          return [
            c,
            {
              done: byClass[c].done,
              phantom_bail: byClass[c].phantom_bail,
              rate: r === null ? null : Number(r.toFixed(3)),
            },
          ];
        })
      ),
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
  // Authoritative trip metric: investigate_rate (interactive class only).
  // Fall back to headline rate only when --legacy-trip was set (debug path).
  const tripMetric = snapshot.trip_metric === 'legacy_headline'
    ? { rate: window.rate, decided: window.done, phantom_bail: window.phantom_bail }
    : { rate: window.investigate.rate, decided: window.investigate.done, phantom_bail: window.investigate.phantom_bail };

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
    .filter((d) => d.investigate && d.investigate.rate !== null)
    .slice(0, 3)
    .map((d) => {
      const inv = d.investigate;
      const headline = d.rate !== null ? (d.rate * 100).toFixed(0) + '%' : 'n/a';
      const investigate = inv.rate !== null ? (inv.rate * 100).toFixed(0) + '%' : 'n/a';
      return `${d.day}=inv:${investigate}(${inv.phantom_bail}/${inv.done})/hl:${headline}(${d.phantom_bail}/${d.done})`;
    })
    .join(', ');

  const byClassDigest = {};
  for (const c of ALL_CLASSES) {
    const slice = window.by_class[c];
    byClassDigest[c] = {
      done: slice.done,
      phantom_bail: slice.phantom_bail,
      rate: slice.rate,
    };
  }

  const context = JSON.stringify({
    fork_id: FORK_ID,
    last_check: snapshot.generated_at,
    window_days: window.window_days,
    // Authoritative metric:
    investigate_decided: window.investigate.done,
    investigate_phantom_bail: window.investigate.phantom_bail,
    investigate_rate: window.investigate.rate === null ? null : Number(window.investigate.rate.toFixed(3)),
    // Legacy headline (preserved for back-compat):
    headline_decided: window.done,
    headline_phantom_bail: window.phantom_bail,
    headline_rate: Number(window.rate.toFixed(3)),
    threshold: snapshot.threshold,
    min_sample: snapshot.min_sample,
    trip_metric: snapshot.trip_metric,
    by_class: byClassDigest,
    last3_days: topDays,
    pattern_ref: '~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md',
    sibling_ref: '~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md',
  });

  const row = existing && existing.length > 0 ? existing[0] : null;

  if (tripped) {
    // Active P3 row needed.
    const ratePct = tripMetric.rate === null ? 0 : tripMetric.rate * 100;
    const metricTag = snapshot.trip_metric === 'legacy_headline' ? 'hl' : 'inv';
    const status = `phantom_bail_${metricTag}_${ratePct.toFixed(0)}pct_${window.window_days}d`;
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
  const inv = window.investigate;
  const tripRate = snapshot.trip_metric === 'legacy_headline' ? window.rate : inv.rate;
  const tripDecided = snapshot.trip_metric === 'legacy_headline' ? window.done : inv.done;
  const tripBail = snapshot.trip_metric === 'legacy_headline' ? window.phantom_bail : inv.phantom_bail;
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    const metricLabel = snapshot.trip_metric === 'legacy_headline' ? 'headline' : 'investigate';
    const name = `phantom-bail threshold crossed ${snapshot.generated_at.slice(0, 16)}Z ${metricLabel}=${tripRate === null ? 'n/a' : (tripRate * 100).toFixed(0) + '%'}`;
    const byClassSummary = ALL_CLASSES.map((c) => {
      const s = window.by_class[c];
      const r = s.rate === null ? 'n/a' : (s.rate * 100).toFixed(0) + '%';
      return `${c}=${r}(${s.phantom_bail}/${s.done})`;
    }).join(', ');
    const description = [
      `phantom-bail-telemetry run by ${FORK_ID} at ${snapshot.generated_at}.`,
      `Window=${window.window_days}d, threshold=${(snapshot.threshold * 100).toFixed(0)}%, min_sample=${snapshot.min_sample}, trip_metric=${snapshot.trip_metric}.`,
      `Authoritative metric (${metricLabel}): decided=${tripDecided}, phantom_bail=${tripBail}, rate=${tripRate === null ? 'n/a' : (tripRate * 100).toFixed(1) + '%'}.`,
      `Headline (legacy, all classes): decided=${window.done}, phantom_bail=${window.phantom_bail}, rate=${(window.rate * 100).toFixed(1)}%.`,
      `By class: ${byClassSummary}.`,
      `Doctrine (fork-result-fallback-must-be-marked.md verification block): >30% over 7d means the bug is upstream - investigate spawn-prompt instructions, token budgets, and tool-call ceilings rather than blaming individual forks. Investigate-class slice is now the authoritative metric since cron-fired conditional-deliverable forks dominate the headline (see cron-deliverables-can-be-conditional-not-all-fires-must-ship.md).`,
      `status_board action=${statusBoardOutcome.action}.`,
      `Cross-refs: ~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md, ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`,
    ].join(' ');
    await session.run(
      `
      MERGE (d:Decision {name: $name})
      ON CREATE SET d.created_at = datetime(), d.date = datetime()
      SET d.description = $description,
          d.updated_at = datetime(),
          d.fork_id = $fork_id,
          d.phantom_bail_rate = $headline_rate,
          d.investigate_rate = $investigate_rate,
          d.trip_metric = $trip_metric,
          d.decided_count = $decided,
          d.window_days = $window_days
      `,
      {
        name,
        description,
        fork_id: FORK_ID,
        headline_rate: window.rate,
        investigate_rate: inv.rate,
        trip_metric: snapshot.trip_metric,
        decided: tripDecided,
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

  const { done, phantomBail, byClass } = await aggregateWindow(
    supabase,
    windowStart.toISOString(),
    now.toISOString()
  );
  const rate = done > 0 ? phantomBail / done : 0;
  const interactive = byClass[CLASS_INTERACTIVE];
  const investigateRate = rateOf(interactive);
  const investigate = {
    done: interactive.done,
    phantom_bail: interactive.phantom_bail,
    rate: investigateRate,
  };

  const daily = await dailyBreakdown(supabase, args.historyDays);

  // Trip on investigate_rate (interactive class) by default; legacy headline
  // path retained for debug only via --legacy-trip.
  const tripMetricName = args.legacyTrip ? 'legacy_headline' : 'investigate';
  const tripRate = args.legacyTrip ? rate : investigateRate;
  const tripDecided = args.legacyTrip ? done : interactive.done;
  const tripped = tripRate !== null && tripRate >= args.threshold && tripDecided >= args.minSample;

  const byClassWithRates = Object.fromEntries(
    ALL_CLASSES.map((c) => {
      const r = rateOf(byClass[c]);
      return [
        c,
        {
          done: byClass[c].done,
          phantom_bail: byClass[c].phantom_bail,
          rate: r === null ? null : Number(r.toFixed(3)),
        },
      ];
    })
  );

  const snapshot = {
    generated_at: now.toISOString(),
    fork_id: FORK_ID,
    threshold: args.threshold,
    min_sample: args.minSample,
    trip_metric: tripMetricName,
    window: {
      window_days: args.windowDays,
      from: windowStart.toISOString(),
      to: now.toISOString(),
      done,
      phantom_bail: phantomBail,
      rate,
      tripped,
      investigate: {
        done: investigate.done,
        phantom_bail: investigate.phantom_bail,
        rate: investigate.rate === null ? null : Number(investigate.rate.toFixed(3)),
      },
      by_class: byClassWithRates,
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
          trip_metric: tripMetricName,
          investigate_rate: investigate.rate === null ? null : Number(investigate.rate.toFixed(3)),
          investigate_phantom_bail: investigate.phantom_bail,
          investigate_done: investigate.done,
          headline_rate: Number(rate.toFixed(3)),
          headline_phantom_bail: phantomBail,
          headline_done: done,
          tripped,
          by_class: byClassWithRates,
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
    // History entries carry the same shape the daily breakdown emits so a
    // consumer reading a single entry has both headline and investigate
    // slices without re-querying.
    const headlineToday =
      daily.find((d) => d.day === todayKey) || {
        day: todayKey,
        done: 0,
        phantom_bail: 0,
        rate: null,
        investigate: { done: 0, phantom_bail: 0, rate: null },
        by_class: Object.fromEntries(
          ALL_CLASSES.map((c) => [c, { done: 0, phantom_bail: 0, rate: null }])
        ),
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
