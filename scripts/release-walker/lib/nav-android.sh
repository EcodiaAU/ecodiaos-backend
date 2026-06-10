#!/usr/bin/env bash
# nav-android.sh - bounds-driven nav primitives for Phase 2.
# Per `compose-accessibility-tree-fills-before-pixels-paint-2026-06-09`,
# every nav action is followed by a fresh hierarchy dump + a settle
# probe; the caller compares the post-action hierarchy to the expected
# surface anchors to decide D1/D2.
# Bash 3.2 portable.
set -euo pipefail

NAV_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

nav_dump_hierarchy() {
  serial="$1"; dest="$2"
  adb -s "$serial" shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb -s "$serial" pull /sdcard/ui.xml "$dest" >/dev/null 2>&1
}

# Return midpoint of the bounds for a node whose text equals $2.
# Bounds format from uiautomator: [x1,y1][x2,y2].
nav_bounds_for_text() {
  hierarchy="$1"; text="$2"
  # Match node with text="<text>", capture preceding bounds attribute on
  # the same node OR the nearest ancestor button. We pick the smallest
  # bounds block containing the text (usually the text node itself), then
  # use its midpoint; for a button label this maps inside the button.
  python3 - "$hierarchy" "$text" <<'PY'
import re, sys
hierarchy, target = sys.argv[1], sys.argv[2]
with open(hierarchy, encoding='utf-8') as f:
    blob = f.read()

# Pick the most tappable node carrying the text. On Capacitor WebViews the
# visible TextView is inside a clickable parent View whose content-desc
# carries the same string; we prefer the clickable node when both exist.
node_re = re.compile(r'<node[^>]*\bclickable="(true|false)"[^>]*\btext="([^"]*)"[^>]*\bcontent-desc="([^"]*)"[^>]*\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', re.S)
# uiautomator's attribute order varies; try the simpler regex if the
# composite did not match.

def parse_nodes(b):
    out = []
    for m in re.finditer(r'<node\b[^/]*?(/?>)', b, re.S):
        s = m.group(0)
        text = (re.search(r'\btext="([^"]*)"', s) or [None, ''])[1] if re.search(r'\btext="([^"]*)"', s) else ''
        cd = (re.search(r'\bcontent-desc="([^"]*)"', s) or [None, ''])[1] if re.search(r'\bcontent-desc="([^"]*)"', s) else ''
        cl = (re.search(r'\bclickable="(true|false)"', s) or [None, 'false'])[1] if re.search(r'\bclickable="(true|false)"', s) else 'false'
        bm = re.search(r'\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
        if not bm:
            continue
        x1, y1, x2, y2 = map(int, bm.groups())
        out.append({'text': text, 'cd': cd, 'clickable': cl == 'true', 'bounds': (x1, y1, x2, y2)})
    return out

nodes = parse_nodes(blob)
matches = [n for n in nodes if n['text'] == target or n['cd'] == target]
if not matches:
    sys.exit(7)
# Prefer clickable nodes; among those pick the largest hit area.
clickable = [n for n in matches if n['clickable']]
pool = clickable if clickable else matches
pool.sort(key=lambda n: -((n['bounds'][2] - n['bounds'][0]) * (n['bounds'][3] - n['bounds'][1])))
x1, y1, x2, y2 = pool[0]['bounds']
print(f"{(x1+x2)//2} {(y1+y2)//2}")
PY
}

nav_tap_text() {
  serial="$1"; hierarchy="$2"; text="$3"
  coords="$(nav_bounds_for_text "$hierarchy" "$text" || true)"
  if [ -z "$coords" ]; then
    echo "[nav] FAIL: no node with text='$text'" >&2
    return 7
  fi
  x="${coords%% *}"; y="${coords##* }"
  echo "[nav] tap text='$text' at ($x,$y)"
  adb -s "$serial" shell input tap "$x" "$y"
}

# Midpoint of the Nth EditText (0-based, document order). The reliable
# focus path for Capacitor/WebView inputs whose floating labels never
# match text= (maestro-tapon-by-text-misses-capacitor-webview-input):
# resolved live from the hierarchy, so theme/font_scale shifts cannot
# stale the coordinates the way hardcoded coord:% targets do.
nav_bounds_for_editfield() {
  hierarchy="$1"; index="$2"
  python3 - "$hierarchy" "$index" <<'PY'
import re, sys
blob = open(sys.argv[1], encoding='utf-8', errors='replace').read()
want = int(sys.argv[2])
hits = []
for m in re.finditer(r'<node\b[^>]*\bclass="[^"]*EditText[^"]*"[^>]*>', blob):
    bm = re.search(r'\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', m.group(0))
    if bm:
        x1, y1, x2, y2 = map(int, bm.groups())
        hits.append(((x1 + x2) // 2, (y1 + y2) // 2))
if want >= len(hits):
    sys.exit(7)
print(f"{hits[want][0]} {hits[want][1]}")
PY
}

nav_tap_editfield() {
  serial="$1"; hierarchy="$2"; index="$3"
  coords="$(nav_bounds_for_editfield "$hierarchy" "$index" || true)"
  if [ -z "$coords" ]; then
    echo "[nav] FAIL: no EditText at index $index" >&2
    return 7
  fi
  x="${coords%% *}"; y="${coords##* }"
  echo "[nav] tap editfield[$index] at ($x,$y)"
  adb -s "$serial" shell input tap "$x" "$y"
}

# Tap at a coordinate. Accepts either "xpx,ypx" raw pixels or "xpct%,ypct%"
# screen-relative percentages. Per `maestro-tapon-by-text-misses-capacitor-
# webview-input-use-coord-tap`, Capacitor WebView inputs cannot be focused
# via uiautomator text-bounds; the visible input rect midpoint via coord
# tap is the reliable focus path.
nav_tap_coord() {
  serial="$1"; spec="$2"
  raw_x="${spec%%,*}"; raw_y="${spec##*,}"
  if [ "${raw_x: -1}" = "%" ] || [ "${raw_y: -1}" = "%" ]; then
    # Read screen size once per tap; cheap.
    size_line=$(adb -s "$serial" shell wm size | tr -d '\r' | sed -n 's/Physical size: //p')
    sw="${size_line%%x*}"; sh="${size_line##*x}"
    [ -z "$sw" ] || [ -z "$sh" ] && { echo "[nav] FAIL: could not read wm size" >&2; return 2; }
    px=$(awk -v p="${raw_x%\%}" -v s="$sw" 'BEGIN{printf "%d", p*s/100}')
    py=$(awk -v p="${raw_y%\%}" -v s="$sh" 'BEGIN{printf "%d", p*s/100}')
  else
    px="$raw_x"; py="$raw_y"
  fi
  echo "[nav] tap coord ($px,$py) from spec=$spec"
  adb -s "$serial" shell input tap "$px" "$py"
}

# Swipe up until a text/desc anchor is present in a fresh dump, then tap
# it. The below-the-fold answer that survives font_scale cells (a single
# fixed swipe missed Privacy policy at 2.0 on glovebox run 044508Z).
nav_scroll_tap() {
  serial="$1"; workdir="$2"; target="$3"; cap="${4:-5}"
  i=0
  while [ "$i" -le "$cap" ]; do
    nav_dump_hierarchy "$serial" "$workdir/_scroll.xml"
    if nav_anchors_present "$workdir/_scroll.xml" "$target"; then
      nav_tap_text "$serial" "$workdir/_scroll.xml" "${target#text:}"
      return $?
    fi
    i=$((i + 1))
    [ "$i" -gt "$cap" ] && break
    adb -s "$serial" shell input swipe 540 1700 540 900 350
    sleep 1.5
  done
  echo "[nav] FAIL: '$target' not found after $cap scroll(s)" >&2
  return 7
}

nav_swipe() {
  serial="$1"; direction="$2"
  case "$direction" in
    up)    adb -s "$serial" shell input swipe 540 1800 540 600 400 ;;
    down)  adb -s "$serial" shell input swipe 540 600 540 1800 400 ;;
    left)  adb -s "$serial" shell input swipe 900 1200 200 1200 400 ;;
    right) adb -s "$serial" shell input swipe 200 1200 900 1200 400 ;;
    *) echo "[nav] FAIL: unknown swipe direction '$direction'" >&2; return 2 ;;
  esac
  echo "[nav] swipe $direction"
}

