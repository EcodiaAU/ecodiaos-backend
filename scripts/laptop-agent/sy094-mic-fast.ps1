param(
  [Parameter(Mandatory)] [string] $Username,
  [Parameter(Mandatory)] [string] $Password
)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

# SendInput primitive for pixel mouse clicks (works regardless of focus / over fullscreen RDP)
$signature = @'
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
[StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
[StructLayout(LayoutKind.Explicit)] public struct INPUT { [FieldOffset(0)] public int type; [FieldOffset(4)] public MOUSEINPUT mi; }
[DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int idx);
'@
Add-Type -MemberDefinition $signature -Name MIC -Namespace W -PassThru | Out-Null

function PixelClick([int]$x, [int]$y) {
  [W.MIC]::SetCursorPos($x, $y) | Out-Null
  $vw = [W.MIC]::GetSystemMetrics(0)
  $vh = [W.MIC]::GetSystemMetrics(1)
  $nx = [int](($x * 65535) / $vw)
  $ny = [int](($y * 65535) / $vh)
  $down = New-Object W.MIC+INPUT
  $down.type = 0
  $down.mi.dx = $nx; $down.mi.dy = $ny
  $down.mi.dwFlags = 0x8000 -bor 0x0002 -bor 0x0001  # ABSOLUTE | LEFTDOWN | MOVE
  $up = New-Object W.MIC+INPUT
  $up.type = 0
  $up.mi.dx = $nx; $up.mi.dy = $ny
  $up.mi.dwFlags = 0x8000 -bor 0x0004  # ABSOLUTE | LEFTUP
  [W.MIC]::SendInput(2, @($down, $up), [System.Runtime.InteropServices.Marshal]::SizeOf([type][W.MIC+INPUT])) | Out-Null
}

function FindWindowByName([string]$name, [int]$timeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  while ([DateTime]::UtcNow -lt $deadline) {
    $w = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if ($w) { return $w }
    Start-Sleep -Milliseconds 100
  }
  return $null
}

function WaitWindowGone([string]$name, [int]$timeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  while ([DateTime]::UtcNow -lt $deadline) {
    $w = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    if (-not $w) { return $true }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

function FindRdpContainer([int]$timeoutMs) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cw = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  while ([DateTime]::UtcNow -lt $deadline) {
    $c = $cw.GetFirstChild($root)
    while ($c) {
      try {
        if ($c.Current.ClassName -eq "TscShellContainerClass") { return $c }
      } catch {}
      $c = $cw.GetNextSibling($c)
    }
    Start-Sleep -Milliseconds 100
  }
  return $null
}

$t0 = [DateTime]::UtcNow

# Phase 1: launch
Start-Process ([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'MacinCloud_Full_Screen.rdp'))
$tLaunched = [DateTime]::UtcNow

# Phase 2: probe for security warning dialog
$dlg = FindWindowByName "Remote Desktop Connection security warning" 8000
if (-not $dlg) { Write-Output "FAIL: warning dialog did not appear within 8s"; exit 1 }
$tDlg = [DateTime]::UtcNow

# Phase 3: pixel-click checkboxes (XAML, UIA-invisible)
PixelClick 683 347
Start-Sleep -Milliseconds 50
PixelClick 683 367
Start-Sleep -Milliseconds 50

# Phase 4: Connect button (real Button, use Invoke)
$connectCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Connect")
$connectBtn = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $connectCond)
if (-not $connectBtn) { Write-Output "FAIL: Connect button not found"; exit 1 }
try {
  $invoke = $connectBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
} catch {
  PixelClick 822 442  # fallback to pixel
}
$tConnect = [DateTime]::UtcNow

# Phase 5: probe for warning dialog gone (signals RDP started establishing)
$gone = WaitWindowGone "Remote Desktop Connection security warning" 8000
if (-not $gone) { Write-Output "FAIL: warning dialog stayed open after Connect"; exit 1 }
$tDlgGone = [DateTime]::UtcNow

# Phase 6: probe for RDP container (TscShellContainerClass)
$rdp = FindRdpContainer 10000
if (-not $rdp) { Write-Output "FAIL: RDP container did not appear within 10s"; exit 1 }
$tRdp = [DateTime]::UtcNow

# Phase 7: short fixed wait for macOS login screen render inside the container
# (Mac UI is not visible to Windows UIAutomation; smallest empirical floor)
Start-Sleep -Milliseconds 2500

# Phase 8: focus the Name field (pixel) + type creds via SendKeys
PixelClick 685 275
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait($Username + "{TAB}" + $Password + "{ENTER}")
$tCreds = [DateTime]::UtcNow

# Phase 9: probe for RDP container title change (post-auth Mac desktop)
# The container title changes / window keeps RAIL_WINDOW class. Use a short wait + final foreground check.
$deadline = [DateTime]::UtcNow.AddSeconds(10)
$reached = $false
while ([DateTime]::UtcNow -lt $deadline) {
  $cw = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $c = $cw.GetFirstChild([System.Windows.Automation.AutomationElement]::RootElement)
  while ($c) {
    try {
      if ($c.Current.ClassName -eq "TscShellContainerClass" -and $c.Current.HasKeyboardFocus) {
        $reached = $true; break
      }
    } catch {}
    $c = $cw.GetNextSibling($c)
  }
  if ($reached) { break }
  Start-Sleep -Milliseconds 200
}
$tDone = [DateTime]::UtcNow

# Output timing
$total = ($tDone - $t0).TotalMilliseconds
$f1 = ($tLaunched - $t0).TotalMilliseconds
$f2 = ($tDlg - $tLaunched).TotalMilliseconds
$f3 = ($tConnect - $tDlg).TotalMilliseconds
$f4 = ($tDlgGone - $tConnect).TotalMilliseconds
$f5 = ($tRdp - $tDlgGone).TotalMilliseconds
$f6 = ($tCreds - $tRdp).TotalMilliseconds
$f7 = ($tDone - $tCreds).TotalMilliseconds
Write-Output ("OK total_ms={0} launch_ms={1} dlg_ms={2} clicks+connect_ms={3} dlg_gone_ms={4} rdp_ms={5} creds_ms={6} mac_desktop_ms={7} reached_focus={8}" -f [int]$total, [int]$f1, [int]$f2, [int]$f3, [int]$f4, [int]$f5, [int]$f6, [int]$f7, $reached)
