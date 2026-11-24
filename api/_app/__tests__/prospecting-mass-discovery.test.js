/**
 * Phase 9 — mass discovery (pure logic).
 *
 * Guards the territory→queries expansion (bairro/cidade/estado), the
 * max-queries cap, and the sendable-only contract (mobile = WhatsApp-capable).
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const { buildQueries, ZONAS_FALLBACK } = require('../_lib/prospecting/prospect-mass-discovery');
const { normalizePlace } = require('../_lib/prospecting/places-discovery');

// ============================================================ expansion
describe('buildQueries — territory fan-out', () => {
  test('bairro: single deep query (60 results) scoped to city+UF', () => {
    const q = buildQueries({ mode: 'bairro', uf: 'SP', city: 'São Paulo', bairro: 'Jardins', query: 'restaurantes' });
    expect(q).toEqual([{ q: 'restaurantes Jardins', city: 'São Paulo, SP', results: 60 }]);
  });

  test('cidade: city-wide sweep first, then one query per IBGE district', () => {
    const distritos = ['Pinheiros', 'Moema', 'Santana', 'Lapa'];
    const q = buildQueries({ mode: 'cidade', uf: 'SP', city: 'São Paulo', query: 'restaurantes' }, { distritos });
    expect(q[0]).toEqual({ q: 'restaurantes', city: 'São Paulo, SP', results: 60 });
    expect(q).toHaveLength(1 + distritos.length);
    expect(q[1].q).toBe('restaurantes Pinheiros');
  });

  test('cidade: falls back to zone sweep when IBGE has <3 districts', () => {
    const q = buildQueries({ mode: 'cidade', uf: 'RJ', city: 'Niterói', query: 'restaurantes' }, { distritos: ['Centro'] });
    expect(q).toHaveLength(1 + ZONAS_FALLBACK.length);
    expect(q[1].q).toBe(`restaurantes ${ZONAS_FALLBACK[0]}`);
  });

  test('estado: one breadth query (20 results) per municipality', () => {
    const municipios = [{ nome: 'Campinas' }, { nome: 'Santos' }, { nome: 'Sorocaba' }];
    const q = buildQueries({ mode: 'estado', uf: 'sp', query: 'restaurantes' }, { municipios });
    expect(q).toHaveLength(3);
    expect(q[0]).toEqual({ q: 'restaurantes', city: 'Campinas, SP', results: 20 });
  });

  test('max-queries cap bounds the sweep (cost control)', () => {
    const municipios = Array.from({ length: 645 }, (_, i) => ({ nome: `Cidade ${i}` }));
    const q = buildQueries({ mode: 'estado', uf: 'SP' }, { municipios }, 300);
    expect(q).toHaveLength(300);
  });

  test('defaults: query falls back to "restaurantes"', () => {
    const q = buildQueries({ mode: 'bairro', uf: 'SP', city: 'São Paulo', bairro: '' });
    expect(q[0].q).toBe('restaurantes');
  });
});

// ============================================================ sendable filter
describe('sendable contract — mobile phone = WhatsApp-capable', () => {
  const base = {
    id: 'pl1',
    displayName: { text: 'Cantina' },
    formattedAddress: 'Rua X',
    location: { latitude: -23.5, longitude: -46.6 },
  };

  test('BR mobile (11 digits with 9) → whatsapp_status pending (sendable)', () => {
    const lead = normalizePlace({ ...base, internationalPhoneNumber: '+55 11 98765-4321' }, { city: 'SP' });
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.whatsapp_phone).toBe('+5511987654321');
  });

  test('landline → candidate too (deliberate change: BR fixed lines run WhatsApp Business)', () => {
    const lead = normalizePlace({ ...base, internationalPhoneNumber: '+55 11 3064-1234' }, { city: 'SP' });
    expect(lead.whatsapp_status).toBe('pending');
    expect(lead.whatsapp_phone).toBe('+551130641234');
  });

  test('no phone at all → missing', () => {
    const lead = normalizePlace(base, { city: 'SP' });
    expect(lead.whatsapp_status).toBe('missing');
  });
});
