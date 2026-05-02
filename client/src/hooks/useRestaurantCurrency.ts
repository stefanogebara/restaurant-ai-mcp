import { useEffect } from 'react';
import { useRestaurantSettings } from './useRestaurantSettings';
import {
  currencyFromCountry,
  currencyFromLanguage,
  setActiveRestaurantCountry,
  type SupportedCurrency,
} from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * Returns the currency a restaurant's financials should be displayed in.
 *
 * Priority:
 *   1. restaurant.country  (source of truth — a Spanish restaurant is in EUR
 *      regardless of which UI language the manager is browsing in)
 *   2. i18n.language fallback (only used while settings are still loading,
 *      to avoid flashing the wrong symbol on first paint)
 *
 * SIDE EFFECT: also pushes the restaurant country into the currency util's
 * module-level cache so that formatCurrency() calls with no explicit currency
 * arg (24 callsites across the codebase) all benefit from the same fix
 * automatically. Mount this hook at any always-rendered component on the
 * dashboard (DashboardLayout) and every other widget gets the right currency
 * for free.
 */
export function useRestaurantCurrency(): SupportedCurrency {
  const { data: settings } = useRestaurantSettings();
  const { i18n } = useTranslation();

  // Push country into the global cache so non-hook callsites pick it up.
  useEffect(() => {
    if (settings?.country) {
      setActiveRestaurantCountry(settings.country);
    }
    return () => {
      // Don't clear on unmount — the dashboard re-renders frequently and a
      // brief null window would cause currency-symbol flashes.
    };
  }, [settings?.country]);

  if (settings?.country) {
    return currencyFromCountry(settings.country);
  }
  // While loading: best guess from UI language. Avoids a "$" → "R$" flash for
  // PT-BR Brazilian restaurants on first paint.
  return currencyFromLanguage(i18n.language);
}
