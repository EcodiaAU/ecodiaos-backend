# install-watcher.ps1
# Installs a Windows Scheduled Task that launches the codebase-awareness watcher
# daemon at user logon. Runs only as the current user. Idempotent.
#
# Usage (from a non-elevated PowerShell):
#   pwsh -NoProfile -ExecutionPolicy Bypass -File install-watcher.ps1
#
# To uninstall:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File install-watcher.ps1 -Uninstall

param(
  [switch]$Uninstall
)

$TaskName = 'EcodiaCodebaseWatcher'
$RepoDir  = 'D:\.code\EcodiaOS\backend\codebase-manifest'
$Daemon   = Join-Path $RepoDir 'watcher-daemon.js'

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed task $TaskName"
  } else {
    Write-Output "Task $TaskName not found"
  }
  return
}

# Resolve node.exe path explicitly so the task does not depend on PATH
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Error "node.exe not on PATH; install Node 22+ first."
  exit 1
}
if (-not (Test-Path $Daemon)) {
  Write-Error "Daemon script not found at $Daemon"
  exit 1
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Daemon`"" -WorkingDirectory $RepoDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -RestartCount 999

# If the task already exists, remove it first (idempotent reinstall)
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Continuous codebase awareness watcher daemon (D:/.code SQLite index)" `
  -RunLevel Limited `
  -User $env:USERNAME `
  | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Output "Installed and started Scheduled Task $TaskName"
Write-Output "Logs: $RepoDir\watcher.log"
Write-Output "PID:  $RepoDir\watcher.pid"