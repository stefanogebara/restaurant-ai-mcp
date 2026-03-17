/**
 * Currency Detection Utility
 *
 * Auto-detects BRL from browser locale for Brazilian users.
 * Falls back to EUR for all other locales.
 */

export type SupportedCurrency = 'EUR' | 'BRL';

export const DEFAULT_CURRENCY = 'EUR';

/**
 * Detect currency based on browser locale and navigator language.
 * Returns 'BRL' for Portuguese-Brazil users, 'EUR' for all others.
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
  } catch {
    // Fallback to EUR if detection fails
  }

  return 'EUR';
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

/**
 * Format an amount as a currency string using the detected (BRL/EUR) or specified currency.
 */
export function formatCurrency(amount: number, currency?: SupportedCurrency): string {
  const cur = currency ?? getDefaultCurrency();
  const locale = cur === 'BRL' ? 'pt-BR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format price for display based on currency.
 */
export function formatPrice(amount: number, currency: SupportedCurrency): string {
  if (currency === 'BRL') {
    return `R$${amount}`;
  }
  return `\u20AC${amount}`;
}
