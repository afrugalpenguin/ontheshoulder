<#
.SYNOPSIS
  Registers the On the Shoulder scheduled tasks for the current Windows user.

.DESCRIPTION
  - "OnTheShoulder Api": starts the api (which also serves the web app) at logon,
    restarting after one minute if it fails.
  - "OnTheShoulder Vacuum": weekly database vacuum, Sunday 03:30.
  - "OnTheShoulder Garmin Sync": the optional sidecar at 06:00 and 21:00. Only
    registered with -IncludeGarmin, and only if the sidecar is installed.

  Safe to run again: existing tasks are replaced. Run `pnpm install` and
  `pnpm build` first. Use -WhatIf to see what would be registered.

.EXAMPLE
  .\scripts\install-tasks.ps1
  .\scripts\install-tasks.ps1 -WhatIf
  .\scripts\install-tasks.ps1 -IncludeGarmin
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [switch]$IncludeGarmin,
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$TaskPath = '\OnTheShoulder\'
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Write-Step([string]$Message) { Write-Host "[install-tasks] $Message" }

$apiDir = Join-Path $RepoRoot 'apps\api'
$server = Join-Path $apiDir 'dist\server.js'
if (-not (Test-Path $server)) {
  throw "Not built: $server is missing. Run 'pnpm install' and 'pnpm build' in $RepoRoot first."
}
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node was not found on the path. Install Node 22 or newer.' }
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { throw "pnpm was not found on the path. Run 'corepack enable' once, then try again." }

$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited

function Register-OtsTask {
  param([string]$Name, [string]$Description, $Action, $Trigger, $Settings)
  if ($PSCmdlet.ShouldProcess("$TaskPath$Name", 'Register scheduled task')) {
    Register-ScheduledTask -TaskPath $TaskPath -TaskName $Name -Description $Description `
      -Action $Action -Trigger $Trigger -Settings $Settings -Principal $principal -Force | Out-Null
    Write-Step "registered '$Name'"
  } else {
    Write-Step "would register '$Name'"
  }
}

# 1. The api at logon. No time limit. The command runs the api in a loop, so it
# comes straight back after "Restart" in Settings (a clean exit) as well as
# after a crash; stopping the task ends the loop. If the loop itself dies, the
# task restarts after a minute.
$apiCommand = "Set-Location '$apiDir'; while (`$true) { & '$node' --env-file-if-exists=..\..\.env dist\server.js; Start-Sleep -Seconds 2 }"
$apiAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$apiCommand`"" `
  -WorkingDirectory $apiDir
$apiTrigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$apiSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew
Register-OtsTask -Name 'OnTheShoulder Api' `
  -Description 'On the Shoulder api and web app, started at logon.' `
  -Action $apiAction -Trigger $apiTrigger -Settings $apiSettings

# 2. Weekly vacuum.
$vacuumAction = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c `"$pnpm`" --filter @ots/api db:vacuum" -WorkingDirectory $RepoRoot
$vacuumTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:30'
$vacuumSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries
Register-OtsTask -Name 'OnTheShoulder Vacuum' `
  -Description 'Weekly vacuum of the On the Shoulder database.' `
  -Action $vacuumAction -Trigger $vacuumTrigger -Settings $vacuumSettings

# 3. Optional Garmin sync, twice a day.
if ($IncludeGarmin) {
  $garmin = Join-Path $RepoRoot 'services\garmin\.venv\Scripts\ots-garmin.exe'
  if (-not (Test-Path $garmin)) {
    throw "The Garmin sidecar is not installed ($garmin is missing). Leave out -IncludeGarmin, or install it first."
  }
  $garminAction = New-ScheduledTaskAction -Execute $garmin -Argument 'sync' `
    -WorkingDirectory (Join-Path $RepoRoot 'services\garmin')
  $garminTriggers = @(
    (New-ScheduledTaskTrigger -Daily -At '06:00'),
    (New-ScheduledTaskTrigger -Daily -At '21:00')
  )
  $garminSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries
  Register-OtsTask -Name 'OnTheShoulder Garmin Sync' `
    -Description 'Optional Garmin sync for On the Shoulder.' `
    -Action $garminAction -Trigger $garminTriggers -Settings $garminSettings
} else {
  Write-Step 'Garmin sync not requested (use -IncludeGarmin once the sidecar is set up)'
}

Write-Step "done. The api starts at your next logon; to start it now: Start-ScheduledTask -TaskPath '$TaskPath' -TaskName 'OnTheShoulder Api'"
