/**
 * Cron Job: Check Late Reservations
 *
 * Automatically marks reservations as "No-Show" if the customer is 20+ minutes late
 * without checking in or communicating with the restaurant.
 *
 * Runs every 5 minutes via Vercel Cron Jobs
 */

const { createClient } = require('@supabase/supabase-js');

const LATE_THRESHOLD_MINUTES = 20;

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    console.log('[CRON] Starting late reservation check...');

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Calculate time 20 minutes ago
    const twentyMinutesAgo = new Date(now.getTime() - LATE_THRESHOLD_MINUTES * 60 * 1000);
    const lateTimeThreshold = twentyMinutesAgo.toTimeString().slice(0, 5); // HH:MM

    console.log(`[CRON] Looking for reservations on ${today} with time <= ${lateTimeThreshold}`);

    // Find all "confirmed" reservations for today that haven't been checked in
    // and whose reservation time was more than 20 minutes ago
    const { data: lateReservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', today)
      .eq('status', 'confirmed')
      .lte('time', lateTimeThreshold)
      .is('checked_in_at', null);

    if (error) {
      console.error('[CRON] Error fetching reservations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations',
        details: error.message
      });
    }

    console.log(`[CRON] Found ${lateReservations?.length || 0} late reservations`);

    const markedAsNoShow = [];
    const errors = [];

    // Mark each late reservation as no-show
    for (const reservation of (lateReservations || [])) {
      const {
        id: recordId,
        reservation_id: resId,
        customer_name: customerName,
        time,
        table_ids: tableIds
      } = reservation;

      try {
        // Mark as no-show
        const { error: updateError } = await supabase
          .from('reservations')
          .update({
            status: 'no-show',
            notes: 'Automatically marked as no-show - 20+ minutes late without check-in'
          })
          .eq('id', recordId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        console.log(`[CRON] ✓ Marked as no-show: ${resId} (${customerName} at ${time})`);

        // If tables were assigned, release them back to Available status
        if (tableIds && tableIds.length > 0) {
          for (const tableId of tableIds) {
            try {
              const { error: tableError } = await supabase
                .from('tables')
                .update({
                  status: 'available',
                  current_service_id: null
                })
                .eq('id', tableId);

              if (tableError) {
                console.error(`[CRON]   └─ Failed to release table ${tableId}:`, tableError);
              } else {
                console.log(`[CRON]   └─ Released table ${tableId}`);
              }
            } catch (tableError) {
              console.error(`[CRON]   └─ Failed to release table ${tableId}:`, tableError);
            }
          }
        }

        markedAsNoShow.push({
          reservation_id: resId,
          customer_name: customerName,
          time: time,
          tables_released: tableIds?.length || 0
        });
      } catch (error) {
        console.error(`[CRON] ✗ Failed to mark ${resId} as no-show:`, error);
        errors.push({
          reservation_id: resId,
          error: error.message
        });
      }
    }

    const summary = {
      success: true,
      checked_at: now.toISOString(),
      late_threshold_minutes: LATE_THRESHOLD_MINUTES,
      reservations_checked: lateReservations?.length || 0,
      marked_as_no_show: markedAsNoShow.length,
      errors: errors.length,
      details: {
        no_shows: markedAsNoShow,
        errors: errors
      }
    };

    console.log('[CRON] Late reservation check complete:', JSON.stringify(summary, null, 2));

    return res.status(200).json(summary);
  } catch (error) {
    console.error('[CRON] Fatal error checking late reservations:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
