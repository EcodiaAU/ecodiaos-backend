#!/bin/bash
# knowledge-health canary - the standing integrity check for the retrieval system.
# It MAINTAINS and VERIFIES everything built in the knowledge-architecture overhaul,
# so the system follows itself up instead of depending on conductor discipline:
#   1. index freshness     - rebuild + embed if stale (idempotent, safe)
#   2. retrieval recall     - eval-recall.js must stay at the forensic target (12/12)
#   3. duplication drift    - dedup-scan.js near-dup pairs above the kept baseline
#   4. doctrine triggers    - every patterns/ doc must carry `triggers:` (keyword leg)
# Heartbeat-first (dead-man's-switch). Report + alert only; it never deletes or
# rewrites doctrine. Alerts surface into the NEXT session via the M2
# knowledge-sessionstart hook (the same path the backup alarm rides). Runs via
# launchd (au.ecodia.knowledge-health), NOT the scheduler - local retrieval
# integrity must hold regardless of the conductor being awake.
set -uo pipefail
# launchd hands jobs a minimal PATH; node lives in homebrew. Without this the
# index rebuild + evals silently no-op (node: command not found).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

ENV_FILE="$HOME/.ecodiaos/env"; [ -f "$ENV_FILE" ] && source "$ENV_FILE"
CODE_ROOT="${CODE_ROOT:-$HOME/.code}"
STATE_ROOT="${STATE_ROOT:-$HOME/.local/state/ecodiaos}"
KI="$CODE_ROOT/ecodiaos/backend/knowledge-index"
PATTERNS="$CODE_ROOT/ecodiaos/backend/patterns"
mkdir -p "$STATE_ROOT"

# branch-thrash guard. This script lives in a stable home (~/.ecodiaos/bin), but
# the repo tools it drives can vanish when a sibling worker switches the shared
# working tree to a branch that lacks them. Detect that and ALERT, never silently
# degrade - a silent canary is itself a failure (origin: 2026-06-10 exit-127).
branch="$(git -C "$CODE_ROOT/ecodiaos/backend" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
tools_missing=""
for t in lookup.js eval-recall.js dedup-scan.js indexer.js; do
  [ -f "$KI/$t" ] || tools_missing="${tools_missing}${t} "
done
HB="$STATE_ROOT/knowledge-health-heartbeat.json"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RECALL_TARGET=12
DEDUP_BASELINE=1   # pairs >= 0.90 cosine across doctrine+recipes; the kept,
                   # cross-linked conductor-wake pair. Growth = new duplication.

# 1. heartbeat FIRST (written before anything that can throw)
printf '{"last_run":"%s","status":"running"}\n' "$TS" > "$HB"
alerts=""

# 2. index freshness (rebuild if stale - safe + idempotent)
index_action="fresh"; age_min=99999
[ -f "$KI/index.sqlite" ] && age_min=$(( ( $(date +%s) - $(stat -f %m "$KI/index.sqlite" 2>/dev/null || echo 0) ) / 60 ))
if [ "$age_min" -gt 60 ]; then
  ( cd "$KI" && node indexer.js >/dev/null 2>&1 && node embed-pass.js >/dev/null 2>&1 ) \
    && index_action="rebuilt(age ${age_min}m)" \
    || { index_action="rebuild-FAILED"; alerts="${alerts}index rebuild failed. "; }
fi

# 3. retrieval recall regression (the load-bearing check)
recall="unknown"
if [ -f "$KI/eval-recall.js" ]; then
  recall=$( cd "$KI" && node eval-recall.js 2>/dev/null | grep -oE "recall: [0-9]+/[0-9]+" | head -1 | sed 's/recall: //' )
  got=${recall%/*}; want=${recall#*/}
  if [ -z "$got" ]; then
    alerts="${alerts}recall eval did not run. "
  elif [ "$got" != "$want" ]; then
    alerts="${alerts}RETRIEVAL REGRESSION: recall ${recall} (want ${RECALL_TARGET}/${RECALL_TARGET}) - a load-bearing pattern stopped surfacing. "
  fi
fi

