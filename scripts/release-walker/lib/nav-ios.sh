#!/usr/bin/env bash
# nav-ios.sh - idb-driven nav for iOS.
# Mirrors the bash 3.2 portable shape of nav-android.sh.
set -euo pipefail

IDB="/Users/ecodia/Library/Python/3.9/bin/idb"

nav_ios_tap_text() {
  udid="$1"; hierarchy_json="$2"; text="$3"
  coords=$(python3 - "$hierarchy_json" "$text" <<'PY'
import json, sys
path, target = sys.argv[1], sys.argv[2]
with open(path) as f:
    tree = json.load(f)
hits = []
for n in tree if isinstance(tree, list) else []:
    if not isinstance(n, dict):
        continue
    label = n.get('AXLabel') or n.get('AXValue') or ''
    if label == target or target in (label or ''):
        f = n.get('frame') or {}
        try:
            cx = f['x'] + f['width']/2
            cy = f['y'] + f['height']/2
            hits.append((cx, cy, f.get('width', 0) * f.get('height', 0), label == target))
        except Exception:
            pass
if not hits:
    sys.exit(7)
# Prefer exact matches; among them prefer largest area.
hits.sort(key=lambda t: (-1 if t[3] else 0, -t[2]))
print(int(hits[0][0]), int(hits[0][1]))
PY
)
  if [ -z "$coords" ]; then
    echo "[nav-ios] FAIL: no node with text='$text'" >&2
    return 7
  fi
  x="${coords%% *}"; y="${coords##* }"
  echo "[nav-ios] tap text='$text' at ($x,$y)"
  "$IDB" ui tap --udid "$udid" "$x" "$y" >/dev/null 2>&1
}

nav_ios_tap_coord() {
  udid="$1"; spec="$2"
  raw_x="${spec%%,*}"; raw_y="${spec##*,}"
  if [ "${raw_x: -1}" = "%" ] || [ "${raw_y: -1}" = "%" ]; then
    # iPhone 17 / iPhone 15 logical points: most commonly 393x852.
    # Read from the application frame in describe-all if we need precision.
    sw=393; sh=852
    px=$(awk -v p="${raw_x%\%}" -v s="$sw" 'BEGIN{printf "%d", p*s/100}')
    py=$(awk -v p="${raw_y%\%}" -v s="$sh" 'BEGIN{printf "%d", p*s/100}')
  else
    px="$raw_x"; py="$raw_y"
  fi
  echo "[nav-ios] tap coord ($px,$py)"
  "$IDB" ui tap --udid "$udid" "$px" "$py" >/dev/null 2>&1
}

nav_ios_swipe() {
  udid="$1"; direction="$2"
  case "$direction" in
    up)    "$IDB" ui swipe --udid "$udid" 196 700 196 200 ;;
    down)  "$IDB" ui swipe --udid "$udid" 196 200 196 700 ;;
    left)  "$IDB" ui swipe --udid "$udid" 350 426 50 426 ;;
    right) "$IDB" ui swipe --udid "$udid" 50 426 350 426 ;;
    *) echo "[nav-ios] FAIL: unknown swipe direction '$direction'" >&2; return 2 ;;
  esac
  echo "[nav-ios] swipe $direction"
}

# iOS home button press.
nav_ios_home() {
  udid="$1"
  "$IDB" ui button --udid "$udid" HOME >/dev/null 2>&1 || true
  echo "[nav-ios] home"
}

nav_ios_settle() {
  udid="$1"; workdir="$2"; cap="${3:-16}"
  PREV=0; SAME=0
  i=0
  while [ "$i" -lt "$cap" ]; do
    i=$((i + 1))
    sleep 1.5
    xcrun simctl io "$udid" screenshot "$workdir/_probe.png" >/dev/null 2>&1 || true
    SIZE=$(wc -c < "$workdir/_probe.png" 2>/dev/null | tr -d ' ' || echo 0)
    if [ "$SIZE" = "$PREV" ] && [ "$SIZE" -gt 30000 ]; then
      SAME=$((SAME + 1))
      if [ "$SAME" -ge 2 ]; then
        echo "[nav-ios] settled at iteration $i (size=$SIZE)"
        rm -f "$workdir/_probe.png"
        return 0
      fi
    else
      SAME=0
    fi
    PREV="$SIZE"
  done
  rm -f "$workdir/_probe.png"
  echo "[nav-ios] WARN: settle cap reached" >&2
  return 1
}

nav_ios_hierarchy_signature() {
  hierarchy_json="$1"
  # Hash node count + ordered AXLabels for layout-stable signature.
  python3 -c "
import json, sys, hashlib
with open(sys.argv[1]) as f:
    tree = json.load(f)
labels = []
for n in tree if isinstance(tree, list) else []:
    if isinstance(n, dict):
        labels.append((n.get('AXLabel') or '') + '|' + (n.get('role') or ''))
h = hashlib.sha256('\n'.join(labels).encode()).hexdigest()
print(h)
" "$hierarchy_json"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    tap_text)   shift; nav_ios_tap_text "$@" ;;
    tap_coord)  shift; nav_ios_tap_coord "$@" ;;
    swipe)      shift; nav_ios_swipe "$@" ;;
    home)       shift; nav_ios_home "$@" ;;
    settle)     shift; nav_ios_settle "$@" ;;
    signature)  shift; nav_ios_hierarchy_signature "$@" ;;
    *) echo "usage: $0 {tap_text|tap_coord|swipe|home|settle|signature} ..." >&2; exit 2 ;;
  esac
fi
