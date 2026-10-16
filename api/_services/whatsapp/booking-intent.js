'use strict';

const { createHash } = require('crypto');

/**
 * The inbound provider message is the retry boundary. Never include fields
 * extracted by the model: on a retry it may change one while the first
 * booking has already committed. A second booking needs a new guest message.
 * Hashing keeps provider IDs out of external_id.
 */
function bookingExternalId(context, restaurantId) {
  const { providerName, receiver, messageId } = context || {};
  if (![providerName, receiver, messageId, restaurantId].every(
    value => typeof value === 'string' && value.length > 0
  )) return null;

  const canonical = [providerName, receiver, messageId, restaurantId];
  return `wa:v1:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

module.exports = { bookingExternalId };
