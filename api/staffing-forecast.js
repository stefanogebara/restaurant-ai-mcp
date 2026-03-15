const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { buildForecast } = require('./services/staffingService');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('staffing-forecast');

const DEFAULT_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;

    // Fetch staffing config
    const { data: configData, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('staffing_config')
      .eq('id', restaurantId)
      .single();
    if (configError) throw new Error(configError.message);

    const roles = configData?.staffing_config?.roles || DEFAULT_ROLES;

    // Build 7-day date window
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    const todayStr = today.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Fetch reservations
    const { data: reservations, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('date, party_size')
      .eq('restaurant_id', restaurantId)
      .gte('date', todayStr)
      .lt('date', endStr);
    if (resError) throw new Error(resError.message);

    // Group covers by date (initialise all 7 days to 0)
    const coversByDate = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      coversByDate[d.toISOString().split('T')[0]] = 0;
    }
    (reservations || []).forEach(r => {
      if (coversByDate[r.date] !== undefined) {
        coversByDate[r.date] += r.party_size || 0;
      }
    });

    const reservationsByDate = Object.entries(coversByDate).map(([date, covers]) => ({ date, covers }));
    const forecast = buildForecast(reservationsByDate, roles);

    return res.json({ forecast });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('staffing-forecast error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
