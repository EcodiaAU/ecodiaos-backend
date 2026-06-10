#!/usr/bin/env bash
# D1 - Surface absence per ARCHITECTURE.md Section 4 + Phase 2A multi-surface.
# Iterates every per-surface dir; for each, checks the spec's elements[]
# anchors are present in the captured hierarchy.xml. Anchors take the form
# "text:X" or "desc:X"; a bare "X" matches text OR desc.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$(dirname "$HERE")/lib/nav-android.sh"

PARSED="$RUN_DIR/spec.parsed.json"
[ -f "$PARSED" ] || { echo "[D1] no parsed spec; skipping"; exit 0; }

for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")
  # Skip non-flow dirs (runs/, manifest path components).
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); ids={f['id'] for f in d['flows']}; sys.exit(0 if sys.argv[2] in ids else 1)" "$PARSED" "$FLOW_ID" || continue

  for SURFACE_DIR in "$FLOW_DIR"*/; do
    [ -d "$SURFACE_DIR" ] || continue
    SURFACE_ID=$(basename "$SURFACE_DIR")
    HIER="$SURFACE_DIR/hierarchy.xml"
    [ -f "$HIER" ] || { echo "[D1] $FLOW_ID/$SURFACE_ID no hierarchy.xml"; continue; }

    # Pull anchors for this surface.
    ANCHORS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['surfaces'].get(sys.argv[2]) or {}; print('\n'.join(s.get('elements') or []))" "$PARSED" "$SURFACE_ID")
    if [ -z "$ANCHORS" ]; then
      echo "[D1] $FLOW_ID/$SURFACE_ID no anchors in spec; skipping"
      continue
    fi

    MISSING=""
    while IFS= read -r anchor; do
      [ -z "$anchor" ] && continue
      case "$anchor" in
        text:*) needle="${anchor#text:}"; if ! grep -F -q "text=\"$needle\"" "$HIER"; then MISSING="$MISSING|$anchor"; fi ;;
        desc:*) needle="${anchor#desc:}"; if ! grep -F -q "content-desc=\"$needle\"" "$HIER"; then MISSING="$MISSING|$anchor"; fi ;;
        *)      needle="$anchor"; if ! grep -F -q "text=\"$needle\"" "$HIER" && ! grep -F -q "content-desc=\"$needle\"" "$HIER"; then MISSING="$MISSING|$anchor"; fi ;;
      esac
    done <<< "$ANCHORS"

    if [ -n "$MISSING" ]; then
      MISSING="${MISSING#|}"
      jq -nc --arg detector "D1" \
            --arg severity "high" \
            --arg flow "$FLOW_ID" \
            --arg surface "$SURFACE_ID" \
            --arg expected "$(echo "$ANCHORS" | tr '\n' ',')" \
            --arg observed "missing: $MISSING" \
            --arg evidence "$SURFACE_DIR/screen.png" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D1] FIRE $FLOW_ID/$SURFACE_ID missing=$MISSING"
    else
      echo "[D1] green $FLOW_ID/$SURFACE_ID"
    fi
  done
done
