/**
 * Tests for api/_lib/db-clients.js
 * Covers handleSupabaseResponse and createAuthClient functions.
 */

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js to avoid real network calls
// ---------------------------------------------------------------------------
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((url, key, opts) => ({
    __url: url,
    __key: key,
    __opts: opts,
  })),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Ensure env vars are set before requiring the module
const origUrl = process.env.SUPABASE_URL;
const origServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origAnonKey = process.env.SUPABASE_ANON_KEY;

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.SUPABASE_ANON_KEY = 'anon-key';

const {
  supabase,
  supabaseAdmin,
  supabaseClient,
  createAuthClient,
  handleSupabaseResponse,
} = require('../_lib/db-clients');

afterAll(() => {
  // Restore env vars
  if (origUrl !== undefined) process.env.SUPABASE_URL = origUrl;
  if (origServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origServiceKey;
  if (origAnonKey !== undefined) process.env.SUPABASE_ANON_KEY = origAnonKey;
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------
describe('db-clients: module exports', () => {
  test('supabase is the admin client (service role key available)', () => {
    expect(supabase).toBeDefined();
    expect(supabase.__key).toBe('service-role-key');
  });

  test('supabaseAdmin uses service role key', () => {
    expect(supabaseAdmin).toBeDefined();
    expect(supabaseAdmin.__key).toBe('service-role-key');
  });

  test('supabaseClient uses anon key', () => {
    expect(supabaseClient).toBeDefined();
    expect(supabaseClient.__key).toBe('anon-key');
  });
});

// ---------------------------------------------------------------------------
// handleSupabaseResponse (lines 76-88)
// ---------------------------------------------------------------------------
describe('handleSupabaseResponse', () => {
  test('success case: returns { success: true, data } (line 87)', () => {
    const data = { id: 'uuid-1', name: 'Test' };
    const result = handleSupabaseResponse(data, null, 'GET reservations');
    expect(result).toEqual({ success: true, data });
  });

  test('error case: returns failure object with message (lines 77-84)', () => {
    const error = { message: 'Unique constraint violated' };
    const result = handleSupabaseResponse(null, error, 'CREATE reservation');
    expect(result).toEqual({
      success: false,
      error: true,
      message: 'Unique constraint violated',
    });
  });

  test('error case with no message: falls back to generic message (line 82)', () => {
    const error = {}; // no .message property
    const result = handleSupabaseResponse(null, error, 'UPDATE reservation');
    expect(result).toEqual({
      success: false,
      error: true,
      message: 'Database operation failed',
    });
  });

  test('operation label is used in logger (not in return value)', () => {
    const result = handleSupabaseResponse({ rows: [] }, null, 'CUSTOM OP');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rows: [] });
  });
});

// ---------------------------------------------------------------------------
// createAuthClient (lines 57-68)
// ---------------------------------------------------------------------------
describe('createAuthClient', () => {
  test('returns Supabase client with Authorization header (line 61-67)', () => {
    const client = createAuthClient('user-jwt-token');
    expect(client).toBeDefined();
    // The mock createClient stores opts, so we can inspect the Authorization header
    expect(client.__url).toBe('https://test.supabase.co');
    expect(client.__key).toBe('anon-key');
    expect(client.__opts.global.headers.Authorization).toBe('Bearer user-jwt-token');
  });

  test('createAuthClient throws when SUPABASE_ANON_KEY is missing (lines 58-60)', () => {
    // Temporarily remove env var and re-test via isolateModules
    jest.isolateModules(() => {
      delete process.env.SUPABASE_ANON_KEY;

      jest.mock('@supabase/supabase-js', () => ({
        createClient: jest.fn(() => ({})),
      }));
      jest.mock('../_lib/secure-logger', () => ({
        createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
      }));

      const { createAuthClient: createClientNoKey } = require('../_lib/db-clients');
      expect(() => createClientNoKey('some-token')).toThrow(
        'Cannot create auth client: missing SUPABASE_URL or SUPABASE_ANON_KEY'
      );

      process.env.SUPABASE_ANON_KEY = 'anon-key';
    });
  });
});
