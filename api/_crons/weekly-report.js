/**
 * Weekly Report Cron — Sends PDF weekly reports to opted-in restaurants
 *
 * Schedule: Daily at 8:30 AM UTC (via vercel.json).
 * Each restaurant chooses its delivery day via notification_preferences.weekly_report_day
 * (0=Sunday..6=Saturday). Day comparison uses the restaurant's timezone, so a Madrid
 * restaurant's "Monday" fires at 08:30 UTC = 10:30 Madrid — which is still Monday there.
 * Default weekly_report_day=1 (Monday) when unset, preserving prior behavior.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun } = require('../_lib/cron-tracker');
const { sendWeeklyReportViaWhatsApp } = require('../_services/pdfReportService');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('WeeklyReportCron');

/** Day-of-week 0-6 (Sunday-Saturday) in the given IANA timezone. */
function dayOfWeekInTz(tz) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short' });
  const day = fmt.format(new Date());
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[day] ?? new Date().getUTCDay();
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: configs, error: queryErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, manager_phone, manager_whatsapp_verified, notification_preferences, agent_language, timezone')
      .not('manager_phone', 'is', null);

    if (queryErr) {
      logger.error('Weekly report query error', { error: queryErr.message });
    }

    const eligible = (configs || []).filter(c => {
      if (c.manager_whatsapp_verified !== true) return false;
      const prefs = c.notification_preferences || {};
      if (prefs.weekly_report_whatsapp !== true) return false;
      const configuredDay = Number.isInteger(prefs.weekly_report_day) ? prefs.weekly_report_day : 1; // default Monday
      return dayOfWeekInTz(c.timezone) === configuredDay;
    });

    logger.info('Weekly report cron starting', { eligible: eligible.length });

    let sent = 0;
    for (const config of eligible) {
      try {
        const language = config.agent_language || 'pt-BR';
        const result = await sendWeeklyReportViaWhatsApp(config.id, config.manager_phone, language);

        if (result.success) {
          sent++;
          logger.info(`Weekly report sent: ${config.restaurant_name}`);
        } else {
          logger.warn(`Weekly report failed: ${config.restaurant_name}`, { error: result.error });
        }
      } catch (err) {
        logger.error('Weekly report error for restaurant', { restaurantId: config.id, error: err.message });
      }
    }

    await logCronRun('weekly-report', { sent, total: eligible.length });

    return res.status(200).json({ success: true, sent, total: eligible.length });
  } catch (err) {
    logger.error('Weekly report cron error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
