describe('Deposit Config Validation', () => {
  // Test the validation logic from deposit-config.js inline
  function validateDepositConfig(body) {
    const { enabled, type, amount } = body || {};
    const errors = [];

    if (typeof enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    if (enabled) {
      if (!type || !['flat', 'per_person'].includes(type)) {
        errors.push('type must be "flat" or "per_person"');
      }
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 500) {
        errors.push('amount must be between 1 and 500');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  test('rejects missing enabled field', () => {
    const result = validateDepositConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('enabled must be a boolean');
  });

  test('accepts disabled config without type/amount', () => {
    const result = validateDepositConfig({ enabled: false });
    expect(result.valid).toBe(true);
  });

  test('rejects enabled config without valid type', () => {
    const result = validateDepositConfig({ enabled: true, type: 'invalid', amount: 20 });
    expect(result.valid).toBe(false);
  });

  test('rejects enabled config with amount < 1', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 0.5 });
    expect(result.valid).toBe(false);
  });

  test('rejects enabled config with amount > 500', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 501 });
    expect(result.valid).toBe(false);
  });

  test('accepts valid flat config', () => {
    const result = validateDepositConfig({ enabled: true, type: 'flat', amount: 20 });
    expect(result.valid).toBe(true);
  });

  test('accepts valid per_person config', () => {
    const result = validateDepositConfig({ enabled: true, type: 'per_person', amount: 10 });
    expect(result.valid).toBe(true);
  });
});

describe('Deposit Amount Calculation', () => {
  function calculateDeposit(config, partySize) {
    if (!config.enabled) return 0;
    if (config.type === 'per_person') return config.amount * partySize;
    return config.amount;
  }

  test('flat rate ignores party size', () => {
    expect(calculateDeposit({ enabled: true, type: 'flat', amount: 20 }, 1)).toBe(20);
    expect(calculateDeposit({ enabled: true, type: 'flat', amount: 20 }, 6)).toBe(20);
  });

  test('per_person multiplies by party size', () => {
    expect(calculateDeposit({ enabled: true, type: 'per_person', amount: 10 }, 4)).toBe(40);
    expect(calculateDeposit({ enabled: true, type: 'per_person', amount: 15 }, 2)).toBe(30);
  });

  test('disabled config returns 0', () => {
    expect(calculateDeposit({ enabled: false }, 4)).toBe(0);
  });
});
