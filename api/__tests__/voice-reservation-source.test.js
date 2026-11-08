const mockDbCreateReservation = jest.fn(async () => ({ success: true }));
const mockSendTemplateMessage = jest.fn(async () => ({ success: true }));

jest.mock('../_lib/supabase', () => ({
  getReservations: jest.fn(async () => ({ success: true, data: { records: [] } })),
  canAccommodateParty: jest.fn(async () => ({ can_accommodate: true, table_ids: ['table-1'] })),
  createReservation: (...args) => mockDbCreateReservation(...args),
  generateReservationId: jest.fn(() => 'RES-VOICE-SOURCE'),
}));
jest.mock('../_lib/reservation-validator', () => ({
  validateReservation: jest.fn(() => ({ valid: true })),
  buildVoiceConfirmation: jest.fn(() => 'Confirmed'),
  formatDate: jest.fn(() => '09/11/2026'),
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendTemplateMessage: (...args) => mockSendTemplateMessage(...args),
}));

const { createReservation } = require('../_lib/tool-handlers');

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
