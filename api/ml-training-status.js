/**
 * ML Training Data Status API
 *
 * Check how much training data has been collected and when to retrain
 * Also provides Segovia-specific insights
 */

const { getTrainingDataStats } = require('./ml/data-logger');
const { getSegoviaInsights } = require('./ml/data-logger-supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
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
    console.error('[MLTrainingStatus] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get training data status'
    });
  }
};
