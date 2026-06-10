/**
 * Tests for api/enrich-restaurant.js focused on the website-extraction
 * pass — specifically the contact + business_hours normalisation we added
 * so onboarding Step 0's website-fallback path can prefill those fields.
 *
 * Strategy: stub the LLM client + fetch so we can drive the LLM's output
 * deterministically and only assert how enrichFromWebsite shapes it.
 */

const mockAIMessagesCreate = jest.fn();
jest.mock('../_lib/ai-client', () => ({
  getAI: jest.fn().mockResolvedValue({
    messages: { create: (...args) => mockAIMessagesCreate(...args) },
  }),
  AI_MODEL_FAST: 'claude-haiku-test',
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

// The website fetch goes through the SSRF-safe helper (per-hop private-IP
// rejection), not global fetch — mock it so tests can drive the HTML body.
const mockSafeFetchText = jest.fn();
jest.mock('../_lib/safe-fetch', () => ({
  safeFetchText: (...args) => mockSafeFetchText(...args),
}));

// Helpers were extracted to _lib in c531f237 (demo.js bundling fix); the
// handler file now only exports the HTTP handler.
const { enrichRestaurant } = require('../_lib/enrich-restaurant');

// Helper: stub the safe fetch with a single HTML body. Each test reassigns this.
function stubFetch(html) {
  mockSafeFetchText.mockResolvedValue({
    text: html,
    finalUrl: 'https://example.test/',
    truncated: false,
  });
}
function stubFetchError(error = 'network down') {
  mockSafeFetchText.mockRejectedValue(new Error(error));
}

beforeEach(() => {
  jest.clearAllMocks();
});

function llmReturns(jsonObj) {
  mockAIMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(jsonObj) }],
  });
}

const MIN_HTML = '<html><body>' + 'menu '.repeat(40) + '</body></html>';

describe('contact normalisation', () => {
  test('LLM returns a complete contact bag → all three fields surface', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [],
      popular_dishes: [],
      social_handles: {},
      hours_text: null,
      contact: {
        phone: '+55 11 5555 1234',
        address: 'Rua das Flores 123, São Paulo',
        email: 'reservas@cantina.example',
      },
      business_hours: null,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.contact).toEqual({
      phone: '+55 11 5555 1234',
      address: 'Rua das Flores 123, São Paulo',
      email: 'reservas@cantina.example',
    });
  });

  test('empty strings get collapsed to null', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [],
      popular_dishes: [],
      social_handles: {},
      hours_text: null,
      contact: { phone: '+55 11 5555 1234', address: '   ', email: '' },
      business_hours: null,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.contact).toEqual({
      phone: '+55 11 5555 1234',
      address: null,
      email: null,
    });
  });

  test('all-null contact → menu.contact is null (caller can short-circuit)', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [],
      popular_dishes: [],
      social_handles: {},
      hours_text: null,
      contact: { phone: null, address: null, email: null },
      business_hours: null,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.contact).toBeNull();
  });

  test('missing contact key entirely → null', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [],
      popular_dishes: [],
      social_handles: {},
      hours_text: null,
      business_hours: null,
      // contact omitted
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.contact).toBeNull();
  });

  test('non-string values are dropped, not coerced', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [],
      popular_dishes: [],
      social_handles: {},
      hours_text: null,
      contact: { phone: 12345, address: ['Rua X'], email: null },
      business_hours: null,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    // phone was a number, address was an array → both rejected
    expect(menu.contact).toBeNull();
  });
});

describe('business_hours normalisation', () => {
  const FULL_WEEK = {
    monday:    { open_time: '12:00', close_time: '23:00', is_open: true },
    tuesday:   { open_time: '12:00', close_time: '23:00', is_open: true },
    wednesday: { open_time: '12:00', close_time: '23:00', is_open: true },
    thursday:  { open_time: '12:00', close_time: '23:00', is_open: true },
    friday:    { open_time: '12:00', close_time: '23:30', is_open: true },
    saturday:  { open_time: '13:00', close_time: '23:30', is_open: true },
    sunday:    { open_time: '13:00', close_time: '17:00', is_open: true },
  };

  test('full valid week → passes through', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: FULL_WEEK,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours?.friday).toEqual({ open_time: '12:00', close_time: '23:30', is_open: true });
    expect(menu.business_hours?.sunday.is_open).toBe(true);
  });

  test('LLM returns invalid time format → that day is_open=false, others preserved', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: {
        ...FULL_WEEK,
        wednesday: { open_time: '12pm', close_time: '23 oclock', is_open: true }, // garbage
      },
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours?.wednesday).toEqual({ open_time: null, close_time: null, is_open: false });
    // Other days are unaffected
    expect(menu.business_hours?.monday.is_open).toBe(true);
  });

  test('missing day key → defaults to closed', async () => {
    stubFetch(MIN_HTML);
    const partialWeek = { ...FULL_WEEK };
    delete partialWeek.sunday;
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: partialWeek,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours?.sunday).toEqual({ open_time: null, close_time: null, is_open: false });
  });

  test('every day closed → menu.business_hours is null (no fake "all closed" week)', async () => {
    stubFetch(MIN_HTML);
    const allClosed = Object.fromEntries(
      Object.keys(FULL_WEEK).map((d) => [d, { open_time: null, close_time: null, is_open: false }]),
    );
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: allClosed,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours).toBeNull();
  });

  test('LLM returns business_hours=null → menu.business_hours is null', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: null,
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours).toBeNull();
  });

  test('is_open=true but times null → coerced to closed (no half-open day)', async () => {
    stubFetch(MIN_HTML);
    llmReturns({
      menu_items: [], popular_dishes: [], social_handles: {}, hours_text: null,
      contact: null,
      business_hours: {
        ...FULL_WEEK,
        monday: { open_time: null, close_time: null, is_open: true },
      },
    });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu.business_hours?.monday).toEqual({ open_time: null, close_time: null, is_open: false });
  });
});

describe('failure paths preserve existing fields', () => {
  test('website fetch fails → menu is null', async () => {
    stubFetchError('ENOTFOUND');
    const { menu } = await enrichRestaurant({ website: 'https://nope.example', restaurant_name: 'X' });
    expect(menu).toBeNull();
  });

  test('LLM returns non-JSON → menu is null', async () => {
    stubFetch(MIN_HTML);
    mockAIMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry I cannot help with that' }] });
    const { menu } = await enrichRestaurant({ website: 'https://example.test', restaurant_name: 'X' });
    expect(menu).toBeNull();
  });
});
