/**
 * Feature Flags Configuration
 *
 * Centralized feature flag system for A/B testing and gradual rollouts
 *
 * Usage:
 * const { useCartesia, isFeatureEnabled } = require('./_lib/feature-flags');
 *
 * if (useCartesia()) {
 *   // Use Cartesia TTS
 * } else {
 *   // Use ElevenLabs
 * }
 */

/**
 * Check if Cartesia should be used instead of ElevenLabs
 * @returns {boolean} True if Cartesia should be used
 */
function useCartesia() {
  const flag = process.env.USE_CARTESIA;

  // Default to false (ElevenLabs) if not set
  if (!flag) {
    return false;
  }

  // Parse string to boolean
  return flag.toLowerCase() === 'true' || flag === '1';
}

/**
 * Check if a specific feature is enabled
 * @param {string} featureName - Name of the feature flag
 * @returns {boolean} True if feature is enabled
 */
function isFeatureEnabled(featureName) {
  const envVar = `FEATURE_${featureName.toUpperCase()}`;
  const flag = process.env[envVar];

  if (!flag) {
    return false;
  }

  return flag.toLowerCase() === 'true' || flag === '1';
}

/**
 * Get the active TTS provider based on feature flags
 * @returns {string} 'cartesia' or 'elevenlabs'
 */
function getTTSProvider() {
  return useCartesia() ? 'cartesia' : 'elevenlabs';
}

/**
 * Get configuration for the active TTS provider
 * @returns {Object} Provider configuration
 */
function getTTSConfig() {
  if (useCartesia()) {
    return {
      provider: 'cartesia',
      apiKey: process.env.CARTESIA_API_KEY,
      defaultVoice: 'default',
      features: {
        emotionalTTS: true,
        voiceCloning: true,
        streaming: true,
        laughter: true
      },
      pricing: {
        costPerMinute: 0.00154,
        costPerCharacter: 0.00001
      }
    };
  } else {
    return {
      provider: 'elevenlabs',
      apiKey: process.env.ELEVENLABS_API_KEY,
      defaultVoice: 'default',
      features: {
        conversationalAI: true,
        webhooks: true,
        streaming: true
      },
      pricing: {
        costPerMinute: 0.10
      }
    };
  }
}

/**
 * Log feature flag usage for analytics
 * @param {string} feature - Feature name
 * @param {boolean} enabled - Whether feature was enabled
 */
function logFeatureUsage(feature, enabled) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Feature Flag] ${feature}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // In production, you might want to send this to an analytics service
  // Example: analytics.track('feature_flag_used', { feature, enabled });
}

/**
 * Percentage-based feature rollout
 * Useful for gradual rollouts to a percentage of users
 *
 * @param {string} userId - User identifier
 * @param {number} percentage - Rollout percentage (0-100)
 * @returns {boolean} True if user is in rollout group
 */
function isInRolloutGroup(userId, percentage) {
  if (percentage === 0) return false;
  if (percentage === 100) return true;

  // Simple hash-based distribution
  const hash = userId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const bucket = Math.abs(hash) % 100;
  return bucket < percentage;
}

/**
 * Get all active feature flags
 * Useful for debugging and admin dashboards
 *
 * @returns {Object} All active feature flags
 */
function getAllFeatureFlags() {
  return {
    USE_CARTESIA: useCartesia(),
    TTS_PROVIDER: getTTSProvider(),
    NODE_ENV: process.env.NODE_ENV,
    // Add more feature flags as needed
  };
}

module.exports = {
  useCartesia,
  isFeatureEnabled,
  getTTSProvider,
  getTTSConfig,
  logFeatureUsage,
  isInRolloutGroup,
  getAllFeatureFlags
};
