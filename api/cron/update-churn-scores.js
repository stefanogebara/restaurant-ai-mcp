/**
 * Cron Job: Update Churn Scores
 *
 * Recalculates churn risk scores for all customers based on:
 * - Days since last visit vs expected visit frequency
 * - Loyalty bonus for frequent visitors
 *
 * Runs daily at 6 AM UTC via Vercel Cron Jobs
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel adds this header)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[CRON] Missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[CRON] Starting daily churn score update...');

    // Get all customers with LTV records
    const { data: customers, error: fetchError } = await supabase
      .from('customer_ltv')
      .select('customer_id, avg_days_between_visits, last_visit_date, total_visits, customer_tier');

    if (fetchError) throw fetchError;

    if (!customers || customers.length === 0) {
      console.log('[CRON] No customers found to update');
      return res.status(200).json({
        success: true,
        message: 'No customers to update',
        updated: 0
      });
    }

    const today = new Date();
    let updated = 0;
    let atRiskCount = 0;

    for (const customer of customers) {
      if (!customer.last_visit_date) continue;

      const lastVisit = new Date(customer.last_visit_date);
      const daysSinceLastVisit = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24));

      // Calculate churn risk
      let churnRiskScore;

      // New customers (1 visit) have neutral risk
      if (!customer.total_visits || customer.total_visits === 1) {
        churnRiskScore = 50;
      } else if (!customer.avg_days_between_visits || customer.avg_days_between_visits === 0) {
        churnRiskScore = 50;
      } else {
        // Calculate how overdue they are
        const expectedNextVisit = customer.avg_days_between_visits * 1.5; // Grace period of 50%
        const overdueRatio = daysSinceLastVisit / expectedNextVisit;

        // Convert to 0-100 score (higher = more at risk)
        churnRiskScore = Math.min(100, Math.round(overdueRatio * 50));

        // Loyalty bonus: 10+ visits reduces risk by 30%
        if (customer.total_visits >= 10) {
          churnRiskScore = Math.round(churnRiskScore * 0.7);
        }
      }

      churnRiskScore = Math.max(0, Math.min(100, churnRiskScore));

      // Determine if tier should change to at_risk
      let newTier = customer.customer_tier;
      if (churnRiskScore > 70 && customer.customer_tier !== 'at_risk') {
        newTier = 'at_risk';
        atRiskCount++;
      }

      // Update the record
      const { error: updateError } = await supabase
        .from('customer_ltv')
        .update({
          churn_risk_score: churnRiskScore,
          customer_tier: newTier,
          updated_at: today.toISOString()
        })
        .eq('customer_id', customer.customer_id);

      if (!updateError) {
        updated++;
      } else {
        console.error(`[CRON] Failed to update ${customer.customer_id}:`, updateError);
      }
    }

    console.log(`[CRON] Updated churn scores for ${updated} customers, ${atRiskCount} newly at risk`);

    return res.status(200).json({
      success: true,
      message: `Updated ${updated} customer churn scores`,
      data: {
        total_processed: customers.length,
        updated: updated,
        newly_at_risk: atRiskCount
      },
      timestamp: today.toISOString()
    });

  } catch (error) {
    console.error('[CRON] Churn update error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update churn scores'
    });
  }
};
