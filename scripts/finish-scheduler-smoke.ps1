$ErrorActionPreference='Stop'
$taskRunId=[Guid]::NewGuid().ToString('N')
$taskName='FINNTECH Synthetic Acceptance '+$taskRunId
$taskRoot=Join-Path (Split-Path -Parent $PSScriptRoot) '.finish-real-20261008.local'
$taskProbe=Join-Path $taskRoot ('scheduler-probe-'+$taskRunId+'.ps1')
$taskMarker=Join-Path $taskRoot ('scheduler-fired-'+$taskRunId+'.txt')
$taskEvidence=Join-Path $taskRoot 'scheduler-result.json'
$taskRegistered=$false
$taskMutex=$null
$taskStage='prepare'
try {
    if(-not(Test-Path -LiteralPath $taskRoot)){throw 'ISOLATED_TEST_DIRECTORY_REQUIRED'}
    [IO.File]::WriteAllText($taskProbe, "[IO.File]::WriteAllText('$($taskMarker.Replace("'","''"))','SYNTHETIC_ONLY')")
    $taskSettings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 1 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
    $taskAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$taskProbe`""
    $taskTrigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15)
    $taskPrincipal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $taskStage='register'
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal | Out-Null
    $taskRegistered=$true
    $taskStage='trigger'
    $taskDeadline=(Get-Date).AddSeconds(55)
    while(-not(Test-Path -LiteralPath $taskMarker) -and (Get-Date) -lt $taskDeadline){Start-Sleep -Milliseconds 500}
    if(-not(Test-Path -LiteralPath $taskMarker)){throw 'TRIGGER_NOT_OBSERVED'}
    $taskObserved=Get-ScheduledTask -TaskName $taskName
    if(-not $taskObserved.Settings.StartWhenAvailable -or $taskObserved.Settings.MultipleInstances -ne 2){throw 'SETTINGS_NOT_CONFIRMED'}
    $taskMutex=[Threading.Mutex]::new($true,'Global\FINNTECH_Backup_v1')
    $taskWrapper=Join-Path $PSScriptRoot 'real-backup-scheduled.ps1'
    $taskOutput=& powershell.exe -NoProfile -NonInteractive -File $taskWrapper -PrivateEnvFile (Join-Path $taskRoot 'does-not-exist.env')
    if($LASTEXITCODE -ne 0 -or $taskOutput -notcontains 'BACKUP_ALREADY_RUNNING'){throw 'OVERLAP_GUARD_FAILED'}
    [IO.File]::WriteAllText($taskEvidence,'{"status":"PASS","syntheticOnly":true,"scheduledTrigger":true,"overlapMutex":true,"startWhenAvailable":true,"actualBackupSchedule":"NOT_ACTIVATED","actualGmailAlert":"NOT_TESTED"}')
    Write-Output 'PASS: synthetic scheduled trigger and cross-process overlap mutex; no backup activated'
}catch{
    $taskCode=$null
    if($taskRegistered){$taskCode=(Get-ScheduledTaskInfo -TaskName $taskName).LastTaskResult}
    Write-Output ("FAIL: synthetic scheduler stage="+$taskStage+" taskResult="+$taskCode+"; private details withheld")
    exit 1
}
finally{
    if($null -ne $taskMutex){$taskMutex.ReleaseMutex();$taskMutex.Dispose()}
    if($taskRegistered){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
}
