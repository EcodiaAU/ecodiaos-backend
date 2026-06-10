#!/usr/bin/env bash
# finance-health canary - standing integrity check for the finance department
# (bookkeeping ledger + staged pipeline + recurring billing). Third instance of
# the REPORT-canary template (knowledge, scheduler, finance). Same spine:
# heartbeat-first, report + alert only, surfaces at session start via the M2
# generic heartbeat reader, dead-man's-switch on its own staleness.
# Checks (Postgres DIRECT via the Management API; books must not silently rot):
#   1. staged backlog        - pending rows needing categorise/post decisions
#   2. staged oldest age     - a pending row sitting >7d is a stalled decision
#   3. ingestion liveness    - days since ANY staged row arrived; >5d = the
#                              bank/Stripe feed died silently (cron-silent-fail)
#   4. posted-zero-lines     - posted staged rows whose ledger_tx has NO lines
#                              (the codified silent-post-failure detector)
#   5. unbalanced ledger tx  - SUM(debits) != SUM(credits) breaks double-entry
#   6. billing overdue       - active schedule past next_due_date with no
#                              generation (recurring billing must be substrate-
#                              tracked, and it must FIRE)
#   7. xero sync errors      - staged rows carrying xero_sync_error
# Runs via launchd (au.ecodia.finance-health). System binaries only; no repo
# working-tree dependency.
set -uo pipefail

STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/finance-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROJECT_REF="nxmtfzofemtrlezlyhcj"

printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

PAT="$(grep '^SUPABASE_ACCESS_TOKEN=' "$HOME/PRIVATE/ecodia-creds/supabase.env" 2>/dev/null | cut -d= -f2-)"
if [ -z "$PAT" ]; then
  cat > "$HB" <<EOF
{"last_run":"$TS","status":"alert","alerts":"supabase PAT unreadable at ~/PRIVATE/ecodia-creds/supabase.env - finance health UNKNOWN. "}
EOF
  echo "finance-health ($TS) status=alert PAT-unreadable"; exit 0
fi

SQL="SELECT
 (SELECT COUNT(*) FROM staged_transactions WHERE status='pending') AS staged_pending,
 (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - created_at))/86400), 0)::int FROM staged_transactions WHERE status='pending') AS oldest_pending_days,
 (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(created_at)))/86400, 999)::int FROM staged_transactions) AS ingest_stale_days,
 (SELECT COUNT(*) FROM staged_transactions st WHERE st.status='posted' AND st.ledger_tx_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_lines ll WHERE ll.tx_id = st.ledger_tx_id)) AS posted_zero_lines,
 (SELECT COUNT(*) FROM (SELECT tx_id FROM ledger_lines GROUP BY tx_id HAVING SUM(COALESCE(debit_cents,0)) <> SUM(COALESCE(credit_cents,0))) u) AS unbalanced_tx,
 (SELECT COUNT(*) FROM client_billing_schedules WHERE status='active' AND archived_at IS NULL AND next_due_date < CURRENT_DATE AND (last_generated IS NULL OR last_generated < next_due_date)) AS billing_overdue,
 (SELECT COUNT(*) FROM staged_transactions WHERE xero_sync_error IS NOT NULL AND xero_sync_error <> '') AS xero_errors"

RESP="$(curl -sS --max-time 30 -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$SQL")" 2>&1)"

read -r staged_pending oldest_pending_days ingest_stale_days posted_zero_lines unbalanced_tx billing_overdue xero_errors <<< "$(python3 - "$RESP" <<'PYEOF'
import json, sys
try:
    rows = json.loads(sys.argv[1])
    r = rows[0] if isinstance(rows, list) and rows else {}
    print(r.get("staged_pending", -1), r.get("oldest_pending_days", -1), r.get("ingest_stale_days", -1),
          r.get("posted_zero_lines", -1), r.get("unbalanced_tx", -1), r.get("billing_overdue", -1),
          r.get("xero_errors", -1))
except Exception:
    print("-1 -1 -1 -1 -1 -1 -1")
PYEOF
)"

if [ "$staged_pending" = "-1" ]; then
  alerts="${alerts}finance substrate query FAILED (Management API unreachable or bad response) - finance health UNKNOWN. "
else
  [ "$staged_pending" -gt 25 ] 2>/dev/null && alerts="${alerts}$staged_pending staged transactions pending - the categorise/post backlog is growing (weekly-financial-review cleared 33 on 2026-06-08; do not let it regrow). "
  [ "$oldest_pending_days" -gt 7 ] 2>/dev/null && alerts="${alerts}oldest pending staged row is ${oldest_pending_days}d old - a stalled bookkeeping decision, triage it. "
  [ "$ingest_stale_days" -gt 5 ] 2>/dev/null && alerts="${alerts}NO staged transaction has arrived in ${ingest_stale_days}d - the bank/Stripe ingestion feed died silently (cron-silent-fail family), probe the importer. "
  [ "$posted_zero_lines" != "0" ] && alerts="${alerts}$posted_zero_lines posted staged row(s) whose ledger transaction has ZERO ledger lines - the silent-post-failure; the books are missing entries that claim to be posted. "
  [ "$unbalanced_tx" != "0" ] && alerts="${alerts}$unbalanced_tx ledger transaction(s) where debits != credits - double-entry invariant broken. "
  [ "$billing_overdue" != "0" ] && alerts="${alerts}$billing_overdue active billing schedule(s) past next_due_date with no generation - revenue not invoiced, run the billing generation. "
  [ "$xero_errors" != "0" ] && alerts="${alerts}$xero_errors staged row(s) carrying a xero_sync_error - the Xero mirror is drifting from the local books. "
fi

status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status",
 "staged_pending":${staged_pending},"oldest_pending_days":${oldest_pending_days},"ingest_stale_days":${ingest_stale_days},
 "posted_zero_lines":${posted_zero_lines},"unbalanced_tx":${unbalanced_tx},"billing_overdue":${billing_overdue},"xero_errors":${xero_errors},
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "finance-health ($TS) status=$status pending=$staged_pending oldest=${oldest_pending_days}d ingest=${ingest_stale_days}d zero_lines=$posted_zero_lines unbalanced=$unbalanced_tx billing_overdue=$billing_overdue xero_err=$xero_errors"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
