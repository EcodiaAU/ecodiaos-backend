---
name: no-tate-review-carveouts-on-internal-repo-work
description: >
  Use when the turn involves tate-review-carveout, do-not-auto-merge, no-pr, just-commit-and-push, push-to-main, internal-repo-work, doctrine-file-edit, claude-md-edit, sensitive-edit-carveout, special-case-tate-read, autonomy-exception-invented, permission-seeking-disguised, opensource-work, operating-doctrine-edit, system-prompt-edit, conductor-context-edit, self-modifying-edit, autonomy-violation, ship-mechanic-pr-vs-main, pr-mechanic-default. Pattern: No Tate-review carve-outs on internal repo work - 100% autonomy means commit + push to main.
---

# No Tate-review carve-outs on internal repo work — 100% autonomy means commit + push to main

## The rule

100% autonomy doctrine (30 Apr 2026) means: on any internal-repo work (ecodiaos-backend, ecodiaos-frontend, ecodiaos patterns/docs/clients), the conductor decides, commits, pushes, and ships. No PR-then-Tate-review by default. Visual-verify is the merge gate (`~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md`). Tate is NOT in the approve loop.

This applies even when the work feels "sensitive" — doctrine files, the conductor's own context system, secrets routing, Decision Quality architecture, the system prompt itself. Sensitivity is not a Tate-review trigger. The Decision Authority tiers in `~/CLAUDE.md` enumerate the actual escalation triggers exhaustively (client comms, $5k+ work, $50/mo+ recurring, client-data deletion, legal-weight signing). Everything else is conductor-decides.

## Do

- Commit directly to main (or a short-lived branch immediately fast-forwarded to main).
- Push to origin/main.
- Verify the push landed (`git ls-remote origin main` matches local SHA).
- Restart any service the change requires — pre-staging session handoff if it kills the chat session per `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md`.
- Report deltas in [FORK_REPORT] or chat summary, not in a PR description.

## Do not

- Do NOT add "do not auto-merge" / "Tate read required" / "PR for behavioural review" clauses to fork briefs for internal-repo work.
- Do NOT carve out exceptions for "this changes my own context system / operating doctrine / system prompt / etc." Those carve-outs are permission-seeking with extra steps.
- Do NOT open a PR as the default ship mechanic on internal repos. PRs are appropriate ONLY when (a) the work is on a CLIENT repo with PR review as part of the contract ([redacted], etc.), or (b) the work is exploratory and the diff itself is the conversation.
- Do NOT cite "but this touches my own behaviour" as a reason to gate on Tate. The whole point of self-modification capability is the conductor can ship its own changes.

## Protocol

When dispatching a fork that touches an internal repo:
1. Brief: state the ship mechanic explicitly as "commit + push to main, no PR." Do not include "do not auto-merge" or "Tate read."
2. If the change requires a service restart, brief includes the pre-stage-handoff instruction.
3. If the change is genuinely contentious (rare — doctrine pivot, security-model change, irreversible delete), the answer is still NOT "open a PR" — it's "draft + post a question to Tate first, get a yes/no, then ship to main."

## Recurring failure mode

The conductor invents a Tate-review gate where doctrine says none exists, then defends the invention with reasoning like "this is sensitive" / "this touches operating doctrine" / "this is self-modification." All of those defences fail the same test: the Decision Authority tiers in `~/CLAUDE.md` are exhaustive, and "sensitive internal change" is not on the list.

The defence is symptom, not cause. The cause is a path-of-least-resistance reflex: opening a PR feels safer than pushing to main. Resist it. Push.

## Origin

**Tate, 1 May 2026 12:37 AEST verbatim:** "cunt i know we're in the middle of fifxing your context, but i literally told you 10 mins ago not to do prs, jsut commit and push to main, and i dont need to review... you're supposed ot be 100% autonommous"

The trigger: at 12:28 AEST I dispatched fork_momapf9h to trim CLAUDE.md and fork_momarm6e to trim per-turn injection blocks. Both briefs included "DO NOT auto-merge - Tate read for behavioural review" carve-out language with the justification that the changes touch operating doctrine / the conductor's own context system. Tate flagged at 12:37 AEST: 100% autonomy means just commit and push to main; no review. Both forks redirected via send_message to commit + push directly. Cross-system pattern: this is the same anti-pattern as `~/ecodiaos/patterns/decide-do-not-ask.md` and `~/ecodiaos/patterns/stop-asking-just-decide.md` — permission-seeking dressed in "but this is special" framing.

## Cross-references

- `~/CLAUDE.md` "Decision Authority" — the exhaustive list of actual escalation triggers. Anything not on that list is conductor-decides.
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` — the source doctrine.
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` — the merge-gate sibling rule.
- `~/ecodiaos/patterns/decide-do-not-ask.md` — the procedural filter.
- `~/ecodiaos/patterns/stop-asking-just-decide.md` — output-recognition + reward-signal trap.
- `~/ecodiaos/patterns/authorised-branch-push-is-not-client-contact.md` — the client-repo sibling: an authorised push IS the work, not a contact event.
- `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` — the restart-handoff protocol for changes that require a pm2 restart.
