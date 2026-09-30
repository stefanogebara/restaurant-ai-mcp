const mockFrom = jest.fn();
const mockSendWhatsAppMessage = jest.fn();
const mockSendTemplateMessage = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: () => ({ from: (...args) => mockFrom(...args) }), from: (...args) => mockFrom(...args) },
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...args) => mockSendWhatsAppMessage(...args),
  sendTemplateMessage: (...args) => mockSendTemplateMessage(...args),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { createCampaign, sendCampaignBatch } = require('../_services/campaignService');

beforeEach(() => jest.clearAllMocks());

test('bulk campaign service rejects email before querying recipients or writing rows', async () => {
  const result = await createCampaign('restaurant-a', {
    name: 'Email attempt', segment: 'all', message: 'Hello', channel: 'email',
  });
  expect(result).toEqual({ success: false, error: 'Bulk email campaigns are not supported' });
  expect(mockFrom).not.toHaveBeenCalled();
});

test('historical email campaign cannot enter either WhatsApp send path', async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: 'old-email', channel: 'email', status: 'active', message: 'A message' },
      error: null,
    }),
  };
  mockFrom.mockReturnValue(query);

  expect(await sendCampaignBatch('old-email')).toBe(0);
  expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  expect(mockSendTemplateMessage).not.toHaveBeenCalled();
  expect(mockFrom).toHaveBeenCalledTimes(1);
});

function creationQuery(table, outcomes, calls) {
  const query = {
    table,
    operation: 'select',
    select() { return this; },
    eq() { return this; },
    not() { return this; },
    in() { return this; },
    limit() { return this; },
    insert() { this.operation = 'insert'; calls.push([table, 'insert']); return this; },
    update() { this.operation = 'update'; calls.push([table, 'update']); return this; },
    single: async () => ({ data: { id: 'campaign-a' }, error: null }),
    then(resolve, reject) {
      const key = `${table}:${this.operation}`;
      return Promise.resolve(outcomes[key] || { data: [], error: null }).then(resolve, reject);
    },
  };
  return query;
}

test('consent lookup failure fails closed before campaign creation', async () => {
  const calls = [];
  const outcomes = {
    'customer_ltv:select': { data: [{ customer_phone: '+15551234567', customer_name: 'Ana' }], error: null },
    'customer_consent:select': { data: null, error: { message: 'database unavailable' } },
  };
  mockFrom.mockImplementation(table => creationQuery(table, outcomes, calls));

  const result = await createCampaign('restaurant-a', { segment: 'all', message: 'Hello', channel: 'whatsapp' });
  expect(result).toEqual({ success: false, error: 'Could not verify marketing consent' });
  expect(calls).not.toContainEqual(['retention_campaigns', 'insert']);
});

test('recipient write failure fails campaign rather than reporting it ready', async () => {
  const calls = [];
  const outcomes = {
    'customer_ltv:select': { data: [{ customer_phone: '+15551234567', customer_name: 'Ana' }], error: null },
    'campaign_recipients:insert': { data: null, error: { message: 'recipient write failed' } },
  };
  mockFrom.mockImplementation(table => creationQuery(table, outcomes, calls));

  const result = await createCampaign('restaurant-a', { segment: 'all', message: 'Hello', channel: 'whatsapp' });
  expect(result).toEqual({ success: false, error: 'Could not create campaign recipients' });
  expect(calls).toContainEqual(['retention_campaigns', 'update']);
});
