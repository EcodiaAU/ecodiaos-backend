#!/bin/bash
# mac.where - a GENERATED, never-stale map of where things live on this Mac.
# Derives entirely from the canonical sources (the ~/.ecodiaos/env resolver, the
# live ~/.code tree, live du sizes) so it cannot disagree with reality. Answers
# "where does X live" without a hand-maintained doc that drifts.
# Usage: mac-where.sh            (full map)
#        mac-where.sh <filter>   (grep the map)
set -uo pipefail
ENV_FILE="$HOME/.ecodiaos/env"; [ -f "$ENV_FILE" ] && source "$ENV_FILE"
CODE_ROOT="${CODE_ROOT:-$HOME/.code}"
FILTER="${1:-}"

emit() {
  echo "# mac.where (generated $(date -u +%Y-%m-%dT%H:%MZ)) - derived, not authored"
  echo
  echo "## canonical homes (class -> path, live size)"
  printf "  %-26s %-46s %s\n" "code (precious)"       "$CODE_ROOT"                          "$(du -sh "$CODE_ROOT" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "secrets (FROZEN)"      "${CREDS_DIR:-$HOME/PRIVATE/ecodia-creds}" "$(du -sh "${CREDS_DIR:-$HOME/PRIVATE/ecodia-creds}" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "runtime (FROZEN)"      "$HOME/.ecodiaos"                     "$(du -sh "$HOME/.ecodiaos" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "config"                "${CONFIG_ROOT:-$HOME/.config/ecodiaos}" "$(du -sh "${CONFIG_ROOT:-$HOME/.config/ecodiaos}" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "state (rotatable)"     "${STATE_ROOT:-$HOME/.local/state/ecodiaos}" "$(du -sh "${STATE_ROOT:-$HOME/.local/state/ecodiaos}" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "data + archive"        "${DATA_ROOT:-$HOME/.local/share/ecodiaos}" "$(du -sh "${DATA_ROOT:-$HOME/.local/share/ecodiaos}" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "cache (regenerable)"   "${CACHE_ROOT:-$HOME/.cache/ecodiaos}" "$(du -sh "${CACHE_ROOT:-$HOME/.cache/ecodiaos}" 2>/dev/null | cut -f1)"
  printf "  %-26s %-46s %s\n" "logs"                  "${LOG_ROOT:-$HOME/Library/Logs/ecodiaos}" "$(du -sh "${LOG_ROOT:-$HOME/Library/Logs/ecodiaos}" 2>/dev/null | cut -f1)"
  echo
  echo "## FROZEN - never move (silent-failure on relocation)"
  echo "  $HOME/PRIVATE/ecodia-creds | $HOME/.ecodiaos/coordination | $CODE_ROOT/eos-laptop-agent"
  echo "  $CODE_ROOT/ecodiaos/backend/knowledge-index/index.sqlite | .../codebase-manifest/manifest.json"
  echo "  $HOME/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory | $HOME/.claude/hooks/"
  echo
  echo "## repos in ~/.code (kind derived live)"
  for d in "$CODE_ROOT"/*/; do
    d="${d%/}"; n="$(basename "$d")"
    if [ -d "$d/.git" ]; then kind="repo"; elif ls "$d"/*/.git >/dev/null 2>&1; then kind="container"; else kind="dir"; fi
    printf "  %-28s %s\n" "$n" "$kind"
  done
  echo
  echo "## doctrine + knowledge -> query: knowledge.lookup \"<need>\"  (categories: doctrine recipes reference memory identity secrets workbench)"
  echo "## full scheme + filing rule: docs/reference/mac-canonical-homes.md ; CLAUDE.md 'WHERE THINGS GO'"
}

if [ -n "$FILTER" ]; then emit | grep -i -- "$FILTER"; else emit; fi
