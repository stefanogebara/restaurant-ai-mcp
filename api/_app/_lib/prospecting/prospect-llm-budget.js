'use strict';

/**
 * Global hourly LLM-call budget for the prospecting agent.
 *
 * Cost circuit-breaker, not a pacing tool: normal operation never touches the
 * cap; a runaway responder loop, an inbound flood after a mass dispatch, or a
 * gym session gone wrong does. Counts every getAI().messages.create() across
 * the prospecting stack in a fixed UTC-hour window — Upstash INCR+EXPIRE like
 * prospect-warmup, with an in-memory fallback (single-instance dev).
 *
 * Callers degrade on exhaustion, never crash:
 *  - responder: read-only gate BEFORE the per-inbound claim → defers the turn
 *    via reply_apos (the flush cron retries every 15 min)
 *  - agent / reflect / enrich / sim: consume-before-call → each module's
 *    existing no-LLM fallback ('nada', empty facts, 'juiz indisponível', …)
 *
 * Fail-OPEN on infra errors (cron-config's posture): a Redis blip must not
 * mute the agent — the 'prospecting-agent' kill switch is the hard mute. The
 * counter INCRements even when it refuses (mirrors warmup: the consumed slot
 * keeps the hour blocked; there is no refund path to reason about).
 */

const { createSecureLogger } = require('../secure-logger');
const { createRedisClient } = require('../redis-client');

const logger = createSecureLogger('ProspectLlmBudget');

const redis = createRedisClient('ProspectLlmBudget');

const DEFAULT_HOURLY_CAP = 250;

// In-memory fallback: { hourKey -> count }. Old hours pruned on write.
const memCounts = new Map();

/**
 * Calls allowed per UTC hour. PROSPECTING_LLM_HOURLY_CAP (when a positive
 * integer) is the operator override; anything else falls back to the default.
 */
function hourlyCap() {
  const env = parseInt(process.env.PROSPECTING_LLM_HOURLY_CAP || '', 10);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_HOURLY_CAP;
}

/** UTC hour key, e.g. "prospect:llmcap:2026-07-06T14". */
function hourKey(nowMs = Date.now()) {
  return `prospect:llmcap:${new Date(nowMs).toISOString().slice(0, 13)}`;
}

/**
 * Consume one LLM-call slot for the current hour.
 * @returns {Promise<{allowed: boolean, count: number, cap: number}>}
 */
async function consumeLlmCall(nowMs = Date.now()) {
  const cap = hourlyCap();
  const key = hourKey(nowMs);
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 2 * 3600); // outlive the hour
      if (count === cap + 1) {
        logger.error(`LLM hourly budget EXHAUSTED (cap=${cap}) — prospecting LLM calls degrade until the next hour`);
      }
      return { allowed: count <= cap, count, cap };
    } catch (err) {
      // Fail-OPEN: a Redis blip must not mute the agent (kill switch is the hard mute).
      logger.warn('llm budget consume failed (allowing call):', err.message);
      return { allowed: true, count: -1, cap };
    }
  }
  const count = (memCounts.get(key) || 0) + 1;
  for (const k of memCounts.keys()) if (k !== key) memCounts.delete(k);
  memCounts.set(key, count);
  if (count === cap + 1) {
    logger.error(`LLM hourly budget EXHAUSTED (cap=${cap}) — prospecting LLM calls degrade until the next hour`);
  }
  return { allowed: count <= cap, count, cap };
}

/** Read this hour's used count without consuming (status/UI). */
async function usedThisHour(nowMs = Date.now()) {
  const key = hourKey(nowMs);
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

/**
 * Read-only check: is there budget left this hour? Used by the responder
 * BEFORE the per-inbound claim, so a deferred turn stays claimable and the
 * flush retry actually answers it. Fail-open (usedThisHour → 0 on error).
 */
async function budgetDisponivel(nowMs = Date.now()) {
  return (await usedThisHour(nowMs)) < hourlyCap();
}

/** Consume-or-throw for call sites whose catch path already degrades safely. */
async function exigirOrcamentoLlm(nowMs = Date.now()) {
  const b = await consumeLlmCall(nowMs);
  if (!b.allowed) throw new Error(`orçamento de LLM esgotado (${b.count}/${b.cap} nesta hora)`);
}

/** Test hook — the memory fallback is module state. */
function _resetMemory() {
  memCounts.clear();
}

module.exports = {
  DEFAULT_HOURLY_CAP,
  hourlyCap,
  hourKey,
  consumeLlmCall,
  usedThisHour,
  budgetDisponivel,
  exigirOrcamentoLlm,
  _resetMemory,
};
