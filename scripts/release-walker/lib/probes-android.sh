#!/usr/bin/env bash
# probes-android.sh - post-flow probes: persistence (D4) + forms (D6).
# Sourced by enumerate-android-native.sh after a flow's surfaces complete.
# Probes only WRITE artifacts; detectors d4/d6 read them and judge.
# Bash 3.2 portable.
set -euo pipefail

# Type into the focused field. input text rejects raw spaces; %s encodes
# them. Values are walker-authored (no shell metacharacters by policy).
probe_type_text() {
  serial="$1"; value="$2"
  encoded=$(printf '%s' "$value" | sed 's/ /%s/g')
  adb -s "$serial" shell input text "$encoded"
}

# --- persistence probes (D4 artifacts) --------------------------------------
# For every spec persistence claim with fires_after == this flow:
# kill the app (force-stop, NEVER pm clear), relaunch, settle, capture.
# d4-persistence.sh asserts the expected landing surface's anchors.
probe_persistence_for_flow() {
  serial="$1"; pkg="$2"; activity="$3"; parsed="$4"; flow_id="$5"; flow_dir="$6"; capture_sh="$7"

  idx=0
  python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
for i, p in enumerate(d.get('persistence') or []):
    if p.get('fires_after') == sys.argv[2]:
        print(i)
" "$parsed" "$flow_id" | while IFS= read -r claim_idx; do
    [ -z "$claim_idx" ] && continue
    PERSIST_DIR="$flow_dir/_persist-$claim_idx"
    mkdir -p "$PERSIST_DIR"

    CLAIM=$(python3 -c "import json,sys; print((json.load(open(sys.argv[1]))['persistence'][int(sys.argv[2])]).get('claim') or '')" "$parsed" "$claim_idx")
    EXPECT=$(python3 -c "import json,sys; print((json.load(open(sys.argv[1]))['persistence'][int(sys.argv[2])]).get('expect_landing_surface') or '')" "$parsed" "$claim_idx")
    CLEAR=$(python3 -c "import json,sys; print('1' if (json.load(open(sys.argv[1]))['persistence'][int(sys.argv[2])]).get('relaunch_clear_state') else '0')" "$parsed" "$claim_idx")

    echo "[probe-persist] claim='$CLAIM' expect_landing=$EXPECT"
    adb -s "$serial" shell am force-stop "$pkg" || true
    if [ "$CLEAR" = "1" ]; then
      adb -s "$serial" shell pm clear "$pkg" >/dev/null 2>&1 || true
    fi
    sleep 1
    if [ -n "$activity" ]; then
      adb -s "$serial" shell am start -n "$pkg/$activity" >/dev/null
    else
      adb -s "$serial" shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    fi
    nav_settle "$serial" "$PERSIST_DIR" 16 || echo "[probe-persist] WARN: no settle convergence" >&2
    "$capture_sh" "$serial" "$PERSIST_DIR" "_persist-$claim_idx"
    PID=$(adb -s "$serial" shell pidof "$pkg" 2>/dev/null | tr -d '\r' || true)
    echo "$PID" > "$PERSIST_DIR/pidof.txt"

    python3 -c "
import json, sys
json.dump({'claim': sys.argv[1], 'expect_landing_surface': sys.argv[2], 'flow': sys.argv[3]},
          open(sys.argv[4], 'w'), indent=2)
" "$CLAIM" "$EXPECT" "$flow_id" "$PERSIST_DIR/probe.json"
  done
}

