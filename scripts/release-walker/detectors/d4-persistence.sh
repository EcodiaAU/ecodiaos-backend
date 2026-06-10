#!/usr/bin/env bash
# D4 - Persistence violation per ARCHITECTURE.md Section 4 + STATE-MATRIX.md.
# Judges _persist-* artifacts written by probes-android.sh: after kill +
# relaunch (no clear), the spec's expected landing surface anchors must be
# present. A single-session UI render is NOT persistence evidence
# (exploratory-walker-is-first-class-test-substrate-2026-06-09); this
# detector is the kill+relaunch gate that doctrine binds GREEN claims to.
set -euo pipefail

PARSED="$RUN_DIR/spec.parsed.json"
[ -f "$PARSED" ] || { echo "[D4] no parsed spec; skipping"; exit 0; }

FOUND_ANY=0
for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")

  for PERSIST_DIR in "$FLOW_DIR"_persist-*/; do
    [ -d "$PERSIST_DIR" ] || continue
    [ -f "$PERSIST_DIR/probe.json" ] || continue
    FOUND_ANY=1

    CLAIM=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('claim') or '')" "$PERSIST_DIR/probe.json")
    EXPECT=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('expect_landing_surface') or '')" "$PERSIST_DIR/probe.json")
    HIER="$PERSIST_DIR/hierarchy.xml"

    if [ -z "$EXPECT" ]; then
      echo "[D4] $FLOW_ID $(basename "$PERSIST_DIR"): no expect_landing_surface; skipping"
      continue
    fi
    if [ ! -f "$HIER" ]; then
      jq -nc --arg detector "D4" --arg severity "high" --arg flow "$FLOW_ID" \
            --arg surface "$EXPECT" --arg claim "$CLAIM" \
            --arg expected "post-relaunch hierarchy captured" \
            --arg observed "no hierarchy.xml in persist probe dir" \
            --arg evidence "$PERSIST_DIR" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, claim:$claim, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D4] FIRE $FLOW_ID: probe captured no hierarchy"
      continue
    fi

    # Anchors of the expected landing surface, from the parsed spec.
    ANCHORS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['surfaces'].get(sys.argv[2]) or {}; print('\n'.join(s.get('elements') or []))" "$PARSED" "$EXPECT")
    if [ -z "$ANCHORS" ]; then
      echo "[D4] $FLOW_ID: expected surface '$EXPECT' has no spec anchors; cannot judge" >&2
      continue
    fi

    MISSING=""
    while IFS= read -r anchor; do
      [ -z "$anchor" ] && continue
      case "$anchor" in
        text:*) needle="${anchor#text:}"; grep -F -q "text=\"$needle\"" "$HIER" || MISSING="$MISSING|$anchor" ;;
        desc:*) needle="${anchor#desc:}"; grep -F -q "content-desc=\"$needle\"" "$HIER" || MISSING="$MISSING|$anchor" ;;
        *)      needle="$anchor"; { grep -F -q "text=\"$needle\"" "$HIER" || grep -F -q "content-desc=\"$needle\"" "$HIER"; } || MISSING="$MISSING|$anchor" ;;
      esac
    done <<< "$ANCHORS"

    if [ -n "$MISSING" ]; then
      MISSING="${MISSING#|}"
      jq -nc --arg detector "D4" --arg severity "high" --arg flow "$FLOW_ID" \
            --arg surface "$EXPECT" --arg claim "$CLAIM" \
            --arg expected "landing surface '$EXPECT' anchors after kill+relaunch (no clear)" \
            --arg observed "missing: $MISSING" \
            --arg evidence "$PERSIST_DIR/screen.png" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, claim:$claim, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D4] FIRE $FLOW_ID: persistence violated, missing=$MISSING"
    else
      echo "[D4] green $FLOW_ID: '$EXPECT' anchors held across kill+relaunch"
    fi
  done
done

[ "$FOUND_ANY" -eq 0 ] && echo "[D4] no persistence probes in this run"
exit 0
