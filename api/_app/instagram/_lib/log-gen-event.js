/**
 * Fire-and-forget logger for AI generation events. Used by both
 * generate-image.js and generate-video.js after a successful upload to
 * Supabase Storage. NEVER throws — a logging failure cannot block the
 * user's actual generation.
 *
 * The kind/provider/model/cost_cents/asset_url columns are denormalized
 * snapshots: if we change pricing or model names later, historical rows
 * still reflect what was charged at write time.
 */

const { supabaseAdmin } = require('../../_lib/supabase');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('ai-gen-event');

/**
 * Log a generation event. Returns void — caller should not await for
 * the result if they want to short-circuit on logging failure.
 *
 * Parameters
 *   restaurantId  UUID from JWT
 *   kind          'image' | 'video'
 *   provider      'openai' | 'gemini' | 'higgsfield' | ...
 *   model         model slug (e.g. 'gpt-image-1', 'nano-banana')
 *   costCents     INTEGER cents charged for this gen
 *   promptChars   prompt length in characters (used for debug, not billing)
 *   assetUrl      Supabase Storage URL of the generated asset (nullable)
 */
async function logGenEvent({ restaurantId, kind, provider, model, costCents, promptChars, assetUrl }) {
  try {
    const { error } = await supabaseAdmin
      .schema('restaurant')
      .from('ai_generation_events')
      .insert({
        restaurant_id: restaurantId,
        kind,
        provider,
        model,
        cost_cents: typeof costCents === 'number' && costCents >= 0 ? Math.floor(costCents) : 0,
        prompt_chars: typeof promptChars === 'number' && promptChars >= 0 ? Math.floor(promptChars) : 0,
        asset_url: assetUrl || null,
      });
    if (error) {
      logger.warn('gen event log failed', { restaurantId, kind, provider, err: error.message });
    }
  } catch (err) {
    // Never let a logging path throw into the user's request.
    logger.warn('gen event log threw', { err: err?.message || String(err) });
  }
}

module.exports = { logGenEvent };
