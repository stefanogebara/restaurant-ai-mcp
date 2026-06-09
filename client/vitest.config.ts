import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // userEvent-driven tests routinely exceed the 5s default on loaded
    // machines (Windows + jsdom + parallel forks pushed single typing tests
    // past 5s, flaking 18-47 tests per run with zero real failures). 15s
    // keeps genuinely-hung tests failing fast while absorbing machine load.
    testTimeout: 15000,
  },
})
