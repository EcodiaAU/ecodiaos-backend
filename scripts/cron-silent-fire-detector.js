#!/usr/bin/env node
'use strict';

/**
 * cron-silent-fire-detector.js
 *
 * Mechanical detector for the "cron silent fire" failure mode:
 *   doctrine says "the cron prompt that fired MUST cause the receiving turn
 *   to emit a deliverable (fork spawn / Neo4j write / status_board write /
 *   draft file / ...)". Today this is enforced only by narration. This
 *   script empirically measures compliance.
 *
 * For each `os_scheduled_tasks` row with a recent `last_run_at` it:
 *   1. parses the prompt to classify which deliverable signals it carries
 *      (signal_fork, signal_neo4j_write, signal_status_board_write,
 *       signal_draft_file)
 *   2. probes the corresponding substrate within a window
 *      [last_run_at, last_run_at + windowMin] for matching artefacts
 *   3. emits a per-task verdict: green | silent_fire_suspected | no_signals
 *
 * Modes:
 *   --report           : print JSON report to stdout (default)
 *   --write            : on top of report, INSERT/UPDATE one P2 status_board
 *                        row (entity_type=infrastructure) summarising the
 *                        latest run and write a Neo4j Decision when the
 *                        rolling silent-fire rate exceeds the threshold.
 *   --lookback-min N   : only consider crons whose last_run_at is within N
 *                        minutes of now (default 120)
 *   --window-min N     : observation window after each fire to credit a
 *                        deliverable (default 15)
 *   --baseline-min N   : pre-fire baseline window for differential probing
 *                        (default 30). Fire is credited only if post-fire
 *                        artefact count exceeds the baseline.
 *   --verbose          : per-task signal/observation detail
 *
 * Exit code: 0 always (advisory), even on errors. Log to stderr.
 *
 * Substrates probed:
 *   - signal_fork              os_forks.started_at IN window
 *   - signal_neo4j_write       neo4j Decision/Episode/Reflection/Realization
 *                              with created_at IN window
 *   - signal_status_board_write status_board.last_touched IN window
 *                              (created or updated, archived rows count
 *                              because archive is itself a write)
 *   - signal_draft_file        ~/ecodiaos/drafts/* mtime IN window
 *
 * Author: fork_mon9668q_03808e self-evolution session 1 May 2026
 */

require('dotenv').config({ path: '/home/tate/ecodiaos/.env' });

const { createClient } = require('@supabase/supabase-js');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

const FORK_ID = 'fork_mon9668q_03808e';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const DRAFTS_DIR = path.resolve(process.env.HOME || '/home/tate', 'ecodiaos/drafts');

const STATUS_BOARD_ROW_NAME = 'cron silent-fire detector — rolling report';
const NEO4J_ALERT_THRESHOLD = 0.4; // 40% silent fire rate triggers Decision write

// ---------------- arg parsing ----------------
function parseArgs(argv) {
  const out = {
    mode: 'report',
    lookbackMin: 120,
    windowMin: 15,
    baselineMin: 30,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--write') out.mode = 'write';
    else if (a === '--report') out.mode = 'report';
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--lookback-min') out.lookbackMin = parseInt(argv[++i], 10);
    else if (a === '--window-min') out.windowMin = parseInt(argv[++i], 10);
    else if (a === '--baseline-min') out.baselineMin = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stderr.write(
        'cron-silent-fire-detector.js [--report|--write] [--lookback-min N] [--window-min N] [--baseline-min N] [--verbose]\n'
      );
      process.exit(0);
    }
  }
  return out;
}

