---
triggers: autonomy-substrate, scheduler-corazon, autonomous-cc-dispatch, cron-cc-chat, account-rotation-sequential, cred-rotation-launch-time, dispatch_worker-ide-stable, signal_bound, signal_done-inbox-filter, os_scheduled_tasks-poll, refresh-clobber-watchdog-never, never-fs-watch-credentials, never-bring-back-watchdog, oauth-refresh-token-rotates, laptop-agent-scheduler-feature-flag, scheduler-enabled-default-off, corazon-watchdog-vps-sms, manual_chat-http-rotation, usage-cap-observer-15min-headroom
description: The autonomy substrate that fires scheduled and event-driven CC chats on Corazon. Where each piece lives, what to never recreate, and the load-bearing invariants that prevent the previous self-DOS.
---

# Autonomous scheduler on the eos-laptop-agent (2026-05-26)

## Rule

EcodiaOS fires its own CC chats from the laptop-agent on Corazon. Anthropic cloud Routines and VPS-resident schedulers are deprecated for this path. The substrate polls `os_scheduled_tasks` in Supabase Postgres, rotates `~/.claude/.credentials.json` to the healthiest of three accounts at chat-launch time, dispatches via `cowork.dispatch_worker` with `ide:"stable"`, and tracks completion through coord inbox filtering for `body.type === "done"`. Sequential rotation between accounts, never parallel multi-IDE binding.

## Why

Tate is travelling October to December 2026 and the system must run without manual prompting during that window. The previous architectures (Anthropic Routines at 15-per-day cap, VPS-resident `schedulerPollerService.js` dispatching dead SDK forks, file-watching `refresh-clobber-watchdog.js`) all failed: Routines hit the cap, the VPS poller pointed at deprecated forks, and the watchdog self-DOSed the system by restoring stale tokens within 300ms of every fresh login. The 2-day debug of the watchdog incident in May 2026 confirmed: any code that watches `~/.claude/.credentials.json` is a regression no matter how clever it tries to be.

## How to apply

Touch any of these without re-reading this pattern is a regression risk:

- **`D:/.code/eos-laptop-agent/tools/scheduler.js`** - the dispatch loop, completion tracker, stale-lease recovery, cap observer. Feature-flagged off via `SCHEDULER_ENABLED=true`. 51 unit tests.
- **`D:/.code/eos-laptop-agent/tools/creds.js`** - per-account file rotation with atomic rename. fs.watch regression test enforces no file-watcher will ever come back. 10 unit tests.
- **`D:/.code/eos-laptop-agent/daemons/cred-refresher.js`** - 30-min OAuth refresh loop. Refresh token rotates on every call (single-use), so it MUST write the new refresh_token back atomically or the next refresh 401s. 6 unit tests.
- **`D:/.code/EcodiaOS/backend/src/services/corazonWatchdog.js`** - VPS-side, SMSes Tate on laptop-agent down, queue backup, refresh failures, orphaned tasks. 26 unit tests. Never executes work.
- **`D:/.code/EcodiaOS/backend/src/db/migrations/136_os_scheduled_tasks_autonomy_substrate.sql`** - adds `preferred_account`, `actual_account`, `leased_by`, `leased_at`, `dispatched_tab_id`, `retry_count`, `last_error`, `last_result`, `idempotency_key`, `priority`. Extends status CHECK with `dispatching`, `running`, `orphaned`.
- **`D:/PRIVATE/ecodia-creds/{tate,code,money}.json`** - per-account OAuth files. Only `tate.json` is seeded as of 2026-05-26; `code.json` and `money.json` need Tate to sign in then copy.

## Non-negotiable invariants

1. Nothing watches `~/.claude/.credentials.json` with `fs.watch` (or chokidar, or any other mechanism). Enforced by test `REGRESSION: creds module never calls fs.watch`. Any code path that "restores" `.credentials.json` from a backup is a regression and must be rejected in code review.
2. The cred-refresher daemon reads + writes ONLY `D:/PRIVATE/ecodia-creds/{account}.json`. It NEVER touches `~/.claude/.credentials.json`. That file is owned exclusively by `creds.rotate_to`.
3. Mid-session credential swap for already-running chats is impossible. Each chat reads `.credentials.json` at LAUNCH and caches the tokens. Rotation only affects the NEXT chat to spawn.
4. Sequential rotation only. No multi-IDE binding (Tate verbatim 2026-05-26: "No we arent doing the stable, insiders and cursor bullshit again, its only stable").
5. `dispatch_worker` is called with `ide: "stable"` always. The keybind is delegated to `vscode.new_claude_code_chat` which targets VS Code Stable specifically.
6. Refresh tokens are single-use - they rotate on every refresh call. The daemon MUST atomically write the new refresh_token back to the per-account file or the next refresh 401s.
7. `SCHEDULER_ENABLED=true` must be set explicitly in PM2 env (or `.env`) before the scheduler starts polling Postgres. Default off prevents accidental polls on agent restart before the substrate is fully seeded.

## Past failure mode to never recreate

`refresh-clobber-watchdog.js` (May 2026 incident, 2 days of debugging). The PM2-supervised daemon watched `~/.claude/.credentials.json` via `fs.watch`. Its `active_account.json` was locked to `money@ecodia.au`. Every time a fresh OAuth login wrote new tokens for `tate@` or `code@`, the watchdog detected a "signature mismatch" against `money@`'s stale May-21 backup, classified it as a "refresh-clobber", and atomically restored the expired tokens from backup within 300ms. The fix was killing the PM2 daemon + deleting all four stale backup files in `~/.ecodia-creds/`. The watchdog file was deleted from source at commit ad37709 (2026-05-26). The aesthetic discipline of the new substrate exists specifically to make that class of bug impossible by construction.

## Cross-refs

- Spec: `docs/superpowers/specs/2026-05-26-autonomy-substrate-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-26-autonomy-substrate.md`
- Findings: `docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md`
- Memory substrate doctrine: [[memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15]]
- Status board hygiene reflex (this scheduler can produce rows): [[status-board-hygiene-is-a-0th-class-reflex-2026-05-21]]
- IDE tab dispatch mechanic: [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- Chrome CDP launch reflex (relevant when manual chats need GUI): [[chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear]]
