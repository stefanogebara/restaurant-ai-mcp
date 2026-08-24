import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Suites that transitively import src/lib/supabase.ts die at IMPORT time
    // on machines without client/.env — supabase-js throws "supabaseUrl is
    // required" on createClient('') and the whole file reports "no tests"
    // (which a piped `| tail` hides, since the pipe masks vitest's exit
    // code). Tests never talk to real Supabase (fetch is mocked), so a stub
    // is MORE hermetic than inheriting developer credentials. Real env still
    // wins when present (CI).
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://test-stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key',
    },
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
