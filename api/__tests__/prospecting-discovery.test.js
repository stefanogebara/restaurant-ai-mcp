/**
 * Phase 2 — discovery, warm-up cap, and the cold-intro sequencer.
 *
 * Guards: Places results normalize correctly (any BR phone → candidate; the
 * pool self-cleans via 131026 receipts), the daily cap consumes-before-send and blocks past the cap, and the
 * sequencer (a) never sends in dry-run / without a template, and (b) claims +
 * sends + records exactly once on the live path.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { normalizePlace } = require('../_lib/prospecting/places-discovery');

// ============================================================ normalizePlace
describe('normalizePlace', () => {
  const base = { id: 'place_1', displayName: { text: 'Cantina Bella' }, formattedAddress: 'Rua X, SP',
    rating: 4.6, userRatingCount: 320, websiteUri: 'https://x.com', location: { latitude: -23.5, longitude: -46.6 } };

  test('a BR mobile becomes a sendable WhatsApp candidate', () => {
    const lead = normalizePlace({ ...base, internationalPhoneNumber: '+55 11 99999-8888' }, { city: 'São Paulo', sector: 'italiano' });
    expect(lead.google_place_id).toBe('place_1');
    expect(lead.whatsapp_phone).toBe('+5511999998888');
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.source).toBe('google_places');
    expect(lead.prospect_state).toBe('aguardando');
    expect(lead.city).toBe('São Paulo');
  });

  test('a landline IS a WhatsApp candidate (BR fixed lines run WhatsApp Business)', () => {
    const lead = normalizePlace({ ...base, internationalPhoneNumber: '+55 11 3333-4444' }, {});
    expect(lead.whatsapp_phone).toBe('+551133334444');
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.whatsapp_source).toBe('google_places_fixo');
  });

  test('missing id or name → null (unusable)', () => {
    expect(normalizePlace({ displayName: { text: 'X' } }, {})).toBeNull();
    expect(normalizePlace({ id: 'p' }, {})).toBeNull();
  });
});

// ============================================================ searchPlaces (mocked fetch)
describe('searchPlaces', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; delete process.env.GOOGLE_PLACES_API_KEY; });

  test('returns normalized leads on success', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [
        { id: 'p1', displayName: { text: 'A' }, internationalPhoneNumber: '+5511999990001' },
        { id: 'p2', displayName: { text: 'B' }, internationalPhoneNumber: '+551133330002' },
      ] }),
    });
    const { searchPlaces } = require('../_lib/prospecting/places-discovery');
    const r = await searchPlaces({ query: 'restaurante', city: 'São Paulo', sector: 'geral' });
    expect(r.ok).toBe(true);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0].whatsapp_status).toBe('pending');  // mobile
    expect(r.leads[1].whatsapp_status).toBe('pending');  // landline: candidate too (self-cleans on 131026)
  });

  test('no API key → configured error', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { searchPlaces } = require('../_lib/prospecting/places-discovery');
    const r = await searchPlaces({ query: 'x', city: 'y' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('places_not_configured');
  });
});

// ============================================================ warm-up cap
describe('consumeSendSlot (in-memory, fail-closed)', () => {
  test('allows up to the cap then blocks', async () => {
    jest.resetModules();
    process.env.PROSPECTING_DAILY_CAP = '2';
    // Force the in-memory cap path: clear BOTH credential schemes the resolver accepts.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info(){}, warn(){}, error(){}, debug(){} }) }));
    const { consumeSendSlot } = require('../_lib/prospecting/prospect-warmup');
    const day = Date.parse('2099-01-01T00:00:00Z'); // isolated day key
    expect((await consumeSendSlot(day)).allowed).toBe(true);
    expect((await consumeSendSlot(day)).allowed).toBe(true);
    const third = await consumeSendSlot(day);
    expect(third.allowed).toBe(false);
    expect(third.count).toBe(3);
    expect(third.cap).toBe(2);
    delete process.env.PROSPECTING_DAILY_CAP;
  });
});

// ============================================================ sequencer
describe('dispatchIntros', () => {
  const lead = { id: 'L1', name: 'Cantina', owner_name: null, whatsapp_phone: '+5511999998888', whatsapp_status: 'pending' };

  function mockDeps({ phoneNumberId, sendResult } = {}) {
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info(){}, warn(){}, error(){}, debug(){} }) }));
    jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => phoneNumberId }));
    jest.doMock('../_lib/prospecting/prospect-warmup', () => ({ consumeSendSlot: jest.fn(async () => ({ allowed: true, count: 1, cap: 40 })) }));
    const sendTemplateMessage = jest.fn(async () => sendResult || { success: true, messageId: 'm1' });
    jest.doMock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage }));
    const claimIntro = jest.fn(async () => true);
    const markIntro = jest.fn(async () => ({ ok: true }));
    const storeMessage = jest.fn(async () => ({ stored: true }));
    const patchLead = jest.fn(async () => ({ ok: true }));
    jest.doMock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({
      isOptedOut: async () => false,
      selectIntroCandidates: async () => [lead],
      // Phase 8: empty template registry → sequencer falls back to the env
      // intro template (compat path these tests pin).
      listTemplates: async () => [],
      selectDueTouches: async () => [],
      claimIntro, markIntro, storeMessage, patchLead,
    }));
    return { sendTemplateMessage, claimIntro, markIntro, patchLead };
  }

  afterEach(() => { jest.resetModules(); delete process.env.PROSPECTING_DRY_RUN; delete process.env.PROSPECTING_INTRO_TEMPLATE; delete process.env.PROSPECTING_IGNORE_HOURS; });
  // These test the SEND logic, not the dispatch-window gate — bypass hours so
  // they're deterministic regardless of wall-clock time.
  beforeEach(() => { process.env.PROSPECTING_IGNORE_HOURS = 'true'; });

  test('dry-run (no number) → preview only, never sends', async () => {
    jest.resetModules();
    const { sendTemplateMessage, claimIntro } = mockDeps({ phoneNumberId: undefined });
    const { dispatchIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchIntros({ limit: 10 });
    expect(s.dryRun).toBe(true);
    expect(s.sent).toBe(0);
    expect(s.skipped).toBe(1);
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(claimIntro).not.toHaveBeenCalled();
  });

  test('live path → claims, sends template from the prospecting number, records', async () => {
    jest.resetModules();
    process.env.PROSPECTING_DRY_RUN = 'false';
    process.env.PROSPECTING_INTRO_TEMPLATE = 'olimpia_intro';
    const { sendTemplateMessage, claimIntro, markIntro } = mockDeps({ phoneNumberId: 'PNUM' });
    const { dispatchIntros } = require('../_lib/prospecting/sequencer');
    const s = await dispatchIntros({ limit: 10 });
    expect(s.sent).toBe(1);
    expect(claimIntro).toHaveBeenCalledWith('L1');
    expect(markIntro).toHaveBeenCalledWith('L1', { status: 'sent', wamid: 'm1' });
    expect(sendTemplateMessage).toHaveBeenCalledWith('+5511999998888', 'olimpia_intro', 'pt_BR', ['Cantina'], { phoneNumberId: 'PNUM' });
  });
});

// ---- discovery/dispatch overhaul (operator audit) ---------------------------
const { rampCap } = require('../_lib/prospecting/prospect-warmup');
const { buildAutocompleteBody, parseAutocomplete, normalizePlace: npOverhaul } = require('../_lib/prospecting/places-discovery');

describe('normalizePlace — landlines are WhatsApp candidates (self-cleaning pool)', () => {
  const base = { id: 'p1', displayName: { text: 'Cantina X' }, formattedAddress: 'Rua A, Pinheiros' };

  test('BR landline becomes a pending candidate (fixed lines run WhatsApp Business)', () => {
    const lead = npOverhaul({ ...base, nationalPhoneNumber: '(11) 3061-2277' }, { city: 'São Paulo, SP' });
    expect(lead.whatsapp_phone).toBe('+551130612277');
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.whatsapp_source).toBe('google_places_fixo');
  });

  test('mobile stays a pending candidate with the mobile source', () => {
    const lead = npOverhaul({ ...base, nationalPhoneNumber: '(11) 98877-6655' }, {});
    expect(lead.whatsapp_phone).toBe('+5511988776655');
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.whatsapp_source).toBe('google_places');
  });

  test('no phone at all → missing (nothing to send to)', () => {
    const lead = npOverhaul(base, {});
    expect(lead.whatsapp_phone).toBeNull();
    expect(lead.whatsapp_status).toBe('missing');
  });
});

describe('rampCap — warm-up grows to Meta unverified floor (250)', () => {
  test('conservative start, 250 ceiling', () => {
    expect(rampCap(0)).toBe(40);
    expect(rampCap(3)).toBe(60);
    expect(rampCap(5)).toBe(90);
    expect(rampCap(8)).toBe(150);
    expect(rampCap(12)).toBe(250);
    expect(rampCap(365)).toBe(250);
  });
  test('garbage input falls back to day zero', () => {
    expect(rampCap(NaN)).toBe(40);
    expect(rampCap(-5)).toBe(40);
  });
});

describe('places autocomplete proxy — pure builders', () => {
  test('request body targets BR localities/neighborhoods', () => {
    const b = buildAutocompleteBody('Pinheiros');
    expect(b.includedRegionCodes).toEqual(['br']);
    expect(b.includedPrimaryTypes).toContain('sublocality');
    expect(b.input).toBe('Pinheiros');
  });
  test('response parsing is defensive and capped at 8', () => {
    const mk = (t) => ({ placePrediction: { text: { text: t } } });
    const json = { suggestions: [mk('Pinheiros, São Paulo'), {}, mk('Pinhais, PR'), ...Array.from({ length: 10 }, (_, i) => mk(`X${i}`))] };
    const out = parseAutocomplete(json);
    expect(out[0]).toEqual({ texto: 'Pinheiros, São Paulo' });
    expect(out.length).toBe(8);
    expect(parseAutocomplete({})).toEqual([]);
  });
});
