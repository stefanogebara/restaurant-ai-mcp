/**
 * Feature Validation Utility
 *
 * Validates feature vectors before ML model input
 * Checks for missing values, type errors, and range violations
 */

const { ALL_FEATURES, FEATURE_DEFINITIONS } = require('./feature-config');

/**
 * Validate a complete feature vector
 *
 * @param {Object} features - Feature vector to validate
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
function validateFeatureVector(features) {
  const errors = [];
  const warnings = [];

  // 1. Check all 23 features are present
  const missingFeatures = ALL_FEATURES.filter(name => !(name in features));
  if (missingFeatures.length > 0) {
    errors.push(`Missing features: ${missingFeatures.join(', ')}`);
  }

  // 2. Check all features are numeric
  for (const [key, value] of Object.entries(features)) {
    if (typeof value !== 'number') {
      errors.push(`${key} is not numeric: ${typeof value}`);
    }
    if (isNaN(value)) {
      errors.push(`${key} is NaN`);
    }
    if (value === null || value === undefined) {
      errors.push(`${key} is null or undefined`);
    }
  }

  // 3. Validate specific feature ranges
  const rangeChecks = [
    { feature: 'booking_lead_time_hours', min: 0, max: 8760 }, // Max 1 year
    { feature: 'hour_of_day', min: 0, max: 23 },
    { feature: 'day_of_week', min: 0, max: 6 },
    { feature: 'month_of_year', min: 1, max: 12 },
    { feature: 'customer_no_show_rate', min: 0, max: 1 },
    { feature: 'party_size', min: 1, max: 50 },
    { feature: 'party_size_category', min: 0, max: 2 },
    { feature: 'historical_no_show_rate_for_day', min: 0, max: 1 },
    { feature: 'historical_no_show_rate_for_time', min: 0, max: 1 },
    { feature: 'occupancy_rate_for_slot', min: 0, max: 1 }
  ];

  for (const { feature, min, max } of rangeChecks) {
    const value = features[feature];
    if (value !== undefined && value !== null) {
      if (value < min || value > max) {
        errors.push(`${feature} out of range: ${value} (expected ${min}-${max})`);
      }
    }
  }

  // 4. Validate boolean features (must be 0 or 1)
  const booleanFeatures = [
    'is_weekend',
    'is_prime_time',
    'is_repeat_customer',
    'is_large_party',
    'has_special_requests',
    'confirmation_sent',
    'confirmation_clicked'
  ];

  for (const feature of booleanFeatures) {
    const value = features[feature];
    if (value !== undefined && value !== 0 && value !== 1) {
      errors.push(`${feature} must be 0 or 1, got: ${value}`);
    }
  }

  // 5. Logical consistency checks (warnings only)

  // If repeat customer, visit count should be > 0
  if (features.is_repeat_customer === 1 && features.customer_visit_count === 0) {
    warnings.push('is_repeat_customer is 1 but customer_visit_count is 0');
  }

  // If large party, party_size should be >= 6
  if (features.is_large_party === 1 && features.party_size < 6) {
    warnings.push('is_large_party is 1 but party_size < 6');
  }

  // If confirmation clicked, confirmation should be sent
  if (features.confirmation_clicked === 1 && features.confirmation_sent === 0) {
    warnings.push('confirmation_clicked is 1 but confirmation_sent is 0');
  }

  // If weekend, day_of_week should be 0, 5, or 6
  if (features.is_weekend === 1) {
    const day = features.day_of_week;
    if (day !== 0 && day !== 5 && day !== 6) {
      warnings.push(`is_weekend is 1 but day_of_week is ${day} (not Fri/Sat/Sun)`);
    }
  }

  // If prime time, hour should be 18-21
  if (features.is_prime_time === 1) {
    const hour = features.hour_of_day;
    if (hour < 18 || hour > 21) {
      warnings.push(`is_prime_time is 1 but hour_of_day is ${hour} (not 6-9 PM)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    featureCount: Object.keys(features).length,
    expectedCount: 23
  };
}

/**
 * Validate and sanitize feature vector
 *
 * Attempts to fix common issues automatically
 * @param {Object} features - Feature vector to sanitize
 * @returns {Object} - Sanitized feature vector
 */
function sanitizeFeatureVector(features) {
  const sanitized = { ...features };

  // Replace NaN with 0
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'number' && isNaN(value)) {
      console.warn(`[Sanitize] Replacing NaN in ${key} with 0`);
      sanitized[key] = 0;
    }
  }

  // Clamp numeric values to valid ranges
  if (sanitized.hour_of_day !== undefined) {
    sanitized.hour_of_day = Math.max(0, Math.min(23, sanitized.hour_of_day));
  }

  if (sanitized.day_of_week !== undefined) {
    sanitized.day_of_week = Math.max(0, Math.min(6, sanitized.day_of_week));
  }

  if (sanitized.month_of_year !== undefined) {
    sanitized.month_of_year = Math.max(1, Math.min(12, sanitized.month_of_year));
  }

  if (sanitized.customer_no_show_rate !== undefined) {
    sanitized.customer_no_show_rate = Math.max(0, Math.min(1, sanitized.customer_no_show_rate));
  }

  // Ensure boolean features are 0 or 1
  const booleanFeatures = [
    'is_weekend',
    'is_prime_time',
    'is_repeat_customer',
    'is_large_party',
    'has_special_requests',
    'confirmation_sent',
    'confirmation_clicked'
  ];

  for (const feature of booleanFeatures) {
    if (sanitized[feature] !== undefined) {
      sanitized[feature] = sanitized[feature] ? 1 : 0;
    }
  }

  return sanitized;
}

/**
 * Get feature statistics from a dataset
 *
 * @param {Array} featureVectors - Array of feature vectors
 * @returns {Object} - Statistics for each feature
 */
function getFeatureStatistics(featureVectors) {
  if (!featureVectors || featureVectors.length === 0) {
    return {};
  }

  const stats = {};

  for (const featureName of ALL_FEATURES) {
    const values = featureVectors
      .map(fv => fv[featureName])
      .filter(v => v !== null && v !== undefined && !isNaN(v));

    if (values.length === 0) {
      stats[featureName] = { missing: true };
      continue;
    }

    stats[featureName] = {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
      missing: featureVectors.length - values.length
    };
  }

  return stats;
}

/**
 * Print validation report to console
 *
 * @param {Object} validationResult - Result from validateFeatureVector
 * @param {string} identifier - Optional identifier for the feature vector
 */
function printValidationReport(validationResult, identifier = '') {
  const prefix = identifier ? `[${identifier}] ` : '';

  if (validationResult.valid) {
    console.log(`${prefix}✅ Feature vector is valid`);
    console.log(`   ${validationResult.featureCount}/${validationResult.expectedCount} features present`);
  } else {
    console.log(`${prefix}❌ Feature vector is INVALID`);
    console.log(`   ${validationResult.errors.length} errors found`);
  }

  if (validationResult.errors.length > 0) {
    console.log(`\n   Errors:`);
    validationResult.errors.forEach(err => console.log(`   - ${err}`));
  }

  if (validationResult.warnings.length > 0) {
    console.log(`\n   Warnings:`);
    validationResult.warnings.forEach(warn => console.log(`   ⚠️ ${warn}`));
  }
}

module.exports = {
  validateFeatureVector,
  sanitizeFeatureVector,
  getFeatureStatistics,
  printValidationReport
};
