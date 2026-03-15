const {
  findReservation,
  updateReservation,
  query: supabase
} = require('../../_lib/supabase');

const { logCustomerCancelled } = require('../../ml/data-logger');
const { sendReservationCancellationEmail } = require('../../_lib/email');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('HostDashboard');

/**
 * Update Reservation Notes (Segovia Enhanced Notes Feature)
 *
 * Updates reservation with enhanced notes fields:
 * - Dietary restrictions (vegetarian alternatives to cochinillo)
 * - Language preference (Spanish, English, Chinese, French)
 * - Seating preference (Terrace, Window, Indoor, Bar)
 * - Special occasion (Birthday, Anniversary, Business, Tourism)
 * - Customer type (Tourist, Local)
 * - Accessibility needs
 * - Internal staff notes
 * - First-time visitor flag
 */
async function handleUpdateReservation(req, res) {
  const restaurantId = req.user.restaurant_id;
  const {
    reservation_id,
    dietary_restrictions,
    language_preference,
    seating_preference,
    special_occasion,
    customer_type,
    accessibility_needs,
    internal_notes,
    first_time_visitor,
  } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'reservation_id is required'
    });
  }

  // Find the reservation
  const findResult = await findReservation(restaurantId, reservation_id);

  if (!findResult.success || !findResult.reservation) {
    return res.status(404).json({
      success: false,
      error: 'Reservation not found'
    });
  }

  // Build update object with only provided fields
  const updates = {
    updated_at: new Date().toISOString()
  };

  if (dietary_restrictions !== undefined) updates.dietary_restrictions = dietary_restrictions;
  if (language_preference !== undefined) updates.language_preference = language_preference;
  if (seating_preference !== undefined) updates.seating_preference = seating_preference;
  if (special_occasion !== undefined) updates.special_occasion = special_occasion;
  if (customer_type !== undefined) updates.customer_type = customer_type;
  if (accessibility_needs !== undefined) updates.accessibility_needs = accessibility_needs;
  if (internal_notes !== undefined) updates.internal_notes = internal_notes;
  if (first_time_visitor !== undefined) updates.first_time_visitor = first_time_visitor;

  // Update the reservation
  const updateResult = await updateReservation(restaurantId, findResult.reservation.record_id, updates);

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update reservation notes'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Reservation notes updated successfully',
    reservation: {
      reservation_id,
      ...updates
    }
  });
}

/**
 * Cancel a reservation from the dashboard with optional customer notification.
 * Body: { reservation_id, reason? }
 */
async function handleCancelReservation(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { reservation_id, reason } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'reservation_id is required'
    });
  }

  // Find the reservation first to get customer details for notification
  const findResult = await findReservation(restaurantId, { reservation_id });
  if (!findResult.success || !findResult.reservation) {
    return res.status(404).json({
      success: false,
      error: 'Reservation not found'
    });
  }

  const reservation = findResult.reservation;

  // Cancel the reservation
  const updateResult = await updateReservation(restaurantId, reservation.record_id, {
    status: 'cancelled',
    cancellation_reason: reason || null,
    updated_at: new Date().toISOString()
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel reservation'
    });
  }

  // Log cancellation for ML training data
  await logCustomerCancelled(reservation_id).catch(err => {
    logger.warn('ML log failed (non-fatal):', err.message);
  });

  // Fetch restaurant name for the email
  let restaurantName = 'Your Restaurant';
  try {
    const { data: config } = await supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name')
      .eq('restaurant_id', restaurantId)
      .single();
    if (config?.restaurant_name) restaurantName = config.restaurant_name;
  } catch (err) {
    logger.warn('Could not fetch restaurant name for cancellation email:', err.message);
  }

  // Send cancellation email if customer has email
  const customerEmail = reservation.customer_email;
  if (customerEmail) {
    sendReservationCancellationEmail({
      customerEmail,
      customerName: reservation.customer_name,
      restaurantName,
      reservationId: reservation_id,
      partySize: reservation.party_size,
      date: reservation.date,
      time: reservation.time,
      reason: reason || null
    }).catch(err => {
      logger.warn('Cancellation email failed (non-fatal):', err.message);
    });
  }

  logger.info('Reservation cancelled from dashboard', { reservation_id, reason: reason || 'none' });

  return res.status(200).json({
    success: true,
    message: 'Reservation cancelled successfully',
    notification_sent: !!customerEmail
  });
}

module.exports = {
  handleUpdateReservation,
  handleCancelReservation
};
