const { createHmac, timingSafeEqual } = require('node:crypto');

const WINDOW_SECONDS = 600;

function timeBucket() {
  return Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
}

function sign(restaurantId, bucket, secret) {
  return createHmac('sha256', secret).update(`${restaurantId}:${bucket}`).digest();
}

function issueBookingToken(restaurantId) {
  return sign(restaurantId, timeBucket(), process.env.BOOKING_HMAC_SECRET).toString('hex');
}

function verifyBookingToken(restaurantId, token) {
  const secret = process.env.BOOKING_HMAC_SECRET;
  if (!secret || !restaurantId || typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const provided = Buffer.from(token, 'hex');
  const bucket = timeBucket();
  // A guest can cross one bucket boundary between requesting and using it.
  return [bucket, bucket - 1].some(value => timingSafeEqual(sign(restaurantId, value, secret), provided));
}

module.exports = { issueBookingToken, verifyBookingToken, WINDOW_SECONDS };
