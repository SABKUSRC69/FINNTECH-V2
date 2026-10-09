import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Unit tests inspect embed configuration; real provider frames are verified in browser acceptance.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true } } },
  },
})
