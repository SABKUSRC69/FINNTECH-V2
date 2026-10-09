import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          icons: ['lucide-react'],
        }
      }
    }
  },
  test: {
    // Saved release/baseline copies are artifacts, not runnable source tests.
    exclude: [...configDefaults.exclude, '**/*.local/**'],
    environment: 'happy-dom',
    globals: true,
  }
})
