/**
 * Sentry Error Tracking Configuration
 *
 * Reports backend errors to Sentry, loading the SDK only when there is
 * something to report.
 *
 * Why lazy (2026-11-21): secure-logger requires this file, and about 150
 * functions use secure-logger, so every cold start of almost every function
 * loaded @sentry/node and its OpenTelemetry stack and ran Sentry.init with
 * tracing on. Measured locally, require('@sentry/node') alone takes ~1 s,
 * about half of the dashboard function's start-up; on Vercel's cold
 * containers it is several times that. Now nothing loads until the first
 * captureException / captureMessage / setUser / addBreadcrumb call.
 *
 * What this trades: the 10% performance traces stop (they need the SDK
 * loaded before the request starts), and an uncaught exception that no
 * handler passes to captureException reaches the Vercel logs but not Sentry.
 */

let sdk = null;
let initialized = false;

function wanted() {
  return Boolean(process.env.SENTRY_DSN);
}

/** The SDK, loaded and (in production) initialized on first use; null without a DSN. */
function getSentry() {
  if (!wanted()) return null;
  if (!sdk) sdk = require('@sentry/node');
  if (!initialized && process.env.NODE_ENV === 'production') {
    sdk.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',

      // Performance traces need the SDK loaded before the request starts,
      // which is exactly the cold-start cost this file now avoids.
      tracesSampleRate: 0,

      // Release tracking
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',

      // Error filtering
      beforeSend(event) {
        // Don't send errors for health checks
        if (event.request && event.request.url && event.request.url.includes('/health')) {
          return null;
        }

        // Don't send 404 errors
        if (event.exception && event.exception.values) {
          const error = event.exception.values[0];
          if (error && error.value && error.value.includes('404')) {
            return null;
          }
        }

        return event;
      },
    });
    initialized = true;
  }
  return sdk;
}

/**
 * Kept for the 18 functions that call it at load. It no longer loads the
 * SDK; it only says whether errors will be reported.
 */
function initSentry() {
  return wanted() && process.env.NODE_ENV === 'production';
}

// Capture exception helper
function captureException(error, context = {}) {
  const sentry = getSentry();
  if (sentry) {
    sentry.captureException(error, {
      extra: context
    });
  } else {
    // console.error intentional: secure-logger requires sentry.js, so importing
    // createSecureLogger here would create a circular dependency.
    console.error('[sentry] Error captured:', error, context);
  }
}

// Capture message helper
function captureMessage(message, level = 'info', context = {}) {
  const sentry = getSentry();
  if (sentry) {
    sentry.captureMessage(message, {
      level,
      extra: context
    });
  } else {
    // console.log intentional: circular dependency with secure-logger (see above)
    console.log(`[sentry][${level.toUpperCase()}]`, message, context);
  }
}

// Set user context. Only once the SDK is running: loading it for context
// alone would bring back the start-up cost on every request.
function setUser(user) {
  if (sdk && initialized) sdk.setUser(user);
}

// Add breadcrumb (same rule as setUser: withErrorTracking calls this on
// every request, so it must not load the SDK).
function addBreadcrumb(breadcrumb) {
  if (sdk && initialized) sdk.addBreadcrumb(breadcrumb);
}

// Wrap async handler with error tracking
function withErrorTracking(handler) {
  return async (req, res) => {
    try {
      // Add request breadcrumb
      addBreadcrumb({
        category: 'http',
        message: `${req.method} ${req.url}`,
        level: 'info',
        data: {
          method: req.method,
          url: req.url,
          query: req.query
        }
      });

      return await handler(req, res);
    } catch (error) {
      captureException(error, {
        method: req.method,
        url: req.url,
        query: req.query,
        // Never send full body to Sentry — may contain passwords, tokens, PII
        bodyKeys: req.body ? Object.keys(req.body) : []
      });

      throw error;
    }
  };
}

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  addBreadcrumb,
  withErrorTracking,
  // The SDK itself, for code that needs it directly; loading it is the caller's cost.
  get Sentry() {
    return getSentry() || require('@sentry/node');
  },
};
