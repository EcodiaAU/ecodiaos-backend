#!/usr/bin/env bash
# boot-device-ios.sh - boot the spec-declared iOS simulator.
# Per `namespaced-substrate-preflight` + `sim-driving-must-be-focusless`:
# refuses to drive a different sim than the spec declared.
set -euo pipefail

EXPECTED_SIM=$(python3 -c "
import sys, yaml
with open(sys.argv[1], encoding='utf-8') as f:
    spec = yaml.safe_load(f)
print(spec.get('ios_sim_name') or '')
" "$SPEC_PATH")

[ -z "$EXPECTED_SIM" ] && { echo "[boot-device-ios] FATAL: spec lacks ios_sim_name" >&2; exit 1; }

UDID=$(xcrun simctl list devices available -j 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devs in data.get('devices', {}).items():
    for d in devs:
        if d.get('name') == sys.argv[1]:
            print(d.get('udid'))
            sys.exit(0)
" "$EXPECTED_SIM")

[ -z "$UDID" ] && { echo "[boot-device-ios] FATAL: sim '$EXPECTED_SIM' not found" >&2; exit 1; }

STATE=$(xcrun simctl list devices -j 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devs in data.get('devices', {}).items():
    for d in devs:
        if d.get('udid') == sys.argv[1]:
            print(d.get('state', ''))
            sys.exit(0)
" "$UDID")

echo "[boot-device-ios] sim=$EXPECTED_SIM udid=$UDID state=$STATE"

if [ "$STATE" != "Booted" ]; then
  echo "[boot-device-ios] booting"
  xcrun simctl boot "$UDID" 2>&1
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 2
    S=$(xcrun simctl list devices -j 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devs in data.get('devices', {}).items():
    for d in devs:
        if d.get('udid') == sys.argv[1]:
            print(d.get('state', ''))
            sys.exit(0)
" "$UDID")
    [ "$S" = "Booted" ] && break
  done
fi

echo "$UDID" > "$RUN_DIR/udid.txt"
echo "$EXPECTED_SIM" > "$RUN_DIR/sim_name.txt"
echo "[boot-device-ios] ready: $UDID ($EXPECTED_SIM)"
