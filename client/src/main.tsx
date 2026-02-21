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
/* Force rebuild - Modern Dark UI */
