# conductor-pacemaker.ps1
#
# Fires an idle_check message into chat.conductor.inbox on a cadence so the
# conductor has a self-prompting heartbeat even when no worker / SMS / email
# wake substrate fires. Day window (08:00-22:00 AEST) = every 30 min. Night
# window (22:00-08:00 AEST) = every 6 hours (idempotency suppresses extra
# fires when Task Scheduler runs us every 30 min around the clock).
#
# Doctrine: D:/.code/EcodiaOS/backend/patterns/conductor-needs-pacemaker-not-just-reactive-wake-2026-05-18.md
#
# To install (run from PowerShell as your user; admin not required because
# the task runs under the interactive user account, not SYSTEM):
#   schtasks /Create /XML D:\.code\EcodiaOS\backend\scripts\conductor-pacemaker.task.xml /TN "EcodiaOS Conductor Pacemaker" /F
#
# To verify install:
#   schtasks /Query /TN "EcodiaOS Conductor Pacemaker" /V /FO LIST
#
# To uninstall:
#   schtasks /Delete /TN "EcodiaOS Conductor Pacemaker" /F
#
# Manual fire test (from any shell on Corazon):
#   pwsh -NoProfile -ExecutionPolicy Bypass -File D:\.code\EcodiaOS\backend\scripts\conductor-pacemaker.ps1
#
# Idempotency: the script writes its last-fire ISO-UTC timestamp to
# D:/.code/EcodiaOS/coordination/state/pacemaker_last_fire.txt and refuses to
# fire again within 25 min (day) or 5h 30min (night). This is what lets us
# schedule a single every-30-min Task Scheduler entry while still respecting
# the asymmetric day/night cadence.

[CmdletBinding()]
param(
    [string]$AgentBase = "http://localhost:7456",
    [string]$TokenFile = "$env:USERPROFILE\.ecodiaos\laptop-agent.token",
    [switch]$Force
)

$ErrorActionPreference = 'Continue'  # we never want this script to throw

$StateDir = "D:\.code\EcodiaOS\coordination\state"
$LastFireFile = Join-Path $StateDir "pacemaker_last_fire.txt"
$ObserverSignalsFile = "C:\Users\tjdTa\.claude\hooks\ecodia\state\observer_signals_local.jsonl"

# ----- helpers ----------------------------------------------------------

function Get-AestNow {
    # AEST = UTC+10, no DST.
    $utc = [DateTime]::UtcNow
    return $utc.AddHours(10)
}

function Get-WindowName([DateTime]$aestNow) {
    $h = $aestNow.Hour
    if ($h -ge 8 -and $h -lt 22) { return 'day' } else { return 'night' }
}

function Get-MinIntervalMinutes([string]$window) {
    if ($window -eq 'day') { return 25 }  # 30-min cadence with 5-min slack
    return 330                            # 6h cadence with 30-min slack
}

function Read-LastFire {
    if (-not (Test-Path $LastFireFile)) { return $null }
    try {
        $raw = (Get-Content $LastFireFile -Raw -ErrorAction Stop).Trim()
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return [DateTime]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
    } catch {
        return $null
    }
}

function Write-LastFire([DateTime]$utcNow) {
    if (-not (Test-Path $StateDir)) {
        New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    }
    $iso = $utcNow.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
    Set-Content -Path $LastFireFile -Value $iso -Encoding UTF8 -NoNewline
}

function Read-AgentToken {
    if (-not (Test-Path $TokenFile)) { return '' }
    try {
        $tok = (Get-Content $TokenFile -Raw -ErrorAction Stop).Trim()
        return $tok
    } catch {
        return ''
    }
}

function Count-StaleObserverSignals {
    # Count lines in the local JSONL file. Each line = one unacked observer
    # signal (the hook only writes; ack lives elsewhere). 'unknown' if file
    # missing or unreadable.
    if (-not (Test-Path $ObserverSignalsFile)) { return 'unknown' }
    try {
        $lines = Get-Content $ObserverSignalsFile -ErrorAction Stop |
                 Where-Object { $_ -and $_.Trim().Length -gt 0 }
        return @($lines).Count
    } catch {
        return 'unknown'
    }
}

function Send-CoordMessage([string]$base, [string]$token, [hashtable]$payloadBody, [string]$topic) {
    # POST a JSON-RPC envelope to /api/mcp/coord invoking coord.send_message.
    $rpcBody = @{
        jsonrpc = '2.0'
        id      = [int]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() % 2147483647)
        method  = 'tools/call'
        params  = @{
            name      = 'coord.send_message'
            arguments = @{
                to   = $topic
                body = $payloadBody
            }
        }
    }
    $json = $rpcBody | ConvertTo-Json -Depth 12 -Compress
    $headers = @{ 'Content-Type' = 'application/json'; 'Accept' = 'application/json' }
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    try {
        $resp = Invoke-RestMethod -Uri "$base/api/mcp/coord" -Method Post -Headers $headers -Body $json -TimeoutSec 10 -ErrorAction Stop
        return @{ ok = $true; resp = $resp }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

# ----- main -------------------------------------------------------------

$aestNow  = Get-AestNow
$utcNow   = [DateTime]::UtcNow
$window   = Get-WindowName -aestNow $aestNow
$minMin   = Get-MinIntervalMinutes -window $window
$lastFire = Read-LastFire

if (-not $Force -and $lastFire) {
    $sinceMin = ($utcNow - $lastFire).TotalMinutes
    if ($sinceMin -lt $minMin) {
        Write-Output ("[pacemaker] skip (window={0}, last_fire={1:yyyy-MM-ddTHH:mm:ssZ}, since={2:F1}min, min={3}min)" -f $window, $lastFire, $sinceMin, $minMin)
        exit 0
    }
}

$staleSignals = Count-StaleObserverSignals
$token        = Read-AgentToken

$payload = @{
    type                  = 'idle_check'
    when                  = $utcNow.ToString("o", [System.Globalization.CultureInfo]::InvariantCulture)
    window                = $window
    overdue_rows_count    = 'check_status_board'
    stale_signals_count   = $staleSignals
    message               = 'Pacemaker fired - check status_board overdue + observer signals + idle-work menu (drift-audit / pattern-tuning / neo4j-mining).'
    source                = 'conductor-pacemaker.ps1'
    aest_now              = $aestNow.ToString("yyyy-MM-ddTHH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
}

$result = Send-CoordMessage -base $AgentBase -token $token -payloadBody $payload -topic 'chat.conductor.inbox'

if ($result.ok) {
    Write-LastFire -utcNow $utcNow
    Write-Output ("[pacemaker] fire ok (window={0}, stale_signals={1})" -f $window, $staleSignals)
    exit 0
} else {
    Write-Output ("[pacemaker] fire failed (window={0}): {1}" -f $window, $result.error)
    # Do not write last-fire on failure; next scheduled run will retry.
    exit 1
}
