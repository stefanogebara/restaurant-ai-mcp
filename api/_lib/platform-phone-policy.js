'use strict';

function normalizePhone(number) {
  if (typeof number !== 'string') return null;
  const normalized = number.replace(/[\s\-()]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

// A shared line is reserved for the authenticated Orchestrator + durable
// conversation binding. It must never fall back to a dedicated tenant match.
function isSharedPlatformPhone(number) {
  const shared = normalizePhone(process.env.ELEVENLABS_SHARED_PHONE);
  return shared !== null && normalizePhone(number) === shared;
}

module.exports = { isSharedPlatformPhone };
