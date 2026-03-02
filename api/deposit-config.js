const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('DepositConfig');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      success: false,
      error: authResult.error,
    });
  }
  req.user = authResult.user;
  const restaurantId = req.user.restaurant_id;

  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with account' });
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(restaurantId, res);
    }
    if (req.method === 'PATCH') {
      return await handlePatch(restaurantId, req, res);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    logger.error('Deposit config error:', error.message);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};

async function handleGet(restaurantId, res) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('deposit_config')
    .eq('id', restaurantId)
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch deposit config' });
  }

  return res.status(200).json({
    success: true,
    deposit_config: data.deposit_config || { enabled: false },
  });
}

async function handlePatch(restaurantId, req, res) {
  const { enabled, type, amount } = req.body || {};

  // Validate
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
  }

  if (enabled) {
    if (!type || !['flat', 'per_person'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be "flat" or "per_person"' });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 500) {
      return res.status(400).json({ success: false, error: 'amount must be between 1 and 500' });
    }
  }

  const config = enabled
    ? { enabled: true, type, amount: parseFloat(amount) }
    : { enabled: false };

  const { error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ deposit_config: config })
    .eq('id', restaurantId);

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to update deposit config' });
  }

  logger.info('deposit_config updated', { restaurantId, enabled });
  return res.status(200).json({
    success: true,
    deposit_config: config,
  });
}
