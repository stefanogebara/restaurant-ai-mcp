/**
 * ML Training Data Status API
 *
 * Check how much training data has been collected and when to retrain
 * Also provides Segovia-specific insights
 */

const { getTrainingDataStats } = require('./ml/data-logger');
const { getSegoviaInsights } = require('./ml/data-logger-supabase');
const { verifyJWT } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('MLTrainingStatus');

module.exports = async (req, res) => {
  const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';
  res.setHeader('Access-Control-Allow-Origin', CLIENT_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'ml_training_status', 60, 60);
  if (rateLimited) return;

  // Require JWT auth — ML stats contain restaurant-specific training data
  // verifyJWT returns null (not throws) for empty/invalid tokens, so check the return value
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const authUser = await verifyJWT(token).catch(() => null);
  if (!authUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { action } = req.query;

  try {
    // Segovia Insights endpoint
    if (action === 'segovia-insights') {
      const insights = await getSegoviaInsights();
      return res.status(200).json({
        success: true,
        data: insights
      });
    }

    // Default: Training stats
    const stats = getTrainingDataStats();

    return res.status(200).json({
      success: true,
      stats,
      message: stats.readyForRetraining
        ? `🎉 Ready to retrain! You have ${stats.completedSamples} completed reservations with outcomes.`
        : `📊 Collecting data... You need ${stats.samplesNeeded} more completed reservations (currently: ${stats.completedSamples}/100).`
    });
  } catch (error) {
    logger.error('[MLTrainingStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get training data status'
    });
  }
};
