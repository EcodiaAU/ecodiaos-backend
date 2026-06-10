#!/usr/bin/env bash
# code-health canary - standing integrity check for the code department
# (vercel deploys + backend git posture + status_board project rows). Sixth
# instance of the REPORT-canary template (knowledge, scheduler, finance,
# clients, comms, code). Same spine: heartbeat-first, report + alert only,
# surfaces at session start via the M2 generic heartbeat reader, dead-man's-
# switch on its own staleness.
# Checks:
#   1. vercel_latest_err  - per project, latest production deploy is ERROR
#                           (old ERRORs are fine; the LATEST state is what
#                           matters - prod is broken if latest is ERROR)
#   2. backend_unpushed   - commits on the backend repo not reachable from any
#                           remote (truly unpushed across all branches) - higher
#                           threshold than precious-work because this is the
#                           single-repo finer-grained signal
#   3. backend_stashes    - stash count on the backend repo
#   4. sb_project_stale   - status_board entity_type project|thread priority<=2
#                           last_touched >7d - high-priority code work that
#                           stopped moving
# Runs via launchd (au.ecodia.code-health). System binaries only.
set -uo pipefail

STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/code-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROJECT_REF="nxmtfzofemtrlezlyhcj"
BACKEND_REPO="${BACKEND_REPO:-$HOME/.code/ecodiaos/backend}"

printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

PAT="$(grep '^SUPABASE_ACCESS_TOKEN=' "$HOME/PRIVATE/ecodia-creds/supabase.env" 2>/dev/null | cut -d= -f2-)"
if [ -z "$PAT" ]; then
  cat > "$HB" <<EOF
{"last_run":"$TS","status":"alert","alerts":"supabase PAT unreadable at ~/PRIVATE/ecodia-creds/supabase.env - code health UNKNOWN. "}
EOF
  echo "code-health ($TS) status=alert PAT-unreadable"; exit 0
fi

SQL="WITH latest_prod AS (
  SELECT DISTINCT ON (project_id) project_id, state, git_branch, git_commit_sha, ready_at
  FROM vercel_deployments
  WHERE target='production' AND project_id IS NOT NULL
  ORDER BY project_id, created_at DESC
)
SELECT
 (SELECT COUNT(*) FROM latest_prod WHERE state='ERROR') AS vercel_latest_err,
 (SELECT COUNT(*) FROM status_board WHERE archived_at IS NULL AND entity_type IN ('project','thread') AND priority <= 2 AND last_touched < now() - interval '7 days') AS sb_project_stale"

RESP="$(curl -sS --max-time 30 -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data "$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$SQL")" 2>&1)"

read -r vercel_latest_err sb_project_stale <<< "$(python3 - "$RESP" <<'PYEOF'
import json, sys
try:
    rows = json.loads(sys.argv[1])
    r = rows[0] if isinstance(rows, list) and rows else {}
    print(r.get("vercel_latest_err", -1), r.get("sb_project_stale", -1))
except Exception:
    print("-1 -1")
PYEOF
)"

# Git probes are guarded; canary must not exit non-zero on a missing repo.
backend_unpushed=-1
backend_stashes=-1
if [ -d "$BACKEND_REPO/.git" ]; then
  backend_unpushed="$(cd "$BACKEND_REPO" && git rev-list HEAD --not --remotes 2>/dev/null | wc -l | tr -d ' ')"
  backend_stashes="$(cd "$BACKEND_REPO" && git stash list 2>/dev/null | wc -l | tr -d ' ')"
fi

if [ "$vercel_latest_err" = "-1" ]; then
  alerts="${alerts}code substrate query FAILED (Management API unreachable or bad response) - code health UNKNOWN. "
else
  [ "$vercel_latest_err" -gt 0 ] 2>/dev/null && alerts="${alerts}$vercel_latest_err project(s) whose LATEST production Vercel deploy state is ERROR - prod is broken; check the failing project deploy log and revert or fix. "
  [ "$sb_project_stale" -gt 0 ] 2>/dev/null && alerts="${alerts}$sb_project_stale status_board project/thread row(s) at priority <=2 untouched >7d - high-priority code work that stopped moving; move it or downgrade priority. "
fi

if [ "$backend_unpushed" != "-1" ]; then
  [ "$backend_unpushed" -gt 50 ] 2>/dev/null && alerts="${alerts}$backend_unpushed commits on the backend repo are not reachable from any remote - precious work, single-disk only; push what is safe (precious-work tripwire backs this at a lower threshold across all repos). "
  [ "$backend_stashes" -gt 20 ] 2>/dev/null && alerts="${alerts}$backend_stashes stashes on the backend repo - stashes are the easiest place for in-flight work to be forgotten; drain to commits or drop. "
fi

status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status",
 "vercel_latest_err":${vercel_latest_err},"sb_project_stale":${sb_project_stale},
 "backend_unpushed":${backend_unpushed},"backend_stashes":${backend_stashes},
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "code-health ($TS) status=$status vercel_err=$vercel_latest_err sb_stale=$sb_project_stale unpushed=$backend_unpushed stashes=$backend_stashes"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
