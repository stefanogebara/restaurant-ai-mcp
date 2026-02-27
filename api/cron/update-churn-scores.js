/**
 * Cron Job: Update Churn Scores
 *
 * Recalculates churn risk scores for all customers based on:
 * - Days since last visit vs expected visit frequency
 * - Loyalty bonus for frequent visitors
 *
 * Runs daily at 6 AM UTC via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
initSentry();

const logger = createSecureLogger('CronChurnScores');

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel adds this header)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting daily churn score update...');

    // Get all customers with LTV records
    const { data: customers, error: fetchError } = await supabaseAdmin
      .from('customer_ltv')
      .select('customer_id, avg_days_between_visits, last_visit_date, total_visits, customer_tier');

    if (fetchError) throw fetchError;

    if (!customers || customers.length === 0) {
      logger.info('No customers found to update');
      return res.status(200).json({
        success: true,
        message: 'No customers to update',
        updated: 0
      });
    }

    const today = new Date();
    let updated = 0;
    let atRiskCount = 0;
    const errors = [];

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

      // Guard against NaN from invalid dates or zero-division edge cases
      if (!Number.isFinite(churnRiskScore)) churnRiskScore = 50;
      churnRiskScore = Math.max(0, Math.min(100, churnRiskScore));

      // Determine tier changes (both upgrade and downgrade)
      let newTier = customer.customer_tier;
      if (churnRiskScore > 70 && customer.customer_tier !== 'at_risk') {
        newTier = 'at_risk';
        atRiskCount++;
      } else if (churnRiskScore <= 40 && customer.customer_tier === 'at_risk') {
        newTier = 'regular';
      }

      // Update the record
      const { error: updateError } = await supabaseAdmin
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
        logger.error(`Failed to update ${customer.customer_id}:`, updateError.message);
        errors.push({ customer_id: customer.customer_id, error: updateError.message });
      }
    }

    if (errors.length > 0) {
      captureMessage(
        `CronChurnScores: ${errors.length} customer(s) failed to update`,
        'warning',
        { errors, updated_at: today.toISOString() }
      );
    }

    logger.info(`Updated churn scores for ${updated} customers, ${atRiskCount} newly at risk`);

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
    logger.error('Churn update error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update churn scores'
    });
  }
};
