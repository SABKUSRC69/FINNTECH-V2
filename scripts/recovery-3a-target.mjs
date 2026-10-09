export function requireRecoveryTarget(environment) {
  let target
  try { target = new URL(environment.DATABASE_URL) } catch { throw new Error('NOT TESTED: explicit 3A target missing') }
  if (environment.TRACKER_RECOVERY_CONFIRM !== 'synthetic-only' || target.protocol !== 'postgresql:'
    || target.hostname !== '127.0.0.1' || target.port !== '5441' || target.pathname !== '/finntech_recovery_3a_20261007'
    || target.username !== 'recovery_fixture' || !target.password || target.search || target.hash
    || /placeholder|[<>]/i.test(decodeURIComponent(target.password))) throw new Error('Refused recovery target; no writes performed')
  return target
}
