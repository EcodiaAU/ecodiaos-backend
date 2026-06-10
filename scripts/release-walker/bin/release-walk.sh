#!/usr/bin/env bash
# release-walk.sh - the `/release-walk <app>` entrypoint.
# Per ARCHITECTURE.md Section 3 + STATE-MATRIX.md: resolve spec, boot
# device, walk flows (optionally across the state-matrix cells), run
# detectors, optionally explore, optionally parity-check, write verdict.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
RUNS_DIR="$ROOT/runs"

source "$HERE/spec-registry.sh"
source "$ROOT/lib/state-android.sh"
source "$ROOT/lib/state-ios.sh"

APP=""
PLATFORM="android"
DEPTH="full"
MATRIX=0
CELLS_CAP=""
EXPLORE=0
TAPS=40
PARITY="auto"

while [ $# -gt 0 ]; do
  case "$1" in
    --platform=*) PLATFORM="${1#--platform=}" ;;
    --depth=*)    DEPTH="${1#--depth=}" ;;
    --matrix)     MATRIX=1 ;;
    --cells=*)    CELLS_CAP="${1#--cells=}" ;;
    --explore)    EXPLORE=1 ;;
    --taps=*)     TAPS="${1#--taps=}" ;;
    --parity)     PARITY="on" ;;
    --no-parity)  PARITY="off" ;;
    --*)          echo "unknown flag: $1" >&2; exit 2 ;;
    *)            [ -z "$APP" ] && APP="$1" || { echo "extra arg: $1" >&2; exit 2; } ;;
  esac
  shift
done

[ -z "$APP" ] && { echo "usage: release-walk.sh <app> [--platform=android|ios|both] [--depth=smoke|full] [--matrix] [--cells=N] [--explore] [--taps=N] [--parity|--no-parity]" >&2; exit 2; }

SPEC_PATH="$(resolve_spec_path "$APP")"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${APP}-${PLATFORM}-$$"
RUN_DIR="$RUNS_DIR/$RUN_ID"
mkdir -p "$RUN_DIR"

export RUN_ID RUN_DIR APP PLATFORM SPEC_PATH DEPTH

cat > "$RUN_DIR/manifest.json" <<JSON
{
  "run_id": "$RUN_ID",
  "app": "$APP",
  "platform": "$PLATFORM",
  "depth": "$DEPTH",
  "matrix": $MATRIX,
  "explore": $EXPLORE,
  "spec_path": "$SPEC_PATH",
  "started_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "running"
}
JSON

FINDINGS_FILE="$RUN_DIR/findings.jsonl"
: > "$FINDINGS_FILE"

echo "[release-walk] run_id=$RUN_ID app=$APP platform=$PLATFORM depth=$DEPTH matrix=$MATRIX explore=$EXPLORE"
echo "[release-walk] run dir: $RUN_DIR"
echo "[release-walk] spec:    $SPEC_PATH"

# Reset discipline (STATE-MATRIX.md S3): never leave the shared device
# dark / huge-font / offline for the next run, whatever the exit path.
SERIAL=""
UDID=""
cleanup() {
  [ -n "$SERIAL" ] && state_android_reset "$SERIAL" || true
  [ -n "$UDID" ] && state_ios_reset "$UDID" || true
}
trap cleanup EXIT

run_detectors() {
  rd="$1"
  for det in "$ROOT/detectors"/d*.sh; do
    RUN_DIR="$rd" SPEC_PATH="$SPEC_PATH" bash "$det" || true
  done
}

# Fold one cell's findings into the master file, tagged with its cell id.
aggregate_cell() {
  cell_dir="$1"; flow="$2"; cell_id="$3"
  [ -s "$cell_dir/findings.jsonl" ] || return 0
  jq -c --arg cell "$cell_id" --arg mflow "$flow" '. + {cell: $cell, matrix_flow: $mflow}' \
    "$cell_dir/findings.jsonl" >> "$FINDINGS_FILE"
}

