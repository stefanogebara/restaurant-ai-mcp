const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('HostedDepositLinkStatus');

async function decorateHostedDepositLinks(restaurantId, reservations) {
  const ids = reservations
    .filter(r => r.record_id && !r.checked_in && !r.deposit_payment_intent_id && !(r.deposit_amount > 0))
    .map(r => r.record_id);
  if (!ids.length) return reservations;

  try {
    const { data, error } = await supabaseAdmin.rpc('list_hosted_deposit_link_statuses', {
      p_restaurant_id: restaurantId,
      p_booking_ids: ids,
    });
    if (error) throw error;
    const statuses = new Map((data || []).map(row => [row.booking_id, row.link_status]));
    return reservations.map(reservation => {
      const status = statuses.get(reservation.record_id);
      return status ? { ...reservation, deposit_link_status: status } : reservation;
    });
  } catch (error) {
    logger.warn('Deposit link statuses unavailable', { code: error.code });
    return reservations;
  }
}

module.exports = { decorateHostedDepositLinks };
