#requires -Version 7.4
[CmdletBinding()]
param(
  [switch]$ConfirmSynthetic,
  [switch]$Preview,
  [ValidateRange(1048576, 536870912)][long]$MaximumDumpBytes = 134217728
)

function Resolve-BackupExecutable {
  param([string]$Name)
  # Multiple installed runtimes may resolve the same application name.
  return (Get-Command $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
}

function Invoke-BackupNative {
  param([string]$Executable, [string[]]$Arguments, [int]$TimeoutSeconds = 45)
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $Executable
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  try {
    if (-not $process.Start()) { throw 'NATIVE_START_FAILED' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      # Only this child client is ours. Container commands also use a shorter timeout.
      $process.Kill($true)
      $process.WaitForExit()
      throw 'NATIVE_TIMEOUT'
    }
    $output = $stdout.GetAwaiter().GetResult()
    $errors = $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'NATIVE_COMMAND_FAILED' }
    if (-not [string]::IsNullOrWhiteSpace($errors)) { throw 'NATIVE_WARNING' }
    return $output.Trim()
  } finally { $process.Dispose() }
}

function Write-BackupNewBytes {
  param([string]$Path, [byte[]]$Bytes)
  $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($Bytes, 0, $Bytes.Length) } finally { $stream.Dispose() }
}

function Assert-BackupPrivateRoot {
  param([string]$ProjectRoot, [string]$Root)
  $expected = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'backups.private.local'))
  if (-not [string]::Equals([IO.Path]::GetFullPath($Root), $expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'BACKUP_PATH_REJECTED' }
  foreach ($directory in @($ProjectRoot, $Root)) {
    if (Test-Path -LiteralPath $directory) {
      $attributes = [IO.File]::GetAttributes($directory)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -or -not ($attributes -band [IO.FileAttributes]::Directory)) { throw 'BACKUP_PATH_REJECTED' }
    }
  }
}

function Set-BackupPrivateAcl {
  param([string]$Directory, [string]$AclExecutable)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $null = Invoke-BackupNative $AclExecutable @($Directory, '/inheritance:r', '/grant:r', "*${sid}:(OI)(CI)F", '*S-1-5-18:(OI)(CI)F')
  $acl = Get-Acl -LiteralPath $Directory
  if (-not $acl.AreAccessRulesProtected) { throw 'PRIVATE_ACL_REJECTED' }
  foreach ($rule in $acl.Access) {
    $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($ruleSid -notin @($sid, 'S-1-5-18') -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'PRIVATE_ACL_REJECTED' }
  }
}