matrix_loop() {
  platform="$1"
  MATRIX_FILE="$RUN_DIR/matrix-$platform.json"
  if [ -n "$CELLS_CAP" ]; then
    python3 "$ROOT/lib/parse-matrix.py" "$SPEC_PATH" "$platform" "--cells=$CELLS_CAP" > "$MATRIX_FILE"
  else
    python3 "$ROOT/lib/parse-matrix.py" "$SPEC_PATH" "$platform" > "$MATRIX_FILE"
  fi
  NFLOWS=$(jq '.flows | length' "$MATRIX_FILE")
  if [ "$NFLOWS" -eq 0 ]; then
    echo "[release-walk] no matrix flows for $platform in spec; falling back to plain walk"
    return 1
  fi
  PERM_MAP=$(jq -c '.permissions' "$MATRIX_FILE")

  TOTAL_CELLS=$(jq '[.flows[].cells | length] | add' "$MATRIX_FILE")
  echo "[release-walk] matrix($platform): $NFLOWS flow(s), $TOTAL_CELLS cell(s)"
  jq -r '.flows[] | select(.dropped_dims | length > 0) | "[release-walk] matrix(\(.flow)): dropped dims \(.dropped_dims | map(.dim + ":" + .reason) | join(", "))"' "$MATRIX_FILE"

  # Cells iterate over fd 3, NOT stdin: adb/simctl calls in the body slurp
  # stdin and silently truncate a piped while-loop to its first iteration
  # (observed live on run 20260610T001125Z: "4 cell(s)" announced, 1 ran).
  CELLS_TSV="$RUN_DIR/cells-$platform.tsv"
  jq -r '.flows[] | .flow as $f | .cells[] | [$f, .id, (.cell | tojson)] | @tsv' "$MATRIX_FILE" > "$CELLS_TSV"
  while IFS="$(printf '\t')" read -r -u 3 FLOW_ID CELL_ID CELL_JSON; do
    CELL_DIR="$RUN_DIR/cells/$platform/$FLOW_ID/$CELL_ID"
    mkdir -p "$CELL_DIR"
    : > "$CELL_DIR/findings.jsonl"
    echo "[release-walk] === cell $platform/$FLOW_ID/$CELL_ID ==="

    CELL_STATUS="ok"
    if [ "$platform" = "android" ]; then
      cp "$RUN_DIR/serial.txt" "$CELL_DIR/serial.txt"
      # Baseline first: dims absent from this cell must not inherit the
      # previous cell's state (light/1.0/online is the declared default).
      state_android_reset "$SERIAL" >/dev/null
      state_android_apply_device "$SERIAL" "$CELL_JSON" "$CELL_DIR/state-applied.json" || CELL_STATUS="state_failed"
      if [ "$CELL_STATUS" = "ok" ]; then
        if ! RUN_DIR="$CELL_DIR" WALKER_FLOW_FILTER="$FLOW_ID" \
             WALKER_CELL_JSON="$CELL_JSON" WALKER_PERM_MAP_JSON="$PERM_MAP" \
             bash "$ROOT/lib/enumerate-android-native.sh"; then
          CELL_STATUS="walker_crashed"
        fi
      fi
    else
      cp "$RUN_DIR/udid.txt" "$CELL_DIR/udid.txt"
      BUNDLE_ID=$(python3 -c "import sys,yaml; print(yaml.safe_load(open(sys.argv[1])).get('ios_bundle_id') or '')" "$SPEC_PATH")
      state_ios_reset "$UDID" >/dev/null
      state_ios_dismiss_alert "$UDID"
      state_ios_apply_device "$UDID" "$CELL_JSON" "$CELL_DIR/state-applied.json" || CELL_STATUS="state_failed"
      state_ios_apply_app "$UDID" "$BUNDLE_ID" "$CELL_JSON" "$PERM_MAP" "$CELL_DIR/state-applied.json" || CELL_STATUS="state_failed"
      if [ "$CELL_STATUS" = "ok" ]; then
        if ! RUN_DIR="$CELL_DIR" WALKER_FLOW_FILTER="$FLOW_ID" \
             bash "$ROOT/lib/enumerate-ios-native.sh"; then
          CELL_STATUS="walker_crashed"
        fi
      fi
    fi

    run_detectors "$CELL_DIR"
    aggregate_cell "$CELL_DIR" "$FLOW_ID" "$CELL_ID"
    N_CELL_FINDINGS=$(wc -l < "$CELL_DIR/findings.jsonl" | tr -d ' ')
    jq -nc --arg platform "$platform" --arg flow "$FLOW_ID" --arg cell "$CELL_ID" \
          --argjson celldef "$CELL_JSON" --arg status "$CELL_STATUS" \
          --argjson findings "$N_CELL_FINDINGS" \
          '{platform:$platform, flow:$flow, cell:$cell, cell_def:$celldef, status:$status, findings:$findings}' \
      >> "$RUN_DIR/matrix-summary.jsonl"
  done 3< "$CELLS_TSV"

  # Restore baseline between platforms / before explore.
  if [ "$platform" = "android" ]; then
    state_android_reset "$SERIAL"
  else
    state_ios_reset "$UDID"
  fi
  return 0
}

