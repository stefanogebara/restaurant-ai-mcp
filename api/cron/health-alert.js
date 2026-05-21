/**
 * Cron Health Alert — Daily WhatsApp alert if crons are unhealthy
 *
 * Schedule: Daily at 10 UTC (7 AM BRT)
 * Only sends a WhatsApp message when overall status is 'degraded' or 'critical'.
 *
 * Requires: CRON_SECRET, HEALTH_ALERT_PHONE env vars
 */

const { checkCronHealth } = require('./health');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { logCronRun } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');
const { isCronEnabled } = require('../_lib/cron-config');

const logger = createSecureLogger('CronHealthAlert');

function buildAlertMessage(healthResult) {
  const { overall, summary, jobs } = healthResult;

  const staleJobs = jobs.filter(j => j.status === 'stale');
  const errorJobs = jobs.filter(j => j.errors_14d > 0);

  const lines = [
    `*Cron Health Alert*`,
    `Status: ${overall.toUpperCase()}`,
    ``,
    `Healthy: ${summary.healthy} | Stale: ${summary.stale} | Never run: ${summary.never_run} | Errors (14d): ${summary.errors_14d}`,
  ];

  if (staleJobs.length > 0) {
    lines.push('', '*Stale jobs:*');
    for (const job of staleJobs) {
      lines.push(`  - ${job.name} (last: ${job.age || 'never'})`);
    }
  }

  if (errorJobs.length > 0) {
    lines.push('', '*Jobs with errors (14d):*');
    for (const job of errorJobs) {
      lines.push(`  - ${job.name}: ${job.errors_14d} errors`);
    }
  }

  return lines.join('\n');
}

module.exports = async (req, res) => {
  // Auth: CRON_SECRET only
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase Y.5 kill switch.
  if (!(await isCronEnabled('health-alert'))) {
    logger.warn('health-alert cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const healthResult = await checkCronHealth();

    if (!healthResult) {
      logger.warn('Could not run health check — DB unavailable');
      return res.status(200).json({ skipped: true, reason: 'DB unavailable' });
    }

    const { overall } = healthResult;
    const shouldAlert = overall === 'degraded' || overall === 'critical';

    if (!shouldAlert) {
      logger.info('Cron health OK, no alert needed', { overall });
      await logCronRun('health-alert', { overall, alerted: false });
      return res.status(200).json({ overall, alerted: false });
    }

    // Send WhatsApp alert
    const alertPhone = process.env.HEALTH_ALERT_PHONE;
    let sent = false;

    if (alertPhone && isWhatsAppConfigured()) {
      const message = buildAlertMessage(healthResult);
      const result = await sendWhatsAppMessage(alertPhone, message);
      sent = result.success;

      if (!result.success) {
        logger.warn('Failed to send health alert WhatsApp', { error: result.error });
      }
    } else {
      logger.warn('Health alert not sent — HEALTH_ALERT_PHONE or WhatsApp not configured');
    }

    logger.info('Cron health alert processed', { overall, sent });
    await logCronRun('health-alert', { overall, alerted: true, whatsapp_sent: sent });

    return res.status(200).json({
      overall,
      alerted: true,
      whatsapp_sent: sent,
      summary: healthResult.summary,
    });
  } catch (err) {
    logger.error('Health alert failed', { error: err.message });
    return res.status(500).json({ error: 'Health alert failed' });
  }
};
