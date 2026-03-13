/**
 * Cron Job: Cleanup Expired Demos
 *
 * Hard-deletes demo restaurants that expired more than 30 days ago and have NOT
 * been converted to real accounts (is_demo = true).
 *
 * Deletion order (to respect foreign-key constraints):
 *  1. DELETE public.reservations WHERE restaurant_id = <demo_id>
 *  2. DELETE restaurant.restaurant_config WHERE id = <demo_id>
 *
 * Runs daily at 3 AM UTC — "0 3 * * *"
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');

const { logCronRun } = require('../_lib/cron-tracker');
initSentry();
const logger = createSecureLogger('CronCleanupExpiredDemos');

module.exports = async (req, res) => {
  // Verify CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Verify Supabase admin client is available
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized - missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting cleanup of expired demos...');

    const now = new Date();
    // Cutoff: demos expired more than 30 days ago
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    logger.info(`Cutoff date: ${cutoff} (demos expired before this will be deleted)`);

    // Find all unconverted demos expired beyond the 30-day grace period
    const { data: expiredDemos, error: fetchError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, demo_expires_at, demo_contact_email')
      .eq('is_demo', true)
      .lt('demo_expires_at', cutoff);

    if (fetchError) {
      logger.error('Error fetching expired demos:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch expired demos',
        details: fetchError.message,
      });
    }

    const demoCount = expiredDemos?.length || 0;
    logger.info(`Found ${demoCount} expired demo(s) to delete`);

    if (demoCount === 0) {
      const summary = {
        success: true,
        run_at: now.toISOString(),
        deleted_demos: 0,
        deleted_reservations: 0,
      };
      logger.info('No expired demos to clean up.');
      return res.status(200).json(summary);
    }

    let deletedDemos = 0;
    let deletedReservations = 0;
    let failedDemos = 0;

    for (const demo of expiredDemos) {
      logger.info(`Processing demo ${demo.id} (${demo.restaurant_name}, expired ${demo.demo_expires_at})`);

      // Step 1a: Delete reservations for this demo restaurant
      const { error: reservationsError, count: resCount } = await supabaseAdmin
        .from('reservations')
        .delete({ count: 'exact' })
        .eq('restaurant_id', demo.id);

      if (reservationsError) {
        logger.error(`Failed to delete reservations for demo ${demo.id}:`, reservationsError.message);
        failedDemos++;
        continue;
      }

      const reservationsDeleted = resCount || 0;
      deletedReservations += reservationsDeleted;
      logger.info(`Deleted ${reservationsDeleted} reservation(s) for demo ${demo.id}`);

      // Step 1b: Delete tables for this demo restaurant
      const { error: tablesError } = await supabaseAdmin
        .from('tables')
        .delete()
        .eq('restaurant_id', demo.id);

      if (tablesError) {
        logger.warn(`Failed to delete tables for demo ${demo.id} (non-fatal):`, tablesError.message);
      }

      // Step 2: Delete the restaurant_config row
      const { error: configError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .delete()
        .eq('id', demo.id);

      if (configError) {
        logger.error(`Failed to delete restaurant_config for demo ${demo.id}:`, configError.message);
        failedDemos++;
        continue;
      }

      deletedDemos++;
      logger.info(`Deleted restaurant_config for demo ${demo.id} (${demo.restaurant_name})`);
    }

    if (failedDemos > 0) {
      captureMessage(
        `CronCleanupExpiredDemos: ${failedDemos} demo(s) failed to delete`,
        'warning',
        { failedDemos, deletedDemos, run_at: now.toISOString() }
      );
    }

    const summary = {
      success: true,
      run_at: now.toISOString(),
      candidates_found: demoCount,
      deleted_demos: deletedDemos,
      deleted_reservations: deletedReservations,
      failed_demos: failedDemos,
    };

    logger.info('Cleanup job complete:', JSON.stringify(summary, null, 2));
    await logCronRun('cleanup-expired-demos', { deleted: deletedDemos });

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error in cleanup-expired-demos job:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
};
