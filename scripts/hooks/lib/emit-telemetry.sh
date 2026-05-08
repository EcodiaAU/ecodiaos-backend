#!/usr/bin/env bash
# emit-telemetry.sh
#
# Shared library for hooks to emit a single JSONL telemetry line per dispatch.
# Sourced (not exec'd) by hook scripts AFTER they have run their checks and
# decided which patterns surfaced.
#
# Implements Layer 4 (Usage Telemetry) of the Decision Quality Self-Optimization
# Architecture. See:
#   ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
#
# Why JSONL append (not Postgres direct write):
#   Hooks run on the dispatch hot path. A direct DB write per hook fire would
#   add ~10-50ms per dispatch and create a hard runtime dependency on the
#   Postgres connection. JSONL append is a single fs syscall per event,
#   measured in microseconds. The dispatchEventConsumer.js batch consumer
#   reads the JSONL every 15 minutes and normalises into the 4 telemetry
#   tables. If the consumer is down or Postgres is unreachable, JSONL keeps
#   accumulating and gets backfilled on the next consumer run. No data loss,
#   no hot-path latency.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/emit-telemetry.sh"
#   emit_telemetry_event \
#     "<hook_name>" \
#     "<tool_name>" \
#     "<context_json>" \
#     "<surfaces_json>" \
#     "<kind>"
#
#   - hook_name: e.g. "brief-consistency-check"
#   - tool_name: from .tool_name (e.g. "mcp__forks__spawn_fork")
#   - context_json: JSON object describing what was scanned
#       (e.g. {"brief_excerpt":"<first 500 chars>", "scanned_keyword_count":N})
#   - surfaces_json: JSON ARRAY of {pattern_path, trigger_keyword,
#                                    priority, canonical} objects (one per
#                                    surface emitted; empty array if no surfaces)
#   - kind: REQUIRED. Top-level dispatch class for downstream Layer-D outcome
#       inference. Canonical values:
#         fork_spawn         (mcp__forks__spawn_fork interception)
#         factory_dispatch   (mcp__factory__start_cc_session interception)
#         doctrine_edit      (Write/Edit/MultiEdit on patterns/clients/docs/CLAUDE.md)
#         status_board_write (db_execute INSERT/UPDATE on status_board)
#         macro_runbook_write (db_execute INSERT/UPDATE on macro_runbooks)
#         hook_warn          (catch-all hook fire that doesn't match a kind above)
#         cron_fire          (cron-fired fork dispatch via cronForkDispatcher; reserved)
#       If omitted/empty/invalid, defaults to "unknown" so Layer-D can detect
#       producer-side regression. Closing Phase-G Critique #5: Layer-D fork_id
#       presence heuristic was a workaround for missing kind; that workaround
#       is no longer load-bearing once kind is plumbed at the producer.
#
#   derive_kind_from_tool <tool_name> -> echoes a best-effort kind for callers
#   that fire on multiple tool surfaces (e.g. brief-consistency-check fires on
#   both mcp__forks__spawn_fork and mcp__factory__start_cc_session). Falls back
#   to "hook_warn" for unknown tools.
#
# Output: appends one JSON object (single line, newline-terminated) to
#   ~/ecodiaos/logs/telemetry/dispatch-events.jsonl
#
# Always exits successfully. NEVER blocks the hook. NEVER prints to stderr/stdout.

# Resolve telemetry file path. Allow override via env var for testing.
TELEMETRY_DIR="${ECODIAOS_TELEMETRY_DIR:-/home/tate/ecodiaos/logs/telemetry}"
TELEMETRY_FILE="${ECODIAOS_TELEMETRY_FILE:-${TELEMETRY_DIR}/dispatch-events.jsonl}"

# Ensure directory exists (cheap; idempotent). Fails silently.
mkdir -p "${TELEMETRY_DIR}" 2>/dev/null

# derive_kind_from_tool - best-effort kind classifier from tool_name. Hooks that
# fire on a single tool surface should pass an explicit kind instead; this is
# the fallback for hooks that fire on multiple tools (e.g. brief-consistency-check
# fires on both spawn_fork and start_cc_session).
derive_kind_from_tool() {
  case "${1:-}" in
    mcp__forks__spawn_fork) echo "fork_spawn" ;;
    mcp__factory__start_cc_session) echo "factory_dispatch" ;;
    Write|Edit|MultiEdit) echo "doctrine_edit" ;;
    mcp__supabase__db_execute) echo "db_execute" ;;
    *) echo "hook_warn" ;;
  esac
}

# emit_telemetry_event - emits one JSONL line.
# All args are passed through as JSON-safe strings; jq does the encoding.
emit_telemetry_event() {
  local hook_name="${1:-unknown}"
  local tool_name="${2:-unknown}"
  local context_json="${3:-\{\}}"
  local surfaces_json="${4:-[]}"
  local kind="${5:-}"

  # Default to "unknown" sentinel so Layer-D outcome inference can detect
  # producer-side regression (every NEW dispatch_event row MUST carry kind).
  # Phase-G Critique #5 closure: missing kind is no longer silent.
  if [ -z "${kind}" ]; then
    kind="unknown"
  fi

  # Validate context_json and surfaces_json are valid JSON; fall back to defaults if not.
  if ! echo "${context_json}" | jq -e . >/dev/null 2>&1; then
    context_json='{}'
  fi
  if ! echo "${surfaces_json}" | jq -e . >/dev/null 2>&1; then
    surfaces_json='[]'
  fi

  # Compose the event object using jq. ts is RFC3339 UTC.
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  local line
  line=$(jq -nc \
    --arg ts "${ts}" \
    --arg hook "${hook_name}" \
    --arg tool "${tool_name}" \
    --arg kind "${kind}" \
    --argjson ctx "${context_json}" \
    --argjson surfaces "${surfaces_json}" \
    '{
      ts: $ts,
      hook_name: $hook,
      tool_name: $tool,
      kind: $kind,
      context: $ctx,
      surfaces: $surfaces
    }' 2>/dev/null) || return 0

  # Append atomically. flock would be ideal but we trade strict atomicity for
  # zero hot-path overhead; line-buffered append is ~atomic on Linux <8KB writes
  # and our lines are well under that. The consumer is tolerant of partial
  # lines (skips them on JSON parse failure).
  printf '%s\n' "${line}" >> "${TELEMETRY_FILE}" 2>/dev/null

  return 0
}

# emit_telemetry_safe - wrapper that catches all errors silently.
# Hooks should call THIS function, not emit_telemetry_event directly, so
# any internal failure (jq missing, disk full, etc.) cannot break the hook.
emit_telemetry_safe() {
  emit_telemetry_event "$@" 2>/dev/null || true
  return 0
}
