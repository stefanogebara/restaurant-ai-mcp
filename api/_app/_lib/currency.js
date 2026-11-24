/**
 * Server-side currency resolver — port of client/src/utils/currency.ts's
 * `currencyFromCountry`, scoped to what Stripe needs.
 *
 * The Stripe API expects ISO 4217 currency codes (lowercase) on PaymentIntent
 * creation. This module maps a restaurant's country (free-form name or ISO
 * code) to that lowercase Stripe currency. Restaurants can override per
 * deposit_config.currency for edge cases (e.g. an Argentinian restaurant
 * billing tourists in USD).
 *
 * Also exposes per-currency Stripe minimums — Stripe rejects PaymentIntent
 * amounts below the local equivalent of ~$0.50, but the threshold is
 * different by currency. Without per-currency mins, a BRL restaurant
 * configuring a R$0.30 deposit would fail at Stripe with a cryptic error.
 */

const DEFAULT_CURRENCY = 'eur';

// Stripe minimum charge amounts (in MAJOR units — same units as the
// deposit_config.amount field). Pulled from Stripe's docs:
//   https://stripe.com/docs/currencies#minimum-and-maximum-charge-amounts
// Pad slightly when in doubt — Stripe's actual table is in minor units
// (cents), so 50 cents = 0.50 major. Currencies not in this table fall
// back to the EUR-equivalent (0.50).
const MIN_CHARGE_AMOUNT = {
  usd: 0.50,
  eur: 0.50,
  brl: 0.50,
  gbp: 0.30,
  cad: 0.50,
  aud: 0.50,
  mxn: 10.00, // Stripe MXN minimum is ~10 pesos
};

/**
 * Resolve the Stripe currency code for a deposit.
 *
 * Precedence:
 *   1. Explicit override on deposit_config.currency (already lowercase iso).
 *   2. Country-based mapping (mirrors the client's currencyFromCountry).
 *   3. EUR as the historical default — keeps existing restaurants working
 *      if their country wasn't populated.
 *
 * @param {string|null|undefined} country - Restaurant's country (name or ISO).
 * @param {string|null|undefined} override - Optional deposit_config.currency.
 * @returns {string} lowercase ISO 4217 code suitable for Stripe.
 */
function resolveDepositCurrency(country, override) {
  if (override && typeof override === 'string') {
    const o = override.toLowerCase().trim();
    if (/^[a-z]{3}$/.test(o)) return o;
  }
  if (!country) return DEFAULT_CURRENCY;
  const c = String(country).trim().toLowerCase();

  // Brazil
  if (c === 'br' || c === 'brazil' || c === 'brasil') return 'brl';

  // Eurozone — ISO codes + the common English/native names of the larger
  // markets. Mirrors the client's eurISO/eurNames sets.
  const eurISO = new Set(['es', 'it', 'fr', 'de', 'pt', 'at', 'be', 'cy', 'ee', 'fi', 'gr', 'ie', 'lt', 'lu', 'lv', 'mt', 'nl', 'si', 'sk', 'hr']);
  const eurNames = new Set([
    'spain', 'españa', 'espana', 'italy', 'italia', 'france', 'germany', 'deutschland',
    'portugal', 'austria', 'österreich', 'belgium', 'cyprus', 'estonia', 'finland',
    'greece', 'ireland', 'lithuania', 'luxembourg', 'latvia', 'malta', 'netherlands',
    'nederland', 'slovenia', 'slovakia', 'croatia',
  ]);
  if (eurISO.has(c) || eurNames.has(c)) return 'eur';

  // USD
  const usdISO = new Set(['us', 'usa', 'ca']);
  const usdNames = new Set(['united states', 'united states of america', 'canada']);
  if (usdISO.has(c) || usdNames.has(c)) return 'usd';

  // GBP
  if (c === 'gb' || c === 'uk' || c === 'united kingdom' || c === 'great britain') return 'gbp';

  // Fallback — historical default.
  return DEFAULT_CURRENCY;
}

/**
 * Stripe minimum amount in MAJOR units for the given currency.
 * Returns 0.50 for currencies not explicitly listed so the caller has a
 * sensible floor instead of crashing on undefined.
 */
function minChargeAmount(currency) {
  const c = (currency || '').toLowerCase();
  return MIN_CHARGE_AMOUNT[c] ?? 0.50;
}

module.exports = {
  resolveDepositCurrency,
  minChargeAmount,
  MIN_CHARGE_AMOUNT,
};
