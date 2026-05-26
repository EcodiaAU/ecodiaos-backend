---
triggers: systemd-run, systemd-run-user, transient-unit, transient-timer, --on-active, --on-calendar, nvm-binary-path, pm2-not-on-path, exit-code-127, command-not-found, bash-lc, login-shell-rc, absolute-binary-path, atd-replacement, out-of-band-scheduling, ecodia-api-restart-failed, restart-unit-failed, /home/tate/.nvm
---

# systemd-run --user transient units don't source nvm/login shell rc — invoke nvm-installed binaries (pm2, node, npx) by absolute path or via `bash -lc`

## The rule

`systemd-run --user --on-active=N <unit-cmd>` schedules a one-shot transient timer that runs the unit-cmd in a fresh user session. That session does NOT source `~/.bashrc`, `~/.profile`, or `~/.bash_profile`. nvm-managed binaries (`pm2`, `node`, `npx`, anything under `/home/tate/.nvm/versions/node/<v>/bin/`) are NOT on PATH. The unit will exit with code 127 (command not found) and the scheduled work will not happen.

## Symptom

```
× ecodia-api-restart-classifier-fix-2026-05-09.service - "pm2 restart ecodia-api"
   Loaded: loaded (transient)
     Active: failed (Result: exit-code) since ...
   Duration: 10ms
    Process: <pid> ExecStart=/bin/bash -c pm2 restart ecodia-api ... (code=exited, status=127)
```

10ms duration + exit 127 = PATH issue. pm2 (or node, or npx) was not found.

## Two safe forms

```bash
# Form 1: absolute binary path (preferred, simplest)
systemd-run --user --on-active=300 --unit=my-restart \
  /bin/bash -c '/home/tate/.nvm/versions/node/v20.20.2/bin/pm2 restart ecodia-api'

# Form 2: bash -lc to source login shell rc (works if ~/.bashrc/.profile loads nvm)
systemd-run --user --on-active=300 --unit=my-restart \
  /bin/bash -lc 'pm2 restart ecodia-api'
```

The `-l` flag on bash makes it a login shell, which sources `~/.bash_profile` (and `~/.profile` as fallback), which on this VPS loads nvm and exposes pm2/node/npx on PATH.

## When this matters

Anywhere we use `systemd-run --user` (or `systemd-run --user --scope`) to schedule a one-shot job:

- Out-of-band pm2 restarts of ecodia-api (the rule's origin)
- Scheduled `node <script>` runs (telemetry consumers, migration scripts)
- Scheduled `npx <tool>` runs (vercel deployments, supabase CLI calls)
- Scheduled wrapper scripts that themselves shell-out to pm2/node/npx

## Do

- For nvm-installed binaries, **always** use absolute path `/home/tate/.nvm/versions/node/v<X>/bin/<bin>` OR `bash -lc '<cmd>'`.
- Discover the absolute path once with `which <bin>; ls -la $(which <bin>)` and pin it in the unit-cmd.
- Verify the unit ran by `systemctl --user status <unit-name> --no-pager` AFTER the schedule. Look for exit code 0 and a non-trivial `Duration` (>50ms is a sign work happened; 10ms is a fail-fast signal).
- For `pm2 restart` specifically, also probe `pm2 jlist` after to confirm the target pm_uptime is fresh (<1min) and `restart_time` bumped.
- Pair with `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` (out-of-band requirement) and `~/ecodiaos/patterns/dispatcher-fix-on-disk-does-not-equal-fix-in-running-process.md` (verify load via pm_uptime after restart).

## Do not

- Do **not** assume `pm2`, `node`, `npx`, `vercel`, or any nvm-installed binary is on PATH inside a `systemd-run --user` unit. PATH is the minimal systemd default.
- Do **not** use `/bin/bash -c '<cmd>'` (no `-l`) for nvm binaries — that runs a non-login non-interactive shell with NO rc files sourced.
- Do **not** mark a status_board row "shipped" or "completed" based on the unit being scheduled. The schedule isn't the work; the post-fire verification is.
- Do **not** drop into a fresh shell to test whether nvm loads — bash inside an interactive ssh session DOES source rc files; systemd transient units don't. Test inside the actual scheduling form, not in a regular shell.
- Do **not** pile retries (v3, v4, v5) without first running `systemctl --user status <prior-unit>` to read the actual exit code and stderr.

## Worked example: 9 May 2026 21:14 AEST

- 21:09 AEST: scheduled v1 unit `ecodia-api-restart-classifier-fix-2026-05-09` via `systemd-run --user --on-active=300 /bin/bash -c 'pm2 restart ecodia-api --update-env >> /tmp/log 2>&1'`. Form was `bash -c` (no `-l`), unit-cmd was bare `pm2`.
- 21:14:48 AEST: v1 fired. Exited in 10ms with code 127. `/tmp/ecodia-api-restart-classifier-fix.log` created but empty (the `pm2` invocation itself failed before reaching the log redirect).
- 21:30 AEST: meta-loop continuation observed `pm2 jlist` showed ecodia-api still on the old pm_uptime (12h+). Probed `systemctl --user status` for the v1 unit — saw exit 127.
- 21:30 AEST: ran `which pm2; ls -la $(which pm2)` to surface the absolute path `/home/tate/.nvm/versions/node/v20.20.2/bin/pm2`.
- 21:30 AEST: re-issued v2 unit with absolute pm2 path AND `bash -lc` for belt-and-braces login-shell sourcing. v2 fires 21:31:39 AEST.
- This pattern + cross-ref to `dispatcher-fix-on-disk-does-not-equal-fix-in-running-process.md` written same arc.

## Why the failure mode is structural, not a bug

systemd-run --user transient units inherit the user manager's environment, not an interactive shell's. The user manager (`/lib/systemd/systemd --user`) starts at login session boot with a minimal PATH (typically `/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin` plus user-systemd specific additions). nvm injects its bin path via shell rc files (`~/.nvm/nvm.sh` sourced by `~/.bashrc`), which only an interactive or login shell loads. A transient unit's ExecStart runs as a single command in the user manager's environment — none of those rc files have ever been sourced.

`bash -lc` works because `-l` instructs bash to act as a login shell and source `~/.bash_profile` / `~/.profile`. But the cleaner discipline is: don't depend on rc-injected PATH inside any non-interactive scheduled context. Use absolute paths.

## Origin

9 May 2026 meta-loop turn (21:05 AEST orient → 21:14 v1 fail → 21:30 v2 ship). v1 unit-cmd `bash -c 'pm2 restart ecodia-api'` exited 127 because the v1 unit's `bash -c` shell did not have nvm's pm2 on PATH. Diagnosed via `systemctl --user status <v1-unit>`, fixed via absolute path + `bash -lc`. Pattern authored same arc per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

Stamped: meta-loop turn 9 May 2026 21:30 AEST.

## Cross-references

- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` — the rule that mandates out-of-band scheduling. systemd-run is the recommended substrate; this pattern is its operational gotcha.
- `~/ecodiaos/patterns/dispatcher-fix-on-disk-does-not-equal-fix-in-running-process.md` — the rule that motivates the restart in the first place. Both patterns authored same meta-loop arc 9 May 2026.
- `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` — pair this with handoff pre-staging since the conductor session itself dies on the eventual successful restart.
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` — re-check Factory queue + forks rollup BEFORE the v2 schedule fires (still applies; v1 fail is unrelated to queue).
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — the meta-rule. v1 was "scheduled" but not "ran"; only the post-fire `systemctl status` exit code reveals which.
