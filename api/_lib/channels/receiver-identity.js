'use strict';

const crypto = require('node:crypto');

function normalizedReceiver(provider, raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (provider === 'meta') return /^\d{5,30}$/.test(value) ? value : null;
  if (provider === 'twilio') {
    const digits = value.replace(/^whatsapp:/i, '').replace(/\D/g, '');
    return /^[1-9]\d{8,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (provider === 'waha') return /^[\w-]{1,80}$/.test(value) ? value : null;
  return null;
}

function inboundIdentity(provider, receiver, guest) {
  const normalized = normalizedReceiver(provider, receiver);
  const digits = typeof guest === 'string' ? guest.replace(/\D/g, '') : '';
  if (!normalized || !/^[1-9]\d{8,14}$/.test(digits)) return null;
  return Object.freeze({ provider, receiver: normalized, senderPhone: `+${digits}` });
}

function lockKey(identity) {
  return `inbound:${crypto.createHash('sha256')
    .update(`${identity.provider}\0${identity.receiver}\0${identity.senderPhone}`)
    .digest('hex')}`;
}

function demoRouteId(route) {
  if (route?.restaurant?.id) return route.restaurant.id;
  if (!route?.picker?.length) return null;
  // A shared number's "owner" is its entire eligible restaurant set. A
  // different group must invalidate a demo link, even when both use a picker.
  const ids = route.picker.map(r => r.id).sort().join('\0');
  return `picker-${crypto.createHash('sha256').update(ids).digest('hex').slice(0, 32)}`;
}

function demoConversationId(demoId, route) {
  const owner = demoRouteId(route);
  return owner ? `demo-${demoId}:route:${owner}` : null;
}

// Only a verified receiving account may claim a restaurant. An unknown account
// must never fall through to the first active restaurant in the registry.
function resolveReceiver(identity, restaurants, env = process.env) {
  if (!identity || !Array.isArray(restaurants)) return null;
  const { provider, receiver } = identity;
  const isEligible = (restaurant, channel) => {
    if (!restaurant || (restaurant.whatsapp_provider && restaurant.whatsapp_provider !== channel)) return false;
    if (channel !== 'twilio' && restaurant.id === env.TWILIO_RESTAURANT_ID?.trim()) return false;
    if (channel !== 'waha' && restaurant.id === env.WAHA_RESTAURANT_ID?.trim()) return false;
    return channel === 'meta' || !restaurant.whatsapp_phone_number_id;
  };
  if (provider === 'meta') {
    const matches = restaurants.filter(r =>
      normalizedReceiver('meta', r.whatsapp_phone_number_id) === receiver && isEligible(r, 'meta'));
    if (matches.length > 1) return null;
    if (matches.length === 1) return { restaurant: matches[0], picker: null };
    if (receiver !== normalizedReceiver('meta', env.WHATSAPP_PHONE_NUMBER_ID)) return null;
    const eligible = restaurants.filter(r => !r.whatsapp_phone_number_id && isEligible(r, 'meta'));
    const configured = env.META_RESTAURANT_ID?.trim();
    if (configured) {
      const restaurant = eligible.find(r => r.id === configured);
      return restaurant ? { restaurant, picker: null } : null;
    }
    if (eligible.length === 1) return { restaurant: eligible[0], picker: null };
    return eligible.length > 1 ? { restaurant: null, picker: eligible } : null;
  }
  if (provider === 'twilio' && receiver === normalizedReceiver('twilio', env.TWILIO_WHATSAPP_NUMBER)) {
    const restaurant = restaurants.find(r => r.id === env.TWILIO_RESTAURANT_ID?.trim());
    return isEligible(restaurant, 'twilio') ? { restaurant, picker: null } : null;
  }
  if (provider === 'waha' && receiver === normalizedReceiver('waha', env.WAHA_SESSION)) {
    const restaurant = restaurants.find(r => r.id === env.WAHA_RESTAURANT_ID?.trim());
    return isEligible(restaurant, 'waha') ? { restaurant, picker: null } : null;
  }
  return null;
}

module.exports = { normalizedReceiver, inboundIdentity, lockKey, resolveReceiver,
  demoRouteId, demoConversationId };
