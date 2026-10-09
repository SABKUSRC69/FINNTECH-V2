export function readRealBackupTarget(environment) {
  let url
  try { url = new URL(environment.FINNTECH_BACKUP_DATABASE_URL ?? '') } catch { throw new Error('BACKUP_TARGET_REQUIRED') }
  const host = environment.TRACKER_REAL_DATABASE_HOST ?? '', name = environment.TRACKER_REAL_DATABASE_NAME ?? ''
  const appRole = environment.TRACKER_REAL_DATABASE_ROLE ?? '', backupRole = environment.FINNTECH_BACKUP_DATABASE_ROLE ?? ''
  const origin = environment.TRACKER_ORIGIN ?? ''
  let parsedOrigin
  try { parsedOrigin = new URL(origin) } catch { throw new Error('BACKUP_TARGET_REJECTED') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password || url.username !== backupRole || appRole === backupRole
    || !/^[a-z][a-z0-9_]{1,62}$/.test(name) || !/^[a-z][a-z0-9_]{1,62}$/.test(appRole) || !/^[a-z][a-z0-9_]{1,62}$/.test(backupRole)
    || /beta|demo|fixture|synthetic|rehearsal|auth_test|auth_local/i.test(`${name}:${appRole}:${backupRole}`)
    || !host.endsWith('.neon.tech') || url.hostname.replace('-pooler.', '.') !== host || url.pathname !== `/${name}`
    || url.searchParams.get('sslmode') !== 'verify-full' || parsedOrigin.origin !== origin || !origin.startsWith('https://')) throw new Error('BACKUP_TARGET_REJECTED')
  return { url, host, name, appRole, backupRole, origin }
}
