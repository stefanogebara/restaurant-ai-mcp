/**
 * Cron: Send Post-Visit Surveys
 *
 * Runs every 30 minutes. Finds completed services past the configured
 * delay and sends a WhatsApp survey message asking the customer to
 * rate their experience 1-5.
 *
 * Requires: restaurant.survey_responses table + survey_sent_at column
 * on public.service_records.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CronSendSurveys');

const BATCH_SIZE = 30;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!isWhatsAppConfigured()) {
    logger.info('WhatsApp not configured, skipping survey sends');
    return res.status(200).json({ success: true, sent: 0, reason: 'whatsapp_not_configured' });
  }

  // Phase U.3 kill switch — hourly fire × BATCH_SIZE=30 surveys/run
  // is up to 720 messages/day. Ops can stop a misbehaving survey
  // template (wrong copy, broken link) within the next hour.
  if (!(await isCronEnabled('send-surveys'))) {
    logger.warn('send-surveys cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const sent = await sendPendingSurveys();
    logger.info('send-surveys cron complete', { sent });
    await logCronRun('send-surveys', { sent });
    return res.status(200).json({ success: true, sent });
  } catch (error) {
    logger.error('send-surveys cron error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Survey sending failed' });
  }
};

async function sendPendingSurveys() {
  // 1. Get all restaurants with surveys enabled
  const { data: configs, error: cfgErr } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, survey_config, restaurant_name')
    .not('survey_config', 'is', null);

  if (cfgErr || !configs?.length) {
    if (cfgErr) logger.error('Failed to fetch survey configs', { error: cfgErr.message });
    return 0;
  }

  const enabledRestaurants = configs.filter(c => c.survey_config?.enabled);
  if (!enabledRestaurants.length) return 0;

  let totalSent = 0;

  for (const restaurant of enabledRestaurants) {
    const delayHours = restaurant.survey_config.delay_hours || 2;
    const question = restaurant.survey_config.question || 'Como foi sua experiencia?';
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();

    // 2. Find completed services past the delay, not yet surveyed
    const { data: eligible, error: svcErr } = await supabaseAdmin
      .from('service_records')
      .select('id, customer_phone, customer_name, reservation_id, actual_departure')
      .eq('restaurant_id', restaurant.id)
      .eq('status', 'completed')
      .not('customer_phone', 'is', null)
      .is('survey_sent_at', null)
      .lte('actual_departure', cutoff)
      .order('actual_departure', { ascending: true })
      .limit(BATCH_SIZE);

    if (svcErr) {
      logger.error('Failed to fetch eligible services', {
        restaurantId: restaurant.id,
        error: svcErr.message,
      });
      continue;
    }

    if (!eligible?.length) continue;

    // 3. Send survey messages
    for (const svc of eligible) {
      const phone = svc.customer_phone.replace(/\D/g, '');
      if (phone.length < 10) continue;

      const name = svc.customer_name || '';
      const greeting = name ? `Ola ${name}! ` : 'Ola! ';
      const restaurantName = restaurant.restaurant_name || 'nosso restaurante';

      const message = [
        `${greeting}Obrigado por visitar ${restaurantName}.`,
        '',
        question,
        '',
        'Responda com um numero de 1 a 5:',
        '1 - Ruim',
        '2 - Regular',
        '3 - Bom',
        '4 - Muito bom',
        '5 - Excelente',
        '',
        'Voce tambem pode enviar um comentario apos a nota.',
      ].join('\n');

      const result = await sendWhatsAppMessage(phone, message);

      if (result.success) {
        // Mark as sent
        await supabaseAdmin
          .from('service_records')
          .update({ survey_sent_at: new Date().toISOString() })
          .eq('id', svc.id);

        totalSent++;
        logger.info('Survey sent', {
          restaurantId: restaurant.id,
          serviceId: svc.id,
          phone: phone.slice(0, 4) + '****',
        });
      } else {
        logger.warn('Survey send failed', {
          serviceId: svc.id,
          error: result.error,
        });
      }
    }
  }

  return totalSent;
}
