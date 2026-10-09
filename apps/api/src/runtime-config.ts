export function readListenerConfiguration(env: NodeJS.ProcessEnv): { host: string; port: number } {
  const mode = env.TRACKER_RUNTIME_MODE ?? 'local'
  if (!['local', 'cloud-beta', 'cloud-real', 'real-rehearsal'].includes(mode)) throw new Error('Unknown tracker runtime mode')
  const cloud = mode === 'cloud-beta' || mode === 'cloud-real'
  if (mode === 'real-rehearsal' && (env.NODE_ENV !== 'test' || env.TRACKER_API_PORT !== (env.TRACKER_REAL_REHEARSAL_ID === 'finish-20261008' ? '4199' : '4198'))) throw new Error('Real rehearsal requires the isolated test listener')
  if (cloud && (env.NODE_ENV !== 'production' || env.TRACKER_HOST || env.TRACKER_API_PORT)) throw new Error('Cloud beta requires production PORT configuration')
  if (!cloud && env.PORT && !env.TRACKER_API_PORT) throw new Error('PORT is unsupported; configure TRACKER_API_PORT for the tracker API')
  const value = cloud ? env.PORT : env.TRACKER_API_PORT ?? '4174'
  if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Tracker port must be an integer between 1 and 65535')
  const host = cloud ? '0.0.0.0' : env.TRACKER_HOST ?? '127.0.0.1'
  if (!cloud && host !== '127.0.0.1') throw new Error('TRACKER_HOST must be 127.0.0.1 for the local tracker workspace')
  return { host, port: Number(value) }
}