nav_back() {
  serial="$1"
  adb -s "$serial" shell input keyevent 4
  echo "[nav] system back"
}

# Settle probe identical to the one in enumerate-android-native.sh.
# Caller passes a working dir; we return when screencap byte-size has
# converged or the hard cap (default 16 iterations * 1.5s = 24s) hits.
nav_settle() {
  serial="$1"; workdir="$2"; cap="${3:-16}"
  PREV=0; SAME=0
  i=0
  while [ "$i" -lt "$cap" ]; do
    i=$((i + 1))
    sleep 1.5
    adb -s "$serial" exec-out screencap -p > "$workdir/_probe.png" 2>/dev/null || true
    SIZE=$(wc -c < "$workdir/_probe.png" | tr -d ' ')
    if [ "$SIZE" -eq "$PREV" ] && [ "$SIZE" -gt 30000 ]; then
      SAME=$((SAME + 1))
      if [ "$SAME" -ge 2 ]; then
        echo "[nav] settled at iteration $i (size=$SIZE)"
        rm -f "$workdir/_probe.png"
        return 0
      fi
    else
      SAME=0
    fi
    PREV="$SIZE"
  done
  rm -f "$workdir/_probe.png"
  echo "[nav] WARN: settle cap reached (no convergence)" >&2
  return 1
}

