const mockDbCreateReservation = jest.fn(async () => ({ success: true }));
const mockSendTemplateMessage = jest.fn(async () => ({ success: true }));

jest.mock('../_lib/supabase', () => ({
  getReservations: jest.fn(async () => ({ success: true, data: { records: [] } })),
  canAccommodateParty: jest.fn(async () => ({ can_accommodate: true, table_ids: ['table-1'] })),
  createReservation: (...args) => mockDbCreateReservation(...args),
  generateReservationId: jest.fn(() => 'RES-VOICE-SOURCE'),
}));
jest.mock('../_lib/reservation-validator', () => ({
  ...jest.requireActual('../_lib/reservation-validator'),
  validateReservation: jest.fn(() => ({ valid: true })),
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendTemplateMessage: (...args) => mockSendTemplateMessage(...args),
}));

const { createReservation } = require('../_lib/tool-handlers');
const { buildVoiceConfirmation } = require('../_lib/reservation-validator');

beforeEach(() => {
  mockDbCreateReservation.mockClear();
  mockSendTemplateMessage.mockReset();
  mockSendTemplateMessage.mockResolvedValue({ success: true, messageId: 'wamid-test' });
});

test('a voice-created reservation retains voice_ai as its source', async () => {
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', timezone: 'America/Sao_Paulo' },
    {
      date: '2026-11-09', time: '19:00', party_size: 2,
      customer_name: 'Test Seatable', customer_phone: '+551150283918',
    },
  );

  expect(result.success).toBe(true);
  expect(mockDbCreateReservation).toHaveBeenCalledWith(
    'sandbox-restaurant',
    expect.objectContaining({ source: 'voice_ai', status: 'confirmed' }),
  );
});

test('a rejected WhatsApp confirmation does not become a delivery promise', async () => {
  mockSendTemplateMessage.mockResolvedValueOnce({ success: false, error: 'Template not approved' });
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', timezone: 'America/Sao_Paulo', agent_language: 'pt-BR' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(result.message).toMatch(/reserva.*confirmada/i);
  expect(result.message).toMatch(/n[aã]o.*confirmar.*WhatsApp/i);
  expect(result.message).not.toMatch(/receber[aá].*WhatsApp/i);
});

test('an accepted WhatsApp request is described without guaranteeing delivery', async () => {
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', timezone: 'America/Sao_Paulo', agent_language: 'pt-BR' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(result.message).toMatch(/solicitamos.*WhatsApp/i);
  expect(result.message).not.toMatch(/receber[aá].*WhatsApp/i);
});

test('voice confirmation speaks the date and time in the restaurant language', () => {
  const params = { customer_name: 'Test Seatable', party_size: 2, date: '2026-11-09', time: '19:00' };
  const pt = buildVoiceConfirmation(params, { restaurant_name: 'Sandbox', agent_language: 'pt-BR' }, 'RES-1', { whatsappAccepted: false });
  const es = buildVoiceConfirmation(params, { restaurant_name: 'Sandbox', agent_language: 'es' }, 'RES-1', { whatsappAccepted: false });
  const en = buildVoiceConfirmation(params, { restaurant_name: 'Sandbox', agent_language: 'en' }, 'RES-1', { whatsappAccepted: false });

  expect(pt).toMatch(/9 de novembro de 2026.*19:00/);
  expect(es).toMatch(/9 de noviembre de 2026.*19:00/);
  expect(en).toMatch(/November 9, 2026.*7:00 PM/);
});
