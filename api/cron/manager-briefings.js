const { supabaseAdmin } = require('../_lib/supabase');
const { runManagerAgent } = require('../_lib/manager-agent');
const { sendBriefing, tryLogBriefingSent } = require('../_lib/briefing-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getVIPsForToday } = require('../services/restaurantSnapshot');
const { logCronRun } = require('../_lib/cron-tracker');
const { isWhatsAppConfigured, sendWhatsAppImageMessage } = require('../_lib/whatsapp-sender');
const { buildWeeklyReservationsChart, buildNoShowChart } = require('../services/chartService');

const logger = createSecureLogger('manager-briefings');

// These briefings are delivered as VOICE NOTES (TTS). Write like you're speaking
// to a friend, not printing a report. No bullets, headings, markdown, or numbered
// lists — they read robotically in TTS. Prose flows. Numbers woven into sentences.
// Aim for 45-75 seconds spoken (roughly 90-150 words). Always end with ONE concrete
// insight or suggestion, not a summary.
const VOICE_STYLE_RULES = {
  en: `STYLE: This will be READ ALOUD as a voice note. Talk like a trusted team member catching up with the manager at the end of service — warm, natural, conversational. Plain prose only. NO bullet points, NO headings, NO asterisks, NO markdown of any kind. Weave numbers into sentences ("we did 28 covers tonight", not "Covers: 28"). Give ONE concrete insight or observation — something you noticed, not a recap. 90-150 words, ~60 seconds spoken.`,
  'pt-BR': `ESTILO: Isso vai ser OUVIDO como audio. Fala como um membro da equipe conversando com o gerente no fim do expediente — caloroso, natural, de conversa. Prosa simples. SEM marcadores, SEM titulos, SEM asteriscos, SEM markdown. Integra os numeros nas frases ("a gente fez 28 covers hoje", nao "Covers: 28"). Traz UMA observacao concreta — algo que voce notou, nao so um resumo de estatisticas. 90-150 palavras, uns 60 segundos falados.`,
  es: `ESTILO: Esto se ESCUCHARA como audio. Habla como un miembro del equipo poniendo al gerente al dia al final del servicio — calido, natural, conversacional. Prosa simple. SIN vinetas, SIN titulos, SIN asteriscos, SIN markdown. Integra los numeros en las frases ("hicimos 28 cubiertos esta noche", no "Cubiertos: 28"). Da UNA observacion concreta — algo que notaste, no solo un resumen. 90-150 palabras, unos 60 segundos hablados.`,
};

/** DB stores agent_language as either 'pt'/'pt-BR' for Portuguese, 'es'/'es-ES' for
 *  Spanish, or 'en'/'en-US' for English. Briefing prompts are keyed on 'pt-BR' / 'es'
 *  / 'en' so we normalise here — without this, 'pt' falls through to English. */
function normalizeLang(lng) {
  if (!lng) return 'pt-BR';
  if (lng === 'pt' || lng.startsWith('pt-')) return 'pt-BR';
  if (lng.startsWith('es')) return 'es';
  if (lng.startsWith('en')) return 'en';
  return 'pt-BR';
}

const BRIEFING_PROMPTS = {
  end_of_day: {
    en: `It's the end of service. Give a spoken end-of-day catch-up: how tonight went (covers, any hiccups, standout moments), what's worth flagging for tomorrow's planning. ${VOICE_STYLE_RULES.en}`,
    'pt-BR': `O servico acabou. Me da um recap falado do fim do dia: como foi hoje (covers, qualquer problema, momentos de destaque), o que vale a pena anotar para amanha. ${VOICE_STYLE_RULES['pt-BR']}`,
    es: `Se acabo el servicio. Dame un recap hablado del fin del dia: como fue esta noche (cubiertos, algun problema, momentos destacables), que vale anotar para manana. ${VOICE_STYLE_RULES.es}`,
  },
  morning: {
    en: `Good morning. Give a spoken morning briefing for the day ahead: what the day looks like (reservations, any VIPs or special bookings, events), and one thing worth focusing on today. ${VOICE_STYLE_RULES.en}`,
    'pt-BR': `Bom dia. Me da um briefing falado para o dia: como o dia ta pintando (reservas, VIPs ou bookings especiais, eventos), e uma coisa que vale focar hoje. ${VOICE_STYLE_RULES['pt-BR']}`,
    es: `Buenos dias. Dame un briefing hablado para el dia: como viene el dia (reservas, VIPs o reservas especiales, eventos), y una cosa en la que valga la pena enfocarse hoy. ${VOICE_STYLE_RULES.es}`,
  },
};

const { isCronEnabled } = require('../_lib/cron-config');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — `UPDATE cron_config SET enabled=false
  // WHERE job_name='manager-briefings'` stops both the morning AND the
  // end-of-day fire without a redeploy. Either type sharing one row
  // is fine; if ops needs per-type granularity later, this can split.
  if (!(await isCronEnabled('manager-briefings'))) {
    logger.warn('manager-briefings cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
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
    const eligibleRaw = (configs || []).filter((c) =>
      c.manager_whatsapp_verified === true && c.notification_preferences?.[prefKey]
    );

    // V.1 Round-robin fairness. Before this shuffle, the eligible list came
    // back in DB row order — same first N restaurants got processed every
    // run, restaurant N+1 NEVER received briefings if the time budget kept
    // cutting off before reaching it. Shuffling once per invocation
    // distributes the cut-off across the population over many runs, so
    // every restaurant gets briefed eventually rather than some always
    // and some never.
    const eligible = eligibleRaw
      .map((c) => ({ c, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map((x) => x.c);

    // V.1 Fail-safe hard cap. Even with the elapsed-time guard below, a
    // misconfigured PER_RESTAURANT_TIMEOUT or a hung LLM call could let
    // a single invocation run past 60s and get killed by Vercel mid-write
    // (corrupting briefing dedup state). The cap is a belt around the
    // elapsed-time suspenders: we will NEVER attempt more than 50
    // restaurants in one run, regardless of remaining budget.
    const MAX_RESTAURANTS_PER_RUN = 50;
    const TIME_BUDGET_MS = 45_000;
    const PER_RESTAURANT_TIMEOUT = 25_000; // 25s per restaurant — fits 2-3 in 60s
    const startTime = Date.now();

    let sent = 0;
    let processed = 0;
    for (const config of eligible) {
      // V.1 Hard cap: never attempt more than MAX_RESTAURANTS_PER_RUN in a
      // single invocation. At 25s timeout each, even a worst-case run is
      // bounded; combined with the elapsed-time check below, this keeps
      // us well clear of Vercel's 60s kill.
      if (processed >= MAX_RESTAURANTS_PER_RUN) {
        logger.warn('Hard cap MAX_RESTAURANTS_PER_RUN reached, stopping', {
          sent,
          processed,
          cap: MAX_RESTAURANTS_PER_RUN,
          eligible: eligible.length,
          dropped: eligible.length - processed,
        });
        break;
      }
      processed++;
      // Time budget guard: stop if less than 15s remaining. The next cron run
      // (12h later for end-of-day, 24h for morning) will retry — but log loud
      // so we know to scale (e.g. shard by restaurant_id hash).
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        logger.warn('Time budget exceeded, stopping briefings', {
          sent,
          processed: processed - 1,
          eligible: eligible.length,
          dropped: eligible.length - (processed - 1),
        });
        break;
      }

      try {
        const lang = normalizeLang(config.agent_language);

        // M17: morning briefing has two zero-data fallbacks. Both skip the
        // expensive AI call:
        //   1) Restaurant has NO reservations ever → send onboarding setup guide
        //      (truly new account, hasn't received their first booking yet)
        //   2) Restaurant has history but ZERO TODAY → send a short "quiet day"
        //      acknowledgement (don't burn a Sonnet call to say "tudo tranquilo")
        // Previously only checked all-time count, so a restaurant with CSV
        // imports but nothing today got a full AI briefing about historical data.
        if (type === 'morning') {
          const todayStr = new Date().toISOString().split('T')[0];
          const [{ count: reservationCount }, { count: todayCount }] = await Promise.all([
            supabaseAdmin
              .from('reservations')
              .select('id', { count: 'exact', head: true })
              .eq('restaurant_id', config.id),
            supabaseAdmin
              .from('reservations')
              .select('id', { count: 'exact', head: true })
              .eq('restaurant_id', config.id)
              .eq('date', todayStr),
          ]);

          const isNewRestaurant = (reservationCount ?? 0) === 0;
          const isQuietToday = !isNewRestaurant && (todayCount ?? 0) === 0;

          if (isNewRestaurant || isQuietToday) {
            const onboardingMessages = {
              'pt-BR': `Bom dia! Seu restaurante ainda não tem reservas. Para começar a receber:\n\n1. Compartilhe seu link: seatable.one/book/seu-slug\n2. Coloque o link na bio do Instagram e no Google Meu Negócio\n3. Ative o WhatsApp nas configurações para receber reservas via mensagem\n\nTudo pronto para quando o primeiro cliente chegar.`,
              es: `¡Buenos días! Tu restaurante aún no tiene reservas. Para empezar:\n\n1. Comparte tu enlace de reservas en Instagram y Google\n2. Activa WhatsApp en configuración para recibir reservas por mensaje\n3. Prueba hacer una reserva de prueba tú mismo\n\nListo para cuando llegue el primer cliente.`,
              en: `Good morning! Your restaurant has no reservations yet. To start receiving them:\n\n1. Share your booking link on Instagram and Google\n2. Enable WhatsApp in settings to accept bookings by message\n3. Make a test booking yourself to verify the flow\n\nEverything is set up and ready for your first guest.`,
            };
            const quietDayMessages = {
              'pt-BR': `Bom dia! Hoje está tranquilo — nenhuma reserva no calendário. Bom momento para revisar o cardápio, treinar a equipe ou impulsionar uma promoção via WhatsApp.`,
              es: `¡Buenos días! Hoy está tranquilo — sin reservas en el calendario. Buen momento para revisar la carta, formar al equipo o lanzar una promoción por WhatsApp.`,
              en: `Good morning! Today's quiet — no reservations on the books. Good moment to refresh the menu, train staff, or push a WhatsApp promo.`,
            };
            const messageSet = isNewRestaurant ? onboardingMessages : quietDayMessages;
            const message = messageSet[lang] || messageSet['pt-BR'];
            const okToSend = await tryLogBriefingSent(config.id, 'morning');
            if (!okToSend) {
              logger.info(`Skipping duplicate morning briefing for ${config.restaurant_name}`);
              continue;
            }
            await sendBriefing(config.manager_phone, message, 'text', config.id);
            sent++;
            logger.info(`Sent ${isNewRestaurant ? 'onboarding' : 'quiet-day'} briefing: ${config.restaurant_name}`);
            continue;
          }
        }

        // Select prompt in the restaurant's configured language
        // (PT-BR default — this is a Brazilian-first product)
        let promptToSend = promptSet[lang] || promptSet['pt-BR'];

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

        // Dedup: claim the slot BEFORE the expensive LLM call.
        // Two concurrent Vercel invocations race here; only one INSERT wins.
        const briefingType = type === 'morning' ? 'morning' : 'end_of_day';
        const okToSend = await tryLogBriefingSent(config.id, briefingType);
        if (!okToSend) {
          logger.info(`Skipping duplicate ${briefingType} briefing for ${config.restaurant_name}`);
          continue;
        }

        const briefing = await Promise.race([
          // M16: skipQuota — cron-driven briefings are not charged against the
          // restaurant's manager_ai_call monthly counter (they would otherwise
          // consume most of a Starter plan's 100/mo allowance just for autos).
          runManagerAgent(config.id, promptToSend, 'whatsapp', { skipQuota: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing timeout')), PER_RESTAURANT_TIMEOUT))
        ]);

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
