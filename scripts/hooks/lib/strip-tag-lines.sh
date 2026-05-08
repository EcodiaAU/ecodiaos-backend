#!/usr/bin/env bash
# strip-tag-lines.sh
#
# Reads stdin, strips lines whose first non-whitespace token is one of the
# hook-tag prefixes, writes stdout. Used by keyword-scanning PreToolUse hooks
# to filter out their own forcing-function output BEFORE the keyword regex
# stage runs. Without this filter, keyword-scanners fire on text inside
# [APPLIED] / [NOT-APPLIED] / etc. acknowledgements that mention the same
# keywords as the doctrine they cite.
#
# Doctrine: ~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md
# Origin:   6+ false positives 21:00-21:12 AEST 29 Apr 2026 across
#           cred-mention-surface.sh.
# Spec ref: ~/ecodiaos/CLAUDE.md "Hooks must not fire inside [APPLIED] /
#           [NOT-APPLIED] tag lines."
#
# Tag prefixes covered (single sed pass, no per-line shell-out):
#   [APPLIED]
#   [NOT-APPLIED]
#   [BRIEF-CHECK WARN]   [BRIEF-CHECK INFO]
#   [CONTEXT-SURFACE WARN]   [CONTEXT-SURFACE PRIMARY]   [CONTEXT-SURFACE ALSO]
#   [CRED-SURFACE WARN]
#   [DOCTRINE-CROSS-REF SUGGEST]
#   [STATUS-BOARD-CONTEXT SUGGEST]
#   [MACRO-VALIDATION WARN]
#   [COWORK-FIRST WARN]
#   [ANTHROPIC-FIRST WARN]
#   [FORCING WARN]
#   [FORK-NUDGE]
#   [INFO]
#   [EPISODE-RESURFACE INFO]
#   [GUI-MACRO HINT]
#   [EMDASH WARN]
#
# Idempotent: piping already-filtered output through this helper is a no-op.
# Whitespace-tolerant: leading spaces/tabs before the bracket are allowed.
#
# Usage:
#   filtered=$(printf '%s' "$brief" | bash ~/ecodiaos/scripts/hooks/lib/strip-tag-lines.sh)
#
# Exits 0. Never fails the calling hook even on bizarre input. The exec of
# sed inherits stdin and stdout from the caller; if sed is missing, the
# `exec` itself errors but the wrapping `$(...)` substitution swallows it.

exec sed -E '/^[[:space:]]*\[(APPLIED|NOT-APPLIED|BRIEF-CHECK[[:space:]]+(WARN|INFO)|CONTEXT-SURFACE[[:space:]]+(WARN|PRIMARY|ALSO)|CRED-SURFACE[[:space:]]+WARN|DOCTRINE-CROSS-REF[[:space:]]+SUGGEST|STATUS-BOARD-CONTEXT[[:space:]]+SUGGEST|MACRO-VALIDATION[[:space:]]+WARN|COWORK-FIRST[[:space:]]+WARN|ANTHROPIC-FIRST[[:space:]]+WARN|FORCING[[:space:]]+WARN|FORK-NUDGE|INFO|EPISODE-RESURFACE[[:space:]]+INFO|GUI-MACRO[[:space:]]+HINT|EMDASH[[:space:]]+WARN)\]/d'
