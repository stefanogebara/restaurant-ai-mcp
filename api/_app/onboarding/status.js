const { verifyAuth } = require('../_lib/auth');
const { setInternalCors } = require('../_lib/cors');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { createSecureLogger } = require('../_lib/secure-logger');
const { STEPS, findOwnerRestaurant, getSetupStatus, runSetupStep } = require('../_services/onboardingRecovery');

const logger = createSecureLogger('OnboardingStatus');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const retry = req.method === 'POST';
  if (retry && await checkAndApplyRateLimit(req, res, 'onboarding_step_retry')) return;
  const auth = await verifyAuth(req);
  const userId = auth.user?.sub || auth.user?.id;
  if (!userId) return res.status(auth.status || 401).json({ error: 'Unauthorized' });

  try {
    const config = await findOwnerRestaurant(userId);
    let status = await getSetupStatus(config);
    if (retry) {
      const { step, restaurant_id: restaurantId } = req.body || {};
      if (!STEPS.includes(step)) return res.status(400).json({ error: 'Unknown setup step' });
      if (!config || config.id !== restaurantId) return res.status(403).json({ error: 'Restaurant owner required' });
      if (status.steps[step]?.retry) await runSetupStep(config, step);
      status = await getSetupStatus(await findOwnerRestaurant(userId));
    }
    return res.status(200).json(status);
  } catch (error) {
    logger.warn('Could not load onboarding setup', { error: error.message });
    return res.status(503).json({ error: 'Setup status unavailable' });
  }
};
