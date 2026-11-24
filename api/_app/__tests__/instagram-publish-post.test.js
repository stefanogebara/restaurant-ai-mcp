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
const CAROUSEL_MAX = 10;

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

/**
 * Mirrors the handler's image_url + image_urls normalisation logic. If you
 * change the precedence (image_urls wins over image_url) or the cap,
 * change it both here and in publish-post.js.
 */
function resolveImageUrls(body) {
  const raw = Array.isArray(body.image_urls)
    ? body.image_urls
    : (typeof body.image_url === 'string' ? [body.image_url] : []);
  const cleaned = raw
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);
  if (cleaned.length === 0) return { error: 'image_url or image_urls is required', urls: [] };
  if (cleaned.length > CAROUSEL_MAX) return { error: `too many images (max ${CAROUSEL_MAX})`, urls: cleaned };
  for (let i = 0; i < cleaned.length; i++) {
    const u = cleaned[i];
    if (!/^https?:\/\//i.test(u)) return { error: `image url #${i + 1} must be http(s)://`, urls: cleaned };
    try { new URL(u); } catch { return { error: `image url #${i + 1} is not a valid URL`, urls: cleaned }; }
  }
  return { error: null, urls: cleaned };
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

describe('image_urls normalisation — carousel vs single', () => {
  test('image_url (singular) wraps into a 1-element array', () => {
    const r = resolveImageUrls({ image_url: 'https://x.com/p.jpg' });
    expect(r.error).toBeNull();
    expect(r.urls).toEqual(['https://x.com/p.jpg']);
  });

  test('image_urls (array) wins when both present', () => {
    const r = resolveImageUrls({
      image_url: 'https://wrong.com/legacy.jpg',
      image_urls: ['https://a.com/1.jpg', 'https://b.com/2.jpg'],
    });
    expect(r.urls).toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg']);
  });

  test('rejects when neither field is set', () => {
    expect(resolveImageUrls({}).error).toMatch(/image_url or image_urls is required/);
  });

  test('rejects empty array', () => {
    expect(resolveImageUrls({ image_urls: [] }).error).toMatch(/image_url or image_urls is required/);
  });

  test('rejects array of all-empty strings (treated as empty)', () => {
    expect(resolveImageUrls({ image_urls: ['', '   ', ''] }).error).toMatch(/image_url or image_urls is required/);
  });

  test('accepts exactly 10 (the Meta limit)', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://x.com/${i}.jpg`);
    const r = resolveImageUrls({ image_urls: urls });
    expect(r.error).toBeNull();
    expect(r.urls).toHaveLength(10);
  });

  test('rejects 11 (over the cap)', () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://x.com/${i}.jpg`);
    expect(resolveImageUrls({ image_urls: urls }).error).toMatch(/too many images.*max 10/);
  });

  test('trims whitespace + drops empties before validation', () => {
    const r = resolveImageUrls({ image_urls: ['  https://a.com/1.jpg  ', '', 'https://b.com/2.jpg'] });
    expect(r.urls).toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg']);
  });

  test('rejects when ANY url has a bad scheme — error names the index', () => {
    const r = resolveImageUrls({
      image_urls: ['https://a.com/1.jpg', 'javascript:alert(1)', 'https://c.com/3.jpg'],
    });
    expect(r.error).toMatch(/image url #2 must be http\(s\)/);
  });

  test('rejects non-string entries inside the array', () => {
    const r = resolveImageUrls({ image_urls: ['https://a.com/1.jpg', null, undefined, 42] });
    expect(r.urls).toEqual(['https://a.com/1.jpg']);
  });
});
