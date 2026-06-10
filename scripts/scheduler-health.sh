#!/usr/bin/env bash
# scheduler-health canary - the standing integrity check for the scheduler
# department (os_scheduled_tasks + the dispatch path). Second instance of the
# REPORT-canary template after knowledge-health; same spine: heartbeat-first,
# report + alert only, surfaces into the NEXT session via the M2
# knowledge-sessionstart hook, dead-man's-switch on its own staleness.
# Checks (all queried DIRECT from Postgres - the MCP schedule_list hides rows):
#   1. dupe-guard index present  - uq_os_scheduled_tasks_active_cron_name must exist
#   2. duplicate active crons    - structurally 0 with the guard; >0 = guard dropped
#   3. live failed rows          - 0 is the clean state; growth = signal_done gap
#                                  recurrence or a real failure needing triage
#   4. zombie leases             - status='running' leased >6h ago (the mass
#                                  stale-lease producer behind the 06-03/06-07 events)
#   5. overdue actives           - active cron with next_run_at >2h in the past
#                                  while the poller claims green = dispatch dead
#   6. fire liveness             - hours since ANY cron last fired (hourly
#                                  gmail-inbox-poll makes >3h a dead poller)
# Runs via launchd (au.ecodia.scheduler-health), NOT the scheduler itself - a
# health check must not depend on the system it checks. Needs only system
# binaries (curl, python3, awk); no repo working-tree dependency at all.
set -uo pipefail

STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/scheduler-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROJECT_REF="nxmtfzofemtrlezlyhcj"

# 1. heartbeat FIRST (written before anything that can throw)
printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

# PAT from the local cred store (never via MCP creds.* - read-denied)
PAT="$(grep '^SUPABASE_ACCESS_TOKEN=' "$HOME/PRIVATE/ecodia-creds/supabase.env" 2>/dev/null | cut -d= -f2-)"
if [ -z "$PAT" ]; then
  cat > "$HB" <<EOF
{"last_run":"$TS","status":"alert","alerts":"supabase PAT unreadable at ~/PRIVATE/ecodia-creds/supabase.env - scheduler health UNKNOWN. "}
EOF
  echo "scheduler-health ($TS) status=alert PAT-unreadable"; exit 0
fi

SQL="SELECT
 (SELECT COUNT(*) FROM (SELECT name FROM os_scheduled_tasks WHERE type='cron' AND status='active' AND archived_at IS NULL GROUP BY name HAVING COUNT(*)>1) d) AS dup_names,
 (SELECT COUNT(*) FROM os_scheduled_tasks WHERE status='failed' AND archived_at IS NULL) AS failed_live,
 (SELECT COUNT(*) FROM os_scheduled_tasks WHERE status='running' AND leased_at < now() - interval '6 hours') AS zombie_leases,
 (SELECT COUNT(*) FROM os_scheduled_tasks WHERE type='cron' AND status='active' AND archived_at IS NULL AND next_run_at < now() - interval '2 hours') AS overdue_actives,
 (SELECT ROUND(COALESCE(EXTRACT(EPOCH FROM (now() - MAX(last_run_at)))/3600, 9999)::numeric, 1) FROM os_scheduled_tasks WHERE type='cron') AS hours_since_fire,
 (SELECT COUNT(*) FROM pg_indexes WHERE indexname='uq_os_scheduled_tasks_active_cron_name') AS guard_index,
 (SELECT COUNT(*) FROM os_scheduled_tasks WHERE retry_count >= 2 AND updated_at > now() - interval '24 hours' AND status NOT IN ('completed','cancelled') AND archived_at IS NULL AND last_error NOT ILIKE '%AllAccountsCappedError%') AS retry_churn,
 (SELECT COUNT(*) FROM os_scheduled_tasks WHERE retry_count >= 2 AND updated_at > now() - interval '24 hours' AND status NOT IN ('completed','cancelled') AND archived_at IS NULL AND last_error ILIKE '%AllAccountsCappedError%') AS capped_churn"

RESP="$(curl -sS --max-time 30 -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$SQL")" 2>&1)"

read -r dup_names failed_live zombie_leases overdue_actives hours_since_fire guard_index retry_churn capped_churn <<< "$(python3 - "$RESP" <<'PYEOF'
import json, sys
try:
    rows = json.loads(sys.argv[1])
    r = rows[0] if isinstance(rows, list) and rows else {}
    print(r.get("dup_names", -1), r.get("failed_live", -1), r.get("zombie_leases", -1),
          r.get("overdue_actives", -1), r.get("hours_since_fire", -1), r.get("guard_index", -1),
          r.get("retry_churn", -1), r.get("capped_churn", -1))
except Exception:
    print("-1 -1 -1 -1 -1 -1 -1 -1")
PYEOF
)"

if [ "$dup_names" = "-1" ]; then
  alerts="${alerts}scheduler substrate query FAILED (Management API unreachable or bad response) - scheduler health UNKNOWN. "
else
  [ "$guard_index" != "1" ] && alerts="${alerts}DUPE GUARD DROPPED: unique index uq_os_scheduled_tasks_active_cron_name is missing - recreate it or installs silently accrete duplicates again. "
  [ "$dup_names" != "0" ] && alerts="${alerts}$dup_names duplicate active cron name(s) - dedupe keep-newest per patterns/cron-fleet-dedupe-keep-newest-active-per-name-2026-06-09.md. "
  [ "$failed_live" != "0" ] && alerts="${alerts}$failed_live live failed row(s) in os_scheduled_tasks - triage with intent (completion-report-in-last_error means the signal_done gap, not a real failure). "
  [ "$zombie_leases" != "0" ] && alerts="${alerts}$zombie_leases zombie lease(s) (running, leased >6h) - the stale-lease mass-failure producer; clear leases, do not blind-reset. "
  [ "$overdue_actives" != "0" ] && alerts="${alerts}$overdue_actives active cron(s) overdue >2h past next_run_at - the dispatch path or poller is degraded. "
  awk "BEGIN{exit !($hours_since_fire > 3)}" && alerts="${alerts}NO cron has fired in ${hours_since_fire}h (hourly gmail-inbox-poll should fire every hour) - the poller is dead or the laptop-agent is down. "
  [ "$retry_churn" -gt 3 ] 2>/dev/null && alerts="${alerts}$retry_churn task(s) on retry>=2 in 24h with NON-cap errors - the spawn-but-never-bind shape; probe coord.signal_bound BEFORE rows exhaust to failed. "
  [ "$capped_churn" -gt 8 ] 2>/dev/null && alerts="${alerts}$capped_churn task(s) deferring on AllAccountsCappedError in 24h - usage caps exhausted across accounts; self-heals at cap reset, but a backlog this size will thundering-herd when it clears. "
fi

status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status",
 "dup_names":${dup_names},"failed_live":${failed_live},"zombie_leases":${zombie_leases},
 "overdue_actives":${overdue_actives},"hours_since_fire":${hours_since_fire},"guard_index":${guard_index},"retry_churn":${retry_churn},"capped_churn":${capped_churn},
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "scheduler-health ($TS) status=$status dup=$dup_names failed=$failed_live zombies=$zombie_leases overdue=$overdue_actives last_fire=${hours_since_fire}h guard=$guard_index retry_churn=$retry_churn capped_churn=$capped_churn"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
