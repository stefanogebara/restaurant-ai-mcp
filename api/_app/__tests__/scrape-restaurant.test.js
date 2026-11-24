/**
 * Tests for POST /api/scrape-restaurant
 */
const handler = require('../scrape-restaurant');

// Mock dependencies
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => false),
}));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'demo-123' }, error: null }),
  },
}));

function createReq(method, body) {
  return { method, body: { restaurant_id: 'demo-123', ...body }, headers: {} };
}

function createRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

describe('POST /api/scrape-restaurant', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('GET returns 405', async () => {
    const res = createRes();
    await handler(createReq('GET', {}), res);
    expect(res.statusCode).toBe(405);
  });

  test('missing query returns 400', async () => {
    const res = createRes();
    await handler(createReq('POST', { city: 'Madrid' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('query');
  });

  test('missing city returns 400', async () => {
    const res = createRes();
    await handler(createReq('POST', { query: 'Bella Roma' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('city');
  });

  test('no API key returns 503', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const res = createRes();
    await handler(createReq('POST', { query: 'Bella Roma', city: 'Madrid' }), res);
    expect(res.statusCode).toBe(503);
  });

  test('successful scrape returns results', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          displayName: { text: 'Bella Roma' },
          formattedAddress: '123 Via Roma, Madrid',
          internationalPhoneNumber: '+34 912 345 678',
          rating: 4.5,
          userRatingCount: 200,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          regularOpeningHours: {
            weekdayDescriptions: ['Monday: 12:00 – 23:00'],
            periods: [
              { open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } },
            ],
          },
          websiteUri: 'https://bellaroma.es',
          types: ['italian_restaurant', 'restaurant'],
          primaryType: 'italian_restaurant',
          editorialSummary: { text: 'Cozy Italian spot in central Madrid' },
          googleMapsUri: 'https://maps.google.com/?cid=123',
          reviews: [
            { text: { text: 'Great pasta!' }, rating: 5, authorAttribution: { displayName: 'John' } },
          ],
          photos: [{ name: 'places/123/photos/abc' }],
        }],
      }),
    });

    const res = createRes();
    await handler(createReq('POST', { query: 'Bella Roma', city: 'Madrid' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(1);

    const result = res.body.results[0];
    expect(result.name).toBe('Bella Roma');
    expect(result.address).toBe('123 Via Roma, Madrid');
    expect(result.phone).toBe('+34 912 345 678');
    expect(result.rating).toBe(4.5);
    expect(result.review_count).toBe(200);
    expect(result.cuisine_type).toBe('Italian');
    expect(result.website).toBe('https://bellaroma.es');
    expect(result.google_maps_url).toBe('https://maps.google.com/?cid=123');
    expect(result.business_hours).toBeTruthy();
    expect(result.business_hours.monday.is_open).toBe(true);
    expect(result.business_hours.monday.open_time).toBe('12:00');
    expect(result.top_reviews).toHaveLength(1);
    expect(result.top_reviews[0].text).toBe('Great pasta!');
  });

  test('mantém até 5 reviews (máximo do Places v1) — 3 deixava o enriquecimento faminto', async () => {
    // Verificado no funil em 24/ago: com 3 reviews o Fasano saiu com UM prato
    // no "Sua IA já foi treinada". O prompt de insights aceita até 8.
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          displayName: { text: 'Fasano' },
          types: ['restaurant'],
          reviews: Array.from({ length: 6 }, (_, i) => ({
            text: { text: `review ${i + 1}` }, rating: 5,
            authorAttribution: { displayName: `Autor ${i + 1}` },
          })),
        }],
      }),
    });

    const res = createRes();
    await handler(createReq('POST', { query: 'Fasano', city: 'São Paulo' }), res);
    expect(res.statusCode).toBe(200);
    const result = res.body.results[0];
    expect(result.top_reviews).toHaveLength(5);
    expect(result.top_reviews[4].text).toBe('review 5');
  });

  test('no places found returns 404', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    });

    const res = createRes();
    await handler(createReq('POST', { query: 'Nonexistent', city: 'Nowhere' }), res);
    expect(res.statusCode).toBe(404);
  });

  test('Google API error returns 502', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    const res = createRes();
    await handler(createReq('POST', { query: 'Test', city: 'Test' }), res);
    expect(res.statusCode).toBe(502);
  });

  test('cuisine inference works for various types', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';

    const testCases = [
      { types: ['japanese_restaurant'], expected: 'Japanese' },
      { types: ['steak_house'], expected: 'Steakhouse' },
      { types: ['cafe'], expected: 'Cafe' },
      { types: ['restaurant'], expected: 'Restaurant' },
    ];

    for (const tc of testCases) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [{
            displayName: { text: 'Test' },
            types: tc.types,
          }],
        }),
      });

      const res = createRes();
      await handler(createReq('POST', { query: 'Test', city: 'Test' }), res);
      expect(res.body.results[0].cuisine_type).toBe(tc.expected);
    }
  });
});

describe('idioma dos dados do Google — a credibilidade do demo', () => {
  /**
   * Verificado ao vivo em produção (27/jul/2026, Mocotó em São Paulo): a
   * chamada fixava languageCode 'en', então o dono de um restaurante brasileiro
   * via, na página em português que promete "os dados reais do seu
   * restaurante":
   *
   *   "Monday: 12:00 – 10:00 PM"
   *   "A contemporary, art-themed Northeastern restaurant..."
   *
   * Dia da semana em inglês e relógio de 12h num país que usa 24h — exatamente
   * no momento em que a página tenta ganhar confiança.
   */
  const corpoDoPlaces = {
    places: [{
      displayName: { text: 'Mocotó' },
      formattedAddress: 'Av. Loreto, 1100',
      types: ['brazilian_restaurant'],
    }],
  };

  const idiomaEnviado = () => JSON.parse(global.fetch.mock.calls[0][1].body).languageCode;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'chave';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => corpoDoPlaces });
  });

  it('pede pt-BR por padrão — o mercado é o Brasil', async () => {
    await handler(createReq('POST', { query: 'Mocotó', city: 'São Paulo' }), createRes());
    expect(idiomaEnviado()).toBe('pt-BR');
  });

  it('respeita a interface em inglês', async () => {
    await handler(createReq('POST', { query: 'Mocotó', city: 'São Paulo', lang: 'en' }), createRes());
    expect(idiomaEnviado()).toBe('en');
  });

  it('respeita espanhol', async () => {
    await handler(createReq('POST', { query: 'Mocotó', city: 'São Paulo', lang: 'es' }), createRes());
    expect(idiomaEnviado()).toBe('es');
  });

  it('idioma desconhecido cai em pt-BR em vez de repassar lixo pro Google', async () => {
    await handler(createReq('POST', { query: 'Mocotó', city: 'São Paulo', lang: 'klingon' }), createRes());
    expect(idiomaEnviado()).toBe('pt-BR');
  });

  it('o tipo de cozinha NÃO depende do idioma — vem de enum, não de texto', async () => {
    // Blindagem: se um dia inferCuisineType passar a ler texto localizado, a
    // troca de idioma quebraria em silêncio a normalização do enum no banco.
    const res = createRes();
    await handler(createReq('POST', { query: 'Mocotó', city: 'São Paulo', lang: 'pt-BR' }), res);
    expect(res.body.results[0].cuisine_type).toBe('Brazilian');
  });
});
