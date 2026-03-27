/**
 * Plan-based feature access configuration
 * Defines which features are available for each subscription tier
 */

export type PlanType = 'free' | 'starter' | 'growth' | 'professional' | 'scale' | 'trial';

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
  voiceAI: boolean;                      // Voice AI agent access
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

}

export const PLAN_FEATURES: Record<PlanType, PlanFeatures> = {
  free: {
    // Core Dashboard
    overview: true,

    // ML & Intelligence - None
    mlPerformance: false,
    quickStatsWidget: false,
    interventionPanel: false,
    interventionActions: 'none',

    // Analytics & Reporting - Basic Only
    advancedAnalytics: false,
    weeklyReports: false,
    customReportScheduling: false,
    revenueOpportunities: false,

    // Customer Intelligence - None
    customerLTV: false,
    customerDNA: false,
    customerHistory: 'basic',

    // AI Agent - None
    voiceAI: false,
    aiAgentTracking: false,

    // Waitlist - Basic
    waitlistManagement: 'basic',
    waitlistPriorityTiers: false,
    waitlistSMSNotifications: false,
    smartWaitTimePredictions: false,

    // Enterprise Features - None
    multiLocation: false,
    whiteLabel: false,
    apiAccess: false,
    systemObservability: false,
    prioritySupport: false,
  },

  starter: {
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

    // AI Agent
    voiceAI: false,
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

  },

  growth: {
    // Core Dashboard
    overview: true,

    // ML & Intelligence - Full Access with Limits
    mlPerformance: true,
    quickStatsWidget: true,
    interventionPanel: true,
    interventionActions: 'limited',  // 5 interventions per day

    // Analytics & Reporting - Full + Waitlist
    advancedAnalytics: true,
    weeklyReports: 'email',
    customReportScheduling: false,
    revenueOpportunities: false,

    // Customer Intelligence - Full
    customerLTV: true,
    customerDNA: true,
    customerHistory: true,

    // AI Agent - Voice AI included
    voiceAI: true,
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

  },

  professional: {
    // Professional plan has same features as Growth
    overview: true,

    // ML & Intelligence - Full Access with Limits
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
    customerDNA: true,
    customerHistory: true,

    // AI Agent
    voiceAI: true,
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

  },

  scale: {
    // Core Dashboard
    overview: true,

    // ML & Intelligence - Full Access
    mlPerformance: true,
    quickStatsWidget: true,
    interventionPanel: true,
    interventionActions: 'unlimited',

    // Analytics & Reporting - Full + Priority support
    advancedAnalytics: true,
    weeklyReports: 'pdf',
    customReportScheduling: true,
    revenueOpportunities: true,

    // Customer Intelligence - Full
    customerLTV: true,
    customerDNA: true,
    customerHistory: true,

    // AI Agent - All channels
    voiceAI: true,
    aiAgentTracking: true,

    // Waitlist - Full
    waitlistManagement: true,
    waitlistPriorityTiers: true,
    waitlistSMSNotifications: true,
    smartWaitTimePredictions: true,

    // Enterprise Features
    multiLocation: false,
    whiteLabel: false,
    apiAccess: true,
    systemObservability: true,
    prioritySupport: true,

  },

  trial: {
    // Trial gets all Growth features for 14 days
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
    customerDNA: true,
    customerHistory: true,

    // AI Agent
    voiceAI: true,
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

  },
};

export const PLAN_PRICES_BRL = {
  free: 0,
  starter: 497,
  growth: 1497,
  professional: 1497,
  scale: 2997,
} as const;

export const PLAN_PRICES_USD = {
  free: 0,
  starter: 97,
  growth: 297,
  professional: 297,
  scale: 597,
} as const;

/** @deprecated Use PLAN_PRICES_BRL or getPlanPrices() instead */
export const PLAN_PRICES = PLAN_PRICES_BRL;

/**
 * Get plan prices for the given currency.
 */
export function getPlanPrices(currency: 'BRL' | 'USD'): { free: number; starter: number; growth: number; professional: number; scale: number } {
  return currency === 'BRL' ? PLAN_PRICES_BRL : PLAN_PRICES_USD;
}

export const PLAN_NAMES = {
  free: 'Grátis',
  starter: 'Essencial',
  growth: 'Profissional',
  professional: 'Profissional',
  scale: 'Enterprise',
  trial: 'Teste',
} as const;

export const PLAN_DESCRIPTIONS = {
  free: 'Comece sem custo — até 30 reservas/mês',
  starter: 'WhatsApp AI + reservas para seu restaurante',
  growth: 'Voice AI + WhatsApp + analytics completo',
  professional: 'Voice AI + WhatsApp + analytics completo',
  scale: 'IA ilimitada para restaurantes de alto volume',
  trial: 'Teste de 14 dias com recursos do Profissional',
} as const;

/**
 * Intervention limits per plan (daily)
 */
export const INTERVENTION_LIMITS = {
  free: 0,
  starter: 0,
  growth: 5,
  professional: 5,
  scale: Infinity,
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
  if (hasFeatureAccess('free', feature)) return 'free';
  if (hasFeatureAccess('starter', feature)) return 'starter';
  if (hasFeatureAccess('growth', feature)) return 'growth';
  // professional has same features as growth, no need to check separately
  if (hasFeatureAccess('scale', feature)) return 'scale';
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
