# (Re)starts the production image at Render Free limits (0.1 CPU, 512 MB) inside claude-fix-pg's
# network namespace, in email-password real-rehearsal mode. Secrets come from %TEMP% only.
$s = Get-Content "$env:TEMP\claude-fix-20261009\secrets.json" -Raw | ConvertFrom-Json
$envs = @('NODE_ENV=test','TRACKER_RUNTIME_MODE=real-rehearsal','TRACKER_REAL_REHEARSAL_ID=finish-20261008','TRACKER_DATA_MODE=real-rehearsal',
  'TRACKER_REAL_AUTH_MODE=email-password','TRACKER_RECOVERY_MODE=off','TRACKER_REAL_REGISTRATIONS_OPEN=true','TRACKER_REAL_DATABASE_HOST=127.0.0.1',
  'TRACKER_REAL_DATABASE_NAME=finntech_finish_real','TRACKER_REAL_DATABASE_ROLE=finish_rehearsal',
  "DATABASE_URL=postgresql://finish_rehearsal:$($s.db)@127.0.0.1:5446/finntech_finish_real","BETTER_AUTH_SECRET=$($s.secret)",
  'TRACKER_ORIGIN=http://127.0.0.1:4199','TRACKER_API_PORT=4199')
$arguments = @('run','-d','--name','claude-fix-app','--network','container:claude-fix-pg','--cpus','0.1','--memory','512m','--memory-swap','512m')
foreach ($e in $envs) { $arguments += @('-e', $e) }
$arguments += 'finntech-audit-fix:local'
docker rm -f claude-fix-app 2>$null | Out-Null
docker @arguments | Out-Null
for ($i = 0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest http://127.0.0.1:4199/api/ready -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { 'ready'; break } } catch { Start-Sleep 2 } }
