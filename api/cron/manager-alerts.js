const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun } = require('../_lib/cron-tracker');
const { getLocalDate } = require('../_lib/timezone');

const logger = createSecureLogger('manager-alerts');

// Alert messages — language-aware + conversational tone.
// Previous versions were English-only and phrased like robot warnings ('⚠️ Quiet
// night ahead'). Now written like a team member texting the manager with a heads-up.
const ALERT_CONFIGS = {
  low_covers: {
    prefKey: 'alert_low_covers',
    message: (n, capacity, lang) => {
      const pct = capacity > 0 ? Math.round((n / capacity) * 100) : 0;
      if (lang === 'en') {
        return `Heads up — tonight is looking quiet. Only ${n} of ${capacity} covers booked so far (${pct}%). Might be worth pushing a last-minute promo or reaching out to regulars.`;
      }
      if (lang === 'es') {
        return `Atencion — esta noche viene tranquila. Llevamos solo ${n} de ${capacity} cubiertos (${pct}%). Quiza valga lanzar una promo de ultimo momento o escribirles a los clientes habituales.`;
      }
      return `Ei, fica de olho — hoje a noite ta tranquila. So ${n} de ${capacity} covers reservados ate agora (${pct}%). Talvez valha soltar uma promo de ultima hora ou chamar alguns clientes fieis.`;
    },
  },
  high_noshows: {
    prefKey: 'alert_high_noshows',
    message: (n, _secondary, lang) => {
      if (lang === 'en') {
        return `Heads up — ${n} reservations tonight are looking risky (>70% no-show probability). Worth sending a reminder text or overbooking by 1-2 to cover.`;
      }
      if (lang === 'es') {
        return `Atencion — ${n} reservas de hoy tienen alto riesgo de no-show (>70%). Vale mandar un recordatorio o sobrerreservar 1-2 para cubrir.`;
      }
      return `Ei, ${n} reservas de hoje ta com cara de no-show (>70% de chance). Vale mandar um lembrete ou sobrerreservar 1-2 pra compensar.`;
    },
  },
  late_cancellations: {
    prefKey: 'alert_late_cancellations',
    message: (n, remaining, lang) => {
      if (lang === 'en') {
        return `${n} cancellations came in over the last 2 hours for tonight — you still have ${remaining} covers confirmed. Might be worth checking the waitlist.`;
      }
      if (lang === 'es') {
        return `${n} cancelaciones entraron en las ultimas 2 horas para esta noche — te quedan ${remaining} cubiertos confirmados. Vale revisar la lista de espera.`;
      }
      return `${n} cancelamentos entraram nas ultimas 2h pra hoje — ainda tem ${remaining} covers confirmados. Vale dar uma olhada na fila de espera.`;
    },
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const alertType = req.query.type;
  const alertConfig = ALERT_CONFIGS[alertType];
  if (!alertConfig) {
    return res.status(400).json({ error: `Unknown alert type: ${alertType}` });
  }

  try {
    // Load all verified restaurants
    const { data: restaurants, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, manager_phone, notification_preferences, timezone, agent_language, language')
      .eq('manager_whatsapp_verified', true)
      .not('manager_phone', 'is', null);
    if (error) throw new Error(error.message);

    let checked = 0;
    let sent = 0;

    for (const restaurant of restaurants || []) {
      const prefs = restaurant.notification_preferences || {};
      if (!prefs[alertConfig.prefKey]) continue;
      checked++;

      const triggered = await checkTrigger(alertType, restaurant);
      if (!triggered.fire) continue;

      // Dedup: attempt insert — skip if already sent today (UNIQUE constraint)
      const { data: inserted } = await supabaseAdmin
        .from('manager_alerts_log')
        .insert({ restaurant_id: restaurant.id, alert_type: alertType })
        .select('id');

      if (!inserted || inserted.length === 0) {
        logger.info('alert already sent today', { restaurantId: restaurant.id, alertType });
        continue;
      }

      const lang = (restaurant.agent_language || restaurant.language || 'pt-BR').toLowerCase();
      const normalizedLang = lang.startsWith('pt') ? 'pt-BR' : lang.startsWith('es') ? 'es' : 'en';
      const message = alertConfig.message(triggered.n, triggered.secondary, normalizedLang);
      await sendWhatsAppMessage(restaurant.manager_phone, message);
      sent++;
      logger.info('alert sent', { restaurantId: restaurant.id, alertType });
    }

    const jobName = `manager-alerts-${alertType.replace(/_/g, '-')}`;
    await logCronRun(jobName, { checked, sent });

    return res.status(200).json({ checked, sent });
  } catch (err) {
    logger.error('manager-alerts error', { error: err.message, alertType });
    return res.status(500).json({ error: 'Internal error' });
  }
};

async function checkTrigger(alertType, restaurant) {
  const tz = restaurant.timezone || 'UTC';
  const today = getLocalDate(tz);
  const restaurantId = restaurant.id;

  if (alertType === 'low_covers') {
    const [{ data: reservations }, { data: tables }] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('party_size')
        .eq('restaurant_id', restaurantId)
        .eq('date', today)
        .not('status', 'in', '("cancelled","no_show")'),
      supabaseAdmin
        .from('tables')
        .select('capacity')
        .eq('restaurant_id', restaurantId),
    ]);
    const covers = (reservations || []).reduce((s, r) => s + (r.party_size || 0), 0);
    const capacity = (tables || []).reduce((s, t) => s + (t.capacity || 0), 0);
    return { fire: capacity > 0 && covers < capacity * 0.5, n: covers, secondary: capacity };
  }

  if (alertType === 'high_noshows') {
    const { data: highRisk } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('date', today)
      .not('status', 'in', '("cancelled","no_show")')
      .gte('no_show_probability', 0.7);
    const n = (highRisk || []).length;
    return { fire: n >= 3, n, secondary: null };
  }

  if (alertType === 'late_cancellations') {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const [{ data: cancelled }, { data: remaining }] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('date', today)
        .eq('status', 'cancelled')
        .gte('updated_at', twoHoursAgo),
      supabaseAdmin
        .from('reservations')
        .select('party_size')
        .eq('restaurant_id', restaurantId)
        .eq('date', today)
        .not('status', 'in', '("cancelled","no_show")'),
    ]);
    const n = (cancelled || []).length;
    const remainingCovers = (remaining || []).reduce((s, r) => s + (r.party_size || 0), 0);
    return { fire: n >= 2, n, secondary: remainingCovers };
  }

  return { fire: false };
}
