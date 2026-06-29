'use strict';

/**
 * Shared Upstash Redis client resolver.
 *
 * The REST credential env-var names differ by how the database was provisioned:
 *   - Vercel ↔ Upstash marketplace integration → KV_REST_API_URL / KV_REST_API_TOKEN
 *   - standalone Upstash dashboard             → UPSTASH_REDIS_REST_URL / _TOKEN
 * Either is accepted (integration names first). Returns a configured
 * @upstash/redis client, or null when no REST credentials are present so
 * callers cleanly fall back to their in-memory store.
 *
 * Centralised so the env-var-name knowledge lives in ONE place — rate-limit.js
 * and prospecting/prospect-warmup.js both build clients from these same vars.
 */

const { Redis } = require('@upstash/redis');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('Redis');

/**
 * Build an Upstash Redis client from the environment.
 * @param {string} [label] - caller name, included in the init log line
 * @returns {import('@upstash/redis').Redis | null} client, or null if unconfigured
 */
function createRedisClient(label = 'Redis') {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.info(`[${label}] No Redis REST URL configured, using in-memory store`);
    return null;
  }

  try {
    const client = new Redis({ url, token });
    logger.info(`[${label}] Using Upstash Redis store`);
    return client;
  } catch (err) {
    logger.error(`[${label}] Failed to initialize Redis, falling back to in-memory:`, err.message);
    return null;
  }
}

module.exports = { createRedisClient };
