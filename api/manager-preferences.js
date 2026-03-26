const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('manager-preferences');

const ALLOWED_PREF_KEYS = new Set([
  'morning_briefing',
  'end_of_day_briefing',
  'briefing_channel',
  'alert_low_covers',
  'alert_high_noshows',
  'alert_late_cancellations',
  'pre_reservation_upsell',
  'analytics_briefing_enabled',
  'analytics_briefing_phone',
]);

module.exports = async (req, res) => {
  const rateLimited = await checkAndApplyRateLimit(req, res, 'manager_preferences', 30, 60);
  if (rateLimited) return;

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('notification_preferences')
      .eq('id', restaurantId)
      .single();
    if (error) throw new Error(error.message);
    return res.json({ notification_preferences: data?.notification_preferences || {} });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('manager-preferences GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;
    const updates = req.body || {};

    // Validate: only allow known preference keys
    const invalidKeys = Object.keys(updates).filter(k => !ALLOWED_PREF_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: `Invalid preference keys: ${invalidKeys.join(', ')}` });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No preference keys provided' });
    }

    // Read existing preferences
    const { data: existing, error: fetchError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('notification_preferences')
      .eq('id', restaurantId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const merged = { ...(existing?.notification_preferences || {}), ...updates };

    // Write merged preferences back
    const { data: updated, error: updateError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ notification_preferences: merged })
      .eq('id', restaurantId)
      .select('notification_preferences')
      .single();
    if (updateError) throw new Error(updateError.message);

    logger.info('notification_preferences updated', { restaurantId, keys: Object.keys(updates) });
    return res.json({ notification_preferences: updated.notification_preferences });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('manager-preferences PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
