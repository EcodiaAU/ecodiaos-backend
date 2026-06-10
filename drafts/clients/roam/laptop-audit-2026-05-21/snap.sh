#!/bin/bash
# Usage: ./snap.sh <route_path> <out_filename>
# Navigates the existing 'roam' CDP alias to https://nav.ecodia.au<route> and saves a screenshot
ROUTE="${1:-/}"
OUT="${2:-screenshot.png}"
DIR="D:/.code/ecodiaos/backend/drafts/roam-laptop-audit-2026-05-21"
URL="https://nav.ecodia.au${ROUTE}"

curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"cdp.navigate\",\"params\":{\"target\":{\"alias\":\"roam\"},\"url\":\"$URL\",\"waitUntil\":\"networkidle0\"}}" > /dev/null

sleep 2

curl -s -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"cdp.pageScreenshot\",\"params\":{\"target\":{\"alias\":\"roam\"},\"fullPage\":true}}" \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('$DIR/$OUT','wb').write(base64.b64decode(d['result']['image']))"

echo "Saved $DIR/$OUT"
