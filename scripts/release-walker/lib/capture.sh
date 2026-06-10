#!/usr/bin/env bash
# capture.sh - screenshot + UI hierarchy + props for one surface.
# Per ARCHITECTURE.md Section 7b: ignore `clickable`, use bounds + text/desc/id.
set -euo pipefail

SERIAL="${1:?serial}"; DEST="${2:?dest dir}"; LABEL="${3:?label}"
mkdir -p "$DEST"

adb -s "$SERIAL" exec-out screencap -p > "$DEST/screen.png"

# uiautomator dump with hierarchy-settle. Pixel settle is a necessary but
# insufficient gate for Capacitor WebView surfaces: frames paint before
# the WebView a11y delegate populates text spans. We retry the dump until
# two consecutive dumps return the same text-span count, capped at 6
# tries with a 2s tick. Empirical: a freshly painted Capacitor signin
# surface returns 0 spans for ~4-8s after pixel settle, then jumps to ~16.
PREV_COUNT=-1
SAME=0
for try in 1 2 3 4 5 6; do
  adb -s "$SERIAL" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb -s "$SERIAL" pull /sdcard/ui.xml "$DEST/hierarchy.xml" >/dev/null 2>&1 || true
  if [ -f "$DEST/hierarchy.xml" ]; then
    COUNT=$(grep -oE 'text="[^"]+"' "$DEST/hierarchy.xml" 2>/dev/null | wc -l | tr -d ' ' 2>/dev/null || echo 0)
  else
    COUNT=0
  fi
  [ -z "$COUNT" ] && COUNT=0
  if [ "$COUNT" = "$PREV_COUNT" ] && [ "$COUNT" -gt 0 ]; then
    SAME=$((SAME + 1))
    if [ "$SAME" -ge 1 ]; then
      echo "[capture] hierarchy settled at try=$try text_spans=$COUNT"
      break
    fi
  else
    SAME=0
  fi
  PREV_COUNT="$COUNT"
  sleep 2
done

# Flat element list: bounds | text | content-desc | resource-id.
if command -v xmlstarlet >/dev/null 2>&1; then
  xmlstarlet sel -t -m '//node[@bounds and (@text!="" or @content-desc!="" or @resource-id!="")]' \
    -v '@bounds' -o '|' -v '@text' -o '|' -v '@content-desc' -o '|' -v '@resource-id' -n \
    "$DEST/hierarchy.xml" > "$DEST/elements.txt" 2>/dev/null || : > "$DEST/elements.txt"
else
  # Fallback grep when xmlstarlet not installed.
  grep -oE 'bounds="[^"]+"|text="[^"]*"|content-desc="[^"]*"|resource-id="[^"]+"' \
    "$DEST/hierarchy.xml" > "$DEST/elements.txt" 2>/dev/null || : > "$DEST/elements.txt"
fi

echo "[capture] $LABEL screen=$DEST/screen.png hierarchy=$DEST/hierarchy.xml elements=$(wc -l < "$DEST/elements.txt" | tr -d ' ')"
