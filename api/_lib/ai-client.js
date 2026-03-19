/**
 * Centralized AI Client — routes through OpenRouter for cost savings.
 *
 * Uses the Anthropic SDK but points at OpenRouter's API.
 * All files that need AI should import getAI() from here.
 *
 * OpenRouter pricing (as of March 2026):
 * - claude-3.5-sonnet: $3/$15 per MTok (vs $3/$15 direct — same price, better reliability)
 * - claude-3-haiku: $0.25/$1.25 per MTok
 *
 * Env vars:
 * - OPENROUTER_API_KEY: required
 * - AI_MODEL: optional override (default: anthropic/claude-3.5-sonnet)
 */

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('ai-client');

let _client = null;

/**
 * Get the shared AI client. Uses OpenRouter if OPENROUTER_API_KEY is set,
 * falls back to direct Anthropic if only ANTHROPIC_API_KEY is available.
 */
function getAI() {
  if (_client) return _client;

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openRouterKey) {
    _client = new Anthropic({
      apiKey: openRouterKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    logger.info('AI client initialized via OpenRouter');
  } else if (anthropicKey) {
    _client = new Anthropic({ apiKey: anthropicKey });
    logger.info('AI client initialized via direct Anthropic');
  } else {
    throw new Error('No AI API key configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)');
  }

  return _client;
}

/** Default model for most operations */
const AI_MODEL = process.env.AI_MODEL || 'anthropic/claude-3.5-sonnet';

/** Cheap model for extraction/classification tasks */
const AI_MODEL_FAST = process.env.AI_MODEL_FAST || 'anthropic/claude-3-haiku';

module.exports = { getAI, AI_MODEL, AI_MODEL_FAST };
