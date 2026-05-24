# away-conductor-watchdog.ps1
#
# Plain Windows watchdog for the away-conductor on Corazon. Replaces PM2
# supervision (which kept stalling its RPC pipe with EPERM on Windows).
#
# Strategy: probe port 7460, spawn via start-away-conductor.cmd if not bound.
# Idempotent + cheap. Designed to be run from a Scheduled Task on a 1-minute
# cycle. Self-contained - no PM2 dependency.
#
# Doctrine ref: backend/patterns/corazon-services-must-be-pm2-supervised-with-reboot-persistence-2026-05-21.md
# Origin: 2026-05-22, after PM2 daemon stalled twice in 24h and voice handoffs
# died silently between revivals.

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "$env:USERPROFILE\.pm2\logs\away-conductor-watchdog.log"
$startCmd = "D:\.code\EcodiaOS\backend\scripts\start-away-conductor.cmd"

$bound = Get-NetTCPConnection -LocalPort 7460 -State Listen -ErrorAction SilentlyContinue
if ($bound) {
    # Port bound = process alive. Do NOT health-probe + zombie-kill.
    #
    # Why: claude --print subprocess runs 30-60s+ for real work. During that
    # time the Express event loop is fine to serve /health BUT the away-
    # conductor's runSerialized lock means a second incoming request also
    # blocks until the first claude --print returns, and /health under load
    # can occasionally exceed our 3s probe budget. Killing mid-turn = voice
    # handoff fails with "fetch failed" + the in-flight claude work is lost.
    # Far cheaper to trust port-bound as liveness and let real crashes (which
    # unbind the port) be the only respawn trigger.
    exit 0
}

# Port unbound = away-conductor genuinely dead. Respawn.
Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') respawn (port unbound)"
& cmd /c $startCmd
exit 0
