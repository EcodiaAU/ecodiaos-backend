#!/usr/bin/env bash
# comms-health canary - standing integrity check for the comms department
# (email_threads triage + gmail-inbox-poll liveness). Fifth instance of the
# REPORT-canary template (knowledge, scheduler, finance, clients, comms). Same
# spine: heartbeat-first, report + alert only, surfaces at session start via
# the M2 generic heartbeat reader, dead-man's-switch on its own staleness.
# Checks (Postgres DIRECT via the Management API; comms drift = relationships rot):
#   1. untriaged_backlog  - email_threads with triage_status != 'complete' that
#                           arrived >6h ago - the triage pipeline is jammed
#   2. stuck_reply        - threads where we owe a reply (triage_action in
#                           reply/send_reply) and have NOT drafted+sent it after
#                           48h received - the longer it sits the colder
#   3. poll_dead          - hours since gmail-inbox-poll last fired (hourly cron;
#                           >3h = the poller is dead or the laptop-agent is down)
#   4. triage_stuck       - threads with triage_attempts >= 3 and still not
#                           complete - the triager keeps failing on this shape
# GAPS (no queryable substrate today, codified in the pattern, not faked):
#   - outbound send failures (no outbound_sends/gmail_outbound table)
#   - sms delivery failures (no sms_messages table on this substrate)
# Runs via launchd (au.ecodia.comms-health). System binaries only.
set -uo pipefail

STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/comms-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROJECT_REF="nxmtfzofemtrlezlyhcj"

printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

PAT="$(grep '^SUPABASE_ACCESS_TOKEN=' "$HOME/PRIVATE/ecodia-creds/supabase.env" 2>/dev/null | cut -d= -f2-)"
if [ -z "$PAT" ]; then
  cat > "$HB" <<EOF
{"last_run":"$TS","status":"alert","alerts":"supabase PAT unreadable at ~/PRIVATE/ecodia-creds/supabase.env - comms health UNKNOWN. "}
EOF
  echo "comms-health ($TS) status=alert PAT-unreadable"; exit 0
fi

SQL="SELECT
 (SELECT COUNT(*) FROM email_threads WHERE COALESCE(triage_status,'') <> 'complete' AND received_at < now() - interval '6 hours') AS untriaged_backlog,
 (SELECT COUNT(*) FROM email_threads WHERE COALESCE(status,'') NOT IN ('archived','replied') AND COALESCE(triage_action,'') IN ('reply','send_reply') AND COALESCE(draft_gmail_id,'')='' AND received_at < now() - interval '48 hours') AS stuck_reply,
 (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(last_run_at)))/3600, 9999)::int FROM os_scheduled_tasks WHERE name='gmail-inbox-poll') AS poll_hours_since_fire,
 (SELECT COUNT(*) FROM email_threads WHERE COALESCE(triage_attempts,0) >= 3 AND COALESCE(triage_status,'') <> 'complete') AS triage_stuck"

RESP="$(curl -sS --max-time 30 -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$SQL")" 2>&1)"

read -r untriaged_backlog stuck_reply poll_hours_since_fire triage_stuck <<< "$(python3 - "$RESP" <<'PYEOF'
import json, sys
try:
    rows = json.loads(sys.argv[1])
    r = rows[0] if isinstance(rows, list) and rows else {}
    print(r.get("untriaged_backlog", -1), r.get("stuck_reply", -1),
          r.get("poll_hours_since_fire", -1), r.get("triage_stuck", -1))
except Exception:
    print("-1 -1 -1 -1")
PYEOF
)"

if [ "$untriaged_backlog" = "-1" ]; then
  alerts="${alerts}comms substrate query FAILED (Management API unreachable or bad response) - comms health UNKNOWN. "
else
  [ "$untriaged_backlog" -gt 0 ] 2>/dev/null && alerts="${alerts}$untriaged_backlog email thread(s) untriaged >6h after arrival - the triage pipeline is jammed (cron paused, triager dead, or LLM cap); probe gmail-inbox-poll + the triage worker. "
  [ "$stuck_reply" -gt 0 ] 2>/dev/null && alerts="${alerts}$stuck_reply thread(s) owed a reply >48h with no draft sent - the longer this sits the colder the thread; draft + send, or escalate. "
  [ "$poll_hours_since_fire" -gt 3 ] 2>/dev/null && alerts="${alerts}gmail-inbox-poll has not fired in ${poll_hours_since_fire}h (hourly cron) - the poller is dead, the laptop-agent is down, or every gmail-inbox-poll row is paused. "
  [ "$triage_stuck" -gt 0 ] 2>/dev/null && alerts="${alerts}$triage_stuck thread(s) with triage_attempts >= 3 still incomplete - the triager is failing on this shape; read the last triage_summary and fix the prompt. "
fi

status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status",
 "untriaged_backlog":${untriaged_backlog},"stuck_reply":${stuck_reply},
 "poll_hours_since_fire":${poll_hours_since_fire},"triage_stuck":${triage_stuck},
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "comms-health ($TS) status=$status untriaged=$untriaged_backlog stuck_reply=$stuck_reply poll=${poll_hours_since_fire}h triage_stuck=$triage_stuck"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
