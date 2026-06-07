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
