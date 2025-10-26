/**
 * Alert System for Critical Events
 *
 * Monitors metrics and triggers alerts for critical conditions:
 * - High error rates
 * - Slow response times
 * - System degradation
 * - Agent failures
 */

const { captureMessage } = require('./sentry');

// Alert thresholds
const THRESHOLDS = {
  ERROR_RATE: 0.2, // 20% error rate triggers alert
  HIGH_ERROR_RATE: 0.5, // 50% error rate triggers critical alert
  SLOW_RESPONSE_TIME: 2000, // 2 seconds
  VERY_SLOW_RESPONSE_TIME: 5000, // 5 seconds
  MEMORY_USAGE: 500, // 500 MB
  HIGH_MEMORY_USAGE: 800, // 800 MB
};

// Alert levels
const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Recent alerts tracking (to avoid spam)
const recentAlerts = new Map();
const ALERT_COOLDOWN = 300000; // 5 minutes

/**
 * Check if we should send an alert (avoid spam)
 */
function shouldSendAlert(alertKey) {
  const lastAlert = recentAlerts.get(alertKey);
  if (!lastAlert) {
    recentAlerts.set(alertKey, Date.now());
    return true;
  }

  const timeSinceLastAlert = Date.now() - lastAlert;
  if (timeSinceLastAlert > ALERT_COOLDOWN) {
    recentAlerts.set(alertKey, Date.now());
    return true;
  }

  return false;
}

/**
 * Send an alert
 */
function sendAlert(level, message, context = {}) {
  const alertKey = `${level}:${message}`;

  if (!shouldSendAlert(alertKey)) {
    console.log(`⏭️  Alert suppressed (cooldown): ${message}`);
    return false;
  }

  // Log to console
  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '🚨',
    critical: '🔴'
  }[level] || 'ℹ️';

  console.log(`${emoji} [ALERT:${level.toUpperCase()}] ${message}`, context);

  // Send to Sentry
  captureMessage(message, level, context);

  // In production, could also send to:
  // - Slack webhook
  // - Email
  // - SMS (Twilio)
  // - PagerDuty

  return true;
}

/**
 * Analyze metrics and trigger alerts
 */
function analyzeMetrics(metrics) {
  const alerts = [];

  if (!metrics || !metrics.summary) {
    return alerts;
  }

  const { summary, agentStats } = metrics;

  // Check overall error rate
  const errorRate = summary.totalCalls > 0
    ? (summary.failedCalls / summary.totalCalls)
    : 0;

  if (errorRate > THRESHOLDS.HIGH_ERROR_RATE) {
    sendAlert(
      ALERT_LEVELS.CRITICAL,
      `Critical: High error rate detected (${(errorRate * 100).toFixed(1)}%)`,
      { errorRate, totalCalls: summary.totalCalls, failedCalls: summary.failedCalls }
    );
    alerts.push({ level: 'critical', message: 'High error rate', errorRate });
  } else if (errorRate > THRESHOLDS.ERROR_RATE) {
    sendAlert(
      ALERT_LEVELS.WARNING,
      `Warning: Elevated error rate (${(errorRate * 100).toFixed(1)}%)`,
      { errorRate, totalCalls: summary.totalCalls }
    );
    alerts.push({ level: 'warning', message: 'Elevated error rate', errorRate });
  }

  // Check response times
  if (summary.p99ResponseTime > THRESHOLDS.VERY_SLOW_RESPONSE_TIME) {
    sendAlert(
      ALERT_LEVELS.ERROR,
      `Error: Very slow response times (P99: ${summary.p99ResponseTime}ms)`,
      { p99: summary.p99ResponseTime, avg: summary.avgResponseTime }
    );
    alerts.push({ level: 'error', message: 'Very slow response times', p99: summary.p99ResponseTime });
  } else if (summary.p99ResponseTime > THRESHOLDS.SLOW_RESPONSE_TIME) {
    sendAlert(
      ALERT_LEVELS.WARNING,
      `Warning: Slow response times (P99: ${summary.p99ResponseTime}ms)`,
      { p99: summary.p99ResponseTime }
    );
    alerts.push({ level: 'warning', message: 'Slow response times', p99: summary.p99ResponseTime });
  }

  // Check agent-specific metrics
  if (agentStats) {
    Object.entries(agentStats).forEach(([agentName, stats]) => {
      const agentErrorRate = 1 - (parseFloat(stats.successRate) / 100);

      if (agentErrorRate > THRESHOLDS.HIGH_ERROR_RATE) {
        sendAlert(
          ALERT_LEVELS.CRITICAL,
          `Critical: Agent ${agentName} has high error rate (${(agentErrorRate * 100).toFixed(1)}%)`,
          { agentName, errorRate: agentErrorRate, stats }
        );
        alerts.push({ level: 'critical', message: `Agent ${agentName} errors`, agentErrorRate });
      }
    });
  }

  return alerts;
}