walk_android() {
  "$ROOT/lib/boot-device.sh" android
  SERIAL="$(cat "$RUN_DIR/serial.txt")"
  if [ "$MATRIX" -eq 1 ] && matrix_loop android; then
    :
  else
    "$ROOT/lib/enumerate-android-native.sh"
    run_detectors "$RUN_DIR"
  fi
}

walk_ios() {
  "$ROOT/lib/boot-device-ios.sh"
  UDID="$(cat "$RUN_DIR/udid.txt")"
  if [ "$MATRIX" -eq 1 ] && matrix_loop ios; then
    :
  else
    "$ROOT/lib/enumerate-ios-native.sh"
    run_detectors "$RUN_DIR"
  fi
}

case "$PLATFORM" in
  android) walk_android ;;
  ios)     walk_ios ;;
  both)    walk_android; walk_ios ;;
  *) echo "unknown platform: $PLATFORM" >&2; exit 2 ;;
esac

# Exploration layer (android-first; iOS explore is a tracked follow-up).
if [ "$EXPLORE" -eq 1 ]; then
  if [ "$PLATFORM" = "ios" ]; then
    echo "[release-walk] WARN: --explore is android-only in this phase; skipped" >&2
  else
    EXPLORE_DIR="$RUN_DIR/explore"
    mkdir -p "$EXPLORE_DIR"
    PARSED="$RUN_DIR/spec.parsed.json"
    [ -f "$PARSED" ] || python3 "$ROOT/lib/parse-spec.py" "$SPEC_PATH" android > "$PARSED"
    PKG=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['android_package'])" "$PARSED")
    ACT=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('android_launch_activity') or '')" "$PARSED")
    echo "[release-walk] explore: budget $TAPS taps"
    python3 "$ROOT/lib/explore-android.py" "$SERIAL" "$PKG" "$ACT" "$PARSED" \
      "$EXPLORE_DIR" "$FINDINGS_FILE" "--taps=$TAPS" || \
      echo "[release-walk] WARN: explore walk errored" >&2
    state_android_reset "$SERIAL"
  fi
fi

# Parity comparator: auto-on for both-platform runs, explicit otherwise.
if [ "$PARITY" = "on" ] || { [ "$PARITY" = "auto" ] && [ "$PLATFORM" = "both" ]; }; then
  bash "$HERE/parity-check.sh" "$RUN_DIR" "$SPEC_PATH" || \
    echo "[release-walk] WARN: parity check errored" >&2
fi

"$ROOT/lib/verdict.sh"

echo "[release-walk] done. findings: $(wc -l < "$FINDINGS_FILE" | tr -d ' ')"
