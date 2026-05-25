/**
 * Cron Job: Generate Guest Memory Reflections
 *
 * Synthesizes high-level reflections from raw guest observations.
 * Implements Park et al.'s reflection mechanism: when a guest accumulates
 * enough observations, the system generates higher-order insights.
 *
 * Example:
 *   Observations: "Ordered fish", "Ordered salmon", "Asked about seafood specials"
 *   Reflection: "This guest consistently prefers seafood dishes"
 *
 * Runs daily at 5 AM UTC via Vercel Cron Jobs
 */

const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { createMemory } = require('../services/guestMemory');
const { initSentry, captureMessage } = require('../_lib/sentry');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
initSentry();

const logger = createSecureLogger('CronReflections');
const MIN_OBSERVATIONS_FOR_REFLECTION = 5;

module.exports = async (req, res) => {
  // Verify cron auth
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — ops can disable via cron_config table.
  if (!(await isCronEnabled('generate-reflections'))) {
    logger.warn('generate-reflections cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    logger.info('Starting daily reflection generation...');

    // Find guests with enough unreflected observations
    // A guest needs MIN_OBSERVATIONS_FOR_REFLECTION observations that haven't been reflected upon
    const { data: candidates, error: queryError } = await supabaseAdmin
      .from('guest_memories')
      .select('restaurant_id, guest_phone')
      .eq('is_active', true)
      .eq('memory_type', 'observation')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);

    if (queryError) throw queryError;

    if (!candidates || candidates.length === 0) {
      logger.info('No candidates for reflection');
      return res.status(200).json({ success: true, reflections: 0 });
    }

    // Group by restaurant + phone and count observations
    const guestMap = new Map();
    for (const row of candidates) {
      const key = `${row.restaurant_id}:${row.guest_phone}`;
      guestMap.set(key, (guestMap.get(key) || 0) + 1);
    }

    // Filter to guests with enough observations
    const eligibleGuests = [];
    for (const [key, count] of guestMap) {
      if (count >= MIN_OBSERVATIONS_FOR_REFLECTION) {
        const [restaurantId, guestPhone] = key.split(':');
        eligibleGuests.push({ restaurantId, guestPhone, count });
      }
    }

    logger.info(`Found ${eligibleGuests.length} guests eligible for reflection`);

    // H14: time budget — bounds the cron well under Vercel's 60s ceiling even
    // as the eligible guest pool grows. Each LLM reflection is ~2-3s; the 20
    // hard cap below is now combined with a 45s wall-clock check so a stuck
    // model call can't blow the function timeout.
    const TIME_BUDGET_MS = 45_000;
    const startTime = Date.now();

    let totalReflections = 0;
    let processed = 0;
    const errors = [];

    // Process each eligible guest (capped at 20/run for cost; time budget
    // stops earlier if the API is slow that day).
    for (const guest of eligibleGuests.slice(0, 20)) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        logger.warn('generate-reflections time budget exceeded', {
          processed,
          eligible: Math.min(eligibleGuests.length, 20),
        });
        break;
      }
      try {
        const count = await generateReflectionsForGuest(
          guest.restaurantId,
          guest.guestPhone
        );
        totalReflections += count;
        processed++;
      } catch (guestErr) {
        logger.error('Error generating reflections for guest:', guestErr.message);
        errors.push({ restaurantId: guest.restaurantId, guestPhone: guest.guestPhone, error: guestErr.message });
        processed++;
      }
    }

    if (errors.length > 0) {
      captureMessage(
        `CronReflections: ${errors.length} guest(s) failed reflection generation`,
        'warning',
        { errors }
      );
    }

    logger.info('Reflection generation complete', {
      eligible: eligibleGuests.length,
      processed: Math.min(eligibleGuests.length, 20),
      reflections: totalReflections
    });

    await logCronRun('generate-reflections', { eligible: eligibleGuests.length, reflections: totalReflections });

    return res.status(200).json({
      success: true,
      eligible: eligibleGuests.length,
      reflections: totalReflections
    });
  } catch (error) {
    logger.error('Reflection cron error:', error.message);
    return res.status(500).json({ success: false, error: 'Reflection generation failed' });
  }
};

/**
 * Generate reflections for a single guest
 */
async function generateReflectionsForGuest(restaurantId, guestPhone) {
  // Fetch recent observations for this guest
  const { data: observations, error } = await supabaseAdmin
    .from('guest_memories')
    .select('content, importance, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('guest_phone', guestPhone)
    .eq('is_active', true)
    .eq('memory_type', 'observation')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !observations || observations.length < MIN_OBSERVATIONS_FOR_REFLECTION) {
    return 0;
  }

  // Check if we've already generated recent reflections (avoid duplicates)
  const { data: recentReflections } = await supabaseAdmin
    .from('guest_memories')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('guest_phone', guestPhone)
    .eq('memory_type', 'reflection')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentReflections && recentReflections.length > 0) {
    return 0; // Already reflected this week
  }

  const observationList = observations
    .map(o => `- ${o.content} (${new Date(o.created_at).toLocaleDateString()})`)
    .join('\n');

  try {
    const client = getAI();

    const response = await client.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Given these observations about a restaurant guest, generate 1-3 high-level reflections that synthesize patterns and insights. Each reflection should be a concise, actionable insight that would help a restaurant host personalize the guest experience.

Observations:
${observationList}

Return a JSON array of reflections, each with:
- "content": The reflection text (one sentence)
- "importance": 7-9 (reflections are always high importance)

Return ONLY a valid JSON array.`
        }
      ]
    });

    const responseText = response.content?.[0]?.text?.trim();
    if (!responseText) return 0;

    let jsonText = responseText;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const reflections = JSON.parse(jsonText);
    if (!Array.isArray(reflections)) return 0;

    let stored = 0;
    for (const ref of reflections.slice(0, 3)) {
      if (!ref.content) continue;

      const result = await createMemory(restaurantId, guestPhone, {
        content: String(ref.content).slice(0, 500),
        memoryType: 'reflection',
        importance: Math.max(7, Math.min(9, parseInt(ref.importance) || 8)),
        sourceType: 'reflection_synthesis'
      });

      if (result) stored++;
    }

    return stored;
  } catch (err) {
    logger.error('Claude reflection error:', err.message);
    return 0;
  }
}
