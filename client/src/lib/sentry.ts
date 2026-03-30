/**
 * Sentry Error Tracking - Frontend
 *
 * Initializes Sentry for React error tracking and performance monitoring.
 * Uses the v7 React Router integration to match react-router-dom v7.x.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

export function initSentry() {
  // Only initialize in production with DSN configured
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.MODE;

  if (dsn && environment === 'production') {
    Sentry.init({
      dsn,
      environment,

      // Performance Monitoring with React Router v7 instrumentation
      // (react-router-dom is v7.x — using the v6 integration caused
      // navigation interception bugs that redirected dashboard pages)
      integrations: [
        Sentry.reactRouterV7BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
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
      beforeSend(event) {
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
