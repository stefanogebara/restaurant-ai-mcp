'use strict';

/**
 * WAHA Pipeline Status — /api/waha-status
 *
 * Returns last 24h message processing metrics: total volume, success rate,
 * error breakdown, average latency, and per-hour throughput.
 * Secured with CRON_SECRET Bearer token.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setWebhookCors } = require('./_lib/cors');

const logger = createSecureLogger('WahaStatus');

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabaseAdmin
      .from('waha_events')
      .select('event_type, duration_ms, error_msg, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = events || [];

    const byType = {};
    let totalDurationMs = 0;
    let processedCount = 0;

    for (const row of rows) {
      byType[row.event_type] = (byType[row.event_type] || 0) + 1;
      if (row.event_type === 'processed' && row.duration_ms != null) {
        totalDurationMs += row.duration_ms;
        processedCount++;
      }
    }

    const received = byType.received || 0;
    const processed = byType.processed || 0;
    const failed = byType.failed || 0;
    const duplicate = byType.duplicate || 0;
    const rateLimited = byType.rate_limited || 0;
    const sigInvalid = byType.sig_invalid || 0;

    const successRate = received > 0
      ? Math.round((processed / received) * 100)
      : null;

    const avgLatencyMs = processedCount > 0
      ? Math.round(totalDurationMs / processedCount)
      : null;

    // Hourly throughput (last 24h)
    const hourly = {};
    for (const row of rows) {
      if (row.event_type !== 'received') continue;
      const hour = new Date(row.created_at).toISOString().slice(0, 13) + ':00Z';
      hourly[hour] = (hourly[hour] || 0) + 1;
    }

    // Recent errors
    const recentErrors = rows
      .filter(r => r.event_type === 'failed' && r.error_msg)
      .slice(0, 5)
      .map(r => ({ error: r.error_msg, at: r.created_at }));

    return res.status(200).json({
      window: '24h',
      since,
      totals: {
        received,
        processed,
        failed,
        duplicate,
        rate_limited: rateLimited,
        sig_invalid: sigInvalid,
      },
      success_rate_pct: successRate,
      avg_latency_ms: avgLatencyMs,
      hourly_received: hourly,
      recent_errors: recentErrors,
    });
  } catch (err) {
    logger.error('waha-status failed:', err.message);
    return res.status(500).json({ error: 'Status query failed' });
  }
};
