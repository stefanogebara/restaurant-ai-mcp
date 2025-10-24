/**
 * Cron Job: Check Late Reservations
 * 
 * Automatically marks reservations as "No-Show" if the customer is 20+ minutes late
 * without checking in or communicating with the restaurant.
 * 
 * Runs every 5 minutes via Vercel Cron Jobs
 */

const { getReservations, markReservationAsNoShow, updateTable } = require('../_lib/airtable');

const LATE_THRESHOLD_MINUTES = 20;

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel adds this header)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    console.log('[CRON] Starting late reservation check...');
    
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Calculate time 20 minutes ago
    const twentyMinutesAgo = new Date(now.getTime() - LATE_THRESHOLD_MINUTES * 60 * 1000);
    const lateTimeThreshold = twentyMinutesAgo.toTimeString().slice(0, 5);

    // Find all "Confirmed" reservations for today that haven't been checked in
    // and whose reservation time was more than 20 minutes ago
    const filter = `AND(
      {Date} = '${today}',
      {Status} = 'Confirmed',
      {Time} <= '${lateTimeThreshold}',
      {Checked In At} = BLANK()
    )`;

    const result = await getReservations(filter);

    if (!result.success) {
      console.error('[CRON] Error fetching reservations:', result.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations'
      });
    }

    const lateReservations = result.data.records || [];
    const markedAsNoShow = [];
    const errors = [];

    console.log(`[CRON] Found ${lateReservations.length} late reservations`);

    // Mark each late reservation as no-show
    for (const reservation of lateReservations) {
      const resId = reservation.fields['Reservation ID'];
      const customerName = reservation.fields['Customer Name'];
      const time = reservation.fields['Time'];
      const recordId = reservation.id;

      try {
        // Mark as no-show
        const updateResult = await markReservationAsNoShow(recordId);

        if (updateResult.success) {
          console.log(`[CRON] ✓ Marked as no-show: ${resId} (${customerName} at ${time})`);
          
          // If tables were assigned, release them back to Available status
          const tableIds = reservation.fields['Table IDs'] || [];
          if (tableIds.length > 0) {
            for (const tableId of tableIds) {
              try {
                await updateTable(tableId, {
                  Status: 'Available',
                  'Current Service ID': null
                });
                console.log(`[CRON]   └─ Released table ${tableId}`);
              } catch (tableError) {
                console.error(`[CRON]   └─ Failed to release table ${tableId}:`, tableError);
              }
            }
          }

          markedAsNoShow.push({
            reservation_id: resId,
            customer_name: customerName,
            time: time,
            tables_released: tableIds.length
          });
        } else {
          throw new Error(updateResult.message || 'Update failed');
        }
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
      reservations_checked: lateReservations.length,
      marked_as_no_show: markedAsNoShow.length,
      errors: errors.length,
      details: {
        no_shows: markedAsNoShow,
        errors: errors
      }
    };

    console.log('[CRON] Late reservation check complete:', summary);

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
