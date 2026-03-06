const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('manager-alerts');

const ALERT_CONFIGS = {
  low_covers: {
    prefKey: 'alert_low_covers',
    message: (n, capacity) =>
      `⚠️ Quiet night ahead — only ${n} of ${capacity} covers booked for tonight. Consider running a last-minute promotion.`,
  },
  high_noshows: {
    prefKey: 'alert_high_noshows',
    message: (n) =>
      `⚠️ High no-show risk — ${n} reservations tonight have a >70% no-show probability. Consider overbooking or sending reminder SMS.`,
  },
  late_cancellations: {
    prefKey: 'alert_late_cancellations',
    message: (n, remaining) =>
      `⚠️ ${n} cancellations in the last 2 hours for tonight. ${remaining} covers still confirmed.`,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
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
      .select('id, manager_phone, notification_preferences, timezone')
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

      const message = alertConfig.message(triggered.n, triggered.secondary);
      await sendWhatsAppMessage(restaurant.manager_phone, message);
      sent++;
      logger.info('alert sent', { restaurantId: restaurant.id, alertType });
    }

    return res.status(200).json({ checked, sent });
  } catch (err) {
    logger.error('manager-alerts error', { error: err.message, alertType });
    return res.status(500).json({ error: 'Internal error' });
  }
};

async function checkTrigger(alertType, restaurant) {
  const today = new Date().toISOString().split('T')[0];
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
