#!/usr/bin/env bash
# PreToolUse hook: warn (never block) when an Edit/Write/MultiEdit/NotebookEdit
# tool call carries an em-dash (U+2014) or non-numeric en-dash (U+2013) in
# its content/new_string parameter.
#
# Wired in ~/.claude/settings.json PreToolUse list, alongside the other warn
# hooks (brief-consistency-check.sh, fork-by-default-nudge.sh, etc).
#
# Authored by fork_motwuj6r_5cf640 on 2026-05-06 per
#   ~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md
#
# The hook reads stdin (PreToolUse JSON), extracts the relevant fields, and
# prints a `[EMDASH WARN]` line to stdout if it finds either character. It
# always exits 0 (warn-only); it must never block tool execution.
#
# Exclusions (warn skipped):
#   - Tool calls scoped to evidence dirs (patterns/, clients/, drafts/,
#     audits/, dao/, public/, journal/, .claude/) where verbatim Tate
#     quotes are evidence, not output.
#   - The script itself, the sweep script, the pattern file (these
#     legitimately mention the characters as data).
#   - Lines that already start with our own warn-tag families ([APPLIED]
#     [NOT-APPLIED] [BRIEF-CHECK WARN] [CONTEXT-SURFACE *] [EMDASH WARN]
#     [FORCING WARN] [FORK-NUDGE] [CRED-SURFACE WARN]) per
#     ~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md.

set -uo pipefail

# Read the PreToolUse JSON from stdin into a variable.
INPUT=$(cat 2>/dev/null || true)
[ -z "$INPUT" ] && exit 0

# Find jq. If absent, exit silently (don't block, don't error).
JQ=$(command -v jq 2>/dev/null || true)
[ -z "$JQ" ] && exit 0

TOOL=$("$JQ" -r '.tool_name // .tool // empty' <<<"$INPUT" 2>/dev/null)
case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$("$JQ" -r '.tool_input.file_path // .input.file_path // .params.file_path // empty' <<<"$INPUT" 2>/dev/null)

# Evidence-dir exclusion. Substring match against the file path.
case "$FILE_PATH" in
  */patterns/*|*/clients/*|*/drafts/*|*/audits/*|*/dao/*|*/public/*|*/journal/*|*/.claude/*) exit 0 ;;
  */emdash-detector.sh|*/emdash-sweep.py|*/em-dashes-banned-character-level-no-exceptions.md) exit 0 ;;
esac

# Concatenate every candidate string param. Edit uses new_string, Write uses
# content, MultiEdit uses an edits[] array each with new_string.
PAYLOAD=$("$JQ" -r '
  [
    (.tool_input.new_string // empty),
    (.tool_input.content // empty),
    ((.tool_input.edits // []) | map(.new_string // empty) | join("\n"))
  ] | join("\n")
' <<<"$INPUT" 2>/dev/null)

[ -z "$PAYLOAD" ] && exit 0

# Strip lines that begin with our own tag-shaped prefixes so the hook never
# fires on its own warn output or on already-tagged acknowledgements.
FILTERED=$(printf '%s\n' "$PAYLOAD" | awk '
  /^[[:space:]]*\[APPLIED\]/ { next }
  /^[[:space:]]*\[NOT-APPLIED\]/ { next }
  /^[[:space:]]*\[BRIEF-CHECK WARN\]/ { next }
  /^[[:space:]]*\[CONTEXT-SURFACE / { next }
  /^[[:space:]]*\[EMDASH WARN\]/ { next }
  /^[[:space:]]*\[FORCING WARN\]/ { next }
  /^[[:space:]]*\[FORK-NUDGE\]/ { next }
  /^[[:space:]]*\[CRED-SURFACE WARN\]/ { next }
  { print }
')

# Em-dash check (U+2014).
if printf '%s' "$FILTERED" | grep -q $'\xe2\x80\x94'; then
  printf '[EMDASH WARN] em-dash (U+2014) detected in tool_input for %s - substitute with " - " per ~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md\n' "${FILE_PATH:-<unknown>}"
fi

# Non-numeric en-dash (U+2013) check. Find any U+2013 NOT bracketed by digits.
if printf '%s' "$FILTERED" | python3 -c '
import sys, re
text = sys.stdin.buffer.read().decode("utf-8", errors="replace")
# Find U+2013 not surrounded by digits.
pattern = re.compile(r"(?<!\d)–|–(?!\d)")
if pattern.search(text):
    sys.exit(0)
sys.exit(1)
' 2>/dev/null; then
  printf '[EMDASH WARN] non-numeric en-dash (U+2013) detected in tool_input for %s - substitute with " - " per ~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md\n' "${FILE_PATH:-<unknown>}"
fi

exit 0
