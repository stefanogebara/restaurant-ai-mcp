/**
 * Strategy Metrics API
 *
 * Returns the 3 key metrics that measure whether the AI strategy is working:
 *   1. No-show rate (daily, last 30 days)
 *   2. Avg revenue per cover (weekly, last 30 days)
 *   3. Reservation conversion rate (daily, last 30 days)
 *
 * This is the "val_bpb" equivalent from Karpathy's autoresearch — the scoreboard
 * that tells you if the strategy loop is improving the business.
 *
 * GET /api/strategy-metrics?range=30
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
initSentry();

const logger = createSecureLogger('StrategyMetrics');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const restaurantId = auth.user?.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant configured' });
  }

  const days = Math.min(parseInt(req.query.range || '30', 10), 90);

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().split('T')[0];
    const sinceTs = since.toISOString();

    const [reservationsRes, serviceRes] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('id, status, date, party_size')
        .eq('restaurant_id', restaurantId)
        .gte('date', sinceDate)
        .order('date', { ascending: true }),
      supabaseAdmin
        .from('service_records')
        .select('total_bill, party_size, seated_at')
        .eq('restaurant_id', restaurantId)
        .gte('seated_at', sinceTs)
        .not('total_bill', 'is', null)
        .order('seated_at', { ascending: true }),
    ]);

    const reservations = reservationsRes.data || [];
    const serviceRecords = serviceRes.data || [];

    // ── 1. No-show rate — daily ────────────────────────────────────────────────
    const noShowByDate = {};
    for (const r of reservations) {
      if (!r.date) continue;
      if (!noShowByDate[r.date]) noShowByDate[r.date] = { total: 0, no_shows: 0 };
      noShowByDate[r.date].total++;
      if (r.status === 'no_show') noShowByDate[r.date].no_shows++;
    }

    const noShowTimeline = Object.entries(noShowByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        rate: d.total > 0 ? parseFloat(((d.no_shows / d.total) * 100).toFixed(1)) : 0,
        total: d.total,
        no_shows: d.no_shows,
      }));

    // Overall no-show rate
    const totalReservations = reservations.length;
    const totalNoShows = reservations.filter(r => r.status === 'no_show').length;
    const noShowRate = totalReservations > 0
      ? parseFloat(((totalNoShows / totalReservations) * 100).toFixed(1))
      : null;

    // ── 2. Avg revenue per cover — weekly ────────────────────────────────────
    const revenueByWeek = {};
    for (const sr of serviceRecords) {
      const date = new Date(sr.seated_at);
      // Get Monday of the week
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      const weekKey = monday.toISOString().split('T')[0];

      if (!revenueByWeek[weekKey]) revenueByWeek[weekKey] = { total_bill: 0, total_covers: 0, count: 0 };
      revenueByWeek[weekKey].total_bill += parseFloat(sr.total_bill) || 0;
      revenueByWeek[weekKey].total_covers += sr.party_size || 1;
      revenueByWeek[weekKey].count++;
    }

    const revenueTimeline = Object.entries(revenueByWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, d]) => ({
        week,
        avg_per_cover: d.total_covers > 0
          ? parseFloat((d.total_bill / d.total_covers).toFixed(2))
          : null,
        avg_bill: d.count > 0
          ? parseFloat((d.total_bill / d.count).toFixed(2))
          : null,
        covers: d.total_covers,
      }));

    // Overall avg revenue per cover
    const totalBill = serviceRecords.reduce((s, r) => s + (parseFloat(r.total_bill) || 0), 0);
    const totalCovers = serviceRecords.reduce((s, r) => s + (r.party_size || 1), 0);
    const avgRevenuePerCover = serviceRecords.length >= 3
      ? parseFloat((totalBill / totalCovers).toFixed(2))
      : null;

    // ── 3. Conversion rate — daily (confirmed / total) ───────────────────────
    const conversionByDate = {};
    for (const r of reservations) {
      if (!r.date) continue;
      if (!conversionByDate[r.date]) conversionByDate[r.date] = { total: 0, confirmed: 0 };
      conversionByDate[r.date].total++;
      if (['confirmed', 'seated', 'completed'].includes(r.status)) {
        conversionByDate[r.date].confirmed++;
      }
    }

    const conversionTimeline = Object.entries(conversionByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        rate: d.total > 0 ? parseFloat(((d.confirmed / d.total) * 100).toFixed(1)) : 0,
        total: d.total,
        confirmed: d.confirmed,
      }));

    // Overall conversion rate
    const confirmedReservations = reservations.filter(r =>
      ['confirmed', 'seated', 'completed'].includes(r.status)
    ).length;
    const conversionRate = totalReservations > 0
      ? parseFloat(((confirmedReservations / totalReservations) * 100).toFixed(1))
      : null;

    // ── Targets (from strategy doc defaults) ────────────────────────────────
    const targets = {
      no_show_rate: 5,       // < 5%
      avg_revenue_per_cover: 45, // € 45+
      conversion_rate: 90,   // > 90%
    };

    return res.status(200).json({
      success: true,
      data: {
        range_days: days,
        since: sinceDate,
        summary: {
          no_show_rate: noShowRate,
          avg_revenue_per_cover: avgRevenuePerCover,
          conversion_rate: conversionRate,
          total_reservations: totalReservations,
          data_points: serviceRecords.length,
        },
        targets,
        timelines: {
          no_show: noShowTimeline,
          revenue: revenueTimeline,
          conversion: conversionTimeline,
        },
      },
    });
  } catch (error) {
    captureException(error, { url: req.url, method: req.method });
    logger.error('Strategy metrics error:', error);
    return res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};
