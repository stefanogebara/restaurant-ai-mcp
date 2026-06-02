/**
 * Client-side wrapper for /api/onboarding/extract. Used by useChatFlow to
 * turn the raw user text into a structured value BEFORE handing it to the
 * engine's `advance()` as `Answer.extracted`.
 *
 * Design choices:
 *   - One in-memory cache keyed by `${kind}:${raw}` so retrying the same
 *     answer doesn't re-bill the LLM. Cleared on page reload.
 *   - Hard 20s wall-time client-side (server caps at 15s). After timeout we
 *     return `{ ok: false, fallbackToStructured: true }` so the UI can offer
 *     the user a structured input flow instead of stranding them on a hung
 *     spinner.
 *   - The Answer.extracted field is allowed to be `undefined`. When the
 *     extractor returns ok=false, callers should pass extracted=undefined so
 *     the raw string is used (and validate() decides if it's acceptable).
 */

import { authFetch } from '../../services/api';
import type { InputSlot } from './flow.types';

export type ExtractKind = NonNullable<InputSlot['extract']>;

export interface ExtractSuccess {
  ok: true;
  value: unknown;
}
export interface ExtractFailure {
  ok: false;
  error: string;
  /** True when the failure mode is recoverable by switching to a manual input flow. */
  fallbackToStructured: boolean;
}
export type ExtractResult = ExtractSuccess | ExtractFailure;

const cache = new Map<string, ExtractResult>();
const CLIENT_TIMEOUT_MS = 20_000;

export async function extractInput(kind: string, raw: string): Promise<ExtractResult> {
  const key = `${kind}:${raw}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), CLIENT_TIMEOUT_MS);

  try {
    const res = await authFetch('/api/onboarding/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, raw }),
      signal: aborter.signal,
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; value?: unknown; error?: string } | null;
    if (!res.ok || !body || body.ok !== true) {
      const err = body?.error || `extract HTTP ${res.status}`;
      // Do NOT cache failures — if the LLM gave a bad answer once, the user
      // should be able to retry the same raw and potentially get a better
      // result. Only successful values are stable enough to cache.
      return {
        ok: false,
        error: err,
        // Anything except a 401 (auth) or 500 (server bug) is recoverable
        // with a manual structured input.
        fallbackToStructured: res.status !== 401 && res.status !== 500,
      };
    }
    const result: ExtractResult = { ok: true, value: body.value };
    cache.set(key, result);
    return result;
  } catch (err: unknown) {
    const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message === 'aborted');
    return {
      ok: false,
      error: isAbort ? 'extract_timeout' : (err instanceof Error ? err.message : 'extract_failed'),
      fallbackToStructured: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only — clears the cache between runs. */
export function _clearCacheForTests(): void {
  cache.clear();
}
