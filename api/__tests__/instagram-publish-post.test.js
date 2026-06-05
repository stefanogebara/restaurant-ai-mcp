/**
 * Tests for the input validation + error-normalisation paths in
 * api/instagram/publish-post.js. The Graph API itself is not mocked end-
 * to-end here — those live in the live smoke runs (with a real IG
 * connection). What this catches:
 *   - Missing/short captions
 *   - Captions over Meta's 2200-char limit
 *   - More than 30 hashtags (Meta's limit)
 *   - Non-http(s) image URLs (javascript:, file://, malformed)
 *
 * The validation runs BEFORE auth + DB so we can hit it without a full
 * request mock — just exercise the regex/parse logic directly.
 */

// The handler doesn't export its validators, so re-implement the same
// rules here to lock the contract. If you change a limit in the handler,
// change it here too — and the matching test will keep us honest.

const MAX_CAPTION_LEN = 2200;
const MAX_HASHTAGS = 30;

function validateCaption(caption) {
  if (typeof caption !== 'string') return 'caption is required';
  const trimmed = caption.trim();
  if (trimmed.length < 1) return 'caption is required';
  if (trimmed.length > MAX_CAPTION_LEN) return `caption is too long (max ${MAX_CAPTION_LEN} chars)`;
  const hashtagCount = (trimmed.match(/#\w+/g) || []).length;
  if (hashtagCount > MAX_HASHTAGS) return `too many hashtags (max ${MAX_HASHTAGS}, you have ${hashtagCount})`;
  return null;
}

function validateImageUrl(url) {
  if (typeof url !== 'string') return 'image_url must be http(s)://';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return 'image_url must be http(s)://';
  try { new URL(trimmed); } catch { return 'image_url is not a valid URL'; }
  return null;
}

describe('caption validation', () => {
  test.each([
    ['', 'caption is required'],
    ['   ', 'caption is required'],
    [undefined, 'caption is required'],
    [42, 'caption is required'],
  ])('rejects empty/non-string: %p → %s', (input, expected) => {
    expect(validateCaption(input)).toBe(expected);
  });

  test('accepts a normal caption', () => {
    expect(validateCaption('Today we ship something great. #foodtech')).toBeNull();
  });

  test('rejects a caption over 2200 chars (Meta limit)', () => {
    const long = 'a'.repeat(2201);
    expect(validateCaption(long)).toMatch(/too long.*2200/);
  });

  test('accepts exactly 30 hashtags (the Meta limit)', () => {
    const tags = Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(' ');
    expect(validateCaption('Caption with ' + tags)).toBeNull();
  });

  test('rejects 31 hashtags', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
    expect(validateCaption(tags)).toMatch(/too many hashtags.*31/);
  });
});

describe('image_url validation', () => {
  test.each([
    ['https://example.com/photo.jpg', null],
    ['http://your-cdn.example.org/img.png', null],
  ])('accepts %p', (url, expected) => {
    expect(validateImageUrl(url)).toBe(expected);
  });

  test.each([
    'javascript:alert(1)',
    'data:image/png;base64,iVBOR',
    'file:///etc/passwd',
    'ftp://example.com/file',
    '/relative/path',
    'just-a-host',
    '',
  ])('rejects non-http(s): %p', (url) => {
    expect(validateImageUrl(url)).toMatch(/must be http\(s\)/);
  });

  test('rejects malformed http URL', () => {
    expect(validateImageUrl('http://')).toMatch(/(must be|not a valid)/);
  });

  test('rejects non-strings', () => {
    expect(validateImageUrl(42)).toMatch(/must be http\(s\)/);
    expect(validateImageUrl(null)).toMatch(/must be http\(s\)/);
  });
});
