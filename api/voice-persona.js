const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('voice-persona');

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;
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
      .select('agent_name, agent_greeting')
      .eq('id', restaurantId)
      .single();
    if (error) {
      // Column or table may not exist yet — return defaults instead of 500
      logger.warn('voice-persona GET query error, returning defaults', { error: error.message });
      return res.json({ agent_name: null, agent_greeting: null });
    }
    return res.json({
      agent_name: data?.agent_name || null,
      agent_greeting: data?.agent_greeting || null,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('voice-persona GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;
    const { agent_name, agent_greeting } = req.body || {};

    if (agent_name !== undefined && (typeof agent_name !== 'string' || agent_name.length > 50)) {
      return res.status(400).json({ error: 'agent_name must be a string of max 50 characters' });
    }
    if (agent_greeting !== undefined && (typeof agent_greeting !== 'string' || agent_greeting.length > 200)) {
      return res.status(400).json({ error: 'agent_greeting must be a string of max 200 characters' });
    }

    const updates = {};
    if (agent_name !== undefined) updates.agent_name = agent_name;
    if (agent_greeting !== undefined) updates.agent_greeting = agent_greeting;

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update(updates)
      .eq('id', restaurantId)
      .select('agent_name, agent_greeting')
      .single();
    if (error) throw new Error(error.message);

    logger.info('voice persona updated', { restaurantId });
    return res.json({
      agent_name: data.agent_name,
      agent_greeting: data.agent_greeting,
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('voice-persona PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
