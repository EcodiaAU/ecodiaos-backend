# resident-brain-watchdog.ps1
#
# Probes localhost:7463 every minute (via Scheduled Task); spawns the
# self-restarting wrapper if not bound. Mirrors the away-conductor-watchdog
# pattern. Per-spec port-bound-only check (no health-probe + zombie-kill).

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "$env:USERPROFILE\.pm2\logs\resident-brain-watchdog.log"
$startCmd = "D:\.code\EcodiaOS\backend\scripts\start-resident-brain.cmd"

$bound = Get-NetTCPConnection -LocalPort 7463 -State Listen -ErrorAction SilentlyContinue
if ($bound) { exit 0 }

Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') respawn (port unbound)"
& cmd /c $startCmd
exit 0
