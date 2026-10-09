#requires -Version 7.4
param(
  [switch]$ConfirmSynthetic,
  [switch]$WritersStopped
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPrivateDir = $null
$taskSource = $null
$taskTargetStarted = $false
$taskTarget = $null
$taskTargetVerified = $false
$taskSuccess = $false
$taskCleanupOk = $true
$taskId = [Guid]::NewGuid().ToString('N')
$taskContainerDump = "/tmp/finntech-recovery-$taskId.dump"
$taskContainerSql = "/tmp/finntech-recovery-$taskId.sql"
$taskPlainPath = $null
$taskRestorePath = $null
$taskOldLocation = Get-Location

function Invoke-TaskDocker {
  param([string[]]$Arguments, [string]$Operation)
  $taskOutput = & docker @Arguments 2>&1
  $taskCode = $LASTEXITCODE
  if ($taskCode -ne 0) {
    # Native errors can contain copied rows or credentials. Never forward them.
    throw "$Operation failed (exit $taskCode); details withheld"
  }
  return (($taskOutput | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Write-TaskNewBytes {
  param([string]$Path, [byte[]]$Bytes)
  $taskStream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $taskStream.Write($Bytes, 0, $Bytes.Length) } finally { $taskStream.Dispose() }
}

function Protect-TaskDirectory {
  param([string]$Path)
  $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls $Path /inheritance:r /grant:r "*${taskSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Private directory ACL failed' }
}

function Read-TaskIdentity {
  param([string]$Container)
  $taskFormat = '{{json .Config.Labels}}'
  $taskLabels = (Invoke-TaskDocker @('inspect', '--format', $taskFormat, $Container) 'Container labels') | ConvertFrom-Json
  return $taskLabels
}

function Read-TaskSql {
  param([string]$Container, [string]$Database, [string]$Role, [string]$Sql)
  return Invoke-TaskDocker @('exec', $Container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', $Role, '-d', $Database, '-c', $Sql) 'Read-only PostgreSQL query'
}

function Read-TaskEvidence {
  param([string]$Container, [string]$Database, [string]$Role)
  $taskEvidence = Invoke-TaskDocker @('exec', $Container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', $Role, '-d', $Database, '-f', $taskContainerSql) 'Aggregate PostgreSQL evidence'
  if (-not $taskEvidence.Contains('TABLE:public._prisma_migrations|')) { throw 'Migration evidence missing' }
  if (-not $taskEvidence.Contains('TABLE:public.auth_users|')) { throw 'Auth evidence missing' }
  if (-not $taskEvidence.Contains('NUMERIC:finance_transactions.amount|20|2')) { throw 'THB NUMERIC evidence missing' }
  if (-not $taskEvidence.Contains('NUMERIC:crypto_trades.quantity|38|18')) { throw 'Crypto NUMERIC evidence missing' }
  return $taskEvidence
}

try {
  if (-not $ConfirmSynthetic -or -not $WritersStopped) { throw 'Require -ConfirmSynthetic and -WritersStopped; stop only the tracker runner first' }
  if ($env:OS -ne 'Windows_NT') { throw 'Windows DPAPI rehearsal only' }
  Set-Location -LiteralPath $taskRoot
  Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
  $taskEngine = Invoke-TaskDocker @('version', '--format', '{{.Server.Version}}') 'Docker engine'
  if (-not $taskEngine) { throw 'Docker engine unavailable' }
  $taskSource = Invoke-TaskDocker @('compose', '--project-name', 'finntech-auth-local', '--env-file', '.env.auth.local', '-f', 'compose.auth.local.yaml', 'ps', '-q', 'postgres-auth-local') 'Synthetic source lookup'
  if ($taskSource -notmatch '^[0-9a-f]{12,64}$') { throw 'Expected exactly one existing synthetic source container' }
  $taskLabels = Read-TaskIdentity $taskSource
  if ($taskLabels.'com.docker.compose.project' -ne 'finntech-auth-local' -or $taskLabels.'com.docker.compose.service' -ne 'postgres-auth-local') { throw 'Wrong source container' }
  $taskPorts = (Invoke-TaskDocker @('inspect', '--format', '{{json .NetworkSettings.Ports}}', $taskSource) 'Source port guard') | ConvertFrom-Json
  $taskSourcePorts = @($taskPorts.'5432/tcp')
  if ($taskSourcePorts.Count -ne 1 -or $taskSourcePorts[0].HostIp -ne '127.0.0.1' -or $taskSourcePorts[0].HostPort -ne '5436') { throw 'Wrong source port boundary' }
  if ((Read-TaskSql $taskSource 'finntech_auth_local' 'ui_fixture' "SELECT current_database() || '|' || current_user") -ne 'finntech_auth_local|ui_fixture') { throw 'Wrong source database/role' }
  if ((Read-TaskSql $taskSource 'finntech_auth_local' 'ui_fixture' "SELECT count(*)::text FROM auth_users WHERE email NOT LIKE '%@example.invalid'") -ne '0') { throw 'Source has non-fixture accounts; refusing backup rehearsal' }
  $taskVersion = Read-TaskSql $taskSource 'finntech_auth_local' 'ui_fixture' 'SHOW server_version'
  if ($taskVersion -notmatch '^16\.') { throw 'Expected PostgreSQL 16 source' }
  $taskImage = Invoke-TaskDocker @('inspect', '--format', '{{.Image}}', $taskSource) 'Source image'
  $taskPrivateDir = Join-Path $taskRoot "backups.private.local\$taskId"
  if (Test-Path -LiteralPath $taskPrivateDir) { throw 'Private backup path already exists' }
  New-Item -ItemType Directory -Path $taskPrivateDir | Out-Null
  Protect-TaskDirectory $taskPrivateDir

  # Generate only a new synthetic test credential; never overwrite an existing env.
  $taskTestEnv = Join-Path $taskRoot '.env.backup.test'
  if (-not (Test-Path -LiteralPath $taskTestEnv)) {
    $taskPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $taskEnvBytes = [Text.Encoding]::UTF8.GetBytes("TRACKER_BACKUP_TEST_DB_PASSWORD=$taskPassword`n")
    try { Write-TaskNewBytes $taskTestEnv $taskEnvBytes } finally { [Array]::Clear($taskEnvBytes, 0, $taskEnvBytes.Length); $taskPassword = $null }
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $taskTestEnv /inheritance:r /grant:r "*${taskSid}:F" '*S-1-5-18:F' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'New synthetic env ACL failed' }
  }
  if ([IO.File]::ReadAllText($taskTestEnv).Contains('<SYNTHETIC_RECOVERY_PASSWORD>')) { throw 'Replace the synthetic test placeholder locally' }
  $taskCompose = @('compose', '--project-name', 'finntech-backup-rehearsal', '--env-file', '.env.backup.test', '-f', 'compose.backup.test.yaml')
  $null = Invoke-TaskDocker ($taskCompose + @('config', '--quiet')) 'Recovery Compose config'
  $taskConfig = (Invoke-TaskDocker ($taskCompose + @('config', '--format', 'json')) 'Recovery target config guard') | ConvertFrom-Json
  $taskService = $taskConfig.services.'postgres-recovery'
  if (@($taskConfig.services.PSObject.Properties).Count -ne 1 -or $taskService.network_mode -ne 'none' -or $taskService.PSObject.Properties['ports'] -or $taskService.image -ne 'postgres:16-alpine' -or $taskService.pull_policy -ne 'never') { throw 'Recovery configuration isolation mismatch' }
  if ($taskService.environment.POSTGRES_DB -ne 'finntech_restore_test' -or $taskService.environment.POSTGRES_USER -ne 'restore_fixture') { throw 'Recovery configuration database/role mismatch' }
  $taskSourceMounts = (Invoke-TaskDocker @('inspect', '--format', '{{json .Mounts}}', $taskSource) 'Source volume guard') | ConvertFrom-Json
  $taskSourceVolumeNames = @($taskSourceMounts | Where-Object { $_.Type -eq 'volume' } | ForEach-Object { $_.Name })
  $taskVolumes = @($taskConfig.volumes.PSObject.Properties)
  if ($taskVolumes.Count -ne 1 -or $taskVolumes[0].Value.name -ne 'finntech-backup-rehearsal_finntech_backup_rehearsal_pgdata' -or $taskSourceVolumeNames -contains $taskVolumes[0].Value.name) { throw 'Recovery volume must be separate from source' }
  if ($taskVolumes[0].Value.PSObject.Properties['external'] -and $taskVolumes[0].Value.external) { throw 'External recovery volume unsupported' }
  if (@($taskService.volumes).Count -ne 1 -or $taskService.volumes[0].type -ne 'volume' -or $taskService.volumes[0].source -ne 'finntech_backup_rehearsal_pgdata' -or $taskService.volumes[0].target -ne '/var/lib/postgresql/data') { throw 'Unexpected recovery mount' }
  $taskTargetStarted = $true
  $null = Invoke-TaskDocker ($taskCompose + @('up', '-d', '--wait', '--wait-timeout', '60', '--pull', 'never')) 'Recovery container startup'
  $taskTarget = Invoke-TaskDocker ($taskCompose + @('ps', '-q', 'postgres-recovery')) 'Recovery target lookup'
  if ($taskTarget -notmatch '^[0-9a-f]{12,64}$' -or $taskTarget -eq $taskSource) { throw 'Invalid recovery target' }
  $taskLabels = Read-TaskIdentity $taskTarget
  if ($taskLabels.'com.docker.compose.project' -ne 'finntech-backup-rehearsal' -or $taskLabels.'com.docker.compose.service' -ne 'postgres-recovery') { throw 'Wrong recovery container' }
  $taskTargetVerified = $true
  if ((Invoke-TaskDocker @('inspect', '--format', '{{.HostConfig.NetworkMode}}', $taskTarget) 'Recovery network guard') -ne 'none') { throw 'Recovery container must have no network' }
  if ((Invoke-TaskDocker @('inspect', '--format', '{{.Image}}', $taskTarget) 'Recovery image guard') -ne $taskImage) { throw 'Source/recovery image mismatch; no automatic pull or update' }
  if ((Read-TaskSql $taskTarget 'finntech_restore_test' 'restore_fixture' "SELECT current_database() || '|' || current_user") -ne 'finntech_restore_test|restore_fixture') { throw 'Wrong recovery database/role' }
  $taskEmptySql = "SELECT ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d')))::text"
  if ((Read-TaskSql $taskTarget 'finntech_restore_test' 'restore_fixture' $taskEmptySql) -ne '0') { throw 'Recovery database is not empty; stop, no reset or clean' }

  $taskSqlFile = Join-Path $taskRoot 'scripts\sql\tracker-db-recovery-evidence.sql'
  $null = Invoke-TaskDocker @('cp', $taskSqlFile, "${taskSource}:$taskContainerSql") 'Source evidence script copy'
  $taskBefore = Read-TaskEvidence $taskSource 'finntech_auth_local' 'ui_fixture'
  $null = Invoke-TaskDocker @('exec', $taskSource, 'pg_dump', '-U', 'ui_fixture', '-d', 'finntech_auth_local', '--format=custom', '--no-acl', "--file=$taskContainerDump") 'PostgreSQL custom dump'
  $taskPlainPath = Join-Path $taskPrivateDir 'source.dump'
  $null = Invoke-TaskDocker @('cp', "${taskSource}:$taskContainerDump", $taskPlainPath) 'Binary dump copy'
  $taskBytes = [IO.File]::ReadAllBytes($taskPlainPath)
  try {
    $taskCipher = [Security.Cryptography.ProtectedData]::Protect($taskBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $taskEncryptedPath = Join-Path $taskPrivateDir 'database.dump.dpapi'
    Write-TaskNewBytes $taskEncryptedPath $taskCipher
    $taskRestoredBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($taskEncryptedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    try {
      if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($taskBytes)) -ne [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($taskRestoredBytes))) { throw 'Encrypted archive round-trip mismatch' }
      $taskRestorePath = Join-Path $taskPrivateDir 'restore.dump'
      Write-TaskNewBytes $taskRestorePath $taskRestoredBytes
    } finally { [Array]::Clear($taskRestoredBytes, 0, $taskRestoredBytes.Length) }
  } finally { [Array]::Clear($taskBytes, 0, $taskBytes.Length) }
  $null = Invoke-TaskDocker @('cp', $taskRestorePath, "${taskTarget}:$taskContainerDump") 'Recovery archive copy'
  $null = Invoke-TaskDocker @('cp', $taskSqlFile, "${taskTarget}:$taskContainerSql") 'Recovery evidence script copy'
  # Deliberately no --clean/--create: destination must already be empty and isolated.
  $null = Invoke-TaskDocker @('exec', $taskTarget, 'pg_restore', '-U', 'restore_fixture', '-d', 'finntech_restore_test', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', $taskContainerDump) 'PostgreSQL isolated restore'
  $taskRestored = Read-TaskEvidence $taskTarget 'finntech_restore_test' 'restore_fixture'
  $taskAfter = Read-TaskEvidence $taskSource 'finntech_auth_local' 'ui_fixture'
  if ($taskBefore -cne $taskAfter) { throw 'Source changed during rehearsal; cannot certify before/after equivalence' }
  if ($taskBefore -cne $taskRestored) { throw 'Restored counts/values/schema evidence mismatch' }
  if ((Read-TaskSql $taskTarget 'finntech_restore_test' 'restore_fixture' $taskEmptySql) -eq '0') { throw 'Recovery unexpectedly stayed empty' }
  foreach ($taskPair in @(@('source-before', $taskBefore), @('source-after', $taskAfter), @('restored', $taskRestored))) {
    [IO.File]::WriteAllText((Join-Path $taskPrivateDir ($taskPair[0] + '.evidence.txt')), $taskPair[1])
  }
  $taskResult = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); docker=$taskEngine; postgresql=$taskVersion; sourceUnchanged=$true; restoredEvidenceMatches=$true; encryptedRoundTrip=$true; targetNetwork='none'; volumePreserved=$true; encryption='Windows DPAPI CurrentUser; same-user same-machine rehearsal'; archiveSha256=(Get-FileHash -LiteralPath $taskEncryptedPath -Algorithm SHA256).Hash }
  [IO.File]::WriteAllText((Join-Path $taskPrivateDir 'result.json'), ($taskResult | ConvertTo-Json))
  $taskSuccess = $true
} catch {
  # Our own guards have fixed messages; unexpected native/crypto failures are class-only.
  if ($_.Exception.GetType() -eq [Management.Automation.RuntimeException]) { Write-Host ("STOP: " + $_.Exception.Message) }
  else { Write-Host ("STOP: " + $_.Exception.GetType().Name + '; details withheld') }
} finally {
  foreach ($taskTemp in @($taskPlainPath, $taskRestorePath)) {
    if ($taskTemp -and (Test-Path -LiteralPath $taskTemp)) {
      if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($taskTemp)) -ne $taskPrivateDir) { $taskCleanupOk = $false; continue }
      try { Remove-Item -LiteralPath $taskTemp -Force } catch { $taskCleanupOk = $false }
    }
  }
  if ($taskSource -and $taskPrivateDir) {
    try { $null = Invoke-TaskDocker @('exec', $taskSource, 'rm', '-f', $taskContainerDump, $taskContainerSql) 'Own source temporary file cleanup' } catch { $taskCleanupOk = $false }
  }
  if ($taskTargetStarted) {
    if ($taskTargetVerified) {
      try { $null = Invoke-TaskDocker @('exec', $taskTarget, 'rm', '-f', $taskContainerDump, $taskContainerSql) 'Own recovery temporary file cleanup' } catch { $taskCleanupOk = $false }
    }
    try {
      $null = Invoke-TaskDocker (@('compose', '--project-name', 'finntech-backup-rehearsal', '--env-file', '.env.backup.test', '-f', 'compose.backup.test.yaml', 'stop', 'postgres-recovery')) 'Own recovery container stop'
    } catch { $taskCleanupOk = $false }
  }
  Set-Location -LiteralPath $taskOldLocation
}
if ($taskSuccess -and $taskCleanupOk) {
  Write-Host 'PASS: encrypted backup/isolated restore and aggregate evidence match; source unchanged; recovery stopped, volume kept'
  Write-Host ("Private evidence directory: " + $taskPrivateDir)
  exit 0
}
Write-Host 'NOT COMPLETE: no PostgreSQL recovery PASS; inspect guard/cleanup status without sharing private archives'
exit 1
