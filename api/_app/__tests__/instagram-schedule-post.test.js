/**
 * Tests for the validation rules in api/instagram/schedule-post.js. The
 * handler doesn't export validators, so we re-implement the same logic
 * here to lock the contract — if a limit changes in the handler, the
 * matching test should change with it.
 *
 * What this catches:
 *   - scheduled_at must parse as a date
 *   - scheduled_at must be ≥1 min from now (no insta-fire)
 *   - scheduled_at must be ≤90 days out
 *   - image_urls inherits the same shape rules as publish-post
 *
 * Caption + hashtag rules are already covered in
 * instagram-publish-post.test.js (we duplicated the limit constants
 * there too) — this suite focuses on the schedule-specific time rules.
 */

const MIN_LEAD_MS = 60 * 1000;
const MAX_LEAD_DAYS = 90;
const MAX_LEAD_MS = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;

function validateScheduledAt(raw, nowMs = Date.now()) {
  if (typeof raw !== 'string') return 'scheduled_at must be an ISO date string';
  const t = new Date(raw);
  if (isNaN(t.getTime())) return 'scheduled_at must be an ISO date string';
  const leadMs = t.getTime() - nowMs;
  if (leadMs < MIN_LEAD_MS) return 'scheduled_at must be at least 1 minute in the future';
  if (leadMs > MAX_LEAD_MS) return `scheduled_at can't be more than ${MAX_LEAD_DAYS} days from now`;
  return null;
}

describe('validateScheduledAt — time bounds', () => {
  const NOW = new Date('2026-06-06T12:00:00Z').getTime();

  test('rejects non-string input', () => {
    expect(validateScheduledAt(undefined, NOW)).toMatch(/ISO/);
    expect(validateScheduledAt(null, NOW)).toMatch(/ISO/);
    expect(validateScheduledAt(42, NOW)).toMatch(/ISO/);
  });

  test('rejects garbage string', () => {
    expect(validateScheduledAt('definitely not a date', NOW)).toMatch(/ISO/);
    expect(validateScheduledAt('', NOW)).toMatch(/ISO/);
  });

  test('rejects times in the past', () => {
    const past = new Date(NOW - 60 * 1000).toISOString();
    expect(validateScheduledAt(past, NOW)).toMatch(/at least 1 minute/);
  });

  test('rejects times less than 1 minute out (race-condition guard)', () => {
    const tooSoon = new Date(NOW + 30 * 1000).toISOString();
    expect(validateScheduledAt(tooSoon, NOW)).toMatch(/at least 1 minute/);
  });

  test('accepts exactly 1 minute in the future', () => {
    const justOk = new Date(NOW + 60 * 1000).toISOString();
    expect(validateScheduledAt(justOk, NOW)).toBeNull();
  });

  test('accepts 30 days out (typical case)', () => {
    const thirtyDays = new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(validateScheduledAt(thirtyDays, NOW)).toBeNull();
  });

  test('accepts exactly 90 days out (the cap)', () => {
    const ninety = new Date(NOW + MAX_LEAD_MS).toISOString();
    expect(validateScheduledAt(ninety, NOW)).toBeNull();
  });

  test('rejects 91 days out', () => {
    const ninetyOne = new Date(NOW + MAX_LEAD_MS + 24 * 60 * 60 * 1000).toISOString();
    expect(validateScheduledAt(ninetyOne, NOW)).toMatch(/90 days/);
  });
});

// ─── Cron lock semantics (UPDATE...WHERE status='pending' guard) ────────
//
// The cron uses an atomic UPDATE that only matches rows still in
// 'pending'. We can't easily integration-test the real DB here, but we
// can pin the semantics expected of the WHERE clause so a future
// refactor (e.g. someone "simplifies" the lock to a plain UPDATE)
// shouldn't pass the test.
//
// Model: a tiny in-memory representation of the row + a function that
// mimics what postgres does for `UPDATE...WHERE id=$1 AND status=$2`.

