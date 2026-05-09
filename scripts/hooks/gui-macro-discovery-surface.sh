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

# Iterate registry targets. For each, check if any keyword matches the
# (lowercased) content. Emit one [GUI-MACRO HINT] per matched target.
#
# HIGH / BROAD discipline (Phase C Gap 4, 9 May 2026):
#   - If `keywords_high` and/or `keywords_broad` are present, apply the
#     compound-keyword discipline from
#     ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md:
#       fires when (HIGH match count >= 1) OR (BROAD match count >= 3)
#   - Threshold tightened from >=2 to >=3 on 9 May 2026 evening pass after
#     two distinct fork briefs (corazon-peer + macincloud-rdp) hit broad=2
#     on doctrine cross-refs (vendor names appearing twice across separate
#     lines, no driving in scope) and tripped HINT. >=3 forces substantive
#     keyword co-occurrence before firing.
#   - If neither HIGH nor BROAD arrays exist, fall back to the legacy
#     `keywords` array (any single match fires). Backward-compat for targets
#     that were not yet narrowed.
# Origin false-positive cluster: 9 May 2026 16:22 AEST cortex-ambient
# polish brief listed Corazon as one of 3 visual-verify mechanisms - the
# legacy bare-noun match fired despite shipping pure FE source edits.
target_count=$(jq '.targets | length' "$REGISTRY" 2>/dev/null || echo 0)
if [ "$target_count" -eq 0 ]; then
  exit 0
fi

warnings=()
match_pairs=()

# Helper: count how many keywords from the given JSON path array match the
# (lowercased) content. Each matching keyword counts once regardless of how
# many times it appears in content. Empty / missing arrays return 0.
count_keyword_hits() {
  local jq_path="$1"
  local count=0
  local kw_count
  kw_count=$(jq "${jq_path} // [] | length" "$REGISTRY" 2>/dev/null || echo 0)
  local j=0
  while [ "$j" -lt "$kw_count" ]; do
    local kw
    kw=$(jq -r "${jq_path}[$j]" "$REGISTRY" | tr '[:upper:]' '[:lower:]')
    if echo "$content_lc" | grep -qF "$kw"; then
      count=$((count + 1))
    fi
    j=$((j + 1))
  done
  echo "$count"
}

i=0
while [ "$i" -lt "$target_count" ]; do
  label=$(jq -r ".targets[$i].label" "$REGISTRY")
  recipe=$(jq -r ".targets[$i].recipe" "$REGISTRY")
  summary=$(jq -r ".targets[$i].summary" "$REGISTRY")
  runtime=$(jq -r ".targets[$i].verified_runtime // empty" "$REGISTRY")

  matched=false

  # Probe whether this target uses the HIGH/BROAD shape or legacy keywords.
  has_high=$(jq ".targets[$i] | has(\"keywords_high\")" "$REGISTRY" 2>/dev/null || echo false)
  has_broad=$(jq ".targets[$i] | has(\"keywords_broad\")" "$REGISTRY" 2>/dev/null || echo false)

  if [ "$has_high" = "true" ] || [ "$has_broad" = "true" ]; then
    # HIGH / BROAD discipline.
    high_hits=$(count_keyword_hits ".targets[$i].keywords_high")
    broad_hits=$(count_keyword_hits ".targets[$i].keywords_broad")
    # Phase C Gap 4 threshold raised >=2 -> >=3 (see header comment).
    if [ "$high_hits" -gt 0 ] || [ "$broad_hits" -ge 3 ]; then
      matched=true
    fi
  else
    # Legacy: any keyword match fires. Backward-compatible path.
    kw_count=$(jq ".targets[$i].keywords | length" "$REGISTRY" 2>/dev/null || echo 0)
    j=0
    while [ "$j" -lt "$kw_count" ]; do
      kw=$(jq -r ".targets[$i].keywords[$j]" "$REGISTRY" | tr '[:upper:]' '[:lower:]')
      if echo "$content_lc" | grep -qF "$kw"; then
        matched=true
        break
      fi
      j=$((j + 1))
    done
  fi

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
