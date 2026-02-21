import { describe, test, expect } from 'vitest';
import {
  PLAN_FEATURES,
  PLAN_PRICES,
  PLAN_NAMES,
  INTERVENTION_LIMITS,
  hasFeatureAccess,
  getRequiredPlan,
  getInterventionLimit,
  hasReachedInterventionLimit,
} from '../planFeatures';

describe('PLAN_FEATURES - free plan', () => {
  const free = PLAN_FEATURES.free;

  test('free plan exists', () => {
    expect(free).toBeDefined();
  });

  test('free plan has overview access', () => {
    expect(free.overview).toBe(true);
  });

  test('free plan has no voice AI', () => {
    expect(free.voiceAI).toBe(false);
  });

  test('free plan has no ML performance', () => {
    expect(free.mlPerformance).toBe(false);
  });

  test('free plan has no SMS notifications', () => {
    expect(free.waitlistSMSNotifications).toBe(false);
  });

  test('free plan has no advanced analytics', () => {
    expect(free.advancedAnalytics).toBe(false);
  });

  test('free plan intervention actions is none', () => {
    expect(free.interventionActions).toBe('none');
  });

  test('free plan has basic waitlist management', () => {
    expect(free.waitlistManagement).toBe('basic');
  });

  test('free plan has basic customer history', () => {
    expect(free.customerHistory).toBe('basic');
  });
});

describe('PLAN_PRICES', () => {
  test('free plan is 0', () => {
    expect(PLAN_PRICES.free).toBe(0);
  });

  test('starter plan is 29', () => {
    expect(PLAN_PRICES.starter).toBe(29);
  });

  test('growth plan is 99', () => {
    expect(PLAN_PRICES.growth).toBe(99);
  });

  test('scale plan is 199', () => {
    expect(PLAN_PRICES.scale).toBe(199);
  });

  test('includes free plan', () => {
    expect('free' in PLAN_PRICES).toBe(true);
  });
});

describe('PLAN_NAMES', () => {
  test('free plan name is Free', () => {
    expect(PLAN_NAMES.free).toBe('Free');
  });

  test('starter plan name is Starter', () => {
    expect(PLAN_NAMES.starter).toBe('Starter');
  });

  test('includes all plan types', () => {
    expect(PLAN_NAMES.free).toBeDefined();
    expect(PLAN_NAMES.starter).toBeDefined();
    expect(PLAN_NAMES.growth).toBeDefined();
    expect(PLAN_NAMES.scale).toBeDefined();
    expect(PLAN_NAMES.trial).toBeDefined();
  });
});

describe('INTERVENTION_LIMITS', () => {
  test('free plan has 0 interventions', () => {
    expect(INTERVENTION_LIMITS.free).toBe(0);
  });

  test('starter plan has 0 interventions', () => {
    expect(INTERVENTION_LIMITS.starter).toBe(0);
  });

  test('growth plan has 5 interventions', () => {
    expect(INTERVENTION_LIMITS.growth).toBe(5);
  });

  test('scale plan has Infinity interventions', () => {
    expect(INTERVENTION_LIMITS.scale).toBe(Infinity);
  });

  test('trial plan has 5 interventions', () => {
    expect(INTERVENTION_LIMITS.trial).toBe(5);
  });

  test('includes free plan', () => {
    expect('free' in INTERVENTION_LIMITS).toBe(true);
  });
});

describe('hasFeatureAccess', () => {
  test('returns false for undefined plan', () => {
    expect(hasFeatureAccess(undefined, 'overview')).toBe(false);
  });

  test('free plan has overview access', () => {
    expect(hasFeatureAccess('free', 'overview')).toBe(true);
  });

  test('free plan has no voice AI', () => {
    expect(hasFeatureAccess('free', 'voiceAI')).toBe(false);
  });

  test('growth plan has voice AI', () => {
    expect(hasFeatureAccess('growth', 'voiceAI')).toBe(true);
  });

  test('scale plan has API access', () => {
    expect(hasFeatureAccess('scale', 'apiAccess')).toBe(true);
  });

  test('handles string values - interventionActions none returns false', () => {
    expect(hasFeatureAccess('free', 'interventionActions')).toBe(false);
  });

  test('handles string values - interventionActions limited returns true', () => {
    expect(hasFeatureAccess('growth', 'interventionActions')).toBe(true);
  });

  test('starter plan has ai agent tracking', () => {
    expect(hasFeatureAccess('starter', 'aiAgentTracking')).toBe(true);
  });

  test('free plan has no ai agent tracking', () => {
    expect(hasFeatureAccess('free', 'aiAgentTracking')).toBe(false);
  });
});

describe('getRequiredPlan', () => {
  test('overview requires free plan', () => {
    expect(getRequiredPlan('overview')).toBe('free');
  });

  test('voiceAI requires growth plan', () => {
    expect(getRequiredPlan('voiceAI')).toBe('growth');
  });

  test('advancedAnalytics requires growth plan', () => {
    expect(getRequiredPlan('advancedAnalytics')).toBe('growth');
  });

  test('apiAccess requires scale plan', () => {
    expect(getRequiredPlan('apiAccess')).toBe('scale');
  });

  test('systemObservability requires scale plan', () => {
    expect(getRequiredPlan('systemObservability')).toBe('scale');
  });

  test('aiAgentTracking requires starter plan', () => {
    expect(getRequiredPlan('aiAgentTracking')).toBe('starter');
  });
});

describe('getInterventionLimit', () => {
  test('returns 0 for undefined plan', () => {
    expect(getInterventionLimit(undefined)).toBe(0);
  });

  test('returns 0 for free plan', () => {
    expect(getInterventionLimit('free')).toBe(0);
  });

  test('returns 5 for growth plan', () => {
    expect(getInterventionLimit('growth')).toBe(5);
  });

  test('returns Infinity for scale plan', () => {
    expect(getInterventionLimit('scale')).toBe(Infinity);
  });
});

describe('hasReachedInterventionLimit', () => {
  test('free plan is always at limit', () => {
    expect(hasReachedInterventionLimit('free', 0)).toBe(true);
  });

  test('growth plan not at limit with 3 used', () => {
    expect(hasReachedInterventionLimit('growth', 3)).toBe(false);
  });

  test('growth plan at limit with 5 used', () => {
    expect(hasReachedInterventionLimit('growth', 5)).toBe(true);
  });

  test('scale plan never at limit', () => {
    expect(hasReachedInterventionLimit('scale', 9999)).toBe(false);
  });

  test('undefined plan is always at limit', () => {
    expect(hasReachedInterventionLimit(undefined, 0)).toBe(true);
  });
});
