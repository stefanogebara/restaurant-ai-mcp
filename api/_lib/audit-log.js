/**
 * Audit Logging
 *
 * Provides comprehensive audit logging for security-critical operations
 * Logs to console (in production, integrate with external logging service)
 */

const { sanitizeForLogging, sanitizeHeaders } = require('./secure-logger');

// Audit event types
const AUDIT_EVENTS = {
  // Authentication events
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  AUTH_PASSWORD_CHANGE: 'auth.password.change',

  // Reservation events
  RESERVATION_CREATE: 'reservation.create',
  RESERVATION_UPDATE: 'reservation.update',
  RESERVATION_CANCEL: 'reservation.cancel',
  RESERVATION_CHECK_IN: 'reservation.check_in',
  RESERVATION_ACCESS: 'reservation.access',

  // Table/Service events
  SERVICE_SEAT_PARTY: 'service.seat_party',
  SERVICE_COMPLETE: 'service.complete',
  TABLE_STATUS_CHANGE: 'table.status_change',

  // Waitlist events
  WAITLIST_ADD: 'waitlist.add',
  WAITLIST_SEAT: 'waitlist.seat',
  WAITLIST_REMOVE: 'waitlist.remove',

  // Admin events
  ADMIN_ACCESS: 'admin.access',
  ADMIN_CONFIG_CHANGE: 'admin.config_change',
  ADMIN_DATA_EXPORT: 'admin.data_export',

  // Security events
  SECURITY_RATE_LIMIT: 'security.rate_limit',
  SECURITY_INVALID_TOKEN: 'security.invalid_token',
  SECURITY_UNAUTHORIZED_ACCESS: 'security.unauthorized_access',
  SECURITY_SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
};

// Severity levels
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

/**
 * Get client IP from request
 * @param {object} req - Request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const vercelIp = req.headers['x-vercel-forwarded-for'];

  if (vercelIp) return vercelIp.split(',')[0].trim();
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  if (realIp) return realIp;

  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

/**
 * Generate request ID for correlation
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create audit log entry
 * @param {object} options - Audit log options
 * @returns {object} Audit log entry
 */
function createAuditEntry(options) {
  const {
    event,
    severity = SEVERITY.INFO,
    actor = null,
    resource = null,
    action = null,
    outcome = 'success',
    details = {},
    req = null,
  } = options;

  const entry = {
    timestamp: new Date().toISOString(),
    event,
    severity,
    outcome,
    actor: actor ? {
      id: actor.id || actor.sub || 'anonymous',
      email: actor.email || null,
      role: actor.role || 'user',
    } : { id: 'anonymous' },
    resource: resource ? sanitizeForLogging(resource) : null,
    action,
    details: sanitizeForLogging(details),
  };

  if (req) {
    entry.request = {
      id: req.requestId || generateRequestId(),
      method: req.method,
      path: req.url || req.path,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  return entry;
}

/**
 * Log audit event
 * @param {object} options - Audit log options
 */
function logAudit(options) {
  const entry = createAuditEntry(options);

  // Format for structured logging
  const logMessage = JSON.stringify({
    type: 'audit',
    ...entry,
  });

  // Log based on severity
  switch (entry.severity) {
    case SEVERITY.CRITICAL:
    case SEVERITY.ERROR:
      console.error(`[AUDIT] ${logMessage}`);
      break;
    case SEVERITY.WARNING:
      console.warn(`[AUDIT] ${logMessage}`);
      break;
    default:
      console.log(`[AUDIT] ${logMessage}`);
  }

  // In production, you would also send to external logging service here
  // e.g., sendToLogService(entry);

  return entry;
}

/**
 * Log authentication event
 * @param {string} eventType - Auth event type
 * @param {object} req - Request object
 * @param {object} user - User object (if authenticated)
 * @param {object} details - Additional details
 */
function logAuthEvent(eventType, req, user = null, details = {}) {
  const severity = eventType.includes('failure') ? SEVERITY.WARNING : SEVERITY.INFO;

  return logAudit({
    event: eventType,
    severity,
    actor: user,
    action: 'authenticate',
    outcome: eventType.includes('failure') ? 'failure' : 'success',
    details,
    req,
  });
}

/**
 * Log reservation event
 * @param {string} eventType - Reservation event type
 * @param {object} req - Request object
 * @param {object} reservation - Reservation data
 * @param {object} user - User performing action
 * @param {object} details - Additional details
 */
function logReservationEvent(eventType, req, reservation, user = null, details = {}) {
  return logAudit({
    event: eventType,
    severity: SEVERITY.INFO,
    actor: user,
    resource: {
      type: 'reservation',
      id: reservation?.reservation_id || reservation?.id,
      customer: reservation?.customer_name,
    },
    action: eventType.split('.').pop(),
    details: {
      party_size: reservation?.party_size,
      date: reservation?.date,
      time: reservation?.time,
      ...details,
    },
    req,
  });
}

/**
 * Log security event
 * @param {string} eventType - Security event type
 * @param {object} req - Request object
 * @param {object} details - Additional details
 */
function logSecurityEvent(eventType, req, details = {}) {
  const severity = eventType.includes('suspicious') ? SEVERITY.CRITICAL : SEVERITY.WARNING;

  return logAudit({
    event: eventType,
    severity,
    action: 'security_check',
    outcome: 'blocked',
    details,
    req,
  });
}

/**
 * Log admin event
 * @param {string} eventType - Admin event type
 * @param {object} req - Request object
 * @param {object} user - Admin user
 * @param {object} details - Additional details
 */
function logAdminEvent(eventType, req, user, details = {}) {
  return logAudit({
    event: eventType,
    severity: SEVERITY.WARNING, // Admin actions are always logged with higher severity
    actor: user,
    action: eventType.split('.').pop(),
    details,
    req,
  });
}

/**
 * Middleware to add request ID for audit correlation
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {function} next - Next middleware
 */
function auditMiddleware(req, res, next) {
  req.requestId = generateRequestId();
  res.setHeader('X-Request-ID', req.requestId);

  if (typeof next === 'function') {
    next();
  }
}

module.exports = {
  AUDIT_EVENTS,
  SEVERITY,
  logAudit,
  logAuthEvent,
  logReservationEvent,
  logSecurityEvent,
  logAdminEvent,
  auditMiddleware,
  createAuditEntry,
  getClientIP,
  generateRequestId,
};
