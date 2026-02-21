/**
 * Tests for api/_lib/alerts.js
 * Alert system with cooldown deduplication and metric analysis
 */

jest.mock('../_lib/sentry', () => ({
  captureMessage: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const {
  THRESHOLDS,
  ALERT_LEVELS,
  sendAlert,
  analyzeMetrics,
  checkSystemHealth,
  alertOnEvent,
} = require('../_lib/alerts');
const { captureMessage } = require('../_lib/sentry');

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// Constants
// ============================================================
describe('Alerts: Constants', () => {
  test('THRESHOLDS exports expected keys', () => {
    expect(THRESHOLDS).toHaveProperty('ERROR_RATE');
    expect(THRESHOLDS).toHaveProperty('HIGH_ERROR_RATE');
    expect(THRESHOLDS).toHaveProperty('SLOW_RESPONSE_TIME');
    expect(THRESHOLDS).toHaveProperty('VERY_SLOW_RESPONSE_TIME');
    expect(THRESHOLDS).toHaveProperty('MEMORY_USAGE');
    expect(THRESHOLDS.ERROR_RATE).toBe(0.2);
    expect(THRESHOLDS.HIGH_ERROR_RATE).toBe(0.5);
  });

  test('ALERT_LEVELS exports expected levels', () => {
    expect(ALERT_LEVELS.INFO).toBe('info');
    expect(ALERT_LEVELS.WARNING).toBe('warning');
    expect(ALERT_LEVELS.ERROR).toBe('error');
    expect(ALERT_LEVELS.CRITICAL).toBe('critical');
  });
});

// ============================================================
// sendAlert - cooldown deduplication
// ============================================================
describe('Alerts: sendAlert cooldown', () => {
  test('first call with unique key sends alert and returns true', () => {
    const result = sendAlert('info', 'unique-test-alert-001', { test: true });
    expect(result).toBe(true);
    expect(captureMessage).toHaveBeenCalledWith('unique-test-alert-001', 'info', { test: true });
  });

  test('second call with same key within cooldown is suppressed and returns false', () => {
    const msg = 'cooldown-dedup-test-message';
    const first = sendAlert('warning', msg, {});
    const second = sendAlert('warning', msg, {});
    expect(first).toBe(true);
    expect(second).toBe(false);
    // captureMessage called only once (first alert)
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  test('different messages are NOT deduplicated', () => {
    sendAlert('error', 'alert-msg-A-unique', {});
    sendAlert('error', 'alert-msg-B-unique', {});
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  test('different levels with same message are treated as different keys', () => {
    sendAlert('warning', 'level-test-unique-msg', {});
    sendAlert('error', 'level-test-unique-msg', {});
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// analyzeMetrics
// ============================================================
describe('Alerts: analyzeMetrics', () => {
  test('returns empty array for null input', () => {
    const result = analyzeMetrics(null);
    expect(result).toEqual([]);
  });

  test('returns empty array for metrics without summary', () => {
    const result = analyzeMetrics({ agentStats: {} });
    expect(result).toEqual([]);
  });

  test('returns empty array when error rate is below threshold', () => {
    const metrics = {
      summary: { totalCalls: 100, failedCalls: 10, p99ResponseTime: 500, avgResponseTime: 100 },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.find(a => a.message.includes('error rate'))).toBeUndefined();
  });

  test('triggers warning alert for elevated error rate (>20%)', () => {
    const metrics = {
      summary: {
        totalCalls: 100,
        failedCalls: 30, // 30% error rate
        p99ResponseTime: 500,
        avgResponseTime: 200,
      },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.some(a => a.level === 'warning' && a.message.includes('Elevated error rate'))).toBe(true);
  });

  test('triggers critical alert for high error rate (>50%)', () => {
    const metrics = {
      summary: {
        totalCalls: 100,
        failedCalls: 60, // 60% error rate
        p99ResponseTime: 500,
        avgResponseTime: 200,
      },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.some(a => a.level === 'critical')).toBe(true);
  });

  test('triggers warning for slow response time (>2s)', () => {
    const metrics = {
      summary: {
        totalCalls: 10,
        failedCalls: 0,
        p99ResponseTime: 3000, // 3 seconds
        avgResponseTime: 1000,
      },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.some(a => a.message.includes('Slow response times'))).toBe(true);
  });

  test('triggers error for very slow response time (>5s)', () => {
    const metrics = {
      summary: {
        totalCalls: 10,
        failedCalls: 0,
        p99ResponseTime: 6000, // 6 seconds
        avgResponseTime: 2000,
      },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.some(a => a.level === 'error' && a.message.includes('Very slow'))).toBe(true);
  });
});

// ============================================================
// checkSystemHealth
// ============================================================
describe('Alerts: checkSystemHealth', () => {
  test('returns empty array for null input', () => {
    const result = checkSystemHealth(null);
    expect(result).toEqual([]);
  });

  test('triggers critical alert for unhealthy status', () => {
    const health = { status: 'unhealthy', metrics: { recentErrors: 0 } };
    const alerts = checkSystemHealth(health);
    expect(alerts.some(a => a.level === 'critical' && a.message.includes('unhealthy'))).toBe(true);
  });

  test('triggers warning alert for degraded status', () => {
    const health = { status: 'degraded', metrics: { recentErrors: 0 } };
    const alerts = checkSystemHealth(health);
    expect(alerts.some(a => a.level === 'warning' && a.message.includes('degraded'))).toBe(true);
  });

  test('triggers error alert for high memory usage (>800MB)', () => {
    const health = {
      status: 'healthy',
      memory: { used: 900 },
      metrics: { recentErrors: 0 },
    };
    const alerts = checkSystemHealth(health);
    expect(alerts.some(a => a.level === 'error' && a.message.includes('High memory'))).toBe(true);
  });

  test('triggers warning for elevated memory usage (>500MB)', () => {
    const health = {
      status: 'healthy',
      memory: { used: 600 },
      metrics: { recentErrors: 0 },
    };
    const alerts = checkSystemHealth(health);
    expect(alerts.some(a => a.message.includes('Elevated memory'))).toBe(true);
  });
});

// ============================================================
// alertOnEvent
// ============================================================
describe('Alerts: alertOnEvent', () => {
  test('handles agent_failure event', () => {
    alertOnEvent('agent_failure', { agentName: 'voice-bot', error: 'Timeout' });
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('voice-bot'),
      'error',
      expect.any(Object)
    );
  });

  test('handles database_error event', () => {
    alertOnEvent('database_error', { error: 'Connection refused' });
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection refused'),
      'critical',
      expect.any(Object)
    );
  });

  test('handles high_latency event', () => {
    alertOnEvent('high_latency', { operation: 'supabase-query', duration: 3000 });
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('High latency'),
      'warning',
      expect.any(Object)
    );
  });

  test('handles rate_limit event', () => {
    alertOnEvent('rate_limit', { service: 'openai' });
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit'),
      'warning',
      expect.any(Object)
    );
  });

  test('handles unknown event type (default branch line 251)', () => {
    alertOnEvent('unknown_event_xyz', { foo: 'bar' });
    // No captureMessage for unknown events - just logged
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

// ============================================================
// shouldSendAlert - cooldown reset path (lines 49-50)
// ============================================================
describe('Alerts: shouldSendAlert cooldown reset', () => {
  test('re-sends alert after cooldown expires (lines 49-50)', () => {
    jest.useFakeTimers();

    const key = `info:cooldown-reset-test-${Date.now()}`;

    // First call – adds to map
    const first = sendAlert('info', `cooldown-reset-test-${Date.now()}`, {});
    expect(first).toBe(true);

    // Second call immediately – suppressed
    const second = sendAlert('info', `cooldown-reset-test-${Date.now() - 1}`, {});
    // Use a fresh unique key that has already been added
    const uniqueMsg = 'cooldown-reset-unique-msg';
    sendAlert('info', uniqueMsg, {});                // first call, added to map
    const suppressed = sendAlert('info', uniqueMsg, {}); // second call, suppressed
    expect(suppressed).toBe(false);

    // Advance time past ALERT_COOLDOWN (300_000 ms)
    jest.advanceTimersByTime(301000);

    // Third call after cooldown – should succeed (lines 49-50)
    const afterCooldown = sendAlert('info', uniqueMsg, {});
    expect(afterCooldown).toBe(true);

    jest.useRealTimers();
  });
});

// ============================================================
// analyzeMetrics - agentStats with high error rate (lines 141-150)
// ============================================================
describe('Alerts: analyzeMetrics agentStats', () => {
  test('triggers critical alert for agent with high error rate (lines 141-150)', () => {
    const metrics = {
      summary: {
        totalCalls: 100,
        failedCalls: 10,
        successRate: 90,
        p99ResponseTime: 100,
      },
      agentStats: {
        'voice-bot': { successRate: '40' },  // 60% error rate > 0.5 threshold
      },
    };
    const alerts = analyzeMetrics(metrics);
    expect(alerts.some(a => a.level === 'critical' && a.message.includes('voice-bot'))).toBe(true);
  });
});

// ============================================================
// checkSystemHealth - recentErrors > 10 (lines 202-207)
// ============================================================
describe('Alerts: checkSystemHealth recentErrors', () => {
  test('triggers warning for high recent errors (lines 202-207)', () => {
    const health = {
      status: 'healthy',
      memory: { used: 100 },
      metrics: { recentErrors: 15 },
    };
    const alerts = checkSystemHealth(health);
    expect(alerts.some(a => a.level === 'warning' && a.message.includes('recent errors'))).toBe(true);
  });
});
