#!/usr/bin/env bash
# state-ios.sh - simulator state primitives for the matrix layer.
# Per STATE-MATRIX.md Section 1: network shaping has NO per-sim primitive;
# any network dim reaching this layer is logged skipped, never faked.
# Bash 3.2 portable.
set -euo pipefail

_cell_get_ios() {
  python3 -c "import json,sys; print(json.loads(sys.argv[1]).get(sys.argv[2]) or '')" "$1" "$2"
}

_cell_perm_dims_ios() {
  python3 -c "import json,sys; print(' '.join(k for k in json.loads(sys.argv[1]) if k.startswith('permission.')))" "$1"
}

_perm_service_ios() {
  python3 -c "
import json, sys
m = json.loads(sys.argv[1]).get(sys.argv[2]) or {}
print(m.get('ios') or '')
" "$1" "$2"
}

_state_log_ios() {
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
" "$1" "$2" "$3" "$4"
}

# font_scale variants map onto simctl content-size names.
_content_size_for_scale() {
  case "$1" in
    1.0) echo medium ;;
    1.3) echo extra-large ;;
    2.0) echo accessibility-extra-large ;;
    *)   echo "" ;;
  esac
}

state_ios_apply_device() {
  udid="$1"; cell_json="$2"; log_dest="${3:-/dev/null}"

  v="$(_cell_get_ios "$cell_json" appearance)"
  if [ -n "$v" ]; then
    xcrun simctl ui "$udid" appearance "$v"
    echo "[state-ios] appearance=$v"
    [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" appearance "$v" applied
  fi

  v="$(_cell_get_ios "$cell_json" font_scale)"
  if [ -n "$v" ]; then
    size="$(_content_size_for_scale "$v")"
    if [ -z "$size" ]; then
      echo "[state-ios] WARN: no content-size mapping for font_scale=$v; skipped" >&2
      [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" font_scale "$v" skipped_no_mapping
    elif xcrun simctl ui "$udid" content_size "$size" 2>/dev/null; then
      echo "[state-ios] content_size=$size (font_scale=$v)"
      [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" font_scale "$v" applied
    else
      echo "[state-ios] WARN: simctl ui content_size unsupported on this Xcode; skipped" >&2
      [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" font_scale "$v" skipped_unsupported
    fi
  fi

  v="$(_cell_get_ios "$cell_json" network)"
  if [ -n "$v" ] && [ "$v" != "online" ]; then
    # No per-sim network primitive exists. Honest skip, surfaced in report.
    echo "[state-ios] network=$v UNSUPPORTED on iOS sim; cell runs online" >&2
    [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" network "$v" skipped_unsupported
  fi
}

state_ios_apply_app() {
  udid="$1"; bundle="$2"; cell_json="$3"; perm_map_json="$4"; log_dest="${5:-/dev/null}"

  for dim in $(_cell_perm_dims_ios "$cell_json"); do
    group="${dim#permission.}"
    variant="$(_cell_get_ios "$cell_json" "$dim")"
    service="$(_perm_service_ios "$perm_map_json" "$group")"
    if [ -z "$service" ]; then
      echo "[state-ios] WARN: no ios privacy service mapped for '$group'; skipping" >&2
      [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" "$dim" "$variant" skipped_no_mapping
      continue
    fi
    case "$variant" in
      granted)     xcrun simctl privacy "$udid" grant  "$service" "$bundle" ;;
      denied)      xcrun simctl privacy "$udid" revoke "$service" "$bundle" ;;
      never_asked) xcrun simctl privacy "$udid" reset  "$service" "$bundle" ;;
      *) echo "[state-ios] unknown permission variant '$variant'" >&2; return 2 ;;
    esac
    echo "[state-ios] $dim=$variant (service=$service)"
    [ "$log_dest" != /dev/null ] && _state_log_ios "$log_dest" "$dim" "$variant" applied
  done
}

state_ios_reset() {
  udid="$1"
  xcrun simctl ui "$udid" appearance light 2>/dev/null || true
  xcrun simctl ui "$udid" content_size medium 2>/dev/null || true
  echo "[state-ios] reset to defaults (light, medium content size)"
}

# Dismiss a lingering system permission alert. SpringBoard alerts survive
# app terminate, so a never_asked cell's prompt occludes every later
# cell's tree (observed run 20260610T001949Z: all 6 cells captured the
# same 6-node dialog). Taps "Don't Allow" when present; the cell's own
# privacy apply afterwards sets the intended TCC state regardless.
state_ios_dismiss_alert() {
  udid="$1"
  IDB="/Users/ecodia/Library/Python/3.9/bin/idb"
  coords=$("$IDB" ui describe-all --udid "$udid" 2>/dev/null | python3 -c "
import json, sys
try:
    tree = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for n in tree if isinstance(tree, list) else []:
    if isinstance(n, dict) and (n.get('AXLabel') or '') in (\"Don't Allow\", 'Don’t Allow'):
        f = n.get('frame') or {}
        try:
            print(int(f['x'] + f['width'] / 2), int(f['y'] + f['height'] / 2))
        except Exception:
            pass
        break
")
  if [ -n "$coords" ]; then
    x="${coords%% *}"; y="${coords##* }"
    echo "[state-ios] dismissing lingering permission alert at ($x,$y)"
    "$IDB" ui tap --udid "$udid" "$x" "$y" >/dev/null 2>&1 || true
    sleep 1
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    apply_device)  shift; state_ios_apply_device "$@" ;;
    apply_app)     shift; state_ios_apply_app "$@" ;;
    reset)         shift; state_ios_reset "$@" ;;
    dismiss_alert) shift; state_ios_dismiss_alert "$@" ;;
    *) echo "usage: $0 {apply_device <udid> <cell-json> [log]|apply_app <udid> <bundle> <cell-json> <perm-map-json> [log]|reset <udid>|dismiss_alert <udid>}" >&2; exit 2 ;;
  esac
fi