# Returns 0 if all the listed text anchors are present in the hierarchy.
# Anchor format: "text:X" or "desc:X" or bare "X" (text).
nav_anchors_present() {
  hierarchy="$1"; shift
  for raw in "$@"; do
    case "$raw" in
      text:*) needle="${raw#text:}"; if ! grep -F -q "text=\"$needle\"" "$hierarchy"; then return 7; fi ;;
      desc:*) needle="${raw#desc:}"; if ! grep -F -q "content-desc=\"$needle\"" "$hierarchy"; then return 7; fi ;;
      *)      needle="$raw";        if ! grep -F -q "text=\"$needle\"" "$hierarchy" && ! grep -F -q "content-desc=\"$needle\"" "$hierarchy"; then return 7; fi ;;
    esac
  done
  return 0
}

# Hash a hierarchy file in a layout-stable way: strip volatile attrs and
# checksum the remainder. Used by D2 to detect "tap did nothing".
nav_hierarchy_signature() {
  hierarchy="$1"
  # Drop attributes that often change between identical UI states.
  sed -E 's/ index="[0-9]+"//g; s/ focusable="[a-z]+"//g; s/ focused="[a-z]+"//g; s/ selected="[a-z]+"//g' "$hierarchy" | shasum -a 256 | awk '{print $1}'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    tap_text)   shift; nav_tap_text "$@" ;;
    tap_coord)  shift; nav_tap_coord "$@" ;;
    swipe)      shift; nav_swipe "$@" ;;
    back)       shift; nav_back "$@" ;;
    settle)     shift; nav_settle "$@" ;;
    dump)       shift; nav_dump_hierarchy "$@" ;;
    anchors)    shift; nav_anchors_present "$@" ;;
    signature)  shift; nav_hierarchy_signature "$@" ;;
    *) echo "usage: $0 {tap_text|swipe|back|settle|dump|anchors|signature} ..." >&2; exit 2 ;;
  esac
fi
