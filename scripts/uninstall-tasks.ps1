<#
.SYNOPSIS
  Removes the On the Shoulder scheduled tasks. Safe to run when some or all are
  already gone. Your data folder is not touched.

.EXAMPLE
  .\scripts\uninstall-tasks.ps1
  .\scripts\uninstall-tasks.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$TaskPath = '\OnTheShoulder\'
$Names = @('OnTheShoulder Api', 'OnTheShoulder Vacuum', 'OnTheShoulder Garmin Sync')

foreach ($name in $Names) {
  $task = Get-ScheduledTask -TaskPath $TaskPath -TaskName $name -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "[uninstall-tasks] '$name' is not registered"
    continue
  }
  if ($PSCmdlet.ShouldProcess("$TaskPath$name", 'Remove scheduled task')) {
    if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskPath $TaskPath -TaskName $name }
    Unregister-ScheduledTask -TaskPath $TaskPath -TaskName $name -Confirm:$false
    Write-Host "[uninstall-tasks] removed '$name'"
  } else {
    Write-Host "[uninstall-tasks] would remove '$name'"
  }
}
