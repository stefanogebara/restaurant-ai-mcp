import { lazy, type ComponentType } from 'react';

/**
 * Wraps React.lazy with automatic retry on chunk load failures.
 *
 * When Vercel deploys a new version, old chunk hashes become invalid.
 * Users with stale tabs or Meta in-app browsers may fail to load chunks
 * on first try. This retries up to `maxRetries` times before giving up.
 *
 * On final failure, forces a full page reload (once) to fetch fresh HTML
 * with updated chunk references.
 */
const DEFAULT_MAX_RETRIES = 2;

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
      // Last resort: if we haven't reloaded yet in this session, do a full reload
      // to get fresh index.html with updated chunk hashes.
      const reloadKey = 'seatable-chunk-reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
      throw error;
    }

    // Wait before retrying (exponential backoff: 1s, 2s)
    const attempt = totalRetries - retriesLeft + 1;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));

    return retryImport(importFn, retriesLeft - 1, totalRetries);
  }
}
