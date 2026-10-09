param([Parameter(Mandatory=$true)][string]$PrivateEnvFile)
$ErrorActionPreference = 'Stop'
# Review-only operator wrapper. This file does not install a scheduled task.
# Run under the owner's account after ACL, Drive and full-restore acceptance.
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskChanged = @{}
$taskExit = 1
$taskMutex = $null
$taskHasMutex = $false
try {
    $taskMutex = [Threading.Mutex]::new($false, 'Global\FINNTECH_Backup_v1')
    try { $taskHasMutex = $taskMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $taskHasMutex = $true }
    if (-not $taskHasMutex) { Write-Output 'BACKUP_ALREADY_RUNNING'; exit 0 }
    $taskEnvPath = (Resolve-Path -LiteralPath $PrivateEnvFile).Path
    if ((Get-Item -LiteralPath $taskEnvPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PRIVATE_ENV_REQUIRED' }
    foreach ($taskLine in [IO.File]::ReadAllLines($taskEnvPath)) {
        if ($taskLine -match '^\s*(#|$)') { continue }
        if ($taskLine -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw 'PRIVATE_ENV_FORMAT_REJECTED' }
        $taskName = $Matches[1]; $taskValue = $Matches[2]
        if ($taskName -notmatch '^(FINNTECH_(BACKUP|DRIVE)_[A-Z0-9_]+|TRACKER_(REAL_DATABASE_(HOST|NAME|ROLE)|ORIGIN))$') { throw 'UNEXPECTED_ENV_NAME' }
        if ($taskChanged.ContainsKey($taskName)) { throw 'DUPLICATE_ENV_NAME' }
        $taskChanged[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
        [Environment]::SetEnvironmentVariable($taskName, $taskValue, 'Process')
    }
    if (-not $env:FINNTECH_BACKUP_LAST_RECEIPT_FILE -or -not $env:FINNTECH_DRIVE_RECEIPT_FILE_ID) { throw 'SCHEDULE_RECEIPT_REQUIRED' }
    Push-Location -LiteralPath $taskRepo
    try {
        $taskChanged['FINNTECH_BACKUP_MUTEX_HELD'] = [Environment]::GetEnvironmentVariable('FINNTECH_BACKUP_MUTEX_HELD', 'Process')
        $env:FINNTECH_BACKUP_MUTEX_HELD = 'true'
        & node --no-strip-types scripts/real-backup-runner.mjs
        if ($LASTEXITCODE -ne 0) { throw 'BACKUP_RUN_UNCONFIRMED' }
        $taskExit = 0
    } finally { Pop-Location }
} catch {
    # PowerShell's default exceptions can include connection strings; suppress them.
    Write-Output 'FAIL: scheduled backup unconfirmed; inspect private setup; existing data retained'
} finally {
    if ($taskHasMutex) { $taskMutex.ReleaseMutex() }
    if ($null -ne $taskMutex) { $taskMutex.Dispose() }
    foreach ($taskName in $taskChanged.Keys) { [Environment]::SetEnvironmentVariable($taskName, $taskChanged[$taskName], 'Process') }
}
exit $taskExit
