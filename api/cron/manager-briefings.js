const { supabaseAdmin } = require('../_lib/supabase');
const { runManagerAgent } = require('../_lib/manager-agent');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('manager-briefings');

const BRIEFING_PROMPTS = {
  end_of_day: 'Give me a concise end-of-day briefing: covers served, notable events, anything to prepare for tomorrow.',
  morning: 'Give me a morning briefing: reservations today, any upcoming events or prep I should know about.',
};

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.replace('Bearer ', '') !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const type = req.query.type || 'end_of_day';
  const prompt = BRIEFING_PROMPTS[type] || BRIEFING_PROMPTS.end_of_day;
  const prefKey = type === 'morning' ? 'morning_briefing' : 'end_of_day_briefing';

  try {
    const { data: configs } = await supabaseAdmin
      .from('restaurant_config')
      .select('id, manager_phone, notification_preferences')
      .eq('manager_whatsapp_verified', true)
      .not('manager_phone', 'is', null);

    const eligible = (configs || []).filter((c) => c.notification_preferences?.[prefKey]);

    let sent = 0;
    for (const config of eligible) {
      try {
        const briefing = await runManagerAgent(config.id, prompt, 'whatsapp');
        await sendWhatsAppMessage(config.manager_phone, briefing, config.id);
        sent++;
      } catch (err) {
        logger.error('briefing failed', { restaurantId: config.id, error: err.message });
      }
    }

    return res.json({ sent, total: eligible.length });
  } catch (err) {
    logger.error('manager-briefings cron error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
