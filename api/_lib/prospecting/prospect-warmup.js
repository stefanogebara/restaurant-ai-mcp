'use strict';

/**
 * Daily send cap / warm-up throttle for cold outreach.
 *
 * Cold B2B WhatsApp at volume risks the number's Meta quality rating and the
 * per-number messaging tier. We cap sends per UTC day and consume-before-send
 * (fail-closed): the slot is reserved before the message goes out, so a crash
 * mid-send can only UNDER-count, never over-send. Backed by Upstash when
 * configured, with an in-memory fallback (single-instance dev).
 *
 * Olivia ran the same warm-up concept on a Postgres advisory lock; on Vercel,
 * Upstash INCR+EXPIRE is the natural primitive (mirrors rate-limit.js).
 */

const { createSecureLogger } = require('../secure-logger');
const { createRedisClient } = require('../redis-client');

const logger = createSecureLogger('ProspectWarmup');

const redis = createRedisClient('ProspectWarmup');

// In-memory fallback: { dayKey -> count }. Reset implicitly as the key rolls over.
const memCounts = new Map();

function dailyCap() {
  const n = parseInt(process.env.PROSPECTING_DAILY_CAP || '40', 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/** UTC day key, e.g. "prospect:sendcap:2026-06-26". */
function dayKey(nowMs = Date.now()) {
  return `prospect:sendcap:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * Reserve one send slot for today. Returns { allowed, count, cap }.
 * fail-closed: increments first; if the new count exceeds the cap, the send is
 * NOT allowed (the consumed increment just keeps the day blocked).
 */
async function consumeSendSlot(nowMs = Date.now()) {
  const cap = dailyCap();
  const key = dayKey(nowMs);
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 26 * 3600); // outlive the UTC day
      return { allowed: count <= cap, count, cap };
    } catch (err) {
      // Fail-CLOSED on infra error: do not risk over-sending cold outreach.
      logger.error('warmup consume failed (blocking send):', err.message);
      return { allowed: false, count: -1, cap };
    }
  }
  const count = (memCounts.get(key) || 0) + 1;
  memCounts.set(key, count);
  return { allowed: count <= cap, count, cap };
}

/** Read today's used count without consuming (for status/UI). */
async function usedToday(nowMs = Date.now()) {
  const key = dayKey(nowMs);
  if (redis) {
    try {
      const v = await redis.get(key);
      return Number(v) || 0;
    } catch {
      return 0;
    }
  }
  return memCounts.get(key) || 0;
}

module.exports = { consumeSendSlot, usedToday, dailyCap };
