/**
 * Bridge jsdom's Web Storage into the test global on Node >= 22.
 *
 * Node 22+ defines its own global `localStorage`/`sessionStorage`
 * (experimental Web Storage) that evaluate to `undefined` unless the
 * process runs with --localstorage-file. Vitest's populateGlobal skips
 * any jsdom window key that already exists on the Node global unless it
 * is in vitest's hardcoded copy-list — and the storage keys are not —
 * so jsdom's perfectly working storage never reaches globalThis and every
 * access in app code returns undefined. On Node 26 that killed all 45
 * suites at setup (i18n/config.ts touches localStorage at module scope).
 *
 * Must be the FIRST import of setup.ts: ES import hoisting means any
 * module that reads storage at import time would otherwise run before an
 * inline fix in setup.ts's body.
 */
const rawWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;

if (rawWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (!globalThis[key]) {
      Object.defineProperty(globalThis, key, {
        value: rawWindow[key],
        configurable: true,
        writable: true,
      });
    }
  }
}
