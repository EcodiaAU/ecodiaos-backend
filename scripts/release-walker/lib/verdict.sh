#!/usr/bin/env bash
# verdict.sh - aggregate findings.jsonl into the status_board verdict +
# the coverage-honest run report (STATE-MATRIX.md Section 8: GREEN names
# what ran AND what did not). The status_board write happens via the
# conductor's MCP after the bash run.
set -euo pipefail

FINDINGS="$RUN_DIR/findings.jsonl"
COUNT=0
[ -f "$FINDINGS" ] && COUNT="$(wc -l < "$FINDINGS" | tr -d ' ')"

# Coverage facts from the optional layers.
CELLS_RUN=0
CELLS_BAD=0
[ -f "$RUN_DIR/matrix-summary.jsonl" ] && {
  CELLS_RUN=$(wc -l < "$RUN_DIR/matrix-summary.jsonl" | tr -d ' ')
  CELLS_BAD=$(jq -s '[.[] | select(.status != "ok")] | length' "$RUN_DIR/matrix-summary.jsonl")
}
EXPLORE_TAPS=0
EXPLORE_SCREENS=0
[ -f "$RUN_DIR/explore/explore-summary.json" ] && {
  EXPLORE_TAPS=$(jq '.taps' "$RUN_DIR/explore/explore-summary.json")
  EXPLORE_SCREENS=$(jq '.unique_screens' "$RUN_DIR/explore/explore-summary.json")
}
PARITY_PAIRS=0
[ -f "$RUN_DIR/parity-report.json" ] && \
  PARITY_PAIRS=$(jq '.screenshot_pairs_for_vision | length' "$RUN_DIR/parity-report.json")

DROPPED_DIMS=""
for mf in "$RUN_DIR"/matrix-*.json; do
  [ -f "$mf" ] || continue
  D=$(jq -r '[.flows[].dropped_dims[]? | .dim + "(" + .reason + ")"] | unique | join(",")' "$mf")
  [ -n "$D" ] && DROPPED_DIMS="$DROPPED_DIMS$D"
done

if [ "$COUNT" -eq 0 ] && [ "$CELLS_BAD" -eq 0 ]; then
  STATUS="green"
  PRIORITY=3
  NOTES="green; run $RUN_ID; cells=$CELLS_RUN explore_taps=$EXPLORE_TAPS"
elif [ "$COUNT" -eq 0 ]; then
  STATUS="cells_incomplete"
  PRIORITY=2
  NOTES="0 findings but $CELLS_BAD/$CELLS_RUN cell(s) did not complete; run $RUN_ID"
else
  STATUS="findings"
  PRIORITY=2
  NOTES="$COUNT finding(s); run $RUN_ID; see $RUN_DIR/findings.jsonl"
fi
NEXT_BY="ecodiaos"
[ -n "$DROPPED_DIMS" ] && NOTES="$NOTES; uncovered_dims=$DROPPED_DIMS"

cat > "$RUN_DIR/verdict.json" <<JSON
{
  "row_id": "walker:${APP}:${RUN_ID}",
  "entity_type": "task",
  "title": "release-walker ${APP} ${PLATFORM} ${RUN_ID}",
  "priority": $PRIORITY,
  "status": "$STATUS",
  "next_action_by": "$NEXT_BY",
  "notes": "$NOTES",
  "finding_count": $COUNT,
  "matrix_cells_run": $CELLS_RUN,
  "matrix_cells_incomplete": $CELLS_BAD,
  "explore_taps": $EXPLORE_TAPS,
  "explore_unique_screens": $EXPLORE_SCREENS,
  "parity_pairs_for_vision": $PARITY_PAIRS,
  "uncovered_dimensions": "$DROPPED_DIMS",
  "run_dir": "$RUN_DIR"
}
JSON

# Human-readable run report next to the verdict.
{
  echo "# release-walker report: $APP $PLATFORM"
  echo
  echo "- run: $RUN_ID"
  echo "- findings: $COUNT (findings.jsonl)"
  if [ "$CELLS_RUN" -gt 0 ]; then
    echo "- matrix: $CELLS_RUN cell(s), $CELLS_BAD incomplete"
    echo
    echo "## cells"
    echo
    jq -r '"- [" + .status + "] " + .platform + " " + .flow + " :: " + .cell + " (" + (.findings|tostring) + " finding(s))"' \
      "$RUN_DIR/matrix-summary.jsonl" 2>/dev/null || true
  else
    echo "- matrix: not run (plain walk)"
  fi
  if [ "$EXPLORE_TAPS" -gt 0 ] || [ -f "$RUN_DIR/explore/explore-summary.json" ]; then
    echo
    echo "## exploration"
    echo
    jq -r '"- taps: " + (.taps|tostring) + "/" + (.taps_budget|tostring) +
           "\n- unique screens: " + (.unique_screens|tostring) +
           "\n- spec surfaces matched: " + (.surfaces_matched|join(", ")) +
           "\n- persist claims: " + ([.persist_results[].status] | join(", ")) +
           "\n- VISION JUDGEMENT PENDING on " + .screens_dir' \
      "$RUN_DIR/explore/explore-summary.json" 2>/dev/null || true
  else
    echo "- exploration: not run"
  fi
  if [ -f "$RUN_DIR/parity-report.json" ]; then
    echo
    echo "## parity"
    echo
    jq -r '"- dual-platform surfaces: " + (.surfaces|length|tostring) +
           "\n- android-only spec surfaces: " + (.surfaces_android_only|join(", ")) +
           "\n- ios-only spec surfaces: " + (.surfaces_ios_only|join(", ")) +
           "\n- screenshot pairs for vision: " + (.screenshot_pairs_for_vision|length|tostring)' \
      "$RUN_DIR/parity-report.json" 2>/dev/null || true
  fi
  if [ -n "$DROPPED_DIMS" ]; then
    echo
    echo "## NOT covered in this run"
    echo
    echo "- $DROPPED_DIMS"
  fi
  if [ "$COUNT" -gt 0 ]; then
    echo
    echo "## findings"
    echo
    jq -r '"- [" + .severity + "] " + .detector + " " + (.matrix_flow // .flow) +
           (if .cell then " :: " + .cell else "" end) + " / " + .surface +
           ": " + .observed + "  (evidence: " + (.evidence // "-") + ")"' \
      "$FINDINGS" 2>/dev/null || true
  fi
} > "$RUN_DIR/report.md"

# Update manifest terminal status.
TMP="$RUN_DIR/manifest.json.tmp"
jq --arg s "$STATUS" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.status = $s | .terminated_at_utc = $t' "$RUN_DIR/manifest.json" > "$TMP" && mv "$TMP" "$RUN_DIR/manifest.json"

echo "[verdict] status=$STATUS findings=$COUNT cells=$CELLS_RUN report=$RUN_DIR/report.md"
