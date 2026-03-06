const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('staffing-config');

module.exports = async (req, res) => {
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
      .select('staffing_config')
      .eq('id', restaurantId)
      .single();
    if (error) throw new Error(error.message);
    return res.json({ staffing_config: data?.staffing_config || null });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('staffing-config GET error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePatch(req, res) {
  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
    const restaurantId = user.restaurant_id;
    const body = req.body || {};

    if (!Array.isArray(body.roles)) {
      return res.status(400).json({ error: 'roles must be an array' });
    }
    for (const role of body.roles) {
      if (!role.name || typeof role.covers_per_staff !== 'number') {
        return res.status(400).json({ error: 'Each role must have name (string) and covers_per_staff (number)' });
      }
    }

    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ staffing_config: body })
      .eq('id', restaurantId)
      .select('staffing_config')
      .single();
    if (error) throw new Error(error.message);

    logger.info('staffing_config updated', { restaurantId, roleCount: body.roles.length });
    return res.json({ staffing_config: data.staffing_config });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Unauthorized' });
    logger.error('staffing-config PATCH error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
