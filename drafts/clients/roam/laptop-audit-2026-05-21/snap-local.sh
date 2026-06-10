#!/bin/bash
# Usage: ./snap-local.sh <route_path> <out_filename>
ROUTE="${1:-/}"
OUT="${2:-screenshot.png}"
DIR="D:/.code/ecodiaos/backend/drafts/roam-laptop-audit-2026-05-21"
URL="http://localhost:3000${ROUTE}"

curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"cdp.navigate\",\"params\":{\"target\":{\"alias\":\"roam\"},\"url\":\"$URL\",\"waitUntil\":\"networkidle0\"}}" > /dev/null

sleep 3

curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"cdp.pageScreenshot\",\"params\":{\"target\":{\"alias\":\"roam\"},\"fullPage\":true}}" \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('$DIR/$OUT','wb').write(base64.b64decode(d['result']['image']))"

echo "Saved $DIR/$OUT"
