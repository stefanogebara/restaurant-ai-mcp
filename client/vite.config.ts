import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Only run Sentry's source-map upload when the auth token is set
    // (i.e. real prod deploys). Locally + on PR previews this skips the
    // upload step, which previously added 1-2 min to the build.
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org: process.env.SENTRY_ORG || 'seatable',
      project: process.env.SENTRY_PROJECT || 'node-express',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    })] : []),
  ],
  build: {
    // 'hidden' generates maps for Sentry upload but does NOT inject the
    // //# sourceMappingURL comment, so browsers don't download .js.map
    // files. Cuts shipped dist size roughly in half and prevents the
    // maps from showing up in the network panel of every visitor.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-motion': ['framer-motion'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'vendor-charts': ['recharts'],
          'vendor-sentry': ['@sentry/react'],
          'vendor-stripe': ['@stripe/react-stripe-js', '@stripe/stripe-js'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/utilities'],
          'vendor-icons': ['lucide-react'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