function Open-BackupLock {
  param([string]$Root)
  try { return [IO.File]::Open((Join-Path $Root '.backup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
  catch { throw 'BACKUP_ALREADY_RUNNING_OR_LOCK_UNAVAILABLE' }
}

function Assert-BackupMigrations {
  param([string]$Rows, [hashtable]$Expected)
  $lines = @($Rows -split '\r?\n' | Where-Object { $_ })
  if ($lines.Count -ne $Expected.Count -or $lines.Count -eq 0) { throw 'MIGRATIONS_NOT_CURRENT' }
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($line in $lines) {
    $parts = $line.Split('|')
    if ($parts.Count -ne 3 -or -not $Expected.ContainsKey($parts[0]) -or -not $seen.Add($parts[0]) -or $parts[1] -cne $Expected[$parts[0]] -or $parts[2] -cne 'true') { throw 'MIGRATIONS_NOT_CURRENT' }
  }
}

function Get-BackupArchiveTables {
  param([string]$TableOfContents)
  $names = @([regex]::Matches($TableOfContents, '(?m)^\d+;\s+\d+\s+\d+\s+TABLE DATA public ([a-z_][a-z_0-9]*)\s') | ForEach-Object { $_.Groups[1].Value })
  if (@($names | Select-Object -Unique).Count -ne $names.Count) { throw 'ARCHIVE_DUPLICATE_TABLE_DATA' }
  foreach ($required in @('_prisma_migrations', 'auth_users', 'auth_sessions', 'finance_transactions', 'crypto_trades', 'cash_accounts', 'legacy_import_rows', 'audit_events', 'idempotency_keys')) {
    if ($required -notin $names) { throw 'ARCHIVE_TABLES_MISSING' }
  }
  return ,$names
}

function Protect-BackupBytes {
  param([byte[]]$Plaintext)
  Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
  $cipher = [Security.Cryptography.ProtectedData]::Protect($Plaintext, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $verified = $null
  try {
    $verified = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($Plaintext), [Security.Cryptography.SHA256]::HashData($verified))) { throw 'ENCRYPTION_VERIFY_FAILED' }
    return ,$cipher
  } finally { if ($verified) { [Array]::Clear($verified, 0, $verified.Length) } }
}

function Remove-BackupOwnedFile {
  param([string]$File, [string]$PrivateDirectory)
  if (-not [string]::Equals([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($File)), [IO.Path]::GetFullPath($PrivateDirectory), [StringComparison]::OrdinalIgnoreCase)) { throw 'CLEANUP_PATH_REJECTED' }
  if (Test-Path -LiteralPath $File) {
    if ([IO.File]::GetAttributes($File) -band [IO.FileAttributes]::ReparsePoint) { throw 'CLEANUP_PATH_REJECTED' }
    Remove-Item -LiteralPath $File -Force
  }
}

function Invoke-TrackerBackup {
  param([bool]$SyntheticConfirmed, [bool]$PreviewOnly, [long]$SizeLimit)
  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'
  $project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $root = Join-Path $project 'backups.private.local'
  $runId = [Guid]::NewGuid().ToString('N')
  $containerDump = "/tmp/finntech-backup-$runId.dump"
  $containerSql = "/tmp/finntech-backup-$runId.evidence.sql"
  $source = $null; $private = $null; $plain = $null; $lock = $null
  $tempAttempted = $false; $cleanupOk = $true; $ready = $false; $failure = $null; $stage = 'preflight'
  $result = $null; $docker = $null; $failureKind = $null
  try {
    if (-not $SyntheticConfirmed) { throw 'SYNTHETIC_CONFIRMATION_REQUIRED' }
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_DPAPI_REQUIRED' }
    $stage = 'path_guard'
    Assert-BackupPrivateRoot $project $root
    $stage = 'git_ignore_guard'
    $git = Resolve-BackupExecutable 'git'
    $null = Invoke-BackupNative $git @('-C', $project, 'check-ignore', '--quiet', 'backups.private.local/database.dump.dpapi')
    if (Invoke-BackupNative $git @('-C', $project, 'ls-files', '--', 'backups.private.local')) { throw 'BACKUP_PATH_TRACKED' }
    $stage = 'docker_engine'
    $docker = Resolve-BackupExecutable 'docker'
    $engine = Invoke-BackupNative $docker @('version', '--format', '{{.Server.Version}}')
    if (-not $engine) { throw 'DOCKER_ENGINE_UNAVAILABLE' }
    $compose = Invoke-BackupNative $docker @('compose', 'version', '--short')
    $stage = 'source_lookup'
    $source = Invoke-BackupNative $docker @('compose', '--project-name', 'finntech-auth-local', '--env-file', (Join-Path $project '.env.auth.local'), '-f', (Join-Path $project 'compose.auth.local.yaml'), 'ps', '-q', 'postgres-auth-local')
    if ($source -notmatch '^[0-9a-f]{12,64}$') { throw 'SYNTHETIC_SOURCE_UNAVAILABLE' }
    $stage = 'container_guard'
    $labels = (Invoke-BackupNative $docker @('inspect', '--format', '{{json .Config.Labels}}', $source)) | ConvertFrom-Json
    if ($labels.'com.docker.compose.project' -cne 'finntech-auth-local' -or $labels.'com.docker.compose.service' -cne 'postgres-auth-local') { throw 'SOURCE_CONTAINER_REJECTED' }
    $stage = 'port_guard'
    $ports = (Invoke-BackupNative $docker @('inspect', '--format', '{{json .NetworkSettings.Ports}}', $source)) | ConvertFrom-Json
    $published = @($ports.'5432/tcp')
    if ($published.Count -ne 1 -or $published[0].HostIp -cne '127.0.0.1' -or $published[0].HostPort -cne '5436') { throw 'SOURCE_PORT_REJECTED' }
    function Read-BackupSql([string]$Sql) {
      return Invoke-BackupNative $docker @('exec', $source, 'timeout', '30s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'ui_fixture', '-d', 'finntech_auth_local', '-c', $Sql)
    }
    $stage = 'database_guard'
    if ((Read-BackupSql "SELECT current_database() || '|' || current_user") -cne 'finntech_auth_local|ui_fixture') { throw 'SOURCE_DATABASE_REJECTED' }
    $stage = 'synthetic_guard'
    if ((Read-BackupSql "SELECT count(*)::text FROM auth_users WHERE email NOT LIKE '%@example.invalid'") -cne '0') { throw 'NON_SYNTHETIC_ACCOUNT_FOUND' }
    $stage = 'postgres_version'
    $postgres = Read-BackupSql 'SHOW server_version'
    if ($postgres -notmatch '^16\.') { throw 'POSTGRES_VERSION_REJECTED' }
    $stage = 'migration_guard'
    $expected = @{}
    foreach ($migration in Get-ChildItem -LiteralPath (Join-Path $project 'apps/api/prisma/migrations') -Directory) {
      $sql = Join-Path $migration.FullName 'migration.sql'
      if (Test-Path -LiteralPath $sql) { $expected[$migration.Name] = (Get-FileHash -LiteralPath $sql -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $migrationRows = Read-BackupSql "SELECT migration_name || '|' || checksum || '|' || (finished_at IS NOT NULL AND rolled_back_at IS NULL)::text FROM _prisma_migrations ORDER BY migration_name"
    Assert-BackupMigrations $migrationRows $expected
    $result = [ordered]@{ status='PREVIEW_READY'; at=[DateTime]::UtcNow.ToString('o'); powershell=$PSVersionTable.PSVersion.ToString(); docker=$engine; compose=$compose; postgresql=$postgres; migrationCount=$expected.Count; syntheticOnly=$true; encryption='DPAPI CurrentUser: same Windows profile/machine only'; scheduled=$false; offDevice=$false; restoreTested=$false; retentionDeletionEnabled=$false }
    if ($PreviewOnly) { return [pscustomobject]$result }
    $stage = 'private_storage'
    $null = [IO.Directory]::CreateDirectory($root)
    Assert-BackupPrivateRoot $project $root
    $lock = Open-BackupLock $root
    $private = Join-Path $root $runId
    if (Test-Path -LiteralPath $private) { throw 'NEW_BACKUP_DIRECTORY_EXISTS' }
    $null = [IO.Directory]::CreateDirectory($private)
    $aclExecutable = Resolve-BackupExecutable 'icacls'
    Set-BackupPrivateAcl $private $aclExecutable
    $stage = 'source_evidence'
    $tempAttempted = $true
    $null = Invoke-BackupNative $docker @('cp', (Join-Path $project 'scripts/sql/tracker-db-recovery-evidence.sql'), "${source}:$containerSql")
    $evidenceArguments = @('exec', $source, 'timeout', '30s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'ui_fixture', '-d', 'finntech_auth_local', '-f', $containerSql)
    $before = Invoke-BackupNative $docker $evidenceArguments
    $stage = 'dump'
    $result.dumpStartedAt = [DateTime]::UtcNow.ToString('o')
    # Keep even the short-lived container copy private before copying/encrypting it.
    $dumpOutput = Invoke-BackupNative $docker @('exec', $source, 'sh', '-c', 'umask 077; exec timeout 30s pg_dump "$@"', 'finntech-private-dump', '-U', 'ui_fixture', '-d', 'finntech_auth_local', '--format=custom', '--no-acl', '--lock-wait-timeout=5000', "--file=$containerDump")
    if ($dumpOutput) { throw 'UNEXPECTED_DUMP_OUTPUT' }
    $tables = Get-BackupArchiveTables (Invoke-BackupNative $docker @('exec', $source, 'timeout', '30s', 'pg_restore', '--list', $containerDump))
    $expectedTables = @([regex]::Matches($before, '(?m)^TABLE:public\.([a-z_][a-z_0-9]*)\|') | ForEach-Object { $_.Groups[1].Value })
    if ($expectedTables.Count -eq 0 -or (($tables | Sort-Object) -join '|') -cne (($expectedTables | Sort-Object) -join '|')) { throw 'ARCHIVE_PUBLIC_TABLES_MISMATCH' }
    $plain = Join-Path $private 'temporary.dump'
    $null = Invoke-BackupNative $docker @('cp', "${source}:$containerDump", $plain)
    $stage = 'encrypt'
    if ((Get-Item -LiteralPath $plain).Length -gt $SizeLimit) { throw 'DUMP_SIZE_LIMIT_EXCEEDED' }
    $bytes = [IO.File]::ReadAllBytes($plain)
    $cipher = $null
    try {
      if ($bytes.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 5) -cne 'PGDMP') { throw 'INVALID_CUSTOM_ARCHIVE' }
      $cipher = Protect-BackupBytes $bytes
      $pending = Join-Path $private 'database.dump.dpapi.pending'
      Write-BackupNewBytes $pending $cipher
      # Re-read persisted ciphertext, rather than trusting only the in-memory round-trip.
      $persisted = [IO.File]::ReadAllBytes($pending)
      $decoded = [Security.Cryptography.ProtectedData]::Unprotect($persisted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      try {
        if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals([Security.Cryptography.SHA256]::HashData($bytes), [Security.Cryptography.SHA256]::HashData($decoded))) { throw 'PERSISTED_ARCHIVE_VERIFY_FAILED' }
      } finally { [Array]::Clear($decoded, 0, $decoded.Length) }
      $result.dumpBytes = $bytes.Length
      $result.encryptedSha256 = (Get-FileHash -LiteralPath $pending -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally {
      [Array]::Clear($bytes, 0, $bytes.Length)
      if ($cipher) { [Array]::Clear($cipher, 0, $cipher.Length) }
    }
    $stage = 'post_backup_evidence'
    $after = Invoke-BackupNative $docker $evidenceArguments
    $result.sourceEvidenceUnchanged = $before -ceq $after
    $result.publicTableDataCount = $tables.Count
    Write-BackupNewBytes (Join-Path $private 'source-before.evidence.txt') ([Text.Encoding]::UTF8.GetBytes($before))
    Write-BackupNewBytes (Join-Path $private 'source-after.evidence.txt') ([Text.Encoding]::UTF8.GetBytes($after))
    $ready = $true
  } catch {
    $failureKind = $_.Exception.GetType().Name
    $message = $_.Exception.Message
    $failure = if ($message -cmatch '^[A-Z][A-Z_]+$') { $message } else { 'NATIVE_CRYPTO_OR_IO_FAILURE' }
  } finally {
    if ($plain) { try { Remove-BackupOwnedFile $plain $private } catch { $cleanupOk = $false } }
    if ($tempAttempted) {
      try { $null = Invoke-BackupNative $docker @('exec', $source, 'timeout', '10s', 'rm', '-f', $containerDump, $containerSql) } catch { $cleanupOk = $false }
    }
    if ($lock -and (-not $ready -or -not $cleanupOk)) { $lock.Dispose(); $lock = $null }
  }
  if ($ready -and $cleanupOk) {
    $stage = 'publish'
    try {
      [IO.File]::Move((Join-Path $private 'database.dump.dpapi.pending'), (Join-Path $private 'database.dump.dpapi'), $false)
      $result.status = 'BACKUP_CREATED_AND_VERIFIED'
      $result.plaintextCleanup = $true
      $result.finishedAt = [DateTime]::UtcNow.ToString('o')
      $result.privateDirectory = $private
      Write-BackupNewBytes (Join-Path $private 'result.json') ([Text.Encoding]::UTF8.GetBytes(($result | ConvertTo-Json)))
      return [pscustomobject]$result
    } catch { $failure = 'PUBLISH_FAILED' }
    finally { if ($lock) { $lock.Dispose() } }
  }
  return [pscustomobject]@{ status='INCOMPLETE'; stage=$stage; errorCode=$failure; errorKind=$failureKind; plaintextCleanup=$cleanupOk; privateDirectory=$private; restoreTested=$false }
}

# Dot-sourcing loads helpers for isolated tests without accessing Docker or user data.
if ($MyInvocation.InvocationName -ne '.') {
  $backupResult = Invoke-TrackerBackup $ConfirmSynthetic.IsPresent $Preview.IsPresent $MaximumDumpBytes
  $backupResult | ConvertTo-Json
  if ($backupResult.status -eq 'PREVIEW_READY' -or $backupResult.status -eq 'BACKUP_CREATED_AND_VERIFIED') { exit 0 }
  exit 1
}
