const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('revenue-stats');
const DEFAULT_AVG_SPEND = 80;
const MIN_DATA_POINTS = 5;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;

    const { data, error } = await supabaseAdmin
      .from('service_records')
      .select('total_bill, party_size')
      .eq('restaurant_id', restaurantId)
      .not('total_bill', 'is', null);

    if (error) throw new Error(error.message);

    const rows = data || [];
    const dataPoints = rows.length;

    // Build party-size breakdown regardless of data count
    const sizeGroups = { '1-2': { total: 0, covers: 0, count: 0 }, '3-4': { total: 0, covers: 0, count: 0 }, '5-6': { total: 0, covers: 0, count: 0 }, '7+': { total: 0, covers: 0, count: 0 } };
    for (const r of rows) {
      const ps = r.party_size || 1;
      const key = ps <= 2 ? '1-2' : ps <= 4 ? '3-4' : ps <= 6 ? '5-6' : '7+';
      sizeGroups[key].total += r.total_bill || 0;
      sizeGroups[key].covers += ps;
      sizeGroups[key].count += 1;
    }
    const by_party_size = Object.entries(sizeGroups)
      .filter(([, g]) => g.count > 0)
      .map(([range, g]) => ({
        range,
        avg_per_cover: Math.round((g.total / g.covers) * 100) / 100,
        avg_total: Math.round((g.total / g.count) * 100) / 100,
        count: g.count,
      }));

    if (dataPoints < MIN_DATA_POINTS) {
      return res.json({
        avg_spend_per_cover: DEFAULT_AVG_SPEND,
        data_points: dataPoints,
        using_default: true,
        by_party_size,
      });
    }

    const totalBill = rows.reduce((s, r) => s + (r.total_bill || 0), 0);
    const totalCovers = rows.reduce((s, r) => s + (r.party_size || 1), 0);
    const avg = totalCovers > 0 ? Math.round((totalBill / totalCovers) * 100) / 100 : DEFAULT_AVG_SPEND;

    return res.json({
      avg_spend_per_cover: avg,
      data_points: dataPoints,
      using_default: false,
      by_party_size,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('revenue-stats error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};
