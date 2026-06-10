$p = Get-CimInstance Win32_Process -Filter "ProcessId=33036"
if ($null -eq $p) { Write-Output "PID 33036 GONE"; exit 0 }
[PSCustomObject]@{
  Pid    = $p.ProcessId
  Parent = $p.ParentProcessId
  Cmd    = $p.CommandLine
  Started = $p.CreationDate
} | Format-List | Out-String -Width 400
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"
if ($parent) {
  Write-Output "PARENT:"
  [PSCustomObject]@{
    Pid  = $parent.ProcessId
    Name = $parent.Name
    Cmd  = $parent.CommandLine
  } | Format-List | Out-String -Width 400
}