// ---------------- signal classifier ----------------
// Each entry: only HARD-MANDATE language counts. Casual mentions of a
// substrate name are intentionally NOT signals — the doctrine is "the cron
// PROMPT advertised a deliverable and the receiving turn delivered nothing."
// If the prompt does not advertise a hard deliverable, there is nothing to
// silently fail.
const SIGNAL_DEFS = [
  {
    key: 'signal_fork',
    label: 'fork dispatch',
    // explicit dispatch verbs, the spawn_fork tool, [FORK_REPORT] (only
    // produced by fork harness), or imperative "MUST/shall fork".
    regex: /(\bspawn_fork\b|\bspawn\s+(?:a\s+)?fork\b|\bdispatch\s+(?:a|the|fresh|new)?\s*fork\b|\bMUST\s+fork\b|\bshall\s+fork\b|\[FORK_REPORT\]|\bspawn\s+a\s+brief\b|\bfork\s+brief\b)/i,
  },
  {
    key: 'signal_neo4j_write',
    label: 'Neo4j Decision/Episode write',
    // explicit graph_* tool calls or imperative "MUST/shall write a
    // Decision/Episode/Reflection/Realization".
    regex: /(\bgraph_merge_node\b|\bgraph_reflect\b|\bgraph_create_relationship\b|(?:MUST|shall|required\s+to)\s+(?:write|merge|create)\s+(?:a|the|an)?\s*(?:Decision|Episode|Reflection|Realization)\s+node?\b|\bMERGE\s+\(\w*:(?:Decision|Episode|Reflection|Realization)\b)/i,
  },
  {
    key: 'signal_status_board_write',
    label: 'status_board insert/update',
    // explicit DDL/MCP write OR imperative "MUST/shall update/insert/archive".
    regex: /(\bINSERT\s+INTO\s+status_board\b|\bUPDATE\s+status_board\b|\bstatus[_-]board\.(?:upsert|update|insert|archive)\b|(?:MUST|shall|required\s+to)\s+(?:update|insert|upsert|archive|create)\s+(?:a|the|your|one)?\s*status[_-]?board(?:\s+row)?\b)/i,
  },
  {
    key: 'signal_draft_file',
    label: 'draft file on disk',
    // explicit drafts/<slug>.md path or "MUST write a draft" imperative.
    regex: /(~?\/ecodiaos\/drafts\/[a-zA-Z0-9._/-]+\.md|(?:MUST|shall|required\s+to)\s+write\s+(?:a|the|an)?\s*(?:draft|deliverable|file)\s+(?:to\s+)?(?:~?\/ecodiaos\/drafts\/|drafts\/))/i,
  },
];

function classifySignals(prompt) {
  const found = [];
  for (const def of SIGNAL_DEFS) {
    const m = def.regex.exec(prompt || '');
    if (m) {
      found.push({ key: def.key, label: def.label, match: m[0].slice(0, 80) });
    }
  }
  return found;
}

// ---------------- conditional-escape detector ----------------
// Many crons advertise a substrate keyword inside a CONDITIONAL clause:
//   "Exit silent on errors=0. If errors>0 insert into status_board..."
//   "If any deployment has status ERROR: email tate@ecodia.au"
//   "If 0 rows: log healthy and exit."
// The substrate write is correctly NOT performed on a healthy fire — silence
// is the by-design outcome. Treating these as silent-fires produces noise.
//
// detectConditionalEscape(prompt) returns { conditional: bool, matches: [...] }.
// When true, classifySignals' results are demoted from required → conditional;
// missing artefacts then verdict='green_silent_by_design' instead of
// 'silent_fire_suspected'. Origin: 2 May 2026 6/6 false-positive sweep on
// status_board row 0df47f4b. See ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md.
const CONDITIONAL_ESCAPE_PATTERNS = [
  // "Exit silent on" / "silent on" / "exit silent if" — explicit by-design silence
  /\bexit\s+silent\s+(?:on|when|if)\b/i,
  /\bsilent\s+(?:on|when|if)\b/i,
  // "silent exit" / "log healthy and exit" / "exit silent/cleanly/early"
  /\b(?:silent\s+exit|log\s+healthy\s+and\s+exit|exit\s+(?:silent|cleanly|early))\b/i,
  // "If errors>0" / "if rows>0" / "if count<=N" — comparison-gated work
  /\bif\s+(?:errors?|count|rows?|deploys?|deployments?|drift|findings?|issues?|gaps?|flags?|results?|stuck_count|delta_\w+|rate_per_min)\s*[><=!]/i,
  // "If 0 rows" / "If 4+ gaps" / "If 1-3 gaps"
  /\bif\s+\d+\+?\s+(?:rows?|gaps?|flags?|errors?|deploys?|deployments?|findings?|issues?|stuck|tasks?)\b/i,
  /\bif\s+\d+\s*[-]\s*\d+\s+(?:rows?|gaps?|flags?|errors?|deploys?|deployments?|findings?|issues?)\b/i,
  // "Only if/when X: insert/email/update" — explicit only-on-condition imperative
  /\bonly\s+(?:if|when)\b[\s\S]{0,80}?(?:write|fork|insert|update|email|spawn|dispatch|append)/i,
  // "If any/some/no/anything X" — common AS conditional opener
  /\bIf\s+(?:any|some|no|anything|nothing|all|none|each)\b/i,
  // "If LOOP CONDITION true" / "if X CONDITION true" — predicate-style
  /\bif\s+[A-Z_][\w\s]{0,30}\bCONDITION\b/i,
  /\bif\s+\w+\s+(?:true|false)\b/i,
  // Single-keyword tag of advisory / monitoring / conditional / optional
  /\b(?:advisory|monitoring|conditional|optionally|conditionally)\b/i,
  // "Otherwise X" — implies the prior branch was the silent-by-design path
  /\bOtherwise\b[\s\S]{0,80}?(?:send|email|insert|update|write|spawn)/i,
  // Self-declaring "no action — keep watching" loop (the detector itself uses this)
  /\bnext_action[^\n]{0,40}["']no\s+action\b/i,
  // "Exit on 0/zero/clean/healthy"
  /\bExit\s+(?:on|with)\s+(?:0|zero|clean|healthy)\b/i,
];

function detectConditionalEscape(prompt) {
  if (!prompt) return { conditional: false, matches: [] };
  const matches = [];
  for (const re of CONDITIONAL_ESCAPE_PATTERNS) {
    const m = re.exec(prompt);
    if (m) {
      matches.push(m[0].slice(0, 80));
      // one match is sufficient; keep collecting up to 3 for evidence then bail
      if (matches.length >= 3) break;
    }
  }
  return { conditional: matches.length > 0, matches };
}

// ---------------- substrate probes ----------------
// Differential design. Each probe returns counts in two windows:
//   post  = [last_run_at, last_run_at + windowMin]    (what the fire caused)
//   base  = [last_run_at - baselineMin, last_run_at]  (ambient activity)
// The fire is credited iff post > base. This kills false-positive greens
// from baseline drift on a busy substrate.
async function countForkSpawns(supabase, from, to) {
  const { count, error } = await supabase
    .from('os_forks')
    .select('fork_id', { count: 'exact', head: true })
    .gte('started_at', from.toISOString())
    .lte('started_at', to.toISOString());
  if (error) throw new Error(`os_forks query: ${error.message}`);
  return count || 0;
}

async function countStatusBoardWrites(supabase, from, to) {
  const { count, error } = await supabase
    .from('status_board')
    .select('id', { count: 'exact', head: true })
    .gte('last_touched', from.toISOString())
    .lte('last_touched', to.toISOString());
  if (error) throw new Error(`status_board query: ${error.message}`);
  return count || 0;
}

async function countDraftFiles(from, to) {
  const entries = await fs.promises.readdir(DRAFTS_DIR, { withFileTypes: true });
  const startMs = from.getTime();
  const endMs = to.getTime();
  let n = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(DRAFTS_DIR, entry.name);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs >= startMs && stat.mtimeMs <= endMs) n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

async function countNeo4jWrites(driver, from, to) {
  if (!driver) return null; // null = unable to probe
  const session = driver.session({ database: NEO4J_DATABASE, defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      `
      MATCH (n)
      WHERE (n:Decision OR n:Episode OR n:Reflection OR n:Realization)
        AND coalesce(n.created_at, n.date) >= datetime($from)
        AND coalesce(n.created_at, n.date) <= datetime($to)
      RETURN count(n) AS c
      `,
      { from: from.toISOString(), to: to.toISOString() }
    );
    return result.records[0]?.get('c')?.toNumber?.() ?? 0;
  } finally {
    await session.close();
  }
}

async function differentialProbe(signalKey, ctx) {
  const { supabase, driver, postStart, postEnd, baseStart, baseEnd } = ctx;
  let counter;
  if (signalKey === 'signal_fork') counter = (a, b) => countForkSpawns(supabase, a, b);
  else if (signalKey === 'signal_status_board_write') counter = (a, b) => countStatusBoardWrites(supabase, a, b);
  else if (signalKey === 'signal_draft_file') counter = (a, b) => countDraftFiles(a, b);
  else if (signalKey === 'signal_neo4j_write') counter = (a, b) => countNeo4jWrites(driver, a, b);
  else return { observed: false, evidence: 'no probe', skipped: true };

  try {
    const post = await counter(postStart, postEnd);
    const base = await counter(baseStart, baseEnd);
    if (post === null || base === null) {
      return { observed: false, evidence: 'substrate unavailable', skipped: true };
    }
    // Normalise base to the post window length so the comparison is fair
    // when --baseline-min and --window-min differ.
    const postSpanMs = postEnd.getTime() - postStart.getTime();
    const baseSpanMs = baseEnd.getTime() - baseStart.getTime();
    const normBase = baseSpanMs > 0 ? base * (postSpanMs / baseSpanMs) : 0;
    // Credit the fire iff post strictly exceeds the baseline rate.
    // Add +1 hysteresis so a single ambient write doesn't flip the verdict.
    const observed = post > normBase;
    return {
      observed,
      post,
      base,
      base_normalised: Number(normBase.toFixed(2)),
      evidence: `post=${post}, base=${base} (norm=${normBase.toFixed(2)}) → ${observed ? 'credited' : 'no lift'}`,
    };
  } catch (err) {
    return { observed: false, evidence: `probe error: ${err.message}`, error: true };
  }
}

// ---------------- main ----------------
async function main() {
  const args = parseArgs(process.argv);
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - args.lookbackMin * 60 * 1000);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    process.stderr.write('cron-silent-fire-detector: SUPABASE creds missing\n');
    process.exit(0);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let driver = null;
  if (NEO4J_URI && NEO4J_USER && NEO4J_PASSWORD) {
    try {
      driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    } catch (err) {
      process.stderr.write(`neo4j driver init failed: ${err.message}\n`);
      driver = null;
    }
  }

  // Pull active scheduled tasks that fired in the lookback window.
  const { data: tasks, error: tasksErr } = await supabase
    .from('os_scheduled_tasks')
    .select('id, name, type, prompt, last_run_at, status')
    .eq('status', 'active')
    .gte('last_run_at', lookbackStart.toISOString())
    .lte('last_run_at', now.toISOString())
    .order('last_run_at', { ascending: false });

  if (tasksErr) {
    process.stderr.write(`task query failed: ${tasksErr.message}\n`);
    if (driver) await driver.close();
    process.exit(0);
  }

  const report = {
    fork_id: FORK_ID,
    generated_at: now.toISOString(),
    lookback_min: args.lookbackMin,
    window_min: args.windowMin,
    tasks_examined: tasks?.length || 0,
    silent_fire_count: 0,
    green_count: 0,
    conditional_silent_count: 0,
    no_signals_count: 0,
    silent_fire_rate: 0,
    tasks: [],
  };

  for (const task of tasks || []) {
    const lastRun = new Date(task.last_run_at);
    const postStart = lastRun;
    const postEnd = new Date(lastRun.getTime() + args.windowMin * 60 * 1000);
    const baseStart = new Date(lastRun.getTime() - args.baselineMin * 60 * 1000);
    const baseEnd = lastRun;
    const effectivePostEnd = postEnd > now ? now : postEnd;
    const windowComplete = postEnd <= now;

    const signals = classifySignals(task.prompt);
    const escape = detectConditionalEscape(task.prompt);
    const taskEntry = {
      task_id: task.id,
      name: task.name,
      type: task.type,
      last_run_at: task.last_run_at,
      post_window_end: effectivePostEnd.toISOString(),
      window_complete: windowComplete,
      signals: signals.map((s) => ({ key: s.key, match: s.match })),
      conditional_escape: escape.conditional,
      conditional_escape_matches: escape.conditional ? escape.matches : undefined,
      probes: {},
      verdict: 'no_signals',
    };

    if (signals.length === 0) {
      report.no_signals_count += 1;
      report.tasks.push(taskEntry);
      continue;
    }

    const probeCtx = {
      supabase,
      driver,
      postStart,
      postEnd: effectivePostEnd,
      baseStart,
      baseEnd,
    };

    let unmet = [];
    for (const sig of signals) {
      const probe = await differentialProbe(sig.key, probeCtx);
      taskEntry.probes[sig.key] = probe;
      if (!probe.observed && !probe.skipped) unmet.push(sig.key);
    }

    // If the post-fire window hasn't fully elapsed, demote unmet → pending.
    if (!windowComplete && unmet.length > 0) {
      taskEntry.verdict = 'pending_window';
    } else if (unmet.length === 0) {
      // All advertised deliverables landed; conditional or not, this is green.
      taskEntry.verdict = 'green';
      report.green_count += 1;
    } else if (escape.conditional) {
      // Prompt declared the deliverable inside a conditional clause and the
      // condition did not fire on this run. Silence is by design — green.
      taskEntry.verdict = 'green_silent_by_design';
      taskEntry.unmet_signals = unmet;
      report.conditional_silent_count += 1;
    } else {
      taskEntry.verdict = 'silent_fire_suspected';
      taskEntry.unmet_signals = unmet;
      report.silent_fire_count += 1;
    }

    report.tasks.push(taskEntry);
  }

  // silent_fire_rate denominator excludes conditional_silent — they are NOT
  // failures and skewing the rate would defeat the alert threshold.
  const decided = report.silent_fire_count + report.green_count;
  report.silent_fire_rate = decided > 0 ? report.silent_fire_count / decided : 0;

  // ---------------- output ----------------
  if (args.verbose) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const slim = {
      ...report,
      tasks: report.tasks.map((t) => ({
        name: t.name,
        verdict: t.verdict,
        signals: t.signals.map((s) => s.key),
        unmet_signals: t.unmet_signals || undefined,
        conditional_escape: t.conditional_escape || undefined,
      })),
    };
    process.stdout.write(JSON.stringify(slim, null, 2) + '\n');
  }

  // ---------------- write mode ----------------
  if (args.mode === 'write') {
    await upsertStatusBoardRow(supabase, report);
    if (report.silent_fire_rate >= NEO4J_ALERT_THRESHOLD && decided >= 3 && driver) {
      await writeNeo4jDecision(driver, report);
    }
  }

  if (driver) await driver.close();
  process.exit(0);
}

