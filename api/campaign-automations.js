/**
 * Campaign Automations API
 *
 * GET:   List automations for the authenticated restaurant
 * PATCH: Update automation (enable/disable, channel, delay, review URL)
 *
 * Auth: JWT required (restaurant owner/member)
 */

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('campaign-automations');

const VALID_TRIGGER_TYPES = [
  'post_visit_thank_you',
  'birthday_reminder',
  'anniversary_reminder',
  'lapsed_30d',
  'lapsed_60d',
  'lapsed_90d',
  'review_request',
];

const VALID_CHANNELS = ['email', 'whatsapp'];

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

/**
 * GET: List all automations for the restaurant.
 * Initializes default rows if none exist (one per trigger type).
 */
async function handleGet(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;

    // Fetch existing automations
    let { data: automations, error } = await supabaseAdmin
      .schema('restaurant')
      .from('campaign_automations')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('trigger_type');

    if (error) {
      // Table may not exist yet — return empty defaults
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return res.json({ automations: VALID_TRIGGER_TYPES.map(t => ({ trigger_type: t, enabled: false, template_name: null, delay_hours: 24 })) });
      }
      logger.error('Failed to fetch automations', { error: error.message });
      return res.status(500).json({ error: 'Failed to fetch automations' });
    }

    // Initialize default rows if no automations exist yet
    if (!automations || automations.length === 0) {
      const defaults = VALID_TRIGGER_TYPES.map(triggerType => ({
        restaurant_id: restaurantId,
        trigger_type: triggerType,
        enabled: false,
        channel: 'email',
        delay_minutes: triggerType === 'review_request' ? 240 : 120,
      }));

      const { data: inserted, error: insertError } = await supabaseAdmin
        .schema('restaurant')
        .from('campaign_automations')
        .insert(defaults)
        .select('*');

      if (insertError) {
        logger.error('Failed to initialize automations', { error: insertError.message });
        return res.status(500).json({ error: 'Failed to initialize automations' });
      }

      automations = inserted || [];
    }

    return res.status(200).json({ success: true, data: automations });
  } catch (err) {
    logger.error('campaign-automations GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

/**
 * PATCH: Update a specific automation.
 * Body: { trigger_type, enabled?, channel?, delay_minutes?, google_review_url? }
 */
async function handlePatch(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const restaurantId = user.restaurant_id;
    const { trigger_type, enabled, channel, delay_minutes, google_review_url } = req.body || {};

    // Validate trigger_type
    if (!trigger_type || !VALID_TRIGGER_TYPES.includes(trigger_type)) {
      return res.status(400).json({ error: `Invalid trigger_type. Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` });
    }

    // Build update object (only provided fields)
    const updates = { updated_at: new Date().toISOString() };

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }
      updates.enabled = enabled;
    }

    if (channel !== undefined) {
      if (!VALID_CHANNELS.includes(channel)) {
        return res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` });
      }
      updates.channel = channel;
    }

    if (delay_minutes !== undefined) {
      if (typeof delay_minutes !== 'number' || delay_minutes < 0 || delay_minutes > 10080) {
        return res.status(400).json({ error: 'delay_minutes must be a number between 0 and 10080 (7 days)' });
      }
      updates.delay_minutes = delay_minutes;
    }

    if (google_review_url !== undefined) {
      if (google_review_url !== null && typeof google_review_url !== 'string') {
        return res.status(400).json({ error: 'google_review_url must be a string or null' });
      }
      if (google_review_url && google_review_url.length > 500) {
        return res.status(400).json({ error: 'google_review_url must be 500 characters or less' });
      }
      updates.google_review_url = google_review_url;
    }

    // Upsert the automation row
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('campaign_automations')
      .upsert({
        restaurant_id: restaurantId,
        trigger_type,
        ...updates,
      }, { onConflict: 'restaurant_id,trigger_type' })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update automation', { error: error.message });
      return res.status(500).json({ error: 'Failed to update automation' });
    }

    logger.info('Automation updated', { restaurantId, trigger_type });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('campaign-automations PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
