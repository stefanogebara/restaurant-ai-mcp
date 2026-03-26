import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'
import { i18nReady } from './i18n/config'

// Initialize Sentry error tracking
initSentry();

// Initialize PostHog funnel analytics
initAnalytics();

// Enable dark mode by default
document.documentElement.classList.add('dark')

// Clear chunk-reload flag on successful app load (set by lazyRetry on fatal chunk failure).
// This allows future visits to retry chunk loading if needed.
sessionStorage.removeItem('seatable-chunk-reload');

// Wait for locale bundle to load before first render (prevents flash of English)
i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
// Register service worker for PWA + force update check on every page load
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Check for SW updates on every page load (catches new deploys)
      reg.update().catch(() => { /* non-critical */ });
    }).catch(() => {
      // SW registration is non-critical
    });
  });
}
/* Force rebuild - Modern Dark UI */
