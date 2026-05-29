$ErrorActionPreference = "Continue"

# Supporting marketplace extensions that complete the preview substrate:
#   bierner.markdown-mermaid     - renders mermaid blocks inside markdown preview
#   ms-vscode.live-server        - HTML Live Preview with auto-reload on edit
#   tomoki1207.pdf               - in-IDE PDF viewer
$extensions = @(
  "bierner.markdown-mermaid",
  "ms-vscode.live-server",
  "tomoki1207.pdf"
)

$clis = @(
  @{ name="Cursor";              cmd="cursor" },
  @{ name="VS Code Stable";      cmd="code" },
  @{ name="VS Code Insiders";    cmd="code-insiders" }
)

foreach ($cli in $clis) {
  Write-Host ""
  Write-Host "=== $($cli.name) ($($cli.cmd)) ===" -ForegroundColor Cyan
  $resolved = Get-Command $cli.cmd -ErrorAction SilentlyContinue
  if (-not $resolved) {
    Write-Host "  skip (CLI not on PATH)"
    continue
  }
  foreach ($ext in $extensions) {
    Write-Host "  installing $ext ..."
    & $cli.cmd --install-extension $ext --force 2>&1 | ForEach-Object { Write-Host "    $_" }
  }
}

Write-Host ""
Write-Host "Now reload each IDE window: Ctrl+Shift+P -> 'Developer: Reload Window'"
