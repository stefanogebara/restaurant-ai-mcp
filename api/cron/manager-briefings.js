const { supabaseAdmin } = require('../_lib/supabase');
const { runManagerAgent } = require('../_lib/manager-agent');
const { sendBriefing } = require('../_lib/briefing-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getVIPsForToday } = require('../services/restaurantSnapshot');
const { logCronRun } = require('../_lib/cron-tracker');

const logger = createSecureLogger('manager-briefings');

const BRIEFING_PROMPTS = {
  end_of_day: 'Give me a concise end-of-day briefing: covers served, notable events, anything to prepare for tomorrow.',
  morning: 'Give me a morning briefing: reservations today, any upcoming events or prep I should know about.',
};

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const type = req.query.type || 'end_of_day';
  const prompt = BRIEFING_PROMPTS[type] || BRIEFING_PROMPTS.end_of_day;
  const prefKey = type === 'morning' ? 'morning_briefing' : 'end_of_day_briefing';

  try {
    const { data: configs, error: queryErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, manager_phone, manager_whatsapp_verified, notification_preferences, restaurant_name, restaurant_profile, ai_strategy_doc')
      .not('manager_phone', 'is', null);

    if (queryErr) {
      logger.error('Briefing query error', { error: queryErr.message });
    }

    // Filter in JS: verified + has the right preference enabled
    const eligible = (configs || []).filter((c) =>
      c.manager_whatsapp_verified === true && c.notification_preferences?.[prefKey]
    );

    // Debug: always return diagnostics
    if (eligible.length === 0) {
      return res.json({
        sent: 0,
        total: 0,
        _diag: {
          prefKey,
          configCount: configs?.length ?? -1,
          queryErr: queryErr?.message || null,
          dataIsNull: configs === null,
          rows: (configs || []).slice(0, 3).map(c => ({
            id: c.id?.slice(0, 8),
            verified: c.manager_whatsapp_verified,
            pref: c.notification_preferences?.[prefKey],
          })),
        },
      });
    }

    let sent = 0;
    for (const config of eligible) {
      try {
        let promptToSend = prompt;

        // Inject restaurant identity into briefing context
        const profile = config.restaurant_profile;
        if (profile?.communication_style?.tone) {
          promptToSend += `\n\nAdapt your tone to: ${profile.communication_style.tone}.`;
        }
        if (config.restaurant_name) {
          promptToSend += `\nRestaurant: ${config.restaurant_name}.`;
        }

        if (type === 'morning') {
          const vips = await getVIPsForToday(config.id).catch(() => []);
          if (vips.length > 0) {
            const vipLines = vips
              .map(v => `- ${v.customer_name || v.customer_phone} (${v.customer_tier}, ${v.total_visits} visits)`)
              .join('\n');
            promptToSend += `\n\n[VIP GUESTS TODAY]\n${vipLines}`;
          }
        }

        // Inject owner strategy + ask for suggestions at end of day
        if (config.ai_strategy_doc) {
          promptToSend += `\n\n[OWNER STRATEGY]\n${config.ai_strategy_doc}`;
          if (type === 'end_of_day') {
            promptToSend += '\n\nBased on today\'s data and the owner strategy above, end your briefing with 1-2 specific strategy suggestions: what to adjust, why, and what outcome to expect. Label this section "[STRATEGY SUGGESTIONS]".';
          }
        }

        const briefing = await runManagerAgent(config.id, promptToSend, 'whatsapp');
        await sendBriefing(
          config.manager_phone,
          briefing,
          config.notification_preferences?.briefing_channel || 'text',
          config.id
        );
        sent++;
      } catch (err) {
        logger.error('briefing failed', { restaurantId: config.id, error: err.message });
      }
    }

    const jobName = type === 'morning' ? 'manager-briefings-morning' : 'manager-briefings-eod';
    await logCronRun(jobName, { sent, total: eligible.length });

    return res.json({ sent, total: eligible.length });
  } catch (err) {
    logger.error('manager-briefings cron error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
