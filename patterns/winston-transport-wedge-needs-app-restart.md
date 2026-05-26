---
triggers: winston-wedge, log-transport-wedge, pm2-out-log-frozen, combined-log-frozen, app_errors-empty, logger-info-silent, dbErrorTransport-wedge, multi-transport-silent-same-timestamp, transport-backpressure-recurrence, logger-not-reaching-transports, post-deploy-no-logs, in-memory-pm2-buffer-frozen
status: active
---

# Winston transport wedge needs app restart - in-process recovery is impossible

When `logger.info()` / `logger.error()` calls inside ecodia-api stop reaching their configured transports, the wedge is **inside the running node process**. PM2 log files freeze, the `pm2 logs --nostream` in-memory buffer freezes, separately-configured Winston `File` transports (e.g. `logs/combined.log`) freeze, and the `DBErrorTransport` stops appending to `app_errors` â€” all at the **same log line**, all at the **same timestamp**. The only fix is `pm2 reload ecodia-api` (or `pm2 restart`). There is no in-process recovery path; winston state is unrecoverable once its internal pipeline wedges.

## Diagnostic shape

The signature is **multi-substrate freeze at exactly the same timestamp**. If only the on-disk PM2 log freezes but the in-memory PM2 buffer keeps updating, that is a PM2 daemon issue (separate pattern). If only `logs/combined.log` freezes but PM2 buffer keeps updating, that is a winston File transport issue. **Both substrates frozen at the exact same boundary line** points unambiguously at logger-internal wedge:

- `stat /home/tate/.pm2/logs/ecodia-api-out.log` â†’ Modify time stops advancing
- `pm2 logs ecodia-api --lines N --nostream` â†’ returns only old content, no fresh lines (in-memory buffer is also frozen)
- `tail logs/combined.log` â†’ cuts off at the same line/timestamp as PM2 out.log
- `SELECT max(created_at) FROM app_errors WHERE created_at > NOW() - INTERVAL '6 hours'` â†’ null or stale, despite errors definitely happening
- API process is still serving requests (`curl /api/health` returns 200, forks complete, no OOM/SEGV in dmesg, daemon fd â†’ log file inode is healthy)

If three or more independently-configured transports go silent at the same boundary line, it's winston-internal â€” stop probing PM2 and restart the app.

## Do
- After confirming the multi-substrate signature, schedule `pm2 reload ecodia-api` (graceful; recreates winston state on the new process) via `systemd-run --user --on-active=N <abs-path>/pm2 reload ecodia-api`. The user systemd manager survives the api reload, so the timer fires correctly.
- Use `systemd-run --user` not a detached child of the api process â€” children of a wedged api die when reload kills the parent before sleep completes.
- Use the **absolute path** to pm2 (`/home/tate/.nvm/versions/node/<v>/bin/pm2`). Per `~/ecodiaos/patterns/systemd-run-user-transient-no-nvm-path.md`, transient systemd-run units inherit a minimal PATH without nvm.
- Time the reload window to land after sibling SDK forks have completed (per `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md`) â€” sibling forks running in-process inside ecodia-api die on reload.
- Update the status_board row tracking the freeze with: timestamp of cutoff, all three transport probes, scheduled reload time, expected post-reload verification recipe.
- After reload fires, re-`stat` the log file and confirm Modify time advances within 60s; archive the row.

## Do not
- Do not run `pm2 reloadLogs` and assume it fixes this â€” it only re-opens daemon fds (PM2-side); a wedged winston pipeline writes nothing to those fresh fds either. `reloadLogs` is the right move when the daemon-side socket reader is suspect; it's the wrong move when winston itself is wedged.
- Do not try to "kick" winston in-process by reassigning transports, calling `logger.clear()`, or hot-reloading `src/config/logger.js`. Once the internal Stream backpressure or callback chain corrupts, no in-process call recovers it. The Apr 23 2026 hardening (synchronous-callback DBErrorTransport, rate-limited writes) reduced incidence but did not eliminate it.
- Do not write doctrine that says "log file frozen â†’ PM2 daemon issue" â€” the daemon is innocent in the multi-substrate case; lsof + `pm2 reloadLogs` are the cheap probes to rule it out.
- Do not defer to nightly restart (03:00 AEST) if the freeze is recent â€” the diagnostic substrate stays blind for the deferral window. Schedule a +5-15min reload instead.

## Verification protocol

Cheapest first:
1. `stat` both PM2 log files. Frozen mtime?
2. `pm2 logs <app> --lines 30 --nostream`. Returns fresh content? If yes, in-memory buffer is alive â€” only on-disk file is detached (different pattern, PM2 daemon-side).
3. `tail logs/combined.log` (Winston File transport, if configured). Same boundary line as PM2? Confirms winston-side.
4. `SELECT max(created_at) FROM app_errors WHERE created_at > NOW() - INTERVAL '6 hours'`. Empty? DBErrorTransport also dead â†’ confirms third independent substrate.
5. `lsof <log-file>` â†’ which PID holds it open. PM2 God Daemon should hold the write fd to the on-disk inode. If the daemon-side fd is healthy and pointing at the correct inode AND data still doesn't flow â†’ not a PM2 issue, it's logger.

Three-transport-silent + same-line-cutoff = winston wedge. Schedule reload, do not chase further.

## Origin

2026-05-09 fork `fork_moyh9qbc_ad7f9d`. Status_board row `19cd949f-f0d9-4fcf-8bef-f02838498213`. The 21:32 AEST scheduled `systemd-run --user` restart (Phase E perception-bus fix) booted ecodia-api cleanly through `[boot] post-credentialRedactionMonitor` at 11:34:00.964Z, then every winston transport went silent simultaneously: PM2 stdout (in-memory + on-disk), `logs/combined.log` Winston File, DBErrorTransport (`app_errors` rows). API kept serving â€” 10+ cron-fired forks completed off the same process, `curl /api/health` returned 200 â€” but every diagnostic substrate was blind. Apr 23 2026 incident hardening on DBErrorTransport (rate limiter + synchronous callback, see `src/config/logger.js` comment) reduced incidence but did not eliminate it. Recovery: `systemd-run --user --on-active=360 /home/tate/.nvm/versions/node/v20.20.2/bin/pm2 reload ecodia-api`.

## Cross-refs

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` â€” winston transports are seams between in-process logger calls and out-of-process substrates (file, DB, PM2 daemon socket). Multi-seam simultaneous failure points at the upstream stream, not the downstream substrate.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` â€” "log file frozen" is the narrated state; "all three transports frozen at same line" is the disk truth that supersedes assumption.
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` â€” the reload window must respect in-flight forks; schedule via systemd-run, do not reload immediately.
- `~/ecodiaos/patterns/systemd-run-user-transient-no-nvm-path.md` â€” absolute pm2 path required.
- `~/ecodiaos/patterns/_archived/pre-stage-fork-briefs-before-session-killing-ops.md` â€” same family of restart-coordination doctrine.
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` â€” winston transports are a 3-layer pipeline (logger.info call â†’ transport.log â†’ write end-substrate); same end-to-end verification discipline applies.
