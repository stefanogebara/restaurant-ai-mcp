/**
 * Cron Job: Compress Guest Memories
 *
 * Generative-Agents-style memory hygiene. As tenants accumulate
 * observations (raw events: "ordered fish", "asked about specials"),
 * the working set for three-factor retrieval grows quickly — one of
 * our production restaurants has ~1k observations for ~80 distinct
 * guests, slowing every Manager AI call.
 *
 * generate-reflections.js already synthesizes observations into higher-
 * order reflections. Once a reflection covers a guest, the underlying
 * observations are noise — they were already summarized. This cron
 * deactivates them (is_active=false) so the retrieve_guest_memories RPC
 * stops surfacing them while keeping the row around for audit.
 *
 * Compression rules (any one triggers deactivation):
 *   1. Observation is >COVERED_BY_REFLECTION_AGE_DAYS old AND the same
 *      (restaurant_id, guest_phone) has at least one reflection created
 *      AFTER the observation.
 *   2. Observation is >OBSERVATION_HARD_TTL_DAYS old regardless of
 *      reflections (very old raw data has poor signal).
 *   3. Importance is below LOW_SIGNAL_THRESHOLD AND age > LOW_SIGNAL_AGE_DAYS.
 *
 * Reflections themselves are never deactivated — they're the compressed
 * signal. Facts (separate type, e.g. dietary restrictions) are also
 * preserved indefinitely.
 *
 * Schedule: weekly Saturdays 04:00 UTC ("0 4 * * 6") — same low-traffic
 * window as other cleanup crons.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

const logger = createSecureLogger('CompressMemories');

const JOB_NAME = 'compress-memories';

const COVERED_BY_REFLECTION_AGE_DAYS = 14;  // observations covered by a newer reflection
const OBSERVATION_HARD_TTL_DAYS = 90;       // hard age limit on raw observations
const LOW_SIGNAL_THRESHOLD = 4;             // importance < this is low-signal
const LOW_SIGNAL_AGE_DAYS = 30;             // …and older than this gets dropped
const TIME_BUDGET_MS = 45_000;              // stay well under Vercel 60s ceiling
const MAX_RESTAURANTS_PER_RUN = 100;        // safety cap

module.exports = async (req, res) => {
  // ---- Auth gate -------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // ---- Kill switch (Phase V.5 pattern) --------------------------------
  if (!(await isCronEnabled(JOB_NAME))) {
    logger.warn(`${JOB_NAME} cron disabled by ops, skipping run`);
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const start = Date.now();
  const stats = {
    restaurants_processed: 0,
    deactivated_covered: 0,      // rule 1
    deactivated_hard_ttl: 0,     // rule 2
    deactivated_low_signal: 0,   // rule 3
    errors: 0,
  };

  try {
    // Per-restaurant compaction — only touch restaurants that have memories.
    const { data: restaurants, error: restError } = await supabaseAdmin
      .from('guest_memories')
      .select('restaurant_id')
      .eq('is_active', true)
      .eq('memory_type', 'observation')
      .limit(10_000); // upper bound; we'll dedupe in JS
    if (restError) throw restError;

    const restaurantIds = [...new Set((restaurants || []).map((r) => r.restaurant_id))]
      .slice(0, MAX_RESTAURANTS_PER_RUN);

    for (const restaurantId of restaurantIds) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        logger.warn('compress-memories time budget hit, stopping early', stats);
        break;
      }
      try {
        await compressForRestaurant(restaurantId, stats);
        stats.restaurants_processed++;
      } catch (err) {
        logger.error('compress-memories: per-restaurant failure', {
          restaurantId,
          error: err.message,
        });
        stats.errors++;
      }
    }

    await logCronRun(JOB_NAME, stats);
    return res.status(200).json({ success: true, ...stats });
  } catch (error) {
    await logCronError(JOB_NAME, error);
    logger.error('compress-memories fatal', { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Compress memories for one restaurant.
 * Mutates the `stats` object passed in.
 */
async function compressForRestaurant(restaurantId, stats) {
  const now = Date.now();
  const coveredCutoff = new Date(now - COVERED_BY_REFLECTION_AGE_DAYS * 86400000).toISOString();
  const hardCutoff = new Date(now - OBSERVATION_HARD_TTL_DAYS * 86400000).toISOString();
  const lowSignalCutoff = new Date(now - LOW_SIGNAL_AGE_DAYS * 86400000).toISOString();

  // ---- Rule 2: hard TTL on observations --------------------------------
  // Cheapest scan; do it first so the other rules run on a smaller set.
  {
    const { data, error, count } = await supabaseAdmin
      .from('guest_memories')
      .update({ is_active: false }, { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .eq('memory_type', 'observation')
      .eq('is_active', true)
      .lt('created_at', hardCutoff)
      .select('id');
    if (error) throw error;
    const n = (data || []).length || count || 0;
    stats.deactivated_hard_ttl += n;
  }

  // ---- Rule 3: low signal + age ---------------------------------------
  {
    const { data, error, count } = await supabaseAdmin
      .from('guest_memories')
      .update({ is_active: false }, { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .eq('memory_type', 'observation')
      .eq('is_active', true)
      .lt('importance', LOW_SIGNAL_THRESHOLD)
      .lt('created_at', lowSignalCutoff)
      .select('id');
    if (error) throw error;
    const n = (data || []).length || count || 0;
    stats.deactivated_low_signal += n;
  }

  // ---- Rule 1: covered by a newer reflection ---------------------------
  // We can't express "EXISTS reflection > observation.created_at" directly
  // through supabase-js without an RPC. Two-query approach:
  //   a. List active observations older than coveredCutoff for this restaurant.
  //   b. List the (guest_phone, max(reflection.created_at)) for the same restaurant.
  //   c. JS-side: deactivate the observation IDs that have a newer reflection.
  const { data: obsRows, error: obsErr } = await supabaseAdmin
    .from('guest_memories')
    .select('id, guest_phone, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('memory_type', 'observation')
    .eq('is_active', true)
    .lt('created_at', coveredCutoff);
  if (obsErr) throw obsErr;

  if (!obsRows || obsRows.length === 0) return;

  const { data: reflRows, error: reflErr } = await supabaseAdmin
    .from('guest_memories')
    .select('guest_phone, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('memory_type', 'reflection')
    .eq('is_active', true);
  if (reflErr) throw reflErr;

  // Build {guest_phone → latest reflection createdAt epoch}.
  const latestReflectionMs = new Map();
  for (const r of (reflRows || [])) {
    const ms = new Date(r.created_at).getTime();
    const prev = latestReflectionMs.get(r.guest_phone) || 0;
    if (ms > prev) latestReflectionMs.set(r.guest_phone, ms);
  }

  const idsToDeactivate = [];
  for (const o of obsRows) {
    const obsMs = new Date(o.created_at).getTime();
    const refMs = latestReflectionMs.get(o.guest_phone) || 0;
    if (refMs > obsMs) idsToDeactivate.push(o.id);
  }

  if (idsToDeactivate.length === 0) return;

  // Batch in chunks of 500 to keep query strings reasonable.
  for (let i = 0; i < idsToDeactivate.length; i += 500) {
    const batch = idsToDeactivate.slice(i, i + 500);
    const { error: deactErr, data: deactData } = await supabaseAdmin
      .from('guest_memories')
      .update({ is_active: false })
      .in('id', batch)
      .select('id');
    if (deactErr) throw deactErr;
    stats.deactivated_covered += (deactData || []).length || 0;
  }
}
