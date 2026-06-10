# P3 Followup: Auto-restart supervision for dispatch daemons

**Priority:** P3
**Logged:** 2026-05-18 13:18 AEST
**Logged by:** Conductor (OC) per Tate directive

## Context

Multi-account dispatch + coord substrate (`eos-laptop-agent` + `usage-poller` + `refresh-clobber-watchdog`) is currently running standalone on Corazon. PM2 entries for these three were created during the build but immediately wedged in `EADDRINUSE` restart loops because port 7456 was already held by the standalone instances. Deleted today to stop the noise (matches doctrine `pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17`).

## Problem

Standalone-with-no-supervisor cost ~30min on 2026-05-18 when PID 30148 wedged under memory pressure and Tate had to manually end-task it. No auto-restart on crash currently. If any of the three core daemons dies, the dispatch/coord substrate goes dark until manually relaunched.

## Fix paths

1. **PM2 takeover (proper)**: stop standalone instances → `pm2 start ecosystem.config.js` → verify ports bind cleanly → save PM2 list. Brief outage during takeover.
2. **Windows Service**: register each daemon as a Windows service with restart policy. Heavier setup, no outage, OS-level supervision.
3. **Tiny watchdog daemon**: standalone watchdog that polls `http://localhost:7456/health` + heartbeat-file mtime, respawns on staleness. Smallest scope but adds another standalone process to babysit.

## Recommendation

Option 1 (PM2 takeover) when Tate's around to watch the cutover — port conflict + ecosystem.config.js audit + smoke test of the three daemons after takeover. ~30min focused session.

## When

This week. Not blocking dispatch substrate functionality (heartbeats fresh, coord live), so not urgent. But until done: any daemon crash = manual intervention.
