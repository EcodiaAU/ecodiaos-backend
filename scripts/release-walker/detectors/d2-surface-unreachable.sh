#!/usr/bin/env bash
# D2 - Surface unreachable. The nav action ran but the post-action surface
# matches the prior surface, OR matches no spec'd surface signature. We
# detect "tap landed nowhere" as: signature unchanged across two
# consecutive surfaces (the second was supposed to be a new surface).
# Phase 2A: simple signature-equal check; deeper structural diff in 2B.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSED="$RUN_DIR/spec.parsed.json"
[ -f "$PARSED" ] || { echo "[D2] no parsed spec; skipping"; exit 0; }

for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); ids={f['id'] for f in d['flows']}; sys.exit(0 if sys.argv[2] in ids else 1)" "$PARSED" "$FLOW_ID" || continue

  SURFACE_IDS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); flow=[f for f in d['flows'] if f['id']==sys.argv[2]]; print(' '.join(flow[0]['walks_surfaces']) if flow else '')" "$PARSED" "$FLOW_ID")
  [ -z "$SURFACE_IDS" ] && continue

  PREV_SIG=""
  PREV_ID=""
  for SURFACE_ID in $SURFACE_IDS; do
    SURFACE_DIR="$FLOW_DIR$SURFACE_ID"
    SIG_FILE="$SURFACE_DIR/signature.txt"
    [ -f "$SIG_FILE" ] || { PREV_SIG=""; PREV_ID=""; continue; }
    SIG=$(cat "$SIG_FILE")

    if [ -n "$PREV_SIG" ] && [ "$SIG" = "$PREV_SIG" ]; then
      jq -nc --arg detector "D2" \
            --arg severity "high" \
            --arg flow "$FLOW_ID" \
            --arg surface "$SURFACE_ID" \
            --arg prior "$PREV_ID" \
            --arg expected "hierarchy signature changes after enter_via from '$PREV_ID' to '$SURFACE_ID'" \
            --arg observed "signature identical: nav action was a no-op" \
            --arg evidence "$SURFACE_DIR/screen.png" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, prior_surface:$prior, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D2] FIRE $FLOW_ID: $PREV_ID -> $SURFACE_ID (signature unchanged)"
    else
      [ -n "$PREV_SIG" ] && echo "[D2] green $FLOW_ID: $PREV_ID -> $SURFACE_ID"
    fi
    PREV_SIG="$SIG"
    PREV_ID="$SURFACE_ID"
  done
done
