#!/usr/bin/env bash
# run-app-tests.sh - canonical mobile test runner (Maestro), thin glue only.
# Per patterns/maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10.md:
# runs every Maestro flow for an app, emits the verdict.json the ship gate
# (release-walker-ship-gate.py) reads. Anything beyond run+verdict belongs
# to Maestro itself, not here (anti-pattern: the deleted walker growing back).
#
# usage: run-app-tests.sh <app> [extra maestro args...]
set -euo pipefail

APP="${1:?app slug required (locals|coexist|glovebox|goodreach)}"
shift || true

RUNS_DIR="$HOME/.local/state/app-tests/runs"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${APP}-maestro"
RUN_DIR="$RUNS_DIR/$RUN_ID"
mkdir -p "$RUN_DIR"

MAESTRO="/Users/ecodia/.maestro/bin/maestro"
KV="/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror"

# app -> flow dirs (three-native apps carry flows per platform repo).
flow_dirs() {
  case "$1" in
    coexist)   echo "/Users/ecodia/.code/coexist/.maestro/flows" ;;
    locals)    echo "/Users/ecodia/.code/locals-android/.maestro/flows /Users/ecodia/.code/locals-ios/.maestro/flows" ;;
    glovebox)  echo "/Users/ecodia/.code/glovebox-android/.maestro/flows /Users/ecodia/.code/glovebox-ios/.maestro/flows" ;;
    goodreach) echo "/Users/ecodia/.code/goodreach/.maestro/flows" ;;
    *) echo "FATAL: unknown app '$1'" >&2; return 1 ;;
  esac
}

# Env-injected creds per app; flows reference these names, never literals.
load_creds() {
  case "$1" in
    coexist)
      export MAESTRO_CX_EMAIL=$(jq -r '.email' "$KV/coexist.json")
      export MAESTRO_CX_PASSWORD=$(jq -r '.password' "$KV/coexist.json")
      ;;
    goodreach)
      export MAESTRO_GR_EMAIL="demo@goodreach.com.au"
      export MAESTRO_GR_PASSWORD=$(jq -r '.password // empty' "$KV/goodreach.json" 2>/dev/null || true)
      ;;
    locals)
      export MAESTRO_LC_EMAIL=$(jq -r '.email' "$KV/locals.json")
      export MAESTRO_LC_PASSWORD=$(jq -r '.password' "$KV/locals.json")
      ;;
    glovebox)
      export MAESTRO_GB_EMAIL=$(jq -r '.email' "$KV/glovebox.json")
      export MAESTRO_GB_PASSWORD=$(jq -r '.password' "$KV/glovebox.json")
      ;;
    *) : ;;
  esac
}

# Device orchestration (environment glue, not test logic): boot the
# app's AVD when no matching emulator is up. Refuses a mismatched one.
avd_for() {
  case "$1" in
    coexist) echo coexist_aosp ;;
    locals) echo locals_pixel ;;
    glovebox) echo glovebox_pixel ;;
    *) echo "" ;;
  esac
}

ensure_android_device() {
  WANT=$(avd_for "$APP"); [ -z "$WANT" ] && return 0
  SERIAL=$(adb devices | awk "/emulator-[0-9]+\tdevice/{print \$1; exit}")
  if [ -n "$SERIAL" ]; then
    HAVE=$(adb -s "$SERIAL" emu avd name 2>/dev/null | head -1 | tr -d "\r")
    if [ "$HAVE" = "$WANT" ]; then return 0; fi
    echo "[app-tests] FATAL: emulator $SERIAL runs avd $HAVE, need $WANT; kill it first" >&2
    return 2
  fi
  echo "[app-tests] booting $WANT (headless)"
  EMU=/opt/homebrew/share/android-commandlinetools/emulator/emulator
  nohup "$EMU" -avd "$WANT" -no-window -no-audio -no-snapshot-save -gpu swiftshader_indirect >/tmp/app-tests-emu.log 2>&1 &
  i=0
  while [ "$i" -lt 60 ]; do
    i=$((i + 1)); sleep 3
    SERIAL=$(adb devices | awk "/emulator-[0-9]+\tdevice/{print \$1; exit}")
    [ -n "$SERIAL" ] && BC=$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d "\r") && [ "$BC" = "1" ] && return 0
  done
  echo "[app-tests] FATAL: $WANT did not boot" >&2
  return 2
}

load_creds "$APP"
ensure_android_device

TOTAL=0
FAILED=0
for DIR in $(flow_dirs "$APP"); do
  [ -d "$DIR" ] || continue
  for FLOW in "$DIR"/*.yaml; do
    [ -f "$FLOW" ] || continue
    TOTAL=$((TOTAL + 1))
    NAME=$(basename "$FLOW" .yaml)
    echo "[app-tests] $APP :: $NAME"
    if "$MAESTRO" test "$FLOW" --debug-output "$RUN_DIR/$NAME" "$@" > "$RUN_DIR/$NAME.log" 2>&1; then
      echo "  pass"
    else
      FAILED=$((FAILED + 1))
      echo "  FAIL (log: $RUN_DIR/$NAME.log)"
    fi
  done
done

if [ "$TOTAL" -eq 0 ]; then
  STATUS="no_flows"
  PRIORITY=2
elif [ "$FAILED" -eq 0 ]; then
  STATUS="green"
  PRIORITY=3
else
  STATUS="findings"
  PRIORITY=2
fi

cat > "$RUN_DIR/verdict.json" <<JSON
{
  "row_id": "apptest:${APP}:${RUN_ID}",
  "entity_type": "task",
  "title": "app-tests ${APP} maestro ${RUN_ID}",
  "priority": $PRIORITY,
  "status": "$STATUS",
  "next_action_by": "ecodiaos",
  "notes": "flows=$TOTAL failed=$FAILED; run $RUN_ID",
  "finding_count": $FAILED,
  "flows_total": $TOTAL,
  "run_dir": "$RUN_DIR"
}
JSON

echo "[app-tests] $APP: $STATUS (flows=$TOTAL failed=$FAILED) verdict=$RUN_DIR/verdict.json"
[ "$STATUS" = "green" ]
