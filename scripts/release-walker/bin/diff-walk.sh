#!/usr/bin/env bash
# diff-walk.sh - the `/diff-walk <app>` entrypoint.
# Per ARCHITECTURE.md Section 6: run impact-graph against the app's diff,
# then run release-walk.sh with WALKER_FLOW_FILTER set to the impacted
# flow IDs. If the impact graph decides "full", drop the filter and run
# the full walk.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

source "$HERE/spec-registry.sh"

# Per-app repo path. The walker keeps this map alongside the spec
# registry; for three-native apps the diff is taken against the platform
# repo (locals-android for now; Phase 2C will add locals-ios).
resolve_repo_path() {
  app="$1"
  case "$app" in
    locals)    echo /Users/ecodia/.code/locals-android ;;
    coexist)   echo /Users/ecodia/.code/coexist ;;
    glovebox)  echo /Users/ecodia/.code/glovebox-android ;;
    goodreach) echo /Users/ecodia/.code/goodreach-mobile ;;
    *) echo "FATAL: no repo registered for app '$app'" >&2; return 1 ;;
  esac
}

APP=""
PLATFORM="android"
BASE="HEAD~1"

while [ $# -gt 0 ]; do
  case "$1" in
    --vs=*|--base=*) BASE="${1#*=}" ;;
    --platform=*)    PLATFORM="${1#--platform=}" ;;
    --*)             echo "unknown flag: $1" >&2; exit 2 ;;
    *)               [ -z "$APP" ] && APP="$1" || { echo "extra arg: $1" >&2; exit 2; } ;;
  esac
  shift
done

[ -z "$APP" ] && { echo "usage: diff-walk.sh <app> [--vs=HEAD~1|WORK|<sha>] [--platform=android|ios|both]" >&2; exit 2; }

SPEC_PATH="$(resolve_spec_path "$APP")"
REPO_PATH="$(resolve_repo_path "$APP")"

# Run impact-graph, capture JSON.
IMPACT_JSON=$(python3 "$ROOT/lib/impact-graph.py" \
  --app "$APP" --base "$BASE" --spec "$SPEC_PATH" --repo "$REPO_PATH")

DECISION=$(echo "$IMPACT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['decision'])")
REASON=$(echo "$IMPACT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['decision_reason'])")
N_CHANGED=$(echo "$IMPACT_JSON" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['changed_files']))")
FLOW_LIST=$(echo "$IMPACT_JSON" | python3 -c "import sys,json;print(' '.join(json.load(sys.stdin)['impacted_flows']))")

echo "[diff-walk] app=$APP base=$BASE platform=$PLATFORM"
echo "[diff-walk] changed files: $N_CHANGED"
echo "[diff-walk] decision: $DECISION ($REASON)"
echo "[diff-walk] impacted flows: ${FLOW_LIST:-<none>}"

case "$DECISION" in
  empty)
    echo "[diff-walk] nothing to walk; exiting GREEN"
    exit 0
    ;;
  full)
    echo "[diff-walk] running FULL walk (no flow filter)"
    exec "$ROOT/bin/release-walk.sh" "$APP" --platform="$PLATFORM"
    ;;
  diff)
    export WALKER_FLOW_FILTER="$FLOW_LIST"
    echo "[diff-walk] running DIFF walk (WALKER_FLOW_FILTER='$FLOW_LIST')"
    exec "$ROOT/bin/release-walk.sh" "$APP" --platform="$PLATFORM"
    ;;
  *) echo "[diff-walk] unknown decision '$DECISION'; exiting 2" >&2; exit 2 ;;
esac
