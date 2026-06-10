#!/usr/bin/env bash
# clients-health canary - standing integrity check for the clients department
# (status_board client rows + clients CRM table). Fourth instance of the
# REPORT-canary template (knowledge, scheduler, finance, clients). Same spine:
# heartbeat-first, report + alert only, surfaces at session start via the M2
# generic heartbeat reader, dead-man's-switch on its own staleness.
# Checks (Postgres DIRECT via the Management API; a client going quiet IS churn):
#   1. sb_stale_client    - status_board entity_type=client + next_action_by=
#                           ecodiaos + last_touched >7d (we owe an action, we
#                           have not moved it)
#   2. going_quiet        - active client (lead/live/qualified/active) whose
#                           last_contact_at is >21d old (or NULL with a created
#                           date older than 21d, never contacted) - churn risk
#   3. churn_imminent     - active client with last_contact_at >45d - past the
#                           rescuable window; surface for relationship triage
# GAPS (no queryable substrate today, codified in the pattern, not faked):
#   - client app health probes (no client_app_health table)
#   - per-client deliverable SLA breach (no deliverables table)
# Runs via launchd (au.ecodia.clients-health). System binaries only.
set -uo pipefail

STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/clients-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROJECT_REF="nxmtfzofemtrlezlyhcj"

printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

PAT="$(grep '^SUPABASE_ACCESS_TOKEN=' "$HOME/PRIVATE/ecodia-creds/supabase.env" 2>/dev/null | cut -d= -f2-)"
if [ -z "$PAT" ]; then
  cat > "$HB" <<EOF
{"last_run":"$TS","status":"alert","alerts":"supabase PAT unreadable at ~/PRIVATE/ecodia-creds/supabase.env - clients health UNKNOWN. "}
EOF
  echo "clients-health ($TS) status=alert PAT-unreadable"; exit 0
fi

SQL="SELECT
 (SELECT COUNT(*) FROM status_board WHERE archived_at IS NULL AND entity_type='client' AND next_action_by='ecodiaos' AND last_touched < now() - interval '7 days') AS sb_stale_client,
 (SELECT COUNT(*) FROM clients WHERE archived_at IS NULL AND status IN ('lead','live','qualified','active') AND COALESCE(last_contact_at, created_at) < now() - interval '21 days') AS going_quiet,
 (SELECT COUNT(*) FROM clients WHERE archived_at IS NULL AND status IN ('lead','live','qualified','active') AND COALESCE(last_contact_at, created_at) < now() - interval '45 days') AS churn_imminent"

RESP="$(curl -sS --max-time 30 -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$SQL")" 2>&1)"

read -r sb_stale_client going_quiet churn_imminent <<< "$(python3 - "$RESP" <<'PYEOF'
import json, sys
try:
    rows = json.loads(sys.argv[1])
    r = rows[0] if isinstance(rows, list) and rows else {}
    print(r.get("sb_stale_client", -1), r.get("going_quiet", -1), r.get("churn_imminent", -1))
except Exception:
    print("-1 -1 -1")
PYEOF
)"

if [ "$sb_stale_client" = "-1" ]; then
  alerts="${alerts}clients substrate query FAILED (Management API unreachable or bad response) - clients health UNKNOWN. "
else
  [ "$sb_stale_client" -gt 0 ] 2>/dev/null && alerts="${alerts}$sb_stale_client status_board client row(s) owed by ecodiaos untouched >7d - we are the blocker on a client thread we said we would move. "
  [ "$going_quiet" -gt 0 ] 2>/dev/null && alerts="${alerts}$going_quiet active client(s) with no contact >21d - churn risk window; reach out before they go cold. "
  [ "$churn_imminent" -gt 0 ] 2>/dev/null && alerts="${alerts}$churn_imminent active client(s) with no contact >45d - past the rescuable window; relationship triage, then archive if irreparable. "
fi

status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status",
 "sb_stale_client":${sb_stale_client},"going_quiet":${going_quiet},"churn_imminent":${churn_imminent},
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "clients-health ($TS) status=$status sb_stale=$sb_stale_client going_quiet=$going_quiet churn_imminent=$churn_imminent"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
