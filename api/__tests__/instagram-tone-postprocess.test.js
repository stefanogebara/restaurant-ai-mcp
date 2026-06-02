/**
 * Tests for the pure postprocess() validator in
 * api/instagram/_lib/extract-tone-profile.js. The LLM call itself is
 * exercised end-to-end via the recompute-tone smoke test; here we focus
 * on the bits that must reject hallucinated/malformed LLM output BEFORE
 * it gets written to restaurant_config.instagram_tone_profile.
 */

const { __test__ } = require('../instagram/_lib/extract-tone-profile');
const { postprocess, safeJSONParse } = __test__;

const valid = {
  formality: 4,
  emoji_density: 'medium',
  hashtag_style: 'descriptive',
  recurring_themes: ['sourdough', 'natural wine', 'neighborhood'],
  signature_phrases: ['come hang', 'fresh out the oven'],
  voice_summary: 'Your voice is warm, casual, and proudly neighborhood-focused.',
};

describe('postprocess — happy path', () => {
  test('accepts a fully-valid profile and rounds formality', () => {
    const out = postprocess({ ...valid, formality: 4.7 });
    expect(out).not.toBeNull();
    expect(out.formality).toBe(5);
    expect(out.recurring_themes).toEqual(['sourdough', 'natural wine', 'neighborhood']);
  });

  test('lowercases themes + trims', () => {
    const out = postprocess({ ...valid, recurring_themes: ['  SOURDOUGH  ', 'Natural Wine'] });
    expect(out.recurring_themes).toEqual(['sourdough', 'natural wine']);
  });

  test('truncates voice_summary to 300 chars', () => {
    const long = 'a'.repeat(500);
    const out = postprocess({ ...valid, voice_summary: long });
    expect(out.voice_summary.length).toBe(300);
  });

  test('caps recurring_themes at 8 and signature_phrases at 5', () => {
    const out = postprocess({
      ...valid,
      recurring_themes: Array(20).fill('x'),
      signature_phrases: Array(20).fill('y'),
    });
    expect(out.recurring_themes.length).toBe(8);
    expect(out.signature_phrases.length).toBe(5);
  });
});

describe('postprocess — rejects malformed shape', () => {
  test.each([
    ['null root', null],
    ['non-object', 'string'],
    ['missing formality', { ...valid, formality: undefined }],
    ['formality out of range', { ...valid, formality: 11 }],
    ['formality NaN', { ...valid, formality: 'high' }],
    ['unknown emoji_density value', { ...valid, emoji_density: 'rampant' }],
    ['unknown hashtag_style value', { ...valid, hashtag_style: 'aggressive' }],
    ['themes not array', { ...valid, recurring_themes: 'sourdough' }],
    ['signatures not array', { ...valid, signature_phrases: null }],
    ['empty voice_summary', { ...valid, voice_summary: '' }],
    ['voice_summary not string', { ...valid, voice_summary: 42 }],
  ])('rejects: %s', (_label, input) => {
    expect(postprocess(input)).toBeNull();
  });
});

describe('safeJSONParse', () => {
  test('parses raw JSON', () => {
    expect(safeJSONParse('{"a":1}')).toEqual({ a: 1 });
  });

  test('strips ```json fences', () => {
    expect(safeJSONParse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('strips bare ``` fences', () => {
    expect(safeJSONParse('```\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  test('returns null on bad JSON', () => {
    expect(safeJSONParse('not json')).toBeNull();
  });
});
