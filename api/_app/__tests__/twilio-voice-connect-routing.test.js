const mockValidateRequest = jest.fn();
const mockFrom = jest.fn();
const mockIssueGrant = jest.fn();
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('twilio', () => ({ validateRequest: (...args) => mockValidateRequest(...args) }));
jest.mock('../_lib/voice-stream-auth', () => ({ issueVoiceStreamGrant: (...args) => mockIssueGrant(...args) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: () => ({ from: (...args) => mockFrom(...args) }) },
}));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

const handler = require('../twilio-voice-connect');
const NUMBER = '+34910001122';
let rows;
let lookupError;
let businessLookupError;

function restaurant(id, { businessPhone = null, aiPhone = null, provisioned = true } = {}) {
  return {
    id,
    restaurant_name: id,
    phone: businessPhone,
    is_active: true,
    onboarding_completed: true,
    voice_engine: 'openai_realtime',
    voice_engine_status: 'active',
    voice_ws_endpoint: 'wss://example.test/ws',
    elevenlabs_agent_id: null,
    ai_config: aiPhone ? { phone: {
      number: aiPhone,
      status: provisioned ? 'active' : 'pending',
      number_id: provisioned ? `provisioned-${id}` : null,
    } } : {},
  };
}

function query(table) {
  const conditions = [];
  let maxRows = Infinity;
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((field, value) => { conditions.push([field, 'eq', value]); return builder; }),
    filter: jest.fn((field, operator, value) => { conditions.push([field, operator, value]); return builder; }),
    in: jest.fn((field, values) => { conditions.push([field, 'in', values]); return builder; }),
    not: jest.fn((field, operator, value) => { conditions.push([field, `not.${operator}`, value]); return builder; }),
    neq: jest.fn((field, value) => { conditions.push([field, 'neq', value]); return builder; }),
    limit: jest.fn((value) => { maxRows = value; return builder; }),
    then(resolve, reject) {
      if (table === 'voice_ab_tests') return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      const fieldValue = (row, field) => {
        if (field.startsWith('ai_config->phone->>')) return row.ai_config?.phone?.[field.split('->>').pop()] ?? null;
        return row[field];
      };
      const matching = rows.filter(row => conditions.every(([field, op, value]) => {
        const actual = fieldValue(row, field);
        if (op === 'eq') return actual === value;
        if (op === 'like') return typeof actual === 'string' && actual.startsWith(value.slice(0, -1));
        if (op === 'in') return value.includes(actual);
        if (op === 'not.is') return actual !== value;
        if (op === 'neq') return actual !== null && actual !== value;
        throw new Error(`Unexpected query operator: ${op}`);
      }));
      const error = lookupError || (businessLookupError && conditions.some(([field]) => field === 'phone') ? businessLookupError : null);
      return Promise.resolve({
        data: error ? null : matching.slice(0, maxRows),
        error,
      }).then(resolve, reject);
    },
    maybeSingle() {
      return builder.then(result => ({
        data: result.data?.[0] || null,
        error: result.error,
      }));
    },
  };
  return builder;
}

function response() {
  return {
    code: null,
    body: null,
    setHeader: jest.fn(),
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function call(signature = 'valid-signature', to = NUMBER) {
  const req = {
    method: 'POST',
    headers: { host: 'seatable.one', 'x-twilio-signature': signature },
    url: '/api/twilio-voice-connect',
    body: { To: to, From: '+34919998877', CallSid: 'CA-test', AccountSid: 'AC-test' },
    query: {},
  };
  const res = response();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_AUTH_TOKEN = 'test-token';
  rows = [];
  lookupError = null;
  businessLookupError = null;
  mockValidateRequest.mockImplementation((_token, signature) => signature === 'valid-signature');
  mockIssueGrant.mockResolvedValue('synthetic-stream-grant');
  mockFrom.mockImplementation(table => query(table));
});

afterAll(() => { delete process.env.TWILIO_AUTH_TOKEN; });

test('prefers the unique provisioned AI number over a business phone match', async () => {
  rows = [
    restaurant('business', { businessPhone: NUMBER }),
    restaurant('ai-owner', { aiPhone: NUMBER }),
  ];
  const res = await call();
  expect(res.code).toBe(200);
  expect(res.body).toContain('name="restaurant_id" value="ai-owner"');
  expect(res.body).toContain('name="stream_grant" value="synthetic-stream-grant"');
  expect(mockIssueGrant).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: 'ai-owner', wsUrl: 'wss://example.test/ws' }));
  expect(res.body).not.toContain('value="business"');
});

