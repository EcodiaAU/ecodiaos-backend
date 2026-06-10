#!/usr/bin/env bash
# state-android.sh - device/app state primitives for the matrix layer.
# Per STATE-MATRIX.md Section 3: device-scope state applies once per cell
# (survives pm clear); app-scope state re-applies after every pm clear,
# because pm clear resets runtime permission grants. Bash 3.2 portable.
set -euo pipefail

# Read one dimension value out of the cell JSON. Empty string when absent.
_cell_get() {
  cell_json="$1"; dim="$2"
  python3 -c "import json,sys; print(json.loads(sys.argv[1]).get(sys.argv[2]) or '')" "$cell_json" "$dim"
}

# List permission dims present in the cell (names like permission.location).
_cell_perm_dims() {
  cell_json="$1"
  python3 -c "import json,sys; print(' '.join(k for k in json.loads(sys.argv[1]) if k.startswith('permission.')))" "$cell_json"
}

# Android permission ids for a symbolic group, from the spec permission map.
_perm_ids_android() {
  perm_map_json="$1"; group="$2"
  python3 -c "
import json, sys
m = json.loads(sys.argv[1]).get(sys.argv[2]) or {}
ids = m.get('android') or []
print(' '.join(ids if isinstance(ids, list) else [ids]))
" "$perm_map_json" "$group"
}

# Record what was applied (and what was skipped) for the run report.
_state_log() {
  dest="$1"; key="$2"; val="$3"; status="$4"
  python3 -c "
import json, os, sys
p = sys.argv[1]
d = {}
if os.path.exists(p):
    with open(p) as f:
        d = json.load(f)
d[sys.argv[2]] = {'value': sys.argv[3], 'status': sys.argv[4]}
with open(p, 'w') as f:
    json.dump(d, f, indent=2)
" "$dest" "$key" "$val" "$status"
}

# --- device scope: appearance, font_scale, network -------------------------

state_android_apply_device() {
  serial="$1"; cell_json="$2"; log_dest="${3:-/dev/null}"

  v="$(_cell_get "$cell_json" appearance)"
  if [ -n "$v" ]; then
    case "$v" in
      dark)  adb -s "$serial" shell cmd uimode night yes >/dev/null ;;
      light) adb -s "$serial" shell cmd uimode night no  >/dev/null ;;
      *) echo "[state-android] unknown appearance '$v'" >&2; return 2 ;;
    esac
    echo "[state-android] appearance=$v"
    [ "$log_dest" != /dev/null ] && _state_log "$log_dest" appearance "$v" applied
  fi

  v="$(_cell_get "$cell_json" font_scale)"
  if [ -n "$v" ]; then
    adb -s "$serial" shell settings put system font_scale "$v" >/dev/null
    echo "[state-android] font_scale=$v"
    [ "$log_dest" != /dev/null ] && _state_log "$log_dest" font_scale "$v" applied
  fi

  v="$(_cell_get "$cell_json" network)"
  if [ -n "$v" ]; then
    case "$v" in
      online)
        adb -s "$serial" shell svc wifi enable >/dev/null 2>&1 || true
        adb -s "$serial" shell svc data enable >/dev/null 2>&1 || true
        adb -s "$serial" emu network speed full >/dev/null 2>&1 || true
        adb -s "$serial" emu network delay none >/dev/null 2>&1 || true
        ;;
      offline)
        adb -s "$serial" shell svc wifi disable >/dev/null 2>&1 || true
        adb -s "$serial" shell svc data disable >/dev/null 2>&1 || true
        ;;
      slow)
        # Emulator-console shaping; AVD-only by design (our fleet is AVDs).
        adb -s "$serial" shell svc wifi enable >/dev/null 2>&1 || true
        adb -s "$serial" shell svc data enable >/dev/null 2>&1 || true
        adb -s "$serial" emu network speed edge >/dev/null 2>&1 || true
        adb -s "$serial" emu network delay umts >/dev/null 2>&1 || true
        ;;
      *) echo "[state-android] unknown network '$v'" >&2; return 2 ;;
    esac
    echo "[state-android] network=$v"
    [ "$log_dest" != /dev/null ] && _state_log "$log_dest" network "$v" applied
    # Connectivity transitions need a beat before launch; the framework
    # broadcasts CONNECTIVITY_CHANGE asynchronously.
    sleep 2
  fi
}

# --- app scope: permissions (re-apply after every pm clear) -----------------

state_android_apply_app() {
  serial="$1"; pkg="$2"; cell_json="$3"; perm_map_json="$4"; log_dest="${5:-/dev/null}"

  for dim in $(_cell_perm_dims "$cell_json"); do
    group="${dim#permission.}"
    variant="$(_cell_get "$cell_json" "$dim")"
    ids="$(_perm_ids_android "$perm_map_json" "$group")"
    if [ -z "$ids" ]; then
      echo "[state-android] WARN: no android permission ids mapped for '$group'; skipping" >&2
      [ "$log_dest" != /dev/null ] && _state_log "$log_dest" "$dim" "$variant" skipped_no_mapping
      continue
    fi
    for perm in $ids; do
      case "$variant" in
        granted)
          adb -s "$serial" shell pm grant "$pkg" "$perm" >/dev/null 2>&1 || \
            echo "[state-android] WARN: pm grant $perm failed (not a runtime perm on this API?)" >&2
          ;;
        denied)
          # Hard-denied customer: revoked + user-set/user-fixed so the app
          # sees the no-rationale path (cannot re-prompt).
          adb -s "$serial" shell pm revoke "$pkg" "$perm" >/dev/null 2>&1 || true
          adb -s "$serial" shell pm set-permission-flags "$pkg" "$perm" user-set user-fixed >/dev/null 2>&1 || true
          ;;
        never_asked)
          adb -s "$serial" shell pm revoke "$pkg" "$perm" >/dev/null 2>&1 || true
          adb -s "$serial" shell pm clear-permission-flags "$pkg" "$perm" user-set user-fixed >/dev/null 2>&1 || true
          ;;
        *) echo "[state-android] unknown permission variant '$variant'" >&2; return 2 ;;
      esac
    done
    echo "[state-android] $dim=$variant (${ids})"
    [ "$log_dest" != /dev/null ] && _state_log "$log_dest" "$dim" "$variant" applied
  done
}

# --- reset: leave the shared emulator the way the next run expects it ------

state_android_reset() {
  serial="$1"
  adb -s "$serial" shell cmd uimode night no >/dev/null 2>&1 || true
  adb -s "$serial" shell settings put system font_scale 1.0 >/dev/null 2>&1 || true
  adb -s "$serial" shell svc wifi enable >/dev/null 2>&1 || true
  adb -s "$serial" shell svc data enable >/dev/null 2>&1 || true
  adb -s "$serial" emu network speed full >/dev/null 2>&1 || true
  adb -s "$serial" emu network delay none >/dev/null 2>&1 || true
  echo "[state-android] reset to defaults (light, font 1.0, online)"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    apply_device) shift; state_android_apply_device "$@" ;;
    apply_app)    shift; state_android_apply_app "$@" ;;
    reset)        shift; state_android_reset "$@" ;;
    *) echo "usage: $0 {apply_device <serial> <cell-json> [log]|apply_app <serial> <pkg> <cell-json> <perm-map-json> [log]|reset <serial>}" >&2; exit 2 ;;
  esac
fi
