#!/bin/bash
# Usage: ./snap-v2.sh <route> <out> [host]
# Re-attaches CDP each call (alias keeps dropping), sets viewport, navigates, screenshots.
ROUTE="${1:-/}"
OUT="${2:-shot.png}"
HOST="${3:-http://localhost:3000}"
DIR="D:/.code/ecodiaos/backend/drafts/roam-laptop-audit-2026-05-21"
URL="${HOST}${ROUTE}"

AGENT="http://100.114.219.69:7456/api/tool"
post() { curl -s -X POST "$AGENT" -H "Content-Type: application/json" -d "$1"; }

# Find any tab where URL contains localhost:3000 OR title is Nav./Roam
TARGET=$(post '{"tool":"cdp.listTabs","params":{}}' \
  | python3 -c "import sys,json; t=json.load(sys.stdin)['result']['tabs']; r=[x for x in t if 'localhost:3000' in x.get('url','') or x.get('title','').lower() in ('roam','nav.')]; print(r[0]['targetId'] if r else '')")

if [ -z "$TARGET" ]; then
  echo "no roam tab found" >&2
  exit 2
fi

post "{\"tool\":\"cdp.attach_tab\",\"params\":{\"alias\":\"roam\",\"targetId\":\"$TARGET\"}}" > /dev/null
post '{"tool":"cdp.viewport","params":{"target":{"alias":"roam"},"width":1440,"height":900,"deviceScaleFactor":1,"mobile":false}}' > /dev/null
post "{\"tool\":\"cdp.navigate\",\"params\":{\"target\":{\"alias\":\"roam\"},\"url\":\"$URL\",\"waitUntil\":\"networkidle0\"}}" > /dev/null
sleep 3

RESP=$(post '{"tool":"cdp.pageScreenshot","params":{"target":{"alias":"roam"},"fullPage":true}}')
echo "$RESP" | python3 -c "
import sys,json,base64
d = json.loads(sys.stdin.read())
img = d.get('result',{}).get('image')
if not img:
    print('NO IMAGE in response:', d, file=sys.stderr)
    sys.exit(3)
open('$DIR/$OUT','wb').write(base64.b64decode(img))
print('saved $DIR/$OUT')
"
