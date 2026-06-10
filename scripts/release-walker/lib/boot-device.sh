#!/usr/bin/env bash
# boot-device.sh - boot ONE device per walker run, owned, no pool.
# Per `namespaced-substrate-preflight` doctrine, the AVD name is required
# from the spec; the walker refuses to drive an emulator whose AVD does
# not match the one the spec declares.
set -euo pipefail

PLATFORM="${1:?platform required (android|ios)}"

if [ "$PLATFORM" != "android" ]; then
  echo "[boot-device] platform=$PLATFORM not supported in Phase 1/2A" >&2
  exit 1
fi

# Pull the spec-declared AVD via the Python helper (PyYAML available per
# Phase 2A audit). The spec field is `android_avd:` at root.
EXPECTED_AVD=$(python3 -c "
import sys, yaml
with open(sys.argv[1], encoding='utf-8') as f:
    spec = yaml.safe_load(f)
print(spec.get('android_avd') or '')
" "$SPEC_PATH")

if [ -z "$EXPECTED_AVD" ]; then
  echo "[boot-device] FATAL: spec lacks android_avd: <name>; refusing to guess" >&2
  exit 1
fi

# Inspect every running emulator. If the requested AVD is already up, use
# that serial. If a DIFFERENT AVD is running, fail loudly so the conductor
# decides whether to kill it (per the parallel-chat-collision doctrine,
# the walker must never silently steal an emulator another session owns).
RUNNING_SERIAL=""
MISMATCHED=""
for serial in $(adb devices | awk '/emulator-[0-9]+\tdevice/ {print $1}'); do
  # AVD name is read from the emulator console via `adb emu avd name`.
  port="${serial#emulator-}"
  name=$(adb -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r' || true)
  echo "[boot-device] running: $serial (avd=$name)"
  if [ "$name" = "$EXPECTED_AVD" ]; then
    RUNNING_SERIAL="$serial"
    break
  else
    MISMATCHED="$MISMATCHED $serial=$name"
  fi
done

if [ -n "$RUNNING_SERIAL" ]; then
  SERIAL="$RUNNING_SERIAL"
  echo "[boot-device] using already-booted $SERIAL (avd=$EXPECTED_AVD)"
elif [ -n "$MISMATCHED" ]; then
  echo "[boot-device] FATAL: expected avd '$EXPECTED_AVD' but found running:$MISMATCHED" >&2
  echo "[boot-device] kill the conflicting emulator with 'adb -s <serial> emu kill' or boot the right AVD manually" >&2
  exit 2
else
  AVD="$EXPECTED_AVD"
  echo "[boot-device] booting $AVD (focusless: -no-window -no-audio -gpu swiftshader_indirect)"
  EMU="$ANDROID_HOME/emulator/emulator"
  [ -x "$EMU" ] || EMU="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}/emulator/emulator"
  "$EMU" -avd "$AVD" -no-window -no-audio -no-snapshot-save -gpu swiftshader_indirect -netdelay none -netspeed full > "$RUN_DIR/emu.log" 2>&1 &
  SERIAL=""
  for i in {1..60}; do
    sleep 2
    SERIAL="$(adb devices | awk '/emulator-[0-9]+\tdevice/ {print $1; exit}')"
    [ -n "$SERIAL" ] && break
  done
  [ -z "$SERIAL" ] && { echo "[boot-device] emulator did not appear" >&2; exit 1; }
  echo "[boot-device] waiting for boot complete on $SERIAL"
  adb -s "$SERIAL" wait-for-device
  for i in {1..60}; do
    BC="$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    [ "$BC" = "1" ] && break
    sleep 2
  done
fi

echo "$SERIAL" > "$RUN_DIR/serial.txt"
echo "[boot-device] ready: $SERIAL (avd=$EXPECTED_AVD)"
