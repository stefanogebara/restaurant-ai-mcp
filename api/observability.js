/**
 * Observability API - Vercel Serverless Function
 *
 * Provides endpoints for monitoring agent performance, error tracking,
 * and system metrics (Week 7-8: Observability)
 *
 * Routes handled via ?action= query parameter:
 * - GET ?action=metrics - Get aggregated metrics
 * - GET ?action=health - Get system health
 * - GET ?action=errors - Get recent errors
 * - POST - Log an event
 */

const { initSentry, captureException } = require('./_lib/sentry');
const { analyzeMetrics, checkSystemHealth } = require('./_lib/alerts');

// Initialize Sentry error tracking
initSentry();

// In-memory metrics storage (would use database/Redis in production)
const metrics = {
  agentCalls: [],
  toolUsage: [],
  errors: [],
  startTime: Date.now()
};

const MAX_LOG_SIZE = 10000;

function trimLogs(logs) {
  if (logs.length > MAX_LOG_SIZE) {
    logs.splice(0, logs.length - MAX_LOG_SIZE);
  }
}

function calculateMetrics(timeWindow = 3600000, endTime = Date.now()) {
  const cutoffStart = new Date(endTime - timeWindow);
  const cutoffEnd = new Date(endTime);

  const recentCalls = metrics.agentCalls.filter(c => {
    const timestamp = new Date(c.timestamp);
    return timestamp >= cutoffStart && timestamp <= cutoffEnd;
  });
  const recentToolUsage = metrics.toolUsage.filter(t => {
    const timestamp = new Date(t.timestamp);
    return timestamp >= cutoffStart && timestamp <= cutoffEnd;
  });
  const recentErrors = metrics.errors.filter(e => {
    const timestamp = new Date(e.timestamp);
    return timestamp >= cutoffStart && timestamp <= cutoffEnd;
  });

  const totalCalls = recentCalls.length;
  const successfulCalls = recentCalls.filter(c => c.success).length;
  const failedCalls = recentCalls.filter(c => !c.success).length;

  // Response time percentiles
  const responseTimes = recentCalls.map(c => c.duration).sort((a, b) => a - b);
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;
  const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
  const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

  // Agent-specific stats
  const agentStats = {};
  const agentNames = [...new Set(recentCalls.map(c => c.agentName))];

  agentNames.forEach(name => {
    const agentCalls = recentCalls.filter(c => c.agentName === name);
    const agentTools = recentToolUsage.filter(t => t.agentName === name);

    const toolUsageCount = {};
    agentTools.forEach(t => {
      toolUsageCount[t.toolName] = (toolUsageCount[t.toolName] || 0) + 1;
    });

    agentStats[name] = {
      totalCalls: agentCalls.length,
      successRate: agentCalls.length > 0
        ? ((agentCalls.filter(c => c.success).length / agentCalls.length) * 100).toFixed(2)
        : '0.00',
      avgResponseTime: agentCalls.length > 0
        ? Math.round(agentCalls.reduce((sum, c) => sum + c.duration, 0) / agentCalls.length)
        : 0,
      toolUsageCount
    };
  });

  // Top errors
  const errorPatterns = {};
  recentErrors.forEach(e => {
    const pattern = e.error || 'Unknown error';
    errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
  });

  const topErrors = Object.entries(errorPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([error, count]) => ({ error, count }));

  return {
    timeWindow,
    summary: {
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate: totalCalls > 0 ? ((successfulCalls / totalCalls) * 100).toFixed(2) : '0.00',
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: Math.round(p95),
      p99ResponseTime: Math.round(p99)
    },
    agentStats,
    topErrors,
    toolUsage: recentToolUsage.slice(-20).reverse()
  };
}

function getSystemHealth() {
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);

  const recentCalls = metrics.agentCalls.filter(
    c => new Date(c.timestamp) > new Date(Date.now() - 300000)
  );
  const errorRate = recentCalls.length > 0
    ? (recentCalls.filter(c => !c.success).length / recentCalls.length)
    : 0;

  let status = 'healthy';
  if (errorRate > 0.5) status = 'degraded';
  if (errorRate > 0.8) status = 'unhealthy';

  return {
    status,
    uptime,
    timestamp: new Date(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    cpu: process.cpuUsage(),
    metrics: {
      totalCalls: metrics.agentCalls.length,
      totalErrors: metrics.errors.length,
      recentErrors: metrics.errors.filter(
        e => new Date(e.timestamp) > new Date(Date.now() - 300000)
      ).length
    }
  };
}

