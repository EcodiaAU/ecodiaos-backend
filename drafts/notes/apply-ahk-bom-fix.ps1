# apply-ahk-bom-fix.ps1
# Patches macro-recorder.ahk to emit manifest.json WITHOUT UTF-8 BOM.
# Run this on Corazon via: shell.shell with command "powershell -File D:\.code\apply-ahk-bom-fix.ps1"
# Or copy-paste into a shell.shell call.
#
# Fork: fork_mp1ooxg2_1a7436 authored 2026-05-11 (Corazon offline, patch staged on VPS)
# Status board: e2fea39a-63a6-42b7-a254-592f031891b4

$ahkPath = "D:\.code\eos-laptop-agent\macros\macro-recorder.ahk"

if (-not (Test-Path $ahkPath)) {
    Write-Error "File not found: $ahkPath"
    exit 1
}

# Read as raw string (PowerShell reads UTF-8 with or without BOM fine)
$original = Get-Content $ahkPath -Raw

# --- Replacement 1: FileAppend calls writing to manifest.json (no third arg -> add UTF-8-RAW)
# Matches: FileAppend(someVar, someManifestVar) with NO third argument
# AHK v2 style: FileAppend(content, path) -> FileAppend(content, path, "UTF-8-RAW")
# We target lines that contain "manifest" and "FileAppend" and don't already have UTF-8-RAW

$patched = $original

# Pattern: FileAppend(<expr>, <expr>) where the line contains "manifest" and no "UTF-8-RAW"
# Replace two-arg FileAppend calls on manifest lines
$patched = $patched -replace '(?i)(FileAppend\([^,]+,[^)]+?manifest[^,)]*)\)', '$1, "UTF-8-RAW")'

# Pattern: FileAppend, content, path (AHK v1 comma style) on manifest lines
$patched = $patched -replace '(?i)(FileAppend,\s*\S+\s*,\s*\S*manifest\S*)\s*$', '$1, UTF-8-RAW'

# --- Replacement 2: FileOpen calls writing manifest.json without encoding
# FileOpen(manifestPath, "w") -> FileOpen(manifestPath, "w", "UTF-8-RAW")
$patched = $patched -replace '(?i)(FileOpen\([^,]+manifest[^,]*,\s*"w"\))', 'FileOpen($1param, "w", "UTF-8-RAW")'
# More targeted:
$patched = $patched -replace '(?i)(FileOpen\(([^,]+manifest[^,]*),\s*"w"\))', 'FileOpen($2, "w", "UTF-8-RAW")'

if ($patched -eq $original) {
    Write-Host "WARNING: No changes made. The regex may not have matched. Inspect the file manually."
    Write-Host "Look for FileAppend or FileOpen calls near 'manifest' in:"
    Write-Host $ahkPath
    # Print the relevant lines for manual inspection
    $lines = $original -split "`n"
    $i = 0
    foreach ($line in $lines) {
        $i++
        if ($line -imatch 'manifest|FileAppend|FileOpen') {
            Write-Host "  Line $i: $line"
        }
    }
    exit 2
}

# Write back WITHOUT BOM (UTF8NoBOM available in PS 6+; use [System.IO.File]::WriteAllText for compatibility)
[System.IO.File]::WriteAllText($ahkPath, $patched, [System.Text.UTF8Encoding]::new($false))

Write-Host "Patch applied successfully to $ahkPath"
Write-Host "Verify: grep for UTF-8-RAW near manifest writes:"
$lines = $patched -split "`n"
$i = 0
foreach ($line in $lines) {
    $i++
    if ($line -imatch 'manifest|UTF-8-RAW') {
        Write-Host "  Line $i: $($line.TrimEnd())"
    }
}
Write-Host "Done. No pm2 restart needed (AHK files are invoked fresh per recording session)."