/**
 * Check system health and alert if degraded
 */
function checkSystemHealth(health) {
  const alerts = [];

  if (!health) return alerts;

  // Check status
  if (health.status === 'unhealthy') {
    sendAlert(
      ALERT_LEVELS.CRITICAL,
      'Critical: System is unhealthy',
      { status: health.status, metrics: health.metrics }
    );
    alerts.push({ level: 'critical', message: 'System unhealthy' });
  } else if (health.status === 'degraded') {
    sendAlert(
      ALERT_LEVELS.WARNING,
      'Warning: System performance is degraded',
      { status: health.status, metrics: health.metrics }
    );
    alerts.push({ level: 'warning', message: 'System degraded' });
  }

  // Check memory usage
  if (health.memory && health.memory.used > THRESHOLDS.HIGH_MEMORY_USAGE) {
    sendAlert(
      ALERT_LEVELS.ERROR,
      `Error: High memory usage (${health.memory.used}MB)`,
      { memory: health.memory }
    );
    alerts.push({ level: 'error', message: 'High memory usage', memoryUsed: health.memory.used });
  } else if (health.memory && health.memory.used > THRESHOLDS.MEMORY_USAGE) {
    sendAlert(
      ALERT_LEVELS.WARNING,
      `Warning: Elevated memory usage (${health.memory.used}MB)`,
      { memory: health.memory }
    );
    alerts.push({ level: 'warning', message: 'Elevated memory usage', memoryUsed: health.memory.used });
  }

  // Check recent errors
  if (health.metrics && health.metrics.recentErrors > 10) {
    sendAlert(
      ALERT_LEVELS.WARNING,
      `Warning: High number of recent errors (${health.metrics.recentErrors})`,
      { recentErrors: health.metrics.recentErrors }
    );
    alerts.push({ level: 'warning', message: 'Many recent errors', count: health.metrics.recentErrors });
  }

  return alerts;
}

/**
 * Alert on specific events
 */
function alertOnEvent(eventType, data) {
  switch (eventType) {
    case 'agent_failure':
      sendAlert(
        ALERT_LEVELS.ERROR,
        `Agent failure: ${data.agentName} - ${data.error}`,
        data
      );
      break;

    case 'high_latency':
      sendAlert(
        ALERT_LEVELS.WARNING,
        `High latency detected: ${data.operation} took ${data.duration}ms`,
        data
      );
      break;

    case 'rate_limit':
      sendAlert(
        ALERT_LEVELS.WARNING,
        `Rate limit approaching: ${data.service}`,
        data
      );
      break;

    case 'database_error':
      sendAlert(
        ALERT_LEVELS.CRITICAL,
        `Database error: ${data.error}`,
        data
      );
      break;

    default:
      console.log(`Unknown event type: ${eventType}`, data);
  }
}

module.exports = {
  THRESHOLDS,
  ALERT_LEVELS,
  sendAlert,
  analyzeMetrics,
  checkSystemHealth,
  alertOnEvent
};
