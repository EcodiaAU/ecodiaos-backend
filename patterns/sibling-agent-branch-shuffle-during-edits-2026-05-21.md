---
triggers: sibling-agent, parallel-agent-edits, branch-shuffle, auto-switch-branch, feat-branch-proliferation, working-tree-on-wrong-branch, git-commit-landed-on-wrong-branch, merge-already-up-to-date, multi-tab-cc-conflict, dispatch-worker-conflict, push-origin-main-but-on-feat
---

# Sibling-agent branch shuffle during edits

## The rule

When other Claude Code tabs (sibling agents, dispatch_workers, the user's own parallel tabs) are touching the same client repo, the active branch can flip BETWEEN your tool calls. Treat the branch state as ephemeral. Confirm it explicitly before every commit and every push.

The new failing class:

1. You start on `main`.
2. A sibling agent runs `git checkout -b feat/ui-sweep-<topic>-<date>` to scope its own work.
3. You Edit a file. The Edit lands on disk under the sibling's branch, not on main.
4. You `git commit` and it lands on the sibling's branch, not main.
5. `git push origin main` returns `Everything up-to-date` because main truly is unchanged. Your work is on a feat branch you didn't pick.
6. Later, `git checkout main && git merge feat/<that-branch> --no-ff` returns `Already up to date` if the sibling has already merged its share of history.

## Defensive protocol

Run all four checks before AND after every commit:

```bash
# 1. Where am I right now?
git branch --show-current
# 2. What's actually in the working tree's diff?
git status --short
# 3. Has my edit landed on disk?
grep -c "MyNewIdentifier" src/path/to/edited/file.tsx
# 4. After commit, what branch was the commit attached to?
git log --oneline -1
```

If step 1 returns anything other than `main`, you have two recovery paths:

- `git checkout main && git merge <feat-branch> --no-ff -m "merge: <my-feature>"` to bring the feat history onto main.
- If the merge says `Already up to date` and your identifier still isn't on main, run `git log <feat-branch> --oneline -5` to find the commit, then `git merge <commit-sha> --no-ff` to force-include it.

After the merge, grep again on the main-checked-out working tree to confirm your identifier is there:

```bash
grep -c "MyNewIdentifier" src/path/to/edited/file.tsx
# Must return >= 1
```

Only then `git push origin main`.

## Worked example (2026-05-21, chambers-frontend)

During chambers Phase B/C/D/E build, the working tree shuffled across SIX feat branches in a single session:

- `feat/ui-sweep-auth-2026-05-21`
- `feat/ui-sweep-static-2026-05-21`
- `feat/ui-sweep-admin-2026-05-21`
- `feat/ui-sweep-member-facing-2026-05-21`
- `feat/ui-primitives-2026-05-21`
- `feat/ui-home-events-reference-2026-05-21`

I never typed `git checkout -b` on any of those. A sibling Claude Code session (likely a dispatch_worker doing UI primitive migration) was creating + scoping feature branches and switching to them. Between my tool calls, the active branch flipped without notice.

Specific incident: I edited `Dashboard.tsx` to add `<OfficerPulse />`. Edit reported success. Committed. Pushed. The commit landed on `feat/ui-sweep-admin-2026-05-21`, NOT on main. Main's `Dashboard.tsx` showed no OfficerPulse import. Caught by grep-verify on main after the push reported "everything up-to-date".

Recovery: `git checkout main && git merge feat/ui-sweep-admin-2026-05-21 --no-ff -m "merge: officer pulse"`. The diff stat showed the actual landing. Re-grep confirmed. Re-push.

## Indicators a sibling is running

- `git branch -a` shows several `feat/ui-*` or `feat/<topic>-<date>` branches you didn't create.
- The working tree returns to a different branch after `git checkout main` and a subsequent Edit.
- `git status --short` shows changes to files you didn't edit (likely Prettier on shared files run by the sibling).
- Commit IDs you didn't author appear in `git log <feat-branch> --oneline` between your own commits.
- Random `783a8cd fix(rsvp): EventRsvp optimistic update includes new payment fields` style commits patching your work.

## When the sibling is helping

Sibling agents fixing your code is GOOD when they do it well: in the Phase D ticketing commit, a sibling correctly noticed I broke the `useRsvp` optimistic update by adding `payment_status` to `EventRsvp` without updating the optimistic insert, and they pushed `fix(rsvp)` to the same feat branch. The fix was right. The risk is purely a coordination one (commits land on the wrong branch from MY perspective).

## Anti-patterns

- Trusting `git branch --show-current` once at session start and assuming it persists.
- Trusting `git push origin main` to push your latest commit just because the commit succeeded.
- Skipping the post-merge grep verification because "the merge said 'Fast-forward'."
- Inferring "everything up to date" means "everything I expect to be on main IS on main."

## Cross-refs

- `grep-verify-edits-after-branch-shuffle-or-formatter-2026-05-21.md` (sibling case: formatter race losing the on-disk content; this pattern adds: parallel-agent race losing the on-branch position)
- `verify-deployed-state-against-narrated-state.md` (parent rule)
- `dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md` (the sibling agent primitive; siblings doing UI migrations is exactly the case)
- `ide-tab-is-the-new-fork-mechanic-2026-05-17.md` (multiple CC tabs on the same repo is how this happens at all)

## Origin

2026-05-21, chambers-frontend Phase B/C/D/E ship. Six sibling-created feat branches detected mid-session. Two commits landed on wrong branches before grep-verify caught it. Recovery worked both times (merge feat into main with --no-ff). The lesson is that BOTH the formatter race AND the sibling race need the same grep-verify gate, and the gate is now codified as a fixed-protocol check before every push.
