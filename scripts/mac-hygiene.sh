#!/bin/bash
# mac-hygiene canary - REPORT-ONLY. The standing health check for the Mac
# filing system. It NEVER deletes (armed quarantine/delete is a separate, later,
# clock-gated phase). It keeps the knowledge index fresh, guards against the
# C:-junk host-coupling bug recurring, and REPORTS accumulation so rot cannot
# build up silently. Heartbeat-first so absence-of-run is itself detectable.
# Per mac-organisation v2 plan sections 4-6. Runs via launchd, not the scheduler.
set -uo pipefail
# launchd hands jobs a minimal PATH; node lives in homebrew. Without this the
# index rebuild below silently no-ops (node: command not found).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

ENV_FILE="$HOME/.ecodiaos/env"; [ -f "$ENV_FILE" ] && source "$ENV_FILE"
CODE_ROOT="${CODE_ROOT:-$HOME/.code}"
STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
BACKEND="$CODE_ROOT/ecodiaos/backend"
KI="$BACKEND/knowledge-index"
mkdir -p "$STATE_ROOT"
HB="$STATE_ROOT/hygiene-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. heartbeat FIRST (dead-man's-switch) - written before anything that can throw
printf '{"last_run":"%s","status":"running","mode":"report-only"}\n' "$TS" > "$HB"

alerts=""

# 2. C:-junk regression guard (the recurrence guard for the host-coupling bug)
# match REAL path usage (C:/Users/tjdTa/<path>), not a detection regex; exclude
# the placement hook which legitimately carries the literal to detect it.
cjunk_hooks=$(grep -rIl "C:/Users/tjdTa/" "$HOME/.claude/hooks" --include="*.py" --include="*.sh" --exclude="placement_surface.py" 2>/dev/null | grep -v "/C:/" | wc -l | tr -d ' ')
# prune the heavy dirs but go deep enough to catch C: junk nested inside a repo
# subdir (e.g. ecodiaos/backend/knowledge-index/C: sits at depth 4, the old
# -maxdepth 3 missed it - that is exactly how one hid on 2026-06-09).
cjunk_dirs=$(find "$CODE_ROOT" \( -name node_modules -o -name .git \) -prune -o -name "C:" -type d -print 2>/dev/null | wc -l | tr -d ' ')
[ "$cjunk_hooks" != "0" ] && alerts="${alerts}C:-junk regression: $cjunk_hooks hook(s) re-introduced a Windows path. "
[ "$cjunk_dirs" != "0" ] && alerts="${alerts}$cjunk_dirs literal C: junk dir(s) manufactured under .code. "

# 3. knowledge index freshness (rebuild if stale - safe + idempotent)
index_action="fresh"
if [ -f "$KI/index.sqlite" ]; then
  age_min=$(( ( $(date +%s) - $(stat -f %m "$KI/index.sqlite" 2>/dev/null || echo 0) ) / 60 ))
else
  age_min=99999
fi
if [ "$age_min" -gt 60 ]; then
  ( cd "$KI" && node indexer.js >/dev/null 2>&1 && node embed-pass.js >/dev/null 2>&1 ) && index_action="rebuilt(age ${age_min}m)" || { index_action="rebuild-FAILED"; alerts="${alerts}knowledge index rebuild failed. "; }
fi

# 4. junk REPORT (no deletion) - what a future armed sweep would target
stray_logs=$(find "$BACKEND" -maxdepth 1 -name "*.log" 2>/dev/null | wc -l | tr -d ' ')
dsstore=$(find "$CODE_ROOT" -maxdepth 3 -name ".DS_Store" 2>/dev/null | wc -l | tr -d ' ')
snaps=$(du -sm "$CODE_ROOT/migration-snapshots" 2>/dev/null | cut -f1 || echo 0)
sesslogs=$(du -sm "$HOME/.claude/projects" 2>/dev/null | cut -f1 || echo 0)

# 5. final heartbeat (overwrites the running one)
status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status","mode":"report-only","index":"$index_action",
 "c_junk_hooks":$cjunk_hooks,"c_junk_dirs":$cjunk_dirs,
 "stray_root_logs":$stray_logs,"ds_store":$dsstore,
 "migration_snapshots_mb":$snaps,"session_logs_mb":$sesslogs,
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "mac-hygiene ($TS) mode=report-only status=$status"
echo "  index: $index_action"
echo "  C:-junk guard: hooks=$cjunk_hooks dirs=$cjunk_dirs"
echo "  report (not deleted): stray-root-logs=$stray_logs .DS_Store=$dsstore snapshots=${snaps}MB session-logs=${sesslogs}MB"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
