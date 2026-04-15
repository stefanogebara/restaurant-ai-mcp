/**
 * Weekly Report Cron — Sends PDF weekly reports to opted-in restaurants
 *
 * Schedule: Every Monday at 8:30 AM (via vercel.json)
 *
 * Loops over restaurants that have `weekly_report_whatsapp: true` in their
 * notification_preferences and sends each a PDF report via WhatsApp.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun } = require('../_lib/cron-tracker');
const { sendWeeklyReportViaWhatsApp } = require('../services/pdfReportService');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('WeeklyReportCron');

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
      .select('id, restaurant_name, manager_phone, manager_whatsapp_verified, notification_preferences, agent_language')
      .not('manager_phone', 'is', null);

    if (queryErr) {
      logger.error('Weekly report query error', { error: queryErr.message });
    }

    const eligible = (configs || []).filter(
      c =>
        c.manager_whatsapp_verified === true &&
        c.notification_preferences?.weekly_report_whatsapp === true
    );

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