# --- form runner (D6 artifacts) ----------------------------------------------
# Executes one spec form from the CURRENT surface. Fill targets resolve as
# text:<literal> (bounds tap) or coord:<x%,y%> (Capacitor inputs, per
# maestro-tapon-by-text-misses-capacitor-webview-input-use-coord-tap).
# After each fill the hierarchy is re-dumped and must contain the typed
# value somewhere; a silent-focus failure (soft keyboard never attached,
# the Coexist signin bug class) records fill_verified=false.
probe_run_form() {
  serial="$1"; parsed="$2"; form_id="$3"; flow_dir="$4"; capture_sh="$5"

  FORM_DIR="$flow_dir/_form-$form_id"
  mkdir -p "$FORM_DIR"

  FORM_JSON=$(python3 -c "import json,sys; print(json.dumps((json.load(open(sys.argv[1]))['forms']).get(sys.argv[2]) or {}))" "$parsed" "$form_id")
  if [ "$FORM_JSON" = "{}" ]; then
    echo "[probe-form] WARN: form '$form_id' not in spec; skipping" >&2
    return 0
  fi

  N_FIELDS=$(python3 -c "import json,sys; print(len((json.loads(sys.argv[1])).get('fill') or []))" "$FORM_JSON")
  SUBMIT=$(python3 -c "import json,sys; print((json.loads(sys.argv[1])).get('submit') or '')" "$FORM_JSON")
  WITHIN_MS=$(python3 -c "import json,sys; print(((json.loads(sys.argv[1])).get('expect') or {}).get('within_ms') or 8000)" "$FORM_JSON")

  FILL_VERIFIED=true
  i=0
  while [ "$i" -lt "$N_FIELDS" ]; do
    TARGET=$(python3 -c "import json,sys; print(((json.loads(sys.argv[1]))['fill'][int(sys.argv[2])]).get('target') or '')" "$FORM_JSON" "$i")
    VALUE=$(python3 -c "import json,sys; print(((json.loads(sys.argv[1]))['fill'][int(sys.argv[2])]).get('value') or '')" "$FORM_JSON" "$i")

    # Fresh hierarchy for target resolution (fields appear/move as the
    # keyboard attaches).
    nav_dump_hierarchy "$serial" "$FORM_DIR/_fill-$i-pre.xml"
    case "$TARGET" in
      coord:*)
        nav_tap_coord "$serial" "${TARGET#coord:}"
        ;;
      editfield:*)
        if ! nav_tap_editfield "$serial" "$FORM_DIR/_fill-$i-pre.xml" "${TARGET#editfield:}"; then
          echo "[probe-form] FAIL: fill target '$TARGET' unresolved" >&2
          FILL_VERIFIED=false
          break
        fi
        ;;
      text:*|desc:*)
        NEEDLE="${TARGET#text:}"; NEEDLE="${NEEDLE#desc:}"
        if ! nav_tap_text "$serial" "$FORM_DIR/_fill-$i-pre.xml" "$NEEDLE"; then
          echo "[probe-form] FAIL: fill target '$TARGET' unresolved" >&2
          FILL_VERIFIED=false
          break
        fi
        ;;
      *)
        echo "[probe-form] FAIL: unknown fill target syntax '$TARGET'" >&2
        FILL_VERIFIED=false
        break
        ;;
    esac
    sleep 1
    probe_type_text "$serial" "$VALUE"
    sleep 1

    # Focus probe: the typed value must surface in the hierarchy. EditText
    # exposes it as text=; WebView inputs surface a span. Password fields
    # mask, so only non-password values are asserted (heuristic: a field
    # whose target mentions 'assword' is exempt).
    nav_dump_hierarchy "$serial" "$FORM_DIR/_fill-$i-post.xml"
    case "$TARGET$VALUE" in
      *assword*) : ;;
      *)
        if ! grep -F -q "$VALUE" "$FORM_DIR/_fill-$i-post.xml"; then
          echo "[probe-form] FILL NOT VERIFIED: '$VALUE' absent post-typing (focus/keyboard failure?)" >&2
          FILL_VERIFIED=false
        fi
        ;;
    esac
    i=$((i + 1))
  done

  # Dismiss the soft keyboard so the submit control is tappable.
  adb -s "$serial" shell input keyevent 111 >/dev/null 2>&1 || true
  sleep 1

  SUBMITTED=false
  OBSERVED="none_within_budget"
  ELAPSED=0
  if [ "$FILL_VERIFIED" = true ] && [ -n "$SUBMIT" ]; then
    nav_dump_hierarchy "$serial" "$FORM_DIR/_submit-pre.xml"
    NEEDLE="${SUBMIT#text:}"; NEEDLE="${NEEDLE#desc:}"
    if nav_tap_text "$serial" "$FORM_DIR/_submit-pre.xml" "$NEEDLE"; then
      SUBMITTED=true
      # Poll for any_of anchors within the budget.
      DEADLINE_TICKS=$(( (WITHIN_MS + 1499) / 1500 ))
      t=0
      while [ "$t" -lt "$DEADLINE_TICKS" ]; do
        sleep 1.5
        t=$((t + 1))
        nav_dump_hierarchy "$serial" "$FORM_DIR/_poll.xml"
        HIT=$(python3 -c "
import json, re, sys
form = json.loads(sys.argv[1])
expect = form.get('expect') or {}
blob = open(sys.argv[2], encoding='utf-8').read()
for raw in (expect.get('any_of') or []):
    needle = raw.split(':', 1)[1] if ':' in raw else raw
    if f'text=\"{needle}\"' in blob or f'content-desc=\"{needle}\"' in blob or needle in blob:
        print(raw)
        break
" "$FORM_JSON" "$FORM_DIR/_poll.xml")
        if [ -n "$HIT" ]; then
          OBSERVED="$HIT"
          break
        fi
      done
      ELAPSED=$((t * 1500))
    else
      echo "[probe-form] FAIL: submit '$SUBMIT' unresolved" >&2
    fi
  fi

  "$capture_sh" "$serial" "$FORM_DIR" "_form-$form_id"

  python3 -c "
import json, sys
form = json.loads(sys.argv[1])
json.dump({
    'form_id': sys.argv[2],
    'fill_verified': sys.argv[3] == 'true',
    'submitted': sys.argv[4] == 'true',
    'observed': sys.argv[5],
    'elapsed_ms': int(sys.argv[6]),
    'expect': form.get('expect') or {},
}, open(sys.argv[7], 'w'), indent=2)
" "$FORM_JSON" "$form_id" "$FILL_VERIFIED" "$SUBMITTED" "$OBSERVED" "$ELAPSED" "$FORM_DIR/form-result.json"

  echo "[probe-form] $form_id fill_verified=$FILL_VERIFIED submitted=$SUBMITTED observed=$OBSERVED"
}
