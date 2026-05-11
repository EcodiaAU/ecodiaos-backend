---
triggers: grep-absence, evidence-of-absence, single-keyword-grep, zero-matches-trap, naming-convention-miss, hook-not-found, file-not-found-via-grep, regex-narrow-too-narrow, missing-feature-claim, code-not-present-claim, grep-proved-nothing, codebase-recon-on-main, on-main-recon-bias, false-negative-recon, diagnostic-overreach, regex-vs-read, hyphen-case-vs-camel-case, naming-variant-miss, register-vs-registration, push-notifications-recon, capacitor-plugin-recon
---

# A zero-match grep is NOT evidence of absence — it's evidence that THAT regex didn't match. Different naming variant, different file, different branch, sibling worktree state all defeat the grep.

## The rule

Before declaring a feature / hook / call site / table / migration / file ABSENT from a codebase based on a `grep` result, the recon MUST satisfy ALL of:

1. **Multiple regex variants tried.** Test the API literal (`PushNotifications.register`) AND every plausible wrapper name (`usePushNotifications`, `usePushRegistration`, `usePush`, `usePushNotifs`, `registerPush`, `push-notifications`, `push-register`, `push.register`, etc.). Naming conventions vary: hyphen-case file (`use-push.ts`) vs camelCase symbol (`usePushRegistration`), "register" vs "registration" suffix, plugin-renamed-on-import (`{ PushNotifications as PN }`).
2. **Multiple search paths.** `src/` is not the only place hooks live. Check `app/`, `lib/`, `hooks/`, `services/`, `components/`, `utils/`. Use `grep -rn` without an `--include` filter first, narrow only if too noisy.
3. **Multiple file extensions.** `.tsx`, `.ts`, `.jsx`, `.js`, `.svelte`, `.vue`, `.mts`, `.cts`. Restricting to `.tsx,.ts` misses anything in `.js`, vendor patches, or generated code.
4. **Branch + worktree state checked.** `git status -sb` + `git log --oneline -5` at the start. If on a sibling-fork feature branch with un-pulled main, the file may exist on main but not the current HEAD. If the worktree was `git stash`'d and partially cleaned by a sibling fork, the file may have been moved or hidden.
5. **At least one direct `ls` / `Read` probe of the directory.** A `ls src/hooks/` BEFORE concluding "no push hook exists" catches the false negative immediately.

If any one of 1-5 is skipped, the recon is INSUFFICIENT to assert absence. The right framing in the deliverable is "I did not find via my probe (regex X paths Y extensions Z)", NOT "this feature does not exist."

## Do

- State the exact regex + path + branch state used: `grep -rE 'PushNotifications.register|usePush[A-Z][a-z]+' --include='*.{ts,tsx,js,jsx}' src/ app/ lib/ hooks/ services/ — branch=<X>, HEAD=<sha>, dirty=<bool>`.
- Vary by 2+ naming axes: API-literal vs wrapper-name, hyphen-case file vs camelCase symbol, suffix variants.
- `ls src/hooks/ src/lib/ src/services/ 2>/dev/null` as a sanity-check probe BEFORE asserting "no hook exists".
- When dispatching a fork to "fix" a supposed missing piece, brief the fork to **FIRST verify the piece is actually missing** via Read on plausible filenames + a broader grep. If found, narrow scope and report.
- In status_board context fields, frame as "not found via probe X" rather than "absent" — keeps drift-audit honest.

## Do not

- Run ONE grep with ONE regex variant on ONE path filter and treat zero matches as ground truth.
- Restrict `--include` filter on first probe — narrows too aggressively, hides files in adjacent extensions.
- Declare "this feature does not exist" / "the hook is missing" / "no call site found" without the 5-point check above.
- Brief a fork to "add the missing X" without the brief instructing the fork to verify X is actually missing first. Forks reading the brief context trustingly will waste time + may add a parallel duplicate of an existing implementation under a different name.
- Skip the `ls` / `Read` sanity probe when the regex returned zero matches but the project clearly should have the feature (e.g. native push notification plugin installed + Firebase wired = some register-call MUST exist somewhere; missing means YOUR probe missed it, not "the code is missing").

## Verification protocol after recon

For any absence-claim about to ship into a status_board row, fork brief, Neo4j Decision, or Tate-facing deliverable:

```
1. Re-run grep with at least 2 alternative regex (API-literal + 2+ wrapper-name variants).
2. ls the obvious directories (src/hooks/, src/lib/, hooks/).
3. git log -10 --all -- src/hooks/  # check for renamed/moved files
4. If feature is "supposed to exist" given visible dependencies (e.g. @capacitor/push-notifications in package.json), default-DO-NOT-claim-missing until 1-3 are clean.
```

A 30-second extra probe before the claim ships saves a fork dispatch + Tate's RDP minutes.

## Origin

Tate 11 May 2026 ~12:09 AEST: conductor on main wrote a push-notifications diagnostic checklist (`~/ecodiaos/drafts/coexist-push-notifications-rdp-checklist-2026-05-11.md`) declaring as Root Cause #1: "Zero `PushNotifications.register()` / `usePushNotifications` calls in `~/workspaces/coexist/src/`. The Capacitor plugin is installed but unused. iOS will never ask for permission."

The fork `fork_mp0kfrt5_1cc90e` dispatched to "add the missing hook" returned [FORK_REPORT]:

> The codebase was significantly more complete than the brief assumed: `usePushRegistration` in `src/hooks/use-push.ts` already fully implements permission request + `register()` + `push_tokens` upsert + iOS FCM-bridge polling + app-resume re-registration, and is already wired at `app-shell.tsx:120`. The `push_tokens` table (migration ...) ...

The conductor's grep was:
```
grep -rE "PushNotifications.register|registerForRemoteNotifications|usePushNotifications" --include="*.tsx" --include="*.ts" -l src 2>&1 | head -5
```

Three failure modes stacked:
1. Regex only tried `usePushNotifications` (camelCase, "Notifications" suffix), missed `usePushRegistration` (different suffix word).
2. Regex only tried `PushNotifications.register` (the literal API call), but the hook file uses something like `await PushNotifications.register()` inside `useEffect` — the grep SHOULD have matched, suggesting the worktree the grep ran on was on a sibling branch where the file wasn't yet present, OR the grep had a subtle path-issue (sibling fork branches: branch was `1.8.5-excel-sync-impact-gate` per `git status -sb`, not main; the use-push.ts hook may live on main but not be in the sibling-branch's checked-out tree).
3. `ls src/hooks/` was never run — a 1-second probe that would have shown `use-push.ts` immediately.

Doctrine deferred to a fork that itself caught the false-negative on disk and shipped narrower scope (entitlement flip + google-services.json placement + cap sync). No real damage — fork did the right thing — but the conductor's diagnostic chat-output to Tate misled him about the gap size for ~10 minutes and risked a duplicate hook being authored.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (the meta-rule this is a specialisation of)
- `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md` (the conductor's on-main probe is the trap; a fork's recon would have caught the actual file)
- `~/ecodiaos/patterns/factory-codebase-staleness-check-before-dispatch.md` (`git pull` + branch verification BEFORE recon — sibling-branch state was a contributing factor)
- `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md` (broader narration-vs-truth doctrine)
- `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md` (when multiple absence-claims surface from one recon, the shared upstream cause is "recon was too narrow", not "all those features are absent")