describe('cancel — UUID guard before SQL', () => {
  // Mirrors the UUID_RE check in schedule-post.js handleCancel. Without
  // this, postgres rejects non-UUID `WHERE id = $1` casts and the
  // handler returned the cryptic "Database error" surfaced as a toast.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

  test.each([
    '00000000-0000-0000-0000-000000000000',                  // nil UUID
    '550e8400-e29b-41d4-a716-446655440000',                  // v4
    'A3F6E59C-5D6E-4F00-B6F2-1F0C5E6D2A11',                  // uppercase ok
    '0bfaf2ba-31ab-48ae-868f-6a53345a6a86',                  // a real one from prod
  ])('accepts a real UUID: %s', (id) => {
    expect(isValidUuid(id)).toBe(true);
  });

  test.each([
    'p1',                                                    // test fixture id
    'fake-uuid-test',                                        // smoke probe id
    '',                                                      // empty
    'definitely-not-a-uuid',                                 // close but no
    "00000000-0000-0000-0000-000000000000'; DROP TABLE--",   // sql injection attempt
    '00000000-0000-0000-0000',                               // too short
    '00000000-0000-0000-0000-0000000000001',                 // too long
  ])('rejects non-UUID input: %p', (id) => {
    expect(isValidUuid(id)).toBe(false);
  });
});

describe('cron lock semantics', () => {
  function tryClaim(row, claimedStatus = 'pending') {
    if (row.status !== claimedStatus) return { matchedRows: 0, row };
    return {
      matchedRows: 1,
      row: { ...row, status: 'processing', attempts: row.attempts + 1 },
    };
  }

  test('first run claims pending row → 1 matched, status flips, attempts++', () => {
    const row = { id: 'r1', status: 'pending', attempts: 0 };
    const { matchedRows, row: next } = tryClaim(row);
    expect(matchedRows).toBe(1);
    expect(next.status).toBe('processing');
    expect(next.attempts).toBe(1);
  });

  test('concurrent second claim on already-processing row → 0 matched', () => {
    const taken = { id: 'r1', status: 'processing', attempts: 1 };
    const { matchedRows } = tryClaim(taken);
    expect(matchedRows).toBe(0);
  });

  test('completed rows are never re-claimed', () => {
    const done = { id: 'r1', status: 'completed', attempts: 1 };
    expect(tryClaim(done).matchedRows).toBe(0);
  });

  test('canceled rows are never claimed (user-cancel beat the cron)', () => {
    const canceled = { id: 'r1', status: 'canceled', attempts: 0 };
    expect(tryClaim(canceled).matchedRows).toBe(0);
  });

  test('failed rows can be re-claimed for retry (handler should reset to pending first)', () => {
    // The cron's retry path flips failed→pending before claiming. Once
    // pending, the claim works again.
    const failed = { id: 'r1', status: 'failed', attempts: 1 };
    expect(tryClaim(failed).matchedRows).toBe(0);
    const requeued = { ...failed, status: 'pending' };
    expect(tryClaim(requeued).matchedRows).toBe(1);
  });
});

// ─── C.21: media_type discriminator + reel-specific validation ────────

const CAROUSEL_MAX = 10;
const MAX_CAPTION_LEN = 2200;

/**
 * Mirrors the handler's media_type + payload validation. If the rules
 * change in schedule-post.js, this should change with them — keeps a
 * single source of truth for what the cron will actually accept.
 */
