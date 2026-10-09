import { readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiRoot = path.join(repositoryRoot, 'apps', 'api')
const webRoot = path.join(repositoryRoot, 'apps', 'web')
const tsxCli = path.join(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []
let shuttingDown = false

function validatePort(value) {
  const port = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('TRACKER_API_PORT must be an integer between 1 and 65535')
  }
  return String(port)
}

function getEnvFileValue(key) {
  const envPath = path.join(apiRoot, '.env')
  let contents
  try {
    contents = readFileSync(envPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`))
    if (!match) continue

    let value = match[1]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    return value
  }
  return undefined
}

const fileApiPort = getEnvFileValue('TRACKER_API_PORT')
if (process.env.PORT && !process.env.TRACKER_API_PORT && !fileApiPort) {
  throw new Error('PORT is unsupported; configure TRACKER_API_PORT for the tracker API')
}

if (getEnvFileValue('PORT') && !fileApiPort && !process.env.TRACKER_API_PORT) {
  throw new Error('PORT is unsupported; configure TRACKER_API_PORT in apps/api/.env')
}

const apiPort = validatePort(
  process.env.TRACKER_API_PORT ?? fileApiPort ?? '4174',
)
const apiHost = process.env.TRACKER_HOST ?? getEnvFileValue('TRACKER_HOST') ?? '127.0.0.1'
if (apiHost !== '127.0.0.1') {
  throw new Error('TRACKER_HOST must be 127.0.0.1 for the local tracker workspace')
}

const apiEnv = { ...process.env, TRACKER_API_PORT: apiPort }
const webEnvironmentKeys = new Set([
  'path',
  'pathext',
  'systemroot',
  'windir',
  'temp',
  'tmp',
  'userprofile',
  'appdata',
  'localappdata',
  'programdata',
])
const webEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => value !== undefined && webEnvironmentKeys.has(key.toLowerCase())),
)
webEnv.TRACKER_API_PORT = apiPort

function startProcess(name, args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    env,
  })

  children.push({ name, child })
  child.once('error', (error) => {
    console.error(`${name} could not start: ${error.message}`)
    stopAll(1)
  })
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    const exitCode = signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : code ?? 1
    if (exitCode !== 0) {
      console.error(`${name} stopped with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`)
    }
    stopAll(exitCode)
  })
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }

  const timeout = setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
    process.exit(exitCode)
  }, 2_000)

  Promise.all(children.map(({ child }) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
    } else {
      child.once('exit', resolve)
    }
  }))).then(() => {
    clearTimeout(timeout)
    process.exit(exitCode)
  })
}

process.once('SIGINT', () => stopAll(0))
process.once('SIGTERM', () => stopAll(0))

if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (input) => {
    if (input.trim().toLowerCase() === 'q') {
      console.log('Stopping tracker web and API')
      stopAll(0)
    }
  })
  console.log('Press Ctrl+C or enter q to stop tracker web and API')
}

startProcess('tracker API', ['--env-file-if-exists=.env', tsxCli, 'src/server.ts'], apiRoot, apiEnv)
startProcess('tracker web', [
  viteCli,
  '--configLoader', 'runner',
  '--host', '127.0.0.1',
  '--port', '4173',
], webRoot, webEnv)
