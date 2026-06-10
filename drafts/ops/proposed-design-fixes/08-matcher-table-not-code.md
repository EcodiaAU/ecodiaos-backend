# Fix 08 — Matcher table (data-driven matchers, not hardcoded)

**Origin:** fork_moslimsp_a72e73 listener audit, design Q1
**Leverage:** HIGH (over time, every future matcher)
**Files:**
- NEW migration: `migrations/<NN>_perception_matchers.sql`
- `src/services/perceptionDispatcher.js` (load from table)

## Problem
Matchers are hardcoded in `perceptionDispatcher.js`. Every new matcher = code change + PM2 restart. Hot-reloadable code is risky (closure leaks). Better: matcher rules live in a table; dispatcher loads + reloads from table.

## Migration

```sql
-- migrations/NN_perception_matchers.sql
CREATE TABLE IF NOT EXISTS perception_matchers (
  domain TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  shadow_mode BOOLEAN NOT NULL DEFAULT false,    -- Fix 09: dispatch logs only, no side effect
  priority INTEGER NOT NULL DEFAULT 100,         -- evaluation order
  -- Test predicate: kind regex (case-insensitive) OR data substring (any of)
  kind_regex TEXT,                                -- e.g. 'invoice|payment|stripe'
  data_substr_any TEXT[],                         -- e.g. ['stripe','xero','client_id']
  min_confidence NUMERIC,                         -- e.g. 0.9 for alert-grade only
  -- Dispatch action: kind + payload template (resolved at fire-time)
  action_kind TEXT NOT NULL,                     -- 'status_board_p1' | 'republish' | 'webhook' | 'sms_tate'
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Dedupe window override (default 5min)
  dedupe_window_secs INTEGER NOT NULL DEFAULT 300,
  -- Replay window for register-time backfill (Fix 10)
  replay_from_secs_ago INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing 6 hardcoded matchers as the seed.
INSERT INTO perception_matchers (domain, kind_regex, data_substr_any, action_kind, action_payload) VALUES
  ('finance',
   'invoice|payment|billing|transaction|receipt|expense',
   ARRAY['invoice','payment','stripe','xero'],
   'republish',
   '{"kind":"finance_context_surfaced","query":"SELECT id, name, status, next_action FROM status_board WHERE entity_type = ''finance'' AND archived_at IS NULL ORDER BY priority ASC LIMIT 3"}'::jsonb),
  ('status_board',
   'status_board',
   ARRAY['status_board','shipped','blocked'],
   'republish',
   '{"kind":"overdue_status_board_items","query":"SELECT id, name, status, next_action_due FROM status_board WHERE archived_at IS NULL AND next_action_due IS NOT NULL AND next_action_due < NOW() ORDER BY priority ASC LIMIT 5"}'::jsonb),
  ('error_escalation',
   'error|crash|failure|timeout',
   NULL,
   'status_board_p1',
   '{"name_template":"auto: {source}/{kind}","next_action":"Auto-created from perception bus event. Review and resolve."}'::jsonb),
  ('security_incident',
   'auth_(fail|denied|invalid)|oauth_(expired|invalid|revoked)|cred(_| )?rotat|rls_violation|hmac_(fail|invalid)|tier3_gate_denied|signature_(fail|invalid)',
   ARRAY['unauthorized','suspicious_login','suspicious login','leaked_secret','vault_secret'],
   'status_board_p1',
   '{"name_template":"auto: security/{source}/{kind}","next_action":"Auto-created from perception bus security event. Investigate immediately."}'::jsonb);
-- (crm + task_completion: parameterised similarly; omitted for brevity)
```

## Dispatcher refactor (sketch — perceptionDispatcher.js)