function validateScheduleBody(body) {
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  const mediaTypeRaw = typeof body.media_type === 'string' ? body.media_type.toLowerCase() : 'feed';
  if (mediaTypeRaw !== 'feed' && mediaTypeRaw !== 'reel') {
    return { error: "media_type must be 'feed' or 'reel'" };
  }
  if (!caption) return { error: 'caption is required' };
  if (caption.length > MAX_CAPTION_LEN) return { error: 'caption is too long' };

  if (mediaTypeRaw === 'feed') {
    const rawUrls = Array.isArray(body.image_urls) ? body.image_urls : [];
    const imageUrls = rawUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter((u) => u.length > 0);
    if (imageUrls.length === 0) return { error: 'image_urls is required' };
    if (imageUrls.length > CAROUSEL_MAX) return { error: `too many images (max ${CAROUSEL_MAX})` };
    for (let i = 0; i < imageUrls.length; i++) {
      const u = imageUrls[i];
      if (!/^https?:\/\//i.test(u)) return { error: `image url #${i + 1} must be http(s)://` };
      try { new URL(u); } catch { return { error: `image url #${i + 1} is not a valid URL` }; }
    }
    return { error: null, mediaType: 'feed', imageUrls, videoUrl: null };
  }

  // reel
  const videoUrl = typeof body.video_url === 'string' ? body.video_url.trim() : '';
  if (!videoUrl) return { error: 'video_url is required for reels' };
  if (!/^https?:\/\//i.test(videoUrl)) return { error: 'video_url must be http(s)://' };
  try { new URL(videoUrl); } catch { return { error: 'video_url is not a valid URL' }; }
  return { error: null, mediaType: 'reel', imageUrls: null, videoUrl };
}

describe('media_type discriminator', () => {
  test('defaults to feed when omitted (back-compat with old clients)', () => {
    const r = validateScheduleBody({
      caption: 'x', image_urls: ['https://x.com/a.jpg'],
    });
    expect(r.error).toBeNull();
    expect(r.mediaType).toBe('feed');
  });

  test('case-insensitive: REEL accepted', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'REEL', video_url: 'https://x.com/v.mp4',
    });
    expect(r.error).toBeNull();
    expect(r.mediaType).toBe('reel');
  });

  test('rejects unknown media_type', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'story', video_url: 'https://x.com/v.mp4',
    });
    expect(r.error).toMatch(/'feed' or 'reel'/);
  });
});

describe('reel-specific validation', () => {
  test('rejects reel without video_url', () => {
    const r = validateScheduleBody({ caption: 'x', media_type: 'reel' });
    expect(r.error).toMatch(/video_url is required/);
  });

  test('rejects reel with javascript: video_url (XSS guard)', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'reel', video_url: 'javascript:alert(1)',
    });
    expect(r.error).toMatch(/must be http\(s\)/);
  });

  test('rejects reel with data: video_url (XSS guard)', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'reel', video_url: 'data:video/mp4;base64,XYZ',
    });
    expect(r.error).toMatch(/must be http\(s\)/);
  });

  test('rejects reel with file: video_url (SSRF guard)', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'reel', video_url: 'file:///etc/passwd',
    });
    expect(r.error).toMatch(/must be http\(s\)/);
  });

  test('accepts reel with valid https video_url', () => {
    const r = validateScheduleBody({
      caption: 'New menu!', media_type: 'reel',
      video_url: 'https://storage.example.com/instagram-uploads/r/abc.mp4',
    });
    expect(r.error).toBeNull();
    expect(r.videoUrl).toBe('https://storage.example.com/instagram-uploads/r/abc.mp4');
    expect(r.imageUrls).toBeNull();
  });

  test('reel mode ignores image_urls even if provided (wrong shape, right intent)', () => {
    const r = validateScheduleBody({
      caption: 'x', media_type: 'reel', video_url: 'https://x.com/v.mp4',
      image_urls: ['https://x.com/a.jpg'],  // ignored
    });
    expect(r.error).toBeNull();
    expect(r.imageUrls).toBeNull();
    expect(r.videoUrl).toBe('https://x.com/v.mp4');
  });
});

describe('feed validation unchanged after C.21 migration', () => {
  test('feed without image_urls still rejected', () => {
    expect(validateScheduleBody({ caption: 'x', media_type: 'feed' }).error)
      .toMatch(/image_urls is required/);
  });

  test('feed with 10 images OK, 11 rejected', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `https://x.com/${i}.jpg`);
    expect(validateScheduleBody({ caption: 'x', media_type: 'feed', image_urls: ten }).error).toBeNull();
    expect(validateScheduleBody({ caption: 'x', media_type: 'feed', image_urls: [...ten, 'https://x.com/11.jpg'] }).error)
      .toMatch(/too many images/);
  });
});
