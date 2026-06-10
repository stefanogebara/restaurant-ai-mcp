// Waitlist/queue handler for WhatsApp AI agent
// Invoked by the AI tool-calling system when customers want to join or check the queue

const { addToWaitlist, getWaitlistByPhone, getWaitlistPosition, getAverageWaitTime } = require('../../_lib/db/waitlist');
const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WaitlistHandler');

/**
 * Add a customer to the walk-in queue via WhatsApp.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} customerName - Customer's name
 * @param {number} partySize - Number of guests
 * @param {string} whatsappPhone - Customer's WhatsApp phone (E.164)
 * @returns {Promise<Object>} { success, position, estimatedWait, message }
 */
async function addCustomerToQueue(restaurantId, customerName, partySize, whatsappPhone) {
  try {
    // 1. Check if customer already in queue
    const existingResult = await getWaitlistByPhone(restaurantId, whatsappPhone);
    const existing = existingResult.success ? existingResult.entry : null;

    if (existing) {
      // Already in queue — return current position
      const posResult = await getWaitlistPosition(restaurantId, existing.id, existing.added_at);
      const position = posResult.success ? posResult.position : 1;
      const waitResult = await getAverageWaitTime(restaurantId);
      const estimatedWait = waitResult.success ? waitResult.averageMinutes : 20;

      logger.info('Customer already in queue', {
        restaurantId,
        position,
        partySize: existing.party_size,
      });

      return {
        success: true,
        alreadyInQueue: true,
        position,
        estimatedWait,
        customerName: existing.customer_name,
        message: `You're already in the queue at position ${position}. Estimated wait: ~${estimatedWait} minutes.`,
      };
    }

    // 2. Add to waitlist
    const result = await addToWaitlist(restaurantId, {
      customer_name: customerName,
      customer_phone: whatsappPhone,
      customer_whatsapp: whatsappPhone,
      source: 'whatsapp',
      party_size: partySize,
      notes: 'Added via WhatsApp',
    });

    if (!result.success) {
      logger.error('Failed to add customer to waitlist', { restaurantId, error: result.error });
      return {
        success: false,
        message: 'Sorry, could not add you to the queue right now. Please try again.',
      };
    }

    // 3. Get position and estimated wait
    const posResult = await getWaitlistPosition(restaurantId, result.entry.id, result.entry.added_at);
    const position = posResult.success ? posResult.position : 1;
    const waitResult = await getAverageWaitTime(restaurantId);
    const estimatedWait = waitResult.success ? waitResult.averageMinutes : 20;

    logger.info('Customer added to queue via WhatsApp', {
      restaurantId,
      position,
      partySize,
      waitlistId: result.entry.waitlist_id,
    });

    return {
      success: true,
      alreadyInQueue: false,
      position,
      estimatedWait,
      waitlistId: result.entry.waitlist_id,
      message: `Added to the queue! Position: ${position}. Estimated wait: ~${estimatedWait} minutes.`,
    };
  } catch (err) {
    logger.error('Error adding customer to queue', err);
    return {
      success: false,
      message: 'Sorry, something went wrong. Please try again.',
    };
  }
}

/**
 * Check a customer's current position in the queue.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} whatsappPhone - Customer's WhatsApp phone (E.164)
 * @returns {Promise<Object>} { success, position, estimatedWait, customerName }
 */
async function checkQueuePosition(restaurantId, whatsappPhone) {
  try {
    const existingResult = await getWaitlistByPhone(restaurantId, whatsappPhone);
    const existing = existingResult.success ? existingResult.entry : null;

    if (!existing) {
      return {
        success: false,
        message: 'You are not currently in the queue. Would you like to join?',
      };
    }

    const posResult = await getWaitlistPosition(restaurantId, existing.id, existing.added_at);
    const position = posResult.success ? posResult.position : 1;
    const waitResult = await getAverageWaitTime(restaurantId);
    const estimatedWait = waitResult.success ? waitResult.averageMinutes : 20;

    logger.info('Queue position checked via WhatsApp', {
      restaurantId,
      position,
      customerName: existing.customer_name,
    });

    return {
      success: true,
      position,
      estimatedWait,
      customerName: existing.customer_name,
      partySize: existing.party_size,
      message: `${existing.customer_name}, you're at position ${position}. Estimated wait: ~${estimatedWait} minutes.`,
    };
  } catch (err) {
    logger.error('Error checking queue position', err);
    return {
      success: false,
      message: 'Sorry, could not check your position right now. Please try again.',
    };
  }
}

module.exports = {
  addCustomerToQueue,
  checkQueuePosition,
};
