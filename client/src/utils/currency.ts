/**
 * Currency Detection Utility
 *
 * Auto-detects currency from i18n language (preferred) or browser locale:
 *   pt-BR → BRL (R$)
 *   es    → EUR (€)
 *   *     → USD ($)
 */

import i18n from '../i18n/config';

export type SupportedCurrency = 'USD' | 'BRL' | 'EUR';

export const DEFAULT_CURRENCY = 'BRL';

/**
 * Detect currency based on browser locale and navigator language.
 * Returns 'BRL' for Portuguese-Brazil, 'EUR' for Spanish, 'USD' for all others.
 */
export function detectCurrency(): SupportedCurrency {
  try {
    // Check navigator languages (most reliable)
    const languages = navigator.languages || [navigator.language];
    for (const lang of languages) {
      const normalized = lang.toLowerCase();
      if (normalized === 'pt-br' || normalized === 'pt') {
        return 'BRL';
      }
      if (normalized === 'es' || normalized.startsWith('es-')) {
        return 'EUR';
      }
    }

    // Check Intl resolved locale timezone (Brazil timezones)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (timezone.startsWith('America/Sao_Paulo') ||
        timezone.startsWith('America/Fortaleza') ||
        timezone.startsWith('America/Recife') ||
        timezone.startsWith('America/Bahia') ||
        timezone.startsWith('America/Belem') ||
        timezone.startsWith('America/Manaus') ||
        timezone.startsWith('America/Cuiaba') ||
        timezone.startsWith('America/Porto_Velho') ||
        timezone.startsWith('America/Rio_Branco') ||
        timezone.startsWith('America/Noronha') ||
        timezone.startsWith('America/Araguaina') ||
        timezone.startsWith('America/Maceio') ||
        timezone.startsWith('America/Santarem') ||
        timezone.startsWith('America/Campo_Grande') ||
        timezone.startsWith('America/Boa_Vista') ||
        timezone.startsWith('America/Eirunepe')) {
      return 'BRL';
    }

    // Check for European/Spanish timezones
    if (timezone.startsWith('Europe/Madrid') ||
        timezone.startsWith('Atlantic/Canary')) {
      return 'EUR';
    }
  } catch {
    // Fallback to USD if detection fails
  }

  return 'USD';
}

/**
 * Detect currency from i18n language code.
 * Preferred over detectCurrency() when the user has explicitly chosen a language.
 */
export function currencyFromLanguage(language: string): SupportedCurrency {
  const normalized = language.toLowerCase();
  if (normalized === 'pt-br' || normalized === 'pt') return 'BRL';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'EUR';
  return 'USD';
}

/**
 * Map a restaurant's country to its currency. SOURCE OF TRUTH for dashboard
 * currency display — the manager's UI language should NOT determine which
 * currency their financials show in. A Spanish restaurant whose manager
 * happens to be browsing in PT-BR still has EUR as their actual currency.
 *
 * Supports the 3 currencies the platform handles natively (BRL/USD/EUR).
 * Other LATAM markets fall back to USD until we add MXN/ARS/CLP/etc.
 *
 * @param country Country name (e.g. "Brazil", "Spain") OR ISO code (e.g. "BR", "ES")
 */
export function currencyFromCountry(country: string | null | undefined): SupportedCurrency {
  if (!country) return DEFAULT_CURRENCY;
  const c = String(country).trim().toLowerCase();

  // Brazil
  if (c === 'br' || c === 'brazil' || c === 'brasil') return 'BRL';

  // Eurozone (ISO codes + common English/native names of the bigger markets)
  const eurISO = new Set(['es', 'it', 'fr', 'de', 'pt', 'at', 'be', 'cy', 'ee', 'fi', 'gr', 'ie', 'lt', 'lu', 'lv', 'mt', 'nl', 'si', 'sk', 'hr']);
  const eurNames = new Set([
    'spain', 'españa', 'espana', 'italy', 'italia', 'france', 'germany', 'deutschland',
    'portugal', 'austria', 'österreich', 'belgium', 'cyprus', 'estonia', 'finland',
    'greece', 'ireland', 'lithuania', 'luxembourg', 'latvia', 'malta', 'netherlands',
    'nederland', 'slovenia', 'slovakia', 'croatia',
  ]);
  if (eurISO.has(c) || eurNames.has(c)) return 'EUR';

  // USD
  const usdISO = new Set(['us', 'usa', 'ca']);
  const usdNames = new Set(['united states', 'united states of america', 'canada']);
  if (usdISO.has(c) || usdNames.has(c)) return 'USD';

  // Default — better safe than wrong-currency
  return DEFAULT_CURRENCY;
}

/**
 * Module-level restaurant country, set by useRestaurantSettings (or any component
 * that has loaded the restaurant config). All formatCurrency() calls without
 * an explicit currency arg fall back to this — meaning every dashboard widget,
 * customer card, deposit step, etc. shows the right currency for the actual
 * restaurant, NOT for whatever language the manager happens to be browsing in.
 *
 * Set via setActiveRestaurantCountry(country) — typically in a top-level effect
 * inside Dashboard / DashboardLayout when settings finish loading.
 */
let _activeRestaurantCountry: string | null = null;

/** Set the active restaurant's country so all currency formatters can use it.
 *  Pass null to clear (e.g. on logout). */
export function setActiveRestaurantCountry(country: string | null): void {
  _activeRestaurantCountry = country;
}

/**
 * Get the default currency for formatting when no currency is explicitly provided.
 *
 * Priority order:
 *   1. Active restaurant country (set by setActiveRestaurantCountry — source
 *      of truth: a Spanish restaurant is in EUR no matter the UI language)
 *   2. i18n active language (best guess while restaurant settings load)
 *   3. navigator.language / timezone detection (last-resort fallback)
 */
function getDefaultCurrency(): SupportedCurrency {
  if (_activeRestaurantCountry) {
    return currencyFromCountry(_activeRestaurantCountry);
  }
  if (i18n?.language) {
    return currencyFromLanguage(i18n.language);
  }
  return detectCurrency();
}

/** Map currency code to Intl locale */
function localeForCurrency(currency: SupportedCurrency): string {
  if (currency === 'BRL') return 'pt-BR';
  if (currency === 'EUR') return 'es-ES';
  return 'en-US';
}

/**
 * Format an amount as a currency string using the detected (BRL/USD/EUR) or specified currency.
 */
export function formatCurrency(amount: number, currency?: SupportedCurrency): string {
  const cur = currency ?? getDefaultCurrency();
  return new Intl.NumberFormat(localeForCurrency(cur), {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format price for display based on currency.
 * Returns locale-appropriate string: R$497, $97, €89
 */
export function formatPrice(amount: number, currency: SupportedCurrency): string {
  if (currency === 'BRL') return `R$${amount}`;
  if (currency === 'EUR') return `€${amount}`;
  return `$${amount}`;
}

/**
 * Format price with locale-appropriate thousand separators.
 * e.g. 1497 BRL → "R$1.497", 297 USD → "$297", 269 EUR → "€269"
 */
export function formatPriceLocale(amount: number, currency: SupportedCurrency): string {
  const symbol = getCurrencySymbol(currency);
  const locale = localeForCurrency(currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `${symbol}${formatted}`;
}

/**
 * Get the currency symbol for input field prefixes.
 * Returns 'R$' for BRL, '€' for EUR, '$' for USD.
 */
export function getCurrencySymbol(currency?: SupportedCurrency): string {
  const cur = currency ?? getDefaultCurrency();
  if (cur === 'BRL') return 'R$';
  if (cur === 'EUR') return '€';
  return '$';
}
