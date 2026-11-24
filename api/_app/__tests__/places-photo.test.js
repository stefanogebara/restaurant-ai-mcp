/**
 * Tests for GET /api/places-photo
 *
 * Locks the contract around the photo redirect endpoint:
 *   - Strict ref pattern (no SSRF)
 *   - Method allow-list (GET only)
 *   - 302 to Google's CDN photoUri (no key leak into the browser)
 *   - 503 when the API key is missing
 *   - Cache-Control on the redirect so Vercel's edge absorbs repeats
 */

const handler = require('../places-photo');

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => false),
}));

function createReq(method, query = {}) {
  return { method, query, headers: {} };
}

function createRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader(name, value) { res.headers[name] = value; },
    end() { return res; },
  };
  return res;
}

describe('GET /api/places-photo', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalKey;
  });

  it('rejects non-GET methods', async () => {
    const req = createReq('POST', { ref: 'places/abc/photos/xyz' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('400s when ref is missing', async () => {
    const req = createReq('GET', {});
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ref/i);
  });

  it('rejects refs that do not match the strict pattern (SSRF guard)', async () => {
    const cases = [
      'https://evil.com/photo',
      '../etc/passwd',
      'places/abc/photos/xyz?inject=1',
      'places//photos/xyz',
      'photos/abc',
      'places/abc/photos/',
    ];
    for (const bad of cases) {
      const res = createRes();
      await handler(createReq('GET', { ref: bad }), res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('503s when GOOGLE_PLACES_API_KEY is not configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz' }), res);
    expect(res.statusCode).toBe(503);
  });

  it('redirects 302 to Google photoUri on success', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/photo123' }),
    });

    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz' }), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('https://lh3.googleusercontent.com/photo123');
    // Edge cache header must be present — without it every page load re-hits
    // Google Places media and burns quota.
    expect(res.headers['Cache-Control']).toMatch(/max-age/);
    // API key must NOT leak into the URL the browser sees (Location header).
    expect(res.headers.Location).not.toMatch(/key=/);
  });

  it('sends API key via X-Goog-Api-Key header, not query param', async () => {
    // Audit finding: key in ?key= query param leaks via URL logging / CDN
    // edge caches keyed on URL. The header-based form lands in NEITHER.
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/photo' }),
    });
    global.fetch = fetchMock;

    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz' }), res);

    const [urlArg, optsArg] = fetchMock.mock.calls[0];
    // URL must NOT carry the key in any form
    expect(urlArg).not.toContain('test-key');
    expect(urlArg).not.toMatch(/[?&]key=/);
    // Header must carry the key
    expect(optsArg?.headers?.['X-Goog-Api-Key']).toBe('test-key');
  });

  it('clamps maxWidth to the absolute ceiling (1600px)', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/photo' }),
    });
    global.fetch = fetchMock;

    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz', maxWidth: '8000' }), res);

    const urlArg = fetchMock.mock.calls[0][0];
    expect(urlArg).toContain('maxWidthPx=1600');
    expect(urlArg).not.toContain('maxWidthPx=8000');
  });

  it('502s if Google returns a non-https photoUri (defense in depth)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ photoUri: 'http://attacker.test/payload' }),
    });

    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz' }), res);
    expect(res.statusCode).toBe(502);
  });

  it('502s when Google returns a non-OK response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });

    const res = createRes();
    await handler(createReq('GET', { ref: 'places/abc/photos/xyz' }), res);
    expect(res.statusCode).toBe(502);
  });
});
