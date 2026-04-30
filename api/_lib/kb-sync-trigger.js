/**
 * KB Sync Trigger
 *
 * Awaited (NOT fire-and-forget) wrapper around elevenlabsAgentService.syncKnowledgeBase.
 *
 * Why awaited?
 *   Vercel Lambda terminates as soon as res.json() flushes. A fire-and-forget
 *   sync (.catch only) gets killed mid-API-call, leaving the ElevenLabs voice
 *   agent stuck on stale config. We've already shipped 8 fixes for that exact
 *   pattern (audit-fire-and-forget tracks them). Settings PATCH endpoints can
 *   afford a few extra seconds — that's the right place to await.
 *
 * Why bounded?
 *   ElevenLabs API can hang. We cap the wait at 12s (well under the default
 *   60s Vercel maxDuration), so a stuck integration never freezes a user-
 *   facing settings save.
 *
 * Returns { success, durationMs, error? } — never throws.
 */

const { syncKnowledgeBase } = require('../services/elevenlabsAgentService');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('kb-sync-trigger');

const DEFAULT_TIMEOUT_MS = 12_000;

async function triggerKbSync(restaurantId, options = {}) {
  if (!restaurantId) {
    return { success: false, error: 'restaurant_id_missing', durationMs: 0 };
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const reason = options.reason || 'config_change';
  const start = Date.now();

  try {
    const result = await Promise.race([
      syncKnowledgeBase(restaurantId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('kb_sync_timeout')), timeoutMs)
      ),
    ]);

    const durationMs = Date.now() - start;

    if (result?.success) {
      logger.info('KB synced after config change', { restaurantId, reason, durationMs });
      return { success: true, durationMs, documentId: result.documentId };
    }

    logger.warn('KB sync skipped or failed', {
      restaurantId,
      reason,
      durationMs,
      error: result?.error || 'unknown',
    });
    return { success: false, durationMs, error: result?.error || 'sync_returned_failure' };
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.warn('KB sync error or timeout', {
      restaurantId,
      reason,
      durationMs,
      error: err.message,
    });
    return { success: false, durationMs, error: err.message };
  }
}

module.exports = { triggerKbSync };
