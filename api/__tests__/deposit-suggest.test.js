/**
 * Phase AA — deposit-suggest decoration logic.
 */

const { decorateWithDepositSuggestion, DEFAULT_THRESHOLD } = require('../_lib/deposit-suggest');

describe('decorateWithDepositSuggestion', () => {
  const baseReservation = {
    reservation_id: 'RES-1',
    customer_name: 'Alice',
    ml_risk_score: 80,
    ml_risk_level: 'very-high',
    deposit_payment_intent_id: null,
  };

  test('gate 1: deposits disabled → never suggests', () => {
    const out = decorateWithDepositSuggestion(baseReservation, { enabled: false });
    expect(out.deposit_suggested).toBe(false);
    expect(out.deposit_suggested_reason).toBeNull();
  });

  test('gate 1: missing deposit_config → never suggests', () => {
    const out = decorateWithDepositSuggestion(baseReservation, null);
    expect(out.deposit_suggested).toBe(false);
  });

  test('gate 3: deposit already in flight → never suggests', () => {
    const out = decorateWithDepositSuggestion(
      { ...baseReservation, deposit_payment_intent_id: 'pi_test_123' },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(false);
  });

  test('very-high risk + enabled + no existing deposit → suggests', () => {
    const out = decorateWithDepositSuggestion(baseReservation, { enabled: true });
    expect(out.deposit_suggested).toBe(true);
    expect(out.deposit_suggested_reason).toBe('very_high_no_show_risk');
  });

  test('high risk → suggests with the matching reason', () => {
    const out = decorateWithDepositSuggestion(
      { ...baseReservation, ml_risk_level: 'high', ml_risk_score: 60 },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(true);
    expect(out.deposit_suggested_reason).toBe('high_no_show_risk');
  });

  test('medium risk → does NOT suggest', () => {
    const out = decorateWithDepositSuggestion(
      { ...baseReservation, ml_risk_level: 'medium', ml_risk_score: 35 },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(false);
  });

  test('low risk → does NOT suggest', () => {
    const out = decorateWithDepositSuggestion(
      { ...baseReservation, ml_risk_level: 'low', ml_risk_score: 10 },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(false);
  });

  test('no level but score above threshold → suggests by score', () => {
    const out = decorateWithDepositSuggestion(
      { ...baseReservation, ml_risk_level: null, ml_risk_score: 72 },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(true);
    expect(out.deposit_suggested_reason).toMatch(/risk_score_72_above_threshold_/);
  });

  test('no risk data at all → does NOT suggest', () => {
    const out = decorateWithDepositSuggestion(
      { reservation_id: 'RES-no-data', deposit_payment_intent_id: null },
      { enabled: true },
    );
    expect(out.deposit_suggested).toBe(false);
  });

  test('preserves all original fields', () => {
    const out = decorateWithDepositSuggestion(baseReservation, { enabled: true });
    expect(out.reservation_id).toBe('RES-1');
    expect(out.customer_name).toBe('Alice');
    expect(out.ml_risk_score).toBe(80);
  });

  test('default threshold is 51', () => {
    expect(DEFAULT_THRESHOLD).toBe(51);
  });

  test('env override changes threshold', () => {
    process.env.DEPOSIT_SUGGEST_THRESHOLD = '80';
    try {
      const justBelow = decorateWithDepositSuggestion(
        { ml_risk_score: 70, ml_risk_level: null, deposit_payment_intent_id: null },
        { enabled: true },
      );
      expect(justBelow.deposit_suggested).toBe(false);

      const justAbove = decorateWithDepositSuggestion(
        { ml_risk_score: 85, ml_risk_level: null, deposit_payment_intent_id: null },
        { enabled: true },
      );
      expect(justAbove.deposit_suggested).toBe(true);
    } finally {
      delete process.env.DEPOSIT_SUGGEST_THRESHOLD;
    }
  });
});
