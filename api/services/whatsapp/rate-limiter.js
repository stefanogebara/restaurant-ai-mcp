// Per-phone rate limiting (10 messages per minute)

const phoneRateLimits = new Map();

function isRateLimited(phone) {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  let timestamps = phoneRateLimits.get(phone) || [];
  timestamps = timestamps.filter(ts => ts > oneMinuteAgo);
  if (timestamps.length >= 10) return true;
  timestamps.push(now);
  phoneRateLimits.set(phone, timestamps);
  return false;
}

// .unref() so Jest workers (and any short-lived require) can exit cleanly.
// The interval still fires while the long-running serverless instance is up.
const cleanupInterval = setInterval(() => {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [phone, timestamps] of phoneRateLimits) {
    const active = timestamps.filter(ts => ts > oneMinuteAgo);
    if (active.length === 0) phoneRateLimits.delete(phone);
    else phoneRateLimits.set(phone, active);
  }
}, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === 'function') cleanupInterval.unref();

module.exports = { isRateLimited };
