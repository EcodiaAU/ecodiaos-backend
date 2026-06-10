#!/usr/bin/env bash
# runjs.sh <jsfile>
# Reads JS from a file, sends it via cdp.runJs on the iPad alias, prints the value.
set -euo pipefail
JSFILE="$1"
ALIAS="eos-main-chambers-ipad"
cd "D:/.code/EcodiaOS/backend"
PAYLOAD=$(python -c "
import json,sys
js = open(r'''$JSFILE''',encoding='utf-8').read()
print(json.dumps({'alias':'$ALIAS','js':js}))
")
bash scripts/agent cdp.runJs "$PAYLOAD" 2>/dev/null | grep -o '{.*}' | python -c "
import sys,json
d=json.load(sys.stdin); r=d.get('result',d); v=r.get('value',r)
print(v if isinstance(v,str) else json.dumps(v))
"
