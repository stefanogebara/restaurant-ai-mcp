const { supabaseAdmin } = require('./supabase');

/**
 * Parse a period label into { from, to } ISO date strings (UTC calendar dates).
 * @param {string} label
 * @returns {{ from: string, to: string }}
 */
function parsePeriod(label) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (label === 'last_7_days') {
    const from = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    return { from, to: today };
  }

  if (label === 'last_30_days') {
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    return { from, to: today };
  }

  if (label === 'this_week') {
    // Week starts Monday (ISO)
    const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMon = day === 0 ? 6 : day - 1;
    const from = new Date(now.getTime() - daysToMon * 86400000).toISOString().split('T')[0];
    return { from, to: today };
  }

  if (label === 'last_week') {
    const day = now.getUTCDay();
    const daysToThisMonday = day === 0 ? 6 : day - 1;
    const thisMonday = new Date(now.getTime() - daysToThisMonday * 86400000);
    const lastSunday = new Date(thisMonday.getTime() - 86400000);
    const lastMonday = new Date(lastSunday.getTime() - 6 * 86400000);
    return {
      from: lastMonday.toISOString().split('T')[0],
      to: lastSunday.toISOString().split('T')[0],
    };
  }

  if (label === 'this_month') {
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    return { from, to: today };
  }

  if (label === 'last_month') {
    // First day of current month, subtract 1 day = last day of last month
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastDayLastMonth = new Date(firstOfMonth.getTime() - 86400000);
    const firstDayLastMonth = new Date(
      Date.UTC(lastDayLastMonth.getUTCFullYear(), lastDayLastMonth.getUTCMonth(), 1)
    );
    return {
      from: firstDayLastMonth.toISOString().split('T')[0],
      to: lastDayLastMonth.toISOString().split('T')[0],
    };
  }

  throw new Error(`Unknown period: ${label}`);
}

/**
 * Aggregate reservation metrics for a restaurant over a date range.
 * @param {string} restaurantId
 * @param {string} from  ISO date string (inclusive)
 * @param {string} to    ISO date string (inclusive)
 * @returns {Promise<{ from, to, reservations, covers, no_shows, cancelled, avg_party_size }>}
 */
async function aggregatePeriod(restaurantId, from, to) {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('party_size, status')
    .eq('restaurant_id', restaurantId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw new Error(error.message);

  const rows = data || [];
  const covers = rows.reduce((s, r) => s + (r.party_size || 0), 0);
  const avg_party_size =
    rows.length > 0 ? Math.round((covers / rows.length) * 10) / 10 : 0;

  return {
    from,
    to,
    reservations: rows.length,
    covers,
    no_shows: rows.filter((r) => r.status === 'no_show').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    avg_party_size,
  };
}

/**
 * Compare two periods and return metrics + delta.
 * @param {string} restaurantId
 * @param {string} labelA  period label (e.g. 'last_week')
 * @param {string} labelB  period label (e.g. 'this_week')
 * @returns {Promise<{ period_a, period_b, delta }>}
 */
async function comparePeriods(restaurantId, labelA, labelB) {
  const [rangeA, rangeB] = [parsePeriod(labelA), parsePeriod(labelB)];

  const [pA, pB] = await Promise.all([
    aggregatePeriod(restaurantId, rangeA.from, rangeA.to),
    aggregatePeriod(restaurantId, rangeB.from, rangeB.to),
  ]);

  const coversPct =
    pA.covers > 0 ? Math.round(((pB.covers - pA.covers) / pA.covers) * 1000) / 10 : null;
  const reservationsPct =
    pA.reservations > 0
      ? Math.round(((pB.reservations - pA.reservations) / pA.reservations) * 1000) / 10
      : null;

  return {
    period_a: { label: labelA, ...pA },
    period_b: { label: labelB, ...pB },
    delta: {
      covers: pB.covers - pA.covers,
      reservations: pB.reservations - pA.reservations,
      covers_pct: coversPct,
      reservations_pct: reservationsPct,
    },
  };
}

module.exports = { parsePeriod, aggregatePeriod, comparePeriods };
