#!/usr/bin/env bash
# cap-ipad.sh <outfile>
# Captures a CDP pageScreenshot via the eos-main-chambers-ipad alias and decodes
# the base64 to a PNG on disk, then reports the PNG dimensions.
set -euo pipefail
OUT="$1"
ALIAS="eos-main-chambers-ipad"
cd "D:/.code/EcodiaOS/backend"
bash scripts/agent cdp.pageScreenshot "{\"alias\":\"$ALIAS\",\"fullPage\":false}" 2>/dev/null \
  | grep -o '{.*}' \
  | python -c "
import sys, json, base64, struct
d = json.load(sys.stdin)
r = d.get('result', d)
img = r.get('image')
if not img:
    print('NO_IMAGE: ' + json.dumps(d)[:300]); sys.exit(1)
raw = base64.b64decode(img)
open(r'''$OUT''', 'wb').write(raw)
# read PNG dimensions from IHDR
w, h = struct.unpack('>II', raw[16:24])
print('WROTE %d bytes  %dx%d  -> $OUT' % (len(raw), w, h))
"
