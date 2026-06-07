/**
 * Tests for the MODELS contract in api/instagram/generate-image.js.
 *
 * The actual provider calls (OpenAI + Gemini REST APIs) aren't exercised
 * here — those happen in the live smoke. What this catches:
 *   - Removing a model from MODELS without updating the UI dropdown
 *   - Removing/renaming an env var key without a paired UI fix
 *   - Forgetting to whitelist a size the UI offers
 */

const { __test__ } = require('../instagram/generate-image');
const { MODELS, ALLOWED_SIZES } = __test__;

describe('MODELS contract', () => {
  test('exposes both gpt-image-1 and nano-banana', () => {
    expect(MODELS['gpt-image-1']).toBeDefined();
    expect(MODELS['nano-banana']).toBeDefined();
  });

  test('every model has a provider, apiKeyEnv, label, and costCents', () => {
    for (const [key, cfg] of Object.entries(MODELS)) {
      expect(cfg.provider).toMatch(/^(openai|gemini)$/);
      expect(typeof cfg.apiKeyEnv).toBe('string');
      expect(cfg.apiKeyEnv.length).toBeGreaterThan(0);
      expect(typeof cfg.label).toBe('string');
      expect(typeof cfg.costCents).toBe('number');
      expect(cfg.costCents).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z0-9-]+$/);  // safe to use as a JSON key + URL slug
    }
  });

  test('gpt-image-1 reads from OPENAI_API_KEY', () => {
    expect(MODELS['gpt-image-1'].apiKeyEnv).toBe('OPENAI_API_KEY');
  });

  test('nano-banana reads from GOOGLE_GENERATIVE_AI_API_KEY', () => {
    expect(MODELS['nano-banana'].apiKeyEnv).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
  });
});

describe('ALLOWED_SIZES whitelist', () => {
  test('includes 1024x1024 (the default)', () => {
    expect(ALLOWED_SIZES.has('1024x1024')).toBe(true);
  });

  test('includes both portrait and landscape variants', () => {
    expect(ALLOWED_SIZES.has('1024x1536')).toBe(true);
    expect(ALLOWED_SIZES.has('1536x1024')).toBe(true);
  });

  test('rejects non-whitelisted sizes (no DALL-E 2 / 256x256 etc.)', () => {
    expect(ALLOWED_SIZES.has('256x256')).toBe(false);
    expect(ALLOWED_SIZES.has('512x512')).toBe(false);
    expect(ALLOWED_SIZES.has('2048x2048')).toBe(false);
  });
});
