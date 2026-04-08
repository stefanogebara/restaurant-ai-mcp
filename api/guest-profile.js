/**
 * Guest Profile API
 *
 * GET /api/guest-profile?phone=X
 *
 * Aggregates call history, reservations, and guest memories
 * for a single phone number within the authenticated restaurant.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('GuestProfile');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const auth = await verifyAuth(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { phone } = req.query;
  const restaurant_id = auth.user.restaurant_id;

  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number required' });
  }

  if (!restaurant_id || restaurant_id === 'default') {
    return res.status(400).json({ success: false, error: 'Restaurant ID required' });
  }

  try {
    // Run queries in parallel
    const [callsResult, reservationsResult, ltvResult] = await Promise.all([
      // Recent calls from this phone
      supabaseAdmin
        .from('agent_conversations')
        .select('id, conversation_id, started_at, duration_seconds, outcome, customer_sentiment, summary, customer_name')
        .eq('restaurant_info_id', restaurant_id)
        .eq('caller_phone', phone)
        .order('started_at', { ascending: false })
        .limit(20),

      // Reservations from this phone
      supabaseAdmin
        .from('reservations')
        .select('id, guest_name, party_size, reservation_date, reservation_time, status, created_at')
        .eq('restaurant_id', restaurant_id)
        .eq('guest_phone', phone)
        .order('reservation_date', { ascending: false })
        .limit(20),

      // Customer LTV data
      supabaseAdmin
        .from('customer_ltv')
        .select('total_visits, total_spend, average_spend, last_visit_date, churn_risk_score, tier, tags')
        .eq('restaurant_id', restaurant_id)
        .eq('phone', phone)
        .maybeSingle(),
    ]);

    const calls = callsResult.data || [];
    const reservations = reservationsResult.data || [];
    const ltv = ltvResult.data || null;

    // Derive guest name from most recent source
    const guestName = calls.find(c => c.customer_name)?.customer_name
      || reservations.find(r => r.guest_name)?.guest_name
      || null;

    // Compute call stats
    const totalCalls = calls.length;
    const successfulBookings = calls.filter(c => c.outcome === 'reservation_created').length;
    const avgDuration = totalCalls > 0
      ? Math.round(calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / totalCalls)
      : 0;

    // Sentiment distribution
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    calls.forEach(c => {
      if (c.customer_sentiment && sentimentCounts[c.customer_sentiment] !== undefined) {
        sentimentCounts[c.customer_sentiment]++;
      }
    });

    return res.status(200).json({
      success: true,
      profile: {
        phone,
        name: guestName,
        call_stats: {
          total_calls: totalCalls,
          successful_bookings: successfulBookings,
          average_duration_seconds: avgDuration,
          sentiment: sentimentCounts,
          first_call: calls.length > 0 ? calls[calls.length - 1].started_at : null,
          last_call: calls.length > 0 ? calls[0].started_at : null,
        },
        reservation_stats: {
          total_reservations: reservations.length,
          upcoming: reservations.filter(r => r.status === 'confirmed' && new Date(r.reservation_date) >= new Date()).length,
        },
        ltv: ltv ? {
          total_visits: ltv.total_visits,
          total_spend: ltv.total_spend,
          average_spend: ltv.average_spend,
          last_visit: ltv.last_visit_date,
          churn_risk: ltv.churn_risk_score,
          tier: ltv.tier,
          tags: ltv.tags,
        } : null,
        recent_calls: calls.slice(0, 5).map(c => ({
          id: c.id,
          date: c.started_at,
          duration: c.duration_seconds,
          outcome: c.outcome,
          sentiment: c.customer_sentiment,
          summary: c.summary,
        })),
        recent_reservations: reservations.slice(0, 5).map(r => ({
          id: r.id,
          date: r.reservation_date,
          time: r.reservation_time,
          party_size: r.party_size,
          status: r.status,
          name: r.guest_name,
        })),
      },
    });
  } catch (error) {
    logger.error('[GuestProfile] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
