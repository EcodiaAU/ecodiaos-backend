#!/usr/bin/env bash
# factory-precommit-allowlist.sh - SECURITY_HARDENING.md section 2.3 enforcement
# at git-commit time.
#
# Why this exists:
#   The server-side allowlist checks in deploymentService.deploySession() and
#   factoryOversightService.processSession() are the primary enforcement.
#   This pre-commit hook is defense in depth at the worktree level - if a
#   factory CC session attempts a manual git commit (bypassing the oversight
#   pipeline), the hook blocks it before the commit lands.
#
# What this does:
#   Reads staged ACMR files from the index, calls the shared allowlist module
#   at src/lib/selfModAllowlist.js via Node, exits non-zero on deny so git
#   aborts the commit.
#
# What it deliberately does NOT do:
#   - Run lint/typecheck (that's pre-commit-guard.sh's job, separate concern).
#   - Modify files (human or operator must remove the denied path).
#   - Skip on env override (security boundary, not a convenience flag).
#
# Install via: bash scripts/install-git-hooks.sh
# Manual test: stage src/services/forkService.js then run this script.
#              Should exit 1 with a clear error.

set -uo pipefail

# Must run inside a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "factory-precommit-allowlist: not inside a git repository" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
MODULE_PATH="$REPO_ROOT/src/lib/selfModAllowlist.js"

# If the module is missing, this isn't an ecodiaos-backend worktree.
# Skip silently so the hook is portable across other repos that share .git/hooks.
if [ ! -f "$MODULE_PATH" ]; then
  exit 0
fi

# Collect staged ACMR (Added, Copied, Modified, Renamed) files
FILES=$(git diff --cached --name-only --diff-filter=ACMR)
if [ -z "$FILES" ]; then
  exit 0
fi

# Pass via env var to avoid shell-escaping pitfalls with filenames containing
# spaces, quotes, or unusual characters.
FILES_RAW="$FILES" MODULE_PATH="$MODULE_PATH" node -e '
const { checkDiff } = require(process.env.MODULE_PATH)
const files = (process.env.FILES_RAW || "").trim().split("\n").filter(Boolean)
const r = checkDiff(files)
if (!r.allowed) {
  process.stderr.write("\n")
  process.stderr.write("factory-precommit-allowlist: refusing to commit\n")
  process.stderr.write("  SECURITY_HARDENING.md section 2.3 deny-list match:\n")
  for (const f of r.deniedFiles) {
    process.stderr.write("    " + f + "\n")
  }
  process.stderr.write("\n")
  process.stderr.write("  These paths are protected against factory self-modification.\n")
  process.stderr.write("  See ~/ecodiaos/docs/SECURITY_HARDENING.md section 2.3.\n")
  process.stderr.write("\n")
  process.exit(1)
}
'
RC=$?

if [ "$RC" -ne 0 ]; then
  exit 1
fi

exit 0
