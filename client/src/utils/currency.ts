/**
 * Currency Detection Utility
 *
 * Auto-detects currency from browser locale / i18n language:
 *   pt-BR → BRL (R$)
 *   es    → EUR (€)
 *   *     → USD ($)
 */

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
 * Lazily detected currency — cached after first call.
 */
let _detectedCurrency: SupportedCurrency | null = null;

function getDefaultCurrency(): SupportedCurrency {
  if (_detectedCurrency === null) {
    _detectedCurrency = detectCurrency();
  }
  return _detectedCurrency;
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
