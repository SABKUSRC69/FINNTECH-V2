#requires -Version 7.4
[CmdletBinding()]
param([switch]$ConfirmSynthetic, [Parameter(Mandatory)][string]$BackupId)

$syntheticConfirmed = $ConfirmSynthetic.IsPresent
. (Join-Path $PSScriptRoot 'tracker-db-backup.ps1')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root = Join-Path $project 'backups.private.local'
$private = $null; $plain = $null; $target = $null; $started = $false
$cleanupOk = $true; $success = $false; $stage = 'preflight'; $failure = $null
$runId = [Guid]::NewGuid().ToString('N')
$containerDump = "/tmp/finntech-archive-restore-$runId.dump"
$containerSql = "/tmp/finntech-archive-restore-$runId.sql"
$docker = $null; $source = $null; $sourceTemporary = $false
$targetTemporary = $false; $lock = $null; $report = $null
try {
  if (-not $syntheticConfirmed) { throw 'SYNTHETIC_CONFIRMATION_REQUIRED' }
  if ($BackupId -cnotmatch '^[a-f0-9]{32}$') { throw 'BACKUP_ID_REJECTED' }
  Assert-BackupPrivateRoot $project $root
  $directory = Join-Path $root $BackupId
  Assert-BackupPrivateRoot $project $root
  if ([IO.File]::GetAttributes($directory) -band [IO.FileAttributes]::ReparsePoint) { throw 'BACKUP_PATH_REJECTED' }
  $archive = Join-Path $directory 'database.dump.dpapi'
  foreach ($file in @($archive, (Join-Path $directory 'result.json'), (Join-Path $directory 'source-before.evidence.txt'), (Join-Path $directory 'source-after.evidence.txt'))) {
    if ([IO.File]::GetAttributes($file) -band [IO.FileAttributes]::ReparsePoint) { throw 'BACKUP_PATH_REJECTED' }
  }
  $receipt = Get-Content -LiteralPath (Join-Path $directory 'result.json') -Raw | ConvertFrom-Json
  if ($receipt.status -cne 'BACKUP_CREATED_AND_VERIFIED' -or -not $receipt.syntheticOnly -or -not $receipt.plaintextCleanup -or -not $receipt.sourceEvidenceUnchanged) { throw 'BACKUP_RECEIPT_REJECTED' }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -cne $receipt.encryptedSha256) { throw 'BACKUP_HASH_MISMATCH' }
  $expectedEvidence = [IO.File]::ReadAllText((Join-Path $directory 'source-before.evidence.txt')).Trim()
  if ($expectedEvidence -cne [IO.File]::ReadAllText((Join-Path $directory 'source-after.evidence.txt')).Trim()) { throw 'ARCHIVE_EXPECTED_EVIDENCE_MISMATCH' }
  $preflight = Invoke-TrackerBackup $true $true 134217728
  if ($preflight.status -cne 'PREVIEW_READY') { throw 'SOURCE_PREFLIGHT_FAILED' }
  $docker = Resolve-BackupExecutable 'docker'
  $source = Invoke-BackupNative $docker @('compose', '--project-name', 'finntech-auth-local', '--env-file', (Join-Path $project '.env.auth.local'), '-f', (Join-Path $project 'compose.auth.local.yaml'), 'ps', '-q', 'postgres-auth-local')
  $sourceImage = Invoke-BackupNative $docker @('inspect', '--format', '{{.Image}}', $source)
  $compose = @('compose', '--project-name', 'finntech-archive-restore-20261006', '--env-file', (Join-Path $project '.env.backup.test'), '-f', (Join-Path $project 'compose.backup.archive.test.yaml'))
  $stage = 'config_guard'
  $config = (Invoke-BackupNative $docker ($compose + @('config', '--format', 'json'))) | ConvertFrom-Json
  $service = $config.services.'postgres-archive-restore'
  if (@($config.services.PSObject.Properties).Count -ne 1 -or $service.network_mode -cne 'none' -or $service.PSObject.Properties['ports'] -or $service.image -cne 'postgres:16-alpine' -or $service.pull_policy -cne 'never') { throw 'RESTORE_CONFIG_REJECTED' }
  if ($service.environment.POSTGRES_DB -cne 'finntech_archive_restore_test' -or $service.environment.POSTGRES_USER -cne 'restore_fixture' -or $service.environment.POSTGRES_PASSWORD -match '[<>]' -or [string]::IsNullOrWhiteSpace($service.environment.POSTGRES_PASSWORD)) { throw 'RESTORE_DATABASE_CONFIG_REJECTED' }
  $volumes = @($config.volumes.PSObject.Properties)
  if ($volumes.Count -ne 1 -or $volumes[0].Value.name -cne 'finntech-archive-restore-20261006_archive_restore_20261006_pgdata' -or ($volumes[0].Value.PSObject.Properties['external'] -and $volumes[0].Value.external)) { throw 'RESTORE_VOLUME_REJECTED' }
  if (@($service.volumes).Count -ne 1 -or $service.volumes[0].source -cne 'archive_restore_20261006_pgdata' -or $service.volumes[0].type -cne 'volume' -or $service.volumes[0].target -cne '/var/lib/postgresql/data') { throw 'RESTORE_MOUNT_REJECTED' }
  $sourceMounts = (Invoke-BackupNative $docker @('inspect', '--format', '{{json .Mounts}}', $source)) | ConvertFrom-Json
  if (@($sourceMounts | Where-Object { $_.Name -eq $volumes[0].Value.name }).Count -ne 0) { throw 'SOURCE_VOLUME_COLLISION' }
  $lock = Open-BackupLock $root
  $stage = 'start_isolated_target'
  $started = $true
  # Compose reports normal progress on stderr; capture it privately and reject only nonzero exit.
  $startup = & $docker @compose up -d --wait --wait-timeout 60 --pull never 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'RESTORE_START_FAILED' }
  $startup = $null
  $target = Invoke-BackupNative $docker ($compose + @('ps', '-q', 'postgres-archive-restore'))
  if ($target -notmatch '^[a-f0-9]{12,64}$' -or $target -ceq $source) { throw 'RESTORE_TARGET_REJECTED' }
  $labels = (Invoke-BackupNative $docker @('inspect', '--format', '{{json .Config.Labels}}', $target)) | ConvertFrom-Json
  if ($labels.'com.docker.compose.project' -cne 'finntech-archive-restore-20261006' -or $labels.'com.docker.compose.service' -cne 'postgres-archive-restore') { throw 'RESTORE_LABEL_REJECTED' }
  if ((Invoke-BackupNative $docker @('inspect', '--format', '{{.HostConfig.NetworkMode}}', $target)) -cne 'none' -or (Invoke-BackupNative $docker @('inspect', '--format', '{{.Image}}', $target)) -cne $sourceImage) { throw 'RESTORE_ISOLATION_REJECTED' }
  if ((Invoke-BackupNative $docker @('inspect', '--format', '{{json .HostConfig.PortBindings}}', $target)) -notin @('{}','null')) { throw 'RESTORE_PORTS_REJECTED' }
  function Read-RestoreSql([string]$Sql) {
    return Invoke-BackupNative $docker @('exec', $target, 'timeout', '30s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'restore_fixture', '-d', 'finntech_archive_restore_test', '-c', $Sql)
  }
  if ((Read-RestoreSql "SELECT current_database() || '|' || current_user") -cne 'finntech_archive_restore_test|restore_fixture') { throw 'RESTORE_IDENTITY_REJECTED' }
  $stage = 'empty_target_guard'
  $empty = Read-RestoreSql "SELECT ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d')))::text"
  if ($empty -cne '0') { throw 'TARGET_NOT_EMPTY_NO_RESET' }
  $stage = 'private_decryption'
  $private = Join-Path $root $runId
  if (Test-Path -LiteralPath $private) { throw 'PRIVATE_DIRECTORY_EXISTS' }
  $null = [IO.Directory]::CreateDirectory($private)
  Set-BackupPrivateAcl $private (Resolve-BackupExecutable 'icacls')
  $sql = Join-Path $project 'scripts/sql/tracker-db-recovery-evidence.sql'
  $sourceTemporary = $true
  $null = Invoke-BackupNative $docker @('cp', $sql, "${source}:$containerSql")
  $sourceArgs = @('exec', $source, 'timeout', '30s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'ui_fixture', '-d', 'finntech_auth_local', '-f', $containerSql)
  $sourceBefore = Invoke-BackupNative $docker $sourceArgs
  if ((Get-Item -LiteralPath $archive).Length -gt 134217728) { throw 'ARCHIVE_SIZE_LIMIT_EXCEEDED' }
  Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
  $decoded = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($archive), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $plain = Join-Path $private 'restore.dump'
  try {
    if ($decoded.Length -ne $receipt.dumpBytes -or [Text.Encoding]::ASCII.GetString($decoded, 0, 5) -cne 'PGDMP') { throw 'ARCHIVE_HEADER_OR_SIZE_REJECTED' }
    Write-BackupNewBytes $plain $decoded
  } finally { [Array]::Clear($decoded, 0, $decoded.Length) }
  $targetTemporary = $true
  $null = Invoke-BackupNative $docker @('cp', $plain, "${target}:$containerDump")
  $null = Invoke-BackupNative $docker @('exec', $target, 'timeout', '10s', 'chmod', '600', $containerDump)
  $null = Invoke-BackupNative $docker @('cp', $sql, "${target}:$containerSql")
  $tables = Get-BackupArchiveTables (Invoke-BackupNative $docker @('exec', $target, 'timeout', '30s', 'pg_restore', '--list', $containerDump))
  if ($tables.Count -ne $receipt.publicTableDataCount) { throw 'ARCHIVE_TABLE_COUNT_REJECTED' }
  $stage = 'restore_transaction'
  $null = Invoke-BackupNative $docker @('exec', $target, 'timeout', '30s', 'pg_restore', '-U', 'restore_fixture', '-d', 'finntech_archive_restore_test', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', $containerDump)
  $stage = 'restore_evidence'
  $restored = Invoke-BackupNative $docker @('exec', $target, 'timeout', '30s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'restore_fixture', '-d', 'finntech_archive_restore_test', '-f', $containerSql)
  $sourceAfter = Invoke-BackupNative $docker $sourceArgs
  if ($restored -cne $expectedEvidence) { throw 'RESTORED_ARCHIVE_EVIDENCE_MISMATCH' }
  if ($sourceBefore -cne $sourceAfter) { throw 'SOURCE_CHANGED_DURING_RESTORE' }
  if ((Read-RestoreSql "SELECT count(*)::text FROM auth_users WHERE email NOT LIKE '%@example.invalid'") -cne '0') { throw 'RESTORED_NON_SYNTHETIC_ACCOUNT' }
  $migrations = Read-RestoreSql "SELECT migration_name || '|' || checksum || '|' || (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM _prisma_migrations ORDER BY migration_name"
  $expected = @{}
  foreach ($m in Get-ChildItem -LiteralPath (Join-Path $project 'apps/api/prisma/migrations') -Directory) {
    $file = Join-Path $m.FullName 'migration.sql'
    if (Test-Path -LiteralPath $file) { $expected[$m.Name] = (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() }
  }
  Assert-BackupMigrations $migrations $expected
  Write-BackupNewBytes (Join-Path $private 'restored.evidence.txt') ([Text.Encoding]::UTF8.GetBytes($restored))
  Write-BackupNewBytes (Join-Path $private 'source-before.evidence.txt') ([Text.Encoding]::UTF8.GetBytes($sourceBefore))
  Write-BackupNewBytes (Join-Path $private 'source-after.evidence.txt') ([Text.Encoding]::UTF8.GetBytes($sourceAfter))
  $report = [ordered]@{status='RESTORE_AND_CLEANUP_VERIFIED';at=[DateTime]::UtcNow.ToString('o');backupId=$BackupId;postgresql=(Read-RestoreSql 'SHOW server_version');migrationCount=$expected.Count;publicTableCount=$tables.Count;sourceUnchanged=$true;archiveEvidenceMatched=$true;encryptedArchiveUnchanged=((Get-FileHash -LiteralPath $archive).Hash.ToLowerInvariant() -ceq $receipt.encryptedSha256);network='none';volumePreserved=$true;privateDirectory=$private}
  if (-not $report.encryptedArchiveUnchanged) { throw 'ARCHIVE_CHANGED_DURING_RESTORE' }
  $success = $true
} catch {
  $failure = if ($_.Exception.Message -cmatch '^[A-Z][A-Z_]+$') { $_.Exception.Message } else { 'RESTORE_NATIVE_CRYPTO_OR_IO_FAILURE' }
} finally {
  if ($plain) { try { Remove-BackupOwnedFile $plain $private } catch { $cleanupOk = $false } }
  if ($targetTemporary) { try { $null = Invoke-BackupNative $docker @('exec', $target, 'timeout', '10s', 'rm', '-f', $containerDump, $containerSql) } catch { $cleanupOk = $false } }
  if ($sourceTemporary) { try { $null = Invoke-BackupNative $docker @('exec', $source, 'timeout', '10s', 'rm', '-f', $containerSql) } catch { $cleanupOk = $false } }
  if ($started) {
    try {
      $stop = & $docker @compose stop postgres-archive-restore 2>&1
      if ($LASTEXITCODE -ne 0) { throw 'RESTORE_STOP_FAILED' }
      $id = Invoke-BackupNative $docker ($compose + @('ps', '-a', '-q', 'postgres-archive-restore'))
      if ((Invoke-BackupNative $docker @('inspect', '--format', '{{.State.Running}}', $id)) -cne 'false') { throw 'RESTORE_NOT_STOPPED' }
    } catch { $cleanupOk = $false }
  }
  if ($lock) { $lock.Dispose() }
}
if ($success -and $cleanupOk) {
  $report.plaintextCleanup = $true
  $report.targetStopped = $true
  Write-BackupNewBytes (Join-Path $private 'restore-result.json') ([Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json)))
  $report | ConvertTo-Json
  exit 0
}
[pscustomobject]@{status='INCOMPLETE';stage=$stage;errorCode=$failure;cleanup=$cleanupOk;privateDirectory=$private} | ConvertTo-Json
exit 1
