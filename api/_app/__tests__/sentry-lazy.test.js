'use strict';

// 2026-11-21: secure-logger requires _lib/sentry, ~150 functions use the
// logger, and _lib/sentry loaded @sentry/node (and ran Sentry.init with
// tracing) at require time. Every cold start paid ~1 s locally for it. The
// SDK now loads on the first report, and only then.

function load({ dsn, env = 'production' } = {}) {
  const sdk = { init: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), setUser: jest.fn(), addBreadcrumb: jest.fn() };
  const factory = jest.fn(() => sdk);
  let sentry;
  jest.isolateModules(() => {
    jest.doMock('@sentry/node', factory);
    if (dsn) process.env.SENTRY_DSN = dsn; else delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = env;
    sentry = require('../_lib/sentry');
  });
  return { sentry, sdk, factory };
}

const ORIGINAL = { dsn: process.env.SENTRY_DSN, env: process.env.NODE_ENV };
afterEach(() => {
  if (ORIGINAL.dsn === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = ORIGINAL.dsn;
  process.env.NODE_ENV = ORIGINAL.env;
  jest.restoreAllMocks();
  // The SDK is required after load() returns, so each test needs a clean registry.
  jest.resetModules();
});

test('requiring the module (as secure-logger does) loads nothing', () => {
  const { sentry, factory } = load({ dsn: 'https://key@sentry.example/1' });
  expect(sentry.initSentry()).toBe(true);
  sentry.addBreadcrumb({ message: 'GET /api/host-dashboard' });
  sentry.setUser({ id: 'u1' });
  expect(factory).not.toHaveBeenCalled();
});

test('the first report loads and starts the SDK once, without tracing', () => {
  const { sentry, sdk, factory } = load({ dsn: 'https://key@sentry.example/1' });
  sentry.captureException(new Error('boom'), { where: 'dashboard' });
  sentry.captureMessage('later', 'warning');
  expect(factory).toHaveBeenCalledTimes(1);
  expect(sdk.init).toHaveBeenCalledTimes(1);
  expect(sdk.init.mock.calls[0][0]).toMatchObject({ dsn: 'https://key@sentry.example/1', tracesSampleRate: 0 });
  expect(sdk.captureException).toHaveBeenCalledWith(expect.any(Error), { extra: { where: 'dashboard' } });
  expect(sdk.captureMessage).toHaveBeenCalledWith('later', { level: 'warning', extra: {} });
  // Once running, context goes through.
  sentry.addBreadcrumb({ message: 'after' });
  expect(sdk.addBreadcrumb).toHaveBeenCalledWith({ message: 'after' });
});

test('without a DSN nothing loads and errors go to the log', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { sentry, factory } = load({});
  expect(sentry.initSentry()).toBe(false);
  sentry.captureException(new Error('boom'));
  expect(factory).not.toHaveBeenCalled();
  expect(spy).toHaveBeenCalledWith('[sentry] Error captured:', expect.any(Error), {});
});

test('outside production the SDK reports without being initialized, as before', () => {
  const { sentry, sdk } = load({ dsn: 'https://key@sentry.example/1', env: 'test' });
  expect(sentry.initSentry()).toBe(false);
  sentry.captureException(new Error('boom'));
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.captureException).toHaveBeenCalled();
});
