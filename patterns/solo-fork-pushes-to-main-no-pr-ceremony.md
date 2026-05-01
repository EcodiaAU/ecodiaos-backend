---
triggers: pr-ceremony, branch-and-pr, feature-branch, solo-fork-workflow, push-to-main, no-pr, direct-push, workflow-overkill, github-pr-flow, pr-overhead, fork-deploy-workflow, branch-pr-merge-pull-restart, simple-deploy, push-pull-restart, single-author-workflow, fork-output-pipeline, ship-direct-to-main
---

# Solo forks push directly to main - no PR ceremony

## Rule

When a fork ships changes to ecodiaos backend or frontend (or any repo where Ecodia is the sole author), the deploy pipeline is:

1. `git pull --rebase origin main` (handle any racing commits)
2. Commit directly on main with `Co-Authored-By: <fork_id>`
3. `git push origin main`
4. `cd ~/ecodiaos && git pull --ff-only` (on VPS)
5. `pm2 restart <process>` (e.g. `ecodia-api`)
6. Tail logs to verify clean startup

NO feature branch. NO pull request. NO merge ceremony. The branch + PR + merge flow is overhead with zero benefit when there is exactly one author and zero external reviewers.

## Why the PR flow exists in normal engineering, and why it doesn't apply here

Branches + PRs add value when:
- Multiple human contributors need diff review
- CI gates merge (lint, type-check, unit tests, deploy preview)
- An audit trail of "this diff was approved by X" matters for compliance
- Long-running features need isolation from main while in progress

None of those apply to ecodiaos solo-fork ships:
- Sole author (Ecodia / EcodiaOS), zero external reviewers — the conductor reviewing its own fork's PR is functionally identical to the conductor reviewing the diff before pulling on VPS
- No CI on ecodiaos-backend (Vercel auto-deploys ecodiaos-frontend on main push, which is what we want — direct push triggers the auto-deploy)
- The audit trail lives in the commit message + `Co-Authored-By` + the [FORK_REPORT] body + Neo4j Episode — branch+PR adds no information
- Forks are short-lived (minutes), no need for isolation

The branch + PR flow was a default carried over from human-team engineering. It is not load-bearing in our setup.

## Concrete cost of the PR flow

For one fix fork shipping one bug fix, the PR flow adds these steps over direct push:
1. `git checkout -b fix/foo-2026-MM-DD` (extra)
2. `git push -u origin fix/foo-2026-MM-DD` (extra)
3. `gh pr create --title ... --body ...` (extra)
4. `gh pr merge --squash --auto` or conductor merges manually (extra)
5. `git checkout main && git pull origin main` (extra)
6. `git push origin main` (NOT extra; would happen on direct-push)

That's 4-5 extra tool calls per ship, every ship. At 5-10 forks per day shipping fixes, that's 20-50 wasted tool calls per day on ceremony with no review benefit.

## When the PR flow IS still appropriate

Keep the branch + PR flow for:
- **Client repos** ([redacted], [redacted], coexist when client owns the repo) — external reviewers (Eugene, [redacted]) MUST see PRs.
- **Genuinely large refactors** that would benefit from a github diff URL Tate can read in mobile browser — judgment call by the conductor; default is direct push.
- **Anything touching `dao/contracts/*` or other on-chain code** — explicit human review threshold.
- **Reverts of shipped commits** that need an audit trail of "X was rolled back because Y" — even then, just a `git revert <sha>` direct on main is usually fine.

## Parallel-fork case

If two forks want to push to main simultaneously:
- Both run `git pull --rebase origin main` before push — second fork rebases on first's commit.
- Working-tree contention is a separate problem (per `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`); branches don't help with that, so this rule doesn't make worktree contention worse.
- If the rebase produces conflicts, the second fork either resolves them or reports the conflict in its FORK_REPORT and exits — no different from the conflict resolution that would happen at PR merge time.

## Do

- Forks targeting ecodiaos repos push directly to main with `Co-Authored-By: <fork_id>`.
- Run `git pull --rebase origin main` before any push (cheap, handles racing).
- After push, pull on VPS and restart the relevant PM2 process in the same fork.
- Verify by tailing logs for clean startup.
- Surface the shipped commit SHA in the [FORK_REPORT] body for audit.

## Do NOT

- Do NOT create feature branches for solo-fork ecodiaos ships.
- Do NOT open PRs against ecodiaos main when you're the only author.
- Do NOT use `git push --force` to main — direct push is fine, force-push to a shared main is not.
- Do NOT skip the `git pull --rebase` before push — without it, parallel forks collide.
- Do NOT skip the VPS pull + pm2 restart — pushing to github without deploying is shipping nothing.
- Do NOT apply this to client repos ([redacted], [redacted], coexist when client-owned) — those still need branch + PR for external review.

## Ship-discipline checklist (for fork briefs)

A fork brief that ships code to ecodiaos main should end with:

```
DELIVERABLE:
- One commit on main, Co-Authored-By: <your fork_id>.
- After commit: git pull --rebase origin main && git push origin main.
- After push: cd ~/ecodiaos && git pull --ff-only && pm2 restart <process>.
- After restart: tail pm2 logs for 10s, confirm no crash loop.
- FORK_REPORT result must name the commit SHA, the test names added, and the post-restart log line proving clean startup.
```

That's the new template. The conductor pre-fills `<process>` based on what the fork touched (ecodia-api for backend, no restart for frontend since Vercel auto-deploys, etc.).

## Origin

1 May 2026 ~11:29 AEST. Tate verbatim: "I also dont think we need to be doing this big branching and pr stuff... its overkill sicne its just you... we cna jsut be pushing to githib and pulling to vps and restarting right?"

Context: fix fork `fork_mom8e913_73a492` was dispatched ~7min earlier with a brief instructing it to create a feature branch + PR + merge. The conductor sent a mid-flight steering message via `mcp__forks__send_message` to switch to direct-push-to-main, then codified the rule per `codify-at-the-moment-a-rule-is-stated-not-after.md`.

Note: PR #44 (merged 01:48 AEST 1 May 2026) was the LAST instance of the old branch+PR flow under the 100% autonomy doctrine. After this pattern lands, future ships go direct.

## Cross-references

- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` — the on-main vs fork choice; this rule is downstream (once a fork is shipping, how it ships).
- `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` — the working-tree contention problem branches don't solve.
- `~/ecodiaos/patterns/factory-approve-no-push-no-commit-sha.md` — sibling discipline at the Factory layer; same outcome (commit SHA on origin) reached without PR ceremony.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — the PR ceremony was symbolic when no review happens; this rule strips the symbol.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — the meta-rule that triggered this file's authoring.
- `~/ecodiaos/patterns/client-push-pre-submission-pipeline.md` — the OPPOSITE rule for client repos (branch + PR + reviewer-persona is mandatory there).
- `~/ecodiaos/patterns/never-contact-eugene-directly.md` and `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` — why client repos still need PRs (external review is real).
