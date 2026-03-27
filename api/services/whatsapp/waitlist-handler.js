// Waitlist/queue handler for WhatsApp AI agent
// Invoked by the AI tool-calling system when customers want to join or check the queue

const { addToWaitlist, getWaitlistEntries, getWaitlistCount } = require('../../_lib/db/waitlist');
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
    const existing = await getWaitlistByPhone(restaurantId, whatsappPhone);

    if (existing) {
      // Already in queue — return current position
      const position = await getQueuePosition(restaurantId, existing.added_at);
      const estimatedWait = await getAverageWaitTime(restaurantId, position);

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
    const position = await getQueuePosition(restaurantId, result.entry.added_at);
    const estimatedWait = await getAverageWaitTime(restaurantId, position);

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
    const existing = await getWaitlistByPhone(restaurantId, whatsappPhone);

    if (!existing) {
      return {
        success: false,
        message: 'You are not currently in the queue. Would you like to join?',
      };
    }

    const position = await getQueuePosition(restaurantId, existing.added_at);
    const estimatedWait = await getAverageWaitTime(restaurantId, position);

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

// ---- Internal helpers ----

/**
 * Find an active waitlist entry by phone number.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} phone - Customer phone (E.164)
 * @returns {Promise<Object|null>} Waitlist entry or null
 */
async function getWaitlistByPhone(restaurantId, phone) {
  const result = await getWaitlistEntries(restaurantId, { active: true, limit: 200 });

  if (!result.success || !result.entries) {
    return null;
  }

  // Normalize phone for comparison (strip + and non-digits)
  const normalizedPhone = phone.replace(/\D/g, '');

  return result.entries.find(entry => {
    if (!entry.customer_phone) return false;
    const entryPhone = entry.customer_phone.replace(/\D/g, '');
    return entryPhone === normalizedPhone;
  }) || null;
}

/**
 * Get the 1-based position of an entry in the active queue.
 * Position is based on added_at ordering (FIFO).
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} addedAt - ISO timestamp of the entry
 * @returns {Promise<number>} 1-based position
 */
async function getQueuePosition(restaurantId, addedAt) {
  const result = await getWaitlistEntries(restaurantId, { active: true, limit: 200 });

  if (!result.success || !result.entries) {
    return 1;
  }

  // Entries are already ordered by added_at ascending
  const position = result.entries.findIndex(e => e.added_at === addedAt);
  return position >= 0 ? position + 1 : result.entries.length + 1;
}

/**
 * Estimate wait time based on position.
 * Uses a simple heuristic: ~10 minutes per position ahead in queue.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {number} position - 1-based queue position
 * @returns {Promise<number>} Estimated wait in minutes
 */
async function getAverageWaitTime(restaurantId, position) {
  // Simple heuristic: ~10 min per party ahead
  // Could be enhanced with historical turn times in the future
  const MINUTES_PER_POSITION = 10;
  return Math.max(5, (position - 1) * MINUTES_PER_POSITION);
}

module.exports = {
  addCustomerToQueue,
  checkQueuePosition,
};
