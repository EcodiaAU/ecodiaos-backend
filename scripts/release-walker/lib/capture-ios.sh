#!/usr/bin/env bash
# capture-ios.sh - simctl screenshot + idb describe-all -> hierarchy.json
# Also emits hierarchy.xml in the uiautomator format so detectors built
# for Android can grep identically.
set -euo pipefail

UDID="${1:?udid}"; DEST="${2:?dest dir}"; LABEL="${3:?label}"
IDB="/Users/ecodia/Library/Python/3.9/bin/idb"
mkdir -p "$DEST"

xcrun simctl io "$UDID" screenshot "$DEST/screen.png" >/dev/null 2>&1 || true

# describe-all gives the live AX tree as JSON.
"$IDB" ui describe-all --udid "$UDID" > "$DEST/hierarchy.json" 2>/dev/null || true

# Translate to a flat hierarchy.xml that detectors greps work against.
# Frame format mirrors uiautomator: bounds="[x1,y1][x2,y2]".
python3 - "$DEST/hierarchy.json" "$DEST/hierarchy.xml" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
try:
    with open(src) as f:
        tree = json.load(f)
except Exception:
    tree = []
def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<hierarchy>']
nodes = tree if isinstance(tree, list) else []
for n in nodes:
    if not isinstance(n, dict):
        continue
    label = n.get('AXLabel') or ''
    value = n.get('AXValue') or ''
    role = n.get('role') or ''
    f = n.get('frame') or {}
    try:
        x1 = int(f['x']); y1 = int(f['y'])
        x2 = int(f['x'] + f['width']); y2 = int(f['y'] + f['height'])
        bounds = f'[{x1},{y1}][{x2},{y2}]'
    except Exception:
        bounds = '[0,0][0,0]'
    enabled = 'true' if n.get('enabled') else 'false'
    cl = 'true' if role in ('AXButton', 'AXLink', 'AXPopUpButton') else 'false'
    lines.append(f'<node class="{esc(role)}" text="{esc(label)}" content-desc="{esc(value)}" clickable="{cl}" enabled="{enabled}" bounds="{bounds}" />')
lines.append('</hierarchy>')
with open(dst, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
PY

# Element flat list (text|content-desc|bounds) for the detector.
grep -oE 'text="[^"]+"' "$DEST/hierarchy.xml" 2>/dev/null > "$DEST/elements.txt" || : > "$DEST/elements.txt"

echo "[capture-ios] $LABEL screen=$DEST/screen.png nodes=$(jq 'length' "$DEST/hierarchy.json" 2>/dev/null || echo '?')"
