import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const workspaceRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const apiPort = getApiPort(process.env.TRACKER_API_PORT ?? readApiPortFromFile())

function readApiPortFromFile(): string | undefined {
  const envPath = path.join(workspaceRoot, 'apps/api/.env')
  let contents: string
  try {
    contents = readFileSync(envPath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?TRACKER_API_PORT\s*=\s*(.*?)\s*$/)
    if (!match) continue

    let value = match[1] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    return value
  }

  return undefined
}

function getApiPort(value: string | undefined): number {
  if (value === undefined) return 4174

  const port = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('TRACKER_API_PORT must be an integer between 1 and 65535')
  }

  return port
}

export default defineConfig(({ command }) => ({
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite-tracker-web'),
  plugins: [react()],
  ...(command === 'serve'
    ? {
        resolve: {
          // Dev can resolve workspace source before a build creates package dist/ output.
          alias: [
            {
              find: '@finntech/contracts',
              replacement: path.join(workspaceRoot, 'packages/contracts/src/index.ts'),
            },
            {
              find: '@finntech/finance',
              replacement: path.join(workspaceRoot, 'packages/finance/src/index.ts'),
            },
          ],
        },
      }
    : {}),
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    fs: {
      allow: [workspaceRoot],
    },
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${apiPort}`,
        changeOrigin: false,
        ws: true,
      },
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    // Keep optimization explicit and within this workspace while ensuring React's
    // CommonJS client entry is converted to browser-compatible ESM.
    entries: ['index.html'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
    noDiscovery: true,
  },
}))
