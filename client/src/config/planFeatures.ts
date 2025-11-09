/**
 * Plan-based feature access configuration
 * Defines which features are available for each subscription tier
 */

export type PlanType = 'basic' | 'professional' | 'enterprise' | 'trial';

export interface PlanFeatures {
  // Dashboard Pages
  overview: boolean;
  mlPerformance: boolean;
  customerLTV: boolean;
  pricingRules: boolean;
  pricingAnalytics: boolean;
  customerDNA: boolean;
  segoviaInsights: boolean;

  // Future features
  waitlistManagement?: boolean;
  advancedAnalytics?: boolean;
  multiLocation?: boolean;
  whiteLabel?: boolean;
}

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  basic: {
    overview: true,
    mlPerformance: false,
    customerLTV: false,
    pricingRules: false,
    pricingAnalytics: false,
    customerDNA: false,
    segoviaInsights: false,
  },
  professional: {
    overview: true,
    mlPerformance: true,
    customerLTV: true,
    pricingRules: true,
    pricingAnalytics: true,
    customerDNA: true,
    segoviaInsights: false,
  },
  enterprise: {
    overview: true,
    mlPerformance: true,
    customerLTV: true,
    pricingRules: true,
    pricingAnalytics: true,
    customerDNA: true,
    segoviaInsights: true,
    waitlistManagement: true,
    advancedAnalytics: true,
    multiLocation: true,
    whiteLabel: true,
  },
  trial: {
    // Trial gets all Professional features
    overview: true,
    mlPerformance: true,
    customerLTV: true,
    pricingRules: true,
    pricingAnalytics: true,
    customerDNA: true,
    segoviaInsights: false,
  },
};

export const PLAN_PRICES = {
  basic: 49.99,
  professional: 99.99,
  enterprise: 199.99,
} as const;

export const PLAN_NAMES = {
  basic: 'Basic',
  professional: 'Professional',
  enterprise: 'Enterprise',
  trial: 'Trial',
} as const;

/**
 * Check if a specific feature is available for a given plan
 */
export function hasFeatureAccess(
  plan: PlanType | undefined,
  feature: keyof PlanFeatures
): boolean {
  if (!plan) return false;
  return PLAN_FEATURES[plan]?.[feature] ?? false;
}

/**
 * Get the minimum plan required for a feature
 */
export function getRequiredPlan(feature: keyof PlanFeatures): PlanType | null {
  if (PLAN_FEATURES.basic[feature]) return 'basic';
  if (PLAN_FEATURES.professional[feature]) return 'professional';
  if (PLAN_FEATURES.enterprise[feature]) return 'enterprise';
  return null;
}
