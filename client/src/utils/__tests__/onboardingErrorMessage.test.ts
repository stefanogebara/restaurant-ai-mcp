/**
 * onboardingErrorMessage — parses the hardened /api/onboarding/complete
 * error responses into actionable banners with optional "jump to step"
 * hints. Locks the contract so future refactors can't regress the UX
 * back to "[object Object]" garbage or raw Postgres codes leaking
 * through to restaurant owners.
 */

import { describe, it, expect } from 'vitest';
import { parseOnboardingError } from '../onboardingErrorMessage';

// Minimal stub of i18next's `t` — returns the default value, applying any
// {{var}} substitutions. The parser only ever passes literal defaults, so
// this is enough for the parser's contract; the locale file just lets
// real-world callers swap the language.
const t = ((key: string, defaultOrOpts?: unknown, opts?: Record<string, unknown>) => {
  let template: string;
  let values: Record<string, unknown> | undefined;
  if (typeof defaultOrOpts === 'string') {
    template = defaultOrOpts;
    values = opts;
  } else {
    template = key;
    values = defaultOrOpts as Record<string, unknown> | undefined;
  }
  if (!values) return template;
  return Object.entries(values).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
    template,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

describe('parseOnboardingError', () => {
  it('maps a structured field error to a friendly message + jump step', () => {
    const result = parseOnboardingError(
      { error: 'Invalid phone_number: invalid phone format', field: 'phone_number', reason: 'invalid phone format' },
      t,
    );
    expect(result.field).toBe('phone_number');
    expect(result.jumpToStep).toBe(2);
    expect(result.message).toMatch(/phone number/i);
    expect(result.message).toMatch(/invalid phone format/i);
    // No raw "[object Object]" or array stringification.
    expect(result.message).not.toMatch(/\[object Object\]/);
    expect(result.message).not.toMatch(/\d{5}:/); // No SQLSTATE leaking through.
  });

  it('routes restaurant_name errors to step 1', () => {
    const result = parseOnboardingError(
      { error: 'Invalid restaurant_name: required', field: 'restaurant_name', reason: 'required' },
      t,
    );
    expect(result.jumpToStep).toBe(1);
    expect(result.message).toMatch(/restaurant name/i);
  });

  it('strips Postgres SQLSTATE prefixes from unstructured errors', () => {
    const result = parseOnboardingError(
      { error: '22P02: invalid input value for enum restaurant_type: "neon"' },
      t,
    );
    expect(result.message).not.toMatch(/22P02/);
    expect(result.message).not.toMatch(/invalid input value for enum/i);
    expect(result.field).toBeUndefined();
    expect(result.jumpToStep).toBeUndefined();
  });

  it('strips SQLSTATE with parenthesised name like "23505 (unique_violation)"', () => {
    const result = parseOnboardingError(
      { error: '23505 (unique_violation): duplicate key value violates unique constraint' },
      t,
    );
    expect(result.message).not.toMatch(/23505/);
    expect(result.message).not.toMatch(/unique_violation/);
  });

  it('falls back gracefully on null / empty / missing body', () => {
    expect(parseOnboardingError(null, t).message).toBeTruthy();
    expect(parseOnboardingError(undefined, t).message).toBeTruthy();
    expect(parseOnboardingError({}, t).message).toBeTruthy();
  });

  it('prefers data.message over data.error when both are present', () => {
    const result = parseOnboardingError({ message: 'Custom human note', error: 'low-level error' }, t);
    expect(result.message).toBe('Custom human note');
  });

  it('ignores unknown field codes (returns generic message, no jump hint)', () => {
    const result = parseOnboardingError(
      { error: 'something broke', field: 'frobnicator_count', reason: 'too high' },
      t,
    );
    expect(result.jumpToStep).toBeUndefined();
    expect(result.field).toBeUndefined();
    // Falls through to the raw error message path.
    expect(result.message).toMatch(/something broke/i);
  });
});
