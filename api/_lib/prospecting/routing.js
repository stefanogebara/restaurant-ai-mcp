'use strict';

/**
 * Prospecting traffic routing.
 *
 * Cold-outreach runs on a DEDICATED WhatsApp number (its own phone_number_id,
 * under the same WABA/app as the customer-facing reservation number). Inbound
 * replies on that number must NEVER enter the restaurant pipeline
 * (message-processor.js assumes every sender maps to a restaurant_id and would
 * otherwise drop a prospect into a restaurant AI conversation or the restaurant
 * picker). This module is the single source of truth for "is this prospecting
 * traffic?" so the webhook fork and the sender stay in agreement.
 */

/**
 * The dedicated prospecting number's phone_number_id (env-configured).
 * @returns {string|undefined}
 */
function getProspectingPhoneNumberId() {
  return process.env.PROSPECTING_PHONE_NUMBER_ID || undefined;
}

/**
 * True when an inbound webhook's phone_number_id belongs to the prospecting
 * number. Returns false when prospecting isn't configured, so existing
 * restaurant routing is completely unaffected until the number is provisioned.
 *
 * @param {string|null|undefined} phoneNumberId - value.metadata.phone_number_id
 * @returns {boolean}
 */
function isProspectingNumber(phoneNumberId) {
  const prospectingId = getProspectingPhoneNumberId();
  return !!prospectingId && !!phoneNumberId && String(phoneNumberId) === String(prospectingId);
}

/**
 * Extract the phone_number_id from a Meta webhook request body (the value that
 * shouldHandle / the webhook fork inspects).
 *
 * @param {object} body - Parsed Meta webhook payload
 * @returns {string|null}
 */
function phoneNumberIdFromBody(body) {
  return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null;
}

module.exports = {
  getProspectingPhoneNumberId,
  isProspectingNumber,
  phoneNumberIdFromBody,
};
