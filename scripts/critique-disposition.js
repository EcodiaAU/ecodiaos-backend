#!/usr/bin/env node
'use strict';

/**
 * critique-disposition.js
 *
 * Layer 8 consumer cron — disposes Critique nodes produced by the Phase G
 * audit cron. Runs daily 09:00 AEST (cron `critique-disposition`).
 *
 * Producer side: phase-G self-audit cron writes Critique nodes with
 * properties { title, severity, failure_class, target, audit_id, created_at,
 * reviewed=false, tate_decision=null, ... }.
 *
 * Consumer side (this script): walks the undisposed queue and tries to
 * self-dispose each one using these rules, in order:
 *
 *   1. dismiss-pattern-graduated
 *      The critique's title substring-matches the title of an existing
 *      :Pattern node (proposal already graduated to durable doctrine).
 *
 *   2. dismiss-sibling-shipped
 *      A sibling Critique with the same target and failure_class was
 *      disposed `graduated_to_implementation` in the last 7 days.
 *
 *   3. escalate-repeat
 *      Severity = 5 AND a critique with the same target+failure_class was
 *      open >24h ago in a prior audit. INSERT status_board row at priority
 *      1 with repeat-flag context. Mark `graduated_to_status_board`.
 *
 *   4. graduate-to-status_board
 *      Severity >= 4 AND no existing status_board row already names this
 *      critique. INSERT row priority = 6 - severity, next_action_by =
 *      ecodiaos. Mark `graduated_to_status_board`.
 *
 *   5. leave-for-tate (default)
 *      None of the above match. Mark reviewed=true,
 *      tate_decision='requires_tate_review' so it does not re-process
 *      tomorrow.
 *
 * Idempotent: re-running on already-disposed critiques is a no-op (the
 * undisposed-queue query filters them out).
 *
 * Sparse-data is correct: zero outstanding critiques = silent success per
 * ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md
 *
 * Writes one Episode node per run summarising the dispositions; does NOT
 * write an Episode if no critiques processed (sparse-data graceful zero).
 *
 * Author: fork_mortxyac_f3490d ship 4 May 2026
 */

require('dotenv').config({ path: '/home/tate/ecodiaos/.env' });

const { runQuery, runWrite, getDriver } = require('/home/tate/ecodiaos/src/config/neo4j');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const FORK_ID = process.env.CRITIQUE_DISPOSITION_FORK_ID || 'cron_critique-disposition';

function nowIso() {
  return new Date().toISOString();
}

