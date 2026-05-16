/**
 * Cancellation policy localizer.
 *
 * Backstory: the onboarding `ReservationSettingsPanel` dropdown used to save
 * the TRANSLATED preset text (e.g. "Free cancellation up to 2 hours before
 * reservation") as the column value. Booking page customers saw whatever
 * language the OWNER spoke at onboarding — a pt-BR customer booking at a
 * restaurant set up in English saw English on the booking page.
 *
 * The forward fix: onboarding now saves a stable key (e.g.
 * "cancellationPreset:cancelFree2h"). The booking + confirmation surfaces
 * detect either:
 *   1. the new key format  → resolve via i18n
 *   2. a known legacy literal (any of our 4 presets in any language) →
 *      resolve to the matching key + i18n
 *   3. anything else (custom owner-typed copy) → render as-is
 *
 * Legacy literals are exhaustively listed below so existing restaurants don't
 * need a backfill migration to get the booking page in the customer's locale.
 */

import type { TFunction } from 'i18next';

export const POLICY_KEY_PREFIX = 'cancellationPreset:';

// onboarding.cancelFree2h / cancelFree24h / cancelFree48h / cancelNone
export const POLICY_KEYS = ['cancelFree2h', 'cancelFree24h', 'cancelFree48h', 'cancelNone'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

// Every translated literal we've ever shipped as a preset, mapped back to its
// canonical key. If any of these appears in the DB it's safe to upgrade on read.
const LEGACY_LITERAL_TO_KEY: Record<string, PolicyKey> = {
  // English
  'Free cancellation up to 2 hours before reservation': 'cancelFree2h',
  'Free cancellation up to 24 hours before reservation': 'cancelFree24h',
  'Free cancellation up to 48 hours before reservation': 'cancelFree48h',
  'No free cancellation': 'cancelNone',
  // Portuguese (BR)
  'Cancelamento gratuito até 2 horas antes da reserva': 'cancelFree2h',
  'Cancelamento gratuito até 24 horas antes da reserva': 'cancelFree24h',
  'Cancelamento gratuito até 48 horas antes da reserva': 'cancelFree48h',
  'Sem cancelamento gratuito': 'cancelNone',
  // Spanish
  'Cancelación gratuita hasta 2 horas antes de la reserva': 'cancelFree2h',
  'Cancelación gratuita hasta 24 horas antes de la reserva': 'cancelFree24h',
  'Cancelación gratuita hasta 48 horas antes de la reserva': 'cancelFree48h',
  'Sin cancelación gratuita': 'cancelNone',
};

/**
 * Resolve the policy key from a stored cancellation_policy column value.
 * Returns null if the stored value is custom user-typed text we shouldn't
 * translate over (preserves the owner's intent).
 */
export function detectPolicyKey(stored: string | null | undefined): PolicyKey | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(POLICY_KEY_PREFIX)) {
    const key = trimmed.slice(POLICY_KEY_PREFIX.length) as PolicyKey;
    return POLICY_KEYS.includes(key) ? key : null;
  }
  return LEGACY_LITERAL_TO_KEY[trimmed] ?? null;
}

/**
 * Render the cancellation policy in the active locale. Custom owner-typed
 * text is preserved verbatim; preset selections (whether saved as a key or
 * as a legacy literal) translate to the viewer's locale.
 */
export function localizeCancellationPolicy(
  stored: string | null | undefined,
  t: TFunction,
  fallback: string = ''
): string {
  const key = detectPolicyKey(stored);
  if (key) return t(`onboarding.${key}`);
  const trimmed = stored?.trim();
  if (trimmed) return trimmed;
  return fallback || t('reservations.cancellationPolicy');
}

/** Stable key wrapped for storage. */
export function policyValueForStorage(key: PolicyKey): string {
  return `${POLICY_KEY_PREFIX}${key}`;
}
