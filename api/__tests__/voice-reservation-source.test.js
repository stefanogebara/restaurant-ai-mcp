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

jest.mock('../_services/reservationWhatsAppDelivery', () => ({
  beginConfirmation: jest.fn(async () => null), finishConfirmation: jest.fn(async () => {}),
}));

const { createReservation } = require('../_lib/tool-handlers');
const { buildVoiceConfirmation } = require('../_lib/reservation-validator');

beforeEach(() => {
  require('../_services/reservationWhatsAppDelivery').beginConfirmation.mockResolvedValue({id:'tracking',sender_id:'sender',recipient_phone:'5511'});
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


test.each([
  ['en', 'en'],
  ['es', 'es'],
  ['it', 'it'],
  ['pt-BR', 'pt_BR'],
  ['pt', 'pt_BR'],
])('voice WhatsApp confirmation uses the restaurant language %s', async (agentLanguage, expectedMetaLanguage) => {
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', timezone: 'America/Sao_Paulo', agent_language: agentLanguage },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1);
  expect(mockSendTemplateMessage).toHaveBeenCalledWith(
    '+551150283918', 'reservation_confirmed', expectedMetaLanguage, expect.any(Array), expect.any(Object),
  );
  const dateParameter = mockSendTemplateMessage.mock.calls[0][3][1];
  const expectedDate = new Intl.DateTimeFormat(agentLanguage, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-11-09T12:00:00Z'));
  expect(dateParameter).toBe(expectedDate);
});

test('voice confirmation retries only another variant of the same language after Meta says translation is missing', async () => {
  mockSendTemplateMessage
    .mockResolvedValueOnce({ success: false, errorCode: 132001, error: 'Translation missing' })
    .mockResolvedValueOnce({ success: true, messageId: 'wamid-es' });

  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', agent_language: 'es' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['es', 'es_ES']);
});

test('voice confirmation never retries after a Meta rejection other than missing translation', async () => {
  mockSendTemplateMessage.mockResolvedValueOnce({ success: false, errorCode: 131026, error: 'Recipient unavailable' });

  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', agent_language: 'en' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(result.message).toMatch(/could not confirm.*WhatsApp/i);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['en']);
});


test('missing Spanish translations leave the booking confirmed without switching to Portuguese', async () => {
  mockSendTemplateMessage.mockResolvedValue({ success: false, errorCode: 132001 });
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', agent_language: 'es' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(result.message).toMatch(/no pude confirmar.*WhatsApp/i);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['es', 'es_ES']);
});

test('ambiguous Meta send outcome is never retried', async () => {
  mockSendTemplateMessage.mockResolvedValueOnce({ success: false, ambiguo: true, errorCode: 132001 });
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', agent_language: 'en' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['en']);
});


test('voice confirmation prioritizes agent language over stale ai_config language', async () => {
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Seatable CI Sandbox', language: 'en-US', agent_language: 'pt' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Test Seatable', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['pt_BR']);
  expect(result.message).toMatch(/reserva.*confirmada/i);
  expect(result.message).toMatch(/9 de novembro de 2026/);
});


test('Italian voice booking keeps both WhatsApp template and spoken confirmation in Italian', async () => {
  const result = await createReservation(
    'sandbox-restaurant',
    { restaurant_name: 'Trattoria', language: 'en-US', agent_language: 'it' },
    { date: '2026-11-09', time: '19:00', party_size: 2, customer_name: 'Mario Rossi', customer_phone: '+551150283918' },
  );

  expect(result.success).toBe(true);
  expect(mockSendTemplateMessage.mock.calls.map(call => call[2])).toEqual(['it']);
  expect(result.message).toMatch(/prenotazione.*confermata/i);
  expect(result.message).toMatch(/9 novembre 2026/);
});

 test('links the provider request to the created reservation UUID', async () => {
  const {beginConfirmation, finishConfirmation} = require('../_services/reservationWhatsAppDelivery');
  beginConfirmation.mockResolvedValueOnce({id:'tracking',sender_id:'sender',recipient_phone:'5511'});
  mockDbCreateReservation.mockResolvedValueOnce({success:true,data:{id:'db-reservation-uuid'}});
  await createReservation('sandbox-restaurant',{restaurant_name:'Sandbox',agent_language:'pt'}, {date:'2026-11-09',time:'19:00',party_size:2,customer_name:'Test',customer_phone:'+5511'});
  expect(beginConfirmation).toHaveBeenLastCalledWith(expect.objectContaining({restaurantId:'sandbox-restaurant',reservationRecordId:'db-reservation-uuid'}));
  expect(mockSendTemplateMessage.mock.calls[0][4]).toEqual({callbackData:'reservation:tracking'});
  expect(finishConfirmation).toHaveBeenLastCalledWith(expect.objectContaining({id:'tracking'}),expect.objectContaining({success:true,messageId:'wamid-test'}));
});

 test('a tracking failure skips sending while keeping the reservation confirmed', async () => {
  require('../_services/reservationWhatsAppDelivery').beginConfirmation.mockResolvedValueOnce(null);
  const result = await createReservation('sandbox-restaurant',{restaurant_name:'Sandbox',agent_language:'pt'}, {date:'2026-11-09',time:'19:00',party_size:2,customer_name:'Test',customer_phone:'+5511'});
  expect(result.success).toBe(true); expect(mockSendTemplateMessage).not.toHaveBeenCalled();
  expect(result.message).toMatch(/n[aã]o.*confirmar.*WhatsApp/i);
});
