#!/usr/bin/env bash
# enumerate-ios-native.sh - Phase 2C spec-driven multi-surface walk on iOS.
# Mirrors enumerate-android-native.sh but uses idb / simctl primitives.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$ROOT/lib/nav-ios.sh"

UDID="$(cat "$RUN_DIR/udid.txt")"
PARSED="$RUN_DIR/spec.parsed.json"

# Shared parser, iOS platform view (persistence/forms come along for the
# Tier-1.5 iOS probes).
python3 "$HERE/parse-spec.py" "$SPEC_PATH" ios > "$PARSED"

BUNDLE_ID=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['ios_bundle_id'])" "$PARSED")
echo "$BUNDLE_ID" > "$RUN_DIR/app_package.txt"

FLOW_IDS=$(python3 -c "import json,sys; print(' '.join(f['id'] for f in json.load(open(sys.argv[1]))['flows']))" "$PARSED")
if [ -n "${WALKER_FLOW_FILTER:-}" ]; then
  FILTERED=""
  for fid in $FLOW_IDS; do
    for want in $WALKER_FLOW_FILTER; do
      [ "$fid" = "$want" ] && FILTERED="$FILTERED $fid"
    done
  done
  FLOW_IDS="${FILTERED# }"
  echo "[enumerate-ios] WALKER_FLOW_FILTER applied"
fi
echo "[enumerate-ios] flows: $FLOW_IDS"

for FLOW_ID in $FLOW_IDS; do
  echo "[enumerate-ios] === flow: $FLOW_ID ==="
  FLOW_DIR="$RUN_DIR/$FLOW_ID"
  mkdir -p "$FLOW_DIR"
  SURFACE_IDS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); flow=[f for f in d['flows'] if f['id']==sys.argv[2]][0]; print(' '.join(flow['walks_surfaces']))" "$PARSED" "$FLOW_ID")

  PREV_SURFACE_DIR=""
  for SURFACE_ID in $SURFACE_IDS; do
    SURFACE_DIR="$FLOW_DIR/$SURFACE_ID"
    mkdir -p "$SURFACE_DIR"
    ENTER_VIA=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['surfaces'][sys.argv[2]].get('enter_via') or '')" "$PARSED" "$SURFACE_ID")
    echo "[enumerate-ios] -> surface=$SURFACE_ID enter_via=$ENTER_VIA"

    case "$ENTER_VIA" in
      launch)
        xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
        sleep 1
        xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
        ;;
      tap_text:*)
        TARGET="${ENTER_VIA#tap_text:}"
        if [ -z "$PREV_SURFACE_DIR" ] || [ ! -f "$PREV_SURFACE_DIR/hierarchy.json" ]; then
          echo "[enumerate-ios] FAIL: tap_text requires a prior surface hierarchy.json" >&2
          break
        fi
        if ! nav_ios_tap_text "$UDID" "$PREV_SURFACE_DIR/hierarchy.json" "$TARGET"; then
          echo "[enumerate-ios] FAIL: tap_text '$TARGET' did not resolve" >&2
          break
        fi
        ;;
      tap_coord:*)
        nav_ios_tap_coord "$UDID" "${ENTER_VIA#tap_coord:}"
        ;;
      swipe:*)
        nav_ios_swipe "$UDID" "${ENTER_VIA#swipe:}"
        ;;
      *)
        echo "[enumerate-ios] FAIL: unknown enter_via '$ENTER_VIA'" >&2; break ;;
    esac

    nav_ios_settle "$UDID" "$SURFACE_DIR" 12 || true
    "$HERE/capture-ios.sh" "$UDID" "$SURFACE_DIR" "$SURFACE_ID"
    nav_ios_hierarchy_signature "$SURFACE_DIR/hierarchy.json" > "$SURFACE_DIR/signature.txt"

    # iOS process-alive probe for D11: the hierarchy must contain an
    # AXApplication node whose AXLabel matches the app's display name.
    # If describe-all returned an empty list or only SpringBoard chrome,
    # the app is crashed or backgrounded.
    APP_TITLE=$(python3 - "$SURFACE_DIR/hierarchy.json" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        tree = json.load(f)
except Exception:
    print(''); sys.exit(0)
for n in tree if isinstance(tree, list) else []:
    if isinstance(n, dict) and n.get('role') == 'AXApplication':
        print(n.get('AXLabel') or '')
        sys.exit(0)
print('')
PY
)
    echo "${APP_TITLE:+alive:$APP_TITLE}" > "$SURFACE_DIR/pidof.txt"
    PREV_SURFACE_DIR="$SURFACE_DIR"
  done
done

echo "[enumerate-ios] done"
