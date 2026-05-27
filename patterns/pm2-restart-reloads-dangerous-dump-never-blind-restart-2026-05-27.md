---
triggers: pm2-restart, pm2-resurrect, pm2-dump, credential-clobber, refresh-clobber-watchdog, cred-zombie, all-sessions-signed-out, blind-restart, pm2-start-ecosystem, dump-pm2, stale-token-restore, scheduler-rotate-before-refresher, seed-cred-files, laptop-agent-restart-danger
---

# Never blind-restart PM2 - the dump reloads zombie services that clobber credentials

## The rule

NEVER run `pm2 restart <name>`, `pm2 resurrect`, or `pm2 start ecosystem.config.js` without FIRST:

1. `pm2 list` - see exactly what is registered right now
2. Inspect `~/.pm2/dump.pm2` (if it exists) for dangerous services - the dump is what `pm2 resurrect` and the PM2 daemon's auto-resurrect-on-boot reload, and it can contain services that no longer exist on disk or that were supposed to be killed
3. Confirm `refresh-clobber-watchdog.js` (or any `fs.watch`-on-credentials service) is NOT in the list or the dump

If you must restart a single live process and you have verified the dump is clean (or absent), prefer `pm2 restart <id>` for the SPECIFIC id you confirmed in `pm2 list`. Better still: kill + relaunch that one process directly rather than going through PM2's dump-aware machinery.

**Why:** Triple-incident. Running `pm2 restart` reloaded the saved `~/.pm2/dump.pm2`, which still had `refresh-clobber-watchdog.js` configured. That watchdog `fs.watch`-es `~/.claude/.credentials.json`, sees the file change when a fresh login lands, and "restores" stale tokens from `~/.ecodia-creds/` backups - overwriting the good login with an expired one. Result: every Claude account signed out, all sessions stopped, autonomy substrate dead. Hit 2026-04 (musl/glibc era), again mid-May, again 2026-05-27 during the 24/7-autonomy build. The 2026-05-27 instance: the autonomy-builder chat (this one) ran `pm2 restart eos-laptop-agent --update-env`, the dump brought the zombie watchdog back, it clobbered creds within seconds.

**How to apply:** Any turn where you are about to type `pm2 restart` / `pm2 resurrect` / `pm2 start ecosystem.config.js` / `pm2 save` - STOP, run the 3-step pre-check above first. The PreToolUse hook `~/.claude/hooks/ecodia/pm2-restart-guard.py` fires `[PM2-RESTART GUARD]` on these payloads. Treat it as a hard gate, not a nudge.

## refresh-clobber-watchdog.js is permanently forbidden

This file is the source of the credential-zombie bug. It must NEVER exist on disk again, in any form, under any name. The pattern is: a daemon that `fs.watch`-es `~/.claude/.credentials.json` and writes back from a backup directory.

- Regression guard: `D:/.code/eos-laptop-agent/tools/creds.test.js` monkey-patches `fs.watch` before requiring `creds.js` and fails if any watcher is registered. Keep that test green.
- Doctrine sibling: the canonical autonomy substrate (`reference_autonomy_substrate_2026-05-26`) states "no fs.watch on credentials" as a regression-tested invariant.
- If you ever feel the need for credential-freshness enforcement, that is the `cred-refresher.js` daemon's job (it REFRESHES via OAuth on a timer, it does NOT restore-from-backup-on-change). Never re-solve it with a watcher.

## Credential ordering invariant - refresher BEFORE scheduler

The scheduler calls `creds.rotate_to(account)` to swap `~/.claude/.credentials.json` before dispatching a worker on that account. If the per-account token file (`D:/PRIVATE/ecodia-creds/{tate,code,money}.json`) holds a STALE token, the scheduler rotates an expired token into the live credential file - same visible failure as a clobber (sessions die).

Therefore, BEFORE enabling `SCHEDULER_ENABLED=true` with `rotate_to` live:

1. The `cred-refresher.js` daemon must be VERIFIED running and successfully refreshing (it does the 30-min OAuth refresh, rotating the single-use refresh_token atomically).
2. Each per-account file in `D:/PRIVATE/ecodia-creds/` that the scheduler may rotate to must be SEEDED with a FRESH token first. A missing or stale file means the scheduler must NOT be allowed to pick that account.
3. Account-seeding requires Tate to sign in to that account interactively (code@ / money@), then the fresh token is captured. Until code@/money@ are seeded, the scheduler must be constrained to the seeded account(s) only.

## Recovery runbook (what a clobber looks like + how it was fixed 2026-05-27)

Symptoms: all Claude accounts signed out, `.credentials.json` holds an expired token, sessions stop, scheduler dispatches fail auth.

Fix sequence that worked:
1. Kill all PM2 daemons (`pm2 kill` or kill each).
2. Delete `~/.pm2/dump.pm2` so `pm2 resurrect` / boot-resurrect can't reload the zombie config.
3. Confirm `refresh-clobber-watchdog.js` is absent from disk (delete if the dump-resurrect or a chat recreated it).
4. Delete any stale `*.json` token backups in `D:/PRIVATE/ecodia-creds/` that hold expired tokens.
5. Delete the clobbered `~/.claude/.credentials.json` (expired).
6. Clear VS Code DPAPI secret storage.
7. Tate re-signs in interactively; fresh token captured; per-account files re-seeded from fresh state.

## Anti-patterns

- `pm2 restart eos-laptop-agent` "just to pick up new code" without checking the dump - this is exactly what caused the 2026-05-27 incident. To pick up new code, verify dump is clean first, OR kill+relaunch the single process directly.
- Recreating any credentials watcher "to keep tokens fresh" - that is the zombie. Use the refresher's timer-based OAuth path.
- Enabling the scheduler's `rotate_to` before the refresher is verified + accounts seeded.
- `pm2 save` after a messy session - this WRITES a new dump that may capture zombie state. Only `pm2 save` from a known-clean `pm2 list`.

## Cross-references

- [[24x7-autonomy-architecture-invariants-2026-05-27]] - invariant 2 (no conductor reads .credentials.json directly; only creds.rotate_to writes; no fs.watch)
- [[reference_autonomy_substrate_2026-05-26]] - the canonical substrate doc
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]] - the legit reason to restart (code change), which still must respect the dump pre-check
- [[verify-deployed-state-against-narrated-state]]
- Origin: Tate verbatim 2026-05-27, relayed from the recovery chat: "Never run pm2 restart or pm2 resurrect without first checking pm2 list or the dump file... refresh-clobber-watchdog.js is permanently deleted and must never be recreated - it's the source of the credential zombie bug that's hit three times now."
