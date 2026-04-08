'use strict';

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('validate-env');

const CRITICAL_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CRON_SECRET',
];

function validateEnv(required) {
  const missing = required.filter(k => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function validateCritical() {
  validateEnv(CRITICAL_VARS);
}

/**
 * Warn (dev/staging) or throw (production) for missing critical env vars at module load time.
 * Called automatically on first import.
 */
function warnMissing() {
  const missing = CRITICAL_VARS.filter(k => !process.env[k]?.trim());
  if (missing.length === 0) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[validate-env] Missing critical env vars in production: ${missing.join(', ')}`);
  }
  logger.warn(`Missing critical env vars: ${missing.join(', ')}`);
}

// Auto-warn on import
warnMissing();

module.exports = { validateEnv, validateCritical, CRITICAL_VARS };
