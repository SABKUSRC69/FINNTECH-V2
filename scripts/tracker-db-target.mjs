export function requireSyntheticDatabase(environment) {
  if (!environment.TRACKER_TEST_DATABASE_URL) {
    throw new Error('NOT TESTED: explicit synthetic PostgreSQL test configuration is missing')
  }
  let target
  try {
    target = new URL(environment.TRACKER_TEST_DATABASE_URL)
  } catch {
    throw new Error('Rejected invalid test database configuration')
  }
  if (environment.TRACKER_DB_TEST_CONFIRM !== 'synthetic-only'
    || !['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || target.port !== '5434'
    || target.pathname !== '/finntech_tracker_f14_test'
    || target.username !== 'f14_fixture'
    || !target.password || /placeholder|[<>]/i.test(decodeURIComponent(target.password))
    || target.search !== '' || target.hash !== '') {
    throw new Error('Refused database target: only the isolated F1.4 local synthetic database is permitted')
  }
  return target
}
