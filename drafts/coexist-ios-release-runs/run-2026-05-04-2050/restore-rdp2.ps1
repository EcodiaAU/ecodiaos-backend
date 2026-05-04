Add-Type -AssemblyName UIAutomationClient
$sig = @"
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
"@
Add-Type -MemberDefinition $sig -Name W -Namespace W2 -PassThru | Out-Null
$root=[System.Windows.Automation.AutomationElement]::RootElement
$cw=[System.Windows.Automation.TreeWalker]::ControlViewWalker
$c=$cw.GetFirstChild($root)
$h=[System.IntPtr]::Zero
while ($c) {
  if ($c.Current.ClassName -eq "TscShellContainerClass") {
    $h = [System.IntPtr]$c.Current.NativeWindowHandle
    break
  }
  $c=$cw.GetNextSibling($c)
}
Write-Output ("hwnd=" + $h)
if ($h -ne [System.IntPtr]::Zero) {
  $fg = [W2.W]::GetForegroundWindow()
  $fgPid = 0
  $fgTid = [W2.W]::GetWindowThreadProcessId($fg, [ref]$fgPid)
  $myTid = [W2.W]::GetCurrentThreadId()
  [W2.W]::AttachThreadInput($myTid, $fgTid, $true) | Out-Null
  [W2.W]::ShowWindow($h, 9) | Out-Null
  [W2.W]::BringWindowToTop($h) | Out-Null
  $r = [W2.W]::SetForegroundWindow($h)
  [W2.W]::AttachThreadInput($myTid, $fgTid, $false) | Out-Null
  Write-Output ("setfg=" + $r)
  Start-Sleep -Milliseconds 300
  $newFg = [W2.W]::GetForegroundWindow()
  Write-Output ("nowFg=" + $newFg + " same=" + ($newFg -eq $h))
}
