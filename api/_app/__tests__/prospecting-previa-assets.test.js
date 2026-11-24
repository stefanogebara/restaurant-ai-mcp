/**
 * Prévia personalization assets (Place Details v1): the real photo + real
 * review quotes that make /previa read as "é o MEU restaurante".
 *
 * Contracts: shapes mirror scrape-restaurant.js (photo_ref = photos[0].name,
 * top_reviews[{text, rating, author, time}]), low-rating/textless reviews are
 * filtered, and EVERY failure path degrades to {} — a Google hiccup must never
 * block prévia creation.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), schema: jest.fn() } }));

const { fetchPlaceAssets } = require('../_lib/prospecting/prospect-demo');

describe('fetchPlaceAssets — Place Details → prévia wow assets', () => {
  const PLACE = {
    photos: [{ name: 'places/ChIJabc123/photos/AUjq9jnZxyz' }],
    reviews: [
      { text: { text: 'Melhor picanha da região, atendimento nota 10.' }, rating: 5, authorAttribution: { displayName: 'Marcos' }, relativePublishTimeDescription: 'há um mês' },
      { text: { text: 'Péssimo.' }, rating: 1, authorAttribution: { displayName: 'Troll' } },
      { text: { text: '' }, rating: 5 },
      { rating: 5 },
      { text: { text: 'Voltarei sempre!' }, rating: 4 },
    ],
  };

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => PLACE }));
  });
  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete global.fetch;
  });

  test('maps photo_ref + filtered top_reviews in the scrape-restaurant shape', async () => {
    const assets = await fetchPlaceAssets('ChIJabc123');
    expect(assets.photo_ref).toBe('places/ChIJabc123/photos/AUjq9jnZxyz');
    // 1-star, empty-text and textless reviews filtered out.
    expect(assets.top_reviews).toEqual([
      { text: 'Melhor picanha da região, atendimento nota 10.', rating: 5, author: 'Marcos', time: 'há um mês' },
      { text: 'Voltarei sempre!', rating: 4, author: 'um cliente', time: '' },
    ]);
    // v1 headers: key travels in X-Goog-Api-Key, fields are masked.
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJabc123');
    expect(opts.headers['X-Goog-Api-Key']).toBe('test-key');
    expect(opts.headers['X-Goog-FieldMask']).toBe('photos,reviews');
  });

  test('non-ok response → {} (prévia proceeds without assets)', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(fetchPlaceAssets('ChIJabc123')).resolves.toEqual({});
  });

  test('fetch throws → {}', async () => {
    global.fetch = jest.fn(async () => { throw new Error('network'); });
    await expect(fetchPlaceAssets('ChIJabc123')).resolves.toEqual({});
  });

  test('no API key or no place id → {} without calling Google', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(fetchPlaceAssets('ChIJabc123')).resolves.toEqual({});
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    await expect(fetchPlaceAssets(null)).resolves.toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('place with no photos/reviews → {} keys omitted, not null-filled', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    const assets = await fetchPlaceAssets('ChIJabc123');
    expect(assets).toEqual({});
  });
});