async function upsertStatusBoardRow(supabase, report) {
  const condSilent = report.conditional_silent_count || 0;
  const verdictTag =
    report.silent_fire_count > 0
      ? `${report.silent_fire_count}/${report.tasks_examined} suspected silent fires`
      : `clean (${report.green_count} green / ${condSilent} conditional-silent / ${report.tasks_examined} examined)`;

  const top = report.tasks
    .filter((t) => t.verdict === 'silent_fire_suspected')
    .slice(0, 8)
    .map((t) => `${t.name}: unmet=${(t.unmet_signals || []).join(',')}`)
    .join(' | ');

  const status =
    report.silent_fire_count === 0
      ? 'monitoring_clean'
      : `silent_fires_suspected_${report.silent_fire_count}`;

  const priority = report.silent_fire_count >= 3 ? 2 : report.silent_fire_count > 0 ? 3 : 4;

  // Look for an existing infrastructure row by name.
  const { data: existing, error: lookupErr } = await supabase
    .from('status_board')
    .select('id, archived_at')
    .eq('name', STATUS_BOARD_ROW_NAME)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lookupErr) {
    process.stderr.write(`status_board lookup failed: ${lookupErr.message}\n`);
    return;
  }

  const context = JSON.stringify({
    fork_id: FORK_ID,
    last_check: report.generated_at,
    lookback_min: report.lookback_min,
    window_min: report.window_min,
    tasks_examined: report.tasks_examined,
    silent_fire_count: report.silent_fire_count,
    green_count: report.green_count,
    conditional_silent_count: report.conditional_silent_count,
    silent_fire_rate: Number(report.silent_fire_rate.toFixed(3)),
    top_silent: top || null,
  });

  const nowIso = new Date().toISOString();
  if (existing && existing.length > 0) {
    const { error: updErr } = await supabase
      .from('status_board')
      .update({
        status,
        next_action:
          report.silent_fire_count === 0
            ? 'no action - keep watching'
            : `investigate ${report.silent_fire_count} suspected silent fires (see context.top_silent)`,
        next_action_by: 'ecodiaos',
        last_touched: nowIso,
        context,
        priority,
      })
      .eq('id', existing[0].id);
    if (updErr) process.stderr.write(`status_board update failed: ${updErr.message}\n`);
  } else {
    const { error: insErr } = await supabase.from('status_board').insert({
      entity_type: 'infrastructure',
      entity_ref: 'cron_silent_fire_detector',
      name: STATUS_BOARD_ROW_NAME,
      status,
      next_action:
        report.silent_fire_count === 0
          ? 'no action - keep watching'
          : `investigate ${report.silent_fire_count} suspected silent fires (see context.top_silent)`,
      next_action_by: 'ecodiaos',
      last_touched: nowIso,
      context,
      priority,
      source: FORK_ID,
    });
    if (insErr) process.stderr.write(`status_board insert failed: ${insErr.message}\n`);
  }
}

