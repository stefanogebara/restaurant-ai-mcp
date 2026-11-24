const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('elevenlabs-agent-cleanup');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const user = auth.user;

  const { restaurant_id, action, confirm } = req.body || {};

  if (!restaurant_id || !action) {
    return res.status(400).json({ error: 'restaurant_id and action are required' });
  }

  if (!['deactivate', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'action must be "deactivate" or "delete"' });
  }

  // Validate ownership — user must own the restaurant
  if (user.restaurant_id !== restaurant_id) {
    logger.warn('Unauthorized cleanup attempt', {
      userId: user.sub,
      userRestaurant: user.restaurant_id,
      targetRestaurant: restaurant_id,
    });
    return res.status(403).json({ error: 'You do not own this restaurant' });
  }

  try {
    if (action === 'deactivate') {
      // Clear phone assignment from ai_config
      const { data: config } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('ai_config')
        .eq('id', restaurant_id)
        .single();

      const updatedAiConfig = { ...(config?.ai_config || {}) };
      delete updatedAiConfig.phone;

      const { error: updateError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ ai_config: updatedAiConfig })
        .eq('id', restaurant_id);

      if (updateError) {
        logger.error('Failed to deactivate agent phone', { error: updateError.message });
        return res.status(500).json({ error: 'Failed to deactivate agent' });
      }

      logger.info('Agent phone deactivated', { restaurant_id });
      return res.json({ success: true, action: 'deactivated' });
    }

    if (action === 'delete') {
      if (!confirm) {
        return res.status(400).json({ error: 'confirm: true is required for delete action' });
      }

      const { deleteAgent } = require('./_services/elevenlabsAgentService');
      const result = await deleteAgent(restaurant_id);

      if (!result.success) {
        logger.error('Failed to delete agent', { error: result.error });
        return res.status(500).json({ error: result.error || 'Failed to delete agent' });
      }

      logger.info('Agent deleted', { restaurant_id });
      return res.json({ success: true, action: 'deleted' });
    }
  } catch (err) {
    logger.error('Agent cleanup error', { error: err.message, action, restaurant_id });
    return res.status(500).json({ error: 'Internal error' });
  }
};
