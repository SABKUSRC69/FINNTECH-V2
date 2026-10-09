export function requireBetaRehearsalTarget(env) {
  let target
  try { target = new URL(env.DATABASE_URL) } catch { throw new Error('Refused missing Beta rehearsal target') }
  if (env.BETA_REHEARSAL_CONFIRM !== 'synthetic-only' || target.protocol !== 'postgresql:'
    || target.hostname !== '127.0.0.1' || target.port !== '5442' || target.username !== 'beta_fixture'
    || target.pathname !== '/finntech_beta_rehearsal_20261007' || !target.password || target.search || target.hash) throw new Error('Refused Beta rehearsal target')
  return target
}
