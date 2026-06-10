#!/bin/sh
# Install the branch-thrash-guard reference-transaction hook into the shared
# working tree at /Users/ecodia/.code/ecodiaos/backend.
#
# Idempotent. Safe to re-run. Verifies the installed hook matches the canonical
# script's content via sha256 - drift triggers a re-copy.
#
# Pair: patterns/branch-thrash-guard-on-shared-tree-2026-06-10.md
# Source: scripts/branch-thrash-guard.sh
#
# Usage: sh scripts/install-branch-thrash-guard.sh

set -e

SHARED_TREE="/Users/ecodia/.code/ecodiaos/backend"
SRC="$SHARED_TREE/scripts/branch-thrash-guard.sh"
# Allow running from a linked worktree where scripts/ on disk may be ahead of
# the shared tree's checked-out commit. Symlink-safe relative resolution if
# the canonical SRC path is absent.
if [ ! -f "$SRC" ]; then
  HERE="$(cd "$(dirname "$(readlink "$0" 2>/dev/null || echo "$0")")" && pwd)"
  SRC="$HERE/branch-thrash-guard.sh"
fi

HOOK_DIR="$(git -C "$SHARED_TREE" rev-parse --git-common-dir)/hooks"
DEST="$HOOK_DIR/reference-transaction"

mkdir -p "$HOOK_DIR"

if [ ! -f "$SRC" ]; then
  echo "branch-thrash-guard: source not found at $SRC" >&2
  exit 1
fi

if [ -f "$DEST" ]; then
  SRC_SHA=$(shasum -a 256 "$SRC" | awk '{print $1}')
  DEST_SHA=$(shasum -a 256 "$DEST" | awk '{print $1}')
  if [ "$SRC_SHA" = "$DEST_SHA" ]; then
    echo "branch-thrash-guard: already installed at $DEST (sha matches)"
    exit 0
  fi
  echo "branch-thrash-guard: drift detected, re-installing"
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "branch-thrash-guard: installed at $DEST"
echo "Shared tree HEAD flips now require ECODIAOS_BRANCH_OK=1."
