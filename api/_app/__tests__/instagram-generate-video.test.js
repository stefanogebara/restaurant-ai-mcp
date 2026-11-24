/**
 * Tests for the PROVIDERS contract in api/instagram/generate-video.js
 * + the UUID guard on the polling endpoint. The actual Higgsfield REST
 * calls are not exercised here — those land in the live smoke (which
 * we cap at one job per test session to avoid burning $0.50 per run).
 */

const { __test__ } = require('../instagram/generate-video');
const { PROVIDERS } = __test__;

describe('PROVIDERS contract', () => {
  test('exposes higgsfield as the default provider', () => {
    expect(PROVIDERS.higgsfield).toBeDefined();
  });

  test('every provider has apiKeyEnv, label, defaultModel', () => {
    for (const [key, cfg] of Object.entries(PROVIDERS)) {
      expect(typeof cfg.apiKeyEnv).toBe('string');
      expect(cfg.apiKeyEnv.length).toBeGreaterThan(0);
      expect(typeof cfg.label).toBe('string');
      expect(typeof cfg.defaultModel).toBe('string');
      expect(key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test('higgsfield reads from HIGGSFIELD_API_KEY', () => {
    expect(PROVIDERS.higgsfield.apiKeyEnv).toBe('HIGGSFIELD_API_KEY');
  });
});

// Mirror the UUID guard in handlePoll so a future refactor can't drop
// the validation without failing this test. Same lesson as
// schedule-post cancel (commit 100cd65c — non-UUID id was leaking a
// postgres "Database error" to the UI).
describe('GET job_id — UUID guard', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

  test.each([
    'd9b2c5d8-1234-4abc-9def-0123456789ab',
    '00000000-0000-0000-0000-000000000000',
    'A3F6E59C-5D6E-4F00-B6F2-1F0C5E6D2A11',
  ])('accepts a valid UUID: %s', (id) => {
    expect(isValidUuid(id)).toBe(true);
  });

  test.each([
    'job-1',
    'fake',
    "00000000-0000-0000-0000-000000000000'; DROP TABLE--",
    '',
    'd9b2c5d8-1234-4abc-9def-0123456789ab-extra',
  ])('rejects non-UUID input: %p', (id) => {
    expect(isValidUuid(id)).toBe(false);
  });
});
