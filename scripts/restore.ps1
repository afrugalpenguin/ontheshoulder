<#
.SYNOPSIS
  Restores an On the Shoulder backup.

.DESCRIPTION
  By default: stops the api task, moves the current database aside (it is kept,
  never deleted), copies the chosen backup into place and starts the api again.

  With -TargetPath the backup is copied to that path instead and nothing live is
  touched, which is how to check a backup opens before trusting it.

  Asks for confirmation unless -Force is given. Stops at the first error.

.PARAMETER BackupFile
  The backup to restore. Defaults to the newest file in <data dir>\backups.

.PARAMETER DataDir
  The data folder. Defaults to OTS_DATA_DIR, else the data_dir in the config
  file (OTS_CONFIG, else %LOCALAPPDATA%\ontheshoulder\config.json), else
  %LOCALAPPDATA%\ontheshoulder.

.PARAMETER TargetPath
  Where to write the restored database. Defaults to <data dir>\ots.db (live).

.EXAMPLE
  .\scripts\restore.ps1
  .\scripts\restore.ps1 -BackupFile "$env:LOCALAPPDATA\ontheshoulder\backups\ots-20310106-0200.db"
  .\scripts\restore.ps1 -TargetPath C:\Temp\ots-check\ots.db -Force
#>
[CmdletBinding()]
param(
  [string]$BackupFile,
  [string]$DataDir,
  [string]$TargetPath,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$TaskPath = '\OnTheShoulder\'
$TaskName = 'OnTheShoulder Api'

function Write-Step([string]$Message) { Write-Host "[restore] $Message" }

if (-not $DataDir) {
  # The same order the api uses: environment, then the config file, then the default.
  $configFile = if ($env:OTS_CONFIG) { $env:OTS_CONFIG } else { Join-Path $env:LOCALAPPDATA 'ontheshoulder\config.json' }
  if ($env:OTS_DATA_DIR) {
    $DataDir = $env:OTS_DATA_DIR
  } elseif (Test-Path -LiteralPath $configFile -PathType Leaf) {
    $DataDir = (Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json).data_dir
    if (-not $DataDir) { throw "No data_dir in $configFile. Pass -DataDir." }
    Write-Step "data folder from ${configFile}: $DataDir"
  } else {
    $DataDir = Join-Path $env:LOCALAPPDATA 'ontheshoulder'
  }
}
$liveDb = Join-Path $DataDir 'ots.db'

if (-not $BackupFile) {
  $newest = Get-ChildItem -Path (Join-Path $DataDir 'backups') -Filter 'ots-*.db' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  if (-not $newest) { throw "No backups found in $(Join-Path $DataDir 'backups')." }
  $BackupFile = $newest.FullName
}
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "Backup not found: $BackupFile" }

# A SQLite file starts with a fixed 16 byte header. Refuse anything else.
$stream = [System.IO.File]::OpenRead($BackupFile)
try {
  $header = New-Object byte[] 15
  [void]$stream.Read($header, 0, 15)
} finally {
  $stream.Dispose()
}
if ([System.Text.Encoding]::ASCII.GetString($header) -ne 'SQLite format 3') {
  throw "Not a SQLite database: $BackupFile"
}

if (-not $TargetPath) { $TargetPath = $liveDb }
$TargetPath = [System.IO.Path]::GetFullPath($TargetPath)
$isLive = $TargetPath -eq [System.IO.Path]::GetFullPath($liveDb)

Write-Step "backup: $BackupFile"
Write-Step "target: $TargetPath$(if ($isLive) { ' (the live database)' } else { ' (a copy; nothing live is touched)' })"

if (-not $Force) {
  $answer = Read-Host 'Type RESTORE to go ahead'
  if ($answer -cne 'RESTORE') {
    Write-Step 'cancelled; nothing was changed'
    exit 1
  }
}

$task = $null
if ($isLive) {
  $task = Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Running') {
    Write-Step 'stopping the api task'
    Stop-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName
    Start-Sleep -Seconds 2
  } elseif (-not $task) {
    Write-Step 'the api task is not registered; make sure the api is not running before continuing'
  }
}

$targetDir = Split-Path -Parent $TargetPath
if (-not (Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }

# Keep whatever is there now. The write-ahead files belong to the old database
# and must not be left beside the restored one.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($suffix in @('', '-wal', '-shm')) {
  $existing = "$TargetPath$suffix"
  if (Test-Path -LiteralPath $existing) {
    $aside = "$TargetPath.before-restore-$stamp$suffix"
    Move-Item -LiteralPath $existing -Destination $aside
    Write-Step "kept the previous file as $aside"
  }
}

Copy-Item -LiteralPath $BackupFile -Destination $TargetPath
Write-Step "restored $(Split-Path -Leaf $BackupFile) to $TargetPath"

if ($isLive -and $task) {
  Write-Step 'starting the api task'
  Start-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName
}
Write-Step 'done'
