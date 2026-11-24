var mockCampaignResult = { data: null, error: null };
var mockRecipientsResult = { data: [], error: null };
var mockCampaignQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(() => Promise.resolve(mockCampaignResult)),
  maybeSingle: jest.fn(() => Promise.resolve(mockCampaignResult)),
};
var mockRecipientsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  then: (resolve) => resolve(mockRecipientsResult),
};
var mockSupabaseAdmin = {
  schema: jest.fn().mockReturnThis(),
  from: jest.fn((table) => table === 'retention_campaigns' ? mockCampaignQuery : mockRecipientsQuery),
};
var mockSendWhatsAppMessage = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...args) => mockSendWhatsAppMessage(...args),
  sendTemplateMessage: jest.fn(),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { getCampaignStats, sendCampaignBatch } = require('../_services/campaignService');

beforeEach(() => {
  jest.clearAllMocks();
  mockCampaignResult = { data: null, error: null };
  mockRecipientsResult = { data: [], error: null };
});

test('does not read recipients when the campaign is not owned', async () => {
  expect(await getCampaignStats('foreign', 'own-restaurant')).toBeNull();
  expect(mockCampaignQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('campaign_recipients');
});

test('owned campaign stats scope the recipient query too', async () => {
  mockCampaignResult = { data: { id: 'owned' }, error: null };
  mockRecipientsResult = { data: [{ status: 'sent' }], error: null };

  expect(await getCampaignStats('owned', 'own-restaurant')).toEqual(expect.objectContaining({ total: 1, sent: 1 }));
  expect(mockRecipientsQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
});

test('send batch never reaches recipients or WhatsApp for a foreign campaign', async () => {
  expect(await sendCampaignBatch('foreign', 10, 'own-restaurant')).toBe(0);
  expect(mockCampaignQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('campaign_recipients');
  expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
});
