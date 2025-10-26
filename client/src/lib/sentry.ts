/**
 * Sentry Error Tracking - Frontend
 *
 * Initializes Sentry for React error tracking and performance monitoring
 */

import * as Sentry from '@sentry/react';

export function initSentry() {
  // Only initialize in production with DSN configured
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.MODE;

  if (dsn && environment === 'production') {
    Sentry.init({
      dsn,
      environment,

      // Performance Monitoring
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],

      // Performance monitoring - capture 10% of transactions
      tracesSampleRate: 0.1,

      // Session Replay - capture 10% of sessions, 100% of error sessions
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Release tracking
      release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || 'development',

      // Error filtering
      beforeSend(event, _hint) {
        // Don't send errors from browser extensions
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.stacktrace?.frames?.some(frame =>
            frame.filename?.includes('chrome-extension://') ||
            frame.filename?.includes('moz-extension://')
          )) {
            return null;
          }
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Network errors
        'NetworkError',
        'Network request failed',
        'Failed to fetch',
        // Browser extension errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
      ],
    });

    console.log('✅ Sentry initialized for error tracking');
    return true;
  }

  console.log('ℹ️ Sentry not initialized (missing VITE_SENTRY_DSN or not in production)');
  return false;
}

// Export Sentry for manual error tracking
export { Sentry };
