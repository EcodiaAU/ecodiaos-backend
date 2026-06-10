#!/usr/bin/env bash
# shoot.sh <alias> <outfile> [fullPage]
# Captures a CDP pageScreenshot and decodes the base64 to a PNG on disk.
set -euo pipefail
ALIAS="$1"; OUT="$2"; FULL="${3:-false}"
cd "D:/.code/EcodiaOS/backend"
bash scripts/agent cdp.pageScreenshot "{\"alias\":\"$ALIAS\",\"fullPage\":$FULL}" 2>/dev/null \
  | grep -o '{.*}' \
  | python -c "
import sys, json, base64
d = json.load(sys.stdin)
r = d.get('result', d)
img = r.get('image')
if not img:
    print('NO_IMAGE: ' + json.dumps(d)[:300]); sys.exit(1)
raw = base64.b64decode(img)
open(r'''$OUT''', 'wb').write(raw)
print('WROTE %d bytes -> $OUT' % len(raw))
"
