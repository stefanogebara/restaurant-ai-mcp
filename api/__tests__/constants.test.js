/**
 * Tests for api/_lib/constants.js
 *
 * Pure module with no external deps — tests getDiningDuration (lines 65-77)
 * and exports of named constants.
 */

const {
  getDiningDuration,
  DEFAULT_DINING_DURATION_MINUTES,
  DASHBOARD_POLL_INTERVAL_MS,
  DASHBOARD_STALE_TIME_MS,
  LATE_THRESHOLD_MINUTES,
  FREE_PLAN_MONTHLY_RESERVATIONS,
  MAX_PARTY_SIZE,
  MAX_ADVANCE_BOOKING_DAYS,
  STARTER_PLAN_MONTHLY_RESERVATIONS,
  GROWTH_PLAN_MONTHLY_RESERVATIONS,
} = require('../_lib/constants');

// ---------------------------------------------------------------------------
// Named constant exports
// ---------------------------------------------------------------------------
describe('constants: named exports', () => {
  test('DEFAULT_DINING_DURATION_MINUTES is 90', () => {
    expect(DEFAULT_DINING_DURATION_MINUTES).toBe(90);
  });

  test('DASHBOARD_POLL_INTERVAL_MS is 30000', () => {
    expect(DASHBOARD_POLL_INTERVAL_MS).toBe(30000);
  });

  test('DASHBOARD_STALE_TIME_MS is 25000', () => {
    expect(DASHBOARD_STALE_TIME_MS).toBe(25000);
  });

  test('LATE_THRESHOLD_MINUTES is 20', () => {
    expect(LATE_THRESHOLD_MINUTES).toBe(20);
  });

  test('FREE_PLAN_MONTHLY_RESERVATIONS is 30', () => {
    expect(FREE_PLAN_MONTHLY_RESERVATIONS).toBe(30);
  });

  test('MAX_PARTY_SIZE is 20', () => {
    expect(MAX_PARTY_SIZE).toBe(20);
  });

  test('MAX_ADVANCE_BOOKING_DAYS is 90', () => {
    expect(MAX_ADVANCE_BOOKING_DAYS).toBe(90);
  });

  test('STARTER_PLAN_MONTHLY_RESERVATIONS is 100', () => {
    expect(STARTER_PLAN_MONTHLY_RESERVATIONS).toBe(100);
  });

  test('GROWTH_PLAN_MONTHLY_RESERVATIONS is 300', () => {
    expect(GROWTH_PLAN_MONTHLY_RESERVATIONS).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// getDiningDuration – covers lines 67-76
// ---------------------------------------------------------------------------
describe('getDiningDuration', () => {
  test('returns 90 when called with no arguments (line 76)', () => {
    expect(getDiningDuration()).toBe(90);
  });

  test('returns 90 when called with null (line 76)', () => {
    expect(getDiningDuration(null)).toBe(90);
  });

  test('returns 90 when restaurantInfo has no duration fields', () => {
    expect(getDiningDuration({})).toBe(90);
    expect(getDiningDuration({ restaurant_name: 'Test' })).toBe(90);
  });

  test('returns restaurant-level default_dining_duration when set (line 67-69)', () => {
    const info = { default_dining_duration: 120 };
    expect(getDiningDuration(info)).toBe(120);
  });

  test('returns metric_profile.default_dining_duration when set (lines 72-74)', () => {
    const info = { metric_profile: { default_dining_duration: 75 } };
    expect(getDiningDuration(info)).toBe(75);
  });

  test('prefers restaurant-level over metric_profile when both are set', () => {
    const info = {
      default_dining_duration: 60,
      metric_profile: { default_dining_duration: 45 },
    };
    expect(getDiningDuration(info)).toBe(60);
  });

  test('returns metric_profile value when restaurant-level is missing but metric_profile has it', () => {
    const info = {
      metric_profile: { default_dining_duration: 105 },
    };
    expect(getDiningDuration(info)).toBe(105);
  });

  test('returns default when metric_profile exists but has no duration', () => {
    const info = { metric_profile: { template: 'simple' } };
    expect(getDiningDuration(info)).toBe(90);
  });
});
