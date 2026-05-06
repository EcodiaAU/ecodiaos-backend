#!/usr/bin/env bash
# gui-macro-discovery-surface.sh
#
# PreToolUse hook for the GUI-macro discovery protocol.
#
# Source spec: ~/ecodiaos/patterns/gui-macro-discovery-protocol.md
# Source of truth: ~/ecodiaos/scripts/hooks/lib/gui-target-recipes.json
#
# Fires on:
#   - mcp__forks__spawn_fork              (scans .tool_input.brief)
#   - mcp__factory__start_cc_session      (scans .tool_input.prompt)
#   - Bash                                 (scans .tool_input.command)
#   - mcp__vps__shell_exec                (scans .tool_input.command)
#   - Write                                (scans .tool_input.content)
#   - Edit / MultiEdit                    (scans .tool_input.new_string + edits[].new_string)
#
# For each GUI-target keyword found in the scanned content, emits one line:
#   [GUI-MACRO HINT] target=<label> recipe=<path>  summary=<summary>
#
# These hints are model-visible. Conductor sees them BEFORE the tool call
# completes and can abort/redirect. Warn-only, never blocks (always exit 0).
#
# Tag-line filtering: lines beginning with [APPLIED], [NOT-APPLIED], any
# [* WARN], or [GUI-MACRO HINT] are stripped before keyword regex per
# ~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md.

set -u

REGISTRY="${GUI_TARGET_REGISTRY:-/home/tate/ecodiaos/scripts/hooks/lib/gui-target-recipes.json}"

input=$(cat)

# Tolerate non-JSON input gracefully.
if ! echo "$input" | jq -e . >/dev/null 2>&1; then
  exit 0
fi

# Bail silently if registry missing (defensive: don't break the hook chain).
if [ ! -f "$REGISTRY" ]; then
  exit 0
fi

tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# Pick the content field by tool. Concatenate multiple fields so MultiEdit
# / Write / Edit all surface their text content.
content=$(echo "$input" | jq -r '
  [
    .tool_input.brief,
    .tool_input.prompt,
    .tool_input.message,
    .tool_input.task,
    .tool_input.command,
    .tool_input.content,
    .tool_input.new_string,
    (.tool_input.edits // [] | map(.new_string) | join("\n"))
  ]
  | map(select(. != null and . != ""))
  | join("\n")
') 2>/dev/null

if [ -z "$content" ] || [ "$content" = "null" ]; then
  exit 0
fi

# Strip tag lines (per hooks-must-not-fire-inside-applied-pattern-tags.md).
# Removes lines beginning with [APPLIED], [NOT-APPLIED], [* WARN],
# [* PRIMARY], [* ALSO], [GUI-MACRO HINT], [FORK-NUDGE], [INFO].
content_filtered=$(echo "$content" | grep -vE '^\s*\[(APPLIED|NOT-APPLIED|GUI-MACRO HINT|FORK-NUDGE|INFO|[A-Z][A-Z-]+ (WARN|PRIMARY|ALSO|HINT|SUGGEST))' || true)

# Lowercase for case-insensitive keyword regex.
content_lc=$(echo "$content_filtered" | tr '[:upper:]' '[:lower:]')

if [ -z "$content_lc" ]; then
  exit 0
fi

# Iterate registry targets. For each, check if any keyword regex matches the
# (lowercased) content. Emit one [GUI-MACRO HINT] per matched target.
# Use jq to enumerate targets.
target_count=$(jq '.targets | length' "$REGISTRY" 2>/dev/null || echo 0)
if [ "$target_count" -eq 0 ]; then
  exit 0
fi

warnings=()
match_pairs=()

i=0
while [ "$i" -lt "$target_count" ]; do
  label=$(jq -r ".targets[$i].label" "$REGISTRY")
  recipe=$(jq -r ".targets[$i].recipe" "$REGISTRY")
  summary=$(jq -r ".targets[$i].summary" "$REGISTRY")
  runtime=$(jq -r ".targets[$i].verified_runtime // empty" "$REGISTRY")

  # Build a single regex from all keywords for this target.
  # Lowercase + escape regex specials. Word-boundary not enforced (keywords
  # like "ssh sy094" are multi-token; literal substring match is intended).
  matched=false
  kw_count=$(jq ".targets[$i].keywords | length" "$REGISTRY")
  j=0
  while [ "$j" -lt "$kw_count" ]; do
    kw=$(jq -r ".targets[$i].keywords[$j]" "$REGISTRY" | tr '[:upper:]' '[:lower:]')
    # Escape regex specials in the keyword (basic set).
    kw_escaped=$(printf '%s' "$kw" | sed 's/[][\.*^$+?(){}|/]/\\&/g')
    if echo "$content_lc" | grep -qF "$kw"; then
      matched=true
      break
    fi
    j=$((j + 1))
  done

  if [ "$matched" = "true" ]; then
    line="[GUI-MACRO HINT] target=${label} recipe=${recipe} runtime=${runtime} summary=${summary}"
    warnings+=("$line")
    match_pairs+=("${label}")
  fi

  i=$((i + 1))
done

if [ "${#warnings[@]}" -eq 0 ]; then
  exit 0
fi

# Add the procedural reminder line as a header.
header="[GUI-MACRO HINT] GUI-target keyword detected in ${tool_name}. Read the matched recipe BEFORE the tool call. Source: ~/ecodiaos/patterns/gui-macro-discovery-protocol.md"

ctx="$header"
echo "$header" >&2
for w in "${warnings[@]}"; do
  echo "$w" >&2
  ctx="${ctx}
${w}"
done

jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$ctx}}'

exit 0