function safeText(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function clampPriority(p) {
  if (!Number.isFinite(p)) return 3;
  return Math.max(1, Math.min(5, Math.round(p)));
}

// Convert neo4j temporal types to ISO string when possible.
function neoTimeToIso(t) {
  if (!t) return null;
  if (typeof t === 'string') return t;
  // neo4j-driver DateTime has toString() that produces ISO-ish text.
  if (typeof t.toString === 'function') {
    try {
      const s = t.toString();
      // DateTime.toString() looks like "2026-05-04T12:06:11.457000000Z" — usable.
      return s;
    } catch (_) { return null; }
  }
  return null;
}

async function fetchUndisposedCritiques() {
  const cypher = `
    MATCH (c:Critique)
    WHERE c.reviewed IS NULL OR c.reviewed = false
    RETURN
      elementId(c) AS elementId,
      c.title AS title,
      c.severity AS severity,
      c.failure_class AS failure_class,
      c.target AS target,
      c.audit_id AS audit_id,
      c.created_at AS created_at,
      c.tate_decision AS tate_decision
    ORDER BY c.severity DESC, c.created_at ASC
    LIMIT 50
  `;
  const records = await runQuery(cypher);
  return records.map(r => ({
    elementId: r.get('elementId'),
    title: r.get('title'),
    severity: typeof r.get('severity') === 'object' && r.get('severity') !== null && 'low' in r.get('severity')
      ? r.get('severity').low
      : r.get('severity'),
    failure_class: r.get('failure_class'),
    target: r.get('target'),
    audit_id: r.get('audit_id'),
    created_at: neoTimeToIso(r.get('created_at')),
    tate_decision: r.get('tate_decision'),
  }));
}

// Rule 1: dismiss if title substring-matches an existing Pattern node title.
async function findGraduatedPattern(critiqueTitle) {
  if (!critiqueTitle || critiqueTitle.length < 12) return null;
  // Use a few salient tokens from the critique title to look for a Pattern.
  // Cheap heuristic: take the longest 4 words >=4 chars and AND-match.
  const tokens = critiqueTitle
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .map(w => w.toLowerCase());
  if (tokens.length === 0) return null;
  const cypher = `
    MATCH (p:Pattern)
    WHERE ALL(t IN $tokens WHERE toLower(coalesce(p.title, p.name, '')) CONTAINS t)
    RETURN coalesce(p.title, p.name) AS title LIMIT 1
  `;
  const records = await runQuery(cypher, { tokens });
  if (records.length === 0) return null;
  return records[0].get('title');
}

// Rule 2: sibling disposed `graduated_to_implementation` in last 7d on same
// (target, failure_class).
async function findSiblingShipped(target, failureClass) {
  if (!target || !failureClass) return null;
  const cypher = `
    MATCH (c:Critique)
    WHERE c.target = $target
      AND c.failure_class = $failureClass
      AND c.tate_decision = 'graduated_to_implementation'
      AND c.disposed_at >= datetime() - duration('P7D')
    RETURN c.audit_id AS audit_id, c.disposed_at AS disposed_at, c.disposition_fork_id AS fork
    ORDER BY c.disposed_at DESC LIMIT 1
  `;
  const records = await runQuery(cypher, { target, failureClass });
  if (records.length === 0) return null;
  return {
    audit_id: records[0].get('audit_id'),
    fork: records[0].get('fork'),
  };
}

// Rule 3: severity=5 + matching critique open >24h ago in a prior audit.
async function findRepeatCritique(target, failureClass, currentAuditId) {
  if (!target || !failureClass) return null;
  const cypher = `
    MATCH (c:Critique)
    WHERE c.target = $target
      AND c.failure_class = $failureClass
      AND c.audit_id <> $currentAuditId
      AND c.created_at <= datetime() - duration('PT24H')
    RETURN c.audit_id AS audit_id, c.created_at AS created_at
    ORDER BY c.created_at ASC LIMIT 1
  `;
  const records = await runQuery(cypher, { target, failureClass, currentAuditId: currentAuditId || '' });
  if (records.length === 0) return null;
  return {
    audit_id: records[0].get('audit_id'),
    created_at: neoTimeToIso(records[0].get('created_at')),
  };
}

// Check status_board for an existing row whose name ILIKE the critique title.
async function findExistingStatusBoardRow(title) {
  if (!title) return null;
  // Use first 60 chars of title (truncated) as ILIKE pattern, escape % and _.
  const slug = title.slice(0, 60).replace(/[%_]/g, '');
  const { data, error } = await supabase
    .from('status_board')
    .select('id, name, status, archived_at')
    .ilike('name', `%${slug}%`)
    .is('archived_at', null)
    .limit(1);
  if (error) {
    console.error('[critique-disposition] status_board lookup error:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0];
}

async function insertStatusBoardRow({ critique, priority, isRepeat, repeatRef }) {
  const name = (critique.title || `[untitled critique severity=${critique.severity}]`).slice(0, 240);
  const contextObj = {
    source: 'critique-disposition',
    critique_element_id: critique.elementId,
    audit_id: critique.audit_id,
    severity: critique.severity,
    failure_class: critique.failure_class,
    target: critique.target,
    created_at: critique.created_at,
    is_repeat: Boolean(isRepeat),
  };
  if (isRepeat && repeatRef) contextObj.repeat_of = repeatRef;

  const row = {
    entity_type: 'infrastructure',
    name,
    status: isRepeat ? 'repeat_critique_escalated' : 'graduated_from_critique',
    next_action: critique.target
      ? `Address: ${critique.target.slice(0, 280)}`
      : 'Triage critique target — see context for details',
    next_action_by: 'ecodiaos',
    priority,
    context: JSON.stringify(contextObj),
    source: `cron:critique-disposition:${FORK_ID}`,
  };

  const { data, error } = await supabase
    .from('status_board')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    console.error('[critique-disposition] status_board insert error:', error.message);
    return null;
  }
  return data.id;
}

async function markCritiqueDisposed(elementId, decision, extras = {}) {
  const cypher = `
    MATCH (c:Critique) WHERE elementId(c) = $elementId
    SET c.reviewed = true,
        c.tate_decision = $decision,
        c.disposed_at = datetime(),
        c.disposition_fork_id = $forkId,
        c.disposition_status_board_id = coalesce($statusBoardId, c.disposition_status_board_id),
        c.disposition_reason = $reason,
        c.disposition_dismiss_match = $dismissMatch
    RETURN elementId(c) AS id
  `;
  const params = {
    elementId,
    decision,
    forkId: FORK_ID,
    statusBoardId: extras.statusBoardId || null,
    reason: extras.reason || '',
    dismissMatch: extras.dismissMatch || '',
  };
  await runWrite(cypher, params);
}

async function disposeOne(critique, protectedSet) {
  const protectedKey = `${critique.audit_id || ''}::${critique.failure_class || ''}::${critique.severity}`;
  if (protectedSet.has(protectedKey)) {
    return { decision: 'protected_skipped', reason: 'protected by sibling fork', critique };
  }

  // Rule 1: dismiss-pattern-graduated
  const patternMatch = await findGraduatedPattern(critique.title);
  if (patternMatch) {
    await markCritiqueDisposed(critique.elementId, 'dismissed_pattern_graduated', {
      reason: `Matching Pattern node already exists: "${patternMatch}"`,
      dismissMatch: patternMatch,
    });
    return { decision: 'dismissed_pattern_graduated', match: patternMatch, critique };
  }

  // Rule 2: dismiss-sibling-shipped
  const sibling = await findSiblingShipped(critique.target, critique.failure_class);
  if (sibling) {
    await markCritiqueDisposed(critique.elementId, 'dismissed_sibling_shipped', {
      reason: `Sibling critique already graduated to implementation by ${sibling.fork || 'unknown'} (audit ${sibling.audit_id || '?'})`,
    });
    return { decision: 'dismissed_sibling_shipped', sibling, critique };
  }

  const sev = Number(critique.severity);

  // Rule 3: escalate-repeat (sev=5 + repeat)
  if (sev === 5) {
    const repeat = await findRepeatCritique(critique.target, critique.failure_class, critique.audit_id);
    if (repeat) {
      const existing = await findExistingStatusBoardRow(critique.title);
      let statusBoardId = existing ? existing.id : null;
      if (!statusBoardId) {
        statusBoardId = await insertStatusBoardRow({
          critique,
          priority: 1,
          isRepeat: true,
          repeatRef: repeat,
        });
      }
      await markCritiqueDisposed(critique.elementId, 'graduated_to_status_board', {
        statusBoardId,
        reason: `Escalated as repeat: prior audit ${repeat.audit_id} created similar critique at ${repeat.created_at}`,
      });
      return { decision: 'escalated_repeat', statusBoardId, repeat, critique };
    }
  }

  // Rule 4: graduate-to-status_board (sev>=4 + no existing row)
  if (sev >= 4) {
    const existing = await findExistingStatusBoardRow(critique.title);
    if (existing) {
      await markCritiqueDisposed(critique.elementId, 'dismissed_status_board_row_exists', {
        reason: `Existing active status_board row already covers this critique (id ${existing.id})`,
        dismissMatch: existing.id,
      });
      return { decision: 'dismissed_status_board_row_exists', existing, critique };
    }
    const priority = clampPriority(6 - sev);
    const statusBoardId = await insertStatusBoardRow({ critique, priority, isRepeat: false });
    await markCritiqueDisposed(critique.elementId, 'graduated_to_status_board', {
      statusBoardId,
      reason: `Severity ${sev} graduated to status_board (priority ${priority})`,
    });
    return { decision: 'graduated_to_status_board', statusBoardId, critique };
  }

  // Rule 5: leave-for-tate (default)
  await markCritiqueDisposed(critique.elementId, 'requires_tate_review', {
    reason: `Severity ${sev} below auto-graduate threshold; requires human review`,
  });
  return { decision: 'requires_tate_review', critique };
}

async function writeRunEpisode(summary) {
  const cypher = `
    CREATE (e:Episode {
      name: $name,
      type: 'cron_run',
      cron: 'critique-disposition',
      created_at: datetime(),
      processed: $processed,
      dismissed_pattern: $dismissedPattern,
      dismissed_sibling: $dismissedSibling,
      dismissed_status_board_existing: $dismissedExisting,
      escalated_repeat: $escalatedRepeat,
      graduated_to_status_board: $graduated,
      requires_tate_review: $tateReview,
      protected_skipped: $protectedSkipped,
      fork_id: $forkId,
      description: $description
    })
    RETURN elementId(e) AS id
  `;
  const description = `critique-disposition cron run @ ${nowIso()}: ` +
    `processed=${summary.processed}, ` +
    `dismissed_pattern=${summary.dismissedPattern}, ` +
    `dismissed_sibling=${summary.dismissedSibling}, ` +
    `dismissed_existing=${summary.dismissedExisting}, ` +
    `escalated_repeat=${summary.escalatedRepeat}, ` +
    `graduated=${summary.graduated}, ` +
    `tate_review=${summary.tateReview}, ` +
    `protected_skipped=${summary.protectedSkipped}.`;
  await runWrite(cypher, {
    name: `critique-disposition run ${nowIso()}`,
    processed: summary.processed,
    dismissedPattern: summary.dismissedPattern,
    dismissedSibling: summary.dismissedSibling,
    dismissedExisting: summary.dismissedExisting,
    escalatedRepeat: summary.escalatedRepeat,
    graduated: summary.graduated,
    tateReview: summary.tateReview,
    protectedSkipped: summary.protectedSkipped,
    forkId: FORK_ID,
    description,
  });
}

async function main() {
  const start = Date.now();
  const protectedSet = new Set();
  // Per brief: do NOT graduate or dismiss the two sibling-fork-handled
  // critiques. Match by (audit_id, failure_class, severity).
  protectedSet.add('phase-G-audit-2026-05-04::surfacing_failure::5');
  protectedSet.add('phase-G-audit-2026-05-04::exploration_drift::5');

  console.log(`[critique-disposition] start fork_id=${FORK_ID} at ${nowIso()}`);

  const queue = await fetchUndisposedCritiques();
  console.log(`[critique-disposition] undisposed queue length: ${queue.length}`);

  const summary = {
    processed: 0,
    dismissedPattern: 0,
    dismissedSibling: 0,
    dismissedExisting: 0,
    escalatedRepeat: 0,
    graduated: 0,
    tateReview: 0,
    protectedSkipped: 0,
    samples: [],
  };

  for (const critique of queue) {
    try {
      const result = await disposeOne(critique, protectedSet);
      summary.processed += 1;
      switch (result.decision) {
        case 'dismissed_pattern_graduated':
          summary.dismissedPattern += 1; break;
        case 'dismissed_sibling_shipped':
          summary.dismissedSibling += 1; break;
        case 'dismissed_status_board_row_exists':
          summary.dismissedExisting += 1; break;
        case 'escalated_repeat':
          summary.escalatedRepeat += 1; break;
        case 'graduated_to_status_board':
          summary.graduated += 1; break;
        case 'requires_tate_review':
          summary.tateReview += 1; break;
        case 'protected_skipped':
          summary.protectedSkipped += 1; break;
      }
      if (summary.samples.length < 8) {
        summary.samples.push({
          decision: result.decision,
          severity: critique.severity,
          failure_class: critique.failure_class,
          audit_id: critique.audit_id,
          title_snippet: safeText(critique.title).slice(0, 80),
        });
      }
      console.log(`  - ${result.decision} sev=${critique.severity} class=${critique.failure_class} audit=${critique.audit_id}`);
    } catch (err) {
      console.error('[critique-disposition] disposeOne error:', err.message, 'critique=', critique.elementId);
    }
  }

  if (summary.processed > 0) {
    try {
      await writeRunEpisode(summary);
    } catch (err) {
      console.error('[critique-disposition] writeRunEpisode error:', err.message);
    }
  } else {
    console.log('[critique-disposition] zero processed — silent success per cron-deliverables-can-be-conditional doctrine');
  }

  const elapsed = Date.now() - start;
  console.log(`[critique-disposition] done in ${elapsed}ms`);
  console.log(JSON.stringify(summary, null, 2));

  // Close driver to allow node to exit cleanly.
  const d = getDriver();
  if (d) await d.close();
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[critique-disposition] fatal:', err);
    process.exit(1);
  });
