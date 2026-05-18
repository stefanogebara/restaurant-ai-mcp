/**
 * Tests for api/_lib/currency.js
 *
 * Locks the contract that Stripe deposits resolve to the correct currency
 * based on the restaurant's country (no more silent EUR-mis-charging for
 * Brazilian / US restaurants) and that explicit overrides win.
 */

const { resolveDepositCurrency, minChargeAmount } = require('../_lib/currency');

describe('resolveDepositCurrency', () => {
  test('returns "brl" for Brazil (English name)', () => {
    expect(resolveDepositCurrency('Brazil')).toBe('brl');
  });

  test('returns "brl" for Brazil (native name)', () => {
    expect(resolveDepositCurrency('Brasil')).toBe('brl');
  });

  test('returns "brl" for ISO code "BR"', () => {
    expect(resolveDepositCurrency('BR')).toBe('brl');
  });

  test('returns "eur" for eurozone country (Spain)', () => {
    expect(resolveDepositCurrency('Spain')).toBe('eur');
    expect(resolveDepositCurrency('España')).toBe('eur');
    expect(resolveDepositCurrency('ES')).toBe('eur');
  });

  test('returns "eur" for Italy / France / Germany', () => {
    expect(resolveDepositCurrency('Italy')).toBe('eur');
    expect(resolveDepositCurrency('France')).toBe('eur');
    expect(resolveDepositCurrency('Germany')).toBe('eur');
  });

  test('returns "usd" for United States and Canada', () => {
    expect(resolveDepositCurrency('United States')).toBe('usd');
    expect(resolveDepositCurrency('US')).toBe('usd');
    expect(resolveDepositCurrency('Canada')).toBe('usd');
  });

  test('returns "gbp" for United Kingdom', () => {
    expect(resolveDepositCurrency('United Kingdom')).toBe('gbp');
    expect(resolveDepositCurrency('GB')).toBe('gbp');
    expect(resolveDepositCurrency('UK')).toBe('gbp');
  });

  test('falls back to "eur" for unknown country', () => {
    expect(resolveDepositCurrency('Atlantis')).toBe('eur');
    expect(resolveDepositCurrency(null)).toBe('eur');
    expect(resolveDepositCurrency(undefined)).toBe('eur');
    expect(resolveDepositCurrency('')).toBe('eur');
  });

  // Explicit override — restaurant operator picks a currency that doesn't
  // match their country (e.g. an Argentinian beachfront place billing US
  // tourists in USD). The override wins regardless of country.
  test('explicit override beats country mapping', () => {
    expect(resolveDepositCurrency('Brazil', 'usd')).toBe('usd');
    expect(resolveDepositCurrency('Italy', 'gbp')).toBe('gbp');
  });

  test('override is normalised to lowercase', () => {
    expect(resolveDepositCurrency('Brazil', 'USD')).toBe('usd');
    expect(resolveDepositCurrency('Brazil', 'UsD')).toBe('usd');
  });

  test('malformed override is ignored, falls through to country mapping', () => {
    expect(resolveDepositCurrency('Brazil', 'dollars')).toBe('brl');
    expect(resolveDepositCurrency('Brazil', '$$$')).toBe('brl');
    expect(resolveDepositCurrency('Brazil', '12')).toBe('brl');
    expect(resolveDepositCurrency('Brazil', '')).toBe('brl');
  });
});

describe('minChargeAmount', () => {
  test('returns the Stripe minimum for known currencies', () => {
    expect(minChargeAmount('usd')).toBe(0.50);
    expect(minChargeAmount('eur')).toBe(0.50);
    expect(minChargeAmount('brl')).toBe(0.50);
    expect(minChargeAmount('gbp')).toBe(0.30);
  });

  test('returns MXN minimum (~10 pesos)', () => {
    expect(minChargeAmount('mxn')).toBe(10.00);
  });

  test('case-insensitive currency code', () => {
    expect(minChargeAmount('USD')).toBe(0.50);
    expect(minChargeAmount('BRL')).toBe(0.50);
  });

  test('falls back to 0.50 for unknown currencies', () => {
    expect(minChargeAmount('xyz')).toBe(0.50);
    expect(minChargeAmount(null)).toBe(0.50);
    expect(minChargeAmount(undefined)).toBe(0.50);
  });
});
