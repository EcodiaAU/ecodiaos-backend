#!/usr/bin/env bash
# enumerate-android-native.sh - Phase 2A spec-driven multi-surface walk.
# For each android flow in spec.flows[], iterates walks_surfaces[], using
# each surface's enter_via to drive nav. Per-surface artifacts go to
# $RUN_DIR/<flow-id>/<surface-id>/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$ROOT/lib/nav-android.sh"
source "$ROOT/lib/state-android.sh"
source "$ROOT/lib/probes-android.sh"

SERIAL="$(cat "$RUN_DIR/serial.txt")"
PARSED="$RUN_DIR/spec.parsed.json"
python3 "$HERE/parse-spec.py" "$SPEC_PATH" android > "$PARSED"

# Matrix cell context (optional). When release-walk.sh runs a cell, the
# cell's app-scope state (permissions) must re-apply after every pm clear;
# WALKER_CELL_JSON / WALKER_PERM_MAP_JSON carry it (STATE-MATRIX.md S3).
CELL_JSON="${WALKER_CELL_JSON:-}"
PERM_MAP_JSON="${WALKER_PERM_MAP_JSON:-{\}}"

APP_PACKAGE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['android_package'])" "$PARSED")
APP_LAUNCH_ACTIVITY=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('android_launch_activity') or '')" "$PARSED")
echo "$APP_PACKAGE" > "$RUN_DIR/app_package.txt"

FLOW_IDS=$(python3 -c "import json,sys; print(' '.join(f['id'] for f in json.load(open(sys.argv[1]))['flows']))" "$PARSED")

# Optional flow filter set by diff-walk.sh. When present, restrict to flow
# IDs in WALKER_FLOW_FILTER (space-separated) that also exist in the spec.
if [ -n "${WALKER_FLOW_FILTER:-}" ]; then
  FILTERED=""
  for fid in $FLOW_IDS; do
    for want in $WALKER_FLOW_FILTER; do
      [ "$fid" = "$want" ] && FILTERED="$FILTERED $fid"
    done
  done
  FLOW_IDS="${FILTERED# }"
  echo "[enumerate-android] WALKER_FLOW_FILTER applied"
fi

echo "[enumerate-android] flows: $FLOW_IDS"

