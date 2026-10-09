param([Parameter(Mandatory=$true)][string]$PrivateEnvFile, [switch]$Install)
$ErrorActionPreference='Stop'
try {
    $taskFile=(Resolve-Path -LiteralPath $PrivateEnvFile).Path
    $taskRepo=Split-Path -Parent $PSScriptRoot
    if ((Get-Item -LiteralPath $taskFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PRIVATE_FILE_REQUIRED' }
    if ($taskFile.Contains('"') -or $taskRepo.Contains('"')) { throw 'PATH_REJECTED' }
    Push-Location -LiteralPath $taskRepo
    try { & node --no-strip-types "--env-file=$taskFile" scripts/real-private-setup-check.mjs backup; if($LASTEXITCODE -ne 0){throw 'SETUP_NOT_READY'} } finally {Pop-Location}
    if(-not $Install){Write-Output 'VALIDATED: review daily 02:00 local schedule; install requires -Install';exit 0}
    $taskName='FINNTECH Encrypted Backup'
    if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'EXISTING_TASK_NOT_REPLACED'}
    $taskAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$PSScriptRoot\real-backup-scheduled.ps1`" -PrivateEnvFile `"$taskFile`"" -WorkingDirectory $taskRepo
    $taskTrigger=New-ScheduledTaskTrigger -Daily -At '02:00'
    $taskSettings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 1 -RestartInterval (New-TimeSpan -Minutes 15) -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    # Interactive token: no password stored; missed runs are caught by independent watchdog.
    $taskPrincipal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal | Out-Null
    Write-Output 'INSTALLED: runs when owner signed in; sleeping/offline/logged-out periods require independent alerts'
} catch {Write-Output 'FAIL: setup/schedule not confirmed; existing tasks preserved; private details withheld';exit 1}
