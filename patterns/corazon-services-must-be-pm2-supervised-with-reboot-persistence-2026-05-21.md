---
triggers: corazon-process-died, away-conductor-down, eos-laptop-agent-down, laptop-hands-down, voice-call-down-corazon, pm2-windows-startup, pm2-resurrect-at-logon, services-must-always-be-running, corazon-reboot-broke-things, plain-node-background-spawn-not-supervised, pm2-daemon-rpc-pipe-stuck-eperm, pm2-windows-startup-install, scheduled-task-pm2, no-reboot-persistence, every-corazon-service-needs-supervision
---

# Corazon services must be PM2-supervised AND PM2 must auto-start on logon

Tate verbatim 2026-05-21: "We need to make sure these processes are ALWAYSSSSSS running otherwise we're fucked."

Corazon hosts away-conductor (port 7460), eos-laptop-agent (port 7456), and a handful of sister processes (usage-poller, refresh-clobber-watchdog, cursor-preview ide bridges). If any of these dies and stays dead, an entire surface of EcodiaOS goes blind:

- away-conductor down -> every voice HANDOFF and every native triage escalation fails silently. Tate hears acks that go nowhere.
- eos-laptop-agent down -> every Chrome CDP / GUI automation / IDE bridge call from VPS or another chat 404s.
- laptop-hands down -> visual verification + macro replay broken.

Plain-`node` background processes are NOT enough. They die on crash, on logout, on reboot, on Windows update restart. Two compounding gotchas on Windows:

1. **PM2 doesn't auto-start on Windows reboot by default.** The dump file (`~/.pm2/dump.pm2`) holds the saved state, but nothing replays it at logon. Reboot = silent fleet-wide outage until someone notices and manually runs `pm2 resurrect`.
2. **The PM2 daemon RPC pipe stalls with `EPERM connect //./pipe/rpc.sock`** after partial kills or crashed daemons. Six stale daemon processes was the state on 2026-05-21. Once stalled, every `pm2 *` command fails until you taskkill all of them and re-spawn cleanly.

## The fix - one-time setup that locks in reboot persistence

From elevated PowerShell on Corazon:

```powershell
# 1. Kill any stale PM2 daemons (the RPC-pipe stall)
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*pm2*Daemon.js*" } |
  Stop-Process -Force

# 2. Kill any unsupervised duplicates of services PM2 should own (so resurrect doesn't EADDRINUSE on respawn)
#    e.g. if away-conductor is running as a plain node background process at PID 19512:
#    taskkill /F /PID 19512

# 3. Replay the saved PM2 dump - this brings every service back under supervision
pm2 resurrect

# 4. Verify the fleet is back
pm2 list

# 5. Install the third-party startup shim (one-time, never run again)
npm install -g pm2-windows-startup

# 6. Wire pm2 resurrect into a Windows Scheduled Task that fires at logon
pm2-startup install

# 7. Verify the Scheduled Task is registered
Get-ScheduledTask | Where-Object { $_.TaskName -like '*pm2*' }
```

After step 7 returns a row, reboots stop breaking the fleet.

## Verification checklist (run after any Corazon reboot, any PM2 install, any "process died" report)

```powershell
# Each service should be online + restart_count low + uptime reasonable
pm2 list

# Health probes (fail-fast):
curl http://localhost:7460/health   # away-conductor
curl http://localhost:7456/api/health  # eos-laptop-agent
# (add others as the fleet grows)

# Scheduled Task is wired
Get-ScheduledTask | Where-Object { $_.TaskName -like '*pm2*' } | Select-Object TaskName, State
```

If `pm2 list` errors with `connect EPERM //./pipe/rpc.sock`, that's the stale-daemon stall. Restart at step 1 above.

## Anti-patterns

- **Plain `Start-Process node script.js` for an EcodiaOS service**. Acceptable as a same-turn emergency unblock, but EVERY plain-spawn must be followed by a `pm2 start ... && pm2 save` before the chat closes. An unsupervised PID is debt that compounds (won't survive reboot, won't restart on crash, won't show in any health check).
- **Multiple chats fixing the same Corazon process concurrently**. PM2 + a manual spawn + a sister chat's `pm2 start` = three processes racing for the same port. Coordinate via the `status_board` row for the service before touching it.
- **Trusting "the process was running last time I checked"**. Always probe the health endpoint, not the PID or PM2 status alone (see [[pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17]]).

## Origin

2026-05-21 voice handoff failures: away-conductor PID 9548 was loaded with stale code (pre-fix `cf is not defined`), crash-looping on every voice case. Killed via elevated taskkill, spawned fresh via Start-Process, ran unsupervised as PID 19512. Sister chat surfaced the broader pattern - PM2 dump exists but no Scheduled Task replays it at logon. Three sister processes (away-conductor, usage-poller, refresh-clobber-watchdog) were brought back by an ad-hoc `pm2 start` earlier in the day but the dump never got saved, so a reboot would have lost them again.

## Cross-references

- [[pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17]]
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]]
- [[verify-deployed-state-against-narrated-state]]
- [[one-brain-stateful-coordination-2026-05-21]] (voice + away depend on this supervision)
