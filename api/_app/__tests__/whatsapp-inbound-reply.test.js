'use strict';

const mockRows = new Map();
let mockFailure = null;
const mockRatingRows = { feedback: null, survey: null };
const mockRatingFilters = [];
jest.mock('../_lib/supabase', () => {
  const query = kind => {
    const builder = {
      select: () => builder,
      eq: (field, value) => { mockRatingFilters.push([kind, field, value]); return builder; },
      maybeSingle: async () => ({ data: mockRatingRows[kind], error: null }),
    };
    return builder;
  };
  return { supabaseAdmin: {
    from: () => query('feedback'),
    schema: () => ({ from: () => query('survey') }),
  } };
});
jest.mock('../_lib/central-supabase', () => ({
  centralSupabase: { from: () => ({
    select: () => ({ eq: (_field, key) => ({ maybeSingle: async () =>
      mockFailure ? { data: null, error: mockFailure } : { data: mockRows.get(key) || null, error: null } }) }),
    insert: async row => {
      if (mockFailure) return { error: mockFailure };
      if (mockRows.has(row.inbound_key)) return { error: { code: '23505' } };
      mockRows.set(row.inbound_key, { reply_text: row.reply_text, purpose: row.purpose,
        restaurant_id: row.restaurant_id });
      return { error: null };
    },
  }) },
}));

const { replyKey, getPendingReply, savePendingReply, getRecordedRating } = require('../_lib/channels/inbound-reply');
const a = { provider: 'meta', receiver: '11111111111' };
const b = { provider: 'meta', receiver: '22222222222' };

beforeEach(() => { mockRows.clear(); mockFailure = null;
  mockRatingRows.feedback = null; mockRatingRows.survey = null; mockRatingFilters.length = 0; });

test('reply is keyed to the receiving account and duplicate writes cannot overwrite it', async () => {
  expect(replyKey(a, 'same')).not.toBe(replyKey(b, 'same'));
  await savePendingReply(a, 'same', 'Original reply', 'feedback', 'restaurant-a');
  await savePendingReply(a, 'same', 'Later hallucination', 'feedback', 'restaurant-b');
  expect(await getPendingReply(a, 'same')).toEqual({ reply_text: 'Original reply',
    purpose: 'feedback', restaurant_id: 'restaurant-a' });
  expect(await getPendingReply(b, 'same')).toBeNull();
});

test('database failure prevents an untracked outbound send', async () => {
  mockFailure = { code: '08006' };
  await expect(savePendingReply(a, 'message', 'hello', 'ai')).rejects.toThrow('write failed');
  await expect(getPendingReply(a, 'message')).rejects.toThrow('lookup failed');
});

test('saved rating recovery is scoped to inbound account key and restaurant', async () => {
  mockRatingRows.feedback = { rating: 5, comment: 'Great' };
  expect(await getRecordedRating(a, 'message-1', 'restaurant-a')).toEqual({
    rating: 5, comment: 'Great', purpose: 'feedback',
  });
  expect(mockRatingFilters).toContainEqual(['feedback', 'whatsapp_inbound_key', replyKey(a, 'message-1')]);
  expect(mockRatingFilters).toContainEqual(['feedback', 'restaurant_id', 'restaurant-a']);
  mockRatingRows.feedback = null;
  mockRatingRows.survey = { rating: 4, comment: null };
  expect(await getRecordedRating(b, 'message-1', 'restaurant-b')).toEqual({
    rating: 4, comment: null, purpose: 'pesquisa',
  });
  expect(mockRatingFilters).toContainEqual(['survey', 'restaurant_id', 'restaurant-b']);
  expect(replyKey(a, 'message-1')).not.toBe(replyKey(b, 'message-1'));
});
