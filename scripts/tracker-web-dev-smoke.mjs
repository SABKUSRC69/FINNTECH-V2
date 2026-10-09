import { createServer } from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = path.join(repositoryRoot, 'apps', 'web')
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const smokePort = 4175
const smokeUrl = `http://127.0.0.1:${smokePort}`
const childEnvironmentKeys = new Set([
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

function makeWebEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) =>
      value !== undefined && childEnvironmentKeys.has(key.toLowerCase()),
    ),
  )
  if (process.env.TRACKER_API_PORT !== undefined) {
    environment.TRACKER_API_PORT = process.env.TRACKER_API_PORT
  }
  return environment
}

async function assertPortAvailable(port) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function waitForResponse(url, child, output, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited with code ${child.exitCode}. Output:\n${output()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`${url} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}\n${output()}`)
}

function stop(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Vite did not stop after SIGTERM'))
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

function findOptimizedClientSpecifier(source) {
  const matches = [...source.matchAll(/(?:from\s*|import\s*)["']([^"']*react-dom_client\.js(?:\?[^"']*)?)["']/g)]
  const match = matches[0]?.[1]
  if (!match) {
    throw new Error('Transformed main.tsx did not import the optimized react-dom/client module')
  }
  if (!match.includes('/node_modules/.vite-tracker-web/deps/')) {
    throw new Error(`React DOM client was not served from Vite's optimized dependency cache: ${match}`)
  }
  return match
}

let child
let childOutput = ''
let testFailure

try {
  await assertPortAvailable(smokePort)
  child = spawn(process.execPath, [
    viteCli,
    '--configLoader', 'runner',
    '--host', '127.0.0.1',
    '--port', String(smokePort),
    '--strictPort',
    '--force',
  ], {
    cwd: webRoot,
    env: makeWebEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  const captureOutput = (chunk) => {
    childOutput = (childOutput + chunk).slice(-8_000)
  }
  child.stdout.on('data', captureOutput)
  child.stderr.on('data', captureOutput)

  child.once('error', (error) => {
    childOutput += `\nProcess error: ${error.message}`
  })

  await waitForResponse(smokeUrl, child, () => childOutput)
  const mainResponse = await waitForResponse(`${smokeUrl}/src/main.tsx`, child, () => childOutput)
  const mainSource = await mainResponse.text()
  const clientSpecifier = findOptimizedClientSpecifier(mainSource)
  const clientUrl = new URL(clientSpecifier, smokeUrl)
  const clientResponse = await waitForResponse(clientUrl, child, () => childOutput)
  const clientSource = await clientResponse.text()
  const contentType = clientResponse.headers.get('content-type') ?? ''

  if (!contentType.includes('javascript')) {
    throw new Error(`Optimized React DOM client has unexpected content type: ${contentType}`)
  }
  if (!/\bexport\s+(?:\{|\*|default\b|const\b|function\b|class\b)/.test(clientSource)) {
    throw new Error('Optimized React DOM client response does not contain an ESM export')
  }
  const commonJsMatch = clientSource.match(/require\s*\(\s*["']react-dom["']\s*\)/)
  if (commonJsMatch) {
    throw new Error('Optimized React DOM client still contains an unconverted external require("react-dom")')
  }

  console.log(`PASS: Vite --force served main.tsx with ${clientSpecifier}`)
  console.log(`PASS: optimized React DOM client returned ${contentType} with an ESM export and no raw external require("react-dom")`)
} catch (error) {
  testFailure = error
} finally {
  if (child) {
    try {
      await stop(child)
    } catch (error) {
      testFailure ??= error
    }
  }
}

if (testFailure) {
  throw testFailure
}

await assertPortAvailable(smokePort)
console.log(`PASS: dev smoke server stopped and released 127.0.0.1:${smokePort}`)
