/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // The dev server falls back to the backend's API_KEY from the project's
  // .env when none is saved in Settings. Production builds never get it, so
  // the key can't end up in a deployed bundle; tests don't either.
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const useEnvKey = command === 'serve' && mode !== 'test'
  const envApiKey = useEnvKey ? (loadEnv(mode, projectRoot, '').API_KEY ?? '') : ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __ENV_API_KEY__: JSON.stringify(envApiKey),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
    },
  }
})
