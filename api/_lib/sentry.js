/**
 * Sentry Error Tracking Configuration
 *
 * Initializes Sentry for backend error tracking and performance monitoring
 */

const Sentry = require('@sentry/node');

// Initialize Sentry (only in production)
function initSentry() {
  if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',

      // Performance Monitoring
      tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring

      // Release tracking
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',

      // Error filtering
      beforeSend(event, hint) {
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

      // Integrations
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
    });

    console.log('✅ Sentry initialized for error tracking');
    return true;
  }

  console.log('ℹ️ Sentry not initialized (missing SENTRY_DSN or not in production)');
  return false;
}

// Capture exception helper
function captureException(error, context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context
    });
  } else {
    // Log to console in development
    console.error('Error captured:', error, context);
  }
}

// Capture message helper
function captureMessage(message, level = 'info', context = {}) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, {
      level,
      extra: context
    });
  } else {
    console.log(`[${level.toUpperCase()}]`, message, context);
  }
}

// Set user context
function setUser(user) {
  if (process.env.SENTRY_DSN) {
    Sentry.setUser(user);
  }
}

// Add breadcrumb
function addBreadcrumb(breadcrumb) {
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb(breadcrumb);
  }
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
        body: req.body
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
  Sentry
};
