#requires -Version 7.4
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tracker-db-backup.ps1')
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path $project ('.backup-script-tests-' + [Guid]::NewGuid().ToString('N') + '.local')
$null = [IO.Directory]::CreateDirectory($testRoot)
$tests = [Collections.Generic.List[object]]::new()

function Test-BackupCase([string]$Name, [scriptblock]$Case) {
  try { & $Case; $tests.Add(@{name=$Name;status='PASS'}) }
  catch { $tests.Add(@{name=$Name;status='FAIL';kind=$_.Exception.GetType().Name}) }
}
function Assert-BackupTest([bool]$Condition) { if (-not $Condition) { throw 'TEST_ASSERTION_FAILED' } }
function Assert-BackupThrows([scriptblock]$Case, [string]$Code) {
  $caught = $false
  try { & $Case } catch { $caught = $true; if ($Code) { Assert-BackupTest ($_.Exception.Message -ceq $Code) } }
  Assert-BackupTest $caught
}

Test-BackupCase 'reject missing synthetic confirmation before native calls' {
  $result = Invoke-TrackerBackup $false $true 134217728
  Assert-BackupTest ($result.status -ceq 'INCOMPLETE' -and $result.errorCode -ceq 'SYNTHETIC_CONFIRMATION_REQUIRED')
}
Test-BackupCase 'restrict private output to the known local root' {
  Assert-BackupPrivateRoot $project (Join-Path $project 'backups.private.local')
  Assert-BackupThrows { Assert-BackupPrivateRoot $project (Join-Path $project '..\elsewhere') } 'BACKUP_PATH_REJECTED'
}
Test-BackupCase 'resolve exactly one native executable when PATH contains multiple runtimes' {
  $executable = Resolve-BackupExecutable 'git'
  Assert-BackupTest ($executable -is [string] -and [IO.File]::Exists($executable))
}
Test-BackupCase 'CreateNew never overwrites an existing archive' {
  $file = Join-Path $testRoot 'existing.bin'
  Write-BackupNewBytes $file ([byte[]](1,2,3))
  Assert-BackupThrows { Write-BackupNewBytes $file ([byte[]](4,5,6)) } ''
  Assert-BackupTest (([IO.File]::ReadAllBytes($file) -join ',') -ceq '1,2,3')
}
Test-BackupCase 'exclusive lock blocks overlap and releases for the next backup' {
  $first = Open-BackupLock $testRoot
  try { Assert-BackupThrows { $unexpected = Open-BackupLock $testRoot; $unexpected.Dispose() } 'BACKUP_ALREADY_RUNNING_OR_LOCK_UNAVAILABLE' }
  finally { $first.Dispose() }
  $next = Open-BackupLock $testRoot; $next.Dispose()
}
Test-BackupCase 'reject pending, rolled back, changed, duplicate or missing migrations' {
  $expected = @{ migration_a='a';migration_b='b' }
  Assert-BackupMigrations "migration_a|a|true`nmigration_b|b|true" $expected
  foreach ($rows in @("migration_a|a|false`nmigration_b|b|true", "migration_a|x|true`nmigration_b|b|true", "migration_a|a|true`nmigration_a|a|true", 'migration_a|a|true')) {
    Assert-BackupThrows { Assert-BackupMigrations $rows $expected } 'MIGRATIONS_NOT_CURRENT'
  }
}
Test-BackupCase 'archive TOC requires cash/Auth/ledger/legacy/receipt data sections' {
  $names = @('_prisma_migrations','auth_users','auth_sessions','finance_transactions','crypto_trades','cash_accounts','legacy_import_rows','audit_events','idempotency_keys')
  $toc = ($names | ForEach-Object { "100; 0 100 TABLE DATA public $_ synthetic_owner" }) -join "`n"
  Assert-BackupTest ((Get-BackupArchiveTables $toc).Count -eq 9)
  Assert-BackupThrows { Get-BackupArchiveTables ($toc.Replace('cash_accounts','missing_table')) } 'ARCHIVE_TABLES_MISSING'
  Assert-BackupThrows { Get-BackupArchiveTables ($toc + "`n100; 0 100 TABLE DATA public cash_accounts synthetic_owner") } 'ARCHIVE_DUPLICATE_TABLE_DATA'
}
Test-BackupCase 'DPAPI round-trip and corruption rejection on synthetic bytes' {
  $plain = [Text.Encoding]::UTF8.GetBytes('synthetic-only backup bytes')
  $cipher = Protect-BackupBytes $plain
  $decoded = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  Assert-BackupTest (([Convert]::ToHexString($plain)) -ceq ([Convert]::ToHexString($decoded)))
  [Array]::Clear($decoded,0,$decoded.Length)
  $cipher[0] = $cipher[0] -bxor 1
  Assert-BackupThrows { [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) | Out-Null } ''
  [Array]::Clear($plain,0,$plain.Length); [Array]::Clear($cipher,0,$cipher.Length)
}
Test-BackupCase 'private ACL permits only current Windows user and SYSTEM' {
  $private = Join-Path $testRoot 'private'
  $null = [IO.Directory]::CreateDirectory($private)
  Set-BackupPrivateAcl $private (Resolve-BackupExecutable 'icacls')
}
Test-BackupCase 'cleanup refuses paths outside its own directory' {
  Assert-BackupThrows { Remove-BackupOwnedFile (Join-Path $project 'do-not-touch.file') $testRoot } 'CLEANUP_PATH_REJECTED'
  $file = Join-Path $testRoot 'plaintext.bin'
  Write-BackupNewBytes $file ([byte[]](1)); Remove-BackupOwnedFile $file $testRoot
  Assert-BackupTest (-not (Test-Path -LiteralPath $file))
}
Test-BackupCase 'native failure redacts stdout/stderr instead of forwarding them' {
  Assert-BackupThrows { Invoke-BackupNative (Join-Path $PSHOME 'pwsh.exe') @('-NoProfile','-Command',"[Console]::Error.WriteLine('synthetic-private-value');exit 7") } 'NATIVE_COMMAND_FAILED'
}
Test-BackupCase 'native stderr warnings fail instead of being discarded' {
  Assert-BackupThrows { Invoke-BackupNative (Join-Path $PSHOME 'pwsh.exe') @('-NoProfile','-Command',"[Console]::Error.WriteLine('synthetic-warning')") } 'NATIVE_WARNING'
}
Test-BackupCase 'native deadline stops only its own child' {
  Assert-BackupThrows { Invoke-BackupNative (Join-Path $PSHOME 'pwsh.exe') @('-NoProfile','-Command','Start-Sleep -Seconds 10') 1 } 'NATIVE_TIMEOUT'
}

# No database/Docker access, no PostgreSQL runtime PASS from this suite.
[pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');scope='synthetic helper/unit checks only';tests=$tests.ToArray();temporaryDirectory=$testRoot} | ConvertTo-Json -Depth 5
if (@($tests | Where-Object status -eq 'FAIL').Count) { exit 1 }
exit 0
