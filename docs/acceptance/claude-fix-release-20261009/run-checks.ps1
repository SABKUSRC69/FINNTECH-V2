# Required checks for the fix release, run from the repository root; exact exit codes in checks.json.
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Admin\Downloads\FINNTECH'
$ev = Join-Path $root 'docs\acceptance\claude-fix-release-20261009'
Set-Location $root
$commands = @(
  @{ id = 'npm-test'; cmd = 'npm test' },
  @{ id = 'npm-build'; cmd = 'npm run build' },
  @{ id = 'tracker-typecheck'; cmd = 'npm run tracker:typecheck' },
  @{ id = 'tracker-test'; cmd = 'npm run tracker:test' },
  @{ id = 'tracker-build'; cmd = 'npm run tracker:build' },
  @{ id = 'package-smoke'; cmd = 'node --no-strip-types scripts/tracker-package-smoke.mjs' },
  @{ id = 'diff-check'; cmd = 'git diff --check' }
)
$results = @()
foreach ($c in $commands) {
  $log = Join-Path $ev "check-$($c.id).log"
  $start = Get-Date
  cmd /c "$($c.cmd) > `"$log`" 2>&1"
  $results += [pscustomobject]@{ id = $c.id; command = $c.cmd; exitCode = $LASTEXITCODE; seconds = [int]((Get-Date) - $start).TotalSeconds }
  $results | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $ev 'checks.json')
}
'DONE'
