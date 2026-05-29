$ErrorActionPreference = "Stop"

$src = "D:\.code\EcodiaOS\backend\cursor-preview-extension"
$dirs = @(
  "$env:USERPROFILE\.cursor\extensions",
  "$env:USERPROFILE\.vscode\extensions",
  "$env:USERPROFILE\.vscode-insiders\extensions"
)

foreach ($extDir in $dirs) {
  if (-not (Test-Path $extDir)) {
    Write-Host "skip (no $extDir)"
    continue
  }
  $target = Join-Path $extDir "ecodia.preview-0.1.0"
  if (Test-Path $target) {
    # Remove existing junction/dir cleanly
    cmd /c "rmdir /S /Q `"$target`"" | Out-Null
  }
  # Directory junction - no admin / dev-mode required
  cmd /c "mklink /J `"$target`" `"$src`"" | Out-Null
  Write-Host "linked $target -> $src"
}

Write-Host ""
Write-Host "Now reload each IDE window: Ctrl+Shift+P -> 'Developer: Reload Window'"
