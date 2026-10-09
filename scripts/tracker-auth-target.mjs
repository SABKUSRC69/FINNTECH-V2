export function requireAuthTestDatabase(environment) {
  let target
  try { target = new URL(environment.TRACKER_AUTH_TEST_DATABASE_URL) } catch {
    throw new Error('NOT TESTED: explicit synthetic Auth PostgreSQL configuration is missing or invalid')
  }
  if (environment.TRACKER_AUTH_TEST_CONFIRM !== 'synthetic-only'
    || !['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || target.port !== '5435' || target.pathname !== '/finntech_auth_test'
    || target.username !== 'auth_fixture' || !target.password
    || /placeholder|[<>]/i.test(decodeURIComponent(target.password)) || target.search || target.hash) {
    throw new Error('Refused Auth database target; only the isolated synthetic local database is permitted')
  }
  return target
}