test('rejects duplicate provisioned AI numbers even when a business phone is unique', async () => {
  rows = [
    restaurant('business', { businessPhone: NUMBER }),
    restaurant('ai-a', { aiPhone: NUMBER }),
    restaurant('ai-b', { aiPhone: NUMBER }),
  ];
  const res = await call();
  expect(res.code).toBe(200);
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('rejects whitespace-suffixed duplicate AI numbers before business phone fallback', async () => {
  rows = [
    restaurant('business', { businessPhone: NUMBER }),
    restaurant('ai-a', { aiPhone: `${NUMBER}\n` }),
    restaurant('ai-b', { aiPhone: `${NUMBER}\n` }),
  ];
  const res = await call();
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
  expect(res.body).not.toContain('value="business"');
});

test('rejects a malformed called number before building a LIKE lookup', async () => {
  rows = [restaurant('business', { businessPhone: NUMBER })];
  const res = await call('valid-signature', `${NUMBER}%`);
  expect(res.body).toContain('<Hangup />');
  expect(mockFrom).not.toHaveBeenCalled();
});

test('rejects duplicate business phones without an AI number match', async () => {
  rows = [
    restaurant('business-a', { businessPhone: NUMBER }),
    restaurant('business-b', { businessPhone: NUMBER }),
  ];
  const res = await call();
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('rejects business phone matches split across stored phone formats', async () => {
  rows = [
    restaurant('normalized', { businessPhone: NUMBER }),
    restaurant('formatted', { businessPhone: '+34 (910) 001-122' }),
  ];
  const res = await call('valid-signature', '+34 (910) 001-122');
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('preserves unique legacy business phone routing across stored phone formats', async () => {
  rows = [restaurant('legacy', { businessPhone: '+34 (910) 001-122' })];
  const res = await call('valid-signature', '+34 (910) 001-122');
  expect(res.body).toContain('name="restaurant_id" value="legacy"');
});

test('ignores an AI number that has not been provisioned', async () => {
  rows = [restaurant('pending', { aiPhone: NUMBER, provisioned: false })];
  const res = await call();
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('routes the sole provisioned AI number when a pending row shares its number', async () => {
  rows = [
    restaurant('pending', { aiPhone: NUMBER, provisioned: false }),
    restaurant('provisioned', { aiPhone: NUMBER }),
  ];
  const res = await call();
  expect(res.body).toContain('name="restaurant_id" value="provisioned"');
});

test('fails closed when the AI number lookup errors, even if a business phone is unique', async () => {
  rows = [restaurant('business', { businessPhone: NUMBER })];
  lookupError = { message: 'database unavailable' };
  const res = await call();
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('fails closed when the legacy business phone lookup errors', async () => {
  rows = [restaurant('business', { businessPhone: NUMBER })];
  businessLookupError = { message: 'database unavailable' };
  const res = await call();
  expect(res.body).toContain('<Hangup />');
  expect(res.body).not.toContain('<Stream');
});

test('rejects an invalid signature before any database lookup', async () => {
  rows = [restaurant('business', { businessPhone: NUMBER })];
  const res = await call('invalid-signature');
  expect(res.code).toBe(403);
  expect(res.body).toContain('<Hangup />');
  expect(mockFrom).not.toHaveBeenCalled();
});

test.each(['legacy-ai','business-only'])('a platform shared number never becomes a dedicated %s route', async mode => {
  const previous=process.env.ELEVENLABS_SHARED_PHONE;process.env.ELEVENLABS_SHARED_PHONE=NUMBER;
  try {
    rows=[restaurant('wrong-owner',mode==='legacy-ai'?{aiPhone:NUMBER}:{businessPhone:NUMBER})];
    const res=await call();expect(res.body).toContain('<Hangup />');expect(res.body).not.toContain('<Stream');
    expect(mockFrom).not.toHaveBeenCalled();expect(mockIssueGrant).not.toHaveBeenCalled();
  } finally {if(previous===undefined)delete process.env.ELEVENLABS_SHARED_PHONE;else process.env.ELEVENLABS_SHARED_PHONE=previous;}
});
