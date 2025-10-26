/**
 * ML Model Data (Inline for Serverless Compatibility)
 *
 * This model is exported as a JavaScript module instead of JSON file
 * to avoid file system dependencies in Vercel serverless functions.
 *
 * Version: 1.0.0
 * Trained: 2025-10-25
 * Type: Random Forest (Proof-of-Concept)
 */

module.exports = {
  type: "random_forest",
  trainedAt: "2025-10-25T12:33:01.163Z",
  featureNames: [
    "booking_lead_time_hours",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "is_prime_time",
    "month_of_year",
    "days_until_reservation",
    "is_repeat_customer",
    "customer_visit_count",
    "customer_no_show_rate",
    "customer_avg_party_size",
    "days_since_last_visit",
    "customer_lifetime_value",
    "party_size",
    "party_size_category",
    "is_large_party",
    "has_special_requests",
    "confirmation_sent",
    "confirmation_clicked",
    "hours_since_confirmation_sent",
    "historical_no_show_rate_for_day",
    "historical_no_show_rate_for_time",
    "occupancy_rate_for_slot"
  ],
  config: {
    nEstimators: 100,
    maxDepth: 10,
    minSamplesSplit: 2,
    minSamplesLeaf: 1,
    seed: 42
  },
  model: {
    featureImportance: [
      0,
      1.75,
      0.5,
      0.75,
      0,
      0,
      0,
      1,
      1,
      0,
      0.5,
      980,
      0,
      0.5,
      0.25,
      0.25,
      1,
      0,
      0,
      0,
      0.04000000000000001,
      0.07500000000000001,
      0.1875
    ]
  },
  version: "1.0.0",
  notes: "Proof-of-concept model trained on 7 samples. Use Python XGBoost for production."
};