```javascript
let _matcherTable = []  // [{ domain, regex, dataSubstrs, actionKind, actionPayload, ... }]

async function _reloadMatcherTable() {
  try {
    const rows = await db`
      SELECT * FROM perception_matchers
      WHERE enabled = true
      ORDER BY priority ASC
    `
    _matcherTable = rows.map(r => ({
      domain: r.domain,
      shadow: r.shadow_mode,
      regex: r.kind_regex ? new RegExp(r.kind_regex, 'i') : null,
      dataSubstrs: r.data_substr_any || [],
      minConfidence: r.min_confidence != null ? Number(r.min_confidence) : null,
      actionKind: r.action_kind,
      actionPayload: r.action_payload || {},
      dedupeWindowMs: (r.dedupe_window_secs || 300) * 1000,
      replayFromSecsAgo: r.replay_from_secs_ago,
    }))
    logger.info('perceptionDispatcher: matcher table reloaded', { count: _matcherTable.length })
  } catch (err) {
    logger.warn('perceptionDispatcher: matcher table reload failed', { error: err.message })
  }
}

function _testRow(row, event) {
  if (row.minConfidence != null && (event.confidence || 0) < row.minConfidence) return false
  if (row.regex && row.regex.test(event._lc_kind || event.kind || '')) return true
  if (row.dataSubstrs && row.dataSubstrs.length > 0) {
    const dataStr = event._lc_data_str || JSON.stringify(event.data || {}).toLowerCase()
    if (row.dataSubstrs.some(s => dataStr.includes(s.toLowerCase()))) return true
  }
  return false
}

async function _executeAction(row, event) {
  if (row.shadow) {
    logger.info('perceptionDispatcher: SHADOW (would dispatch)', {
      domain: row.domain, action: row.actionKind, source: event.source, kind: event.kind,
    })
    return
  }
  switch (row.actionKind) {
    case 'status_board_p1': {
      const name = (row.actionPayload.name_template || 'auto: {source}/{kind}')
        .replace('{source}', event.source).replace('{kind}', event.kind)
      const existing = await db`SELECT id FROM status_board WHERE name = ${name} AND archived_at IS NULL LIMIT 1`
      if (existing.length === 0) {
        await db`INSERT INTO status_board (name, entity_type, status, priority, next_action, next_action_by, source, context)
                 VALUES (${name}, 'infrastructure', 'investigating', 1,
                         ${row.actionPayload.next_action || 'Investigate'}, 'ecodiaos', 'perception_dispatcher',
                         ${JSON.stringify({ event_source: event.source, event_kind: event.kind, confidence: event.confidence }).slice(0, 4000)})`
      }
      break
    }
    case 'republish': {
      // Templated query + republish kind
      try {
        const rows = row.actionPayload.query
          ? await db.unsafe(row.actionPayload.query)
          : []
        await perceptionBus.publish({
          source: 'perception_dispatcher',
          kind: row.actionPayload.kind,
          data: { trigger_event: `${event.source}/${event.kind}`, rows },
          confidence: 0.8,
        })
      } catch (err) {
        logger.warn('perceptionDispatcher: republish action failed', { error: err.message, domain: row.domain })
      }
      break
    }
    case 'webhook':
    case 'sms_tate':
      logger.warn('perceptionDispatcher: action not implemented', { actionKind: row.actionKind })
      break
  }
}

function start() {
  if (_started) return
  perceptionBus.subscribe(_onEvent)
  _started = true
  // Initial load + reload every 5min OR on SIGHUP
  _reloadMatcherTable()
  setInterval(_reloadMatcherTable, 5 * 60 * 1000).unref?.()
  process.on('SIGHUP', () => { _reloadMatcherTable() })
  logger.info('perceptionDispatcher: started (matcher-table mode)')
}
```

## Trade-offs
- Loses bespoke per-matcher logic (e.g. `task_completion`'s "if next_step matches schedule keyword" — would need a templated-action shape).
- Gains: matcher edits without restart (5min reload OR SIGHUP); shadow mode (Fix 09) becomes a column flip; replay-on-register (Fix 10) becomes a column.
- Migration path: keep hardcoded MATCHERS as fallback when table is empty.

## Out-of-scope for this audit
The full implementation is non-trivial and merits its own fork. The migration + skeleton is the value-shipper here.
