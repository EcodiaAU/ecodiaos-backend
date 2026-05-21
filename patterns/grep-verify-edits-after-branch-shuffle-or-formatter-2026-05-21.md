---
triggers: edit-lost, edits-not-applied, branch-checkout, working-tree, formatter, prettier, post-tool-hook, edit-verify, grep-verify, file-state-current, git-checkout-loses-edits, post-hook-formatter
---

# Grep-verify edits after branch shuffle or formatter hook

## The rule

If a session involves either of these between your Edit and your Commit:

- `git checkout <other-branch>` (or any operation that changes the working tree)
- A PostToolUse formatter hook fires on the file (Prettier auto-format)

Run a grep for an identifier you added by the edit before you commit. Confirm the edit actually persisted. The Edit tool will report success even when the changes are silently lost.

## Specific worked example (chambers-frontend, 2026-05-21)

I made 5 edits to `src/lib/db/hooks.ts` + `src/pages/admin/NewslettersAdmin.tsx` to wire a Send button. Each Edit returned "file has been updated successfully." Then I did `git checkout main` + merge + push + `git checkout feat/ui-sweep` to sync branches.

After the branch shuffle, the 5 edits were GONE from disk. The commit I made on the feature branch contained only the standalone new file (newsletter-send/index.ts), no Edit changes. I had to redo all 5 edits.

The likely cause: the Edit tool wrote the file. The PostToolUse formatter (Prettier) ran. Between Prettier's read-modify-write and the next operation, the branch checkout reset the working tree to HEAD, losing the unstaged changes.

## Defensive protocol

Before any branch-switching operation:

```bash
git status --short
# if any M lines exist for files you just edited, those changes are unstaged
git stash push -m "preserve-edits-<reason>"
git checkout <other-branch>
# do whatever
git checkout <original-branch>
git stash pop
```

Before commit, regardless of branch shuffle:

```bash
# pick an identifier you know you added
grep -rn 'YourNewIdentifier' src/lib/db/hooks.ts src/pages/admin/NewslettersAdmin.tsx
# if grep returns nothing, the edits did not land
```

## Anti-patterns

- Trusting "Edit tool reported success" means the edit is on disk.
- Trusting `git status` after a checkout to fully show "what you had before."
- Committing a multi-file feature without grep-verifying each file's headline identifier.

## Cross-refs

- `verify-deployed-state-against-narrated-state.md` (parent rule)
- `narration-vs-disk-reconciliation-checklist.md` (sibling)
- `eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md` (similar class: tool returned success, state did not match expectations)

## Origin

2026-05-21 chambers Phase B Send button wire-up. Five Edit calls reported success. Branch shuffle + formatter sequence silently lost all five. Caught only because the commit diff stat showed "1 file changed" when I expected 3. Forced a full re-do of the wire-up work. Pattern authored so the next person catches this before the commit not after.
