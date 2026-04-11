const { supabaseAdmin } = require('../_lib/supabase');
const { runManagerAgent } = require('../_lib/manager-agent');
const { sendBriefing } = require('../_lib/briefing-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getVIPsForToday } = require('../services/restaurantSnapshot');
const { logCronRun } = require('../_lib/cron-tracker');
const { isWhatsAppConfigured, sendWhatsAppImageMessage } = require('../_lib/whatsapp-sender');
const { buildWeeklyReservationsChart, buildNoShowChart } = require('../services/chartService');

const logger = createSecureLogger('manager-briefings');

const BRIEFING_PROMPTS = {
  end_of_day: {
    en: 'Give me a concise end-of-day briefing: covers served, notable events, anything to prepare for tomorrow.',
    'pt-BR': 'Me da um resumo conciso do fim do dia: covers servidos, eventos notaveis, e o que preparar para amanha.',
    es: 'Dame un resumen conciso del fin del dia: cubiertos servidos, eventos notables, y que preparar para manana.',
  },
  morning: {
    en: 'Give me a morning briefing: reservations today, any upcoming events or prep I should know about.',
    'pt-BR': 'Me da o briefing da manha: reservas de hoje, eventos ou preparativos que eu deva saber.',
    es: 'Dame el briefing de la manana: reservas de hoy, eventos o preparativos que deba saber.',
  },
};

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const type = req.query.type || 'end_of_day';
  const promptSet = BRIEFING_PROMPTS[type] || BRIEFING_PROMPTS.end_of_day;
  const prefKey = type === 'morning' ? 'morning_briefing' : 'end_of_day_briefing';

  try {
    const { data: configs, error: queryErr } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, manager_phone, manager_whatsapp_verified, notification_preferences, restaurant_name, agent_language')
      .not('manager_phone', 'is', null);

    if (queryErr) {
      logger.error('Briefing query error', { error: queryErr.message });
    }

    // Filter in JS: verified + has the right preference enabled
    const eligible = (configs || []).filter((c) =>
      c.manager_whatsapp_verified === true && c.notification_preferences?.[prefKey]
    );

    const MAX_RESTAURANTS = 3;
    const PER_RESTAURANT_TIMEOUT = 25000; // 25s per restaurant, fits 2-3 in 60s
    const startTime = Date.now();

    let sent = 0;
    for (const config of eligible.slice(0, MAX_RESTAURANTS)) {
      // Time budget guard: stop if less than 15s remaining
      if (Date.now() - startTime > 45000) {
        logger.warn('Time budget exceeded, stopping briefings', { sent, remaining: eligible.length - sent });
        break;
      }

      try {
        const lang = config.agent_language || 'pt-BR';

        // For morning briefings on new restaurants with zero reservations, skip the AI call
        // and send a purposeful setup guide instead.
        if (type === 'morning') {
          const { count: reservationCount } = await supabaseAdmin
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('restaurant_id', config.id);

          if ((reservationCount ?? 0) === 0) {
            const onboardingMessages = {
              'pt-BR': `Bom dia! Seu restaurante ainda não tem reservas. Para começar a receber:\n\n1. Compartilhe seu link: seatable.one/book/seu-slug\n2. Coloque o link na bio do Instagram e no Google Meu Negócio\n3. Ative o WhatsApp nas configurações para receber reservas via mensagem\n\nTudo pronto para quando o primeiro cliente chegar.`,
              es: `¡Buenos días! Tu restaurante aún no tiene reservas. Para empezar:\n\n1. Comparte tu enlace de reservas en Instagram y Google\n2. Activa WhatsApp en configuración para recibir reservas por mensaje\n3. Prueba hacer una reserva de prueba tú mismo\n\nListo para cuando llegue el primer cliente.`,
              en: `Good morning! Your restaurant has no reservations yet. To start receiving them:\n\n1. Share your booking link on Instagram and Google\n2. Enable WhatsApp in settings to accept bookings by message\n3. Make a test booking yourself to verify the flow\n\nEverything is set up and ready for your first guest.`,
            };
            const message = onboardingMessages[lang] || onboardingMessages['en'];
            await sendBriefing(config.manager_phone, message, 'text', config.id);
            sent++;
            logger.info(`Sent onboarding briefing to new restaurant: ${config.restaurant_name}`);
            continue;
          }
        }

        // Select prompt in the restaurant's configured language
        let promptToSend = promptSet[lang] || promptSet['en'];

        // Inject restaurant identity into briefing context
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

        // Strategy suggestions for end of day
        if (type === 'end_of_day') {
          promptToSend += '\n\nEnd your briefing with 1-2 specific suggestions: what to adjust, why, and expected outcome.';
        }

        const briefing = await Promise.race([
          runManagerAgent(config.id, promptToSend, 'whatsapp'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing timeout')), PER_RESTAURANT_TIMEOUT))
        ]);

        // Dedup: skip if identical to last briefing (e.g. "0 reservations" every day)
        const { data: lastMsg } = await supabaseAdmin
          .from('manager_conversations')
          .select('content')
          .eq('restaurant_id', config.id)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Compare core content (strip whitespace/dates for comparison)
        const normalize = (s) => (s || '').replace(/\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|hoje|amanha|ontem/gi, '').replace(/\s+/g, ' ').trim();
        if (lastMsg && normalize(lastMsg.content) === normalize(briefing)) {
          logger.info(`Skipping duplicate briefing for ${config.restaurant_name}`);
          continue;
        }

        await sendBriefing(
          config.manager_phone,
          briefing,
          config.notification_preferences?.briefing_channel || 'text',
          config.id
        );

        // Send weekly chart via WhatsApp (morning briefing only)
        if (type === 'morning' && isWhatsAppConfigured() && config.manager_phone) {
          try {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const { data: weekReservations } = await supabaseAdmin
              .from('reservations')
              .select('date, status')
              .eq('restaurant_id', config.id)
              .gte('date', weekAgo)
              .order('date');

            if (weekReservations?.length > 0) {
              // Group by day
              const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
              const dayCounts = {};
              for (const r of weekReservations) {
                const d = new Date(r.date + 'T12:00:00Z');
                const dayName = dayNames[d.getUTCDay()];
                dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
              }

              const chartData = dayNames.map(day => ({ day, count: dayCounts[day] || 0 }));
              const chartUrl = buildWeeklyReservationsChart(chartData, config.restaurant_name || 'Restaurante');

              // Count no-shows
              const showed = weekReservations.filter(r => r.status === 'completed' || r.status === 'seated').length;
              const noShow = weekReservations.filter(r => r.status === 'no-show').length;
              const cancelled = weekReservations.filter(r => r.status === 'cancelled').length;

              await sendWhatsAppImageMessage(
                config.manager_phone,
                chartUrl,
                `Reservas da semana: ${weekReservations.length} total | ${noShow} no-shows | ${cancelled} cancelamentos`
              );

              // Send no-show chart if there are any
              if (noShow > 0 || cancelled > 0) {
                const noShowUrl = buildNoShowChart({ showed, noShow, cancelled }, config.restaurant_name || 'Restaurante');
                await sendWhatsAppImageMessage(config.manager_phone, noShowUrl);
              }
            }
          } catch (chartErr) {
            logger.warn('Chart send failed (non-blocking)', { error: chartErr.message });
          }
        }

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
