/**
 * Subscription Limits Tests
 *
 * Tests for plan limits, features, and reservation checks.
 */

const {
  PLAN_LIMITS,
  getPlanLimits,
  hasFeature,
  checkReservationLimit,
  getUpgradeMessage,
  getPlanFromPriceId,
} = require('../services/subscription-limits');

describe('PLAN_LIMITS structure', () => {
  test('free plan exists with correct reservation limit', () => {
    expect(PLAN_LIMITS.free).toBeDefined();
    expect(PLAN_LIMITS.free.maxReservationsPerMonth).toBe(30);
    expect(PLAN_LIMITS.free.name).toBe('Free');
  });

  test('starter plan exists with correct reservation limit', () => {
    expect(PLAN_LIMITS.starter).toBeDefined();
    expect(PLAN_LIMITS.starter.maxReservationsPerMonth).toBe(100);
    expect(PLAN_LIMITS.starter.name).toBe('Starter');
  });

  test('growth plan exists with correct reservation limit', () => {
    expect(PLAN_LIMITS.growth).toBeDefined();
    expect(PLAN_LIMITS.growth.maxReservationsPerMonth).toBe(150);
    expect(PLAN_LIMITS.growth.name).toBe('Growth');
  });

  test('scale plan has unlimited reservations', () => {
    expect(PLAN_LIMITS.scale).toBeDefined();
    expect(PLAN_LIMITS.scale.maxReservationsPerMonth).toBe(-1);
    expect(PLAN_LIMITS.scale.name).toBe('Scale');
  });

  test('free plan restricts voice AI', () => {
    expect(PLAN_LIMITS.free.voiceAI).toBe(false);
  });

  test('free plan restricts SMS notifications', () => {
    expect(PLAN_LIMITS.free.smsNotifications).toBe(false);
  });

  test('free plan restricts waitlist management', () => {
    expect(PLAN_LIMITS.free.waitlistManagement).toBe(false);
  });

  test('growth plan enables voice AI', () => {
    expect(PLAN_LIMITS.growth.voiceAI).toBe(true);
  });

  test('growth plan enables SMS notifications', () => {
    expect(PLAN_LIMITS.growth.smsNotifications).toBe(true);
  });

  test('growth plan enables waitlist management', () => {
    expect(PLAN_LIMITS.growth.waitlistManagement).toBe(true);
  });

  test('scale plan enables custom integrations', () => {
    expect(PLAN_LIMITS.scale.customIntegrations).toBe(true);
  });

  test('starter plan restricts voice AI', () => {
    expect(PLAN_LIMITS.starter.voiceAI).toBe(false);
  });
});

describe('getPlanLimits', () => {
  test('returns correct limits for free plan', () => {
    const limits = getPlanLimits('free');
    expect(limits).toBeDefined();
    expect(limits.maxReservationsPerMonth).toBe(30);
  });

  test('returns correct limits for Free (uppercase)', () => {
    const limits = getPlanLimits('Free');
    expect(limits).toBeDefined();
    expect(limits.maxReservationsPerMonth).toBe(30);
  });

  test('returns correct limits for starter', () => {
    const limits = getPlanLimits('starter');
    expect(limits).toBeDefined();
    expect(limits.maxReservationsPerMonth).toBe(100);
  });

  test('returns correct limits for growth', () => {
    const limits = getPlanLimits('growth');
    expect(limits).toBeDefined();
    expect(limits.maxReservationsPerMonth).toBe(150);
  });

  test('returns correct limits for scale', () => {
    const limits = getPlanLimits('scale');
    expect(limits).toBeDefined();
    expect(limits.maxReservationsPerMonth).toBe(-1);
  });

  test('returns null for unknown plan', () => {
    expect(getPlanLimits('unknown')).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(getPlanLimits(undefined)).toBeNull();
  });

  test('returns null for null', () => {
    expect(getPlanLimits(null)).toBeNull();
  });
});

describe('hasFeature', () => {
  test('free plan has ai_reservations', () => {
    expect(hasFeature('free', 'ai_reservations')).toBe(true);
  });

  test('free plan has host_dashboard', () => {
    expect(hasFeature('free', 'host_dashboard')).toBe(true);
  });

  test('free plan has basic_analytics', () => {
    expect(hasFeature('free', 'basic_analytics')).toBe(true);
  });

  test('free plan does not have advanced_analytics', () => {
    expect(hasFeature('free', 'advanced_analytics')).toBe(false);
  });

  test('free plan does not have voice_ai', () => {
    expect(hasFeature('free', 'voice_ai')).toBe(false);
  });

  test('free plan does not have sms_notifications', () => {
    expect(hasFeature('free', 'sms_notifications')).toBe(false);
  });

  test('growth plan has voice_ai', () => {
    expect(hasFeature('growth', 'voice_ai')).toBe(true);
  });

  test('growth plan has advanced_analytics', () => {
    expect(hasFeature('growth', 'advanced_analytics')).toBe(true);
  });

  test('scale plan has custom_integrations', () => {
    expect(hasFeature('scale', 'custom_integrations')).toBe(true);
  });

  test('returns false for unknown plan', () => {
    expect(hasFeature('unknown', 'ai_reservations')).toBe(false);
  });
});

describe('checkReservationLimit', () => {
  test('free plan allows when under limit', () => {
    const result = checkReservationLimit('free', 10);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.current).toBe(10);
  });

  test('free plan blocks when at limit', () => {
    const result = checkReservationLimit('free', 30);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(30);
    expect(result.current).toBe(30);
  });

  test('free plan blocks when over limit', () => {
    const result = checkReservationLimit('free', 35);
    expect(result.allowed).toBe(false);
  });

  test('starter plan allows when under limit', () => {
    const result = checkReservationLimit('starter', 50);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
  });

  test('starter plan blocks at 100', () => {
    const result = checkReservationLimit('starter', 100);
    expect(result.allowed).toBe(false);
  });

  test('growth plan allows when under 150', () => {
    const result = checkReservationLimit('growth', 100);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(150);
  });

  test('scale plan always allows (unlimited)', () => {
    const result = checkReservationLimit('scale', 5000);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
  });

  test('returns not allowed for unknown plan', () => {
    const result = checkReservationLimit('unknown', 0);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
  });
});

describe('getUpgradeMessage', () => {
  test('returns message for advanced_analytics', () => {
    const msg = getUpgradeMessage('advanced_analytics', 'free');
    expect(msg).toContain('analytics');
    expect(msg).toContain('Growth');
  });

  test('returns message for waitlist_management', () => {
    const msg = getUpgradeMessage('waitlist_management', 'starter');
    expect(msg).toContain('waitlist');
    expect(msg).toContain('Growth');
  });

  test('returns fallback message for unknown feature', () => {
    const msg = getUpgradeMessage('unknown_feature', 'free');
    expect(msg).toContain('premium feature');
    expect(msg).toContain('Growth');
  });
});
