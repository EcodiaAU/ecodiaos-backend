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
    # Already up; quick health probe to confirm it's actually responsive (not zombie)
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:7460/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) {
            # silent success - don't spam log
            exit 0
        }
    } catch {
        # bound but not responsive => zombie. Kill and respawn.
        try { Stop-Process -Id $bound.OwningProcess -Force -ErrorAction Stop } catch {}
        Start-Sleep -Seconds 2
    }
}

# Not bound or zombie - respawn
Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') respawn"
& cmd /c $startCmd
exit 0
