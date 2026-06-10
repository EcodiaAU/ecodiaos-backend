#!/bin/sh
# .git/hooks/reference-transaction installed by install-branch-thrash-guard.sh.
#
# Refuses HEAD updates on the SHARED main worktree at
# /Users/ecodia/.code/ecodiaos/backend so a dispatched worker tab cannot flip
# the conductor's checked-out branch and clobber uncommitted sibling work.
#
# Two attack vectors covered:
#   Vector A. `git checkout <branch>` / `git switch <branch>` updates the HEAD
#             symref. reference-transaction reports ref=HEAD with old=zeros and
#             new=ref:refs/heads/<branch>. Caught by the ref==HEAD clause.
#   Vector B. `git update-ref HEAD <oid>` / `git reset --hard <other-tip>` updates
#             HEAD's underlying ref (refs/heads/<current>) directly.
#             reference-transaction reports ref=refs/heads/<current>, NOT HEAD.
#             Caught by the symbolic-target + non-fast-forward clause.
#
# Linked worktrees (.claude/worktrees/agent-* under the Agent SDK, and
# /Users/ecodia/.code/ecodiaos/_worktrees/dispatched/* under the scheduler's
# new allocator) are exempt: in those contexts the GIT_DIR env var points at
# .git/worktrees/<name>/, so we early-exit on the case-pattern match. From the
# main worktree, GIT_DIR is empty (git does not set it when invoking hooks at
# the top-level worktree), so the case falls through to the rejection logic.
#
# Conductor bypass: export ECODIAOS_BRANCH_OK=1 before any intentional
# `git checkout` / `git switch` / `git reset --hard` on the shared tree. The
# variable is NOT set in worker tab environments by design.
#
# Origin: 2026-06-10 branch-thrash incidents (mac-organisation-and-branch-thrash-
# 2026-06-09, knowledge-retrieval-hardened-merged-to-main-2026-06-10, twice on
# 2026-06-10 alone: claude/stripe-readonly-mcp-tools -> claude/release-walker-
# state-matrix). Sibling worker tabs operating on the shared tree flipped its
# branch and yanked knowledge-index engine files + canary scripts out of the
# working tree until they were evacuated to ~/.ecodiaos/bin.

# Only the prepared phase can abort. committed + aborted are notifications.
[ "$1" = prepared ] || exit 0

# Linked worktree -> exempt. GIT_DIR ends with /worktrees/<name>/ for them.
case "$GIT_DIR" in
  */worktrees/*) exit 0 ;;
esac

# Conductor explicit bypass.
[ "$ECODIAOS_BRANCH_OK" = "1" ] && exit 0

# Resolve HEAD's symbolic target so we can defend Vector B (the `update-ref HEAD`
# and `reset --hard` paths that update refs/heads/<current> rather than HEAD).
# In detached-HEAD state symbolic-ref fails and HEAD_TARGET stays empty - Vector
# B then naturally skips, which is correct because there is no current branch
# ref to defend.
HEAD_TARGET=$(git symbolic-ref --quiet HEAD 2>/dev/null || true)

status=0
while read old new ref; do
  reject=0
  reason=""

  # Vector A: HEAD symref pointer change (real branch switch).
  if [ "$ref" = "HEAD" ] && [ "$old" != "$new" ]; then
    reject=1
    reason="HEAD symref change (git checkout/switch)"
  fi

  # Vector B: HEAD's underlying branch ref updated to a non-fast-forward value.
  # A normal git commit fast-forwards refs/heads/<current> from parent OID to
  # child OID; the new OID has the old as an ancestor. An arbitrary branch flip
  # via `update-ref HEAD <other-tip>` or `reset --hard <other-tip>` does not.
  #
  # GOTCHA: git frequently passes old=zeros via the reference-transaction
  # prepared phase even when the ref already exists (this happens whenever a
  # symref is dereferenced or the update path skips the verify-old check). We
  # cannot trust stdin's old field; instead we read the actual current OID via
  # git rev-parse on the ref. At the prepared phase the ref has not been
  # updated yet, so rev-parse returns the pre-update value.
  if [ -n "$HEAD_TARGET" ] && [ "$ref" = "$HEAD_TARGET" ]; then
    real_old=$(git rev-parse --verify --quiet "$ref" 2>/dev/null || true)
    if [ -n "$real_old" ] && [ "$real_old" != "$new" ]; then
      if git merge-base --is-ancestor "$real_old" "$new" 2>/dev/null; then
        : # fast-forward - allow (normal commit/merge)
      else
        reject=1
        reason="non-fast-forward update of $HEAD_TARGET (git update-ref HEAD or git reset --hard); real_old=$real_old"
      fi
    fi
  fi

  if [ "$reject" = "1" ]; then
    cat >&2 <<EOF
ecodiaos branch-thrash guard: refusing ref update on shared tree
  ref: $ref
  old: $old
  new: $new
  reason: $reason
This is the conductor's shared working tree. Branch flips from a worker
context destroy uncommitted sibling work.

To do this intentionally as the conductor, prefix your command:
  ECODIAOS_BRANCH_OK=1 git ...

To do work on a different branch as a dispatched worker, request a
worktree via the dispatcher's allocator (see scheduler.js) or allocate
one manually with:
  git worktree add -B <branch> /Users/ecodia/.code/ecodiaos/_worktrees/<name> origin/main

Doctrine: backend/patterns/branch-thrash-guard-on-shared-tree-2026-06-10.md
EOF
    status=1
  fi
done

exit $status
