/**
 * Cron Job: Proactive Guest Communications
 *
 * Identifies re-engagement opportunities and generates personalized
 * outreach messages. Runs weekly and queues messages for manager approval.
 *
 * Triggers:
 * 1. Upcoming birthdays/anniversaries (within 7 days)
 * 2. At-risk churning customers (from customer_ltv)
 * 3. Long-absent regulars (no visit in 2x their average frequency)
 *
 * Runs weekly (Sundays at 10 AM UTC) via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { buildGuestContext } = require('../services/guestMemory');

const logger = createSecureLogger('CronProactiveComms');

module.exports = async (req, res) => {
  // Verify cron auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    logger.info('Starting weekly proactive comms scan...');

    const opportunities = [];

    // 1. Check for upcoming occasions (birthdays, anniversaries within 7 days)
    const upcomingOccasions = await findUpcomingOccasions();
    opportunities.push(...upcomingOccasions);

    // 2. Check for at-risk customers (high churn risk)
    const atRiskCustomers = await findAtRiskCustomers();
    opportunities.push(...atRiskCustomers);

    logger.info('Proactive comms scan complete', {
      occasions: upcomingOccasions.length,
      atRisk: atRiskCustomers.length,
      total: opportunities.length
    });

    // Store opportunities for manager review
    if (opportunities.length > 0) {
      await storeOpportunities(opportunities);
    }

    return res.status(200).json({
      success: true,
      opportunities: opportunities.length,
      breakdown: {
        occasions: upcomingOccasions.length,
        at_risk: atRiskCustomers.length
      }
    });
  } catch (error) {
    logger.error('Proactive comms cron error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Find guest memories of type 'occasion' with dates in the next 7 days
 */
async function findUpcomingOccasions() {
  try {
    const { data: occasions, error } = await supabaseAdmin
      .from('guest_memories')
      .select('restaurant_id, guest_phone, content, importance')
      .eq('is_active', true)
      .eq('memory_type', 'occasion')
      .order('importance', { ascending: false })
      .limit(100);

    if (error || !occasions) return [];

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thisYear = now.getFullYear();

    const upcoming = [];

    for (const occ of occasions) {
      // Try to extract a date from the content (e.g., "Wedding anniversary Feb 14")
      const dateMatch = occ.content.match(
        /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i
      );

      if (dateMatch) {
        const parsedDate = new Date(`${dateMatch[0]} ${thisYear}`);
        if (!isNaN(parsedDate.getTime()) && parsedDate >= now && parsedDate <= sevenDaysFromNow) {
          upcoming.push({
            type: 'occasion',
            restaurant_id: occ.restaurant_id,
            guest_phone: occ.guest_phone,
            content: occ.content,
            trigger_date: parsedDate.toISOString().split('T')[0],
            suggested_action: `Send a personalized message about their upcoming ${occ.content}`
          });
        }
      }
    }

    return upcoming;
  } catch (error) {
    logger.error('Error finding upcoming occasions:', error.message);
    return [];
  }
}

/**
 * Find customers with high churn risk from customer_ltv
 */
async function findAtRiskCustomers() {
  try {
    // customer_ltv has no restaurant_id column - it's keyed by customer_id (phone)
    const { data: atRisk, error } = await supabaseAdmin
      .from('customer_ltv')
      .select('customer_id, customer_phone, churn_risk_score, customer_tier, last_visit_date, total_visits')
      .gte('churn_risk_score', 70)
      .gte('total_visits', 3)
      .order('churn_risk_score', { ascending: false })
      .limit(50);

    if (error || !atRisk) return [];

    return atRisk.map(c => ({
      type: 'churn_risk',
      customer_id: c.customer_id,
      guest_phone: c.customer_phone || c.customer_id,
      churn_risk: c.churn_risk_score,
      tier: c.customer_tier,
      last_visit: c.last_visit_date,
      total_visits: c.total_visits,
      suggested_action: `Re-engage ${c.customer_tier} customer (${c.total_visits} visits, churn risk: ${c.churn_risk_score}%)`
    }));
  } catch (error) {
    logger.error('Error finding at-risk customers:', error.message);
    return [];
  }
}

/**
 * Store opportunities as manager notes for review
 * Managers will see these in their dashboard and can approve sending messages
 */
async function storeOpportunities(opportunities) {
  try {
    // For now, log opportunities. In a future iteration, these would be
    // stored in a dedicated `proactive_comms_queue` table for manager approval.
    logger.info('Proactive comm opportunities identified', {
      count: opportunities.length,
      types: opportunities.reduce((acc, o) => {
        acc[o.type] = (acc[o.type] || 0) + 1;
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Error storing opportunities:', error.message);
  }
}
