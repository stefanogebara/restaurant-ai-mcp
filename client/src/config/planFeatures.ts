/**
 * Plan-based feature access configuration
 * Defines which features are available for each subscription tier
 */

export type PlanType = 'basic' | 'professional' | 'trial';

export interface PlanFeatures {
  // Core Dashboard
  overview: boolean;

  // ML & Intelligence
  mlPerformance: boolean;            // No-Show Prevention & ROI tracking
  quickStatsWidget: boolean;         // Quick stats on main dashboard
  interventionPanel: boolean;        // High-risk reservation alerts
  interventionActions: 'none' | 'limited' | 'unlimited';  // Daily intervention limits

  // Analytics & Reporting
  advancedAnalytics: boolean;        // Full analytics dashboard
  weeklyReports: boolean | 'email' | 'pdf';  // Weekly reporting capability
  customReportScheduling: boolean;   // Schedule custom reports
  revenueOpportunities: boolean;     // AI-driven revenue insights

  // Customer Intelligence
  customerLTV: boolean;              // Customer lifetime value tracking
  customerDNA: boolean;              // Behavioral profiling & segmentation
  customerHistory: boolean | 'basic';  // Customer history depth

  // AI Agent Features
  aiAgentTracking: boolean;              // AI Agent call tracking & analytics

  // Waitlist Features
  waitlistManagement: boolean | 'basic';  // Waitlist management
  waitlistPriorityTiers: boolean;    // Priority tiering system
  waitlistSMSNotifications: boolean; // SMS notifications
  smartWaitTimePredictions: boolean; // ML-powered wait time estimates

  // Enterprise Features
  multiLocation: boolean;            // Multi-location support
  whiteLabel: boolean;               // White-label customization
  apiAccess: boolean;                // Full REST API access
  systemObservability: boolean;      // System health monitoring
  prioritySupport: boolean;          // Priority support with SLA

  // Deprecated (kept for backwards compatibility)
  pricingRules?: boolean;
  pricingAnalytics?: boolean;
  segoviaInsights?: boolean;
}

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  basic: {
    // Core Dashboard
    overview: true,

    // ML & Intelligence - Limited
    mlPerformance: false,
    quickStatsWidget: false,
    interventionPanel: false,
    interventionActions: 'none',

    // Analytics & Reporting - Basic Only
    advancedAnalytics: false,
    weeklyReports: false,
    customReportScheduling: false,
    revenueOpportunities: false,

    // Customer Intelligence - Basic
    customerLTV: false,
    customerDNA: false,
    customerHistory: 'basic',

    // AI Agent - All plans get access
    aiAgentTracking: true,

    // Waitlist - Basic
    waitlistManagement: 'basic',
    waitlistPriorityTiers: false,
    waitlistSMSNotifications: false,
    smartWaitTimePredictions: false,

    // Enterprise Features
    multiLocation: false,
    whiteLabel: false,
    apiAccess: false,
    systemObservability: false,
    prioritySupport: false,

    // Deprecated
    pricingRules: false,
    pricingAnalytics: false,
    segoviaInsights: false,
  },

  professional: {
    // Core Dashboard
    overview: true,

    // ML & Intelligence - Full Access with Limits
    mlPerformance: true,
    quickStatsWidget: true,
    interventionPanel: true,
    interventionActions: 'limited',  // 5 interventions per day

    // Analytics & Reporting - View Only
    advancedAnalytics: true,
    weeklyReports: 'email',  // Email reports only
    customReportScheduling: false,
    revenueOpportunities: false,

    // Customer Intelligence - Full
    customerLTV: true,
    customerDNA: false,
    customerHistory: true,

    // AI Agent - All plans get access
    aiAgentTracking: true,

    // Waitlist - Standard
    waitlistManagement: true,
    waitlistPriorityTiers: false,
    waitlistSMSNotifications: true,
    smartWaitTimePredictions: false,

    // Enterprise Features
    multiLocation: false,
    whiteLabel: false,
    apiAccess: false,
    systemObservability: false,
    prioritySupport: false,

    // Deprecated
    pricingRules: true,
    pricingAnalytics: true,
    segoviaInsights: false,
  },

  trial: {
    // Trial gets all Professional features for 14 days
    overview: true,

    // ML & Intelligence
    mlPerformance: true,
    quickStatsWidget: true,
    interventionPanel: true,
    interventionActions: 'limited',

    // Analytics & Reporting
    advancedAnalytics: true,
    weeklyReports: 'email',
    customReportScheduling: false,
    revenueOpportunities: false,

    // Customer Intelligence
    customerLTV: true,
    customerDNA: false,
    customerHistory: true,

    // AI Agent - All plans get access
    aiAgentTracking: true,

    // Waitlist
    waitlistManagement: true,
    waitlistPriorityTiers: false,
    waitlistSMSNotifications: true,
    smartWaitTimePredictions: false,

    // Enterprise Features
    multiLocation: false,
    whiteLabel: false,
    apiAccess: false,
    systemObservability: false,
    prioritySupport: false,

    // Deprecated
    pricingRules: true,
    pricingAnalytics: true,
    segoviaInsights: false,
  },
};

export const PLAN_PRICES = {
  basic: 49.99,
  professional: 99.99,
} as const;

export const PLAN_NAMES = {
  basic: 'Basic',
  professional: 'Professional',
  trial: 'Trial',
} as const;

export const PLAN_DESCRIPTIONS = {
  basic: 'Perfect for single-location restaurants getting started',
  professional: 'Advanced features for growing restaurants',
  trial: '14-day trial with Professional features',
} as const;

/**
 * Intervention limits per plan (daily)
 */
export const INTERVENTION_LIMITS = {
  basic: 0,
  professional: 5,
  trial: 5,
} as const;

/**
 * Check if a specific feature is available for a given plan
 */
export function hasFeatureAccess(
  plan: PlanType | undefined,
  feature: keyof PlanFeatures
): boolean {
  if (!plan) return false;
  const value = PLAN_FEATURES[plan]?.[feature];

  // Handle boolean, string, and complex value types
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== 'none';
  return !!value;
}

/**
 * Get the minimum plan required for a feature
 */
export function getRequiredPlan(feature: keyof PlanFeatures): PlanType | null {
  if (hasFeatureAccess('basic', feature)) return 'basic';
  if (hasFeatureAccess('professional', feature)) return 'professional';
  return null;
}

/**
 * Get daily intervention limit for a plan
 */
export function getInterventionLimit(plan: PlanType | undefined): number {
  if (!plan) return 0;
  return INTERVENTION_LIMITS[plan] ?? 0;
}

/**
 * Check if user has reached intervention limit
 */
export function hasReachedInterventionLimit(
  plan: PlanType | undefined,
  usedToday: number
): boolean {
  const limit = getInterventionLimit(plan);
  if (limit === Infinity) return false;
  return usedToday >= limit;
}
