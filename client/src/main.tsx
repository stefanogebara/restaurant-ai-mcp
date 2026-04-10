import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'
import { i18nReady, preloadAndSwitchDemoLanguage } from './i18n/config'
import i18n from 'i18next'

// Initialize Sentry error tracking
initSentry();

// Initialize PostHog funnel analytics
initAnalytics();

// Enable dark mode by default
document.documentElement.classList.add('dark')

// Clear chunk-reload flag on successful app load (set by lazyRetry on fatal chunk failure).
// This allows future visits to retry chunk loading if needed.
sessionStorage.removeItem('seatable-chunk-reload');

// Preset keys that require Spanish regardless of browser/user language
const SPANISH_DEMO_PRESETS = new Set(['makoto']);

// Wait for locale bundle to load before first render (prevents flash of English)
i18nReady.then(async () => {
  // Pre-set language for demo presets so ALL components (StatsBar, ReservationsList, etc.)
  // start in the correct language from the very first render — no async waterfall.
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('preset');
  if (preset && SPANISH_DEMO_PRESETS.has(preset) && !i18n.language.startsWith('es')) {
    await preloadAndSwitchDemoLanguage('es');
  }

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