# 4. duplication drift
dedup_pairs=0
if [ -f "$KI/dedup-scan.js" ]; then
  dedup_pairs=$( cd "$KI" && node dedup-scan.js 0.90 2>/dev/null | grep -oE "pairs at cosine >= 0.9: [0-9]+" | grep -oE "[0-9]+$" )
  dedup_pairs=${dedup_pairs:-0}
fi
[ "$dedup_pairs" -gt "$DEDUP_BASELINE" ] && \
  alerts="${alerts}NEW doctrine duplication: $dedup_pairs near-dup pairs at >=0.90 (baseline $DEDUP_BASELINE) - run dedup-scan.js + consolidate. "

# 5. doctrine trigger coverage (every patterns/ doc unfindable on the keyword leg without it)
missing_triggers=0
while IFS= read -r f; do
  head -8 "$f" | grep -q "^triggers:" || missing_triggers=$((missing_triggers+1))
done < <(find "$PATTERNS" -maxdepth 1 -name "*.md" ! -name "INDEX.md" ! -name "README.md" 2>/dev/null)
[ "$missing_triggers" -gt 0 ] && \
  alerts="${alerts}$missing_triggers doctrine doc(s) missing triggers: (author with pattern-codify). "

# 5b. drafts filing hygiene - loose files dumped flat at drafts/ top level.
# 560 accumulated unnoticed before 2026-06-10 because nothing watched it;
# re-filed into topic dirs (scripts/drafts-refile.py). Threshold 15 allows a
# few in-flight files; sustained growth means sessions are dumping flat again.
drafts_loose=$(find "$CODE_ROOT/ecodiaos/backend/drafts" -maxdepth 1 -type f ! -name ".DS_Store" 2>/dev/null | wc -l | tr -d ' ')
[ "${drafts_loose:-0}" -gt 15 ] && \
  alerts="${alerts}DRAFTS FILING DRIFT: $drafts_loose loose files at drafts/ top level (cap 15) - re-file with scripts/drafts-refile.py (topic dirs; binaries to _shots/). "

# 6. enforcement gates still wired (silent unwiring = the enforcement dies quietly)
SETTINGS="$HOME/.claude/settings.json"
gates_unwired=""
for g in knowledge-claim-bind knowledge-sessionstart dispatch-fact-gate placement_surface knowledge-index-refresh; do
  grep -q "$g" "$SETTINGS" 2>/dev/null || gates_unwired="${gates_unwired}${g} "
done
[ -n "$gates_unwired" ] && \
  alerts="${alerts}ENFORCEMENT GATE UNWIRED in settings.json: ${gates_unwired}- re-register or the enforcement is silently dead. "

# 7. branch-thrash alert (the repo tools vanished from the checked-out branch)
[ -n "$tools_missing" ] && \
  alerts="${alerts}BRANCH-THRASH: knowledge-index tools absent on branch '${branch}' (${tools_missing}) - the maintenance layer is degraded. Restore the files or switch the working tree to a branch that has them. "

# 8. final heartbeat
status="ok"; [ -n "$alerts" ] && status="alert"
cat > "$HB" <<EOF
{"last_run":"$TS","status":"$status","recall":"$recall","recall_target":$RECALL_TARGET,
 "dedup_pairs":$dedup_pairs,"dedup_baseline":$DEDUP_BASELINE,
 "doctrine_missing_triggers":$missing_triggers,"drafts_loose":${drafts_loose:-0},"index":"$index_action",
 "branch":"$branch","tools_missing":"$(printf '%s' "$tools_missing" | sed 's/ *$//')",
 "gates_unwired":"$(printf '%s' "$gates_unwired" | sed 's/ *$//')",
 "alerts":"$(printf '%s' "$alerts" | sed 's/"/\\"/g')"}
EOF

echo "knowledge-health ($TS) status=$status recall=$recall dedup=$dedup_pairs missing_triggers=$missing_triggers gates=$([ -z "$gates_unwired" ] && echo wired || echo UNWIRED) branch=$branch index=$index_action"
[ -n "$alerts" ] && echo "  ALERTS: $alerts"
exit 0
