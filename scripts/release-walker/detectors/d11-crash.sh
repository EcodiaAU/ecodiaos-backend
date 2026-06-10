#!/usr/bin/env bash
# D11 - Crash / ANR / blank. Phase 2A: scan every surface's pidof.txt;
# the process must be alive at every surface capture.
set -euo pipefail

PARSED="$RUN_DIR/spec.parsed.json"
APP_PACKAGE="$(cat "$RUN_DIR/app_package.txt" 2>/dev/null || echo unknown)"

for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")
  [ -f "$PARSED" ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); ids={f['id'] for f in d['flows']}; sys.exit(0 if sys.argv[2] in ids else 1)" "$PARSED" "$FLOW_ID" || { [ -f "$PARSED" ] && continue; }

  for SURFACE_DIR in "$FLOW_DIR"*/; do
    [ -d "$SURFACE_DIR" ] || continue
    SURFACE_ID=$(basename "$SURFACE_DIR")
    PIDFILE="$SURFACE_DIR/pidof.txt"
    [ -f "$PIDFILE" ] || continue
    PID=$(cat "$PIDFILE")
    if [ -z "$PID" ]; then
      jq -nc --arg detector "D11" \
            --arg severity "critical" \
            --arg flow "$FLOW_ID" \
            --arg surface "$SURFACE_ID" \
            --arg expected "process alive for $APP_PACKAGE at surface $SURFACE_ID" \
            --arg observed "no pid; process crashed or never started" \
            --arg evidence "$SURFACE_DIR/screen.png" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D11] FIRE $FLOW_ID/$SURFACE_ID crash"
    else
      echo "[D11] green $FLOW_ID/$SURFACE_ID pid=$PID"
    fi
  done
done
