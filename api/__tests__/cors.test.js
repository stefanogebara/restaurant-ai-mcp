/**
 * Tests for api/_lib/cors.js
 * Pure CORS header-setting utilities with origin whitelisting
 */

const { setInternalCors, setWebhookCors, handlePreflight, ALLOWED_ORIGINS } = require('../_lib/cors');

function createMockRes() {
  const headers = {};
  return {
    headers,
    setHeader: jest.fn((key, value) => { headers[key] = value; }),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
  };
}

// ============================================================
// setInternalCors
// ============================================================
describe('setInternalCors', () => {
  test('sets origin header for allowed origin', () => {
    const req = { headers: { origin: 'http://localhost:5173' }, method: 'GET' };
    const res = createMockRes();
    setInternalCors(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  test('sets origin header for production URL', () => {
    const req = { headers: { origin: 'https://seatable.one' }, method: 'GET' };
    const res = createMockRes();
    setInternalCors(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://seatable.one');
  });

  test('does not set origin header for disallowed origin', () => {
    const req = { headers: { origin: 'https://evil.com' }, method: 'GET' };
    const res = createMockRes();
    setInternalCors(req, res);
    // Disallowed origin → no Access-Control-Allow-Origin set
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    // But other CORS headers ARE set
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  test('sets default origin when no origin header present (server-to-server)', () => {
    const req = { headers: {}, method: 'GET' };
    const res = createMockRes();
    setInternalCors(req, res);
    // Falls through to the !origin branch → sets first allowed origin
    expect(res.headers['Access-Control-Allow-Origin']).toBeDefined();
    expect(ALLOWED_ORIGINS).toContain(res.headers['Access-Control-Allow-Origin']);
  });

  test('always sets credentials, methods, and headers', () => {
    const req = { headers: { origin: 'http://localhost:5173' }, method: 'GET' };
    const res = createMockRes();
    setInternalCors(req, res);
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });
});

// ============================================================
// setWebhookCors
// ============================================================
describe('setWebhookCors', () => {
  test('sets specific origin for allowed client origin', () => {
    const req = { headers: { origin: 'http://localhost:5174' }, method: 'POST' };
    const res = createMockRes();
    setWebhookCors(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5174');
  });

  test('sets * for requests without origin header (server-to-server webhooks)', () => {
    const req = { headers: {}, method: 'POST' };
    const res = createMockRes();
    setWebhookCors(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  test('sets * for unrecognized origins (external webhook senders)', () => {
    const req = { headers: { origin: 'https://unknown-service.io' }, method: 'POST' };
    const res = createMockRes();
    setWebhookCors(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  test('allows ElevenLabs webhook origin', () => {
    const req = { headers: { origin: 'https://api.elevenlabs.io' }, method: 'POST' };
    const res = createMockRes();
    setWebhookCors(req, res);
    // ElevenLabs is in WEBHOOK_ORIGINS → its origin is reflected back
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://api.elevenlabs.io');
  });
});

// ============================================================
// handlePreflight
// ============================================================
describe('handlePreflight', () => {
  test('handles OPTIONS request → returns true', () => {
    const req = { method: 'OPTIONS' };
    const res = createMockRes();
    const result = handlePreflight(req, res);
    expect(result).toBe(true);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  test('does not handle non-OPTIONS request → returns false', () => {
    const req = { method: 'GET' };
    const res = createMockRes();
    const result = handlePreflight(req, res);
    expect(result).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  test('POST request returns false', () => {
    const req = { method: 'POST' };
    const res = createMockRes();
    const result = handlePreflight(req, res);
    expect(result).toBe(false);
  });
});

// ============================================================
// ALLOWED_ORIGINS export
// ============================================================
describe('ALLOWED_ORIGINS', () => {
  test('is an array with expected origins', () => {
    expect(Array.isArray(ALLOWED_ORIGINS)).toBe(true);
    expect(ALLOWED_ORIGINS).toContain('http://localhost:5173');
    expect(ALLOWED_ORIGINS).toContain('https://seatable.one');
  });
});
