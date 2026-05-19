#!/usr/bin/env bash
# probe-laptop-agent.sh - cold-start discovery helper for the Corazon laptop-agent.
#
# Usage:
#   ./probe-laptop-agent.sh                    # dump full tool catalog to stdout
#   ./probe-laptop-agent.sh --json             # raw JSON
#   ./probe-laptop-agent.sh --filter cdp       # only tools whose name starts with "cdp."
#   ./probe-laptop-agent.sh --call TOOL JSON   # call a tool with given JSON params
#
# Why this exists:
#   A fresh conductor session that has not loaded the route-shape pattern will
#   burn 8-16 probe calls hitting REST 404s before discovering that the agent
#   exposes exactly one POST /api/tool endpoint with dot-notation tool names.
#   This helper does the deliberate-unknown-tool seed call, which makes the
#   agent return its full available[] list. Drop this script in tools/ and the
#   PreToolUse hook will nudge any curl localhost:7456 attempt to use it.
#
# See pattern: laptop-agent-api-tool-route-shape-2026-05-19.md

set -euo pipefail

HOST="${LAPTOP_AGENT_HOST:-http://localhost:7456}"
ENDPOINT="$HOST/api/tool"
CACHE="${HOME}/.claude/cache/laptop-agent-tools.json"

mkdir -p "$(dirname "$CACHE")"

cmd_catalog() {
  local filter="${1:-}"
  local payload='{"tool":"__probe_for_catalog","params":{}}'
  local resp
  resp="$(curl -s -m 10 -X POST "$ENDPOINT" -H "Content-Type: application/json" -d "$payload" || true)"
  if [ -z "$resp" ]; then
    echo "ERROR: no response from $ENDPOINT - is the laptop-agent running?" >&2
    exit 1
  fi
  echo "$resp" > "$CACHE"
  if [ "${1:-}" = "--json" ]; then
    cat "$CACHE"
    return
  fi
  python3 -c "
import json, sys, os
with open(os.environ['CACHE']) as f:
    d = json.load(f)
tools = d.get('available', [])
flt = os.environ.get('FILTER', '')
if flt:
    tools = [t for t in tools if t.startswith(flt)]
ns = {}
for t in tools:
    parts = t.split('.', 1)
    n = parts[0] if len(parts) > 1 else '(none)'
    ns.setdefault(n, []).append(t)
print(f'Found {len(tools)} tools across {len(ns)} namespaces (cached at $CACHE)')
for n in sorted(ns):
    print(f'  {n}.* ({len(ns[n])})')
    for t in sorted(ns[n]):
        print(f'    {t}')
" CACHE="$CACHE" FILTER="$filter"
}

cmd_call() {
  local tool="$1"
  local params_json="${2:-{}}"
  local payload
  payload=$(python3 -c "import json,sys; print(json.dumps({'tool':sys.argv[1],'params':json.loads(sys.argv[2])}))" "$tool" "$params_json")
  curl -s -m 30 -X POST "$ENDPOINT" -H "Content-Type: application/json" -d "$payload"
  echo
}

case "${1:-catalog}" in
  --json)        cmd_catalog --json ;;
  --filter)      cmd_catalog "${2:-}" ;;
  --call)        cmd_call "${2:?tool name required}" "${3:-{}}" ;;
  catalog|help|"") cmd_catalog ;;
  *)             cmd_catalog "$1" ;;
esac
