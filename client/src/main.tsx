import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'

// Initialize Sentry error tracking
initSentry();

// Initialize PostHog funnel analytics
initAnalytics();

// Enable dark mode by default
document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
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
