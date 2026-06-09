#!/bin/bash
# Precious-work tripwire. The daily precious-loss alarm for a single-SSD machine
# with no Time Machine destination configured. Answers ONE question: is there
# anything precious that exists ONLY on this disk right now?
#
#   - unpushed commits  -> recoverable by `git push` (pushable precious)
#   - uncommitted files -> NOT recoverable by git at all (unprotectable precious)
#   - stashes           -> NOT recoverable by git push (unprotectable precious)
#
# Writes a heartbeat so absence-of-run is itself detectable, prints a report,
# exits 1 if any UNPROTECTABLE (uncommitted/stashed) work exists. Read-only:
# never commits, pushes, or deletes. Per the mac-organisation v2 plan section 7.
set -uo pipefail

ENV_FILE="$HOME/.ecodiaos/env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
CODE_ROOT="${CODE_ROOT:-$HOME/.code}"
STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
mkdir -p "$STATE_ROOT"
HEARTBEAT="$STATE_ROOT/precious-work-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# heartbeat FIRST (dead-man's-switch) - written before any scan can fail
printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HEARTBEAT"

repos_unprotected=0
commits_unpushed=0
files_uncommitted=0
stashes_total=0
report=""

while IFS= read -r gitdir; do
  repo="$(dirname "$gitdir")"
  name="$(basename "$repo")"
  unpushed=$(git -C "$repo" log --branches --not --remotes --oneline 2>/dev/null | wc -l | tr -d ' ')
  dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  stash=$(git -C "$repo" stash list 2>/dev/null | wc -l | tr -d ' ')
  commits_unpushed=$((commits_unpushed + unpushed))
  files_uncommitted=$((files_uncommitted + dirty))
  stashes_total=$((stashes_total + stash))
  if [ "$dirty" != "0" ] || [ "$stash" != "0" ]; then
    repos_unprotected=$((repos_unprotected + 1))
  fi
  if [ "$unpushed" != "0" ] || [ "$dirty" != "0" ] || [ "$stash" != "0" ]; then
    report="${report}  ${name}: unpushed=${unpushed} uncommitted=${dirty} stash=${stash}\n"
  fi
done < <(find "$CODE_ROOT" -maxdepth 3 -name .git -type d 2>/dev/null)

# TM is "configured" only if destinationinfo actually names a destination
# (it exits 0 even when printing "No destinations configured").
if tmutil destinationinfo 2>/dev/null | grep -qE '^(Name|ID)'; then TM_OK=1; else TM_OK=0; fi

# final heartbeat
cat > "$HEARTBEAT" <<EOF
{"last_run":"$TS","status":"ok","repos_with_unprotected_work":$repos_unprotected,"unpushed_commits":$commits_unpushed,"uncommitted_files":$files_uncommitted,"stashes":$stashes_total,"time_machine_configured":$TM_OK}
EOF

echo "Precious-work tripwire ($TS)"
echo "  unpushed commits: $commits_unpushed   uncommitted files: $files_uncommitted   stashes: $stashes_total"
echo "  repos carrying UNPROTECTABLE (uncommitted/stashed) work: $repos_unprotected"
if [ "$TM_OK" = "1" ]; then echo "  Time Machine: configured"; else echo "  Time Machine: NO DESTINATION - zero backup running"; fi
[ -n "$report" ] && printf "Detail:\n%b" "$report"

# alarm if any unprotectable work exists
if [ "$files_uncommitted" != "0" ] || [ "$stashes_total" != "0" ]; then
  echo "ALARM: $files_uncommitted uncommitted + $stashes_total stashed changes exist ONLY on this SSD. git push cannot save these. Commit, or get a backup drive attached."
  exit 1
fi
exit 0
