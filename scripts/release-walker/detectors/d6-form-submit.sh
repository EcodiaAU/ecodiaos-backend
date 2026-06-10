#!/usr/bin/env bash
# D6 - Form-submit completion per ARCHITECTURE.md Section 4.
# Judges _form-*/form-result.json written by probes-android.sh:
#   - fill_verified=false  -> typing never reached the field (the Coexist
#     soft-keyboard/focus bug class) - severity high
#   - submitted=false      -> submit control unresolved - severity high
#   - observed=none_within_budget -> no expected response anchor within
#     within_ms (spinner-forever / silent-fail) - severity high
#   - not_landing breach   -> the post-submit hierarchy contains the
#     forbidden landing surface's anchors - severity high
set -euo pipefail

PARSED="$RUN_DIR/spec.parsed.json"
[ -f "$PARSED" ] || { echo "[D6] no parsed spec; skipping"; exit 0; }

FOUND_ANY=0
for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")

  for FORM_DIR in "$FLOW_DIR"_form-*/; do
    [ -d "$FORM_DIR" ] || continue
    RESULT="$FORM_DIR/form-result.json"
    [ -f "$RESULT" ] || continue
    FOUND_ANY=1
    FORM_ID=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('form_id') or '')" "$RESULT")

    fire() {
      jq -nc --arg detector "D6" --arg severity "high" --arg flow "$FLOW_ID" \
            --arg surface "$FORM_ID" --arg expected "$1" --arg observed "$2" \
            --arg evidence "$FORM_DIR/screen.png" \
            '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, expected:$expected, observed:$observed, evidence:$evidence}' \
        >> "$RUN_DIR/findings.jsonl"
      echo "[D6] FIRE $FLOW_ID/$FORM_ID: $2"
    }

    FILL_OK=$(python3 -c "import json,sys; print('1' if json.load(open(sys.argv[1])).get('fill_verified') else '0')" "$RESULT")
    SUBMITTED=$(python3 -c "import json,sys; print('1' if json.load(open(sys.argv[1])).get('submitted') else '0')" "$RESULT")
    OBSERVED=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('observed') or '')" "$RESULT")
    WITHIN=$(python3 -c "import json,sys; print((json.load(open(sys.argv[1])).get('expect') or {}).get('within_ms') or 8000)" "$RESULT")
    NOT_LANDING=$(python3 -c "import json,sys; print((json.load(open(sys.argv[1])).get('expect') or {}).get('not_landing') or '')" "$RESULT")

    if [ "$FILL_OK" != "1" ]; then
      fire "typed value present in hierarchy after fill (input focus held)" \
           "fill not verified: typing never surfaced in a field (focus/soft-keyboard failure)"
      continue
    fi
    if [ "$SUBMITTED" != "1" ]; then
      fire "submit control resolvable and tappable" "submit tap unresolved"
      continue
    fi
    if [ "$OBSERVED" = "none_within_budget" ]; then
      fire "one of expect.any_of anchors within ${WITHIN}ms of submit" \
           "no expected response anchor within budget (silent fail / spinner-forever)"
      continue
    fi

    # not_landing breach: forbidden surface anchors present post-submit.
    if [ -n "$NOT_LANDING" ] && [ -f "$FORM_DIR/hierarchy.xml" ]; then
      BREACH=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
s = d['surfaces'].get(sys.argv[2]) or {}
anchors = s.get('elements') or []
blob = open(sys.argv[3], encoding='utf-8').read()
hits = 0
for raw in anchors:
    needle = raw.split(':', 1)[1] if ':' in raw else raw
    if f'text=\"{needle}\"' in blob or f'content-desc=\"{needle}\"' in blob:
        hits += 1
print('1' if anchors and hits == len(anchors) else '0')
" "$PARSED" "$NOT_LANDING" "$FORM_DIR/hierarchy.xml")
      if [ "$BREACH" = "1" ]; then
        fire "post-submit surface is NOT '$NOT_LANDING'" \
             "all '$NOT_LANDING' anchors present after submit (bad creds accepted?)"
        continue
      fi
    fi

    echo "[D6] green $FLOW_ID/$FORM_ID observed=$OBSERVED"
  done
done

[ "$FOUND_ANY" -eq 0 ] && echo "[D6] no form runs in this run"
exit 0
