/**
 * onboardingErrorMessage — turn an /api/onboarding/complete error response
 * into a clear, action-oriented message + a "jump to this step" hint.
 *
 * The legacy `completeOnboarding` handler in Onboarding.tsx serialized the
 * raw server response with `data.details` appended via string coercion,
 * which produced "[object Object],[object Object]" for the structured
 * field-error array the hardened backend now returns. Owners would also
 * see raw Postgres codes like "22P02: invalid input value for enum
 * restaurant_type" — accurate but user-hostile.
 *
 * This helper:
 *   - Maps backend `field` codes to humanised labels and the step number
 *     where the user actually edits that field.
 *   - Strips Postgres SQLSTATE prefixes ("22P02: ...") to keep messages
 *     readable.
 *   - Falls back gracefully when the response is unstructured.
 */
import type { TFunction } from 'i18next';

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  field?: string;
  reason?: string;
  details?: Array<{ field?: string; reason?: string }> | string | unknown;
  code?: string;
}

export interface ParsedOnboardingError {
  /** Single human-friendly headline shown in the red banner. */
  message: string;
  /** Step the user should jump back to fix the offending field, if known. */
  jumpToStep?: number;
  /** Field that triggered the error, normalised. */
  field?: string;
}

/**
 * Map server field codes → onboarding step number that owns the input.
 * Keep in sync with Onboarding.tsx step layout.
 */
const FIELD_TO_STEP: Record<string, number> = {
  customer_email: 1,
  restaurant_name: 1,
  restaurant_type: 1,
  city: 1,
  country: 1,
  phone_number: 2,
  email: 2,
  website: 2,
  business_hours: 2,
  areas: 3,
  tables: 3,
  cancellation_policy: 3,
};

/** Display label for each field in a "X is invalid" sentence. */
const FIELD_LABELS: Record<string, string> = {
  customer_email: 'account email',
  restaurant_name: 'restaurant name',
  restaurant_type: 'restaurant type',
  city: 'city',
  country: 'country',
  phone_number: 'phone number',
  email: 'contact email',
  website: 'website',
  business_hours: 'business hours',
  areas: 'dining areas',
  tables: 'tables',
  cancellation_policy: 'cancellation policy',
};

/** Strip Postgres SQLSTATE / enum-violation noise from a raw message. */
function stripPgNoise(raw: string): string {
  // Postgres SQLSTATE codes are 5 chars from [A-Z0-9] (e.g. "22P02",
  // "23505"). Strip the bare code OR the parenthesised variant like
  // "23505 (unique_violation): ..." at the start of the message.
  let cleaned = raw.replace(/^[A-Z0-9]{5}(\s*\([^)]+\))?:\s*/i, '');
  // Strip "invalid input value for enum X: ..." → just the friendly bit.
  cleaned = cleaned.replace(/invalid input value for enum [^:]+:\s*/i, 'unsupported value: ');
  return cleaned.trim();
}

export function parseOnboardingError(
  data: ApiErrorResponse | null | undefined,
  t: TFunction,
): ParsedOnboardingError {
  // No response body at all → generic fallback.
  if (!data || typeof data !== 'object') {
    return { message: t('onboarding.completeError', 'Failed to complete onboarding. Please try again.') };
  }

  // Structured field error from the hardened backend. O rótulo vem do i18n
  // (onboarding.fieldLabels.*) — o mapa hardcoded em inglês vira só fallback;
  // antes um brasileiro via 'Your business hours…' no meio do fluxo pt-BR.
  if (typeof data.field === 'string' && FIELD_LABELS[data.field]) {
    const label = t(`onboarding.fieldLabels.${data.field}`, FIELD_LABELS[data.field]);
    const reason = typeof data.reason === 'string' ? data.reason : 'is invalid';
    return {
      message: t('onboarding.fieldError', `Your ${label} ${reason}. Tap "Edit" to fix it.`, { label, reason }),
      jumpToStep: FIELD_TO_STEP[data.field],
      field: data.field,
    };
  }

  // Fallback: use whatever message/error string the server sent, scrubbed.
  const raw = (typeof data.message === 'string' && data.message)
    || (typeof data.error === 'string' && data.error)
    || t('onboarding.completeError', 'Failed to complete onboarding. Please try again.');
  return { message: stripPgNoise(raw) };
}
