import { lazy, type ComponentType } from 'react';

/**
 * Wraps React.lazy with automatic retry on chunk load failures.
 *
 * When Vercel deploys a new version, old chunk hashes become invalid.
 * Users with stale tabs or Meta in-app browsers may fail to load chunks
 * on first try. This retries up to `maxRetries` times before giving up.
 *
 * On final failure, forces a full page reload to fetch fresh HTML with
 * updated chunk references — throttled by time (not once-per-session):
 * with frequent deploys, a single per-session reload budget meant the
 * SECOND stale chunk of the day (usually a rarely-visited page like
 * Campaigns) threw straight to the error boundary and the app appeared
 * to "stop opening pages".
 */
const DEFAULT_MAX_RETRIES = 2;

const RELOAD_TS_KEY = 'seatable-chunk-reload-ts';
/** Minimum gap between forced reloads — long enough to break reload
 *  loops (a genuinely broken deploy re-fails within seconds), short
 *  enough that a later stale chunk in the same tab can still recover. */
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * Reload the page to recover from a stale-chunk failure, unless a reload
 * was already attempted within the cooldown window (loop protection).
 * Returns true if a reload was initiated.
 */
export function attemptChunkReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode quota, etc.) — reloading
    // without the guard risks a loop, so don't.
    return false;
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = DEFAULT_MAX_RETRIES
): React.LazyExoticComponent<T> {
  return lazy(() => retryImport(importFn, maxRetries, maxRetries));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function retryImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retriesLeft: number,
  totalRetries: number
): Promise<{ default: T }> {
  try {
    return await importFn();
  } catch (error) {
    if (retriesLeft <= 0) {
      attemptChunkReload();
      throw error;
    }

    // Wait before retrying (exponential backoff: 1s, 2s)
    const attempt = totalRetries - retriesLeft + 1;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));

    return retryImport(importFn, retriesLeft - 1, totalRetries);
  }
}