for FLOW_ID in $FLOW_IDS; do
  echo "[enumerate-android] === flow: $FLOW_ID ==="
  FLOW_DIR="$RUN_DIR/$FLOW_ID"
  mkdir -p "$FLOW_DIR"

  SURFACE_IDS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); flow=[f for f in d['flows'] if f['id']==sys.argv[2]][0]; print(' '.join(flow['walks_surfaces']))" "$PARSED" "$FLOW_ID")

  PREV_SURFACE_DIR=""
  FLOW_SUCCESS=true
  for SURFACE_ID in $SURFACE_IDS; do
    SURFACE_DIR="$FLOW_DIR/$SURFACE_ID"
    mkdir -p "$SURFACE_DIR"

    ENTER_VIA=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['surfaces'][sys.argv[2]].get('enter_via') or '')" "$PARSED" "$SURFACE_ID")
    LANDING_CLEAR=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('1' if d['surfaces'][sys.argv[2]].get('landing_after_clear') else '0')" "$PARSED" "$SURFACE_ID")

    echo "[enumerate-android] -> surface=$SURFACE_ID enter_via=$ENTER_VIA"

    case "$ENTER_VIA" in
      launch)
        adb -s "$SERIAL" shell am force-stop "$APP_PACKAGE" || true
        # data_state=returning preserves app data; every other case is the
        # established cold_clear behaviour.
        DATA_STATE=""
        [ -n "$CELL_JSON" ] && DATA_STATE="$(_cell_get "$CELL_JSON" data_state)"
        if [ "$DATA_STATE" != "returning" ]; then
          adb -s "$SERIAL" shell pm clear "$APP_PACKAGE" >/dev/null 2>&1 || true
        fi
        # App-scope state re-applies after the clear (pm clear resets grants).
        if [ -n "$CELL_JSON" ]; then
          state_android_apply_app "$SERIAL" "$APP_PACKAGE" "$CELL_JSON" "$PERM_MAP_JSON" "$RUN_DIR/state-applied.json"
        fi
        sleep 1
        if [ -n "$APP_LAUNCH_ACTIVITY" ]; then
          adb -s "$SERIAL" shell am start -n "$APP_PACKAGE/$APP_LAUNCH_ACTIVITY" >/dev/null
        else
          adb -s "$SERIAL" shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
        fi
        ;;
      tap_text:*)
        TARGET="${ENTER_VIA#tap_text:}"
        if [ -z "$PREV_SURFACE_DIR" ]; then
          echo "[enumerate-android] FAIL: tap_text requires a prior surface" >&2
          FLOW_SUCCESS=false; break
        fi
        # Tap is sourced from the PRIOR surface's hierarchy.
        if ! nav_tap_text "$SERIAL" "$PREV_SURFACE_DIR/hierarchy.xml" "$TARGET"; then
          echo "[enumerate-android] FAIL: tap_text '$TARGET' did not resolve in prior hierarchy" >&2
          FLOW_SUCCESS=false; break
        fi
        ;;
      tap_coord:*)
        # Capacitor/WebView inputs need a real touch event; uiautomator
        # bounds resolve to the WebView outer node. Coords can be raw px
        # ("540,1200") or percentages ("50%,45%").
        SPEC="${ENTER_VIA#tap_coord:}"
        nav_tap_coord "$SERIAL" "$SPEC"
        ;;
      swipe:*)
        DIR="${ENTER_VIA#swipe:}"
        nav_swipe "$SERIAL" "$DIR"
        ;;
      scroll_tap:*)
        TARGET="${ENTER_VIA#scroll_tap:}"
        if ! nav_scroll_tap "$SERIAL" "$SURFACE_DIR" "$TARGET" 5; then
          echo "[enumerate-android] FAIL: scroll_tap '$TARGET' did not resolve" >&2
          FLOW_SUCCESS=false; break
        fi
        ;;
      back)
        nav_back "$SERIAL"
        ;;
      "")
        echo "[enumerate-android] FAIL: surface '$SURFACE_ID' has no enter_via" >&2
        FLOW_SUCCESS=false; break
        ;;
      *)
        echo "[enumerate-android] FAIL: unknown enter_via '$ENTER_VIA'" >&2
        FLOW_SUCCESS=false; break
        ;;
    esac

    # Settle on pixel substrate (per compose-accessibility-tree-fills doctrine).
    if ! nav_settle "$SERIAL" "$SURFACE_DIR" 16; then
      echo "[enumerate-android] WARN: $SURFACE_ID did not settle within cap" >&2
    fi

    # Capture artifacts.
    "$HERE/capture.sh" "$SERIAL" "$SURFACE_DIR" "$SURFACE_ID"
    # Persist signature for D2 cross-surface diff.
    nav_hierarchy_signature "$SURFACE_DIR/hierarchy.xml" > "$SURFACE_DIR/signature.txt"

    # Process-state probe for D11.
    PID=$(adb -s "$SERIAL" shell pidof "$APP_PACKAGE" 2>/dev/null | tr -d '\r' || true)
    echo "$PID" > "$SURFACE_DIR/pidof.txt"

    PREV_SURFACE_DIR="$SURFACE_DIR"
  done

  if [ "$FLOW_SUCCESS" = true ]; then
    # Forms first (they need the live end-of-flow surface), then
    # persistence probes (they kill the app). D6/D4 judge the artifacts.
    FORM_IDS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); flow=[f for f in d['flows'] if f['id']==sys.argv[2]][0]; print(' '.join(flow.get('runs_forms') or []))" "$PARSED" "$FLOW_ID")
    for FORM_ID in $FORM_IDS; do
      probe_run_form "$SERIAL" "$PARSED" "$FORM_ID" "$FLOW_DIR" "$HERE/capture.sh" || \
        echo "[enumerate-android] WARN: form '$FORM_ID' runner errored" >&2
    done

    probe_persistence_for_flow "$SERIAL" "$APP_PACKAGE" "$APP_LAUNCH_ACTIVITY" \
      "$PARSED" "$FLOW_ID" "$FLOW_DIR" "$HERE/capture.sh" || \
      echo "[enumerate-android] WARN: persistence probe errored" >&2

    echo "ok" > "$FLOW_DIR/status.txt"
  else
    echo "nav_failed" > "$FLOW_DIR/status.txt"
  fi
done

echo "[enumerate-android] done"
