#!/usr/bin/env bash
# D5 - Nav-loop / back-stack per ARCHITECTURE.md Section 4.
# Probes spec.back_stack[] rules. For each rule:
#   from: X
#   press: back
#   expect_landing: Y
# D5 looks for a flow walking [..., Y, X, post-back] where post-back has
# enter_via=back. Checks post-back hierarchy contains expect_landing
# (Y's) spec elements. If yes GREEN; if no FIRE (wrong destination).
#
# Cases covered uniquely by D5:
#   - "wrong dest": back navigated somewhere unexpected (caught by anchor mismatch).
# Cases delegated to other detectors:
#   - "loop / no-op": D2 catches signature-unchanged prior to back press.
#   - "app exit": D11 catches missing pid / AXApplication.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSED="$RUN_DIR/spec.parsed.json"
[ -f "$PARSED" ] || { echo "[D5] no parsed spec; skipping"; exit 0; }

# Parse spec.back_stack[] from the original spec yaml (parsed.json
# strips it). Reload the source spec.
BACKSTACK_JSON=$(python3 - "$SPEC_PATH" <<'PY'
import json, sys, yaml
with open(sys.argv[1], encoding='utf-8') as f:
    spec = yaml.safe_load(f)
print(json.dumps(spec.get('back_stack') or []))
PY
)

if [ "$BACKSTACK_JSON" = "[]" ]; then
  echo "[D5] no back_stack rules in spec; skipping"
  exit 0
fi

for FLOW_DIR in "$RUN_DIR"/*/; do
  [ -d "$FLOW_DIR" ] || continue
  FLOW_ID=$(basename "$FLOW_DIR")
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); ids={f['id'] for f in d['flows']}; sys.exit(0 if sys.argv[2] in ids else 1)" "$PARSED" "$FLOW_ID" || continue

  SURFACE_IDS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); flow=[f for f in d['flows'] if f['id']==sys.argv[2]]; print(' '.join(flow[0]['walks_surfaces']) if flow else '')" "$PARSED" "$FLOW_ID")
  [ -z "$SURFACE_IDS" ] && continue

  # Build positional arrays for this flow.
  i=0
  for SURFACE_ID in $SURFACE_IDS; do
    eval "SURFS_$i=\"$SURFACE_ID\""
    eval "ENTER_$i=\"$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['surfaces'].get(sys.argv[2], {}).get('enter_via') or '')" "$PARSED" "$SURFACE_ID")\""
    i=$((i + 1))
  done
  N="$i"

  # For each index >= 1 with enter_via=back, check the back_stack rule
  # whose `from` matches the surface immediately prior.
  j=1
  while [ "$j" -lt "$N" ]; do
    eval "ENT=\$ENTER_$j"
    if [ "$ENT" = "back" ]; then
      PREV_IDX=$((j - 1))
      eval "FROM_SID=\$SURFS_$PREV_IDX"
      eval "BACK_SID=\$SURFS_$j"

      # Look up the matching back_stack rule.
      EXPECT_SID=$(echo "$BACKSTACK_JSON" | python3 -c "
import json, sys
rules = json.load(sys.stdin)
target_from = sys.argv[1]
for r in rules:
    if r.get('from') == target_from and r.get('press') == 'back':
        print(r.get('expect_landing') or '')
        sys.exit(0)
print('')
" "$FROM_SID")

      if [ -z "$EXPECT_SID" ]; then
        echo "[D5] $FLOW_ID/$BACK_SID: no back_stack rule for from=$FROM_SID; skipping"
      else
        # Pull spec.elements for the expected landing surface.
        ANCHORS=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['surfaces'].get(sys.argv[2]) or {}; print('\n'.join(s.get('elements') or []))" "$PARSED" "$EXPECT_SID")
        BACK_HIER="$FLOW_DIR$BACK_SID/hierarchy.xml"
        if [ ! -f "$BACK_HIER" ]; then
          echo "[D5] $FLOW_ID/$BACK_SID: no post-back hierarchy.xml; skipping"
        else
          MISSING=""
          while IFS= read -r anchor; do
            [ -z "$anchor" ] && continue
            case "$anchor" in
              text:*) needle="${anchor#text:}"; grep -F -q "text=\"$needle\"" "$BACK_HIER" || MISSING="$MISSING|$anchor" ;;
              desc:*) needle="${anchor#desc:}"; grep -F -q "content-desc=\"$needle\"" "$BACK_HIER" || MISSING="$MISSING|$anchor" ;;
              *)      needle="$anchor"; (grep -F -q "text=\"$needle\"" "$BACK_HIER" || grep -F -q "content-desc=\"$needle\"" "$BACK_HIER") || MISSING="$MISSING|$anchor" ;;
            esac
          done <<< "$ANCHORS"

          if [ -n "$MISSING" ]; then
            MISSING="${MISSING#|}"
            jq -nc --arg detector "D5" \
                   --arg severity "high" \
                   --arg flow "$FLOW_ID" \
                   --arg surface "$BACK_SID" \
                   --arg rule "from=$FROM_SID press=back expect_landing=$EXPECT_SID" \
                   --arg expected "post-back hierarchy contains $EXPECT_SID anchors" \
                   --arg observed "missing: $MISSING" \
                   --arg evidence "$FLOW_DIR$BACK_SID/screen.png" \
                   '{detector:$detector, severity:$severity, flow:$flow, surface:$surface, rule:$rule, expected:$expected, observed:$observed, evidence:$evidence}' \
              >> "$RUN_DIR/findings.jsonl"
            echo "[D5] FIRE $FLOW_ID/$BACK_SID: missing $EXPECT_SID anchors ($MISSING)"
          else
            echo "[D5] green $FLOW_ID/$BACK_SID: anchors of $EXPECT_SID present after back"
          fi
        fi
      fi
    fi
    j=$((j + 1))
  done
done