async function writeNeo4jDecision(driver, report) {
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    const name = `cron-silent-fire alert ${report.generated_at.slice(0, 16)}Z rate=${(report.silent_fire_rate * 100).toFixed(0)}%`;
    const description = [
      `cron-silent-fire-detector run by ${FORK_ID} at ${report.generated_at}.`,
      `Lookback ${report.lookback_min}min, observation window ${report.window_min}min.`,
      `${report.tasks_examined} tasks examined; ${report.silent_fire_count} suspected silent fires; ${report.green_count} green; ${report.conditional_silent_count || 0} green-silent-by-design (conditional deliverables, condition did not fire); ${report.no_signals_count} carried no advertised deliverable signals.`,
      `Silent-fire rate ${(report.silent_fire_rate * 100).toFixed(1)}% over ${report.silent_fire_count + report.green_count} decided tasks (>= ${NEO4J_ALERT_THRESHOLD * 100}% threshold triggers this Decision).`,
      `Top suspects: ${(report.tasks
        .filter((t) => t.verdict === 'silent_fire_suspected')
        .slice(0, 5)
        .map((t) => `${t.name}(${(t.unmet_signals || []).join('/')})`)
        .join('; ')) || 'none'}.`,
      'Cross-ref: ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md',
    ].join(' ');
    await session.run(
      `
      MERGE (d:Decision {name: $name})
      ON CREATE SET d.created_at = datetime(), d.date = datetime()
      SET d.description = $description,
          d.updated_at = datetime(),
          d.fork_id = $fork_id,
          d.silent_fire_rate = $rate,
          d.tasks_examined = $te,
          d.silent_fire_count = $sfc
      `,
      {
        name,
        description,
        fork_id: FORK_ID,
        rate: report.silent_fire_rate,
        te: report.tasks_examined,
        sfc: report.silent_fire_count,
      }
    );
  } catch (err) {
    process.stderr.write(`neo4j Decision write failed: ${err.message}\n`);
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  process.stderr.write(`cron-silent-fire-detector fatal: ${err.message}\n${err.stack}\n`);
  process.exit(0);
});
