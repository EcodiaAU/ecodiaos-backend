#!/usr/bin/env bash
# router-skip-check.sh
#
# PreToolUse hook for mcp__forks__spawn_fork and Agent (subagent delegation).
#
# Warns with [ROUTER-SKIP WARN] when the conductor dispatches a fork or subagent
# WITHOUT having called mcp__router__route_work in the same turn. The router is
# a cheap deterministic tool — skipping it is a habit, not a justified choice.
#
# Warn-only. Never blocks. Exits 0 always.
#
# Surfaces:
#   ~/ecodiaos/CLAUDE.md  "Routing decisions are silent"
#   ~/ecodiaos/src/services/capabilityRouter.js
#
# Wired in ~/.claude/settings.json PreToolUse for:
#   mcp__forks__spawn_fork
#   Agent
#
# Detection strategy:
#   Reads the raw tool input JSON from stdin. If the tool_name does not include
#   "route_work" in the recent conversation, we cannot verify from hook context
#   whether route_work was called this turn — hooks don't receive prior turn state.
#   Instead we check the tool input for a special bypass marker field
#   (_router_called: true) OR we check if the brief/args contain the string
#   "route:" (which would be present if the conductor pasted route_work output).
#   This is heuristic-only; the hook warns when neither signal is present.
#   False-positive rate is expected to be low once the conductor adopts the habit.
#
# Bypass:
#   Include `_router_called: true` in the tool input (spawn_fork/Agent args) to
#   suppress the warn when you have intentionally called route_work already and
#   the hook can't detect it from input alone.
#   OR include the string "route:" anywhere in the brief (route_work output copy).

set -u

# ── Perf telemetry (mirrors brief-consistency-check.sh pattern) ─────────────
PERF_LIB="$(dirname "$0")/lib/emit-perf.sh"
if [ -f "$PERF_LIB" ]; then
  # shellcheck disable=SC1090
  source "$PERF_LIB"
  _perf_start=$(perf_now_ms 2>/dev/null || echo 0)
else
  _perf_start=0
fi

emit_perf_safe "hook:router-skip-check" 0 "started" "" '{}'

_perf_done_ok() {
  local _end
  _end=$(perf_now_ms 2>/dev/null || echo 0)
  emit_perf_safe "hook:router-skip-check" "$((_end - _perf_start))" "ok" "" '{}'
}
trap '_perf_done_ok' EXIT

# ── Read stdin ───────────────────────────────────────────────────────────────
INPUT="$(cat)"
if [ -z "$INPUT" ]; then
  exit 0
fi

# ── Extract tool name ────────────────────────────────────────────────────────
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

# Only fire for spawn_fork and Agent
case "$TOOL_NAME" in
  mcp__forks__spawn_fork|Agent) ;;
  *) exit 0 ;;
esac

# ── Check for bypass signals ─────────────────────────────────────────────────
# Signal 1: _router_called field in tool input
ROUTER_CALLED=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    print('yes' if ti.get('_router_called') else 'no')
except:
    print('no')
" 2>/dev/null || echo "no")

if [ "$ROUTER_CALLED" = "yes" ]; then
  exit 0
fi

# Signal 2: brief/args contain "route:" (copy-paste of route_work output)
BRIEF_TEXT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    # Try common fields
    text = ti.get('brief','') or ti.get('prompt','') or ti.get('message','') or str(ti)
    print(text[:2000])
except:
    print('')
" 2>/dev/null || echo "")

if echo "$BRIEF_TEXT" | grep -qi "^route:"; then
  exit 0
fi

# ── Emit warn ────────────────────────────────────────────────────────────────
WARN_MSG="[ROUTER-SKIP WARN] $TOOL_NAME called without a prior mcp__router__route_work call this turn. Call route_work first to get the cheapest correct route, then proceed. Bypass: include '_router_called: true' in tool args if you intentionally skipped it, or paste the route_work output (starts with 'route:') into the brief."

# Strip tag lines to avoid false-positive loop (per hooks-must-not-fire-inside-applied-pattern-tags)
SAFE_BRIEF=$(echo "$BRIEF_TEXT" | grep -v '^\[APPLIED\]\|^\[NOT-APPLIED\]\|^\[BRIEF-CHECK\]\|^\[CONTEXT-SURFACE\]\|^\[CRED-SURFACE\]\|^\[FORCING WARN\]\|^\[ROUTER-SKIP\]')

# Only warn if the brief doesn't already contain a route_work result reference
if ! echo "$SAFE_BRIEF" | grep -qi "route_work\|mcp__router__route_work\|capabilityrouter"; then
  # Output as hookSpecificOutput JSON for additionalContext
  python3 -c "
import json, sys
msg = sys.argv[1]
out = {'additionalContext': msg}
print(json.dumps(out))
" "$WARN_MSG"
fi

exit 0