function getRecentErrors(limit = 50) {
  return {
    total: metrics.errors.length,
    errors: metrics.errors
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  const { action } = req.query;

  try {
    // GET requests
    if (req.method === 'GET') {
      switch (action) {
        case 'metrics': {
          const timeWindow = parseInt(req.query.timeWindow) || 3600000;
          const data = calculateMetrics(timeWindow);

          // Analyze metrics and trigger alerts
          analyzeMetrics(data);

          return res.status(200).json(data);
        }

        case 'health': {
          const health = getSystemHealth();

          // Check system health and trigger alerts
          checkSystemHealth(health);

          return res.status(200).json(health);
        }

        case 'errors': {
          const limit = parseInt(req.query.limit) || 50;
          const errors = getRecentErrors(limit);
          return res.status(200).json(errors);
        }

        case 'trends': {
          const timeWindow = parseInt(req.query.timeWindow) || 3600000;
          const currentMetrics = calculateMetrics(timeWindow);
          const previousMetrics = calculateMetrics(timeWindow, Date.now() - timeWindow);

          const trends = {
            totalCalls: {
              current: currentMetrics.summary.totalCalls,
              previous: previousMetrics.summary.totalCalls,
              change: currentMetrics.summary.totalCalls - previousMetrics.summary.totalCalls,
              percentChange: previousMetrics.summary.totalCalls > 0
                ? ((currentMetrics.summary.totalCalls - previousMetrics.summary.totalCalls) / previousMetrics.summary.totalCalls * 100).toFixed(1)
                : '0'
            },
            successRate: {
              current: parseFloat(currentMetrics.summary.successRate),
              previous: parseFloat(previousMetrics.summary.successRate),
              change: (parseFloat(currentMetrics.summary.successRate) - parseFloat(previousMetrics.summary.successRate)).toFixed(2),
              trend: parseFloat(currentMetrics.summary.successRate) >= parseFloat(previousMetrics.summary.successRate) ? 'up' : 'down'
            },
            avgResponseTime: {
              current: currentMetrics.summary.avgResponseTime,
              previous: previousMetrics.summary.avgResponseTime,
              change: currentMetrics.summary.avgResponseTime - previousMetrics.summary.avgResponseTime,
              percentChange: previousMetrics.summary.avgResponseTime > 0
                ? ((currentMetrics.summary.avgResponseTime - previousMetrics.summary.avgResponseTime) / previousMetrics.summary.avgResponseTime * 100).toFixed(1)
                : '0',
              trend: currentMetrics.summary.avgResponseTime <= previousMetrics.summary.avgResponseTime ? 'up' : 'down'
            },
            errorRate: {
              current: currentMetrics.summary.failedCalls,
              previous: previousMetrics.summary.failedCalls,
              change: currentMetrics.summary.failedCalls - previousMetrics.summary.failedCalls,
              trend: currentMetrics.summary.failedCalls <= previousMetrics.summary.failedCalls ? 'up' : 'down'
            }
          };

          return res.status(200).json(trends);
        }

        default:
          return res.status(400).json({ error: 'Invalid action. Use: metrics, health, errors, or trends' });
      }
    }

    // POST requests - Log an event
    if (req.method === 'POST') {
      const { type, data } = req.body;

      if (!type || !data) {
        return res.status(400).json({ error: 'Missing type or data' });
      }

      const logEntry = {
        ...data,
        timestamp: new Date()
      };

      switch (type) {
        case 'agent_call':
          metrics.agentCalls.push(logEntry);
          trimLogs(metrics.agentCalls);
          break;

        case 'tool_usage':
          metrics.toolUsage.push(logEntry);
          trimLogs(metrics.toolUsage);
          break;

        case 'error':
          metrics.errors.push(logEntry);
          trimLogs(metrics.errors);
          break;

        default:
          return res.status(400).json({ error: 'Unknown log type' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Observability API error:', error);

    // Capture error in Sentry
    captureException(error, {
      action: req.query.action,
      method: req.method,
      url: req.url
    });

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
