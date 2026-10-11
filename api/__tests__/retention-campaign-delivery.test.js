const mockSendCampaignBatch = jest.fn();
const mockCreateCampaign = jest.fn();
const mockSendRetentionCampaignEmail = jest.fn();
const mockGetCampaignStats = jest.fn();
const mockFrom = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (...args) => mockFrom(...args) }),
    from: (...args) => mockFrom(...args),
  },
}));
jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'restaurant-a' } }),
}));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn(async (_req, _res, next) => next()),
  requireFeature: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/email', () => ({
  sendRetentionCampaignEmail: (...args) => mockSendRetentionCampaignEmail(...args),
}));
jest.mock('../_services/campaignService', () => ({
  createCampaign: (...args) => mockCreateCampaign(...args),
  sendCampaignBatch: (...args) => mockSendCampaignBatch(...args),
  getCampaignStats: (...args) => mockGetCampaignStats(...args),
  getSegmentCustomers: jest.fn(),
}));

const handler = require('../retention-campaigns');
const originalCronSecret = process.env.CRON_SECRET;

let customerResult;
let campaignResult;
let activationResult;
let statusUpdateError;
let optOutResult;
const dbCalls = [];

function makeQuery(table) {
  const query = {
    table,
    operation: 'select',
    filters: [],
    select: jest.fn(function select() { return this; }),
    eq: jest.fn(function eq(field, value) { this.filters.push([field, value]); return this; }),
    insert: jest.fn(function insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }),
    update: jest.fn(function update(payload) { this.operation = 'update'; this.payload = payload; return this; }),
    single: jest.fn(async function single() { return campaignResult; }),
    maybeSingle: jest.fn(async function maybeSingle() {
      if (this.table === 'customer_ltv') return customerResult;
      if (this.table === 'customer_consent') return optOutResult;
      return this.operation === 'update' ? activationResult : campaignResult;
    }),
    then(resolve, reject) {
      return Promise.resolve({ error: statusUpdateError }).then(resolve, reject);
    },
  };
  dbCalls.push(query);
  return query;
}

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function call(action, body) {
  const res = response();
  await handler({ method: 'POST', query: { action }, body, headers: {} }, res);
  return res;
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-retention-secret';
  jest.clearAllMocks();
  dbCalls.length = 0;
  customerResult = { data: { customer_name: 'Ana', customer_email: 'ana@example.com', customer_phone: '+15551234567' }, error: null };
  optOutResult = { data: null, error: null };
  campaignResult = { data: { id: 'campaign-a', channel: 'whatsapp', status: 'pending' }, error: null };
  activationResult = { data: { id: 'campaign-a' }, error: null };
  statusUpdateError = null;
  mockFrom.mockImplementation(makeQuery);
  mockCreateCampaign.mockResolvedValue({ success: true, data: { id: 'campaign-a' } });
  mockSendCampaignBatch.mockResolvedValue(1);
  mockGetCampaignStats.mockResolvedValue({ total: 1, sent: 0 });
  mockSendRetentionCampaignEmail.mockResolvedValue({ sent: true });
});

afterAll(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe('bulk campaign channel boundary', () => {
  test('rejects email bulk creation before storing any campaign', async () => {
    const res = await call('create_whatsapp', { segment: 'all', channel: 'email' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockCreateCampaign).not.toHaveBeenCalled();
  });

  test('defaults the WhatsApp endpoint to WhatsApp, never email', async () => {
    const res = await call('create_whatsapp', { segment: 'all', message: 'Hello' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCreateCampaign).toHaveBeenCalledWith('restaurant-a', expect.objectContaining({ channel: 'whatsapp' }));
  });

  test('refuses to manually send a historical email bulk campaign', async () => {
    campaignResult.data = { id: 'campaign-a', channel: 'email', status: 'pending' };
    const res = await call('send', { campaign_id: 'campaign-a' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockSendCampaignBatch).not.toHaveBeenCalled();
    expect(dbCalls.some(q => q.operation === 'update')).toBe(false);
  });

  test('does not send another restaurant’s campaign', async () => {
    campaignResult = { data: null, error: null };
    const res = await call('send', { campaign_id: 'campaign-other' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSendCampaignBatch).not.toHaveBeenCalled();
    expect(dbCalls[0].filters).toContainEqual(['restaurant_id', 'restaurant-a']);
  });

  test('does not reveal another restaurant’s campaign delivery statistics', async () => {
    campaignResult = { data: null, error: null };
    const res = await call('campaign_stats', {});
    // Missing campaign id is rejected independently of tenancy.
    expect(res.status).toHaveBeenCalledWith(400);

    const scoped = response();
    await handler({ method: 'GET', query: { action: 'campaign_stats', campaign_id: 'campaign-other' }, body: {}, headers: {} }, scoped);
    expect(scoped.status).toHaveBeenCalledWith(404);
    expect(mockGetCampaignStats).not.toHaveBeenCalled();
  });

  test('claims a pending WhatsApp campaign in this restaurant before sending', async () => {
    const res = await call('send', { campaign_id: 'campaign-a' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSendCampaignBatch).toHaveBeenCalledWith('campaign-a', 10);
    expect(dbCalls[1].filters).toEqual(expect.arrayContaining([
      ['restaurant_id', 'restaurant-a'], ['channel', 'whatsapp'], ['status', 'pending'],
    ]));
  });

  test('does not restart a campaign already sending', async () => {
    campaignResult.data.status = 'sending';
    const res = await call('send', { campaign_id: 'campaign-a' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSendCampaignBatch).not.toHaveBeenCalled();
  });
});

describe('individual email delivery contract', () => {
  const body = { customer_id: 'guest-a', campaign_type: 'win_back', message: 'Olá, Ana', channel: 'email' };

  test('checks tenant ownership before creating a row or sending', async () => {
    customerResult = { data: null, error: null };
    const res = await call('create', body);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(dbCalls[0].filters).toEqual(expect.arrayContaining([
      ['customer_id', 'guest-a'], ['restaurant_id', 'restaurant-a'],
    ]));
    expect(dbCalls.some(q => q.operation === 'insert')).toBe(false);
    expect(mockSendRetentionCampaignEmail).not.toHaveBeenCalled();
  });

  test('rejects guests without an email before creating a row', async () => {
    customerResult.data.customer_email = null;
    const res = await call('create', body);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(dbCalls.some(q => q.operation === 'insert')).toBe(false);
  });

  test('honors marketing opt-out before creating a row or sending email', async () => {
    optOutResult = { data: { customer_phone: '+15551234567' }, error: null };
    const res = await call('create', body);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(dbCalls.some(q => q.operation === 'insert')).toBe(false);
    expect(mockSendRetentionCampaignEmail).not.toHaveBeenCalled();
  });

  test('does not report success when the email provider fails', async () => {
    mockSendRetentionCampaignEmail.mockResolvedValue({ sent: false, reason: 'provider_error' });
    const res = await call('create', body);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    const statusWrite = dbCalls.find(q => q.operation === 'update');
    expect(statusWrite.payload.status).toBe('failed');
  });

  test('reports sent only after the email provider accepts it', async () => {
    campaignResult.data = { id: 'campaign-a', status: 'pending', channel: 'email' };
    const res = await call('create', body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ status: 'sent' }),
    }));
    expect(mockSendRetentionCampaignEmail).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: 'ana@example.com',
      language: 'pt-BR',
      unsubscribeUrl: expect.stringMatching(/\/api\/campaign-unsubscribe\?rid=restaurant-a&phone=%2B15551234567&sig=[a-f0-9]{64}$/),
    }));
  });
});
